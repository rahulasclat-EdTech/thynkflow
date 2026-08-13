// backend/src/routes/reports.js — FIXED v5
// ONLY these were broken and fixed:
// 1. agentScope: added role_id fallback (was missing)
// 2. agent-wise: sender_id → agent_id, role_name → role JOIN
// 3. daily-calls: sender_id → agent_id in JOIN
// 4. conversion: sender_id → agent_id, role_name → role JOIN
// Everything else (overview, call-stats, weekly, monthly, pipeline) = UNTOUCHED

const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

// FIX 1: support both role_id and role_name for isAdmin check
function agentScope(user, alias = 'l') {
  const admin = user.role_id === 1 || user.role_name === 'admin'
  return admin ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

function isAdmin(user) {
  return user.role_id === 1 || user.role_name === 'admin'
}

// Validates a YYYY-MM-DD date string before it's interpolated into raw
// SQL below (these report routes build WHERE clauses via string concat
// rather than parameterized queries) — returns null for anything else.
function safeDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}
// Builds a "created between from/to" SQL fragment for a leads alias.
function dateRangeScope(from, to, alias = 'l') {
  const f = safeDate(from), t = safeDate(to)
  let scope = ''
  if (f) scope += ` AND ${alias}.created_at >= '${f}'`
  if (t) scope += ` AND ${alias}.created_at < '${t}'::date + INTERVAL '1 day'`
  return scope
}

