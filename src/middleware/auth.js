const jwt = require('jsonwebtoken');
const db = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1 AND u.is_active = true',
      [decoded.id]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found or inactive' });

    req.user = rows[0];
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role_name !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

module.exports = { auth, adminOnly };
