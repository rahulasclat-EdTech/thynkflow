// backend/src/routes/followups.js — COMPLETE
// Data source: call_logs.next_followup_date (no separate followups table)
// Sections: today / previous (overdue) / next_3_days
// Scoped by role: agent sees only own leads, admin sees all
const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── Shared query to get latest follow-up per lead ─────────
// Returns sections: today / previous / next_3_days / all
async function getFollowups(user, section = 'all', filters = {}) {
  const scope = agentScope(user)
  const { agent_id, product_id, status, lead_status } = filters

  let extraScope = scope
  if (user.role_name === 'admin' && agent_id) extraScope += ` AND l.assigned_to = '${agent_id}'`
  if (product_id)  extraScope += ` AND l.product_id = ${parseInt(product_id)}`
  if (status)      extraScope += ` AND latest.followup_type = '${status}'`
  if (lead_status) extraScope += ` AND l.status = '${lead_status}'`

  let dateFilter = ''
  if (section === 'today') {
    dateFilter = `AND latest.next_followup_date = CURRENT_DATE`
  } else if (section === 'previous') {
    dateFilter = `AND latest.next_followup_date < CURRENT_DATE`
  } else if (section === 'next_3_days') {
    dateFilter = `AND latest.next_followup_date > CURRENT_DATE AND latest.next_followup_date <= CURRENT_DATE + INTERVAL '3 days'`
  }

  const { rows } = await db.query(`
    SELECT
      latest.lead_id              AS id,
      latest.lead_id,
      latest.next_followup_date   AS follow_up_date,
      latest.discussion           AS notes,
      COALESCE(l.contact_name, l.school_name) AS lead_name,
      l.contact_name,
      l.school_name,
      l.phone,
      l.email,
      l.status                    AS lead_status,
      l.assigned_to,
      l.product_id,
      p.name                      AS product_name,
      u.name                      AS agent_name,
      CASE
        WHEN latest.next_followup_date < CURRENT_DATE THEN 'overdue'
        WHEN latest.next_followup_date = CURRENT_DATE THEN 'today'
        ELSE 'upcoming'
      END                         AS followup_type,
      EXTRACT(DAY FROM CURRENT_DATE - latest.next_followup_date)::int AS days_overdue
    FROM (
      SELECT DISTINCT ON (cl.lead_id)
        cl.lead_id,
        cl.next_followup_date,
        cl.discussion
      FROM call_logs cl
      WHERE cl.next_followup_date IS NOT NULL
      ORDER BY cl.lead_id, cl.called_at DESC
    ) latest
    JOIN leads l  ON l.id = latest.lead_id
    LEFT JOIN users    u ON l.assigned_to = u.id
    LEFT JOIN products p ON l.product_id  = p.id
    WHERE l.status NOT IN ('converted', 'not_interested')
      ${dateFilter}
      ${extraScope}
    ORDER BY latest.next_followup_date ASC
    LIMIT 500
  `)
  return rows
}

// ── GET /api/followups — returns all 3 sections together ──
// ?section=today|previous|next_3_days|all
// ?agent_id= &product_id= &lead_status= &status=overdue|today|upcoming
router.get('/', auth, async (req, res) => {
  try {
    const { section = 'all', agent_id, product_id, lead_status, status } = req.query
    const filters = { agent_id, product_id, lead_status, status }

    if (section !== 'all') {
      const rows = await getFollowups(req.user, section, filters)
      return res.json({ success: true, data: rows, total: rows.length })
    }

    // Return all 3 sections in one call
    const [today, previous, next3] = await Promise.all([
      getFollowups(req.user, 'today', filters),
      getFollowups(req.user, 'previous', filters),
      getFollowups(req.user, 'next_3_days', filters),
    ])

    res.json({
      success: true,
      data: {
        today,
        previous,
        next_3_days: next3,
      },
      counts: {
        today:       today.length,
        previous:    previous.length,
        next_3_days: next3.length,
        total:       today.length + previous.length + next3.length,
      }
    })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/followups/summary — counts only (for dashboard) ─
router.get('/summary', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows: [r] } = await db.query(`
      SELECT
        COUNT(CASE WHEN latest.next_followup_date = CURRENT_DATE THEN 1 END)                          AS today,
        COUNT(CASE WHEN latest.next_followup_date < CURRENT_DATE THEN 1 END)                          AS overdue,
        COUNT(CASE WHEN latest.next_followup_date > CURRENT_DATE
                    AND latest.next_followup_date <= CURRENT_DATE + INTERVAL '3 days' THEN 1 END)     AS next_3_days
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
        FROM call_logs cl WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, cl.called_at DESC
      ) latest
      JOIN leads l ON l.id = latest.lead_id
      WHERE l.status NOT IN ('converted','not_interested') ${scope}
    `)
    res.json({ success: true, data: r })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── PATCH /api/followups/:leadId — mark done / update ─────
router.patch('/:leadId', auth, async (req, res) => {
  try {
    const { status, follow_up_date, notes } = req.body
    // Log as a call update
    if (notes) {
      await db.query(
        `INSERT INTO call_logs (lead_id, user_id, discussion, next_followup_date, called_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.params.leadId, req.user.id, notes || '', follow_up_date || null]
      ).catch(() => {})
    }
    // Update lead status if provided
    if (status) {
      await db.query(
        `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, req.params.leadId]
      )
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── POST /api/followups — create/schedule a follow-up ─────
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

module.exports = router
