const express = require('express');
const db = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/followups - get followups for agent (grouped by date)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.role_name === 'agent' ? req.user.id : (req.query.agent_id || null);
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    let where = `WHERE cl.id = (
      SELECT id FROM call_logs WHERE lead_id = cl.lead_id ORDER BY called_at DESC LIMIT 1
    ) AND cl.next_followup_date IS NOT NULL`;
    const params = [];

    if (userId) {
      where += ` AND cl.user_id = $1`;
      params.push(userId);
    }

    const { rows } = await db.query(`
      SELECT cl.*, l.school_name, l.contact_name, l.phone, l.status as lead_status,
             u.name as agent_name,
             CASE
               WHEN cl.next_followup_date < $${params.length + 1}::date THEN 'missed'
               WHEN cl.next_followup_date = $${params.length + 1}::date THEN 'today'
               WHEN cl.next_followup_date = $${params.length + 2}::date THEN 'tomorrow'
               ELSE 'upcoming'
             END as followup_type
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      LEFT JOIN users u ON cl.user_id = u.id
      ${where}
      AND l.status NOT IN ('converted', 'not_interested')
      ORDER BY cl.next_followup_date ASC
    `, [...params, today, tomorrow]);

    const grouped = {
      missed: rows.filter(r => r.followup_type === 'missed'),
      today: rows.filter(r => r.followup_type === 'today'),
      tomorrow: rows.filter(r => r.followup_type === 'tomorrow'),
      upcoming: rows.filter(r => r.followup_type === 'upcoming')
    };

    res.json({ success: true, data: grouped, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/followups - log a call
router.post('/', auth, async (req, res) => {
  try {
    const { lead_id, status, discussion, next_followup_date } = req.body;
    if (!lead_id || !status) return res.status(400).json({ success: false, message: 'lead_id and status required' });

    const { rows } = await db.query(
      'INSERT INTO call_logs (lead_id, user_id, status, discussion, next_followup_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [lead_id, req.user.id, status, discussion, next_followup_date || null]
    );

    // Update lead status
    await db.query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', [status, lead_id]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
