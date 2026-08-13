// backend/src/routes/registration_integration.js
//
// Bridges ThynkFlow → Thynk Registration:
//   - admin-maintained mapping tables (consultant, product↔program)
//   - POST /api/leads/:id/push-to-registration — the "Create School" button
//
// Registration base URL + API key are stored in app_config (the same
// key→JSONB table integrations.js already uses for SMTP/WhatsApp config),
// under config_key 'registration_integration', e.g.:
//   { "base_url": "https://app.thynksuccess.com", "api_key": "…" }

const express = require('express')
const fetch   = global.fetch || require('node-fetch') // Node 18+ has global fetch
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const runMigration = require('../config/migrate_registration_integration')

const router = express.Router()

// ─────────────────────────────────────────────────────────────
// One-click setup — runs the same migration as
// `npm run migrate:registration-integration`, but through the app's own
// live DB connection. Exists because on Vercel there's no server shell to
// run the CLI migration from, and it's easy to accidentally run the CLI
// version against the wrong database. Safe to click more than once.
// ─────────────────────────────────────────────────────────────
router.post('/registration-integration/setup', auth, adminOnly, async (req, res) => {
  try {
    await runMigration()
    res.json({ success: true, message: 'Registration integration tables are ready.' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// Registration connection config — reuses app_config (see integrations.js
// ensureConfigTable/getConfig/setConfig for the same pattern)
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

async function getRegistrationConfig() {
  const { rows } = await db.query(
    `SELECT value FROM app_config WHERE config_key = 'registration_integration'`
  )
  return rows[0]?.value || {}
}

// GET current config (api_key is masked — never sent back in full)
router.get('/registration-integration/config', auth, adminOnly, async (req, res) => {
  try {
    const cfg = await getRegistrationConfig()
    res.json({
      success: true,
      data: {
        base_url: cfg.base_url || '',
        api_key_set: !!cfg.api_key,
        api_key_preview: cfg.api_key ? `••••${cfg.api_key.slice(-4)}` : null,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST save config — { base_url, api_key }. api_key omitted/blank keeps the existing one.
router.post('/registration-integration/config', auth, adminOnly, async (req, res) => {
  try {
    const { base_url, api_key } = req.body
    const existing = await getRegistrationConfig()
    const finalBaseUrl = (base_url ?? existing.base_url ?? '').trim().replace(/\/+$/, '')

    if (finalBaseUrl && !/^https?:\/\//i.test(finalBaseUrl)) {
      return res.status(400).json({
        success: false,
        message: `"${finalBaseUrl}" doesn't look like a website address. It must start with https:// — e.g. https://app.thynksuccess.com`,
      })
    }

    const merged = {
      base_url: finalBaseUrl,
      api_key:  api_key?.trim() ? api_key.trim() : existing.api_key,
    }
    await db.query(
      `INSERT INTO app_config (config_key, value) VALUES ('registration_integration', $1)
       ON CONFLICT (config_key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(merged)]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// Consultant mapping — ThynkFlow user ↔ Registration consultant
// ─────────────────────────────────────────────────────────────
router.get('/registration-integration/consultant-mapping', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT cm.*, u.name AS thynkflow_user_name, u.email AS thynkflow_user_email
      FROM consultant_mapping cm
      JOIN users u ON u.id = cm.thynkflow_user_id
      ORDER BY u.name
    `)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST upsert (one mapping per thynkflow_user_id)
router.post('/registration-integration/consultant-mapping', auth, adminOnly, async (req, res) => {
  try {
    const { thynkflow_user_id, registration_consultant_id, registration_consultant_code, registration_consultant_name } = req.body
    if (!thynkflow_user_id || !registration_consultant_id) {
      return res.status(400).json({ success: false, message: 'thynkflow_user_id and registration_consultant_id are required' })
    }
    const { rows } = await db.query(`
      INSERT INTO consultant_mapping
        (thynkflow_user_id, registration_consultant_id, registration_consultant_code, registration_consultant_name, created_by)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (thynkflow_user_id) DO UPDATE SET
        registration_consultant_id   = EXCLUDED.registration_consultant_id,
        registration_consultant_code = EXCLUDED.registration_consultant_code,
        registration_consultant_name = EXCLUDED.registration_consultant_name,
        updated_at = NOW()
      RETURNING *
    `, [thynkflow_user_id, registration_consultant_id, registration_consultant_code || null, registration_consultant_name || null, req.user.id])
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.delete('/registration-integration/consultant-mapping/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM consultant_mapping WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// Product ↔ Program mapping
// ─────────────────────────────────────────────────────────────
router.get('/registration-integration/product-mapping', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT ppm.*, p.name AS thynkflow_product_name
      FROM product_program_mapping ppm
      JOIN products p ON p.id = ppm.thynkflow_product_id
      ORDER BY p.name
    `)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/registration-integration/product-mapping', auth, adminOnly, async (req, res) => {
  try {
    const { thynkflow_product_id, registration_project_id, registration_project_name, registration_project_slug } = req.body
    if (!thynkflow_product_id || !registration_project_id) {
      return res.status(400).json({ success: false, message: 'thynkflow_product_id and registration_project_id are required' })
    }
    const { rows } = await db.query(`
      INSERT INTO product_program_mapping
        (thynkflow_product_id, registration_project_id, registration_project_name, registration_project_slug, created_by)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (thynkflow_product_id) DO UPDATE SET
        registration_project_id   = EXCLUDED.registration_project_id,
        registration_project_name = EXCLUDED.registration_project_name,
        registration_project_slug = EXCLUDED.registration_project_slug,
        updated_at = NOW()
      RETURNING *
    `, [thynkflow_product_id, registration_project_id, registration_project_name || null, registration_project_slug || null, req.user.id])
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.delete('/registration-integration/product-mapping/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM product_program_mapping WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// THE PUSH — POST /api/leads/:id/push-to-registration
// Called by the "Create School" button once a lead is Converted.
// Any authenticated user can trigger it for their own lead (agents
// convert their own leads); admins can trigger it for any lead.
// ─────────────────────────────────────────────────────────────
router.post('/leads/:id/push-to-registration', auth, async (req, res) => {
  try {
    const leadId = req.params.id

    const { rows: leadRows } = await db.query(`SELECT * FROM leads WHERE id = $1`, [leadId])
    const lead = leadRows[0]
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })

    const isAgent = req.user.role_name === 'agent'
    if (isAgent && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only push your own leads' })
    }

    if (lead.status !== 'converted') {
      return res.status(400).json({ success: false, message: 'Lead must be Converted before a school can be created' })
    }

    if (lead.registration_school_id) {
      return res.status(409).json({
        success: false,
        message: 'A school was already created for this lead',
        data: { registration_school_id: lead.registration_school_id, registration_school_code: lead.registration_school_code },
      })
    }

    if (!lead.assigned_to) {
      return res.status(400).json({ success: false, message: 'Lead has no assigned consultant — cannot determine who the school belongs to' })
    }
    if (!lead.product_id) {
      return res.status(400).json({ success: false, message: 'Lead has no product — cannot determine which program to register under' })
    }

    // Resolve mappings
    const { rows: cmRows } = await db.query(
      `SELECT * FROM consultant_mapping WHERE thynkflow_user_id = $1`, [lead.assigned_to]
    )
    const consultantMap = cmRows[0]
    if (!consultantMap) {
      return res.status(400).json({
        success: false,
        message: 'This consultant is not yet mapped to a Registration account. Ask an admin to add the mapping in Settings → Registration Integration.',
      })
    }

    const { rows: pmRows } = await db.query(
      `SELECT * FROM product_program_mapping WHERE thynkflow_product_id = $1`, [lead.product_id]
    )
    const productMap = pmRows[0]
    if (!productMap) {
      return res.status(400).json({
        success: false,
        message: 'This product is not yet mapped to a Registration program. Ask an admin to add the mapping in Settings → Registration Integration.',
      })
    }

    const regConfig = await getRegistrationConfig()
    if (!regConfig.base_url || !regConfig.api_key) {
      return res.status(400).json({ success: false, message: 'Registration integration is not configured yet (base URL / API key missing).' })
    }
    if (!/^https?:\/\//i.test(regConfig.base_url)) {
      return res.status(400).json({ success: false, message: `The saved Registration Base URL ("${regConfig.base_url}") is invalid — it must start with https://. Fix it in Settings → Registration Sync.` })
    }

    // Build the (partial) payload — Registration fills in whatever's missing
    const contactPersons = []
    if (lead.contact_name || lead.phone || lead.email) {
      contactPersons.push({
        name:  lead.contact_name || '',
        email: lead.email || '',
        mobile: lead.phone || '',
        designation: '',
      })
    }

    const payload = {
      name:        lead.school_name || lead.contact_name || 'Untitled School',
      org_name:    lead.school_name || undefined,
      city:        lead.city || undefined,
      contact_persons: contactPersons,
      project_id:      productMap.registration_project_id,
      consultant_id:   consultantMap.registration_consultant_id,
      source_system:   'thynkflow',
      source_lead_id:  lead.id,
    }

    let apiRes, apiJson
    try {
      apiRes = await fetch(`${regConfig.base_url}/api/integration/thynkflow-school`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': regConfig.api_key },
        body: JSON.stringify(payload),
      })
      const rawText = await apiRes.text()
      try {
        apiJson = JSON.parse(rawText)
      } catch {
        const msg = `Registration returned a non-JSON response (status ${apiRes.status}). This usually means the URL is wrong, the endpoint isn't deployed yet, or something on Registration's server (a login wall, firewall, or crash page) is blocking the request before it reaches the app. First 200 chars: ${rawText.slice(0, 200)}`
        await db.query(`UPDATE leads SET registration_push_error = $2 WHERE id = $1`, [leadId, msg])
        return res.status(502).json({ success: false, message: msg })
      }
    } catch (fetchErr) {
      await db.query(`UPDATE leads SET registration_push_error = $2 WHERE id = $1`, [leadId, fetchErr.message])
      return res.status(502).json({ success: false, message: `Could not reach Registration: ${fetchErr.message}` })
    }

    if (!apiRes.ok) {
      await db.query(`UPDATE leads SET registration_push_error = $2 WHERE id = $1`, [leadId, apiJson.error || 'Unknown error'])
      return res.status(apiRes.status).json({ success: false, message: apiJson.error || 'Registration rejected the request' })
    }

    await db.query(`
      UPDATE leads SET
        registration_school_id   = $2,
        registration_school_code = $3,
        registration_pushed_at   = NOW(),
        registration_pushed_by   = $4,
        registration_push_error  = NULL
      WHERE id = $1
    `, [leadId, apiJson.school?.id || null, apiJson.school?.school_code || null, req.user.id])

    res.json({
      success: true,
      data: {
        registration_school_id: apiJson.school?.id,
        registration_school_code: apiJson.school?.school_code,
        registration_admin_url: apiJson.admin_url || null,
      },
    })
  } catch (err) {
    console.error('push-to-registration error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
