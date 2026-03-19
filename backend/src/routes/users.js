// backend/src/routes/users.js — COMPLETE FILE (full replacement)
const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

// ── GET /api/users — ALL roles can call this ──────────────
// Agents need it for chat user selection + assignment dropdowns
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    let rows
    if (isAdmin) {
      const result = await db.query(
        `SELECT u.id, u.name, u.email, u.role_name, u.is_active, u.created_at,
                ll.logged_in_at AS last_login
         FROM users u
         LEFT JOIN LATERAL (
           SELECT logged_in_at FROM login_logs
           WHERE user_id = u.id ORDER BY logged_in_at DESC LIMIT 1
         ) ll ON true
         WHERE u.is_active = true
         ORDER BY u.name`
      )
      rows = result.rows
    } else {
      const result = await db.query(
        `SELECT id, name, email, role_name
         FROM users WHERE is_active = true ORDER BY name`
      )
      rows = result.rows
    }
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/users/:id — single user (admin only) ─────────
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role_name, u.is_active, u.created_at
       FROM users u WHERE u.id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/users — create user (admin only) ────────────
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs')
    const { name, email, password, role_name } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email, password required' })
    const hashed = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role_name, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id, name, email, role_name`,
      [name, email, hashed, role_name || 'agent']
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Email already exists' })
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PUT /api/users/:id — update user (admin only) ─────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role_name, is_active } = req.body
    const { rows } = await db.query(
      `UPDATE users SET name=$1, email=$2, role_name=$3, is_active=$4 WHERE id=$5
       RETURNING id, name, email, role_name, is_active`,
      [name, email, role_name, is_active !== false, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PUT /api/users/:id/reset-password (admin only) ────────
router.put('/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    const bcrypt = require('bcryptjs')
    const hashed = await bcrypt.hash(new_password, 10)
    const { rows } = await db.query(
      `UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id, name, email`,
      [hashed, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    res.json({ success: true, message: `Password reset for ${rows[0].name}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/users/:id/logs (admin only) ──────────────────
router.get('/:id/logs', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id
    let loginLogs = []
    try {
      const { rows } = await db.query(
        `SELECT * FROM login_logs WHERE user_id=$1 ORDER BY logged_in_at DESC LIMIT 50`,
        [userId]
      )
      loginLogs = rows
    } catch { loginLogs = [] }

    let workingLogs = []
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
    } catch { workingLogs = [] }

    res.json({ success: true, data: { login_logs: loginLogs, working_logs: workingLogs } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── DELETE /api/users/:id — deactivate (admin only) ───────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE users SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
