// backend/src/routes/reports.js — FULL REWRITE v3
// Fixes: agent-wise for all roles, weekly/monthly fallback from leads,
//        pipeline full status columns, pending/upcoming with date range + filters
const express = require('express')
const db = require('../config/db')
const { auth } = require('../middleware/auth')
const router = express.Router()

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── Overview ──────────────────────────────────────────────
router.get('/overview', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(*)                                                 AS total_leads,
        COUNT(CASE WHEN status='new'            THEN 1 END)     AS new_leads,
        COUNT(CASE WHEN status='hot'            THEN 1 END)     AS hot_leads,
        COUNT(CASE WHEN status='warm'           THEN 1 END)     AS warm_leads,
        COUNT(CASE WHEN status='cold'           THEN 1 END)     AS cold_leads,
        COUNT(CASE WHEN status='converted'      THEN 1 END)     AS converted_leads,
        COUNT(CASE WHEN status='not_interested' THEN 1 END)     AS not_interested_leads,
        COUNT(CASE WHEN status='call_back'      THEN 1 END)     AS call_back_leads,
        COUNT(CASE WHEN status NOT IN ('converted','not_interested')
              AND updated_at < NOW()-INTERVAL '5 days' THEN 1 END) AS unattended
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
    const scopeFilter = req.user.role_name !== 'admin' ? `AND l.assigned_to = '${req.user.id}'` : ''

    // Call counts — try communication_logs, fallback to call_logs
    let callsSubquery = `SELECT sender_id AS agent_id, COUNT(*) AS total_calls FROM communication_logs WHERE type='call' GROUP BY sender_id`
    try { await db.query(`SELECT 1 FROM communication_logs LIMIT 1`) }
    catch { callsSubquery = `SELECT user_id AS agent_id, COUNT(*) AS total_calls FROM call_logs GROUP BY user_id` }

    // Admin sees all agents; agent sees only self
    const userFilter = req.user.role_name === 'admin'
      ? `WHERE u.role_name IN ('agent','admin')`
      : `WHERE u.id = '${req.user.id}'`

    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id, u.name AS agent_name,
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
        COALESCE(c.total_calls, 0)                                           AS total_calls
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id ${scopeFilter}
      LEFT JOIN (${callsSubquery}) c ON c.agent_id = u.id
      ${userFilter}
      GROUP BY u.id, u.name, c.total_calls
      ORDER BY total_leads DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily calls ───────────────────────────────────────────
router.get('/daily-calls', auth, async (req, res) => {
  try {
    const { date, agent_id } = req.query
    const targetDate = date || new Date().toISOString().split('T')[0]
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope = `AND l.assigned_to = '${agent_id}'`

    let rows = []
    try {
      const r = await db.query(`
        SELECT cl.id, cl.note AS discussion, cl.created_at AS called_at,
          COALESCE(l.contact_name, l.school_name) AS school_name,
          l.contact_name, l.phone, l.status, u.name AS agent_name, l.id AS lead_id,
          fu.next_followup_date,
          CASE WHEN fu.next_followup_date IS NOT NULL THEN true ELSE false END AS followup_created
        FROM communication_logs cl
        JOIN leads l ON l.id = cl.lead_id
        LEFT JOIN users u ON cl.sender_id = u.id
        LEFT JOIN (
          SELECT DISTINCT ON (lead_id) lead_id, next_followup_date
          FROM call_logs WHERE next_followup_date IS NOT NULL ORDER BY lead_id, called_at DESC
        ) fu ON fu.lead_id = l.id
        WHERE cl.type='call' AND DATE(cl.created_at)=$1 ${scope}
        ORDER BY cl.created_at DESC
      `, [targetDate])
      rows = r.rows
    } catch {
      const r = await db.query(`
        SELECT cl.id, cl.discussion, cl.called_at,
          COALESCE(l.contact_name, l.school_name) AS school_name,
          l.contact_name, l.phone, l.status, u.name AS agent_name, l.id AS lead_id,
          cl.next_followup_date,
          CASE WHEN cl.next_followup_date IS NOT NULL THEN true ELSE false END AS followup_created
        FROM call_logs cl
        JOIN leads l ON l.id = cl.lead_id
        LEFT JOIN users u ON cl.user_id = u.id
        WHERE DATE(cl.called_at)=$1 ${scope}
        ORDER BY cl.called_at DESC
      `, [targetDate])
      rows = r.rows
    }
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Weekly comparison ─────────────────────────────────────
// Returns call-based data if available, else falls back to lead creation data
router.get('/weekly-comparison', auth, async (req, res) => {
  try {
    const { agent_id } = req.query
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope = `AND l.assigned_to = '${agent_id}'`

    let rows = []
    // Try communication_logs
    try {
      const r = await db.query(`
        SELECT
          DATE_TRUNC('week', cl.created_at)                            AS week_start,
          COUNT(DISTINCT cl.id)                                        AS total_calls,
          COUNT(DISTINCT l.id)                                         AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)      AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)      AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)      AS new_leads
        FROM communication_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE cl.type='call' AND cl.created_at >= NOW()-INTERVAL '28 days' ${scope}
        GROUP BY DATE_TRUNC('week', cl.created_at)
        ORDER BY week_start DESC LIMIT 4
      `)
      rows = r.rows
    } catch {}

    // Fallback to call_logs
    if (!rows.length) {
      try {
        const r = await db.query(`
          SELECT
            DATE_TRUNC('week', cl.called_at)                             AS week_start,
            COUNT(DISTINCT cl.id)                                        AS total_calls,
            COUNT(DISTINCT l.id)                                         AS leads_contacted,
            COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
            COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)      AS hot,
            COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)      AS warm,
            COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)      AS new_leads
          FROM call_logs cl
          JOIN leads l ON l.id = cl.lead_id
          WHERE cl.called_at >= NOW()-INTERVAL '28 days' ${scope}
          GROUP BY DATE_TRUNC('week', cl.called_at)
          ORDER BY week_start DESC LIMIT 4
        `)
        rows = r.rows
      } catch {}
    }

    // Final fallback — weekly buckets from lead creation dates
    if (!rows.length) {
      const r = await db.query(`
        SELECT
          DATE_TRUNC('week', l.created_at)                             AS week_start,
          0                                                            AS total_calls,
          COUNT(DISTINCT l.id)                                         AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)      AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)      AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)      AS new_leads
        FROM leads l
        WHERE l.created_at >= NOW()-INTERVAL '28 days' ${scope}
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
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope = `AND l.assigned_to = '${agent_id}'`

    let rows = []
    try {
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', cl.created_at), 'Mon YYYY')      AS month_label,
          DATE_TRUNC('month', cl.created_at)                           AS month_start,
          COUNT(DISTINCT cl.id)                                        AS total_calls,
          COUNT(DISTINCT l.id)                                         AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)      AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)      AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)      AS new_leads
        FROM communication_logs cl
        JOIN leads l ON l.id = cl.lead_id
        WHERE cl.type='call' AND cl.created_at >= NOW()-INTERVAL '90 days' ${scope}
        GROUP BY DATE_TRUNC('month', cl.created_at)
        ORDER BY month_start DESC LIMIT 3
      `)
      rows = r.rows
    } catch {}

    if (!rows.length) {
      try {
        const r = await db.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', cl.called_at), 'Mon YYYY')     AS month_label,
            DATE_TRUNC('month', cl.called_at)                          AS month_start,
            COUNT(DISTINCT cl.id)                                      AS total_calls,
            COUNT(DISTINCT l.id)                                       AS leads_contacted,
            COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
            COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)    AS hot,
            COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)    AS warm,
            COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)    AS new_leads
          FROM call_logs cl
          JOIN leads l ON l.id = cl.lead_id
          WHERE cl.called_at >= NOW()-INTERVAL '90 days' ${scope}
          GROUP BY DATE_TRUNC('month', cl.called_at)
          ORDER BY month_start DESC LIMIT 3
        `)
        rows = r.rows
      } catch {}
    }

    // Final fallback — monthly buckets from lead creation
    if (!rows.length) {
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', l.created_at), 'Mon YYYY')       AS month_label,
          DATE_TRUNC('month', l.created_at)                            AS month_start,
          0                                                            AS total_calls,
          COUNT(DISTINCT l.id)                                         AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'  THEN l.id END)      AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm' THEN l.id END)      AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'  THEN l.id END)      AS new_leads
        FROM leads l
        WHERE l.created_at >= NOW()-INTERVAL '90 days' ${scope}
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
    const scope = agentScope(req.user)
    let r = { today: 0, this_week: 0, this_month: 0, total_all_time: 0 }
    try {
      const { rows: [row] } = await db.query(`
        SELECT
          COUNT(CASE WHEN DATE(cl.created_at)=CURRENT_DATE        THEN 1 END) AS today,
          COUNT(CASE WHEN cl.created_at>=NOW()-INTERVAL '7 days'  THEN 1 END) AS this_week,
          COUNT(CASE WHEN cl.created_at>=NOW()-INTERVAL '30 days' THEN 1 END) AS this_month,
          COUNT(*) AS total_all_time
        FROM communication_logs cl JOIN leads l ON l.id = cl.lead_id
        WHERE cl.type='call' ${scope}
      `)
      r = row
    } catch {
      try {
        const { rows: [row] } = await db.query(`
          SELECT
            COUNT(CASE WHEN DATE(cl.called_at)=CURRENT_DATE        THEN 1 END) AS today,
            COUNT(CASE WHEN cl.called_at>=NOW()-INTERVAL '7 days'  THEN 1 END) AS this_week,
            COUNT(CASE WHEN cl.called_at>=NOW()-INTERVAL '30 days' THEN 1 END) AS this_month,
            COUNT(*) AS total_all_time
          FROM call_logs cl JOIN leads l ON l.id = cl.lead_id WHERE 1=1 ${scope}
        `)
        r = row
      } catch {}
    }
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pipeline — full status columns for agent & product tabs ─
router.get('/pipeline', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)

    const { rows: byStatus } = await db.query(`
      SELECT status, COUNT(*) AS count FROM leads l WHERE 1=1 ${scope}
      GROUP BY status ORDER BY count DESC
    `)

    // Agent pipeline — ALL status columns
    const { rows: byAgent } = await db.query(`
      SELECT u.name AS agent_name, u.id AS agent_id,
        COUNT(l.id)                                              AS total,
        COUNT(CASE WHEN l.status='new'            THEN 1 END)   AS new_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)   AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)   AS warm,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END)   AS cold,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END)   AS call_back,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END)   AS not_interested,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)   AS converted
      FROM leads l JOIN users u ON l.assigned_to = u.id WHERE 1=1 ${scope}
      GROUP BY u.id, u.name ORDER BY total DESC
    `)

    // Product pipeline — ALL status columns
    const { rows: byProduct } = await db.query(`
      SELECT p.name AS product_name, p.id AS product_id,
        COUNT(l.id)                                              AS total,
        COUNT(CASE WHEN l.status='new'            THEN 1 END)   AS new_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END)   AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END)   AS warm,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END)   AS cold,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END)   AS call_back,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END)   AS not_interested,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END)   AS converted
      FROM leads l JOIN products p ON l.product_id = p.id WHERE 1=1 ${scope}
      GROUP BY p.id, p.name ORDER BY total DESC
    `)

    res.json({ success: true, data: { by_status: byStatus, by_agent: byAgent, by_product: byProduct } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pending follow-ups — with date range, agent, product, status filters ─
router.get('/pending-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`
    if (status)     scope += ` AND l.status = '${status}'`

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
      JOIN leads l ON l.id = latest.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN products p ON l.product_id = p.id
      WHERE l.status NOT IN ('converted','not_interested')
        AND latest.next_followup_date BETWEEN $1 AND $2 ${scope}
      ORDER BY latest.next_followup_date ASC LIMIT 500
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Upcoming follow-ups — with date range, agent, product, status filters ─
router.get('/upcoming-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`
    if (status)     scope += ` AND l.status = '${status}'`

    const dateFrom = from || new Date().toISOString().split('T')[0]
    const dateTo   = to   || new Date(Date.now() + 30*86400000).toISOString().split('T')[0]

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
      JOIN leads l ON l.id = latest.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN products p ON l.product_id = p.id
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
    const dateFrom = from || new Date(Date.now()-30*86400000).toISOString().split('T')[0]
    const dateTo   = to   || new Date().toISOString().split('T')[0]
    const scope = agentScope(req.user)
    let rows = []
    try {
      const r = await db.query(`
        SELECT DATE(cl.created_at) AS call_date,
          COUNT(DISTINCT cl.id) AS total_calls, COUNT(DISTINCT l.id) AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END) AS fresh_calls,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END) AS hot_calls,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END) AS warm_calls,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted
        FROM communication_logs cl JOIN leads l ON l.id=cl.lead_id
        WHERE cl.type='call' AND DATE(cl.created_at) BETWEEN $1 AND $2 ${scope}
        GROUP BY DATE(cl.created_at) ORDER BY call_date DESC
      `, [dateFrom, dateTo])
      rows = r.rows
    } catch {
      const r = await db.query(`
        SELECT DATE(cl.called_at) AS call_date,
          COUNT(DISTINCT cl.id) AS total_calls, COUNT(DISTINCT l.id) AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END) AS fresh_calls,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END) AS hot_calls,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END) AS warm_calls,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END) AS converted
        FROM call_logs cl JOIN leads l ON l.id=cl.lead_id
        WHERE DATE(cl.called_at) BETWEEN $1 AND $2 ${scope}
        GROUP BY DATE(cl.called_at) ORDER BY call_date DESC
      `, [dateFrom, dateTo])
      rows = r.rows
    }
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
        COUNT(CASE WHEN l.status='converted'      THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END) AS hot,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END) AS warm,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested')
              AND l.updated_at < NOW()-INTERVAL '5 days' THEN 1 END) AS unattended,
        COALESCE(c.total_calls, 0) AS total_calls,
        ROUND(CASE WHEN COUNT(l.id)>0
          THEN COUNT(CASE WHEN l.status='converted' THEN 1 END)::numeric/COUNT(l.id)*100
          ELSE 0 END, 1) AS conversion_rate
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
