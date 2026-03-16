const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/leads - list leads
router.get('/', auth, async (req, res) => {
  try {
    const { status, assigned_to, unattended, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const isAgent = req.user.role_name === 'agent';

    let where = [];
    let params = [];
    let i = 1;

    if (isAgent) { where.push(`l.assigned_to = $${i++}`); params.push(req.user.id); }
    else if (assigned_to) { where.push(`l.assigned_to = $${i++}`); params.push(assigned_to); }

    if (status) { where.push(`l.status = $${i++}`); params.push(status); }

    if (unattended === 'true') {
      where.push(`l.id NOT IN (SELECT DISTINCT lead_id FROM call_logs WHERE lead_id IS NOT NULL)`);
    }

    if (search) {
      where.push(`(l.school_name ILIKE $${i} OR l.contact_name ILIKE $${i} OR l.phone ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT l.*, u.name as agent_name,
        (SELECT cl.status FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) as last_status,
        (SELECT cl.discussion FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) as last_remark,
        (SELECT cl.next_followup_date FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) as next_followup_date,
        (SELECT cl.called_at FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) as last_called_at
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      ${whereStr}
      ORDER BY l.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, limit, offset]);

    const { rows: count } = await db.query(`SELECT COUNT(*) FROM leads l ${whereStr}`, params);

    res.json({ success: true, data: rows, total: parseInt(count[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/leads/:id - single lead with full history
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT l.*, u.name as agent_name, ab.name as assigned_by_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users ab ON l.assigned_by = ab.id
      WHERE l.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });

    const { rows: logs } = await db.query(`
      SELECT cl.*, u.name as agent_name
      FROM call_logs cl
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE cl.lead_id = $1
      ORDER BY cl.called_at DESC
    `, [req.params.id]);

    res.json({ success: true, data: { ...rows[0], history: logs } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/leads - create single lead (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { school_name, contact_name, phone, email, city, source } = req.body;
    const { rows } = await db.query(
      'INSERT INTO leads (school_name, contact_name, phone, email, city, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [school_name, contact_name, phone, email, city, source || 'manual']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/leads/upload - Excel upload
router.post('/upload', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) return res.status(400).json({ success: false, message: 'Empty spreadsheet' });

    let inserted = 0, skipped = 0;
    for (const row of rows) {
      const phone = String(row['phone'] || row['Phone'] || row['PHONE'] || row['mobile'] || row['Mobile'] || '').trim();
      if (!phone) { skipped++; continue; }

      const school_name = row['school_name'] || row['School Name'] || row['school'] || '';
      const contact_name = row['contact_name'] || row['Contact Name'] || row['name'] || row['Name'] || '';
      const email = row['email'] || row['Email'] || '';
      const city = row['city'] || row['City'] || '';

      try {
        await db.query(
          'INSERT INTO leads (school_name, contact_name, phone, email, city, source) VALUES ($1,$2,$3,$4,$5,$6)',
          [school_name, contact_name, phone, email, city, 'excel_upload']
        );
        inserted++;
      } catch { skipped++; }
    }

    res.json({ success: true, message: `Uploaded ${inserted} leads, skipped ${skipped}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/leads/paste - paste leads (JSON array)
router.post('/paste', auth, adminOnly, async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ success: false, message: 'No leads provided' });

    let inserted = 0;
    for (const lead of leads) {
      if (!lead.phone) continue;
      await db.query(
        'INSERT INTO leads (school_name, contact_name, phone, email, city, source) VALUES ($1,$2,$3,$4,$5,$6)',
        [lead.school_name || '', lead.contact_name || '', lead.phone, lead.email || '', lead.city || '', 'paste']
      );
      inserted++;
    }
    res.json({ success: true, message: `${inserted} leads added` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/leads/assign - bulk assign
router.post('/assign', auth, adminOnly, async (req, res) => {
  try {
    const { lead_ids, agent_id } = req.body;
    if (!Array.isArray(lead_ids) || !lead_ids.length) return res.status(400).json({ success: false, message: 'No leads selected' });

    await db.query(
      `UPDATE leads SET assigned_to = $1, assigned_by = $2, assigned_at = NOW(), updated_at = NOW() WHERE id = ANY($3::uuid[])`,
      [agent_id, req.user.id, lead_ids]
    );
    res.json({ success: true, message: `${lead_ids.length} leads assigned` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
