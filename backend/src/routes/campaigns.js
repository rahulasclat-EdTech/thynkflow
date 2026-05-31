// backend/src/routes/campaigns.js — External Campaign Tracking + Lead Capture
const express = require('express');
const crypto  = require('crypto');
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { createNotif }     = require('./notifications');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// DB BOOTSTRAP — runs once on startup
// ─────────────────────────────────────────────────────────────
async function ensureCampaignTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name           VARCHAR(200) NOT NULL,
      platform       VARCHAR(50)  NOT NULL DEFAULT 'facebook',
      status         VARCHAR(20)  NOT NULL DEFAULT 'active',
      budget         NUMERIC(12,2),
      currency       VARCHAR(5)   DEFAULT 'INR',
      objective      VARCHAR(100),
      target_url     TEXT,
      utm_source     VARCHAR(100),
      utm_medium     VARCHAR(100),
      utm_campaign   VARCHAR(100),
      utm_content    VARCHAR(100),
      capture_token  VARCHAR(64)  UNIQUE NOT NULL,
      auto_assign_to UUID REFERENCES users(id) ON DELETE SET NULL,
      default_product_id UUID,
      notes          TEXT,
      start_date     DATE,
      end_date       DATE,
      created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_leads (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      lead_id      UUID NOT NULL REFERENCES leads(id)     ON DELETE CASCADE,
      captured_at  TIMESTAMP DEFAULT NOW(),
      raw_payload  JSONB,
      UNIQUE(campaign_id, lead_id)
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead    ON campaign_leads(lead_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_token        ON campaigns(capture_token);
  `);
}
ensureCampaignTables().catch(console.error);

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─────────────────────────────────────────────────────────────
// PUBLIC — POST /api/campaigns/capture/:token
// Receives leads from FB lead ads, landing pages, Zapier, etc.
// ─────────────────────────────────────────────────────────────
router.post('/capture/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Lookup campaign
    const { rows: camps } = await db.query(
      `SELECT * FROM campaigns WHERE capture_token = $1 AND status = 'active'`,
      [token]
    );
    if (!camps.length) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive campaign token' });
    }
    const campaign = camps[0];

    const payload = req.body || {};

    // Normalise field names from various ad platforms
    const contact_name =
      payload.contact_name ||
      payload.full_name    ||
      payload.name         ||
      [payload.first_name, payload.last_name].filter(Boolean).join(' ') ||
      '';

    const phone =
      payload.phone        ||
      payload.phone_number ||
      payload.mobile       ||
      payload.whatsapp     ||
      '';

    const email =
      payload.email        ||
      payload.email_address ||
      '';

    const city =
      payload.city         ||
      payload.location     ||
      '';

    const school_name =
      payload.school_name  ||
      payload.school       ||
      payload.organization ||
      payload.company      ||
      '';

    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required' });
    }

    // Check duplicate phone within same campaign
    const { rows: dupRows } = await db.query(
      `SELECT l.id FROM leads l
       JOIN campaign_leads cl ON cl.lead_id = l.id
       WHERE cl.campaign_id = $1 AND l.phone = $2`,
      [campaign.id, phone.trim()]
    );
    if (dupRows.length) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Lead already captured for this campaign',
        lead_id: dupRows[0].id,
      });
    }

    // Build UTM-enriched source tag
    const source = `campaign_${campaign.platform}`;

    // Insert lead
    const { rows: leadRows } = await db.query(
      `INSERT INTO leads (
         contact_name, school_name, phone, email, city,
         source, status, product_id, lead_type, creation_comment,
         assigned_to
       ) VALUES ($1,$2,$3,$4,$5,$6,'new',$7,'B2C',$8,$9)
       RETURNING *`,
      [
        contact_name.trim()      || null,
        school_name.trim()       || null,
        phone.trim(),
        email.trim()             || null,
        city.trim()              || null,
        source,
        campaign.default_product_id || null,
        `Via campaign: ${campaign.name}`,
        campaign.auto_assign_to  || null,
      ]
    );
    const lead = leadRows[0];

    // Link lead to campaign
    await db.query(
      `INSERT INTO campaign_leads (campaign_id, lead_id, raw_payload)
       VALUES ($1, $2, $3)`,
      [campaign.id, lead.id, JSON.stringify(payload)]
    );

    // Notify assigned agent if set
    if (campaign.auto_assign_to) {
      createNotif(
        campaign.auto_assign_to,
        'campaign_lead',
        '📣 New Campaign Lead',
        `New lead from "${campaign.name}" (${campaign.platform})`,
        lead.id
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Lead captured successfully',
      lead_id: lead.id,
    });
  } catch (err) {
    console.error('[CAMPAIGN CAPTURE]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUBLIC — GET /api/campaigns/capture/:token/form
// Returns a minimal landing-page form HTML (optional embed)
// ─────────────────────────────────────────────────────────────
router.get('/capture/:token/form', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT name, platform, objective FROM campaigns WHERE capture_token = $1 AND status = 'active'`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).send('<h2>Campaign not found</h2>');
    const c = rows[0];
    const postUrl = `${req.protocol}://${req.get('host')}/api/campaigns/capture/${req.params.token}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.name} — Lead Form</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
  .card{background:#fff;border-radius:16px;padding:2rem;width:100%;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.10)}
  h2{font-size:1.25rem;font-weight:700;margin-bottom:.25rem;color:#1e293b}
  p.sub{font-size:.85rem;color:#64748b;margin-bottom:1.5rem}
  label{display:block;font-size:.8rem;font-weight:600;color:#475569;margin-bottom:.4rem;margin-top:1rem}
  input{width:100%;padding:.7rem 1rem;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.95rem;outline:none;transition:border .2s}
  input:focus{border-color:#6366f1}
  button{margin-top:1.5rem;width:100%;padding:.85rem;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}
  button:hover{background:#4f46e5}
  .success{display:none;text-align:center;padding:2rem 0;color:#22c55e;font-weight:600;font-size:1.1rem}
</style>
</head>
<body>
<div class="card">
  <h2>${c.name}</h2>
  <p class="sub">${c.objective || 'Please fill in your details below.'}</p>
  <div id="form-wrap">
    <label>Full Name</label><input type="text" id="f_name" placeholder="Your name">
    <label>Phone Number *</label><input type="tel" id="f_phone" placeholder="+91 XXXXX XXXXX" required>
    <label>Email</label><input type="email" id="f_email" placeholder="you@example.com">
    <label>School / Organization</label><input type="text" id="f_school" placeholder="School name">
    <label>City</label><input type="text" id="f_city" placeholder="Delhi">
    <button onclick="submitForm()">Submit →</button>
  </div>
  <div class="success" id="success-msg">✅ Thank you! We'll be in touch soon.</div>
</div>
<script>
async function submitForm(){
  const phone=document.getElementById('f_phone').value.trim();
  if(!phone){alert('Phone number is required');return}
  const btn=document.querySelector('button');
  btn.disabled=true;btn.textContent='Submitting…';
  try{
    const r=await fetch('${postUrl}',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:document.getElementById('f_name').value,
        phone,email:document.getElementById('f_email').value,
        school_name:document.getElementById('f_school').value,
        city:document.getElementById('f_city').value
      })});
    const d=await r.json();
    if(d.success){document.getElementById('form-wrap').style.display='none';document.getElementById('success-msg').style.display='block';}
    else{alert(d.message||'Submission failed');btn.disabled=false;btn.textContent='Submit →';}
  }catch(e){alert('Network error');btn.disabled=false;btn.textContent='Submit →';}
}
</script>
</body></html>`);
  } catch (err) {
    res.status(500).send('<h2>Error</h2>');
  }
});

