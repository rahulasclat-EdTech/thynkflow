const express = require('express');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Create products table if not exists
async function ensureProductsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(10) NOT NULL DEFAULT 'B2B' CHECK (type IN ('B2B', 'B2C')),
      description TEXT,
      per_closure_earning NUMERIC(10,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name)
    );
  `);
}

ensureProductsTable().catch(console.error);

// GET /api/products - get all products
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM products ORDER BY sort_order, name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/active - get only active products (for dropdowns)
router.get('/active', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM products WHERE is_active = true ORDER BY sort_order, name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/dashboard - product wise dashboard stats
router.get('/dashboard', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role_name === 'admin';
    const agentId = req.user.id;

    // Product wise lead count + status breakdown
    const productStatsQuery = isAdmin
      ? `
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.type as product_type,
          p.per_closure_earning,
          COUNT(l.id) as total_leads,
          COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN l.status = 'hot' THEN 1 END) as hot_leads,
          COUNT(CASE WHEN l.status = 'warm' THEN 1 END) as warm_leads,
          COUNT(CASE WHEN l.status = 'cold' THEN 1 END) as cold_leads,
          COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
          COUNT(CASE WHEN l.status = 'not_interested' THEN 1 END) as not_interested_leads,
          COUNT(CASE WHEN l.status = 'call_back' THEN 1 END) as call_back_leads,
          ROUND(COUNT(l.id) * p.per_closure_earning, 2) as total_potential_earning,
          ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * p.per_closure_earning, 2) as actual_earned
        FROM products p
        LEFT JOIN leads l ON l.product_id = p.id
        WHERE p.is_active = true
        GROUP BY p.id, p.name, p.type, p.per_closure_earning
        ORDER BY total_leads DESC
      `
      : `
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.type as product_type,
          p.per_closure_earning,
          COUNT(l.id) as total_leads,
          COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN l.status = 'hot' THEN 1 END) as hot_leads,
          COUNT(CASE WHEN l.status = 'warm' THEN 1 END) as warm_leads,
          COUNT(CASE WHEN l.status = 'cold' THEN 1 END) as cold_leads,
          COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
          COUNT(CASE WHEN l.status = 'not_interested' THEN 1 END) as not_interested_leads,
          COUNT(CASE WHEN l.status = 'call_back' THEN 1 END) as call_back_leads,
          ROUND(COUNT(l.id) * p.per_closure_earning, 2) as total_potential_earning,
          ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * p.per_closure_earning, 2) as actual_earned
        FROM products p
        LEFT JOIN leads l ON l.product_id = p.id AND l.assigned_to = $1
        WHERE p.is_active = true
        GROUP BY p.id, p.name, p.type, p.per_closure_earning
        ORDER BY total_leads DESC
      `;

    const productStats = isAdmin
      ? await db.query(productStatsQuery)
      : await db.query(productStatsQuery, [agentId]);

    // Admin only: product wise leads by agent
    let agentBreakdown = [];
    if (isAdmin) {
      const { rows } = await db.query(`
        SELECT
          p.id as product_id,
          p.name as product_name,
          u.id as agent_id,
          u.name as agent_name,
          COUNT(l.id) as total_leads,
          COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted,
          COUNT(CASE WHEN l.status = 'hot' THEN 1 END) as hot,
          COUNT(CASE WHEN l.status = 'warm' THEN 1 END) as warm,
          COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
          ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * p.per_closure_earning, 2) as earned
        FROM products p
        JOIN leads l ON l.product_id = p.id
        JOIN users u ON l.assigned_to = u.id
        WHERE p.is_active = true
        GROUP BY p.id, p.name, u.id, u.name
        ORDER BY p.name, total_leads DESC
      `);
      agentBreakdown = rows;
    }

    res.json({
      success: true,
      data: {
        product_stats: productStats.rows,
        agent_breakdown: agentBreakdown,
        is_admin: isAdmin,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/products - create product
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, type, description, per_closure_earning, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Product name is required' });
    if (!['B2B', 'B2C'].includes(type)) return res.status(400).json({ success: false, message: 'Type must be B2B or B2C' });

    const { rows } = await db.query(
      `INSERT INTO products (name, type, description, per_closure_earning, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, type, description || '', per_closure_earning || 0, sort_order || 0]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Product name already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/products/:id - update product
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, type, description, per_closure_earning, sort_order, is_active } = req.body;
    const { rows } = await db.query(
      `UPDATE products SET name=$1, type=$2, description=$3, per_closure_earning=$4, sort_order=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [name, type, description, per_closure_earning, sort_order, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/products/:id/toggle
router.patch('/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE products SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
