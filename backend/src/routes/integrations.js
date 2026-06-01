// backend/src/routes/integrations.js
// Stores Email (SMTP) and WhatsApp integration configs in DB
// Replaces hardcoded env-var SMTP with DB-driven config

const express    = require('express')
const nodemailer = require('nodemailer')
const db         = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

// ─────────────────────────────────────────────────────────────
// DB BOOTSTRAP
// ─────────────────────────────────────────────────────────────
async function ensureConfigTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      id         SERIAL PRIMARY KEY,
      config_key VARCHAR(100) UNIQUE NOT NULL,
      value      JSONB        NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `)
}
ensureConfigTable().catch(console.error)

// ─────────────────────────────────────────────────────────────
// HELPERS — used by emails.js too (exported)
// ─────────────────────────────────────────────────────────────

/** Load a config blob by key; returns {} if not set */
async function getConfig(key) {
  try {
    const { rows } = await db.query(
      `SELECT value FROM app_config WHERE config_key = $1`,
      [key]
    )
    return rows[0]?.value || {}
  } catch { return {} }
}

/** Save a config blob */
async function setConfig(key, value) {
  await db.query(`
    INSERT INTO app_config (config_key, value)
    VALUES ($1, $2)
    ON CONFLICT (config_key)
    DO UPDATE SET value = $2, updated_at = NOW()
  `, [key, JSON.stringify(value)])
}

/** Build a nodemailer transporter from DB config (falls back to env vars) */
async function buildTransporter() {
  const cfg   = await getConfig('email_smtp')
  const host  = cfg.smtpHost  || process.env.SMTP_HOST  || 'smtp.gmail.com'
  const port  = parseInt(cfg.smtpPort  || process.env.SMTP_PORT  || '587')
  const user  = cfg.smtpUser  || process.env.SMTP_USER  || ''
  const pass  = cfg.smtpPass  || process.env.SMTP_PASS  || ''
  const secure = port === 465
  return nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout:   15000,
    socketTimeout:     15000,
  })
}

/** Get the "from" string for outgoing emails */
async function getFromAddress() {
  const cfg = await getConfig('email_smtp')
  const name  = cfg.fromName  || 'ThynkFlow'
  const email = cfg.fromEmail || cfg.smtpUser || process.env.SMTP_FROM || process.env.SMTP_USER || ''
  return email ? `${name} <${email}>` : name
}

module.exports.buildTransporter = buildTransporter
module.exports.getFromAddress   = getFromAddress
module.exports.getConfig        = getConfig

// ─────────────────────────────────────────────────────────────
// GET /api/integrations
// Returns both email and whatsapp configs (passwords masked)
// ─────────────────────────────────────────────────────────────
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const [emailCfg, waCfg] = await Promise.all([
      getConfig('email_smtp'),
      getConfig('whatsapp'),
    ])

    // Mask secrets
    const emailSafe = { ...emailCfg }
    if (emailSafe.smtpPass) emailSafe.smtpPass = '••••••••'

    const waSafe = { ...waCfg }
    if (waSafe.tcApiSecret) waSafe.tcApiSecret = '••••••••'
    if (waSafe.metaToken)   waSafe.metaToken   = '••••••••'
    if (waSafe.authToken)   waSafe.authToken   = '••••••••'

    res.json({ success: true, data: { email: emailSafe, whatsapp: waSafe } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/integrations/raw
// Returns real (unmasked) config for form pre-fill
// ─────────────────────────────────────────────────────────────
router.get('/raw', auth, adminOnly, async (req, res) => {
  try {
    const [email, whatsapp] = await Promise.all([
      getConfig('email_smtp'),
      getConfig('whatsapp'),
    ])
    res.json({ success: true, data: { email, whatsapp } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/integrations/email
// Save SMTP config
// ─────────────────────────────────────────────────────────────
router.post('/email', auth, adminOnly, async (req, res) => {
  try {
    const { fromName, fromEmail, smtpHost, smtpPort, smtpUser, smtpPass, enabled } = req.body
    if (!smtpHost || !smtpUser) {
      return res.status(400).json({ success: false, message: 'smtpHost and smtpUser are required' })
    }
    await setConfig('email_smtp', { fromName, fromEmail, smtpHost, smtpPort, smtpUser, smtpPass, enabled: !!enabled })
    res.json({ success: true, message: 'Email SMTP configuration saved' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/integrations/whatsapp
// Save WhatsApp config
// ─────────────────────────────────────────────────────────────
router.post('/whatsapp', auth, adminOnly, async (req, res) => {
  try {
    const cfg = req.body   // provider, enabled, tcUrl, tcApiKey, tcApiSecret, metaToken, metaPhoneId, accountSid, authToken, fromNumber
    await setConfig('whatsapp', cfg)
    res.json({ success: true, message: 'WhatsApp configuration saved' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/integrations/test-email
// Send a real test email using current DB config
// ─────────────────────────────────────────────────────────────
router.post('/test-email', auth, adminOnly, async (req, res) => {
  try {
    const { to } = req.body
    if (!to) return res.status(400).json({ success: false, message: 'to is required' })

    const transporter = await buildTransporter()
    const from        = await getFromAddress()

    await transporter.verify()
    await transporter.sendMail({
      from,
      to,
      subject: '✅ ThynkFlow SMTP Test',
      text: 'This is a test email from ThynkFlow. Your SMTP configuration is working correctly.',
      html: `<div style="font-family:sans-serif;padding:20px;background:#f1f5f9;border-radius:12px">
        <h2 style="color:#6366f1">✅ SMTP Test Successful</h2>
        <p>Your ThynkFlow email configuration is working correctly.</p>
        <p style="color:#64748b;font-size:12px">Sent from ThynkFlow at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
      </div>`,
    })

    res.json({ success: true, message: `Test email sent to ${to}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/integrations/test-whatsapp
