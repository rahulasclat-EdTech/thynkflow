// backend/src/routes/meta_webhook.js
// ─────────────────────────────────────────────────────────────
// Meta Lead Ads Webhook — Multi-Campaign Version
//
// Each Meta form is mapped to a ThynkFlow campaign via meta_form_campaign_maps.
// Multiple campaigns run simultaneously — leads are segmented per form/campaign.
//
// Env vars required:
//   META_WEBHOOK_VERIFY_TOKEN   — any string you choose (set same in Meta)
//   META_APP_SECRET             — from Meta App → App Settings → Basic
//   PUBLIC_URL                  — https://your-domain.com
// ─────────────────────────────────────────────────────────────

const express = require('express');
const crypto  = require('crypto');
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { createNotif }     = require('./notifications');

const router = express.Router();

// ─── SIGNATURE VERIFICATION ──────────────────────────────────
function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true; // skip in dev if not set

  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig.padEnd(71, '=')),
      Buffer.from(expected.padEnd(71, '='))
    );
  } catch { return false; }
}

// ─── FIELD EXTRACTOR ─────────────────────────────────────────
// Meta sends: field_data: [{ name: 'full_name', values: ['John'] }, ...]
function getField(fieldData, ...keys) {
  for (const key of keys) {
    const found = fieldData.find(f =>
      f.name?.toLowerCase().replace(/[\s_\-]/g, '') ===
      key.toLowerCase().replace(/[\s_\-]/g, '')
    );
    if (found?.values?.[0]) return String(found.values[0]).trim();
  }
  return '';
}

// ─────────────────────────────────────────────────────────────
// GET /api/meta/webhook  — Meta verification handshake
// ─────────────────────────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[META] Webhook verified ✓');
    return res.status(200).send(challenge);
  }
  console.warn('[META] Webhook verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/meta/webhook  — Lead delivery from Meta
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Always 200 immediately — Meta retries if it doesn't get this fast
  res.status(200).json({ success: true });

  try {
    if (!verifyMetaSignature(req)) {
      console.warn('[META] Invalid signature — dropped');
      return;
    }

    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;

        const value     = change.value || {};
        const formId    = value.form_id;
        const leadgenId = value.leadgen_id;
        const adName    = value.ad_name   || '';
        const formName  = value.form_name || '';
        const fieldData = value.field_data || [];

        // ── 1. Look up which campaign this form belongs to ──
        const { rows: maps } = await db.query(`
          SELECT m.*, c.name AS campaign_name, c.platform
          FROM meta_form_campaign_maps m
          JOIN campaigns c ON m.campaign_id = c.id
          WHERE m.meta_form_id = $1
            AND m.is_active = TRUE
            AND c.status    = 'active'
          LIMIT 1
        `, [formId]);

        if (!maps.length) {
          // Form not mapped — log and store as uncategorised
          console.warn(`[META] No active campaign mapping for form_id: ${formId} (${formName}). Lead dropped. Map it in ThynkFlow → Meta Forms.`);
          continue;
        }

        const map = maps[0];

        // ── 2. Duplicate check by leadgen_id ────────────────
        const { rows: dup } = await db.query(
          `SELECT id FROM leads WHERE creation_comment LIKE $1 LIMIT 1`,
          [`%leadgen:${leadgenId}%`]
        );
        if (dup.length) {
          console.log(`[META] Duplicate leadgen_id ${leadgenId} — skipped`);
          continue;
        }

        // ── 3. Extract fields ────────────────────────────────
        const contact_name =
          getField(fieldData, 'full_name', 'name') ||
          [
            getField(fieldData, 'first_name', 'firstname'),
            getField(fieldData, 'last_name',  'lastname'),
          ].filter(Boolean).join(' ');

        const phone = getField(
          fieldData,
          'phone_number', 'phone', 'mobile', 'whatsapp_number', 'contact_number'
        );

        const email = getField(
          fieldData,
          'email', 'email_address', 'work_email'
        );

        const city = getField(fieldData, 'city', 'location', 'area');

        const school_name = getField(
          fieldData,
          'school_name', 'school', 'organization', 'company_name', 'company', 'institution'
        );

        if (!phone && !email) {
          console.warn(`[META] Lead ${leadgenId} has no phone or email — skipped`);
          continue;
        }

        // ── 4. Insert lead ───────────────────────────────────
        const creation_comment =
          `Via Meta Lead Ad | Form: ${formName} | Ad: ${adName} | Campaign: ${map.campaign_name} | leadgen:${leadgenId}`;

        const { rows: leadRows } = await db.query(`
          INSERT INTO leads (
            contact_name, school_name, phone, email, city,
            source, status, product_id, lead_type,
            creation_comment, admin_remark,
            assigned_to, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,'meta_lead_ad','new',$6,'B2B',$7,$8,$9,NOW(),NOW())
          RETURNING *
        `, [
          contact_name || null,
          school_name  || null,
          phone        || null,
          email        || null,
          city         || null,
          map.default_product_id || null,
          creation_comment,
          creation_comment,
          map.auto_assign_to || null,
        ]);

        const lead = leadRows[0];

        // ── 5. Link to campaign ──────────────────────────────
        await db.query(`
          INSERT INTO campaign_leads (campaign_id, lead_id, raw_payload)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [map.campaign_id, lead.id, JSON.stringify(value)]);

        // ── 6. Notify agent ──────────────────────────────────
        if (map.auto_assign_to) {
          createNotif(
            map.auto_assign_to,
            'campaign_lead',
            '📣 New Meta Lead',
            `${contact_name || phone || email} — from "${map.campaign_name}"`,
            lead.id
          );
        }

        console.log(`[META] ✓ Lead captured → campaign: "${map.campaign_name}" | lead_id: ${lead.id}`);
      }
    }
  } catch (err) {
    console.error('[META] Webhook processing error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/meta/config — show webhook URL for admin display
// ─────────────────────────────────────────────────────────────
router.get('/config', auth, adminOnly, (req, res) => {
  const host = process.env.PUBLIC_URL || 'https://your-domain.com';
  res.json({
    success: true,
    data: {
      webhook_url:    `${host}/api/meta/webhook`,
      verify_token:   process.env.META_WEBHOOK_VERIFY_TOKEN
        ? '••••' + process.env.META_WEBHOOK_VERIFY_TOKEN.slice(-4)
        : '(not set)',
      app_secret_set: !!process.env.META_APP_SECRET,
    }
  });
});

module.exports = router;
