// backend/src/routes/inbound_email.js
//
// FEATURE: "Send an email to an email ID and a lead gets created in the system."
//
// HOW IT WORKS
// ------------
// You point a mailbox (e.g. enquiries@thynksuccess.com — any IMAP-accessible
// inbox: Gmail, Office365, Zoho, etc.) at ThynkFlow. Anyone who emails that
// address — or any email you forward into it — gets scanned every few
// minutes. For each new message:
//   • If the sender's email already matches an existing lead -> the email
//     is logged against that lead as an inbound communication + the
//     assigned agent (or all admins if unassigned) gets notified.
//   • Otherwise -> a brand new lead is created (source = 'email_inbound'),
//     unassigned, with the subject/body captured in admin_remark, and all
//     admins are notified so someone can triage + assign it.
//
// SETUP (one-time, Admin only):
//   1. Create/choose a mailbox for enquiries (Gmail/Office365/Zoho all work).
//      Gmail & Office365 need "IMAP access" turned on and an app password
//      (not your normal login password) if 2FA is enabled.
//   2. In ThynkFlow -> Inbound Email (admin nav item), enter host/port/user/
//      app-password and Save. Toggle "Enabled".
//   3. That's it — polling starts automatically (checks every few minutes).
//      Use "Poll Now" to test immediately after saving.
//
// DEPLOYMENT NOTE: this uses an in-process setInterval poller, which only
// works if the backend runs as a long-lived Node process (app.listen —
// which is what this backend already does). If you ever move the backend
// to a serverless platform, replace the interval in startInboundEmailPoller()
// with an external cron (cron-job.org / Render Cron / GitHub Actions) that
// calls POST /api/inbound-email/poll-now instead.

const express = require('express')
const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')
const db = require('../config/db')
const { auth, adminOnly, cronAuth } = require('../middleware/auth')
const { getConfig, setConfig } = require('./integrations')
const { createNotif } = require('./notifications')

const router = express.Router()
const CONFIG_KEY = 'inbound_email'

