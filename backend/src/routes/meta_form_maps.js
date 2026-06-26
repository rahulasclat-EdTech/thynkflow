// backend/src/routes/meta_form_maps.js
// ─────────────────────────────────────────────────────────────
// Admin API — Map Meta Lead Ad Form IDs to ThynkFlow Campaigns
//
// One mapping = one Meta form → one ThynkFlow campaign
// Multiple mappings can be active simultaneously
// ─────────────────────────────────────────────────────────────

const express = require('express');
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── DB BOOTSTRAP ─────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS meta_form_campaign_maps (
      id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      meta_form_id       VARCHAR(100) UNIQUE NOT NULL,
      meta_form_name     VARCHAR(200),
      meta_page_id       VARCHAR(100),
      meta_page_name     VARCHAR(200),
      campaign_id        UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      auto_assign_to     UUID REFERENCES users(id) ON DELETE SET NULL,
      default_product_id UUID,
      is_active          BOOLEAN DEFAULT TRUE,
      notes              TEXT,
      created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMP DEFAULT NOW(),
      updated_at         TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_meta_form_maps_form     ON meta_form_campaign_maps(meta_form_id);
    CREATE INDEX IF NOT EXISTS idx_meta_form_maps_campaign ON meta_form_campaign_maps(campaign_id);
  `);
}
ensureTable().catch(console.error);

// ── GET /api/meta/forms — list all mappings with campaign name ─
router.get('/forms', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        m.*,
        c.name          AS campaign_name,
        c.platform      AS campaign_platform,
        c.status        AS campaign_status,
        c.capture_token AS campaign_token,
        u.name          AS agent_name,
        p.name          AS product_name,
        COUNT(cl.lead_id)::int AS total_leads
      FROM meta_form_campaign_maps m
      JOIN  campaigns c   ON m.campaign_id        = c.id
      LEFT JOIN users   u ON m.auto_assign_to      = u.id
      LEFT JOIN products p ON m.default_product_id = p.id
      LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
      GROUP BY m.id, c.id, u.name, p.name
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/meta/forms/:id — single mapping ─────────────────
router.get('/forms/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.*, c.name AS campaign_name, u.name AS agent_name
      FROM meta_form_campaign_maps m
      JOIN  campaigns c  ON m.campaign_id   = c.id
      LEFT JOIN users u  ON m.auto_assign_to = u.id
      WHERE m.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/meta/forms — create mapping ────────────────────
router.post('/forms', auth, adminOnly, async (req, res) => {
  try {
    const {
      meta_form_id, meta_form_name, meta_page_id, meta_page_name,
      campaign_id, auto_assign_to, default_product_id, notes
    } = req.body;

    if (!meta_form_id) return res.status(400).json({ success: false, message: 'meta_form_id is required' });
    if (!campaign_id)  return res.status(400).json({ success: false, message: 'campaign_id is required' });

    const { rows } = await db.query(`
      INSERT INTO meta_form_campaign_maps
        (meta_form_id, meta_form_name, meta_page_id, meta_page_name,
         campaign_id, auto_assign_to, default_product_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (meta_form_id) DO UPDATE SET
        meta_form_name     = $2,
        meta_page_id       = $3,
        meta_page_name     = $4,
        campaign_id        = $5,
        auto_assign_to     = $6,
        default_product_id = $7,
        notes              = $8,
        is_active          = TRUE,
        updated_at         = NOW()
      RETURNING *
    `, [
      meta_form_id, meta_form_name || null,
      meta_page_id || null, meta_page_name || null,
      campaign_id,
      auto_assign_to     || null,
      default_product_id || null,
      notes              || null,
      req.user.id
    ]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/meta/forms/:id — update mapping ─────────────────
router.put('/forms/:id', auth, adminOnly, async (req, res) => {
  try {
    const {
      meta_form_name, meta_page_id, meta_page_name,
      campaign_id, auto_assign_to, default_product_id, is_active, notes
    } = req.body;

    const { rows } = await db.query(`
      UPDATE meta_form_campaign_maps SET
        meta_form_name     = $1,
        meta_page_id       = $2,
        meta_page_name     = $3,
        campaign_id        = $4,
        auto_assign_to     = $5,
        default_product_id = $6,
        is_active          = $7,
        notes              = $8,
        updated_at         = NOW()
      WHERE id = $9 RETURNING *
    `, [
      meta_form_name || null, meta_page_id || null, meta_page_name || null,
      campaign_id, auto_assign_to || null, default_product_id || null,
      is_active !== false, notes || null,
      req.params.id
    ]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/meta/forms/:id/toggle — pause / resume ────────
router.patch('/forms/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`
      UPDATE meta_form_campaign_maps
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/meta/forms/:id — remove mapping ──────────────
router.delete('/forms/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM meta_form_campaign_maps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
