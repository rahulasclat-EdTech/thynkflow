// backend/src/routes/meta_webhook.js
// ─────────────────────────────────────────────────────────────
// Meta Lead Ads CRM Webhook
//
// Register this URL in Meta Business Suite:
//   Settings → Integrations → Leads Access → Assign CRM
//   Webhook URL  : https://<your-domain>/api/meta/webhook
//   Verify Token : value of META_WEBHOOK_VERIFY_TOKEN env var
//
// Two env vars required (add to your .env / Railway / Render):
//   META_WEBHOOK_VERIFY_TOKEN   — any random string you choose
//   META_APP_SECRET             — from Meta App → App Settings → Basic
//
// Optional env vars:
//   META_DEFAULT_ASSIGN_TO      — UUID of agent to auto-assign Meta leads
//   META_DEFAULT_PRODUCT_ID     — UUID of product to tag Meta leads with
// ─────────────────────────────────────────────────────────────

const express = require('express');
const crypto  = require('crypto');
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { createNotif }     = require('./notifications');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// DB BOOTSTRAP — stores per-page Meta config
// ─────────────────────────────────────────────────────────────
async function ensureMetaConfigTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS meta_page_configs (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      page_id         VARCHAR(100) UNIQUE NOT NULL,
      page_name       VARCHAR(200),
      auto_assign_to  UUID REFERENCES users(id) ON DELETE SET NULL,
      default_product_id UUID,
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureMetaConfigTable().catch(console.error);

// ─────────────────────────────────────────────────────────────
// HELPER — verify Meta's X-Hub-Signature-256 header
// ─────────────────────────────────────────────────────────────
function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true; // skip if not configured (dev mode)

  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ─────────────────────────────────────────────────────────────
// HELPER — extract field value from Meta's field_data array
// field_data: [{ name: 'full_name', values: ['John Doe'] }, ...]
// ─────────────────────────────────────────────────────────────
function getField(fieldData, ...keys) {
  for (const key of keys) {
    const found = fieldData.find(f =>
      f.name?.toLowerCase().replace(/[\s_-]/g, '') ===
      key.toLowerCase().replace(/[\s_-]/g, '')
    );
    if (found?.values?.[0]) return found.values[0];
  }
  return '';
}

// ─────────────────────────────────────────────────────────────
// GET /api/meta/webhook
// Meta webhook verification handshake
// ─────────────────────────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[META WEBHOOK] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[META WEBHOOK] Verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/meta/webhook
// Real-time lead delivery from Meta Lead Ads
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Always respond 200 immediately — Meta will retry if you don't
  res.status(200).json({ success: true });

  try {
    // Signature check
    if (!verifyMetaSignature(req)) {
      console.warn('[META WEBHOOK] Invalid signature — ignoring');
      return;
    }

    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of (body.entry || [])) {
      const pageId = entry.id;

      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;

        const value      = change.value || {};
        const leadgenId  = value.leadgen_id;
        const formId     = value.form_id;
        const adId       = value.ad_id;
        const adName     = value.ad_name    || '';
        const formName   = value.form_name  || '';
        const fieldData  = value.field_data || [];

        // Extract lead fields — handles common Meta form field names
        const contact_name =
          getField(fieldData, 'full_name', 'name') ||
          [
            getField(fieldData, 'first_name', 'firstname'),
            getField(fieldData, 'last_name', 'lastname'),
          ].filter(Boolean).join(' ');

        const phone =
          getField(fieldData, 'phone_number', 'phone', 'mobile', 'whatsapp_number');

        const email =
          getField(fieldData, 'email', 'email_address', 'work_email');

        const city =
          getField(fieldData, 'city', 'location');

        const school_name =
          getField(fieldData, 'school_name', 'school', 'organization', 'company_name', 'company');

        if (!phone && !email) {
          console.warn('[META WEBHOOK] Lead missing phone & email — skipping', leadgenId);
          continue;
        }

        // Duplicate check — same leadgen_id
        const { rows: dupCheck } = await db.query(
          `SELECT id FROM leads WHERE admin_remark LIKE $1 LIMIT 1`,
          [`%leadgen_id:${leadgenId}%`]
        );
        if (dupCheck.length) {
          console.log('[META WEBHOOK] Duplicate leadgen_id:', leadgenId);
          continue;
        }

        // Per-page config (auto_assign, product)
        let pageCfg = {};
        try {
          const { rows } = await db.query(
            `SELECT * FROM meta_page_configs WHERE page_id = $1 AND is_active = TRUE`,
            [pageId]
          );
          pageCfg = rows[0] || {};
        } catch {}

        const auto_assign_to   = pageCfg.auto_assign_to   || process.env.META_DEFAULT_ASSIGN_TO   || null;
        const default_product  = pageCfg.default_product_id || process.env.META_DEFAULT_PRODUCT_ID || null;

        const creation_comment =
          `Via Meta Lead Ad | Form: ${formName} | Ad: ${adName} | leadgen_id:${leadgenId}`;

        // Insert lead
        const { rows: leadRows } = await db.query(
          `INSERT INTO leads (
             contact_name, school_name, phone, email, city,
             source, status, product_id, lead_type,
             creation_comment, admin_remark, assigned_to,
             created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,'meta_lead_ad','new',$6,'B2B',$7,$8,$9,NOW(),NOW())
           RETURNING *`,
          [
            contact_name.trim()  || null,
            school_name.trim()   || null,
            (phone || '').trim() || null,
            (email || '').trim() || null,
            city.trim()          || null,
            default_product,
            creation_comment,
            creation_comment,       // admin_remark stores leadgen_id for dup-check
            auto_assign_to,
          ]
        );
        const lead = leadRows[0];

        // Also store raw Meta payload in campaign_leads if a matching campaign exists
        // (optional — links Meta leads to a ThynkFlow campaign by form_id)
        try {
          const { rows: camps } = await db.query(
            `SELECT id FROM campaigns WHERE utm_content = $1 OR notes LIKE $2 LIMIT 1`,
            [formId, `%form_id:${formId}%`]
          );
          if (camps.length) {
            await db.query(
              `INSERT INTO campaign_leads (campaign_id, lead_id, raw_payload)
               VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
              [camps[0].id, lead.id, JSON.stringify(value)]
            );
          }
        } catch {}

        // Notify assigned agent
        if (auto_assign_to) {
          createNotif(
            auto_assign_to,
            'campaign_lead',
            '📣 New Meta Lead Ad Lead',
            `${contact_name || phone} submitted the form "${formName}"`,
            lead.id
          );
        }

        console.log('[META WEBHOOK] Lead captured:', lead.id, contact_name, phone);
      }
    }
  } catch (err) {
    console.error('[META WEBHOOK] Processing error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN — GET /api/meta/pages
// List all configured Meta page mappings
// ─────────────────────────────────────────────────────────────
router.get('/pages', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.*, u.name AS agent_name, p.name AS product_name
      FROM meta_page_configs m
      LEFT JOIN users    u ON m.auto_assign_to = u.id
      LEFT JOIN products p ON m.default_product_id = p.id
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN — POST /api/meta/pages
// Add / update a Meta page config
// ─────────────────────────────────────────────────────────────
router.post('/pages', auth, adminOnly, async (req, res) => {
  try {
    const { page_id, page_name, auto_assign_to, default_product_id, is_active } = req.body;
    if (!page_id) return res.status(400).json({ success: false, message: 'page_id is required' });

    const { rows } = await db.query(`
      INSERT INTO meta_page_configs (page_id, page_name, auto_assign_to, default_product_id, is_active)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (page_id) DO UPDATE SET
        page_name          = $2,
        auto_assign_to     = $3,
        default_product_id = $4,
        is_active          = $5,
        updated_at         = NOW()
      RETURNING *
    `, [page_id, page_name || null, auto_assign_to || null, default_product_id || null, is_active !== false]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN — DELETE /api/meta/pages/:page_id
// ─────────────────────────────────────────────────────────────
router.delete('/pages/:page_id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM meta_page_configs WHERE page_id = $1`, [req.params.page_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN — GET /api/meta/config
// Returns current webhook URL + verify token (masked) for display
// ─────────────────────────────────────────────────────────────
router.get('/config', auth, adminOnly, (req, res) => {
  const host = process.env.PUBLIC_URL || `https://your-domain.com`;
  res.json({
    success: true,
    data: {
      webhook_url:   `${host}/api/meta/webhook`,
      verify_token:  process.env.META_WEBHOOK_VERIFY_TOKEN
        ? '••••••' + process.env.META_WEBHOOK_VERIFY_TOKEN.slice(-4)
        : '(not set — add META_WEBHOOK_VERIFY_TOKEN to env)',
      app_secret_set: !!process.env.META_APP_SECRET,
    }
  });
});

module.exports = router;
