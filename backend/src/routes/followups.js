// backend/src/routes/followups.js — FIXED v2
// Fixes vs previous version:
//   1. module.exports moved to END of file (was cutting off /debug route)
//   2. Timezone-safe date comparison using AT TIME ZONE 'Asia/Kolkata'
//   3. 'previous' section now correctly captures overdue leads (< today IST)
//   4. Added proper error logging so silent failures become visible
//   5. /debug route now actually registered (was dead code before)

const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

// IST timezone offset helper — uses DB-level timezone so Render UTC != issue
const IST_TODAY = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`

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

  // All date comparisons use IST date, not UTC date (fixes Render UTC vs IST gap)
  let dateFilter = ''
  if (section === 'today') {
    dateFilter = `AND (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date = ${IST_TODAY}`
  } else if (section === 'previous') {
    dateFilter = `AND (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date < ${IST_TODAY}`
  } else if (section === 'next_3_days') {
    dateFilter = `AND (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date > ${IST_TODAY}
                  AND (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date <= ${IST_TODAY} + INTERVAL '3 days'`
  }

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
        WHEN (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date < ${IST_TODAY}  THEN 'overdue'
        WHEN (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date = ${IST_TODAY}  THEN 'today'
        ELSE 'upcoming'
      END                           AS followup_type,
      (${IST_TODAY} - (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date)::int  AS days_overdue
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
    ORDER BY (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date ASC
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
    console.error('Followups GET / error:', err.message, err.stack)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/followups/summary ────────────────────────────
router.get('/summary', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(CASE WHEN (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date = ${IST_TODAY}              THEN 1 END) AS today,
        COUNT(CASE WHEN (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date < ${IST_TODAY}              THEN 1 END) AS overdue,
        COUNT(CASE WHEN (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date > ${IST_TODAY}
                    AND  (latest.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date <= ${IST_TODAY}+INTERVAL '3 days' THEN 1 END) AS next_3_days
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
  } catch (err) {
    console.error('Followups GET /summary error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
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
  } catch (err) {
    console.error('Followups POST / error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
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
  } catch (err) {
    console.error('Followups PATCH error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/followups/debug — verify raw data (remove in prod) ──
router.get('/debug', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: raw } = await db.query(`
      SELECT
        cl.lead_id,
        cl.next_followup_date,
        cl.called_at,
        cl.discussion,
        -- Show both UTC date and IST date so you can compare
        DATE(cl.next_followup_date)                                              AS utc_date,
        (cl.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date               AS ist_date,
        ${IST_TODAY}                                                              AS server_ist_today,
        CURRENT_DATE                                                              AS server_utc_today,
        (cl.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date = ${IST_TODAY} AS is_today_ist,
        (cl.next_followup_date AT TIME ZONE 'Asia/Kolkata')::date < ${IST_TODAY} AS is_overdue_ist,
        l.status AS lead_status, l.contact_name, l.school_name,
        u.name AS agent_name
      FROM call_logs cl
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE cl.next_followup_date IS NOT NULL ${scope}
      ORDER BY cl.next_followup_date DESC
      LIMIT 20
    `)
    res.json({
      success:      true,
      server_utc:   new Date().toISOString(),
      server_ist:   new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      data:         raw,
      count:        raw.length
    })
  } catch (err) {
    console.error('Followups GET /debug error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── MUST be at the very end ───────────────────────────────
module.exports = router
