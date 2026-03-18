// backend/src/routes/chat.js
// ADD TO index.js:
//   const chatRoutes = require('./routes/chat')
//   app.use('/api/chat', chatRoutes)
//
// RUN THIS SQL IN SUPABASE FIRST:
/*
CREATE TABLE IF NOT EXISTS conversations (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(20) DEFAULT 'direct' CHECK (type IN ('direct','group','broadcast')),
  name         VARCHAR(200),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  joined_at       TIMESTAMP DEFAULT NOW(),
  last_read_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  message         TEXT,
  file_url        VARCHAR(500),
  file_name       VARCHAR(300),
  file_type       VARCHAR(100),
  file_size       INTEGER,
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv  ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_members   ON conversation_members(user_id);
*/

const express = require('express')
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

const uploadDir = path.join(__dirname, '../../uploads/chat')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.gif','.webp','.pdf','.xlsx','.xls','.docx','.doc','.txt','.csv']
    ok.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('File type not allowed'))
  }
})

// Serve uploaded files (auth protected)
router.get('/file/:filename', auth, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Not found' })
  res.sendFile(filePath)
})

// GET all my conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.type, c.name, c.created_at, c.updated_at,
        lm.message AS last_message, lm.file_name AS last_file_name,
        lm.created_at AS last_message_at, lu.name AS last_sender_name,
        cm_self.last_read_at,
        COALESCE(unread.cnt, 0) AS unread_count,
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', u.id, 'name', u.name)) AS members
      FROM conversations c
      JOIN conversation_members cm_self ON cm_self.conversation_id = c.id AND cm_self.user_id = $1
      JOIN conversation_members cm_all  ON cm_all.conversation_id  = c.id
      JOIN users u ON cm_all.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT * FROM messages WHERE conversation_id = c.id AND is_deleted = false
        ORDER BY created_at DESC LIMIT 1
      ) lm ON true
      LEFT JOIN users lu ON lm.sender_id = lu.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM messages
        WHERE conversation_id = c.id AND is_deleted = false AND created_at > cm_self.last_read_at
      ) unread ON true
      GROUP BY c.id, c.type, c.name, c.created_at, c.updated_at,
               lm.message, lm.file_name, lm.created_at, lu.name,
               cm_self.last_read_at, unread.cnt
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC
    `, [req.user.id])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Start direct chat
router.post('/conversations/direct', auth, async (req, res) => {
  try {
    const { target_user_id } = req.body
    if (!target_user_id) return res.status(400).json({ message: 'target_user_id required' })
    const { rows: ex } = await db.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
      JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
      WHERE c.type = 'direct' LIMIT 1
    `, [req.user.id, target_user_id])
    if (ex.length) return res.json({ success: true, data: { id: ex[0].id }, existing: true })
    const { rows } = await db.query(
      `INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING *`, [req.user.id])
    await db.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3)`,
      [rows[0].id, req.user.id, target_user_id])
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Create group
router.post('/conversations/group', auth, async (req, res) => {
  try {
    const { name, member_ids } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Group name required' })
    if (!Array.isArray(member_ids) || !member_ids.length) return res.status(400).json({ message: 'Add at least 1 member' })
    const { rows } = await db.query(
      `INSERT INTO conversations (type, name, created_by) VALUES ('group',$1,$2) RETURNING *`,
      [name.trim(), req.user.id])
    const all = [...new Set([req.user.id, ...member_ids])]
    for (const uid of all)
      await db.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, uid])
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Broadcast (admin only — all users)
router.post('/conversations/broadcast', auth, adminOnly, async (req, res) => {
  try {
    const name = req.body.name || `📢 Broadcast — ${new Date().toLocaleDateString('en-IN')}`
    const { rows } = await db.query(
      `INSERT INTO conversations (type, name, created_by) VALUES ('broadcast',$1,$2) RETURNING *`,
      [name, req.user.id])
    const { rows: users } = await db.query(`SELECT id FROM users WHERE is_active=true`)
    for (const u of users)
      await db.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rows[0].id, u.id])
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Get messages (with optional ?since=ISO_TIMESTAMP for polling)
router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { since } = req.query
    const { rows: m } = await db.query(
      `SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2`, [id, req.user.id])
    if (!m.length) return res.status(403).json({ message: 'Not a member' })
    const { rows } = since
      ? await db.query(`SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON m.sender_id=u.id
          WHERE m.conversation_id=$1 AND m.is_deleted=false AND m.created_at>$2 ORDER BY m.created_at ASC`, [id, since])
      : await db.query(`SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON m.sender_id=u.id
          WHERE m.conversation_id=$1 AND m.is_deleted=false ORDER BY m.created_at ASC LIMIT 100`, [id])
    await db.query(`UPDATE conversation_members SET last_read_at=NOW() WHERE conversation_id=$1 AND user_id=$2`,
      [id, req.user.id])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Send message
router.post('/conversations/:id/messages', auth, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { message } = req.body
    const { rows: m } = await db.query(
      `SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2`, [id, req.user.id])
    if (!m.length) return res.status(403).json({ message: 'Not a member' })
    if (!message?.trim() && !req.file) return res.status(400).json({ message: 'Message or file required' })
    let fileUrl=null, fileName=null, fileType=null, fileSize=null
    if (req.file) {
      fileUrl  = `/api/chat/file/${req.file.filename}`
      fileName = req.file.originalname
      fileType = req.file.mimetype
      fileSize = req.file.size
    }
    const { rows } = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, file_url, file_name, file_type, file_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, req.user.id, message?.trim()||null, fileUrl, fileName, fileType, fileSize])
    await db.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`, [id])
    res.status(201).json({ success: true, data: { ...rows[0], sender_name: req.user.name } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// Delete own message
router.delete('/messages/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE messages SET is_deleted=true WHERE id=$1 AND sender_id=$2 RETURNING id`,
      [req.params.id, req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'Not found or not yours' })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// All users for starting a chat
router.get('/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, role_name FROM users WHERE is_active=true AND id!=$1 ORDER BY name`,
      [req.user.id])
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
