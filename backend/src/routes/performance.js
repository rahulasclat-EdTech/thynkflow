// backend/src/routes/performance.js
// Daily Call Targets + Agent Leaderboard
//
// ADD TO index.js:
//   const performanceRoutes = require('./routes/performance')
//   app.use('/api/performance', performanceRoutes)
//
// SQL - run in Supabase:
/*
CREATE TABLE IF NOT EXISTS agent_targets (
  id         SERIAL PRIMARY KEY,
  agent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_target INTEGER NOT NULL DEFAULT 20,
  set_by     UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id)
);
*/

const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router  = express.Router()

// Auto-create table
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

// ── GET /api/performance/targets — all agent targets (admin)
router.get('/targets', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email,
             COALESCE(t.daily_target, 20) AS daily_target,
             t.updated_at,
             su.name AS set_by_name
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

// ── PUT /api/performance/targets/:agentId — set target (admin)
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

// ── GET /api/performance/today — today's stats for all agents
router.get('/today', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'

    // Calls today = call_logs with discussion filled, called_at = today IST
    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        COUNT(cl.id) FILTER (
          WHERE cl.called_at::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
        ) AS calls_today,
        COUNT(cl.id) FILTER (
          WHERE cl.called_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
        ) AS calls_this_month,
        COUNT(DISTINCT l.id) FILTER (
          WHERE l.status = 'converted'
          AND l.updated_at::date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '30 days'
        ) AS conversions_month,
        COUNT(DISTINCT l.id) AS total_leads
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      LEFT JOIN call_logs cl ON cl.user_id = u.id
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.is_active = true AND r.name IN ('agent', 'admin')
      ${!isAdmin ? 'AND u.id = $1' : ''}
      GROUP BY u.id, u.name, t.daily_target
      ORDER BY calls_today DESC
    `, !isAdmin ? [req.user.id] : [])

    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/performance/leaderboard — weekly & monthly leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'

    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        -- Weekly calls (Mon-Sun)
        COUNT(cl.id) FILTER (
          WHERE cl.called_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Kolkata')
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
        ) AS calls_week,
        -- Monthly calls
        COUNT(cl.id) FILTER (
          WHERE cl.called_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
        ) AS calls_month,
        -- Conversions this month
        COUNT(DISTINCT l2.id) FILTER (
          WHERE l2.status = 'converted'
        ) AS conversions_month,
        -- Total leads assigned
        COUNT(DISTINCT l.id) AS total_leads,
        -- Daily target
        COALESCE(t.daily_target, 20) AS daily_target,
        -- Today's calls
        COUNT(cl.id) FILTER (
          WHERE cl.called_at::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
        ) AS calls_today,
        -- Earnings this month (only shown to admin or self)
        CASE WHEN $1 = true OR u.id = $2
          THEN COALESCE(SUM(DISTINCT p.per_closure_earning) FILTER (WHERE l2.status = 'converted'), 0)
          ELSE NULL
        END AS earnings_month
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      LEFT JOIN call_logs cl ON cl.user_id = u.id
      LEFT JOIN leads l ON l.assigned_to = u.id
      LEFT JOIN leads l2 ON l2.assigned_to = u.id
      LEFT JOIN products p ON p.id = l2.product_id
      WHERE u.is_active = true AND r.name IN ('agent', 'admin')
      GROUP BY u.id, u.name, t.daily_target
      ORDER BY calls_month DESC
    `, [isAdmin, req.user.id])

    // Add rank
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))
    res.json({ success: true, data: ranked })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── GET /api/performance/my — current agent's own stats
router.get('/my', auth, async (req, res) => {
  try {
    // Last 30 days daily breakdown
    const { rows: daily } = await db.query(`
      SELECT
        (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date AS date,
        COUNT(cl.id) AS calls,
        COALESCE(t.daily_target, 20) AS target
      FROM call_logs cl
      LEFT JOIN agent_targets t ON t.agent_id = $1
      WHERE cl.user_id = $1
        AND cl.discussion IS NOT NULL AND cl.discussion != ''
        AND cl.called_at >= NOW() - INTERVAL '30 days'
      GROUP BY (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date, t.daily_target
      ORDER BY date DESC
    `, [req.user.id])

    // Streak — consecutive days hitting target
    let streak = 0
    const today = new Date().toISOString().split('T')[0]
    for (const day of daily) {
      if (parseInt(day.calls) >= parseInt(day.target)) streak++
      else break
    }

    res.json({ success: true, data: { daily, streak } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
