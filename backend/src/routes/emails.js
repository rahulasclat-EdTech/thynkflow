// =============================================================
//  ThynkFlow — backend/src/routes/emails.js  (NEW FILE)
//
//  Features:
//  - Send single email to a lead
//  - Send bulk email to multiple leads
//  - Email templates (stored in DB)
//  - Email history per lead
//  - Uses Nodemailer with Zoho SMTP
//
//  ENV VARS needed in Render:
//    SMTP_HOST     = smtp.zoho.in
//    SMTP_PORT     = 465
//    SMTP_USER     = sales@thynksuccess.in
//    SMTP_PASS     = [your zoho app password]
//    SMTP_FROM     = ThynkFlow Sales <sales@thynksuccess.in>
//
//  INSTALL: npm install nodemailer
//
//  ADD TO index.js:
//    const emailRoutes = require('./routes/emails');
//    app.use('/api/emails', emailRoutes);
//
//  SQL MIGRATION (run in Supabase SQL editor):
/*
  CREATE TABLE IF NOT EXISTS email_logs (
    id           SERIAL PRIMARY KEY,
    lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
    agent_id     UUID REFERENCES users(id),
    to_email     VARCHAR(255) NOT NULL,
    to_name      VARCHAR(255),
    subject      VARCHAR(500) NOT NULL,
    body         TEXT NOT NULL,
    template_id  INTEGER,
    status       VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced')),
    error_msg    TEXT,
    sent_at      TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_email_logs_lead  ON email_logs(lead_id);
  CREATE INDEX IF NOT EXISTS idx_email_logs_agent ON email_logs(agent_id);

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

  -- Seed default templates
  INSERT INTO email_templates (name, subject, body, category) VALUES
  ('Introduction / First Contact',
   'Following up on your enquiry — {{lead_name}}',
   'Dear {{lead_name}},\n\nThank you for your interest in our programs. My name is {{agent_name}} and I am reaching out to help you explore the best options for your goals.\n\nI would love to connect with you for a quick 10-minute call to understand your requirements better.\n\nPlease feel free to reply to this email or call us directly.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
   'introduction'),
  ('Follow-up Reminder',
   'Just checking in — {{lead_name}}',
   'Dear {{lead_name}},\n\nI hope you are doing well. I wanted to follow up on our previous conversation and check if you had any questions or needed any further information.\n\nWe are here to help you make the right decision. Please feel free to reach out at any time.\n\nLooking forward to hearing from you.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
   'followup'),
  ('Proposal Sent',
   'Your personalised proposal — {{lead_name}}',
   'Dear {{lead_name}},\n\nAs discussed, please find attached our personalised proposal for you.\n\nHighlights:\n- Customised program suited to your goals\n- Flexible payment options available\n- Dedicated support throughout\n\nI am available to walk you through the details at your convenience. Please reply to this email or call me directly.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
   'proposal'),
  ('Thank You',
   'Thank you for choosing ThynkSuccess — {{lead_name}}',
   'Dear {{lead_name}},\n\nThank you for choosing ThynkSuccess! We are thrilled to have you on board.\n\nYour enrollment has been confirmed and our team will be in touch shortly with the next steps.\n\nWelcome to the ThynkSuccess family!\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
   'thankyou')
  ON CONFLICT DO NOTHING;
*/
// =============================================================

const express    = require('express')
const nodemailer = require('nodemailer').default || require('nodemailer')
const db         = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