// ─────────────────────────────────────────────────────────────
// AUTH REQUIRED below
// ─────────────────────────────────────────────────────────────

// GET /api/campaigns — list all campaigns with lead counts
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        c.*,
        u.name  AS assigned_agent_name,
        COUNT(cl.lead_id)::int AS lead_count,
        COUNT(cl.lead_id) FILTER (
          WHERE cl.captured_at >= NOW() - INTERVAL '7 days'
        )::int AS leads_last_7d,
        COUNT(cl.lead_id) FILTER (
          WHERE cl.captured_at >= NOW() - INTERVAL '30 days'
        )::int AS leads_last_30d
      FROM campaigns c
      LEFT JOIN users u ON c.auto_assign_to = u.id
      LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
      GROUP BY c.id, u.name
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/campaigns/:id — single campaign with recent leads
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: campRows } = await db.query(
      `SELECT c.*, u.name AS assigned_agent_name
       FROM campaigns c LEFT JOIN users u ON c.auto_assign_to = u.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!campRows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const { rows: leads } = await db.query(
      `SELECT l.*, cl.captured_at, cl.raw_payload
       FROM campaign_leads cl
       JOIN leads l ON l.id = cl.lead_id
       WHERE cl.campaign_id = $1
       ORDER BY cl.captured_at DESC
       LIMIT 200`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...campRows[0], leads } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/campaigns — create campaign (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const {
      name, platform, budget, currency, objective,
      target_url, utm_source, utm_medium, utm_campaign, utm_content,
      auto_assign_to, default_product_id, notes, start_date, end_date,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const token = genToken();
    const { rows } = await db.query(
      `INSERT INTO campaigns (
         name, platform, budget, currency, objective,
         target_url, utm_source, utm_medium, utm_campaign, utm_content,
         capture_token, auto_assign_to, default_product_id, notes,
         start_date, end_date, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        name, platform || 'facebook', budget || null, currency || 'INR',
        objective || null, target_url || null,
        utm_source || null, utm_medium || null, utm_campaign || null, utm_content || null,
        token,
        auto_assign_to || null,
        default_product_id || null,
        notes || null,
        start_date || null,
        end_date || null,
        req.user.id,
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/campaigns/:id — update campaign
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const {
      name, platform, status, budget, currency, objective,
      target_url, utm_source, utm_medium, utm_campaign, utm_content,
      auto_assign_to, default_product_id, notes, start_date, end_date,
    } = req.body;

    const { rows } = await db.query(
      `UPDATE campaigns SET
         name=$1, platform=$2, status=$3, budget=$4, currency=$5,
         objective=$6, target_url=$7,
         utm_source=$8, utm_medium=$9, utm_campaign=$10, utm_content=$11,
         auto_assign_to=$12, default_product_id=$13, notes=$14,
         start_date=$15, end_date=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [
        name, platform, status, budget || null, currency || 'INR',
        objective || null, target_url || null,
        utm_source || null, utm_medium || null, utm_campaign || null, utm_content || null,
        auto_assign_to || null,
        default_product_id || null,
        notes || null,
        start_date || null,
        end_date || null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/campaigns/:id/regenerate-token — get fresh capture token
router.post('/:id/regenerate-token', auth, adminOnly, async (req, res) => {
  try {
    const token = genToken();
    const { rows } = await db.query(
      `UPDATE campaigns SET capture_token=$1, updated_at=NOW() WHERE id=$2 RETURNING capture_token`,
      [token, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, capture_token: rows[0].capture_token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
