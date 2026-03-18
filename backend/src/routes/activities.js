// =============================================================
//  ThynkFlow — backend/src/routes/activities.js  (NEW FILE)
//
//  ADD TO index.js:
//    const activityRoutes = require('./routes/activities');
//    app.use('/api/activities', activityRoutes);
//
//  SQL MIGRATION (run in Supabase):
/*
CREATE TABLE IF NOT EXISTS activities (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(300) NOT NULL,
  details      TEXT,
  expected_days INTEGER NOT NULL DEFAULT 1,
  due_date     DATE,
  priority     VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_assignments (
  id              SERIAL PRIMARY KEY,
  activity_id     INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','on_hold','completed')),
  completion_pct  INTEGER DEFAULT 0 CHECK (completion_pct >= 0 AND completion_pct <= 100),
  assigned_at     TIMESTAMP DEFAULT NOW(),
  completed_at    TIMESTAMP,
  UNIQUE(activity_id, agent_id)
);

CREATE TABLE IF NOT EXISTS activity_comments (
  id              SERIAL PRIMARY KEY,
  activity_id     INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES users(id),
  comment         TEXT NOT NULL,
  completion_pct  INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_assignments_agent    ON activity_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_assignments_activity ON activity_assignments(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_activity    ON activity_comments(activity_id);
*/
// =============================================================

const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

// ── auto-create tables ─────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id            SERIAL PRIMARY KEY,
      title         VARCHAR(300) NOT NULL,
      details       TEXT,
      expected_days INTEGER NOT NULL DEFAULT 1,
      due_date      DATE,
      priority      VARCHAR(20) DEFAULT 'medium',
      created_by    UUID REFERENCES users(id),
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity_assignments (
      id             SERIAL PRIMARY KEY,
      activity_id    INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      agent_id       UUID NOT NULL REFERENCES users(id),
      status         VARCHAR(20) DEFAULT 'not_started',
      completion_pct INTEGER DEFAULT 0,
      assigned_at    TIMESTAMP DEFAULT NOW(),
      completed_at   TIMESTAMP,
      UNIQUE(activity_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS activity_comments (
      id             SERIAL PRIMARY KEY,
      activity_id    INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      agent_id       UUID NOT NULL REFERENCES users(id),
      comment        TEXT NOT NULL,
      completion_pct INTEGER,
      created_at     TIMESTAMP DEFAULT NOW()
    );
  `)
}
ensureTables().catch(console.error)

// ── helpers ────────────────────────────────────────────────
const PRIORITY_ORDER = { urgent: 1, high: 2, medium: 3, low: 4 }

// ══════════════════════════════════════════════════════════
//  GET ALL ACTIVITIES
// ══════════════════════════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const agentId = req.user.id

    let query, params = []

    if (isAdmin) {
      // Admin sees all activities with assignment summary
      query = `
        SELECT
          a.*,
          u.name as created_by_name,
          COUNT(aa.id) as total_assigned,
          COUNT(CASE WHEN aa.status = 'completed' THEN 1 END) as total_completed,
          ROUND(AVG(aa.completion_pct)) as avg_completion,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'agent_id',       aa.agent_id,
              'agent_name',     u2.name,
              'status',         aa.status,
              'completion_pct', aa.completion_pct,
              'assigned_at',    aa.assigned_at,
              'completed_at',   aa.completed_at
            ) ORDER BY u2.name
          ) FILTER (WHERE aa.id IS NOT NULL) as assignments
        FROM activities a
        LEFT JOIN users u  ON a.created_by = u.id
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id
        LEFT JOIN users u2 ON aa.agent_id = u2.id
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `
    } else {
      // Agent sees only their assigned activities + self-created
      query = `
        SELECT
          a.*,
          u.name as created_by_name,
          aa.status         as my_status,
          aa.completion_pct as my_completion_pct,
          aa.assigned_at,
          aa.completed_at
        FROM activities a
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id AND aa.agent_id = $1
        WHERE aa.agent_id = $1 OR a.created_by = $1
        ORDER BY
          CASE WHEN aa.status = 'completed' THEN 1 ELSE 0 END,
          a.due_date NULLS LAST,
          a.created_at DESC
      `
      params = [agentId]
    }

    const { rows } = await db.query(query, params)
    res.json({ success: true, data: rows, is_admin: isAdmin })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  GET DASHBOARD SUMMARY
// ══════════════════════════════════════════════════════════
router.get('/dashboard', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const agentId = req.user.id

    if (isAdmin) {
      const { rows } = await db.query(`
        SELECT
          COUNT(DISTINCT a.id)                                                    as total_activities,
          COUNT(DISTINCT CASE WHEN aa.status = 'completed' THEN a.id END)        as completed,
          COUNT(DISTINCT CASE WHEN aa.status = 'in_progress' THEN a.id END)      as in_progress,
          COUNT(DISTINCT CASE WHEN aa.status = 'not_started' THEN a.id END)      as not_started,
          COUNT(DISTINCT CASE WHEN a.due_date < NOW() AND aa.status != 'completed' THEN a.id END) as overdue,
          ROUND(AVG(aa.completion_pct))                                           as avg_completion
        FROM activities a
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id
      `)

      // Per agent summary
      const { rows: agentRows } = await db.query(`
        SELECT
          u.id as agent_id,
          u.name as agent_name,
          COUNT(aa.id) as total,
          COUNT(CASE WHEN aa.status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN aa.status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN aa.status = 'not_started' THEN 1 END) as not_started,
          ROUND(AVG(aa.completion_pct)) as avg_pct
        FROM users u
        JOIN activity_assignments aa ON aa.agent_id = u.id
        GROUP BY u.id, u.name
        ORDER BY avg_pct DESC
      `)

      // Recent pending activities
      const { rows: pending } = await db.query(`
        SELECT a.id, a.title, a.due_date, a.priority,
          ROUND(AVG(aa.completion_pct)) as avg_pct,
          COUNT(aa.id) as assigned_count
        FROM activities a
        LEFT JOIN activity_assignments aa ON aa.activity_id = a.id
        WHERE aa.status != 'completed' OR aa.id IS NULL
        GROUP BY a.id
        ORDER BY a.due_date NULLS LAST
        LIMIT 5
      `)

      res.json({ success: true, data: { ...rows[0], agent_summary: agentRows, pending }, is_admin: true })
    } else {
      const { rows } = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN aa.status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN aa.status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN aa.status = 'not_started' THEN 1 END) as not_started,
          COUNT(CASE WHEN a.due_date < NOW() AND aa.status != 'completed' THEN 1 END) as overdue,
          ROUND(AVG(aa.completion_pct)) as avg_completion
        FROM activity_assignments aa
        JOIN activities a ON a.id = aa.activity_id
        WHERE aa.agent_id = $1
      `, [agentId])

      const { rows: myPending } = await db.query(`
        SELECT a.id, a.title, a.due_date, a.priority, aa.completion_pct, aa.status
        FROM activity_assignments aa
        JOIN activities a ON a.id = aa.activity_id
        WHERE aa.agent_id = $1 AND aa.status != 'completed'
        ORDER BY a.due_date NULLS LAST
        LIMIT 5
      `, [agentId])

      res.json({ success: true, data: { ...rows[0], pending: myPending }, is_admin: false })
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  CREATE ACTIVITY (admin or self-assign)
// ══════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  try {
    const { title, details, expected_days, due_date, priority, agent_ids } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' })

    const { rows } = await db.query(
      `INSERT INTO activities (title, details, expected_days, due_date, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, details || '', expected_days || 1, due_date || null,
       priority || 'medium', req.user.id]
    )
    const activity = rows[0]

    // Assign to agents
    const assignTo = agent_ids?.length ? agent_ids : [req.user.id]
    for (const agentId of assignTo) {
      await db.query(
        `INSERT INTO activity_assignments (activity_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [activity.id, agentId]
      )
    }

    res.status(201).json({ success: true, data: activity })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  UPDATE ACTIVITY (admin)