// ── Nodemailer transporter ────────────────────────────────────
function createTransporter() {
  const nm = require('nodemailer')
  return nm.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.zoho.in',
    port:   parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

// ── Template variable replacer ────────────────────────────────
function fillTemplate(text, vars = {}) {
  return text
    .replace(/{{lead_name}}/g,   vars.lead_name   || 'there')
    .replace(/{{agent_name}}/g,  vars.agent_name  || 'Team ThynkFlow')
    .replace(/{{agent_phone}}/g, vars.agent_phone || '')
    .replace(/{{product}}/g,     vars.product     || '')
    .replace(/{{company}}/g,     vars.company     || 'ThynkSuccess')
}

// ── Auto-create tables ────────────────────────────────────────
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
  `)
  await db.query(`
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
  // Seed default templates if empty
  const { rows } = await db.query('SELECT COUNT(*) FROM email_templates')
  if (parseInt(rows[0].count) === 0) {
    await db.query(`
      INSERT INTO email_templates (name, subject, body, category) VALUES
      ('Introduction / First Contact',
       'Following up on your enquiry — {{lead_name}}',
       E'Dear {{lead_name}},\n\nThank you for your interest in our programs. My name is {{agent_name}} and I am reaching out to help you explore the best options for your goals.\n\nI would love to connect with you for a quick 10-minute call to understand your requirements better.\n\nPlease feel free to reply to this email or call us directly.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'introduction'),
      ('Follow-up Reminder',
       'Just checking in — {{lead_name}}',
       E'Dear {{lead_name}},\n\nI hope you are doing well. I wanted to follow up on our previous conversation.\n\nWe are here to help you make the right decision. Please feel free to reach out at any time.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'followup'),
      ('Proposal Sent',
       'Your personalised proposal — {{lead_name}}',
       E'Dear {{lead_name}},\n\nAs discussed, please find our personalised proposal for you.\n\nI am available to walk you through the details at your convenience.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'proposal'),
      ('Thank You',
       'Thank you for choosing ThynkSuccess — {{lead_name}}',
       E'Dear {{lead_name}},\n\nThank you for choosing ThynkSuccess! We are thrilled to have you on board.\n\nYour enrollment has been confirmed and our team will be in touch shortly.\n\nWarm regards,\n{{agent_name}}\nThynkFlow | ThynkSuccess\n{{agent_phone}}',
       'thankyou')
    `)
  }
}
ensureTables().catch(console.error)

// ══════════════════════════════════════════════════════════════
//  TEMPLATES
// ══════════════════════════════════════════════════════════════

