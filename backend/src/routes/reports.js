// backend/src/routes/reports.js — FIXED v4
// Fixes:
// 1. agentScope: role_name → role_id check
// 2. agent-wise: sender_id → agent_id, role_name → role_id JOIN
// 3. daily-calls: sender_id → agent_id
// 4. conversion: sender_id → agent_id, role_name → role_id JOIN
// 5. weekly/monthly: scope fixed for role_id

const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

// FIX 1: role_id === 1 is admin (not role_name which doesn't exist on req.user in all cases)
function agentScope(user, alias = 'l') {
  return (user.role_id === 1 || user.role_name === 'admin')
    ? ''
    : `AND ${alias}.assigned_to = '${user.id}'`
}

function isAdmin(user) {
  return user.role_id === 1 || user.role_name === 'admin'
}

// ── Overview ──────────────────────────────────────────────
router.get('/overview', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(*)                                                          AS total_leads,
        COUNT(CASE WHEN status='new'            THEN 1 END)              AS new_leads,
        COUNT(CASE WHEN status='hot'            THEN 1 END)              AS hot_leads,
        COUNT(CASE WHEN status='warm'           THEN 1 END)              AS warm_leads,
        COUNT(CASE WHEN status='cold'           THEN 1 END)              AS cold_leads,
        COUNT(CASE WHEN status='converted'      THEN 1 END)              AS converted_leads,
        COUNT(CASE WHEN status='not_interested' THEN 1 END)              AS not_interested_leads,
        COUNT(CASE WHEN status='call_back'      THEN 1 END)              AS call_back_leads,
        COUNT(CASE WHEN status NOT IN ('converted','not_interested')
              AND updated_at < NOW()-INTERVAL '5 days' THEN 1 END)       AS unattended
      FROM leads l WHERE 1=1 ${scope}
    `)
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Status wise ───────────────────────────────────────────
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
router.get('/agent-wise', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const scopeFilter = admin ? '' : `AND l.assigned_to = '${req.user.id}'`

    // FIX 2: communication_logs uses agent_id (not sender_id)
    // FIX 3: users filter uses role_id JOIN (not role_name column)
    const userFilter = admin
      ? `JOIN roles r ON r.id = u.role_id WHERE r.name IN ('agent','admin')`
      : `JOIN roles r ON r.id = u.role_id WHERE u.id = '${req.user.id}'`

    const { rows } = await db.query(`
      SELECT
        u.id   AS agent_id,
        u.name AS agent_name,
        COUNT(l.id)                                                           AS total_leads,
        COUNT(CASE WHEN l.status='new'            THEN 1 END)                AS new_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)                AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)                AS warm,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END)                AS cold,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END)                AS call_back,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END)                AS not_interested,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)                AS converted,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested')
              AND l.updated_at < NOW()-INTERVAL '5 days' THEN 1 END)         AS unattended,
        COALESCE((
          SELECT COUNT(*) FROM call_logs cl WHERE cl.user_id = u.id
        ), 0) AS total_calls
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id ${scopeFilter}
      ${userFilter}
      GROUP BY u.id, u.name
      ORDER BY total_leads DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily calls ───────────────────────────────────────────