// Send a real test WhatsApp message using current DB config
// ─────────────────────────────────────────────────────────────
router.post('/test-whatsapp', auth, adminOnly, async (req, res) => {
  try {
    const { to, message } = req.body
    if (!to) return res.status(400).json({ success: false, message: 'to is required' })

    const cfg = await getConfig('whatsapp')
    const msg = message || 'Hello from ThynkFlow! Your WhatsApp integration is working. 🎉'

    // Normalise phone
    let phone = to.replace(/\D/g, '')
    if (phone.length === 10 && phone[0] !== '0') phone = '91' + phone
    if (phone.length === 11 && phone[0] === '0') phone = '91' + phone.slice(1)

    let result

    if (cfg.provider === 'meta') {
      if (!cfg.metaToken || !cfg.metaPhoneId) {
        return res.status(400).json({ success: false, message: 'Meta token and phone ID not configured' })
      }
      const r = await fetch(`https://graph.facebook.com/v19.0/${cfg.metaPhoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.metaToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { preview_url: false, body: msg } }),
      })
      result = await r.json()
      if (!r.ok) return res.status(400).json({ success: false, message: result.error?.message || 'Meta API error', raw: result })

    } else if (cfg.provider === 'twilio') {
      if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber) {
        return res.status(400).json({ success: false, message: 'Twilio credentials not configured' })
      }
      const creds = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')
      const from  = cfg.fromNumber.startsWith('whatsapp:') ? cfg.fromNumber : `whatsapp:${cfg.fromNumber}`
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: `whatsapp:${phone}`, Body: msg }),
      })
      result = await r.json()
      if (!r.ok) return res.status(400).json({ success: false, message: result.message || 'Twilio error', raw: result })

    } else {
      // ThynkComm (default)
      if (!cfg.tcUrl || !cfg.tcApiKey || !cfg.tcApiSecret) {
        return res.status(400).json({ success: false, message: 'ThynkComm credentials not configured' })
      }
      const url = cfg.tcUrl.replace(/\/$/, '') + '/api/send-message'
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.tcApiKey, 'x-api-secret': cfg.tcApiSecret },
        body: JSON.stringify({ to: phone, message: msg }),
      })
      result = await r.json()
      if (!r.ok) return res.status(400).json({ success: false, message: result.message || result.error || 'ThynkComm error', raw: result })
    }

    res.json({ success: true, message: `Message sent to ${phone}`, raw: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