// ── Overview ── UNTOUCHED (was working) ───────────────────
router.get('/overview', auth, async (req, res) => {
  try {
    const { product_id, from, to } = req.query
    let scope = agentScope(req.user)
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`
    scope += dateRangeScope(from, to)
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

// ── Status wise ──────────────────────────────────────────
router.get('/status-wise', auth, async (req, res) => {
  try {
    const { product_id, from, to } = req.query
    let scope = agentScope(req.user)
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`
    scope += dateRangeScope(from, to)
    const { rows } = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM leads l WHERE 1=1 ${scope}
      GROUP BY status ORDER BY count DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Agent wise ──────────────────────────────────────────
router.get('/agent-wise', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { product_id, from, to } = req.query
    const prodId = product_id ? parseInt(product_id) : null

    // Build WHERE clause filters (not JOIN ON, to avoid LEFT JOIN masking)
    const whereClauses = []
    if (!admin) whereClauses.push(`l.assigned_to = '${req.user.id}'`)
    if (prodId)  whereClauses.push(`l.product_id = ${prodId}`)
    const leadsWhere = (whereClauses.length ? 'AND ' + whereClauses.join(' AND ') : '') + dateRangeScope(from, to)

    const userFilter = admin
      ? `JOIN roles r ON r.id = u.role_id WHERE r.name IN ('agent','admin') AND u.is_active = true`
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
          SELECT COUNT(*)
          FROM communication_logs cl
          JOIN leads lc ON lc.id = cl.lead_id
          WHERE cl.agent_id = u.id AND cl.type = 'call'
            ${prodId ? `AND lc.product_id = ${prodId}` : ''}
        ), 0) AS total_calls,
        COALESCE((
          SELECT COUNT(*)
          FROM communication_logs cl
          JOIN leads lc ON lc.id = cl.lead_id
          WHERE cl.agent_id = u.id AND cl.type = 'call' AND cl.is_followup = true
            ${prodId ? `AND lc.product_id = ${prodId}` : ''}
        ), 0) AS followup_calls
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id ${leadsWhere}
      ${userFilter}
      GROUP BY u.id, u.name
      HAVING COUNT(l.id) > 0
      ORDER BY converted DESC, total_calls DESC, hot DESC
`)
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('agent-wise error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Daily calls ── FIXED: sender_id→agent_id ─────────────
router.get('/daily-calls', auth, async (req, res) => {
  try {
    const { date, from, to, agent_id } = req.query
    const admin = isAdmin(req.user)

    // Supports either a single ?date= (legacy / mobile "today" view) or a
    // ?from=&to= range for the new date-range picker. Falls back to today
    // when neither is supplied.
    const rangeFrom = from || date || new Date().toISOString().split('T')[0]
    const rangeTo   = to   || date || rangeFrom

    // Build agent filter
    let agentFilter = ''
    if (!admin) {
      agentFilter = `AND cl.agent_id = '${req.user.id}'`
    } else if (agent_id) {
      agentFilter = `AND cl.agent_id = '${agent_id}'`
    }

    // FIX: use agent_id (not sender_id) — communication_logs has agent_id column
    const { rows } = await db.query(`
      SELECT
        cl.id,
        cl.note        AS discussion,
        cl.created_at  AS called_at,
        cl.is_followup,
        l.contact_name,
        l.school_name,
        l.phone,
        l.status,
        -- Status history context for this call: the lead's status just
        -- before its most recent change, so the daily call log can show
        -- "warm → hot" style movement instead of only the identity fields.
        (SELECT lsh.from_status FROM lead_status_history lsh
           WHERE lsh.lead_id = l.id ORDER BY lsh.changed_at DESC LIMIT 1) AS previous_status,
        u.name         AS agent_name,
        l.id           AS lead_id,
        p.id           AS product_id,
        p.name         AS product_name,
        fu.next_followup_date
      FROM communication_logs cl
      JOIN leads l        ON l.id  = cl.lead_id
      LEFT JOIN users u   ON u.id  = cl.agent_id
      LEFT JOIN products p ON p.id = l.product_id
      LEFT JOIN (
        SELECT DISTINCT ON (lead_id) lead_id, next_followup_date
        FROM call_logs
        WHERE next_followup_date IS NOT NULL
        ORDER BY lead_id, called_at DESC
      ) fu ON fu.lead_id = l.id
      WHERE cl.type = 'call'
        AND DATE(cl.created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $1 AND $2
        ${agentFilter}
      ORDER BY cl.created_at DESC
    `, [rangeFrom, rangeTo])

    res.json({ success: true, data: rows, from: rangeFrom, to: rangeTo })
  } catch (err) {
    console.error('daily-calls error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Weekly comparison ── UNTOUCHED (was working) ──────────
router.get('/weekly-comparison', auth, async (req, res) => {
  try {
    const { agent_id, product_id } = req.query
    let scope = agentScope(req.user)
    if (isAdmin(req.user) && agent_id) scope = `AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`

    let rows = []
    // Try communication_logs first
    try {
      const r = await db.query(`
        SELECT
          DATE_TRUNC('week', cl.created_at)                              AS week_start,
          COUNT(DISTINCT cl.id)                                          AS total_calls,
          COUNT(DISTINCT l.id)                                           AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
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
            DATE_TRUNC('week', cl.called_at)                               AS week_start,
            COUNT(DISTINCT cl.id)                                          AS total_calls,
            COUNT(DISTINCT l.id)                                           AS leads_contacted,
            COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)   AS converted,
            COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)   AS hot,
            COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)   AS warm,
            COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)   AS new_leads
          FROM call_logs cl
          JOIN leads l ON l.id = cl.lead_id
          WHERE cl.called_at >= NOW()-INTERVAL '28 days' ${scope}
          GROUP BY DATE_TRUNC('week', cl.called_at)
          ORDER BY week_start DESC LIMIT 4
        `)
        rows = r.rows
      } catch {}
    }

    // Final fallback — lead creation dates
    if (!rows.length) {
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
        WHERE l.created_at >= NOW()-INTERVAL '28 days' ${scope}
        GROUP BY DATE_TRUNC('week', l.created_at)
        ORDER BY week_start DESC LIMIT 4
      `)
      rows = r.rows
    }

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Monthly comparison ── UNTOUCHED (was working) ─────────
router.get('/monthly-comparison', auth, async (req, res) => {
  try {
    const { agent_id, product_id } = req.query
    let scope = agentScope(req.user)
    if (isAdmin(req.user) && agent_id) scope = `AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`

    let rows = []
    try {
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', cl.created_at), 'Mon YYYY')         AS month_label,
          DATE_TRUNC('month', cl.created_at)                              AS month_start,
          COUNT(DISTINCT cl.id)                                           AS total_calls,
          COUNT(DISTINCT l.id)                                            AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)    AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)    AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)    AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)    AS new_leads
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
          WHERE cl.called_at >= NOW()-INTERVAL '90 days' ${scope}
          GROUP BY DATE_TRUNC('month', cl.called_at)
          ORDER BY month_start DESC LIMIT 3
        `)
        rows = r.rows
      } catch {}
    }

    if (!rows.length) {
      const r = await db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', l.created_at), 'Mon YYYY')           AS month_label,
          DATE_TRUNC('month', l.created_at)                                AS month_start,
          0                                                                AS total_calls,
          COUNT(DISTINCT l.id)                                             AS leads_contacted,
          COUNT(DISTINCT CASE WHEN l.status='converted' THEN l.id END)     AS converted,
          COUNT(DISTINCT CASE WHEN l.status='hot'       THEN l.id END)     AS hot,
          COUNT(DISTINCT CASE WHEN l.status='warm'      THEN l.id END)     AS warm,
          COUNT(DISTINCT CASE WHEN l.status='new'       THEN l.id END)     AS new_leads
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

// ── Call stats summary ── UNTOUCHED (was working, showing 17) ─
router.get('/call-stats', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    let r = { today: 0, this_week: 0, this_month: 0, total_all_time: 0 }
    try {
      const { rows: [row] } = await db.query(`
        SELECT
          COUNT(CASE WHEN DATE(cl.created_at) = CURRENT_DATE        THEN 1 END) AS today,
          COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '7 days'  THEN 1 END) AS this_week,
          COUNT(CASE WHEN cl.created_at >= NOW()-INTERVAL '30 days' THEN 1 END) AS this_month,
          COUNT(*) AS total_all_time
        FROM communication_logs cl JOIN leads l ON l.id = cl.lead_id
        WHERE cl.type='call' ${scope}
      `)
      r = row
    } catch {
      try {
        const { rows: [row] } = await db.query(`
          SELECT
            COUNT(CASE WHEN DATE(cl.called_at) = CURRENT_DATE        THEN 1 END) AS today,
            COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '7 days'  THEN 1 END) AS this_week,
            COUNT(CASE WHEN cl.called_at >= NOW()-INTERVAL '30 days' THEN 1 END) AS this_month,
            COUNT(*) AS total_all_time
          FROM call_logs cl JOIN leads l ON l.id = cl.lead_id WHERE 1=1 ${scope}
        `)
        r = row
      } catch {}
    }
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Pipeline ── UNTOUCHED ─────────────────────────────────
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

// ── Pending follow-ups ── UNTOUCHED ───────────────────────
router.get('/pending-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    let scope = agentScope(req.user)
    if (isAdmin(req.user) && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
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
        -- Same fix as backend/src/routes/followups.js: pick the truly
        -- latest call_logs row per lead first, filter for a non-null
        -- date after — otherwise a completed follow-up (latest row has
        -- next_followup_date = NULL) falls back to the previous overdue
        -- row and never leaves this "pending" list.
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date, cl.discussion
        FROM call_logs cl
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l    ON l.id  = latest.lead_id
      LEFT JOIN users u    ON u.id  = l.assigned_to
      LEFT JOIN products p ON p.id  = l.product_id
      WHERE l.status NOT IN ('converted','not_interested')
        AND latest.next_followup_date IS NOT NULL
        AND latest.next_followup_date BETWEEN $1 AND $2 ${scope}
      ORDER BY latest.next_followup_date ASC LIMIT 500
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Upcoming follow-ups ── UNTOUCHED ──────────────────────
router.get('/upcoming-followups', auth, async (req, res) => {
  try {
    const { from, to, agent_id, product_id, status } = req.query
    let scope = agentScope(req.user)
    if (isAdmin(req.user) && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`
    if (status)     scope += ` AND l.status = '${status}'`

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
        -- Same fix as above.
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date, cl.discussion
        FROM call_logs cl
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l    ON l.id  = latest.lead_id
      LEFT JOIN users u    ON u.id  = l.assigned_to
      LEFT JOIN products p ON p.id  = l.product_id
      WHERE latest.next_followup_date IS NOT NULL
        AND latest.next_followup_date BETWEEN $1 AND $2
        AND l.status NOT IN ('converted','not_interested') ${scope}
      ORDER BY latest.next_followup_date ASC LIMIT 500
    `, [dateFrom, dateTo])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily summary ── UNTOUCHED ────────────────────────────
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

// ── Conversion ──────────────────────────────────────────
router.get('/conversion', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { product_id, from, to } = req.query
    const prodId = product_id ? parseInt(product_id) : null

    // Build WHERE conditions (use WHERE not JOIN ON to prevent LEFT JOIN masking)
    const whereClauses = []
    if (!admin) whereClauses.push(`l.assigned_to = '${req.user.id}'`)
    if (prodId)  whereClauses.push(`l.product_id = ${prodId}`)
    const leadsWhere = (whereClauses.length ? 'AND ' + whereClauses.join(' AND ') : '') + dateRangeScope(from, to)

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
          SELECT COUNT(*) FROM communication_logs cl
          JOIN leads lc ON lc.id = cl.lead_id
          WHERE cl.agent_id = u.id AND cl.type = 'call'
            ${prodId ? `AND lc.product_id = ${prodId}` : ''}
        ), 0) AS total_calls,
        ROUND(CASE WHEN COUNT(l.id) > 0
          THEN COUNT(CASE WHEN l.status='converted' THEN 1 END)::numeric / COUNT(l.id) * 100
          ELSE 0 END, 1) AS conversion_rate
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN leads l ON l.assigned_to = u.id ${leadsWhere}
      WHERE r.name IN ('agent','admin') AND u.is_active = true
      GROUP BY u.id, u.name
      HAVING COUNT(l.id) > 0
      ORDER BY conversion_rate DESC
    `)
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('conversion error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  LEAD AGING REPORT
//  "Age" = days since the lead was created that it has sat in a
//  non-final status (new/hot/warm/cold/call_back). Also reports
//  days since last activity (call/whatsapp/email log or status update).
//  GET /api/reports/lead-aging?agent_id=&product_id=&status=&bucket=
// ══════════════════════════════════════════════════════════════
const AGING_BUCKETS = [
  { key: '0_3',   label: '0-3 days',   min: 0,  max: 3 },
  { key: '4_7',   label: '4-7 days',   min: 4,  max: 7 },
  { key: '8_14',  label: '8-14 days',  min: 8,  max: 14 },
  { key: '15_30', label: '15-30 days', min: 15, max: 30 },
  { key: '30_plus', label: '30+ days', min: 31, max: null },
]

router.get('/lead-aging', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { agent_id, product_id, status, bucket } = req.query

    const where = [`l.status NOT IN ('converted','not_interested')`]
    const params = []
    let i = 1

    if (!admin) {
      where.push(`l.assigned_to = $${i++}`)
      params.push(req.user.id)
    } else if (agent_id) {
      where.push(`l.assigned_to = $${i++}`)
      params.push(agent_id)
    }
    if (product_id) { where.push(`l.product_id = $${i++}`); params.push(parseInt(product_id)) }
    if (status)     { where.push(`l.status = $${i++}`);     params.push(status) }

    const whereStr = where.join(' AND ')

    // Per-lead aging detail, with days since creation & days since last touch
    const { rows } = await db.query(`
      SELECT
        l.id, l.school_name, l.contact_name, l.phone, l.email, l.status,
        l.lead_type, l.created_at, l.updated_at,
        u.name AS agent_name, p.name AS product_name,
        (EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 86400)::int AS age_days,
        COALESCE(
          (EXTRACT(EPOCH FROM (NOW() - GREATEST(
            l.updated_at,
            (SELECT MAX(cl.called_at) FROM call_logs cl WHERE cl.lead_id = l.id)
          ))) / 86400)::int,
          (EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 86400)::int
        ) AS days_since_last_activity
      FROM leads l
      LEFT JOIN users    u ON l.assigned_to = u.id
      LEFT JOIN products p ON l.product_id  = p.id
      WHERE ${whereStr}
      ORDER BY age_days DESC
    `, params)

    // Apply bucket filter in JS (keeps SQL simple/portable)
    let filtered = rows
    if (bucket) {
      const b = AGING_BUCKETS.find(x => x.key === bucket)
      if (b) filtered = rows.filter(r => r.age_days >= b.min && (b.max === null || r.age_days <= b.max))
    }

    // Bucket summary counts (always computed off the full unfiltered set for this scope)
    const summary = AGING_BUCKETS.map(b => ({
      key: b.key,
      label: b.label,
      count: rows.filter(r => r.age_days >= b.min && (b.max === null || r.age_days <= b.max)).length,
    }))

    // Agent-wise average age (admin view only, useful for accountability)
    const byAgent = {}
    rows.forEach(r => {
      const key = r.agent_name || 'Unassigned'
      if (!byAgent[key]) byAgent[key] = { agent_name: key, count: 0, total_age: 0 }
      byAgent[key].count++
      byAgent[key].total_age += r.age_days
    })
    const agentSummary = Object.values(byAgent)
      .map(a => ({ agent_name: a.agent_name, count: a.count, avg_age_days: Math.round(a.total_age / a.count) }))
      .sort((a, b) => b.avg_age_days - a.avg_age_days)

    res.json({
      success: true,
      data: filtered,
      total: filtered.length,
      summary,
      agent_summary: agentSummary,
      buckets: AGING_BUCKETS.map(({ key, label }) => ({ key, label })),
    })
  } catch (err) {
    console.error('lead-aging error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  LOGIN ACTIVITY REPORT (user-wise)
//  Reads from login_logs (written by routes/auth.js on every
//  login attempt). Admin sees everyone; agents see only themselves.
//  GET /api/reports/login-activity?user_id=&from=&to=&status=
// ══════════════════════════════════════════════════════════════
router.get('/login-activity', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { user_id, from, to, status } = req.query

    const where = []
    const params = []
    let i = 1

    if (!admin) {
      where.push(`ll.user_id = $${i++}`)
      params.push(req.user.id)
    } else if (user_id) {
      where.push(`ll.user_id = $${i++}`)
      params.push(user_id)
    }
    if (from)   { where.push(`ll.logged_in_at >= $${i++}`); params.push(from) }
    if (to)     { where.push(`ll.logged_in_at <  $${i++}::date + INTERVAL '1 day'`); params.push(to) }
    if (status) { where.push(`ll.status = $${i++}`); params.push(status) }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const { rows } = await db.query(`
      SELECT ll.*, u.name AS user_name, u.email AS user_email, r.name AS role_name
      FROM login_logs ll
      LEFT JOIN users u ON ll.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereStr}
      ORDER BY ll.logged_in_at DESC
      LIMIT 1000
    `, params)

    // Per-user rollup: total logins, successful, failed, last login
    const { rows: rollup } = await db.query(`
      SELECT
        u.id AS user_id, u.name AS user_name, u.email AS user_email, r.name AS role_name,
        COUNT(ll.*) FILTER (WHERE ll.status='success')                       AS total_logins,
        COUNT(ll.*) FILTER (WHERE ll.status='failed')                       AS failed_logins,
        MAX(ll.logged_in_at) FILTER (WHERE ll.status='success')             AS last_login_at,
        (SELECT ip_address FROM login_logs WHERE user_id=u.id AND status='success' ORDER BY logged_in_at DESC LIMIT 1) AS last_ip
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN login_logs ll ON ll.user_id = u.id
      ${!admin ? 'WHERE u.id = $1' : ''}
      GROUP BY u.id, u.name, u.email, r.name
      ORDER BY last_login_at DESC NULLS LAST
    `, !admin ? [req.user.id] : [])

    res.json({ success: true, data: rows, total: rows.length, rollup })
  } catch (err) {
    console.error('login-activity error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  DAILY CALL LOGS REPORT — product-wise & agent-wise
//  Defaults to "today" (IST) if no date range given.
//  GET /api/reports/call-logs-daily?from=&to=&agent_id=&product_id=
// ══════════════════════════════════════════════════════════════
router.get('/call-logs-daily', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { from, to, agent_id, product_id } = req.query

    const where = []
    const params = []
    let i = 1

    // Default to today (IST) when no explicit range is given
    if (!from && !to) {
      where.push(`(cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`)
    } else {
      if (from) { where.push(`cl.called_at >= $${i++}`); params.push(from) }
      if (to)   { where.push(`cl.called_at <  $${i++}::date + INTERVAL '1 day'`); params.push(to) }
    }

    if (!admin) {
      where.push(`cl.user_id = $${i++}`)
      params.push(req.user.id)
    } else if (agent_id) {
      where.push(`cl.user_id = $${i++}`)
      params.push(agent_id)
    }
    if (product_id) { where.push(`l.product_id = $${i++}`); params.push(parseInt(product_id)) }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const { rows: calls } = await db.query(`
      SELECT
        cl.id, cl.lead_id, cl.discussion, cl.status AS call_status,
        cl.next_followup_date, cl.called_at,
        u.id AS agent_id, u.name AS agent_name,
        p.id AS product_id, p.name AS product_name,
        COALESCE(l.contact_name, l.school_name, 'Lead') AS lead_name
      FROM call_logs cl
      JOIN leads l      ON cl.lead_id = l.id
      LEFT JOIN users u ON cl.user_id = u.id
      LEFT JOIN products p ON l.product_id = p.id
      ${whereStr}
      ORDER BY cl.called_at DESC
      LIMIT 2000
    `, params)

    const byAgent = {}
    const byProduct = {}
    calls.forEach(c => {
      const aKey = c.agent_name || 'Unassigned'
      byAgent[aKey] = byAgent[aKey] || { agent_id: c.agent_id, agent_name: aKey, call_count: 0 }
      byAgent[aKey].call_count++

      const pKey = c.product_name || 'No Product'
      byProduct[pKey] = byProduct[pKey] || { product_id: c.product_id, product_name: pKey, call_count: 0 }
      byProduct[pKey].call_count++
    })

    res.json({
      success: true,
      total: calls.length,
      calls,
      by_agent: Object.values(byAgent).sort((a, b) => b.call_count - a.call_count),
      by_product: Object.values(byProduct).sort((a, b) => b.call_count - a.call_count),
    })
  } catch (err) {
    console.error('call-logs-daily error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  STATUS CHANGE REPORT — count product-wise & agent-wise
//  Defaults to "today" (IST) if no date range given.
//  GET /api/reports/status-change?from=&to=&agent_id=&product_id=&to_status=
// ══════════════════════════════════════════════════════════════
router.get('/status-change', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { from, to, agent_id, product_id, to_status } = req.query

    const where = []
    const params = []
    let i = 1

    if (!from && !to) {
      where.push(`(h.changed_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`)
    } else {
      if (from) { where.push(`h.changed_at >= $${i++}`); params.push(from) }
      if (to)   { where.push(`h.changed_at <  $${i++}::date + INTERVAL '1 day'`); params.push(to) }
    }

    if (!admin) {
      where.push(`h.changed_by = $${i++}`)
      params.push(req.user.id)
    } else if (agent_id) {
      where.push(`h.changed_by = $${i++}`)
      params.push(agent_id)
    }
    if (product_id) { where.push(`h.product_id = $${i++}`); params.push(parseInt(product_id)) }
    if (to_status)  { where.push(`h.to_status = $${i++}`);  params.push(to_status) }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const { rows: changes } = await db.query(`
      SELECT
        h.id, h.lead_id, h.from_status, h.to_status, h.changed_at,
        u.id AS agent_id, u.name AS agent_name,
        p.id AS product_id, p.name AS product_name,
        COALESCE(l.contact_name, l.school_name, 'Lead') AS lead_name,
        l.school_name, l.phone
      FROM lead_status_history h
      LEFT JOIN users u    ON h.changed_by = u.id
      LEFT JOIN products p ON h.product_id = p.id
      LEFT JOIN leads l    ON h.lead_id = l.id
      ${whereStr}
      ORDER BY h.changed_at DESC
      LIMIT 2000
    `, params)

    const byAgent = {}
    const byProduct = {}
    const byStatus = {}
    // Overall "Old status -> New status = count" summary, and the same
    // breakdown split per agent — key on from|to (and agent|from|to) so
    // repeats of the same transition accumulate into one count instead
    // of one row per change.
    const byTransition = {}
    const byAgentTransition = {}
    changes.forEach(c => {
      const aKey = c.agent_name || 'Unknown'
      byAgent[aKey] = byAgent[aKey] || { agent_id: c.agent_id, agent_name: aKey, count: 0 }
      byAgent[aKey].count++

      const pKey = c.product_name || 'No Product'
      byProduct[pKey] = byProduct[pKey] || { product_id: c.product_id, product_name: pKey, count: 0 }
      byProduct[pKey].count++

      const sKey = c.to_status
      byStatus[sKey] = byStatus[sKey] || { to_status: sKey, count: 0 }
      byStatus[sKey].count++

      const fromLabel = c.from_status || 'new lead'
      const tKey = `${fromLabel}→${c.to_status}`
      byTransition[tKey] = byTransition[tKey] || { from_status: c.from_status, to_status: c.to_status, count: 0 }
      byTransition[tKey].count++

      const atKey = `${aKey}||${tKey}`
      byAgentTransition[atKey] = byAgentTransition[atKey] || {
        agent_id: c.agent_id, agent_name: aKey,
        from_status: c.from_status, to_status: c.to_status, count: 0,
      }
      byAgentTransition[atKey].count++
    })

    res.json({
      success: true,
      total: changes.length,
      changes,
      by_agent: Object.values(byAgent).sort((a, b) => b.count - a.count),
      by_product: Object.values(byProduct).sort((a, b) => b.count - a.count),
      by_status: Object.values(byStatus).sort((a, b) => b.count - a.count),
      by_transition: Object.values(byTransition).sort((a, b) => b.count - a.count),
      by_agent_transition: Object.values(byAgentTransition)
        .sort((a, b) => a.agent_name.localeCompare(b.agent_name) || b.count - a.count),
    })
  } catch (err) {
    console.error('status-change error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  FOLLOW-UPS COMPLETED REPORT
//  "Follow-up done" = a call_logs entry that resolves a follow-up
//  which was actually scheduled (i.e. the same lead had a prior
//  call_logs row with a next_followup_date set). Whether the agent
//  then rescheduled a new date or closed it out completely, this is
//  the report of "here's what got followed up on and when."
//  GET /api/reports/followups-completed?from=&to=&agent_id=&product_id=
// ══════════════════════════════════════════════════════════════
router.get('/followups-completed', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user)
    const { from, to, agent_id, product_id } = req.query

    const dateFrom = safeDate(from) || new Date().toISOString().split('T')[0]
    const dateTo   = safeDate(to)   || dateFrom

    let scope = ''
    if (!admin) {
      scope += ` AND o.user_id = '${req.user.id}'`
    } else if (agent_id) {
      scope += ` AND o.user_id = '${agent_id}'`
    }
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`

    const { rows } = await db.query(`
      WITH ordered AS (
        SELECT
          cl.id, cl.lead_id, cl.discussion, cl.called_at,
          cl.next_followup_date, cl.user_id,
          LAG(cl.next_followup_date) OVER (
            PARTITION BY cl.lead_id ORDER BY cl.called_at, cl.id
          ) AS prev_followup_date
        FROM call_logs cl
      )
      SELECT
        o.id, o.lead_id, o.discussion AS notes, o.called_at AS completed_at,
        o.next_followup_date,
        CASE WHEN o.next_followup_date IS NOT NULL THEN 'rescheduled' ELSE 'closed' END AS outcome,
        COALESCE(l.contact_name, l.school_name) AS school_name,
        l.contact_name, l.phone, l.status AS lead_status,
        l.product_id, p.name AS product_name,
        u.id AS agent_id, u.name AS agent_name
      FROM ordered o
      JOIN leads l          ON l.id = o.lead_id
      LEFT JOIN users u     ON u.id = o.user_id
      LEFT JOIN products p  ON p.id = l.product_id
      WHERE o.prev_followup_date IS NOT NULL
        AND o.called_at::date BETWEEN $1 AND $2
        ${scope}
      ORDER BY o.called_at DESC
      LIMIT 1000
    `, [dateFrom, dateTo])

    const byAgent = {}, byProduct = {}, byOutcome = {}
    rows.forEach(r => {
      const aKey = r.agent_name || 'Unassigned'
      byAgent[aKey] = byAgent[aKey] || { agent_id: r.agent_id, agent_name: aKey, count: 0 }
      byAgent[aKey].count++

      const pKey = r.product_name || 'No Product'
      byProduct[pKey] = byProduct[pKey] || { product_id: r.product_id, product_name: pKey, count: 0 }
      byProduct[pKey].count++

      byOutcome[r.outcome] = byOutcome[r.outcome] || { outcome: r.outcome, count: 0 }
      byOutcome[r.outcome].count++
    })

    res.json({
      success: true,
      total: rows.length,
      completed: rows,
      by_agent: Object.values(byAgent).sort((a, b) => b.count - a.count),
      by_product: Object.values(byProduct).sort((a, b) => b.count - a.count),
      by_outcome: Object.values(byOutcome).sort((a, b) => b.count - a.count),
      from: dateFrom, to: dateTo,
    })
  } catch (err) {
    console.error('followups-completed error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
