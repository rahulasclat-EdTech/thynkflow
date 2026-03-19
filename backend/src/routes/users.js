// ── INSTRUCTION ──────────────────────────────────────────────────────────────
// In backend/src/routes/users.js find the GET / route and replace it with this.
// It currently has `adminOnly` middleware — remove that so agents can also
// fetch the users list (needed for chat user selection).
//
// FIND this line in users.js:
//   router.get('/', auth, adminOnly, async (req, res) => {
// REPLACE with:
//   router.get('/', auth, async (req, res) => {
//
// The full replacement route body is below — paste it in:

router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    let rows
    if (isAdmin) {
      const result = await db.query(
        `SELECT u.id, u.name, u.email, u.role_name, u.is_active,
                u.created_at,
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
      // Agents can see basic user list for chat / dropdowns
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
