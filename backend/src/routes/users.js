// backend/src/routes/users.js
const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router  = express.Router()

// GET /api/users — returns both active and inactive
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    let rows
    if (isAdmin) {
      const result = await db.query(`
        SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
               r.name AS role_name,
               ll.logged_in_at AS last_login
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        LEFT JOIN LATERAL (
          SELECT logged_in_at FROM login_logs
          WHERE user_id = u.id ORDER BY logged_in_at DESC LIMIT 1
        ) ll ON true
        ORDER BY u.is_active DESC, u.name
      `)
      rows = result.rows
    } else {
      const result = await db.query(`
        SELECT u.id, u.name, u.email, u.phone, r.name AS role_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true ORDER BY u.name
      `)
      rows = result.rows
    }
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /users error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/users/:id
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/users
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs')
    const { name, email, password, role_name, phone } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email, password required' })
    const { rows: roleRows } = await db.query(`SELECT id FROM roles WHERE name = $1`, [role_name || 'agent'])
    if (!roleRows.length)
      return res.status(400).json({ success: false, message: `Role '${role_name}' not found` })
    const hashed = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password, phone, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, email, phone, role_id`,
      [name, email, hashed, phone || null, roleRows[0].id]
    )
    res.status(201).json({ success: true, data: { ...rows[0], role_name: role_name || 'agent' } })
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Email already exists' })
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/users/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, role_name, is_active } = req.body
    const { rows: roleRows } = await db.query(`SELECT id FROM roles WHERE name = $1`, [role_name || 'agent'])
    const role_id = roleRows.length ? roleRows[0].id : null
    const { rows } = await db.query(
      `UPDATE users SET name=$1, email=$2, phone=$3, role_id=COALESCE($4, role_id),
       is_active=$5, updated_at=NOW() WHERE id=$6
       RETURNING id, name, email, phone, role_id, is_active`,
      [name, email, phone || null, role_id, is_active !== false, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, data: { ...rows[0], role_name } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    const bcrypt = require('bcryptjs')
    const hashed = await bcrypt.hash(new_password, 10)
    const { rows } = await db.query(
      `UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, email`,
      [hashed, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, message: `Password reset for ${rows[0].name}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/users/:id/logs
router.get('/:id/logs', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id

    // Login logs
    let loginLogs = []
    try {
      const { rows } = await db.query(
        `SELECT * FROM login_logs WHERE user_id=$1 ORDER BY logged_in_at DESC LIMIT 50`,
        [userId]
      )
      loginLogs = rows
    } catch (e) { console.error('login_logs error:', e.message) }

    // Working logs — try agent_id first, fallback to sender_id
    let workingLogs = []
    try {
      const { rows } = await db.query(
        `SELECT cl.id, cl.type, cl.note AS discussion, cl.created_at AS called_at,
                COALESCE(l.school_name, l.contact_name) AS school_name,
                l.contact_name, l.phone, p.name AS product_name, l.status
         FROM communication_logs cl
         JOIN leads l ON l.id = cl.lead_id
         LEFT JOIN products p ON p.id = l.product_id
         WHERE cl.agent_id = $1
         ORDER BY cl.created_at DESC LIMIT 100`,
        [userId]
      )
      workingLogs = rows
    } catch (e) {
      // fallback to sender_id if agent_id column doesn't exist
      try {
        const { rows } = await db.query(
          `SELECT cl.id, cl.type, cl.note AS discussion, cl.created_at AS called_at,
                  COALESCE(l.school_name, l.contact_name) AS school_name,
                  l.contact_name, l.phone, p.name AS product_name, l.status
           FROM communication_logs cl
           JOIN leads l ON l.id = cl.lead_id
           LEFT JOIN products p ON p.id = l.product_id
           WHERE cl.sender_id = $1
           ORDER BY cl.created_at DESC LIMIT 100`,
          [userId]
        )
        workingLogs = rows
      } catch (e2) { console.error('working_logs error:', e2.message) }
    }

    res.json({ success: true, data: { login_logs: loginLogs, working_logs: workingLogs } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PATCH /api/users/:id/deactivate
router.patch('/:id/deactivate', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// PATCH /api/users/:id/reactivate
router.patch('/:id/reactivate', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET is_active=true, updated_at=NOW() WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// DELETE /api/users/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
