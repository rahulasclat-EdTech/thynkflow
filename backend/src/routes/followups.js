// backend/src/routes/followups.js — FIXED v4
// Key fix: next_followup_date is DATE type, not TIMESTAMP
// Cannot use AT TIME ZONE on a DATE column — removed all timezone casting
// Simple date comparison works correctly since dates have no time component

const express = require('express')
const db      = require('../config/db')
const { auth } = require('../middleware/auth')
const router  = express.Router()

// IST date for today — cast NOW() to IST then to date
const IST_TODAY = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

// ── Schema-aware call_logs insert ─────────────────────────
async function insertCallLog(lead_id, user_id, discussion, next_followup_date) {
  const { rows: cols } = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'call_logs' AND table_schema = 'public'
  `)
  const colNames = cols.map(c => c.column_name)

  const insertCols   = ['lead_id']
  const insertVals   = [lead_id]
  const placeholders = ['$1']
  let i = 2

  if (colNames.includes('user_id')) {
    insertCols.push('user_id'); insertVals.push(user_id); placeholders.push(`$${i++}`)
  }
  insertCols.push('discussion');         insertVals.push(discussion || '');        placeholders.push(`$${i++}`)
  insertCols.push('next_followup_date'); insertVals.push(next_followup_date || null); placeholders.push(`$${i++}`)
  if (colNames.includes('status')) {
    insertCols.push('status'); insertVals.push('call_back'); placeholders.push(`$${i++}`)
  }
  if (colNames.includes('called_at')) {
    insertCols.push('called_at'); insertVals.push(new Date()); placeholders.push(`$${i++}`)
  }

  const sql = `INSERT INTO call_logs (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`
  await db.query(sql, insertVals)
}

async function getFollowups(user, section = 'all', filters = {}) {
  const scope = agentScope(user)
  const { agent_id, product_id, lead_status } = filters

  let extraScope = scope
  if (user.role_name === 'admin' && agent_id) extraScope += ` AND l.assigned_to = '${agent_id}'`
  if (product_id)  extraScope += ` AND l.product_id = ${parseInt(product_id)}`
  if (lead_status) extraScope += ` AND l.status = '${lead_status}'`

  // next_followup_date is a DATE column — compare directly against IST date
  // No AT TIME ZONE needed on the column itself (only on NOW())
  let dateFilter = ''
  if (section === 'today') {
    dateFilter = `AND latest.next_followup_date = ${IST_TODAY}`
  } else if (section === 'previous') {
    dateFilter = `AND latest.next_followup_date < ${IST_TODAY}`
  } else if (section === 'next_3_days') {
    dateFilter = `AND latest.next_followup_date > ${IST_TODAY}
                  AND latest.next_followup_date <= ${IST_TODAY} + INTERVAL '3 days'`
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
        WHEN latest.next_followup_date < ${IST_TODAY} THEN 'overdue'
        WHEN latest.next_followup_date = ${IST_TODAY} THEN 'today'
        ELSE 'upcoming'
      END AS followup_type,
      (${IST_TODAY} - latest.next_followup_date)::int AS days_overdue
    FROM (
      SELECT DISTINCT ON (cl.lead_id)
        cl.lead_id, cl.next_followup_date, cl.discussion
      FROM call_logs cl
      WHERE cl.next_followup_date IS NOT NULL
      ORDER BY cl.lead_id, cl.id DESC
    ) latest
    JOIN  leads    l ON l.id     = latest.lead_id
    LEFT JOIN users    u ON u.id = l.assigned_to
    LEFT JOIN products p ON p.id = l.product_id
    WHERE 1=1 ${dateFilter} ${extraScope}
    ORDER BY latest.next_followup_date ASC
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
        COUNT(CASE WHEN latest.next_followup_date = ${IST_TODAY}                               THEN 1 END) AS today,
        COUNT(CASE WHEN latest.next_followup_date < ${IST_TODAY}                               THEN 1 END) AS overdue,
        COUNT(CASE WHEN latest.next_followup_date > ${IST_TODAY}
                    AND latest.next_followup_date <= ${IST_TODAY} + INTERVAL '3 days'          THEN 1 END) AS next_3_days
      FROM (
        SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
        FROM call_logs cl
        WHERE cl.next_followup_date IS NOT NULL
        ORDER BY cl.lead_id, cl.id DESC
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
    if (!lead_id)        return res.status(400).json({ success: false, message: 'lead_id required' })
    if (!follow_up_date) return res.status(400).json({ success: false, message: 'follow_up_date required' })

    const { rows: leadCheck } = await db.query(`SELECT id FROM leads WHERE id = $1`, [lead_id])
    if (!leadCheck.length) return res.status(404).json({ success: false, message: 'Lead not found' })

    await insertCallLog(lead_id, req.user.id, notes || '', follow_up_date)
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Followups POST / error:', err.message, err.stack)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PATCH /api/followups/:leadId — update after call ──────
router.patch('/:leadId', auth, async (req, res) => {
  try {
    const { status, follow_up_date, notes } = req.body
    if (notes || follow_up_date) {
      await insertCallLog(req.params.leadId, req.user.id, notes || '', follow_up_date || null)
    }
    if (status) {
      await db.query(`UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.leadId])
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Followups PATCH error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/followups/schema-check ──────────────────────
router.get('/schema-check', auth, async (req, res) => {
  try {
    const { rows: cols }   = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'call_logs' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    const { rows: sample } = await db.query(`SELECT * FROM call_logs LIMIT 3`)
    const { rows: cnt }    = await db.query(`SELECT COUNT(*) AS total FROM call_logs`)
    res.json({ success: true, columns: cols, sample, total: cnt[0].total })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/followups/debug ──────────────────────────────
router.get('/debug', auth, async (req, res) => {
  try {
    const scope = agentScope(req.user)
    const { rows } = await db.query(`
      SELECT
        cl.lead_id, cl.next_followup_date, cl.discussion,
        cl.next_followup_date                AS date_value,
        ${IST_TODAY}                         AS server_ist_today,
        CURRENT_DATE                         AS server_utc_today,
        cl.next_followup_date = ${IST_TODAY} AS is_today,
        cl.next_followup_date < ${IST_TODAY} AS is_overdue,
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
      success:    true,
      server_utc: new Date().toISOString(),
      server_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      data:       rows,
      count:      rows.length
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
