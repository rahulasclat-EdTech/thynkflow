// backend/src/routes/dashboard.js  — COMPLETE REPLACEMENT
// Fixes: correct field names, agent-scoped queries, notifications, critical alerts
const express = require('express')
const db = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router = express.Router()

// ── Helper: scope WHERE clause by role ────────────────────
function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── GET /api/dashboard  (main stats) ─────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    const { rows: [totals] } = await db.query(`
      SELECT
        COUNT(*)                                                      AS total_leads,
        COUNT(CASE WHEN status='new'            THEN 1 END)          AS new_leads,
        COUNT(CASE WHEN status='hot'            THEN 1 END)          AS hot_leads,
        COUNT(CASE WHEN status='warm'           THEN 1 END)          AS warm_leads,
        COUNT(CASE WHEN status='cold'           THEN 1 END)          AS cold_leads,
        COUNT(CASE WHEN status='converted'      THEN 1 END)          AS converted,
        COUNT(CASE WHEN status='not_interested' THEN 1 END)          AS not_interested,
        COUNT(CASE WHEN status='call_back'      THEN 1 END)          AS call_back,
        COUNT(CASE WHEN status NOT IN ('converted','not_interested')
              AND updated_at < NOW() - INTERVAL '5 days'  THEN 1 END) AS unattended,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE  THEN 1 END) AS today_new
      FROM leads l WHERE 1=1 ${scope}
    `)

    const { rows: [calls] } = await db.query(`
      SELECT
        COUNT(CASE WHEN DATE(cl.created_at) = CURRENT_DATE   THEN 1 END) AS today_calls,
        COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '7d' THEN 1 END) AS week_calls,
        COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '30d'THEN 1 END) AS month_calls
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      WHERE cl.type = 'call' ${scope}
    `)

    const { rows: [followups] } = await db.query(`
      SELECT
        COUNT(CASE WHEN f.follow_up_date >= CURRENT_DATE
              AND (f.status IS NULL OR f.status='pending') THEN 1 END) AS upcoming,
        COUNT(CASE WHEN f.follow_up_date < CURRENT_DATE
              AND (f.status IS NULL OR f.status='pending') THEN 1 END) AS missed
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      WHERE 1=1 ${scope}
    `)

    res.json({
      success: true,
      data: {
        totals: {
          ...totals,
          ...calls,
          upcoming_followups: followups.upcoming,
          missed_followups:   followups.missed
        }
      }
    })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/dashboard/stats  (alias for ReportsPage) ────
router.get('/stats', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [totals] } = await db.query(`
      SELECT
        COUNT(*)                                                      AS total_leads,
        COUNT(CASE WHEN status='hot'            THEN 1 END)          AS hot_leads,
        COUNT(CASE WHEN status='converted'      THEN 1 END)          AS converted_leads,
        COUNT(CASE WHEN status NOT IN ('converted','not_interested')
              AND updated_at < NOW()-INTERVAL '5 days'  THEN 1 END)  AS unattended,
        COUNT(CASE WHEN status='new'            THEN 1 END)          AS new_leads,
        COUNT(CASE WHEN status='warm'           THEN 1 END)          AS warm_leads,
        COUNT(CASE WHEN status='cold'           THEN 1 END)          AS cold_leads,
        COUNT(CASE WHEN status='call_back'      THEN 1 END)          AS call_back_leads,
        COUNT(CASE WHEN status='not_interested' THEN 1 END)          AS not_interested_leads
      FROM leads l WHERE 1=1 ${scope}
    `)
    res.json({ success: true, data: { totals } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/dashboard/critical  (alerts) ─────────────────
router.get('/critical', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    const { rows: unattended } = await db.query(`
      SELECT l.id, COALESCE(l.contact_name, l.school_name) AS name,
        l.phone, l.status, l.updated_at, u.name AS agent_name,
        EXTRACT(DAY FROM NOW() - l.updated_at)::int AS days_idle
      FROM leads l LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.status NOT IN ('converted','not_interested')
        AND l.updated_at < NOW() - INTERVAL '5 days' ${scope}
      ORDER BY l.updated_at ASC LIMIT 50
    `)

    const { rows: missedFollowups } = await db.query(`
      SELECT f.id, f.follow_up_date, f.notes,
        COALESCE(l.contact_name, l.school_name) AS lead_name,
        l.phone, l.status AS lead_status, l.id AS lead_id,
        u.name AS agent_name,
        EXTRACT(DAY FROM NOW() - f.follow_up_date)::int AS days_overdue
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE f.follow_up_date < CURRENT_DATE
        AND (f.status IS NULL OR f.status = 'pending') ${scope}
        AND f.follow_up_date < NOW() - INTERVAL '3 days'
      ORDER BY f.follow_up_date ASC LIMIT 50
    `)

    res.json({ success: true, data: { unattended, missed_followups: missedFollowups } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
