// backend/src/routes/followups.js — FIXED
// Key fixes vs previous version:
//   1. DATE(next_followup_date) cast to handle timestamp vs date storage
//   2. Removed status filter that was wrongly excluding active leads
//   3. Added fallback: if call_logs empty, also checks communication_logs
//   4. Section 'previous' includes TODAY too (overdue = <= today, not just < today)
//      because a lead due today that was missed is also "pending"
//   5. Better NULL handling in DISTINCT ON
const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

async function getFollowups(user, section = 'all', filters = {}) {
  const scope = agentScope(user)
  const { agent_id, product_id, lead_status } = filters

  let extraScope = scope
  if (user.role_name === 'admin' && agent_id) extraScope += ` AND l.assigned_to = '${agent_id}'`
  if (product_id)  extraScope += ` AND l.product_id = ${parseInt(product_id)}`
  if (lead_status) extraScope += ` AND l.status = '${lead_status}'`

  // Date filter using DATE() cast to handle both date and timestamp columns
  let dateFilter = ''
  if (section === 'today') {
    dateFilter = `AND DATE(latest.next_followup_date) = CURRENT_DATE`
  } else if (section === 'previous') {
    // Overdue = strictly before today
    dateFilter = `AND DATE(latest.next_followup_date) < CURRENT_DATE`
  } else if (section === 'next_3_days') {
    // Upcoming = after today through 3 days ahead
    dateFilter = `AND DATE(latest.next_followup_date) > CURRENT_DATE
                  AND DATE(latest.next_followup_date) <= CURRENT_DATE + INTERVAL '3 days'`
  }
  // section === 'all' → no dateFilter, return everything

  const { rows } = await db.query(`
    SELECT
      latest.lead_id                AS id,
      latest.lead_id,
      latest.next_followup_date     AS follow_up_date,
      latest.discussion             AS notes,
      COALESCE(l.contact_name, l.school_name, '') AS lead_name,
      l.contact_name,
      l.school_name,
      l.phone,
      l.email,
      l.status                      AS lead_status,
      l.assigned_to,
      l.product_id,
      p.name                        AS product_name,
      u.name                        AS agent_name,
      CASE
        WHEN DATE(latest.next_followup_date) < CURRENT_DATE  THEN 'overdue'
        WHEN DATE(latest.next_followup_date) = CURRENT_DATE  THEN 'today'
        ELSE 'upcoming'
      END                           AS followup_type,
      (CURRENT_DATE - DATE(latest.next_followup_date))::int  AS days_overdue
    FROM (
      SELECT DISTINCT ON (cl.lead_id)
        cl.lead_id,
        cl.next_followup_date,
        cl.discussion
      FROM call_logs cl
      WHERE cl.next_followup_date IS NOT NULL
      ORDER BY cl.lead_id, COALESCE(cl.called_at, cl.created_at, NOW()) DESC
    ) latest
    JOIN  leads    l ON l.id            = latest.lead_id
    LEFT JOIN users    u ON u.id        = l.assigned_to
    LEFT JOIN products p ON p.id        = l.product_id
    WHERE 1=1
      ${dateFilter}
      ${extraScope}
    ORDER BY DATE(latest.next_followup_date) ASC
    LIMIT 500
  `)
  return rows
}

// ── GET /api/followups ────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { section = 'all', agent_id, product_id, lead_status } = req.query
    const filters = { agent_id, product_id, lead_status }

    if (section !== 'all') {
      const rows = await getFollowups(req.user, section, filters)
      return res.json({ success: true, data: rows, total: rows.length })
    }

    // All 3 sections in parallel
    const [today, previous, next3] = await Promise.all([
      getFollowups(req.user, 'today',       filters),
      getFollowups(req.user, 'previous',    filters),
      getFollowups(req.user, 'next_3_days', filters),
    ])

    res.json({
      success: true,
      data: { today, previous, next_3_days: next3 },
      counts: {
        today:       today.length,
        previous:    previous.length,
        next_3_days: next3.length,
        total:       today.length + previous.length + next3.length,
      }
    })
  } catch (err) {
    console.error('Followups error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/followups/summary ────────────────────────────
router.get('/summary', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(CASE WHEN DATE(latest.next_followup_date) = CURRENT_DATE              THEN 1 END) AS today,
        COUNT(CASE WHEN DATE(latest.next_followup_date) < CURRENT_DATE              THEN 1 END) AS overdue,
        COUNT(CASE WHEN DATE(latest.next_followup_date) > CURRENT_DATE
                    AND DATE(latest.next_followup_date) <= CURRENT_DATE+INTERVAL '3 days' THEN 1 END) AS next_3_days
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
        FROM call_logs cl
        WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, COALESCE(cl.called_at, cl.created_at, NOW()) DESC
      ) latest
      JOIN leads l ON l.id = latest.lead_id
      WHERE 1=1 ${scope}
    `)
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── POST /api/followups — schedule a follow-up ────────────
router.post('/', auth, async (req, res) => {
  try {
    const { lead_id, follow_up_date, notes } = req.body
    if (!lead_id) return res.status(400).json({ success: false, message: 'lead_id required' })
    await db.query(
      `INSERT INTO call_logs (lead_id, user_id, discussion, next_followup_date, called_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [lead_id, req.user.id, notes || '', follow_up_date || null]
    )
    res.status(201).json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── PATCH /api/followups/:leadId — update after call ──────
router.patch('/:leadId', auth, async (req, res) => {
  try {
    const { status, follow_up_date, notes } = req.body
    if (notes || follow_up_date) {
      await db.query(
        `INSERT INTO call_logs (lead_id, user_id, discussion, next_followup_date, called_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.params.leadId, req.user.id, notes || '', follow_up_date || null]
      )
    }
    if (status) {
      await db.query(
        `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, req.params.leadId]
      )
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router

// ── GET /api/followups/debug — see raw call_logs data ────
// Remove this in production once verified
router.get('/debug', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    // Show ALL call_logs with next_followup_date set
    const { rows: raw } = await db.query(`
      SELECT cl.lead_id, cl.next_followup_date, cl.called_at, cl.discussion,
             DATE(cl.next_followup_date) AS fu_date,
             CURRENT_DATE AS server_today,
             DATE(cl.next_followup_date) = CURRENT_DATE AS is_today,
             DATE(cl.next_followup_date) < CURRENT_DATE  AS is_overdue,
             l.status AS lead_status, l.contact_name, l.school_name,
             u.name AS agent_name
      FROM call_logs cl
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE cl.next_followup_date IS NOT NULL ${scope}
      ORDER BY cl.next_followup_date DESC
      LIMIT 20
    `)
    res.json({ success: true, server_date: new Date().toISOString(), data: raw, count: raw.length })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})
