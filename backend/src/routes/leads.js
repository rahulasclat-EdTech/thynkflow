// backend/src/routes/leads.js — COMPLETE REWRITE
const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { createNotif } = require('./notifications');

const router  = express.Router();
const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════
//  GET /api/leads — list leads with full pagination + filters
// ══════════════════════════════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)     || 1)
    const per_page = Math.min(Math.max(1, parseInt(req.query.per_page) || parseInt(req.query.limit) || 50), 1000)
    const offset   = (page - 1) * per_page
    const isAgent  = req.user.role_name === 'agent'

    let where  = []
    let params = []
    let i      = 1

    // Agent scope — agents only see their own leads
    if (isAgent) {
      where.push(`l.assigned_to = $${i++}`)
      params.push(req.user.id)
    } else if (req.query.assigned_to) {
      where.push(`l.assigned_to = $${i++}`)
      params.push(req.query.assigned_to)
    }

    if (req.query.status) {
      where.push(`l.status = $${i++}`)
      params.push(req.query.status)
    }

    if (req.query.product_id) {
      where.push(`l.product_id = $${i++}`)
      params.push(req.query.product_id)
    }

    if (req.query.school_name) {
      where.push(`l.school_name ILIKE $${i++}`)
      params.push(`%${req.query.school_name}%`)
    }

    if (req.query.lead_type) {
      where.push(`l.lead_type = $${i++}`)
      params.push(req.query.lead_type)
    }

    if (req.query.unassigned === 'true') {
      where.push(`l.assigned_to IS NULL`)
    }

    if (req.query.unattended === 'true') {
      where.push(`l.updated_at < NOW() - INTERVAL '5 days'`)
      where.push(`l.status NOT IN ('converted','not_interested')`)
    }

    if (req.query.search) {
      where.push(`(l.school_name ILIKE $${i} OR l.contact_name ILIKE $${i} OR l.phone ILIKE $${i} OR l.email ILIKE $${i})`)
      params.push(`%${req.query.search}%`)
      i++
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''

    // Get total count
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM leads l ${whereStr}`,
      params
    )
    const total = parseInt(countRows[0].total)

    // Get paginated data with joins
    const { rows } = await db.query(`
      SELECT
        l.*,
        u.name  AS agent_name,
        p.name  AS product_name,
        (SELECT cl.status      FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) AS last_status,
        (SELECT cl.discussion  FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) AS last_remark,
        (SELECT cl.next_followup_date FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) AS next_followup_date,
        (SELECT cl.called_at   FROM call_logs cl WHERE cl.lead_id = l.id ORDER BY cl.called_at DESC LIMIT 1) AS last_called_at
      FROM leads l
      LEFT JOIN users    u ON l.assigned_to  = u.id
      LEFT JOIN products p ON l.product_id   = p.id
      ${whereStr}
      ORDER BY l.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, per_page, offset])

    res.json({ success: true, data: rows, total, page, per_page })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/leads/:id — single lead with full history