// GET /api/emails/templates
router.get('/templates', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM email_templates WHERE is_active = true ORDER BY category, name`
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/emails/templates — create template (admin)
router.post('/templates', auth, adminOnly, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body
    if (!name || !subject || !body) return res.status(400).json({ success: false, message: 'name, subject and body are required' })
    const { rows } = await db.query(
      `INSERT INTO email_templates (name, subject, body, category, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, subject, body, category || 'general', req.user.id]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/emails/templates/:id
router.put('/templates/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, subject, body, category, is_active } = req.body
    const { rows } = await db.query(
      `UPDATE email_templates SET name=$1, subject=$2, body=$3, category=$4, is_active=$5
       WHERE id=$6 RETURNING *`,
      [name, subject, body, category, is_active, req.params.id]
    )
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/emails/templates/:id
router.delete('/templates/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM email_templates WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  SEND EMAIL (single lead)
// ══════════════════════════════════════════════════════════════

// POST /api/emails/send
router.post('/send', auth, async (req, res) => {
  const { lead_id, to_email, to_name, subject, body, template_id } = req.body
  if (!to_email || !subject || !body) {
    return res.status(400).json({ success: false, message: 'to_email, subject and body are required' })
  }

  let status = 'sent', errorMsg = null

  try {
    const transporter = createTransporter()
    const fromName    = process.env.SMTP_FROM || `ThynkFlow Sales <${process.env.SMTP_USER}>`

    await transporter.sendMail({
      from:    fromName,
      to:      to_name ? `${to_name} <${to_email}>` : to_email,
      subject: subject,
      text:    body,
      html:    body.replace(/\n/g, '<br>'),
    })
  } catch (err) {
    status   = 'failed'
    errorMsg = err.message
  }

  // Log regardless of success/fail
  try {
    await db.query(
      `INSERT INTO email_logs (lead_id, agent_id, to_email, to_name, subject, body, template_id, status, error_msg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [lead_id || null, req.user.id, to_email, to_name || null, subject, body, template_id || null, status, errorMsg]
    )
    // Also log in communication_logs if lead_id provided
    if (lead_id) {
      await db.query(
        `INSERT INTO communication_logs (lead_id, agent_id, type, direction, note)
         VALUES ($1, $2, 'email', 'outbound', $3)`,
        [lead_id, req.user.id, `Email sent: ${subject}`]
      ).catch(() => {})
    }
  } catch (logErr) {
    console.error('Failed to log email:', logErr.message)
  }

  if (status === 'failed') {
    return res.status(500).json({ success: false, message: `Email failed: ${errorMsg}` })
  }
  res.json({ success: true, message: 'Email sent successfully' })
})

// ══════════════════════════════════════════════════════════════
//  BULK EMAIL
// ══════════════════════════════════════════════════════════════

// POST /api/emails/bulk
router.post('/bulk', auth, async (req, res) => {
  const { lead_ids, subject, body, template_id } = req.body
  if (!Array.isArray(lead_ids) || !lead_ids.length) {
    return res.status(400).json({ success: false, message: 'lead_ids array is required' })
  }
  if (!subject || !body) {
    return res.status(400).json({ success: false, message: 'subject and body are required' })
  }

  // Fetch leads
  const { rows: leads } = await db.query(
    `SELECT id, contact_name, school_name, email FROM leads WHERE id = ANY($1::uuid[]) AND email IS NOT NULL AND email != ''`,
    [lead_ids]
  )

  if (!leads.length) {
    return res.status(400).json({ success: false, message: 'No leads with valid email addresses found' })
  }

  const transporter = createTransporter()
  const fromName    = process.env.SMTP_FROM || `ThynkFlow Sales <${process.env.SMTP_USER}>`
  const agentName   = req.user.name || 'Team ThynkFlow'
  const agentPhone  = req.user.phone || ''

  let sent = 0, failed = 0, skipped = 0

  for (const lead of leads) {
    const leadName     = lead.contact_name || lead.school_name || 'there'
    const filledSub    = fillTemplate(subject, { lead_name: leadName, agent_name: agentName, agent_phone: agentPhone })
    const filledBody   = fillTemplate(body,    { lead_name: leadName, agent_name: agentName, agent_phone: agentPhone })
    let   status       = 'sent', errorMsg = null

    try {
      await transporter.sendMail({
        from:    fromName,
        to:      `${leadName} <${lead.email}>`,
        subject: filledSub,
        text:    filledBody,
        html:    filledBody.replace(/\n/g, '<br>'),
      })
      sent++
    } catch (err) {
      status   = 'failed'
      errorMsg = err.message
      failed++
    }

    // Log each email
    await db.query(
      `INSERT INTO email_logs (lead_id, agent_id, to_email, to_name, subject, body, template_id, status, error_msg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [lead.id, req.user.id, lead.email, leadName, filledSub, filledBody, template_id || null, status, errorMsg]
    ).catch(() => {})

    // Small delay to avoid SMTP rate limits
    await new Promise(r => setTimeout(r, 200))
  }

  res.json({
    success: true,
    message: `Bulk email complete`,
    data: { sent, failed, skipped, total: leads.length }
  })
})

// ══════════════════════════════════════════════════════════════
//  EMAIL HISTORY
// ══════════════════════════════════════════════════════════════

// GET /api/emails/history/:leadId
router.get('/history/:leadId', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT el.*, u.name as agent_name
       FROM email_logs el
       LEFT JOIN users u ON el.agent_id = u.id
       WHERE el.lead_id = $1
       ORDER BY el.sent_at DESC`,
      [req.params.leadId]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/emails/history — all emails (admin) or agent's emails
router.get('/history', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin'
    const { rows } = await db.query(
      isAdmin
        ? `SELECT el.*, u.name as agent_name FROM email_logs el LEFT JOIN users u ON el.agent_id = u.id ORDER BY el.sent_at DESC LIMIT 200`
        : `SELECT el.*, u.name as agent_name FROM email_logs el LEFT JOIN users u ON el.agent_id = u.id WHERE el.agent_id = $1 ORDER BY el.sent_at DESC LIMIT 100`,
      isAdmin ? [] : [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/emails/test — test SMTP connection
router.get('/test', auth, adminOnly, async (req, res) => {
  try {
    const transporter = createTransporter()
    await transporter.verify()
    res.json({ success: true, message: 'SMTP connection successful ✅' })
  } catch (err) {
    res.status(500).json({ success: false, message: `SMTP failed: ${err.message}` })
  }
})

module.exports = router
