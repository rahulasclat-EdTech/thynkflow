const express = require('express');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/status-wise
router.get('/status-wise', auth, async (req, res) => {
  try {
    const isAgent = req.user.role_name === 'agent';
    const where = isAgent ? 'WHERE assigned_to = $1' : '';
    const params = isAgent ? [req.user.id] : [];

    const { rows } = await db.query(`
      SELECT status, COUNT(*) as count FROM leads ${where} GROUP BY status ORDER BY count DESC
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/agent-wise
router.get('/agent-wise', auth, adminOnly, async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await db.query(`
      SELECT u.name as agent_name, u.id as agent_id,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted,
        COUNT(CASE WHEN l.status = 'hot' THEN 1 END) as hot,
        COUNT(CASE WHEN l.status = 'warm' THEN 1 END) as warm,
        COUNT(DISTINCT cl.id) as total_calls
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      LEFT JOIN call_logs cl ON cl.user_id = u.id
        ${from && to ? 'AND cl.called_at BETWEEN $1 AND $2' : ''}
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_leads DESC
    `, from && to ? [from, to] : []);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/daily-calls
router.get('/daily-calls', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const isAgent = req.user.role_name === 'agent';

    let where = `WHERE DATE(cl.called_at) = $1`;
    const params = [targetDate];
    if (isAgent) { where += ` AND cl.user_id = $2`; params.push(req.user.id); }

    const { rows } = await db.query(`
      SELECT cl.*, l.school_name, l.contact_name, l.phone, u.name as agent_name
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN users u ON cl.user_id = u.id
      ${where}
      ORDER BY cl.called_at DESC
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/pending-followups
router.get('/pending-followups', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const isAgent = req.user.role_name === 'agent';

    const { rows } = await db.query(`
      SELECT cl.*, l.school_name, l.contact_name, l.phone, u.name as agent_name
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE cl.next_followup_date < $1
        AND cl.id = (SELECT id FROM call_logs WHERE lead_id = cl.lead_id ORDER BY called_at DESC LIMIT 1)
        ${isAgent ? 'AND cl.user_id = $2' : ''}
      ORDER BY cl.next_followup_date ASC
    `, isAgent ? [today, req.user.id] : [today]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/upcoming-followups
router.get('/upcoming-followups', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const isAgent = req.user.role_name === 'agent';

    const { rows } = await db.query(`
      SELECT cl.*, l.school_name, l.contact_name, l.phone, u.name as agent_name
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE cl.next_followup_date >= $1
        AND cl.id = (SELECT id FROM call_logs WHERE lead_id = cl.lead_id ORDER BY called_at DESC LIMIT 1)
        ${isAgent ? 'AND cl.user_id = $2' : ''}
      ORDER BY cl.next_followup_date ASC
    `, isAgent ? [today, req.user.id] : [today]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