// ══════════════════════════════════════════════════════════════
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT l.*, u.name AS agent_name, p.name AS product_name,
             ab.name AS assigned_by_name
      FROM leads l
      LEFT JOIN users    u  ON l.assigned_to = u.id
      LEFT JOIN products p  ON l.product_id  = p.id
      LEFT JOIN users    ab ON l.assigned_by = ab.id
      WHERE l.id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' })

    const { rows: logs } = await db.query(`
      SELECT cl.*, u.name AS agent_name
      FROM call_logs cl
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE cl.lead_id = $1
      ORDER BY cl.called_at DESC
    `, [req.params.id])

    res.json({ success: true, data: { ...rows[0], history: logs } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads — create single lead
// ══════════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  try {
    const {
      name, contact_name, school_name, phone, email, city, source,
      status, product_id, product_detail, admin_remark, assigned_to,
      lead_type, creation_comment
    } = req.body

    const { rows } = await db.query(
      `INSERT INTO leads (
        contact_name, school_name, phone, email, city, source,
        status, product_id, product_detail, admin_remark, assigned_to,
        lead_type, creation_comment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        (contact_name || name || '').trim(),
        school_name    || null,
        (phone         || '').trim(),
        email          || null,
        city           || null,
        source         || 'manual',
        status         || 'new',
        product_id     || null,
        product_detail || null,
        admin_remark   || creation_comment || null,
        assigned_to    || req.user.id,
        lead_type      || 'B2C',
        creation_comment || null,
      ]
    )
    const newLead = rows[0]
    // Notify assigned agent
    if (newLead.assigned_to && newLead.assigned_to !== req.user.id) {
      const leadName = (contact_name || name || school_name || 'New Lead').trim()
      createNotif(newLead.assigned_to, 'lead_assigned', '👤 New Lead Assigned',
        `Lead "${leadName}" has been assigned to you`, newLead.id)
    }
    res.status(201).json({ success: true, data: newLead })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  PUT /api/leads/:id — full update
// ══════════════════════════════════════════════════════════════
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      name, contact_name, school_name, phone, email, city, source,
      status, assigned_to, admin_remark, product_id, product_detail,
      lead_type, creation_comment
    } = req.body

    const { rows } = await db.query(
      `UPDATE leads SET
        contact_name     = $1,
        school_name      = $2,
        phone            = $3,
        email            = $4,
        city             = $5,
        source           = $6,
        status           = $7,
        assigned_to      = $8,
        admin_remark     = $9,
        product_id       = $10,
        product_detail   = $11,
        lead_type        = $12,
        creation_comment = $13,
        updated_at       = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        (contact_name || name || '').trim(),
        school_name    || null,
        (phone         || '').trim(),
        email          || null,
        city           || null,
        source         || null,
        status         || 'new',
        assigned_to    || null,
        admin_remark   || null,
        product_id     || null,
        product_detail || null,
        lead_type      || null,
        creation_comment || null,
        req.params.id
      ]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  PATCH /api/leads/:id/status
// ══════════════════════════════════════════════════════════════
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body
    const { rows } = await db.query(
      `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  PATCH /api/leads/:id/product
// ══════════════════════════════════════════════════════════════
router.patch('/:id/product', auth, async (req, res) => {
  try {
    const { product_id, product_detail } = req.body
    const { rows } = await db.query(
      `UPDATE leads SET product_id = $1, product_detail = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [product_id || null, product_detail || null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/bulk — bulk create (Excel / paste import)
// ══════════════════════════════════════════════════════════════
router.post('/bulk', auth, async (req, res) => {
  try {
    const { leads } = req.body
    if (!Array.isArray(leads) || !leads.length)
      return res.status(400).json({ success: false, message: 'No leads provided' })

    const valid = leads.filter(l =>
      (l.name || l.contact_name || '').toString().trim() ||
      (l.phone || '').toString().trim()
    )
    if (!valid.length) return res.json({ success: true, created: 0, skipped: leads.length })

    // Build single multi-row INSERT
    const values = []
    const params = []
    let p = 1

    for (const lead of valid) {
      values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},NOW(),NOW())`)
      params.push(
        (lead.contact_name || lead.name || '').toString().trim(),
        lead.school_name?.toString().trim()      || null,
        (lead.phone        || '').toString().trim() || null,
        lead.email?.toString().trim()             || null,
        lead.city?.toString().trim()              || null,
        lead.source?.toString().trim()            || 'excel_upload',
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
    res.json({ success: true, created: rows.length, submitted: valid.length, skipped: leads.length - valid.length })
  } catch (err) {
    console.error('Bulk import error:', err.message)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/assign — bulk assign to agent (or unassign)
// ══════════════════════════════════════════════════════════════
router.post('/assign', auth, async (req, res) => {
  try {
    // Support both assigned_to (new) and agent_id (legacy)
    const assigned_to = req.body.assigned_to !== undefined ? req.body.assigned_to : req.body.agent_id
    const lead_ids    = req.body.lead_ids || req.body.leads || []

    if (!Array.isArray(lead_ids) || !lead_ids.length)
      return res.status(400).json({ success: false, message: 'No leads selected' })

    await db.query(
      `UPDATE leads
       SET assigned_to = $1,
           assigned_by = $2,
           assigned_at = NOW(),
           updated_at  = NOW()
       WHERE id = ANY($3::uuid[])`,
      [assigned_to || null, req.user.id, lead_ids]
    )
    // Notify the assigned agent about each lead
    if (assigned_to) {
      try {
        const { rows: assignedLeads } = await db.query(
          `SELECT id, COALESCE(contact_name, school_name, 'Lead') AS lead_name FROM leads WHERE id = ANY($1::uuid[])`,
          [lead_ids]
        )
        for (const l of assignedLeads) {
          createNotif(assigned_to, 'lead_assigned', '👤 Lead Assigned to You',
            `Lead "${l.lead_name}" has been assigned to you`, l.id)
        }
      } catch {}
    }
    res.json({ success: true, updated: lead_ids.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/lookup-products — resolve names to IDs
// ══════════════════════════════════════════════════════════════
router.post('/lookup-products', auth, async (req, res) => {
  try {
    const { names } = req.body
    if (!Array.isArray(names) || !names.length) return res.json({ success: true, data: {} })
    // Try with is_active filter first, then without as fallback
    let { rows } = await db.query(
      `SELECT id, name FROM products WHERE LOWER(name) = ANY($1::text[])`,
      [names.map(n => n.toLowerCase())]
    )
    const map = {}
    rows.forEach(r => { map[r.name.toLowerCase()] = r.id })
    console.log('lookup-products: names=', names, 'found=', rows.length, 'map=', map)
    res.json({ success: true, data: map })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/leads/:id/communications
// ══════════════════════════════════════════════════════════════
router.get('/:id/communications', auth, async (req, res) => {
  try {
    // Try communication_logs first, fallback to call_logs
    let rows = []
    try {
      const r = await db.query(
        `SELECT cl.*, u.name AS agent_name
         FROM communication_logs cl
         JOIN users u ON cl.sender_id = u.id
         WHERE cl.lead_id = $1
         ORDER BY cl.created_at DESC`,
        [req.params.id]
      )
      rows = r.rows
    } catch {
      const r = await db.query(
        `SELECT cl.*, u.name AS agent_name
         FROM communication_logs cl
         LEFT JOIN users u ON cl.agent_id = u.id
         WHERE cl.lead_id = $1
         ORDER BY cl.created_at DESC`,
        [req.params.id]
      )
      rows = r.rows
    }
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/:id/communications
// ══════════════════════════════════════════════════════════════
router.post('/:id/communications', auth, async (req, res) => {
  try {
    const { type, direction, note, duration_sec } = req.body
    if (!['call','whatsapp','email'].includes(type))
      return res.status(400).json({ success: false, message: 'type must be call, whatsapp, or email' })

    // Try new schema first (sender_id), fallback to old (agent_id)
    let rows = []
    try {
      const r = await db.query(
        `INSERT INTO communication_logs (lead_id, sender_id, type, direction, note, duration_sec)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, req.user.id, type, direction || 'outbound', note || '', duration_sec || null]
      )
      rows = r.rows
    } catch {
      const r = await db.query(
        `INSERT INTO communication_logs (lead_id, agent_id, type, direction, note, duration_sec)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, req.user.id, type, direction || 'outbound', note || '', duration_sec || null]
      )
      rows = r.rows
    }
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/upload — Excel file upload (legacy route)
// ══════════════════════════════════════════════════════════════
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' })

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (!rows.length) return res.status(400).json({ success: false, message: 'Empty spreadsheet' })

    let inserted = 0, skipped = 0
    for (const row of rows) {
      const phone = String(row['Phone'] || row['phone'] || row['PHONE'] || row['mobile'] || '').trim()
      if (!phone) { skipped++; continue }

      try {
        await db.query(
          `INSERT INTO leads (contact_name, school_name, phone, email, city, source, lead_type, creation_comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            row['Name'] || row['name'] || row['contact_name'] || '',
            row['School Name'] || row['school_name'] || row['school'] || '',
            phone,
            row['Email'] || row['email'] || '',
            row['City'] || row['city'] || '',
            row['Source'] || row['source'] || 'excel_upload',
            row['Lead Type'] || row['lead_type'] || 'B2C',
            row['Creation Comment'] || row['creation_comment'] || '',
          ]
        )
        inserted++
      } catch { skipped++ }
    }
    res.json({ success: true, message: `Uploaded ${inserted} leads, skipped ${skipped}`, created: inserted })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/leads/paste — paste leads (legacy)
// ══════════════════════════════════════════════════════════════
router.post('/paste', auth, async (req, res) => {
  try {
    const { leads } = req.body
    if (!Array.isArray(leads) || !leads.length)
      return res.status(400).json({ success: false, message: 'No leads provided' })
    let inserted = 0
    for (const lead of leads) {
      if (!lead.phone) continue
      await db.query(
        `INSERT INTO leads (contact_name, school_name, phone, email, city, source, lead_type, creation_comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [lead.contact_name || '', lead.school_name || '', lead.phone,
         lead.email || '', lead.city || '', lead.source || 'paste',
         lead.lead_type || 'B2C', lead.creation_comment || '']
      )
      inserted++
    }
    res.json({ success: true, message: `${inserted} leads added`, created: inserted })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
