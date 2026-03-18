// backend/src/routes/notifications.js — NEW FILE
// ADD TO index.js:
//   const notifRoutes = require('./routes/notifications')
//   app.use('/api/notifications', notifRoutes)
//
// RUN SQL:
/*
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  message      TEXT,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  is_read      BOOLEAN DEFAULT false,
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at DESC);
*/

const express = require('express')
const db = require('../config/db')
const { auth } = require('../middleware/auth')
const router = express.Router()

// Auto-create table
db.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
`).catch(() => {})

// ── GET my notifications ──────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    )
    const unread = rows.filter(n => !n.is_read).length
    res.json({ success: true, data: rows, unread })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Mark as read ──────────────────────────────────────────
router.patch('/read-all', auth, async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.patch('/:id/read', auth, async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── TRIGGER: Lead assigned ────────────────────────────────
router.post('/trigger/lead-assigned', auth, async (req, res) => {
  try {
    const { lead_id, assigned_to, lead_name } = req.body
    if (!assigned_to) return res.json({ success: true })
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, lead_id)
       VALUES ($1, 'lead_assigned', 'New Lead Assigned', $2, $3)`,
      [assigned_to, `Lead "${lead_name || 'New Lead'}" has been assigned to you`, lead_id || null]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── TRIGGER: Follow-up scheduled ─────────────────────────
router.post('/trigger/followup-scheduled', auth, async (req, res) => {
  try {
    const { lead_id, assigned_to, lead_name, follow_up_date } = req.body
    if (!assigned_to) return res.json({ success: true })
    const dateStr = follow_up_date ? new Date(follow_up_date).toLocaleDateString('en-IN') : ''
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, lead_id)
       VALUES ($1, 'followup_scheduled', 'Follow-up Scheduled', $2, $3)`,
      [assigned_to, `Follow-up for "${lead_name}" scheduled on ${dateStr}`, lead_id || null]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── CRON-like: Generate missed follow-up notifications ────
// Call this via a scheduled job or call manually
router.post('/generate-missed', auth, async (req, res) => {
  try {
    // Find follow-ups that are missed and haven't been notified yet
    const { rows: missed } = await db.query(`
      SELECT f.id, f.follow_up_date, f.lead_id,
        COALESCE(l.contact_name, l.school_name) AS lead_name,
        l.assigned_to
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.follow_up_date < CURRENT_DATE
        AND (f.status IS NULL OR f.status = 'pending')
        AND l.assigned_to IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.lead_id = f.lead_id AND n.type = 'missed_followup'
            AND DATE(n.created_at) = CURRENT_DATE
        )
      LIMIT 100
    `)

    for (const f of missed) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, lead_id)
         VALUES ($1, 'missed_followup', '⚠️ Missed Follow-up', $2, $3)
         ON CONFLICT DO NOTHING`,
        [f.assigned_to, `Follow-up for "${f.lead_name}" was missed (due ${new Date(f.follow_up_date).toLocaleDateString('en-IN')})`, f.lead_id]
      )
    }
    res.json({ success: true, generated: missed.length })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