// ══════════════════════════════════════════════════════════════
//  SELF-MIGRATING TABLE — audit trail of every processed message
// ══════════════════════════════════════════════════════════════
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS inbound_emails (
      id             SERIAL PRIMARY KEY,
      message_uid    VARCHAR(255),
      from_email     VARCHAR(255),
      from_name      VARCHAR(255),
      subject        TEXT,
      body_snippet   TEXT,
      lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
      action         VARCHAR(20), -- created | matched_existing | skipped | error
      error_msg      TEXT,
      received_at    TIMESTAMP,
      processed_at   TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_inbound_emails_from ON inbound_emails(from_email);
  `)
}
ensureTables().catch(console.error)

// ══════════════════════════════════════════════════════════════
//  CONFIG HELPERS (reuses the app_config table from integrations.js)
// ══════════════════════════════════════════════════════════════
async function getInboundConfig() {
  const cfg = await getConfig(CONFIG_KEY)
  return {
    enabled: !!cfg.enabled,
    host: cfg.host || '',
    port: parseInt(cfg.port || '993'),
    secure: cfg.secure !== false,
    user: cfg.user || '',
    pass: cfg.pass || '',
    folder: cfg.folder || 'INBOX',
    pollIntervalMinutes: Math.max(2, parseInt(cfg.pollIntervalMinutes || '5')),
    defaultLeadType: cfg.defaultLeadType || 'B2C',
  }
}

function maskConfig(cfg) {
  return { ...cfg, pass: cfg.pass ? '••••••••' : '' }
}

// ══════════════════════════════════════════════════════════════
//  CORE: fetch + process unseen messages
// ══════════════════════════════════════════════════════════════
function extractSenderName(fromText, email) {
  if (!fromText) return email
  const match = fromText.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : email
}

async function notifyAllAdmins(type, title, message, leadId) {
  try {
    const { rows: admins } = await db.query(
      `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='admin' AND u.is_active=true`
    )
    for (const a of admins) createNotif(a.id, type, title, message, leadId)
  } catch (err) { console.error('notifyAllAdmins error:', err.message) }
}

async function processMessage(parsed, uid) {
  const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() || null
  const fromText = parsed.from?.text || ''
  const fromName = extractSenderName(fromText, fromAddr) || 'Unknown'
  const subject = parsed.subject || '(no subject)'
  const bodyText = (parsed.text || '').trim()
  const snippet = bodyText.slice(0, 2000)
  const receivedAt = parsed.date || new Date()

  if (!fromAddr) {
    await db.query(
      `INSERT INTO inbound_emails (message_uid, subject, action, error_msg, received_at)
       VALUES ($1,$2,'skipped','no sender address found',$3)`,
      [String(uid), subject, receivedAt]
    ).catch(() => {})
    return { action: 'skipped' }
  }

  // Ignore auto-replies / bounces / no-reply loops
  const lowerSubject = subject.toLowerCase()
  if (/auto[- ]?reply|out of office|delivery status notification|mailer-daemon/i.test(lowerSubject) ||
      /mailer-daemon|no-?reply@/i.test(fromAddr)) {
    await db.query(
      `INSERT INTO inbound_emails (message_uid, from_email, from_name, subject, action, received_at)
       VALUES ($1,$2,$3,$4,'skipped',$5)`,
      [String(uid), fromAddr, fromName, subject, receivedAt]
    ).catch(() => {})
    return { action: 'skipped' }
  }

  try {
    // Does a lead with this email already exist?
    const { rows: existing } = await db.query(
      `SELECT id, assigned_to FROM leads WHERE LOWER(email) = $1 ORDER BY created_at DESC LIMIT 1`,
      [fromAddr]
    )

    if (existing.length) {
      const lead = existing[0]
      // Log as an inbound communication against the existing lead
      await db.query(
        `INSERT INTO communication_logs (lead_id, agent_id, type, direction, note)
         VALUES ($1, COALESCE($2, (SELECT id FROM users WHERE role_id=1 LIMIT 1)), 'email', 'inbound', $3)`,
        [lead.id, lead.assigned_to, `Inbound email — "${subject}": ${snippet.slice(0, 500)}`]
      ).catch(() => {})

      if (lead.assigned_to) {
        createNotif(lead.assigned_to, 'inbound_email', '📩 New reply from your lead',
          `${fromName} replied: "${subject}"`, lead.id)
      } else {
        await notifyAllAdmins('inbound_email', '📩 Inbound email on unassigned lead',
          `${fromName} <${fromAddr}> emailed about "${subject}" — lead is unassigned`, lead.id)
      }

      await db.query(
        `INSERT INTO inbound_emails (message_uid, from_email, from_name, subject, body_snippet, lead_id, action, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,'matched_existing',$7)`,
        [String(uid), fromAddr, fromName, subject, snippet, lead.id, receivedAt]
      ).catch(() => {})

      return { action: 'matched_existing', lead_id: lead.id }
    }

    // No existing lead — create a new one from this email
    const cfg = await getInboundConfig()
    const { rows: created } = await db.query(
      `INSERT INTO leads (contact_name, email, source, status, lead_type, admin_remark, creation_comment)
       VALUES ($1,$2,'email_inbound','new',$3,$4,$5)
       RETURNING *`,
      [fromName, fromAddr, cfg.defaultLeadType, `Subject: ${subject}\n\n${snippet}`, `Auto-captured from inbound email: ${subject}`]
    )
    const newLead = created[0]

    await notifyAllAdmins('lead_assigned', '📥 New lead from email', `${fromName} <${fromAddr}> — "${subject}"`, newLead.id)

    await db.query(
      `INSERT INTO inbound_emails (message_uid, from_email, from_name, subject, body_snippet, lead_id, action, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,'created',$7)`,
      [String(uid), fromAddr, fromName, subject, snippet, newLead.id, receivedAt]
    ).catch(() => {})

    return { action: 'created', lead_id: newLead.id }
  } catch (err) {
    await db.query(
      `INSERT INTO inbound_emails (message_uid, from_email, from_name, subject, action, error_msg, received_at)
       VALUES ($1,$2,$3,$4,'error',$5,$6)`,
      [String(uid), fromAddr, fromName, subject, err.message, receivedAt]
    ).catch(() => {})
    throw err
  }
}

let isPolling = false

async function pollInboxOnce() {
  if (isPolling) return { skipped: true, reason: 'already running' }
  isPolling = true
  const cfg = await getInboundConfig()

  if (!cfg.enabled || !cfg.host || !cfg.user || !cfg.pass) {
    isPolling = false
    return { skipped: true, reason: 'not configured or disabled' }
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  })

  let processed = 0, errors = 0
  try {
    await client.connect()
    const lock = await client.getMailboxLock(cfg.folder)
    try {
      const uids = await client.search({ seen: false })
      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(uid, { source: true })
          if (!msg?.source) continue
          const parsed = await simpleParser(msg.source)
          await processMessage(parsed, uid)
          await client.messageFlagsAdd(uid, ['\\Seen'])
          processed++
        } catch (err) {
          errors++
          console.error('[inbound-email] failed to process message', uid, err.message)
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (err) {
    console.error('[inbound-email] IMAP connection error:', err.message)
    isPolling = false
    return { error: err.message }
  }

  isPolling = false
  return { processed, errors }
}

// ══════════════════════════════════════════════════════════════
//  IN-PROCESS SCHEDULER
// ══════════════════════════════════════════════════════════════
function startInboundEmailPoller() {
  setInterval(async () => {
    try {
      const cfg = await getInboundConfig()
      if (!cfg.enabled) return
      const result = await pollInboxOnce()
      if (result?.processed) console.log(`[inbound-email] processed ${result.processed} message(s)`)
    } catch (err) {
      console.error('[inbound-email] poller error:', err.message)
    }
  }, 2 * 60 * 1000) // check every 2 min; pollInboxOnce internally respects nothing more granular — cheap no-op when disabled
}

// ══════════════════════════════════════════════════════════════
//  ROUTES (admin only)
// ══════════════════════════════════════════════════════════════

// GET /api/inbound-email/config
router.get('/config', auth, adminOnly, async (req, res) => {
  try {
    const cfg = await getInboundConfig()
    res.json({ success: true, data: maskConfig(cfg) })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/inbound-email/config
router.post('/config', auth, adminOnly, async (req, res) => {
  try {
    const { enabled, host, port, secure, user, pass, folder, pollIntervalMinutes, defaultLeadType } = req.body
    const existing = await getConfig(CONFIG_KEY)
    const next = {
      enabled: !!enabled,
      host: host ?? existing.host ?? '',
      port: port ?? existing.port ?? 993,
      secure: secure !== undefined ? !!secure : (existing.secure !== false),
      user: user ?? existing.user ?? '',
      // keep existing password if the masked placeholder was submitted unchanged
      pass: (pass && pass !== '••••••••') ? pass : (existing.pass || ''),
      folder: folder || existing.folder || 'INBOX',
      pollIntervalMinutes: pollIntervalMinutes ?? existing.pollIntervalMinutes ?? 5,
      defaultLeadType: defaultLeadType || existing.defaultLeadType || 'B2C',
    }
    await setConfig(CONFIG_KEY, next)
    res.json({ success: true, data: maskConfig(next) })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/inbound-email/poll-now — manual trigger (also safe to hit from an external cron)
router.post('/poll-now', cronAuth, async (req, res) => {
  try {
    const result = await pollInboxOnce()
    res.json({ success: true, ...result })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/inbound-email/logs — recent processed messages, for troubleshooting
router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ie.*, l.contact_name, l.status AS lead_status
       FROM inbound_emails ie
       LEFT JOIN leads l ON ie.lead_id = l.id
       ORDER BY ie.processed_at DESC LIMIT 200`
    )
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/inbound-email/test-connection — verify IMAP creds without polling for mail
router.post('/test-connection', auth, adminOnly, async (req, res) => {
  const cfg = await getInboundConfig()
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return res.status(400).json({ success: false, message: 'Host, user and password are required' })
  }
  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }, logger: false,
  })
  try {
    await client.connect()
    await client.logout()
    res.json({ success: true, message: 'IMAP connection successful ✅' })
  } catch (err) {
    res.status(500).json({ success: false, message: `IMAP failed: ${err.message}` })
  }
})

module.exports = router
module.exports.startInboundEmailPoller = startInboundEmailPoller
module.exports.pollInboxOnce = pollInboxOnce
