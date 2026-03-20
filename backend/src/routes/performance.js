// backend/src/routes/performance.js
const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router  = express.Router()

db.query(`
  CREATE TABLE IF NOT EXISTS agent_targets (
    id           SERIAL PRIMARY KEY,
    agent_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_target INTEGER NOT NULL DEFAULT 20,
    set_by       UUID REFERENCES users(id),
    updated_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id)
  );
`).catch(err => console.error('agent_targets table error:', err.message))

// GET /api/performance/targets
router.get('/targets', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email,
             COALESCE(t.daily_target, 20) AS daily_target,
             t.updated_at, su.name AS set_by_name
      FROM users u
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      LEFT JOIN users su ON su.id = t.set_by
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = true AND r.name = 'agent'
      ORDER BY u.name
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// PUT /api/performance/targets/:agentId
router.put('/targets/:agentId', auth, adminOnly, async (req, res) => {
  try {
    const { daily_target } = req.body
    if (!daily_target || isNaN(daily_target) || daily_target < 1)
      return res.status(400).json({ success: false, message: 'Valid daily_target required' })
    const { rows } = await db.query(`
      INSERT INTO agent_targets (agent_id, daily_target, set_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (agent_id) DO UPDATE
      SET daily_target = $2, set_by = $3, updated_at = NOW()
      RETURNING *
    `, [req.params.agentId, parseInt(daily_target), req.user.id])
    res.json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/performance/today
router.get('/today', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'

    // Use subqueries to avoid JOIN multiplication
    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        -- calls today IST (subquery)
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        -- calls this month IST (subquery)
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_this_month,
        -- conversions this month (subquery)
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id
          AND l.status = 'converted'
          AND (l.updated_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS conversions_month,
        -- total leads
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS total_leads
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true AND r.name IN ('agent', 'admin')
      ${!isAdmin ? 'AND u.id = $1' : ''}
      ORDER BY calls_today DESC
    `, !isAdmin ? [req.user.id] : [])

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/performance/leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'

    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        -- calls today IST
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        -- calls this week IST
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_week,
        -- calls this month IST
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_month,
        -- conversions this month
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id
          AND l.status = 'converted'
          AND (l.updated_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS conversions_month,
        -- total leads
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS total_leads,
        -- earnings this month (only for admin or self)
        CASE WHEN $1 = true OR u.id = $2
          THEN (
            SELECT COALESCE(SUM(p.per_closure_earning), 0)
            FROM leads l
            JOIN products p ON p.id = l.product_id
            WHERE l.assigned_to = u.id
            AND l.status = 'converted'
            AND (l.updated_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
          )
          ELSE NULL
        END AS earnings_month
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true AND r.name IN ('agent', 'admin')
      ORDER BY calls_month DESC
    `, [isAdmin, req.user.id])

    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))
    res.json({ success: true, data: ranked })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/performance/my
router.get('/my', auth, async (req, res) => {
  try {
    const { rows: daily } = await db.query(`
      SELECT
        (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date AS date,
        COUNT(cl.id) AS calls,
        COALESCE(t.daily_target, 20) AS target
      FROM call_logs cl
      LEFT JOIN agent_targets t ON t.agent_id = $1
      WHERE cl.user_id = $1
        AND cl.discussion IS NOT NULL AND cl.discussion != ''
        AND (cl.called_at AT TIME ZONE 'Asia/Kolkata') >= (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '30 days'
      GROUP BY (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date, t.daily_target
      ORDER BY date DESC
    `, [req.user.id])

    // Streak
    let streak = 0
    for (const day of daily) {
      if (parseInt(day.calls) >= parseInt(day.target)) streak++
      else break
    }

    res.json({ success: true, data: { daily, streak } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
