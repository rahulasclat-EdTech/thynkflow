// backend/src/routes/notifications.js — COMPLETE REWRITE
// Handles: GET my notifs, mark read, plus a helper function
// used internally by leads.js and chat.js to fire notifications
const express = require('express')
const db = require('../config/db')
const { auth } = require('../middleware/auth')
const router = express.Router()

// ── Auto-create table on startup ─────────────────────────
db.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    message    TEXT,
    lead_id    UUID REFERENCES leads(id) ON DELETE SET NULL,
    is_read    BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
`).catch(() => {})

// ── Helper: create a notification (used internally) ──────
async function createNotif(user_id, type, title, message, lead_id = null) {
  if (!user_id) return
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, lead_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, type, title, message || null, lead_id || null]
    )
  } catch {}
}
module.exports.createNotif = createNotif

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

// ── Mark all read ─────────────────────────────────────────
router.patch('/read-all', auth, async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Mark one read ─────────────────────────────────────────
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── CRON: check missed follow-ups (called on every dashboard load) ─
// GET /api/notifications/check-missed
// Fired automatically — inserts missed followup notifs for agents + admin alert if >10
router.get('/check-missed', auth, async (req, res) => {
  try {
    // Get latest follow-up per lead from call_logs
    const { rows: missed } = await db.query(`
      SELECT
        latest.lead_id,
        latest.next_followup_date,
        COALESCE(l.contact_name, l.school_name) AS lead_name,
        l.assigned_to,
        l.status
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
        FROM call_logs cl
        WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l ON l.id = latest.lead_id
      WHERE latest.next_followup_date < CURRENT_DATE
        AND l.status NOT IN ('converted','not_interested')
        AND l.assigned_to IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.lead_id = latest.lead_id
            AND n.type = 'missed_followup'
            AND DATE(n.created_at) = CURRENT_DATE
        )
      LIMIT 100
    `)

    let generated = 0
    for (const f of missed) {
      const dateStr = new Date(f.next_followup_date).toLocaleDateString('en-IN')
      await createNotif(
        f.assigned_to,
        'missed_followup',
        '⚠️ Missed Follow-up',
        `Follow-up for "${f.lead_name}" was due on ${dateStr}`,
        f.lead_id
      )
      generated++
    }

    // Alert admins if total missed > 10
    if (missed.length > 10) {
      const { rows: admins } = await db.query(
        `SELECT id FROM users WHERE role_name='admin' AND is_active=true`
      )
      const alreadyAlerted = await db.query(
        `SELECT 1 FROM notifications WHERE type='missed_followup_bulk' AND DATE(created_at)=CURRENT_DATE LIMIT 1`
      )
      if (!alreadyAlerted.rows.length) {
        for (const admin of admins) {
          await createNotif(
            admin.id,
            'missed_followup_bulk',
            '🚨 High Missed Follow-ups Alert',
            `${missed.length} follow-ups are overdue today. Immediate action required.`,
            null
          )
        }
      }
    }

    res.json({ success: true, generated })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
module.exports.createNotif = createNotif