// ══════════════════════════════════════════════════════════
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, details, expected_days, due_date, priority } = req.body
    const { rows } = await db.query(
      `UPDATE activities SET title=$1, details=$2, expected_days=$3,
       due_date=$4, priority=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [title, details, expected_days, due_date || null, priority, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  DELETE ACTIVITY (admin)
// ══════════════════════════════════════════════════════════
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM activities WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  ASSIGN MORE AGENTS TO ACTIVITY
// ══════════════════════════════════════════════════════════
router.post('/:id/assign', auth, adminOnly, async (req, res) => {
  try {
    const { agent_ids } = req.body
    if (!Array.isArray(agent_ids)) return res.status(400).json({ success: false, message: 'agent_ids required' })
    for (const agentId of agent_ids) {
      await db.query(
        `INSERT INTO activity_assignments (activity_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, agentId]
      )
    }
    res.json({ success: true, message: `${agent_ids.length} agent(s) assigned` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  UPDATE PROGRESS (agent updates their own %)
// ══════════════════════════════════════════════════════════
router.patch('/:id/progress', auth, async (req, res) => {
  try {
    const { completion_pct, status, comment } = req.body
    const pct = Math.min(100, Math.max(0, parseInt(completion_pct) || 0))

    // Auto-set status based on %
    let finalStatus = status
    if (!finalStatus) {
      if (pct === 0)   finalStatus = 'not_started'
      else if (pct === 100) finalStatus = 'completed'
      else finalStatus = 'in_progress'
    }

    const { rows } = await db.query(
      `UPDATE activity_assignments
       SET completion_pct = $1,
           status         = $2,
           completed_at   = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END
       WHERE activity_id = $3 AND agent_id = $4
       RETURNING *`,
      [pct, finalStatus, req.params.id, req.user.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Assignment not found' })

    // Save comment if provided
    if (comment?.trim()) {
      await db.query(
        `INSERT INTO activity_comments (activity_id, agent_id, comment, completion_pct)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, req.user.id, comment.trim(), pct]
      )
    }

    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════
//  GET COMMENTS FOR AN ACTIVITY
// ══════════════════════════════════════════════════════════
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ac.*, u.name as agent_name
       FROM activity_comments ac
       JOIN users u ON ac.agent_id = u.id
       WHERE ac.activity_id = $1
       ORDER BY ac.created_at DESC`,
      [req.params.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
