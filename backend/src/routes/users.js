const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - list all users (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
             r.name as role_name, r.id as role_id,
             COUNT(l.id) as lead_count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN leads l ON l.assigned_to = u.id
      GROUP BY u.id, r.name, r.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/agents - list active agents (for dropdown)
router.get('/agents', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.phone
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = true AND r.name = 'agent'
      ORDER BY u.name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users - create user (admin)
router.post('/', auth, adminOnly, [
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role_id').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { name, email, password, phone, role_id } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password, phone, role_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, phone, role_id, is_active, created_at',
      [name, email, hash, phone, role_id]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id - update user
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, phone, role_id, is_active } = req.body;
    const { rows } = await db.query(
      'UPDATE users SET name=$1, phone=$2, role_id=$3, is_active=$4, updated_at=NOW() WHERE id=$5 RETURNING id, name, email, phone, role_id, is_active',
      [name, phone, role_id, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/users/:id/deactivate
router.patch('/:id/deactivate', auth, adminOnly, async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User deactivated. All historical data preserved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/users/:id/reactivate
router.patch('/:id/reactivate', auth, adminOnly, async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User reactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/roles
router.get('/roles', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM roles ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// ADD THESE TWO ROUTES to your existing backend/src/routes/users.js file
// Add them BEFORE the module.exports line at the bottom

// GET /api/users/:id/logs - get login and working logs for a user
router.get('/:id/logs', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id

    // Login logs - from login_logs table if exists, else empty
    let loginLogs = []
    try {
      const { rows } = await db.query(
        `SELECT * FROM login_logs WHERE user_id = $1 ORDER BY logged_in_at DESC LIMIT 50`,
        [userId]
      )
      loginLogs = rows
    } catch {
      // Table may not exist yet - return empty
      loginLogs = []
    }

    // Working logs - calls made by this agent
    const { rows: workingLogs } = await db.query(
      `SELECT 
        f.id, f.status, f.discussion, f.called_at,
        l.school_name, l.contact_name, l.phone,
        p.name as product_name
       FROM followups f
       JOIN leads l ON l.id = f.lead_id
       LEFT JOIN products p ON p.id = l.product_id
       WHERE f.agent_id = $1
       ORDER BY f.called_at DESC
       LIMIT 100`,
      [userId]
    )

    res.json({
      success: true,
      data: {
        login_logs: loginLogs,
        working_logs: workingLogs
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/users/:id/reset-password - admin resets password for any user
router.put('/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }

    const bcrypt = require('bcryptjs')
    const hashed = await bcrypt.hash(new_password, 10)

    const { rows } = await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, email`,
      [hashed, req.params.id]
    )

    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })

    res.json({ success: true, message: `Password reset successfully for ${rows[0].name}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})
module.exports = router;
