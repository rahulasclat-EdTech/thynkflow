// backend/src/routes/emails.js
// SMTP now reads from DB via integrations.js (falls back to env vars)
const express    = require('express')
const nodemailer = require('nodemailer')
const db         = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const { buildTransporter, getFromAddress, getSendMeta } = require('./integrations')

const router = express.Router()

// DB-driven — reads from app_config table, falls back to env vars
const createTransporter = buildTransporter

function fillTemplate(text, vars = {}) {
  return text
    .replace(/{{lead_name}}/g,   vars.lead_name   || 'there')
    .replace(/{{agent_name}}/g,  vars.agent_name  || 'Team ThynkFlow')
    .replace(/{{agent_phone}}/g, vars.agent_phone || '')
    .replace(/{{product}}/g,     vars.product     || '')
    .replace(/{{company}}/g,     vars.company     || 'ThynkSuccess')
}

/**
 * When sending through Amazon SES with a Configuration Set, this header tells
 * SES to route Send/Delivery/Bounce/Complaint/Open/Click events to whatever
 * SNS topic that configuration set is wired to (see routes/webhooks.js).
 * No-op for plain SMTP.
 */
function sesHeaders(sendMeta) {
  return sendMeta.provider === 'ses' && sendMeta.configurationSet
    ? { 'X-SES-CONFIGURATION-SET': sendMeta.configurationSet }
    : undefined
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id           SERIAL PRIMARY KEY,
      lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
      agent_id     UUID REFERENCES users(id),
      to_email     VARCHAR(255) NOT NULL,
      to_name      VARCHAR(255),
      subject      VARCHAR(500) NOT NULL,
      body         TEXT NOT NULL,
      template_id  INTEGER,
      status       VARCHAR(20) DEFAULT 'sent',
      error_msg    TEXT,
      sent_at      TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS email_templates (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(200) NOT NULL,
      subject     VARCHAR(500) NOT NULL,
      body        TEXT NOT NULL,
      category    VARCHAR(50) DEFAULT 'general',
      is_active   BOOLEAN DEFAULT true,
      created_by  UUID REFERENCES users(id),
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `)

  // Engagement-tracking columns (SES delivery/bounce/open/click events land here
  // via /api/webhooks/ses). Added as a migration so existing installs upgrade cleanly.
  await db.query(`
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS ses_message_id VARCHAR(255);
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMP;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS opened_at      TIMESTAMP;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS open_count     INTEGER DEFAULT 0;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS clicked_at     TIMESTAMP;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS click_count    INTEGER DEFAULT 0;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS bounced_at     TIMESTAMP;
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS bounce_type    VARCHAR(50);
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS bounce_subtype VARCHAR(50);
    ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS complained_at  TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_email_logs_ses_message_id ON email_logs (ses_message_id);
  `)

  const { rows } = await db.query('SELECT COUNT(*) FROM email_templates')
  if (parseInt(rows[0].count) === 0) {
    await db.query(`
      INSERT INTO email_templates (name, subject, body, category) VALUES
      ('Introduction / First Contact',
       'Following up on your enquiry — {{lead_name}}',
       E'Dear {{lead_name}},\n\nThank you for your interest in our programs. My name is {{agent_name}}.\n\nI would love to connect with you for a quick call.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'introduction'),
      ('Follow-up Reminder',
       'Just checking in — {{lead_name}}',
       E'Dear {{lead_name}},\n\nI hope you are doing well. I wanted to follow up on our previous conversation.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'followup'),
      ('Proposal Sent',
       'Your personalised proposal — {{lead_name}}',
       E'Dear {{lead_name}},\n\nAs discussed, please find our personalised proposal for you.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'proposal'),
      ('Thank You',
       'Thank you for choosing ThynkSuccess — {{lead_name}}',
       E'Dear {{lead_name}},\n\nThank you for choosing ThynkSuccess! We are thrilled to have you on board.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'thankyou')
    `)
  }
}
ensureTables().catch(console.error)

// GET /api/emails/templates
router.get('/templates', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM email_templates WHERE is_active=true ORDER BY category, name`)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/emails/templates
router.post('/templates', auth, adminOnly, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body
    if (!name||!subject||!body) return res.status(400).json({ success: false, message: 'name, subject and body required' })
    const { rows } = await db.query(
      `INSERT INTO email_templates (name, subject, body, category, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, subject, body, category||'general', req.user.id]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// PUT /api/emails/templates/:id
router.put('/templates/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, subject, body, category, is_active } = req.body
    const { rows } = await db.query(
      `UPDATE email_templates SET name=$1, subject=$2, body=$3, category=$4, is_active=$5 WHERE id=$6 RETURNING *`,
      [name, subject, body, category, is_active, req.params.id]
    )
    res.json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// DELETE /api/emails/templates/:id
router.delete('/templates/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM email_templates WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/emails/send
router.post('/send', auth, async (req, res) => {
  const { lead_id, to_email, to_name, subject, body, template_id } = req.body
  if (!to_email||!subject||!body) return res.status(400).json({ success: false, message: 'to_email, subject and body required' })

  let status = 'sent', errorMsg = null, sesMessageId = null
  try {
    const transporter = await createTransporter()
    const from        = await getFromAddress()
    const sendMeta    = await getSendMeta()
    const info = await transporter.sendMail({
      from, to: to_name ? `${to_name} <${to_email}>` : to_email,
      subject, text: body, html: body.replace(/\n/g, '<br>'),
      headers: sesHeaders(sendMeta),
    })
    if (sendMeta.provider === 'ses') sesMessageId = info.messageId || null
  } catch (err) { status='failed'; errorMsg=err.message }

  try {
    await db.query(
      `INSERT INTO email_logs (lead_id, agent_id, to_email, to_name, subject, body, template_id, status, error_msg, ses_message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [lead_id||null, req.user.id, to_email, to_name||null, subject, body, template_id||null, status, errorMsg, sesMessageId]
    )
    if (lead_id) {
      await db.query(
        `INSERT INTO communication_logs (lead_id, agent_id, type, direction, note) VALUES ($1,$2,'email','outbound',$3)`,
        [lead_id, req.user.id, `Email sent: ${subject}`]
      ).catch(() => {})
    }
  } catch (logErr) { console.error('Failed to log email:', logErr.message) }

  if (status==='failed') return res.status(500).json({ success: false, message: `Email failed: ${errorMsg}` })
  res.json({ success: true, message: 'Email sent successfully' })
})

// POST /api/emails/bulk
router.post('/bulk', auth, async (req, res) => {
  const { lead_ids, subject, body, template_id } = req.body
  if (!Array.isArray(lead_ids)||!lead_ids.length) return res.status(400).json({ success: false, message: 'lead_ids required' })
  if (!subject||!body) return res.status(400).json({ success: false, message: 'subject and body required' })

  const { rows: leads } = await db.query(
    `SELECT id, contact_name, school_name, email FROM leads WHERE id=ANY($1::uuid[]) AND email IS NOT NULL AND email!=''`,
    [lead_ids]
  )
  if (!leads.length) return res.status(400).json({ success: false, message: 'No leads with valid email addresses' })

  const transporter = await createTransporter()
  const from        = await getFromAddress()
  const sendMeta     = await getSendMeta()
  const agentName   = req.user.name  || 'Team ThynkFlow'
  const agentPhone  = req.user.phone || ''

  let sent=0, failed=0

  for (const lead of leads) {
    const leadName   = lead.contact_name || lead.school_name || 'there'
    const filledSub  = fillTemplate(subject, { lead_name: leadName, agent_name: agentName, agent_phone: agentPhone })
    const filledBody = fillTemplate(body,    { lead_name: leadName, agent_name: agentName, agent_phone: agentPhone })
    let   st='sent', errMsg=null, sesMessageId=null

    try {
      const info = await transporter.sendMail({
        from, to:`${leadName} <${lead.email}>`, subject:filledSub, text:filledBody, html:filledBody.replace(/\n/g,'<br>'),
        headers: sesHeaders(sendMeta),
      })
      if (sendMeta.provider === 'ses') sesMessageId = info.messageId || null
      sent++
    } catch (err) { st='failed'; errMsg=err.message; failed++ }

    await db.query(
      `INSERT INTO email_logs (lead_id, agent_id, to_email, to_name, subject, body, template_id, status, error_msg, ses_message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [lead.id, req.user.id, lead.email, leadName, filledSub, filledBody, template_id||null, st, errMsg, sesMessageId]
    ).catch(() => {})

    await new Promise(r => setTimeout(r, 200))
  }

  res.json({ success: true, message: 'Bulk email complete', data: { sent, failed, total: leads.length } })
})

// GET /api/emails/history/:leadId
router.get('/history/:leadId', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT el.*, u.name as agent_name FROM email_logs el LEFT JOIN users u ON el.agent_id=u.id WHERE el.lead_id=$1 ORDER BY el.sent_at DESC`,
      [req.params.leadId]
    )
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/emails/history
// FIX: use req.user.role_name (set by auth middleware via roles join) instead of querying role_name column
router.get('/history', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const { rows } = await db.query(
      isAdmin
        ? `SELECT el.*, u.name as agent_name FROM email_logs el LEFT JOIN users u ON el.agent_id=u.id ORDER BY el.sent_at DESC LIMIT 200`
        : `SELECT el.*, u.name as agent_name FROM email_logs el LEFT JOIN users u ON el.agent_id=u.id WHERE el.agent_id=$1 ORDER BY el.sent_at DESC LIMIT 100`,
      isAdmin ? [] : [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/emails/stats
// Aggregate counts for the history/report view — sent, delivered, opened, clicked, bounced, failed
router.get('/stats', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const { rows } = await db.query(
      isAdmin
        ? `SELECT status, COUNT(*)::int AS count FROM email_logs GROUP BY status`
        : `SELECT status, COUNT(*)::int AS count FROM email_logs WHERE agent_id=$1 GROUP BY status`,
      isAdmin ? [] : [req.user.id]
    )
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {})
    const total  = Object.values(counts).reduce((a, b) => a + b, 0)
    res.json({ success: true, data: { total, byStatus: counts } })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/emails/test
router.get('/test', auth, adminOnly, async (req, res) => {
  try {
    const transporter = await createTransporter()
    await transporter.verify()
    res.json({ success: true, message: 'SMTP connection successful ✅' })
  } catch (err) { res.status(500).json({ success: false, message: `SMTP failed: ${err.message}` }) }
})

module.exports = router
