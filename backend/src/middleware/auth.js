const jwt = require('jsonwebtoken');
const db = require('../config/db');

// ══════════════════════════════════════════════════════════════
//  DAILY ACTIVITY TRACKING — self-migrating table (same pattern as
//  login_logs in routes/auth.js).
//
//  Why this exists: login_logs only gets a row when someone actually
//  POSTs /auth/login — but the mobile app and web admin both keep a
//  long-lived JWT (7 days) in storage, so on a normal day a user opens
//  the app and starts working WITHOUT hitting /auth/login again. The
//  Login Report then looked like most days had "no login" for anyone,
//  even though the team was actively working — because there truly is
//  no login event to show.
//
//  Fix: every authenticated request stamps a "first seen today" row
//  for that user (one row per user per IST calendar day, INSERT ON
//  CONFLICT DO NOTHING keeps this to a single cheap write attempt the
//  first time a user is seen each day). GET /api/reports/login-activity
//  then fills in any day that has activity but no real login_logs
//  row with a "record-based" login using this first-seen timestamp,
//  clearly flagged so it can be highlighted differently in the UI.
// ══════════════════════════════════════════════════════════════
async function ensureUserActivityTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_daily_activity (
      id            SERIAL PRIMARY KEY,
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL,
      first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, activity_date)
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_user_daily_activity_date ON user_daily_activity(activity_date)`);
}
ensureUserActivityTable().catch(console.error);

// Fire-and-forget — never let activity tracking slow down or fail a
// real request. IST calendar day, so it lines up with how the team
// actually thinks about "today".
function stampDailyActivity(userId) {
  db.query(
    `INSERT INTO user_daily_activity (user_id, activity_date, first_seen_at)
     VALUES ($1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, NOW())
     ON CONFLICT (user_id, activity_date) DO NOTHING`,
    [userId]
  ).catch(() => {});
}

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
    stampDailyActivity(req.user.id);
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
