const express = require('express');
const db = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const isAgent = req.user.role_name === 'agent';
    const uid = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const agentFilter = isAgent ? `AND assigned_to = '${uid}'` : '';
    const agentCallFilter = isAgent ? `AND user_id = '${uid}'` : '';

    const [totals, statusBreakdown, todayCalls, pendingFollowups, agentPerf, recentActivity] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total_leads,
          COUNT(CASE WHEN id NOT IN (SELECT DISTINCT lead_id FROM call_logs WHERE lead_id IS NOT NULL) THEN 1 END) as unattended,
          COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
          COUNT(CASE WHEN status = 'hot' THEN 1 END) as hot
        FROM leads WHERE 1=1 ${agentFilter}
      `),
      db.query(`SELECT status, COUNT(*) as count FROM leads WHERE 1=1 ${agentFilter} GROUP BY status ORDER BY count DESC`),
      db.query(`SELECT COUNT(*) as count FROM call_logs WHERE DATE(called_at) = $1 ${agentCallFilter}`, [today]),
      db.query(`
        SELECT COUNT(*) as count FROM call_logs cl
        WHERE next_followup_date < $1
          AND id = (SELECT id FROM call_logs WHERE lead_id = cl.lead_id ORDER BY called_at DESC LIMIT 1)
          ${agentCallFilter}
      `, [today]),
      isAgent ? Promise.resolve({ rows: [] }) : db.query(`
        SELECT u.name, COUNT(l.id) as leads, COUNT(cl.id) as calls,
               COUNT(CASE WHEN l.status='converted' THEN 1 END) as converted
        FROM users u
        LEFT JOIN leads l ON l.assigned_to = u.id
        LEFT JOIN call_logs cl ON cl.user_id = u.id AND DATE(cl.called_at) = $1
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'agent' AND u.is_active = true
        GROUP BY u.id, u.name ORDER BY leads DESC LIMIT 5
      `, [today]),
      db.query(`
        SELECT cl.status, cl.discussion, cl.called_at, l.school_name, l.contact_name, u.name as agent_name
        FROM call_logs cl
        JOIN leads l ON cl.lead_id = l.id
        LEFT JOIN users u ON cl.user_id = u.id
        WHERE 1=1 ${agentCallFilter}
        ORDER BY cl.called_at DESC LIMIT 10
      `)
    ]);

    res.json({
      success: true,
      data: {
        totals: totals.rows[0],
        status_breakdown: statusBreakdown.rows,
        today_calls: parseInt(todayCalls.rows[0].count),
        pending_followups: parseInt(pendingFollowups.rows[0].count),
        agent_performance: agentPerf.rows,
        recent_activity: recentActivity.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
