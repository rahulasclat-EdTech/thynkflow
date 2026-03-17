const express = require('express');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Create settings table if not exists (run once)
async function ensureSettingsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      key VARCHAR(100) NOT NULL,
      label VARCHAR(200) NOT NULL,
      color VARCHAR(20) DEFAULT '#64748b',
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(category, key)
    );

    INSERT INTO app_settings (category, key, label, color, sort_order) VALUES
      ('lead_status', 'new', 'New', '#3b82f6', 1),
      ('lead_status', 'hot', 'Hot Lead', '#ef4444', 2),
      ('lead_status', 'warm', 'Warm Lead', '#f59e0b', 3),
      ('lead_status', 'cold', 'Cold Lead', '#94a3b8', 4),
      ('lead_status', 'converted', 'Converted', '#22c55e', 5),
      ('lead_status', 'not_interested', 'Not Interested', '#64748b', 6),
      ('lead_status', 'call_back', 'Call Back Later', '#a855f7', 7),
      ('lead_source', 'excel_upload', 'Excel Upload', '#3b82f6', 1),
      ('lead_source', 'manual', 'Manual Entry', '#f59e0b', 2),
      ('lead_source', 'paste', 'Copy Paste', '#22c55e', 3),
      ('lead_source', 'referral', 'Referral', '#a855f7', 4),
      ('lead_source', 'website', 'Website', '#ef4444', 5),
      ('lead_source', 'social_media', 'Social Media', '#0ea5e9', 6),
      ('city', 'delhi', 'Delhi', '#3b82f6', 1),
      ('city', 'mumbai', 'Mumbai', '#f59e0b', 2),
      ('city', 'bangalore', 'Bangalore', '#22c55e', 3),
      ('city', 'hyderabad', 'Hyderabad', '#ef4444', 4),
      ('city', 'chennai', 'Chennai', '#a855f7', 5),
      ('city', 'pune', 'Pune', '#0ea5e9', 6)
    ON CONFLICT (category, key) DO NOTHING;
  `);
}

ensureSettingsTable().catch(console.error);

// GET /api/settings - get all settings grouped by category
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM app_settings ORDER BY category, sort_order, label
    `);

    const grouped = rows.reduce((acc, row) => {
      if (!acc[row.category]) acc[row.category] = [];
      acc[row.category].push(row);
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/settings/:category - get settings for one category
router.get('/:category', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM app_settings WHERE category = $1 AND is_active = true ORDER BY sort_order, label`,
      [req.params.category]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/settings - add new setting
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { category, key, label, color, sort_order } = req.body;
    if (!category || !key || !label) {
      return res.status(400).json({ success: false, message: 'category, key and label are required' });
    }
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const { rows } = await db.query(
      `INSERT INTO app_settings (category, key, label, color, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [category, safeKey, label, color || '#64748b', sort_order || 0]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'This option already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/settings/:id - update setting
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { label, color, sort_order, is_active } = req.body;
    const { rows } = await db.query(
      `UPDATE app_settings SET label=$1, color=$2, sort_order=$3, is_active=$4 WHERE id=$5 RETURNING *`,
      [label, color, sort_order, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Setting not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/settings/:id - delete setting
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM app_settings WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Option deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/settings/:id/toggle - toggle active
router.patch('/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE app_settings SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
