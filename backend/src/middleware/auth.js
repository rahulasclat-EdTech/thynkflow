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

// cronAuth — lets an external scheduler (cron-job.org, GitHub Actions, etc.)
// trigger a route with a shared secret instead of a logged-in admin's JWT.
// Needed on Vercel, where in-process setInterval schedulers don't survive
// between serverless invocations. Set CRON_SECRET in your environment and
// send it back as the `x-cron-secret` header.
const cronAuth = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  if (secret && provided && provided === secret) return next();
  return auth(req, res, () => adminOnly(req, res, next));
};

module.exports = { auth, adminOnly, cronAuth };
