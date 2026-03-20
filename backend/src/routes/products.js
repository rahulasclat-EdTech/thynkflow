// backend/src/routes/products.js
const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')
const router  = express.Router()

function agentScope(user, alias = 'l') {
  return user.role_name === 'admin' ? '' : `AND ${alias}.assigned_to = '${user.id}'`
}

router.get('/active', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, type, per_closure_earning FROM products WHERE is_active=true ORDER BY name`
    )
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.get('/dashboard', auth, async (req, res) => {
  try {
    const { agent_id, product_id } = req.query
    let scope = agentScope(req.user)
    if (req.user.role_name === 'admin' && agent_id) scope += ` AND l.assigned_to = '${agent_id}'`
    if (product_id) scope += ` AND l.product_id = ${parseInt(product_id)}`

    const { rows: productStats } = await db.query(`
      SELECT
        p.id AS product_id, p.name AS product_name, p.type AS product_type, p.per_closure_earning,
        COUNT(l.id) AS total_leads,
        COUNT(CASE WHEN l.status='hot'            THEN 1 END) AS hot_leads,
        COUNT(CASE WHEN l.status='warm'           THEN 1 END) AS warm_leads,
        COUNT(CASE WHEN l.status='cold'           THEN 1 END) AS cold_leads,
        COUNT(CASE WHEN l.status='new'            THEN 1 END) AS new_leads,
        COUNT(CASE WHEN l.status='call_back'      THEN 1 END) AS call_back_leads,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END) AS converted_leads,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END) AS not_interested_leads,
        COUNT(CASE WHEN l.status != 'not_interested' THEN 1 END) * p.per_closure_earning AS total_potential_earning,
        COUNT(CASE WHEN l.status='converted' THEN 1 END) * p.per_closure_earning AS actual_earned,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END) * p.per_closure_earning AS earning_lost,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested') THEN 1 END) * p.per_closure_earning AS still_to_earn
      FROM products p
      LEFT JOIN leads l ON l.product_id = p.id AND l.id IS NOT NULL ${scope}
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.type, p.per_closure_earning
      ORDER BY total_leads DESC
    `)

    const { rows: agentBreakdown } = await db.query(`
      SELECT
        u.id AS agent_id, u.name AS agent_name,
        p.id AS product_id, p.name AS product_name, p.per_closure_earning,
        COUNT(l.id) AS total_leads,
        COUNT(CASE WHEN l.status='converted'      THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END) AS not_interested,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested') THEN 1 END) AS still_to_earn_count,
        COUNT(CASE WHEN l.status != 'not_interested' THEN 1 END) * p.per_closure_earning AS potential,
        COUNT(CASE WHEN l.status='converted' THEN 1 END) * p.per_closure_earning AS earned,
        COUNT(CASE WHEN l.status='not_interested' THEN 1 END) * p.per_closure_earning AS lost,
        COUNT(CASE WHEN l.status NOT IN ('converted','not_interested') THEN 1 END) * p.per_closure_earning AS still_to_earn
      FROM users u
      JOIN leads l ON l.assigned_to = u.id ${scope}
      JOIN products p ON l.product_id = p.id
      WHERE u.role_name IN ('agent', 'admin')
        AND p.is_active = true
      GROUP BY u.id, u.name, p.id, p.name, p.per_closure_earning
      ORDER BY u.name, earned DESC
    `)

    const totals = productStats.reduce((acc, p) => ({
      total_leads:     acc.total_leads     + parseInt(p.total_leads || 0),
      total_potential: acc.total_potential + parseFloat(p.total_potential_earning || 0),
      total_earned:    acc.total_earned    + parseFloat(p.actual_earned || 0),
      total_lost:      acc.total_lost      + parseFloat(p.earning_lost || 0),
      total_still:     acc.total_still     + parseFloat(p.still_to_earn || 0),
      total_converted: acc.total_converted + parseInt(p.converted_leads || 0),
      total_ni:        acc.total_ni        + parseInt(p.not_interested_leads || 0),
    }), { total_leads:0, total_potential:0, total_earned:0, total_lost:0, total_still:0, total_converted:0, total_ni:0 })

    res.json({
      success: true,
      data: {
        product_stats:        productStats,
        agent_breakdown:      agentBreakdown,
        total_potential:      totals.total_potential,
        total_actual_earned:  totals.total_earned,
        total_earning_lost:   totals.total_lost,
        total_still_to_earn:  totals.total_still,
        total_leads:          totals.total_leads,
        total_converted:      totals.total_converted,
        total_not_interested: totals.total_ni,
      }
    })
  } catch (err) {
    console.error('Products dashboard error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, COUNT(l.id) AS lead_count FROM products p LEFT JOIN leads l ON l.product_id = p.id GROUP BY p.id ORDER BY p.name`
    )
    res.json({ success: true, data: rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, type, per_closure_earning } = req.body
    const { rows } = await db.query(
      `INSERT INTO products (name, type, per_closure_earning, is_active) VALUES ($1,$2,$3,true) RETURNING *`,
      [name, type || 'B2C', parseFloat(per_closure_earning) || 0]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, type, per_closure_earning, is_active } = req.body
    const { rows } = await db.query(
      `UPDATE products SET name=$1, type=$2, per_closure_earning=$3, is_active=$4 WHERE id=$5 RETURNING *`,
      [name, type || 'B2C', parseFloat(per_closure_earning) || 0, is_active !== false, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(`UPDATE products SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