router.get('/daily-calls', auth, async (req, res) => {
  try {
    const { date, agent_id } = req.query
    const admin      = isAdmin(req.user)
    const targetDate = date || new Date().toISOString().split('T')[0]

    // Build scope: agents only see their own; admin can filter by agent
    let agentFilter = ''
    if (!admin) {
      agentFilter = `AND cl.user_id = '${req.user.id}'`
    } else if (agent_id) {
      agentFilter = `AND cl.user_id = '${agent_id}'`
    }

    // FIX 4: Use call_logs with user_id (correct table and column)
    const { rows } = await db.query(`
      SELECT
        cl.id,
        cl.discussion,
        cl.called_at,
        cl.next_followup_date,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name,
        l.phone,
        l.status,
        u.name AS agent_name,
        l.id   AS lead_id
      FROM call_logs cl
      JOIN leads l   ON l.id  = cl.lead_id
      LEFT JOIN users u ON u.id = cl.user_id
      WHERE DATE(cl.called_at AT TIME ZONE 'Asia/Kolkata') = $1
        ${agentFilter}
      ORDER BY cl.called_at DESC
    `, [targetDate])

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('daily-calls error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Weekly comparison ─────────────────────────────────────
router.get('/weekly-comparison', auth, async (req, res) => {
  try {
    const { agent_id } = req.query
    const admin = isAdmin(req.user)

    let agentFilter = ''
    if (!admin) {
      agentFilter = `AND cl.user_id = '${req.user.id}'`
    } else if (agent_id) {
      agentFilter = `AND cl.user_id = '${agent_id}'`
    }

    // Use call_logs directly (correct table)
    let rows = []
    try {
      const r = await db.query(`
        SELECT
          DATE_TRUNC('week', cl.called_at)                               AS week_start,
          COUNT(DISTINCT cl.id)                                          AS total_calls,
          COUNT(DISTINCT l.id)                                           AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
        FROM call_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE cl.called_at >= NOW()-INTERVAL '28 days'
          ${agentFilter}
        GROUP BY DATE_TRUNC('week', cl.called_at)
        ORDER BY week_start DESC LIMIT 4
      `)
      rows = r.rows
    } catch (e) { console.error('weekly call_logs error:', e.message) }

    // Fallback — weekly buckets from lead creation dates
    if (!rows.length) {
      const leadScope = admin
        ? (agent_id ? `AND l.assigned_to = '${agent_id}'` : '')
        : `AND l.assigned_to = '${req.user.id}'`
      const r = await db.query(`
        SELECT
          DATE_TRUNC('week', l.created_at)                               AS week_start,
          0                                                              AS total_calls,
          COUNT(DISTINCT l.id)                                           AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
        FROM leads l
        WHERE l.created_at >= NOW()-INTERVAL '28 days' ${leadScope}
        GROUP BY DATE_TRUNC('week', l.created_at)
        ORDER BY week_start DESC LIMIT 4
      `)
      rows = r.rows
    }

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Monthly comparison ────────────────────────────────────
router.get('/monthly-comparison', auth, async (req, res) => {
  try {
    const { agent_id } = req.query
    const admin = isAdmin(req.user)

    let agentFilter = ''
    if (!admin) {
      agentFilter = `AND cl.user_id = '${req.user.id}'`
    } else if (agent_id) {
      agentFilter = `AND cl.user_id = '${agent_id}'`
    }

    let rows = []
    try {
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', cl.called_at), 'Mon YYYY')         AS month_label,
          DATE_TRUNC('month', cl.called_at)                              AS month_start,
          COUNT(DISTINCT cl.id)                                          AS total_calls,
          COUNT(DISTINCT l.id)                                           AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
        FROM call_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE cl.called_at >= NOW()-INTERVAL '90 days'
          ${agentFilter}
        GROUP BY DATE_TRUNC('month', cl.called_at)
        ORDER BY month_start DESC LIMIT 3
      `)
      rows = r.rows
    } catch (e) { console.error('monthly call_logs error:', e.message) }

    // Fallback — monthly buckets from lead creation
    if (!rows.length) {
      const leadScope = admin
        ? (agent_id ? `AND l.assigned_to = '${agent_id}'` : '')
        : `AND l.assigned_to = '${req.user.id}'`
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', l.created_at), 'Mon YYYY')         AS month_label,
          DATE_TRUNC('month', l.created_at)                              AS month_start,
          0                                                              AS total_calls,
          COUNT(DISTINCT l.id)                                           AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
        FROM leads l
        WHERE l.created_at >= NOW()-INTERVAL '90 days' ${leadScope}
        GROUP BY DATE_TRUNC('month', l.created_at)
        ORDER BY month_start DESC LIMIT 3
      `)
      rows = r.rows
    }

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Call stats summary ────────────────────────────────────
router.get('/call-stats', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const agentFilter = admin ? '' : `AND cl.user_id = '${req.user.id}'`

    // Use call_logs (correct table with user_id)
    try {
      const { rows: [row] } = await db.query(`
        SELECT
          COUNT(CASE WHEN DATE(cl.called_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE        THEN 1 END) AS today,
          COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '7 days'   THEN 1 END)                            AS this_week,
          COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '30 days'  THEN 1 END)                            AS this_month,
          COUNT(*) AS total_all_time
        FROM call_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE 1=1 ${agentFilter}
      `)
      return res.json({ success: true, data: row })
    } catch (e) { console.error('call-stats error:', e.message) }

    res.json({ success: true, data: { today: 0, this_week: 0, this_month: 0, total_all_time: 0 } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pipeline ──────────────────────────────────────────────
router.get('/pipeline', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    const { rows: byStatus } = await db.query(`
      SELECT status, COUNT(*) AS count FROM leads l WHERE 1=1 ${scope}
      GROUP BY status ORDER BY count DESC
    `)

    const { rows: byAgent } = await db.query(`
      SELECT u.name AS agent_name, u.id AS agent_id,
        COUNT(l.id)                                                AS total,
        COUNT(CASE WHEN l.status='new'            THEN 1 END)     AS new_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)     AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)     AS warm,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END)     AS cold,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END)     AS call_back,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END)     AS not_interested,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)     AS converted
      FROM leads l JOIN users u ON l.assigned_to = u.id WHERE 1=1 ${scope}
      GROUP BY u.id, u.name ORDER BY total DESC
    `)

    const { rows: byProduct } = await db.query(`
      SELECT p.name AS product_name, p.id AS product_id,
        COUNT(l.id)                                                AS total,
        COUNT(CASE WHEN l.status='new'            THEN 1 END)     AS new_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)     AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)     AS warm,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END)     AS cold,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END)     AS call_back,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END)     AS not_interested,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)     AS converted
      FROM leads l JOIN products p ON l.product_id = p.id WHERE 1=1 ${scope}
      GROUP BY p.id, p.name ORDER BY total DESC
    `)

    res.json({ success: true, data: { by_status: byStatus, by_agent: byAgent, by_product: byProduct } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pending follow-ups ────────────────────────────────────
router.get('/pending-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    const admin = isAdmin(req.user)
    let scope = admin ? '' : `AND l.assigned_to = '${req.user.id}'`
    if (admin && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id)        scope += ` AND l.product_id = ${parseInt(product_id)}`
    if (status)            scope += ` AND l.status = '${status}'`

    const dateFrom = from || '2000-01-01'
    const dateTo   = to   || '2099-12-31'

    const { rows } = await db.query(`
      SELECT
        latest.lead_id AS id,
        latest.next_followup_date AS follow_up_date,
        latest.discussion AS notes,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status AS lead_status,
        l.product_id, p.name AS product_name,
        u.name AS agent_name,
        CASE WHEN latest.next_followup_date < CURRENT_DATE THEN 'missed' ELSE 'pending' END AS followup_type
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date, cl.discussion
        FROM call_logs cl WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l    ON l.id  = latest.lead_id
      LEFT JOIN users u    ON u.id  = l.assigned_to
      LEFT JOIN products p ON p.id  = l.product_id
      WHERE l.status NOT IN ('converted','not_interested')
        AND latest.next_followup_date BETWEEN $1 AND $2 ${scope}
      ORDER BY latest.next_followup_date ASC LIMIT 500
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Upcoming follow-ups ───────────────────────────────────
router.get('/upcoming-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    const admin = isAdmin(req.user)
    let scope = admin ? '' : `AND l.assigned_to = '${req.user.id}'`
    if (admin && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id)        scope += ` AND l.product_id = ${parseInt(product_id)}`
    if (status)            scope += ` AND l.status = '${status}'`

    const dateFrom = from || new Date().toISOString().split('T')[0]
    const dateTo   = to   || new Date(Date.now()+30*86400000).toISOString().split('T')[0]

    const { rows } = await db.query(`
      SELECT
        latest.lead_id AS id,
        latest.next_followup_date,
        latest.discussion AS notes,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status AS lead_status,
        l.product_id, p.name AS product_name,
        u.name AS agent_name
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date, cl.discussion
        FROM call_logs cl WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l    ON l.id  = latest.lead_id
      LEFT JOIN users u    ON u.id  = l.assigned_to
      LEFT JOIN products p ON p.id  = l.product_id
      WHERE latest.next_followup_date BETWEEN $1 AND $2
        AND l.status NOT IN ('converted','not_interested') ${scope}
      ORDER BY latest.next_followup_date ASC LIMIT 500
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily summary ─────────────────────────────────────────
router.get('/daily-summary', auth, async (req, res) => {
  try {
    const { from, to } = req.query
    const admin    = isAdmin(req.user)
    const dateFrom = from || new Date(Date.now()-30*86400000).toISOString().split('T')[0]
    const dateTo   = to   || new Date().toISOString().split('T')[0]
    const agentFilter = admin ? '' : `AND cl.user_id = '${req.user.id}'`

    const { rows } = await db.query(`
      SELECT DATE(cl.called_at) AS call_date,
        COUNT(DISTINCT cl.id)                                           AS total_calls,
        COUNT(DISTINCT l.id)                                            AS leads_contacted,
        COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS fresh_calls,
        COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot_calls,
        COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm_calls,
        COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted
      FROM call_logs cl JOIN leads l ON l.id = cl.lead_id
      WHERE DATE(cl.called_at) BETWEEN $1 AND $2 ${agentFilter}
      GROUP BY DATE(cl.called_at) ORDER BY call_date DESC
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Conversion ────────────────────────────────────────────
router.get('/conversion', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    // FIX 5: role_id JOIN + agent_id (not sender_id, not role_name)
    const scopeFilter = admin ? '' : `AND l.assigned_to = '${req.user.id}'`

    const { rows } = await db.query(`
      SELECT
        u.id   AS agent_id,
        u.name AS agent_name,
        COUNT(l.id)                                                           AS total_leads,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)                AS converted,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)                AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)                AS warm,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested')
              AND l.updated_at < NOW()-INTERVAL '5 days' THEN 1 END)         AS unattended,
        COALESCE((
          SELECT COUNT(*) FROM call_logs cl WHERE cl.user_id = u.id
        ), 0) AS total_calls,
        ROUND(CASE WHEN COUNT(l.id)>0
          THEN COUNT(CASE WHEN l.status='converted' THEN 1 END)::numeric / COUNT(l.id) * 100
          ELSE 0 END, 1) AS conversion_rate
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN leads l ON l.assigned_to = u.id ${scopeFilter}
      WHERE r.name IN ('agent','admin')
        AND u.is_active = true
      GROUP BY u.id, u.name
      HAVING COUNT(l.id) > 0
      ORDER BY conversion_rate DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
