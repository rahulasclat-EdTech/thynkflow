// backend/src/routes/reminders.js
//
// FEATURE: email reminders for (a) leads just assigned to an agent, and
// (b) a daily digest per agent of overdue / today's follow-ups and brand
// new leads that have had no activity yet.
//
// DEPLOYMENT NOTE: same as inbound_email.js — this uses an in-process
// setInterval scheduler, which is fine since this backend runs as a
// long-lived Node process (app.listen). If ever moved to serverless,
// swap startDigestScheduler() for an external cron hitting
// POST /api/reminders/run-daily-digest once a day instead.

const express = require('express')
const db = require('../config/db')
const { auth, adminOnly, cronAuth } = require('../middleware/auth')
const { buildTransporter, getFromAddress } = require('./integrations')

const router = express.Router()

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS reminder_logs (
      id            SERIAL PRIMARY KEY,
      lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
      user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
      reminder_type VARCHAR(30) NOT NULL, -- assignment | digest
      sent_at       TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup ON reminder_logs(user_id, reminder_type, sent_at);
  `)
}
ensureTables().catch(console.error)

function stripHtml(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

// ══════════════════════════════════════════════════════════════
//  1) ASSIGNMENT EMAIL — called from leads.js / leads_additions.js
//     right after a lead (or batch of leads) is assigned to an agent.
//     Fire-and-forget: callers should NOT await this in the hot path
//     of the request/response cycle for bulk operations.
// ══════════════════════════════════════════════════════════════
async function notifyLeadAssignedEmail(leadIds, agentId) {
  try {
    if (!agentId || !Array.isArray(leadIds) || !leadIds.length) return
    const { rows: [agent] } = await db.query(`SELECT id, name, email FROM users WHERE id = $1`, [agentId])
    if (!agent?.email) return

    const { rows: leads } = await db.query(
      `SELECT id, COALESCE(contact_name, school_name, 'Lead') AS lead_name, phone, email
       FROM leads WHERE id = ANY($1::uuid[])`,
      [leadIds]
    )
    if (!leads.length) return

    const transporter = await buildTransporter()
    const from = await getFromAddress()
    const listHtml = leads.map(l =>
      `<li><b>${l.lead_name}</b>${l.phone ? ' — ' + l.phone : ''}${l.email ? ' · ' + l.email : ''}</li>`
    ).join('')
    const subject = leads.length === 1
      ? `New lead assigned: ${leads[0].lead_name}`
      : `${leads.length} new leads assigned to you`
    const html = `
      <p>Hi ${agent.name},</p>
      <p>The following lead${leads.length > 1 ? 's have' : ' has'} just been assigned to you in ThynkFlow:</p>
      <ul>${listHtml}</ul>
      <p>Please follow up at the earliest.</p>
      <p>— ThynkFlow</p>`

    await transporter.sendMail({ from, to: agent.email, subject, html, text: stripHtml(html) })

    for (const l of leads) {
      await db.query(
        `INSERT INTO reminder_logs (lead_id, user_id, reminder_type) VALUES ($1,$2,'assignment')`,
        [l.id, agentId]
      ).catch(() => {})
    }
  } catch (err) {
    console.error('[reminders] notifyLeadAssignedEmail error:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════
//  2) DAILY DIGEST — overdue / today's follow-ups + untouched new leads
// ══════════════════════════════════════════════════════════════
const IST_TODAY = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`

async function getFollowupBucket(agentId, comparison) {
  const { rows } = await db.query(`
    SELECT l.id, COALESCE(l.contact_name, l.school_name, 'Lead') AS lead_name, latest.next_followup_date
    FROM (
      SELECT DISTINCT ON (cl.lead_id) cl.lead_id, cl.next_followup_date
      FROM call_logs cl
      WHERE cl.next_followup_date IS NOT NULL
      ORDER BY cl.lead_id, cl.id DESC
    ) latest
    JOIN leads l ON l.id = latest.lead_id
    WHERE l.assigned_to = $1
      AND l.status NOT IN ('converted','not_interested')
      AND ${comparison}
    ORDER BY latest.next_followup_date ASC
  `, [agentId])
  return rows
}

async function sendDigestToAgent(agent) {
  const [overdue, today] = await Promise.all([
    getFollowupBucket(agent.id, `latest.next_followup_date < ${IST_TODAY}`),
    getFollowupBucket(agent.id, `latest.next_followup_date = ${IST_TODAY}`),
  ])

  const { rows: untouched } = await db.query(`
    SELECT l.id, COALESCE(l.contact_name, l.school_name, 'Lead') AS lead_name
    FROM leads l
    WHERE l.assigned_to = $1
      AND l.status = 'new'
      AND l.created_at < NOW() - INTERVAL '1 day'
      AND NOT EXISTS (SELECT 1 FROM call_logs cl WHERE cl.lead_id = l.id)
  `, [agent.id])

  if (!overdue.length && !today.length && !untouched.length) return false

  const transporter = await buildTransporter()
  const from = await getFromAddress()
  const section = (title, rows) => rows.length
    ? `<h3 style="margin:16px 0 4px">${title} (${rows.length})</h3><ul>${rows.map(r => `<li>${r.lead_name}</li>`).join('')}</ul>`
    : ''
  const html = `
    <p>Hi ${agent.name},</p>
    <p>Here is your ThynkFlow follow-up summary:</p>
    ${section('⏰ Overdue follow-ups', overdue)}
    ${section("📅 Follow-ups due today", today)}
    ${section('🆕 New leads with no activity logged yet', untouched)}
    <p>— ThynkFlow</p>`

  await transporter.sendMail({
    from, to: agent.email,
    subject: `Your ThynkFlow daily summary — ${overdue.length} overdue, ${today.length} due today`,
    html, text: stripHtml(html),
  })

  await db.query(
    `INSERT INTO reminder_logs (lead_id, user_id, reminder_type) VALUES (NULL,$1,'digest')`,
    [agent.id]
  ).catch(() => {})
  return true
}

async function runDailyDigestForAllAgents() {
  const { rows: agents } = await db.query(`
    SELECT u.id, u.name, u.email FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'agent' AND u.is_active = true AND u.email IS NOT NULL AND u.email != ''
  `)
  let sent = 0
  for (const agent of agents) {
    try {
      if (await sendDigestToAgent(agent)) sent++
    } catch (err) {
      console.error('[reminders] digest failed for', agent.email, err.message)
    }
    await new Promise(r => setTimeout(r, 300)) // gentle pacing on the SMTP/SES connection
  }
  return { agents: agents.length, sent }
}

// ══════════════════════════════════════════════════════════════
//  IN-PROCESS SCHEDULER — fires once per day around 09:00 IST
// ══════════════════════════════════════════════════════════════
let lastDigestDateIST = null
function startDigestScheduler() {
  setInterval(async () => {
    try {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const todayKey = nowIST.toISOString().slice(0, 10)
      if (nowIST.getHours() === 9 && lastDigestDateIST !== todayKey) {
        lastDigestDateIST = todayKey
        const result = await runDailyDigestForAllAgents()
        console.log(`[reminders] Daily digest sent to ${result.sent}/${result.agents} agents`)
      }
    } catch (err) {
      console.error('[reminders] scheduler error:', err.message)
    }
  }, 10 * 60 * 1000) // check every 10 minutes
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/reminders/run-daily-digest — admin trigger (also usable by an external cron)
router.post('/run-daily-digest', cronAuth, async (req, res) => {
  try {
    const result = await runDailyDigestForAllAgents()
    res.json({ success: true, ...result })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// POST /api/reminders/test/:userId — send one agent their digest right now, for testing
router.post('/test/:userId', auth, adminOnly, async (req, res) => {
  try {
    const { rows: [agent] } = await db.query(`SELECT id, name, email FROM users WHERE id = $1`, [req.params.userId])
    if (!agent) return res.status(404).json({ success: false, message: 'User not found' })
    if (!agent.email) return res.status(400).json({ success: false, message: 'User has no email on file' })
    const sent = await sendDigestToAgent(agent)
    res.json({ success: true, sent })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// GET /api/reminders/logs — recent reminder emails sent, for troubleshooting
router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT rl.*, u.name AS user_name, u.email AS user_email,
             COALESCE(l.contact_name, l.school_name) AS lead_name
      FROM reminder_logs rl
      LEFT JOIN users u ON rl.user_id = u.id
      LEFT JOIN leads l ON rl.lead_id = l.id
      ORDER BY rl.sent_at DESC LIMIT 200
    `)
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
module.exports.notifyLeadAssignedEmail = notifyLeadAssignedEmail
module.exports.runDailyDigestForAllAgents = runDailyDigestForAllAgents
module.exports.startDigestScheduler = startDigestScheduler
