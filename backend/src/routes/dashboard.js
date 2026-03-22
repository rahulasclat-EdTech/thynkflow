// backend/src/routes/dashboard.js  — COMPLETE REPLACEMENT
// ✅ FIX: Status counts now use GROUP BY — any new status added in Settings
//         automatically appears in dashboard totals. No hardcoding.
const express = require('express')
const db = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router = express.Router()

// ── Helper: scope WHERE clause by role ────────────────────
function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── Helper: build a status-keyed object from GROUP BY rows ─
// e.g. [{ status:'hot', count:'12' }, ...] → { hot: 12, warm: 5, ... }
function statusMap(rows) {
  const map = {}
  rows.forEach(r => { map[r.status] = parseInt(r.count || 0) })
  return map
}

// ── GET /api/dashboard  (main stats) ─────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    // ✅ Dynamic: counts ALL statuses, not just the original 7
    const { rows: statusRows } = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM leads l
      WHERE 1=1 ${scope}
      GROUP BY status
    `)
    const byStatus = statusMap(statusRows)

    // Fixed counts that don't depend on status list
    const { rows: [misc] } = await db.query(`
      SELECT
        COUNT(*)                                                        AS total_leads,
        COUNT(CASE WHEN status NOT IN (
              SELECT key FROM app_settings
              WHERE category='lead_status' AND key IN ('converted','not_interested')
              UNION ALL SELECT 'converted' UNION ALL SELECT 'not_interested'
            ) AND updated_at < NOW() - INTERVAL '5 days' THEN 1 END)   AS unattended,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE  THEN 1 END)   AS today_new
      FROM leads l WHERE 1=1 ${scope}
    `)

    const { rows: [calls] } = await db.query(`
      SELECT
        COUNT(CASE WHEN DATE(cl.created_at) = CURRENT_DATE    THEN 1 END) AS today_calls,
        COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '7d'  THEN 1 END) AS week_calls,
        COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '30d' THEN 1 END) AS month_calls
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

    // ✅ Spread all dynamic status keys PLUS fixed fields.
    // Legacy field names preserved so existing frontend fallbacks still work.
    res.json({
      success: true,
      data: {
        totals: {
          // Fixed totals
          total_leads:        parseInt(misc.total_leads   || 0),
          unattended:         parseInt(misc.unattended    || 0),
          today_new:          parseInt(misc.today_new     || 0),
          today_calls:        parseInt(calls.today_calls  || 0),
          week_calls:         parseInt(calls.week_calls   || 0),
          month_calls:        parseInt(calls.month_calls  || 0),
          upcoming_followups: parseInt(followups.upcoming || 0),
          missed_followups:   parseInt(followups.missed   || 0),

          // ✅ All statuses dynamically — new ones auto-appear here
          ...byStatus,

          // Legacy aliases so existing DashboardPage.jsx fallbacks keep working
          new_leads:          byStatus['new']            || 0,
          hot_leads:          byStatus['hot']            || 0,
          warm_leads:         byStatus['warm']           || 0,
          cold_leads:         byStatus['cold']           || 0,
          converted:          byStatus['converted']      || 0,
          not_interested:     byStatus['not_interested'] || 0,
          call_back:          byStatus['call_back']      || 0,
        },
        // ✅ Also expose raw array so frontend can render all statuses dynamically
        status_breakdown: statusRows.map(r => ({
          status: r.status,
          count:  parseInt(r.count || 0)
        }))
      }
    })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/dashboard/stats  (alias for ReportsPage) ────
router.get('/stats', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    // ✅ Dynamic status counts
    const { rows: statusRows } = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM leads l WHERE 1=1 ${scope}
      GROUP BY status
    `)
    const byStatus = statusMap(statusRows)

    const { rows: [misc] } = await db.query(`
      SELECT
        COUNT(*)                                                       AS total_leads,
        COUNT(CASE WHEN status NOT IN (
              SELECT key FROM app_settings
              WHERE category='lead_status' AND key IN ('converted','not_interested')
              UNION ALL SELECT 'converted' UNION ALL SELECT 'not_interested'
            ) AND updated_at < NOW()-INTERVAL '5 days' THEN 1 END)    AS unattended
      FROM leads l WHERE 1=1 ${scope}
    `)

    res.json({
      success: true,
      data: {
        totals: {
          total_leads:           parseInt(misc.total_leads || 0),
          unattended:            parseInt(misc.unattended  || 0),
          // ✅ Dynamic
          ...byStatus,
          // Legacy _leads-suffix aliases for ReportsPage fallback
          new_leads:             byStatus['new']            || 0,
          hot_leads:             byStatus['hot']            || 0,
          warm_leads:            byStatus['warm']           || 0,
          cold_leads:            byStatus['cold']           || 0,
          converted_leads:       byStatus['converted']      || 0,
          not_interested_leads:  byStatus['not_interested'] || 0,
          call_back_leads:       byStatus['call_back']      || 0,
        },
        status_breakdown: statusRows.map(r => ({
          status: r.status,
          count:  parseInt(r.count || 0)
        }))
      }
    })
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
