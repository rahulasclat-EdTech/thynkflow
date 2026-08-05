const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════════════════════════════
//  LOGIN LOGS — self-migrating table (same pattern as other routes)
//  NOTE: routes/users.js already queries this table (GET /:id/logs,
//  and last_login on the users list) expecting a `logged_in_at`
//  column — that table was referenced but never actually created
//  anywhere in the codebase, so we create it here with that exact
//  column name to stay compatible with the existing queries.
//  Powers GET /api/reports/login-activity (user-wise login report)
// ══════════════════════════════════════════════════════════════
// CREATE TABLE IF NOT EXISTS is a no-op when the table already exists —
// so if login_logs was previously created (by an older version of this
// code, or manually) without the `status` column, that column would
// never get added and every query on ll.status would fail with
// "column ll.status does not exist". Follow up with ALTER TABLE ADD
// COLUMN IF NOT EXISTS for every column so an existing-but-incomplete
// table gets patched up to the current schema too.
async function ensureLoginLogsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id            SERIAL PRIMARY KEY,
      user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
      logged_in_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS email        VARCHAR(255)`);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS status       VARCHAR(20) NOT NULL DEFAULT 'success'`);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS reason       VARCHAR(255)`);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ip_address   VARCHAR(64)`);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS user_agent   TEXT`);
  await db.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS logged_in_at TIMESTAMP DEFAULT NOW()`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_login_logs_logged_in_at ON login_logs(logged_in_at)`);
}
ensureLoginLogsTable().catch(console.error);

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || null;
}

async function logLogin({ user_id, email, status, reason, req }) {
  try {
    await db.query(
      `INSERT INTO login_logs (user_id, email, status, reason, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user_id || null, email || null, status, reason || null, getClientIp(req), req.headers['user-agent'] || null]
    );
  } catch (err) {
    console.error('Failed to write login log:', err.message);
  }
}

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
    if (!rows.length) {
      await logLogin({ email, status: 'failed', reason: 'no_such_user', req });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!user.is_active) {
      await logLogin({ user_id: user.id, email, status: 'failed', reason: 'deactivated', req });
      return res.status(401).json({ success: false, message: 'Account deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await logLogin({ user_id: user.id, email, status: 'failed', reason: 'bad_password', req });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role_name }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    await logLogin({ user_id: user.id, email, status: 'success', req });

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
