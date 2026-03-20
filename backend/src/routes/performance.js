// backend/src/routes/performance.js
// ADD TO index.js:
//   const performanceRoutes = require('./routes/performance')
//   app.use('/api/performance', performanceRoutes)

const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router  = express.Router()

// Auto-create agent_targets table
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

// GET /api/performance/targets  (admin only)
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
      WHERE u.is_active = true AND u.role_name = 'agent'
      ORDER BY u.name
    `)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/performance/targets/:agentId  (admin only)
router.put('/targets/:agentId', auth, adminOnly, async (req, res) => {
  try {
    const { daily_target } = req.body
    if (!daily_target || isNaN(daily_target) || parseInt(daily_target) < 1)
      return res.status(400).json({ success: false, message: 'Valid daily_target required' })
    const { rows } = await db.query(`
      INSERT INTO agent_targets (agent_id, daily_target, set_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (agent_id) DO UPDATE
        SET daily_target = $2, set_by = $3, updated_at = NOW()
      RETURNING *
    `, [req.params.agentId, parseInt(daily_target), req.user.id])
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/performance/today
router.get('/today', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const query = `
      SELECT
        u.id   AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_this_month,
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id
            AND l.status = 'converted'
            AND (l.updated_at AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS conversions_month,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS total_leads
      FROM users u
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true
        AND u.role_name IN ('agent', 'admin')
        ${!isAdmin ? 'AND u.id = $1' : ''}
      ORDER BY calls_today DESC
    `
    const { rows } = await db.query(query, !isAdmin ? [req.user.id] : [])
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('today error:', err.message, err.detail || '')
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/performance/leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const { rows } = await db.query(`
      SELECT
        u.id   AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_week,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS calls_month,
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id
            AND l.status = 'converted'
            AND (l.updated_at AT TIME ZONE 'Asia/Kolkata')
                >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        ) AS conversions_month,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS total_leads,
        CASE WHEN $1::boolean = true OR u.id = $2 THEN (
            SELECT COALESCE(SUM(p.per_closure_earning), 0)
            FROM leads l JOIN products p ON p.id = l.product_id
            WHERE l.assigned_to = u.id AND l.status = 'converted'
              AND (l.updated_at AT TIME ZONE 'Asia/Kolkata')
                  >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')
          ) ELSE NULL END AS earnings_month
      FROM users u
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true AND u.role_name IN ('agent', 'admin')
      ORDER BY calls_month DESC
    `, [isAdmin.toString(), req.user.id])
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))
    res.json({ success: true, data: ranked })
  } catch (err) {
    console.error('leaderboard error:', err.message, err.detail || '')
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/performance/my
router.get('/my', auth, async (req, res) => {
  try {
    const { rows: daily } = await db.query(`
      SELECT
        (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date AS date,
        COUNT(cl.id) AS calls,
        COALESCE(t.daily_target, 20) AS target
      FROM communication_logs cl
      LEFT JOIN agent_targets t ON t.agent_id = $1
      WHERE COALESCE(cl.sender_id, cl.agent_id) = $1
        AND cl.type = 'call'
        AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')
            >= (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '30 days'
      GROUP BY (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date, t.daily_target
      ORDER BY date DESC
    `, [req.user.id])
    let streak = 0
    for (const day of daily) {
      if (parseInt(day.calls) >= parseInt(day.target)) streak++
      else break
    }
    res.json({ success: true, data: { daily, streak } })
  } catch (err) {
    console.error('my error:', err.message, err.detail || '')
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/performance/activity-score
router.get('/activity-score', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const query = `
      SELECT
        u.id   AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        (SELECT COUNT(DISTINCT l.id) FROM leads l
          JOIN communication_logs cl ON cl.lead_id = l.id AND COALESCE(cl.sender_id, cl.agent_id) = u.id
          WHERE l.next_followup_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS followups_done_today,
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id AND l.status = 'converted'
            AND (l.updated_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS conversions_today,
        (SELECT COUNT(*) FROM communication_logs cl
          WHERE COALESCE(cl.sender_id, cl.agent_id) = u.id
            AND cl.type = 'call'
            AND (cl.created_at AT TIME ZONE 'Asia/Kolkata')::date
                = (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day'
        ) AS calls_yesterday
      FROM users u
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true
        AND u.role_name IN ('agent', 'admin')
        ${!isAdmin ? 'AND u.id = $1' : ''}
      ORDER BY u.name
    `
    const { rows } = await db.query(query, !isAdmin ? [req.user.id] : [])
    const scored = rows.map(r => {
      const calls       = parseInt(r.calls_today         || 0)
      const followups   = parseInt(r.followups_done_today || 0)
      const conversions = parseInt(r.conversions_today    || 0)
      const yesterday   = parseInt(r.calls_yesterday      || 0)
      const target      = parseInt(r.daily_target         || 20)
      const score       = (calls * 1) + (followups * 2) + (conversions * 10)
      const call_pct    = Math.min(Math.round((calls / target) * 100), 100)
      const grade       = call_pct >= 100 ? 'A+' : call_pct >= 80 ? 'A' : call_pct >= 60 ? 'B' : call_pct >= 40 ? 'C' : 'D'
      const grade_color = call_pct >= 100 ? '#16a34a' : call_pct >= 80 ? '#4f46e5' : call_pct >= 60 ? '#d97706' : call_pct >= 40 ? '#f59e0b' : '#dc2626'
      const trend       = score > yesterday ? 'up' : score < yesterday ? 'down' : 'same'
      return { ...r, calls_today: calls, followups_done_today: followups, conversions_today: conversions, score, grade, grade_color, trend, call_pct }
    }).sort((a, b) => b.score - a.score)
    res.json({ success: true, data: scored })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
