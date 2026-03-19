// ============================================================
//  ThynkFlow — LEADS ADDITIONS
//  ADD these routes to backend/src/routes/leads.js
//  Also run the SQL migration below in your DB first.
// ============================================================
//
//  --- SQL MIGRATION (run once in your PostgreSQL DB) ---
//
//  ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);
//  ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_detail TEXT;
//  ALTER TABLE leads ADD COLUMN IF NOT EXISTS admin_remark TEXT;
//
//  CREATE TABLE IF NOT EXISTS communication_logs (
//    id            SERIAL PRIMARY KEY,
//    lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
//    agent_id      INTEGER NOT NULL REFERENCES users(id),
//    type          VARCHAR(20) NOT NULL CHECK (type IN ('call','whatsapp','email')),
//    direction     VARCHAR(10) DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
//    note          TEXT,
//    duration_sec  INTEGER,   -- for calls only
//    created_at    TIMESTAMP DEFAULT NOW()
//  );
//  CREATE INDEX IF NOT EXISTS idx_comm_logs_lead ON communication_logs(lead_id);
//  CREATE INDEX IF NOT EXISTS idx_comm_logs_agent ON communication_logs(agent_id);
//
// ============================================================

const express = require('express');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router(); // attach to existing leads router

// ------------------------------------------------------------------
// PRODUCT ON LEAD
// ------------------------------------------------------------------

