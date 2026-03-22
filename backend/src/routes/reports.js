// backend/src/routes/reports.js  — COMPLETE REPLACEMENT
// ✅ FIX: All status counts now use GROUP BY — any new status added in Settings
//         automatically appears in all reports. No hardcoding.
const express = require('express')
const db = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router = express.Router()

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── Overview ──────────────────────────────────────────────
router.get('/overview', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    // ✅ Dynamic status breakdown
    const { rows: statusRows } = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM leads l WHERE 1=1 ${scope}
      GROUP BY status
    `)
    const byStatus = {}
    statusRows.forEach(r => { byStatus[r.status] = parseInt(r.count || 0) })

    const { rows: [misc] } = await db.query(`
      SELECT
        COUNT(*)                                                       AS total_leads,
        COUNT(CASE WHEN status NOT IN ('converted','not_interested')
              AND updated_at < NOW()-INTERVAL '5 days' THEN 1 END)    AS unattended
      FROM leads l WHERE 1=1 ${scope}
    `)

    res.json({
      success: true,
      data: {
        total_leads:           parseInt(misc.total_leads || 0),
        unattended:            parseInt(misc.unattended  || 0),
        // ✅ All dynamic statuses
        ...byStatus,
        // Legacy _leads-suffix aliases so existing frontend works unchanged
        new_leads:             byStatus['new']            || 0,
        hot_leads:             byStatus['hot']            || 0,
        warm_leads:            byStatus['warm']           || 0,
        cold_leads:            byStatus['cold']           || 0,
        converted_leads:       byStatus['converted']      || 0,
        not_interested_leads:  byStatus['not_interested'] || 0,
        call_back_leads:       byStatus['call_back']      || 0,
        // Raw array for new dynamic rendering
        status_breakdown: statusRows.map(r => ({ status: r.status, count: parseInt(r.count || 0) }))
      }
    })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Status wise ───────────────────────────────────────────
// ✅ Already dynamic — returns all statuses from DB
router.get('/status-wise', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM leads l WHERE 1=1 ${scope}
      GROUP BY status ORDER BY count DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Agent wise ────────────────────────────────────────────
// ✅ FIX: Added dynamic per-status columns for all active statuses
router.get('/agent-wise', auth, async (req, res) => {
  try {
    const scopeFilter = req.user.role_name !== 'admin' ? `AND l.assigned_to = '${req.user.id}'` : ''

    // Get all active statuses for dynamic columns
    const { rows: activeStatuses } = await db.query(`
      SELECT key FROM app_settings
      WHERE category = 'lead_status' AND is_active = true
      ORDER BY sort_order
    `)

    // Build dynamic CASE columns per status
    const statusCols = activeStatuses.map(s =>
      `COUNT(CASE WHEN l.status='${s.key}' THEN 1 END) AS "${s.key}"`
    ).join(',\n        ')

    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id, u.name AS agent_name,
        COUNT(l.id) AS total_leads,
        ${statusCols},
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested')
              AND l.updated_at < NOW()-INTERVAL '5 days' THEN 1 END) AS unattended,
        COALESCE(c.total_calls, 0) AS total_calls
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id ${scopeFilter}
      LEFT JOIN (
        SELECT cl.sender_id AS agent_id, COUNT(*) AS total_calls
        FROM communication_logs cl WHERE cl.type='call'
        GROUP BY cl.sender_id
      ) c ON c.agent_id = u.id
      WHERE u.role_name = 'agent' OR (u.role_name = 'admin' AND u.id = '${req.user.id}')
      GROUP BY u.id, u.name, c.total_calls
      HAVING COUNT(l.id) > 0
      ORDER BY total_leads DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily calls — detailed ────────────────────────────────
router.get('/daily-calls', auth, async (req, res) => {
  try {
    const { date, agent_id } = req.query
    const targetDate = date || new Date().toISOString().split('T')[0]
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) {
      scope = `AND l.assigned_to = '${agent_id}'`
    }

    const { rows } = await db.query(`
      SELECT
        cl.id, cl.note AS discussion, cl.created_at AS called_at,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status,
        u.name AS agent_name, l.id AS lead_id,
        CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS followup_created
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN users u ON cl.sender_id = u.id
      LEFT JOIN followups f ON f.lead_id = l.id AND DATE(f.created_at) = $1
      WHERE cl.type = 'call' AND DATE(cl.created_at) = $1 ${scope}
      ORDER BY cl.created_at DESC
    `, [targetDate])

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily summary (day-wise stats for range) ──────────────
router.get('/daily-summary', auth, async (req, res) => {
  try {
    const { from, to } = req.query
    const dateFrom = from || new Date(Date.now() - 30*86400000).toISOString().split('T')[0]
    const dateTo   = to   || new Date().toISOString().split('T')[0]
    const scope = agentScope(req.user)

    const { rows } = await db.query(`
      SELECT
        DATE(cl.created_at)                                          AS call_date,
        COUNT(DISTINCT cl.id)                                        AS total_calls,
        COUNT(DISTINCT l.id)                                         AS leads_contacted,
        COUNT(DISTINCT CASE WHEN l.status='new'      THEN l.id END) AS fresh_calls,
        COUNT(DISTINCT CASE WHEN l.status='hot'      THEN l.id END) AS hot_calls,
        COUNT(DISTINCT CASE WHEN l.status='warm'     THEN l.id END) AS warm_calls,
        COUNT(DISTINCT CASE WHEN l.status='converted'THEN l.id END) AS converted,
        COUNT(DISTINCT f.id)                                         AS followups_created,
        COUNT(DISTINCT CASE WHEN f.follow_up_date < CURRENT_DATE
              AND (f.status='pending' OR f.status IS NULL)
              THEN f.id END)                                         AS followups_missed
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN followups f ON f.lead_id = l.id AND DATE(f.created_at) = DATE(cl.created_at)
      WHERE cl.type='call'
        AND DATE(cl.created_at) BETWEEN $1 AND $2 ${scope}
      GROUP BY DATE(cl.created_at)
      ORDER BY call_date DESC
    `, [dateFrom, dateTo])

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Weekly comparison (last 4 weeks) ─────────────────────
router.get('/weekly-comparison', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT
        DATE_TRUNC('week', cl.created_at)                       AS week_start,
        COUNT(DISTINCT cl.id)                                   AS total_calls,
        COUNT(DISTINCT l.id)                                    AS leads_contacted,
        COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
        COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END) AS hot,
        COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END) AS warm,
        COUNT(DISTINCT f.id)                                    AS followups_created
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN followups f ON f.lead_id = l.id
        AND DATE_TRUNC('week', f.created_at) = DATE_TRUNC('week', cl.created_at)
      WHERE cl.type='call' AND cl.created_at >= NOW()-INTERVAL '28 days' ${scope}
      GROUP BY DATE_TRUNC('week', cl.created_at)
      ORDER BY week_start DESC LIMIT 4
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Monthly comparison (last 3 months) ───────────────────
router.get('/monthly-comparison', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', cl.created_at), 'Mon YYYY') AS month_label,
        DATE_TRUNC('month', cl.created_at)                      AS month_start,
        COUNT(DISTINCT cl.id)                                   AS total_calls,
        COUNT(DISTINCT l.id)                                    AS leads_contacted,
        COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
        COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END) AS hot,
        COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END) AS warm,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', l.created_at) =
              DATE_TRUNC('month', cl.created_at) THEN l.id END) AS new_leads
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      WHERE cl.type='call' AND cl.created_at >= NOW()-INTERVAL '90 days' ${scope}
      GROUP BY DATE_TRUNC('month', cl.created_at)
      ORDER BY month_start DESC LIMIT 3
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Call stats summary ────────────────────────────────────
router.get('/call-stats', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user, 'cl')
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(CASE WHEN DATE(cl.created_at)=CURRENT_DATE       THEN 1 END) AS today,
        COUNT(CASE WHEN cl.created_at>=NOW()-INTERVAL '7 days'  THEN 1 END) AS this_week,
        COUNT(CASE WHEN cl.created_at>=NOW()-INTERVAL '30 days' THEN 1 END) AS this_month,
        COUNT(*) AS total_all_time
      FROM communication_logs cl
      JOIN leads l ON l.id = cl.lead_id
      WHERE cl.type='call' ${scope}
    `)
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pipeline ──────────────────────────────────────────────
// ✅ by_status is fully dynamic
router.get('/pipeline', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    // ✅ All statuses dynamically — no hardcoding
    const { rows: byStatus } = await db.query(`
      SELECT status, COUNT(*) AS count FROM leads l WHERE 1=1 ${scope}
      GROUP BY status ORDER BY count DESC
    `)

    // Agent wise — core fixed columns + total
    const { rows: byAgent } = await db.query(`
      SELECT u.name AS agent_name, u.id AS agent_id,
        COUNT(l.id) AS total,
        COUNT(CASE WHEN l.status='hot'       THEN 1 END) AS hot,
        COUNT(CASE WHEN l.status='warm'      THEN 1 END) AS warm,
        COUNT(CASE WHEN l.status='converted' THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status='new'       THEN 1 END) AS new_leads
      FROM leads l JOIN users u ON l.assigned_to = u.id WHERE 1=1 ${scope}
      GROUP BY u.id, u.name ORDER BY total DESC
    `)

    // Product wise
    const { rows: byProduct } = await db.query(`
      SELECT p.name AS product_name, p.id AS product_id,
        COUNT(l.id) AS total,
        COUNT(CASE WHEN l.status='converted' THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status='hot'  THEN 1 END) AS hot
      FROM leads l JOIN products p ON l.product_id = p.id WHERE 1=1 ${scope}
      GROUP BY p.id, p.name ORDER BY total DESC
    `)

    res.json({ success: true, data: { by_status: byStatus, by_agent: byAgent, by_product: byProduct } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pending follow-ups ────────────────────────────────────
router.get('/pending-followups', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT f.id, f.follow_up_date, f.notes,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status AS lead_status,
        u.name AS agent_name,
        CASE WHEN f.follow_up_date < CURRENT_DATE THEN 'missed' ELSE 'pending' END AS followup_type
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE (f.status IS NULL OR f.status='pending') ${scope}
      ORDER BY f.follow_up_date ASC LIMIT 200
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Upcoming follow-ups ───────────────────────────────────
router.get('/upcoming-followups', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT f.id, f.follow_up_date AS next_followup_date, f.notes,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status AS lead_status,
        u.name AS agent_name
      FROM followups f
      JOIN leads l ON l.id = f.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE f.follow_up_date >= CURRENT_DATE
        AND (f.status IS NULL OR f.status='pending') ${scope}
      ORDER BY f.follow_up_date ASC LIMIT 200
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Conversion ────────────────────────────────────────────
router.get('/conversion', auth, async (req, res) => {
  try {
    const scopeFilter = req.user.role_name !== 'admin' ? `AND l.assigned_to = '${req.user.id}'` : ''
    const { rows } = await db.query(`
      SELECT u.id AS agent_id, u.name AS agent_name,
        COUNT(l.id) AS total_leads,
        COUNT(CASE WHEN l.status='converted' THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status='hot'  THEN 1 END) AS hot,
        COUNT(CASE WHEN l.status='warm' THEN 1 END) AS warm,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested')
              AND l.updated_at < NOW()-INTERVAL '5 days' THEN 1 END) AS unattended,
        COALESCE(c.total_calls, 0) AS total_calls,
        ROUND(
          CASE WHEN COUNT(l.id)>0 THEN COUNT(CASE WHEN l.status='converted' THEN 1 END)::numeric/COUNT(l.id)*100
          ELSE 0 END, 1
        ) AS conversion_rate
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id ${scopeFilter}
      LEFT JOIN (SELECT sender_id, COUNT(*) AS total_calls FROM communication_logs WHERE type='call' GROUP BY sender_id) c
        ON c.sender_id = u.id
      WHERE u.role_name IN ('agent','admin')
      GROUP BY u.id, u.name, c.total_calls HAVING COUNT(l.id)>0
      ORDER BY conversion_rate DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
