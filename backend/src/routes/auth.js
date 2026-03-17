const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { email, password } = req.body;
    const { rows } = await db.query(
      'SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1',
      [email]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = rows[0];
    if (!user.is_active) return res.status(401).json({ success: false, message: 'Account deactivated' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role_name }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const { password: _, ...userData } = user;
    res.json({ success: true, token, user: userData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const { password: _, ...user } = req.user;
  res.json({ success: true, user });
});

// PUT /api/auth/change-password
router.put('/change-password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { currentPassword, newPassword } = req.body;
    const valid = await bcrypt.compare(currentPassword, req.user.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
