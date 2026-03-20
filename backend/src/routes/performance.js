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


// GET /api/performance/activity-score — Daily Activity Score
// Formula: (calls_today x 1) + (followups_done_today x 2) + (conversions_today x 10)
router.get('/activity-score', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'

    const { rows } = await db.query(`
      SELECT
        u.id AS agent_id,
        u.name AS agent_name,
        COALESCE(t.daily_target, 20) AS daily_target,
        -- Calls today with discussion (1 point each)
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS calls_today,
        -- Follow-ups completed today (2 points each)
        -- next_followup_date = today means agent was supposed to call, call_log exists = done
        (SELECT COUNT(DISTINCT l.id) FROM leads l
          JOIN call_logs cl ON cl.lead_id = l.id AND cl.user_id = u.id
          WHERE l.next_followup_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS followups_done_today,
        -- Conversions today (10 points each)
        (SELECT COUNT(*) FROM leads l
          WHERE l.assigned_to = u.id
          AND l.status = 'converted'
          AND (l.updated_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS conversions_today,
        -- Yesterday score for comparison
        (SELECT COUNT(*) FROM call_logs cl
          WHERE cl.user_id = u.id
          AND cl.discussion IS NOT NULL AND cl.discussion != ''
          AND (cl.called_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day'
        ) AS calls_yesterday
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN agent_targets t ON t.agent_id = u.id
      WHERE u.is_active = true AND r.name IN ('agent', 'admin')
      ${!isAdmin ? 'AND u.id = $1' : ''}
      ORDER BY u.name
    `, !isAdmin ? [req.user.id] : [])

    // Calculate scores
    const scored = rows.map(r => {
      const calls      = parseInt(r.calls_today      || 0)
      const followups  = parseInt(r.followups_done_today || 0)
      const conversions= parseInt(r.conversions_today || 0)
      const yesterday  = parseInt(r.calls_yesterday  || 0)
      const score      = (calls * 1) + (followups * 2) + (conversions * 10)
      const yday_score = (yesterday * 1) // simplified yesterday
      const target     = parseInt(r.daily_target || 20)
      const call_pct   = Math.min(Math.round((calls / target) * 100), 100)

      // Grade: A+ >=100%, A >=80%, B >=60%, C >=40%, D <40%
      const grade = call_pct >= 100 ? 'A+' : call_pct >= 80 ? 'A' : call_pct >= 60 ? 'B' : call_pct >= 40 ? 'C' : 'D'
      const grade_color = call_pct >= 100 ? '#16a34a' : call_pct >= 80 ? '#4f46e5' : call_pct >= 60 ? '#d97706' : call_pct >= 40 ? '#f59e0b' : '#dc2626'
      const trend = score > yday_score ? 'up' : score < yday_score ? 'down' : 'same'

      return { ...r, score, grade, grade_color, trend, call_pct }
    }).sort((a, b) => b.score - a.score)

    res.json({ success: true, data: scored })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