// PATCH /api/leads/:id/product  — assign or update product on a lead
router.patch('/:id/product', auth, async (req, res) => {
  try {
    const { product_id, product_detail } = req.body;
    const { rows } = await db.query(
      `UPDATE leads
          SET product_id     = $1,
              product_detail = $2,
              updated_at     = NOW()
        WHERE id = $3
        RETURNING *`,
      [product_id || null, product_detail || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------
// COMMUNICATION LOGS
// ------------------------------------------------------------------

// GET /api/leads/:id/communications  — fetch all comm logs for a lead
router.get('/:id/communications', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT cl.*, u.name as agent_name, u.phone as agent_phone
         FROM communication_logs cl
         JOIN users u ON cl.agent_id = u.id
        WHERE cl.lead_id = $1
        ORDER BY cl.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/leads/:id/communications  — log a new comm event
router.post('/:id/communications', auth, async (req, res) => {
  try {
    const { type, direction, note, duration_sec } = req.body;
    if (!['call', 'whatsapp', 'email'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be call, whatsapp, or email' });
    }
    const { rows } = await db.query(
      `INSERT INTO communication_logs (lead_id, agent_id, type, direction, note, duration_sec)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.params.id, req.user.id, type, direction || 'outbound', note || '', duration_sec || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/leads/communications/:logId  — delete a log entry (admin only)
router.delete('/communications/:logId', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM communication_logs WHERE id = $1', [req.params.logId]);
    res.json({ success: true, message: 'Log deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------
// BULK CREATE WITH PRODUCT (paste / excel import)
// These replace / augment the existing bulk-create logic.
// When you process uploaded Excel rows, map the "Product" column to
// product_id by looking up the products table by name.
// ------------------------------------------------------------------

// POST /api/leads/lookup-products  — resolve product names → IDs (for paste/import)
router.post('/lookup-products', auth, async (req, res) => {
  try {
    const { names } = req.body; // array of product name strings
    if (!Array.isArray(names) || !names.length) {
      return res.json({ success: true, data: {} });
    }
    const { rows } = await db.query(
      `SELECT id, name FROM products WHERE LOWER(name) = ANY($1::text[]) AND is_active = true`,
      [names.map(n => n.toLowerCase())]
    );
    const map = {};
    rows.forEach(r => { map[r.name.toLowerCase()] = r.id; });
    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ------------------------------------------------------------------
// BULK CREATE — POST /api/leads/bulk
// Used by Excel import and paste import
// Body: { leads: [ { name, phone, email, city, source, status,
//                    school_name, lead_type, creation_comment,
//                    product_id, assigned_to } ] }
// ------------------------------------------------------------------
router.post('/bulk', auth, async (req, res) => {
  try {
    const { leads } = req.body
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: 'No leads provided' })
    }

    // Filter out rows with no name and no phone
    const valid = leads.filter(l => (l.name || l.contact_name || '').toString().trim() || (l.phone || '').toString().trim())
    if (!valid.length) return res.json({ success: true, created: 0, skipped: leads.length })

    // Build a single multi-row INSERT for speed (handles 100 rows at once)
    const values = []
    const params = []
    let p = 1

    for (const lead of valid) {
      values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},NOW(),NOW())`)
      params.push(
        (lead.contact_name || lead.name || '').toString().trim(),
        lead.school_name?.toString().trim()      || null,
        (lead.phone || '').toString().trim()      || null,
        lead.email?.toString().trim()             || null,
        lead.city?.toString().trim()              || null,
        lead.source?.toString().trim()            || null,
        lead.status                               || 'new',
        lead.product_id                           || null,
        lead.creation_comment?.toString().trim()  || null,
        lead.assigned_to                          || req.user.id,
        lead.lead_type?.toString().trim()         || 'B2C',
        lead.creation_comment?.toString().trim()  || null
      )
      p += 12
    }

    const sql = `
      INSERT INTO leads (
        contact_name, school_name, phone, email, city, source,
        status, product_id, admin_remark, assigned_to,
        lead_type, creation_comment, created_at, updated_at
      ) VALUES ${values.join(',')}
      RETURNING id
    `
    const { rows } = await db.query(sql, params)

    res.json({
      success: true,
      created: rows.length,
      submitted: valid.length,
      skipped: leads.length - valid.length,
    })
  } catch (err) {
    console.error('Bulk import error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ------------------------------------------------------------------
// ASSIGN LEADS IN BULK — POST /api/leads/assign
// Body: { lead_ids: [uuid, uuid...], assigned_to: uuid }
// ------------------------------------------------------------------
router.post('/assign', auth, async (req, res) => {
  try {
    const { lead_ids, assigned_to } = req.body
    if (!Array.isArray(lead_ids) || !lead_ids.length)
      return res.status(400).json({ success: false, message: 'No lead_ids provided' })
    if (!assigned_to)
      return res.status(400).json({ success: false, message: 'assigned_to is required' })

    await db.query(
      `UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
      [assigned_to, lead_ids]
    )
    res.json({ success: true, updated: lead_ids.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router;

/*
  HOW TO WIRE THIS INTO leads.js
  ================================
  Option A — if you keep it as a separate file (recommended):
    In index.js, BEFORE the existing leads route:
      const leadCommRoutes = require('./routes/leads_additions');
      app.use('/api/leads', leadCommRoutes);

  Option B — paste the route handlers directly into leads.js above `module.exports`.

  NOTE: The DELETE /communications/:logId route must come before /:id
  routes in the router to avoid Express treating "communications" as an :id.
  In leads.js, add this near the top of the file (after other fixed-path routes):

    router.delete('/communications/:logId', auth, adminOnly, async (req, res) => { ... });
*/

// ── ADD THIS to your main leads.js GET / route ────────────────
// In the leads list query, add school_name filter support.
// Find the WHERE clause building section and add:
//
// const schoolFilter = req.query.school_name
// if (schoolFilter) {
//   conditions.push(`l.school_name ILIKE $${params.length + 1}`)
//   params.push(`%${schoolFilter}%`)
// }
//
// OR if using a simpler approach, add to existing WHERE:
// AND ($N::text IS NULL OR l.school_name ILIKE $N)
//
// Also ensure settings route groups by category and returns school_name:
// The existing /api/settings route should already do this since it groups
// all app_settings by category key. School names will auto-appear once
// added via POST /api/settings with category: 'school_name'
