// backend/src/routes/dashboard.js  — FIXED
// Changes vs previous version:
//   1. GET /  — calls query: try communication_logs, fallback to call_logs
//   2. GET /  — followups query: use call_logs.next_followup_date (no followups table)
//   3. GET /critical — missed_followups: use call_logs.next_followup_date (no followups table)
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

    // ── Call counts: try communication_logs first, fallback to call_logs ──
    let calls = { today_calls: 0, week_calls: 0, month_calls: 0 }
    try {
      const { rows: [c] } = await db.query(`
        SELECT
          COUNT(CASE WHEN DATE(cl.created_at) = CURRENT_DATE    THEN 1 END) AS today_calls,
          COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '7d'  THEN 1 END) AS week_calls,
          COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '30d' THEN 1 END) AS month_calls
        FROM communication_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE cl.type = 'call' ${scope}
      `)
      calls = c
    } catch {
      try {
        const { rows: [c] } = await db.query(`
          SELECT
            COUNT(CASE WHEN DATE(cl.called_at) = CURRENT_DATE    THEN 1 END) AS today_calls,
            COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '7d'  THEN 1 END) AS week_calls,
            COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '30d' THEN 1 END) AS month_calls
          FROM call_logs cl
          JOIN leads l ON l.id = cl.lead_id WHERE 1=1 ${scope}
        `)
        calls = c
      } catch { /* keep zeros */ }
    }

    // ── Follow-up counts: use call_logs.next_followup_date ──
    // (There is no separate followups table — dates live on call_logs)
    let followups = { upcoming: 0, missed: 0 }
    try {
      const { rows: [f] } = await db.query(`
        SELECT
          COUNT(CASE WHEN latest.next_followup_date >= CURRENT_DATE THEN 1 END) AS upcoming,
          COUNT(CASE WHEN latest.next_followup_date <  CURRENT_DATE THEN 1 END) AS missed
        FROM (
          SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
          FROM call_logs cl
          WHERE cl.next_followup_date IS NOT NULL
          ORDER BY cl.lead_id, cl.called_at DESC
        ) latest
        JOIN leads l ON l.id = latest.lead_id
        WHERE l.status NOT IN ('converted','not_interested') ${scope}
      `)
      followups = f
    } catch { /* keep zeros */ }

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

    // ── Missed follow-ups: read from call_logs.next_followup_date ──
    // (no separate followups table in this schema)
    let missedFollowups = []
    try {
      const { rows } = await db.query(`
        SELECT
          latest.lead_id,
          latest.next_followup_date                                AS follow_up_date,
          latest.discussion                                        AS notes,
          COALESCE(l.contact_name, l.school_name)                 AS lead_name,
          l.phone, l.status AS lead_status,
          u.name AS agent_name,
          EXTRACT(DAY FROM NOW() - latest.next_followup_date)::int AS days_overdue
        FROM (
          SELECT DISTINCT ON (cl.lead_id)
            cl.lead_id, cl.next_followup_date, cl.discussion
          FROM call_logs cl
          WHERE cl.next_followup_date IS NOT NULL
          ORDER BY cl.lead_id, cl.called_at DESC
        ) latest
        JOIN leads l ON l.id = latest.lead_id
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE latest.next_followup_date < CURRENT_DATE - INTERVAL '3 days'
          AND l.status NOT IN ('converted','not_interested') ${scope}
        ORDER BY latest.next_followup_date ASC LIMIT 50
      `)
      missedFollowups = rows
    } catch { /* keep empty */ }

    res.json({ success: true, data: { unattended, missed_followups: missedFollowups } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
