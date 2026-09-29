// backend/src/routes/leads_manage.js
// ─────────────────────────────────────────────────────────────────────
//  Lead DELETE (archived separately) + DUPLICATE detection
//
//  Mounted in index.js BEFORE the other /api/leads routers so the fixed
//  paths here (/deleted, /duplicates, /check-duplicate, /bulk-delete)
//  are matched before the generic GET /:id in leads.js.
//
//  HOW DELETION WORKS
//  ------------------
//  Deleting a lead MOVES it out of the live tables into `deleted_leads`
//  (the lead row + its call_logs / communication_logs / status history
//  are stored as JSONB so nothing is lost and it can be restored).
//  Because the lead no longer exists in `leads`, every Dashboard /
//  Report / Performance / Follow-up count that reads from `leads` (or
//  joins to it) excludes it automatically — no per-query filter needed,
//  and no way for a new report to forget one.
//
//  HOW DUPLICATES ARE DETECTED
//  ---------------------------
//  Two leads are duplicates when their phone numbers match after
//  stripping everything except digits and comparing the LAST 10 digits
//  (so "+91 98765 43210", "09876543210" and "9876543210" all match).
// ─────────────────────────────────────────────────────────────────────
const express = require('express')
const db      = require('../config/db')
const { auth, adminOnly } = require('../middleware/auth')

const router = express.Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isAdmin = (u) => u.role_id === 1 || u.role_name === 'admin'

// Agents may delete their own leads unless ALLOW_AGENT_DELETE=false.
const AGENTS_CAN_DELETE = String(process.env.ALLOW_AGENT_DELETE || 'true').toLowerCase() !== 'false'

// SQL fragment: normalised phone (digits only, last 10) for a column.
const NORM = (col) => `RIGHT(REGEXP_REPLACE(COALESCE(${col}, ''), '\\D', '', 'g'), 10)`

// ── Self-migration ────────────────────────────────────────────────────
async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS deleted_leads (
      id                 SERIAL PRIMARY KEY,
      lead_id            UUID NOT NULL,
      contact_name       VARCHAR(200),
      school_name        VARCHAR(200),
      phone              VARCHAR(50),
      email              VARCHAR(200),
      status             VARCHAR(50),
      product_id         INTEGER,
      product_name       VARCHAR(200),
      assigned_to        UUID,
      agent_name         VARCHAR(100),
      lead_data          JSONB NOT NULL,
      call_logs          JSONB NOT NULL DEFAULT '[]',
      communication_logs JSONB NOT NULL DEFAULT '[]',
      status_history     JSONB NOT NULL DEFAULT '[]',
      deleted_by         UUID,
      deleted_by_name    VARCHAR(100),
      delete_reason      TEXT,
      deleted_at         TIMESTAMP NOT NULL DEFAULT NOW(),
      restored_at        TIMESTAMP,
      restored_by        UUID
    );
    CREATE INDEX IF NOT EXISTS idx_deleted_leads_lead_id    ON deleted_leads(lead_id);
    CREATE INDEX IF NOT EXISTS idx_deleted_leads_deleted_at ON deleted_leads(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_deleted_leads_assigned   ON deleted_leads(assigned_to);
  `)
  // Expression index so "is there another lead with this phone?" is fast.
  await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_norm_phone ON leads ((${NORM('phone')}))`)
}
const ready = migrate().catch(err => console.error('[leads_manage] migration error:', err.message))

// Which optional child tables actually exist in this database.
async function existingTables(names) {
  const { rows } = await db.query(
    `SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'lead_id' AND table_name = ANY($1::text[])`,
    [names]
  )
  return new Set(rows.map(r => r.table_name))
}

// Tables archived (restorable) vs. tables just cleaned up on delete.
const ARCHIVED = ['call_logs', 'communication_logs', 'lead_status_history']
const CLEANED  = ['email_logs', 'campaign_leads', 'reminder_logs', 'notifications']

// ══════════════════════════════════════════════════════════════════════
//  Core delete — used by single + bulk. Returns { deleted, skipped }.
// ══════════════════════════════════════════════════════════════════════
async function archiveAndDelete(ids, user, reason) {
  await ready
  const admin = isAdmin(user)
  if (!admin && !AGENTS_CAN_DELETE) {
    const e = new Error('Only admins can delete leads'); e.status = 403; throw e
  }

  const tables = await existingTables([...ARCHIVED, ...CLEANED])
  const agg = (t) => tables.has(t)
    ? `COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM ${t} x WHERE x.lead_id = l.id), '[]'::jsonb)`
    : `'[]'::jsonb`

  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the candidate rows; agents can only touch their own leads.
    const { rows: targets } = await client.query(
      `SELECT id FROM leads WHERE id = ANY($1::uuid[]) ${admin ? '' : 'AND assigned_to = $2'} FOR UPDATE`,
      admin ? [ids] : [ids, user.id]
    )
    const targetIds = targets.map(r => r.id)
    if (!targetIds.length) { await client.query('ROLLBACK'); return { deleted: 0, skipped: ids.length } }

    // 1) Archive (lead row + history as JSONB)
    await client.query(`
      INSERT INTO deleted_leads (
        lead_id, contact_name, school_name, phone, email, status,
        product_id, product_name, assigned_to, agent_name,
        lead_data, call_logs, communication_logs, status_history,
        deleted_by, deleted_by_name, delete_reason
      )
      SELECT
        l.id, l.contact_name, l.school_name, l.phone, l.email, l.status,
        l.product_id, p.name, l.assigned_to, u.name,
        to_jsonb(l), ${agg('call_logs')}, ${agg('communication_logs')}, ${agg('lead_status_history')},
        $2, $3, $4
      FROM leads l
      LEFT JOIN users    u ON u.id = l.assigned_to
      LEFT JOIN products p ON p.id = l.product_id
      WHERE l.id = ANY($1::uuid[])
    `, [targetIds, user.id, user.name || null, reason || null])

    // 2) Remove from live tables. Explicit (not relying on FK cascade) so
    //    counts that read communication_logs / call_logs directly — e.g.
    //    the performance page — also drop these calls.
    for (const t of [...ARCHIVED, ...CLEANED]) {
      if (tables.has(t)) await client.query(`DELETE FROM ${t} WHERE lead_id = ANY($1::uuid[])`, [targetIds])
    }
    await client.query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [targetIds])

    await client.query('COMMIT')
    return { deleted: targetIds.length, skipped: ids.length - targetIds.length }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

const fail = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message })
  console.error('[leads_manage]', err.message)
  res.status(500).json({ success: false, message: err.message })
}

// ══════════════════════════════════════════════════════════════════════
//  GET /api/leads/deleted — the separate "deleted leads" register
//  Admin: all.  Agent: only leads that were assigned to them.
// ══════════════════════════════════════════════════════════════════════
router.get('/deleted', auth, async (req, res) => {
  try {
    await ready
    const page     = Math.max(1, parseInt(req.query.page) || 1)
    const per_page = Math.min(Math.max(1, parseInt(req.query.per_page) || 50), 500)
    const where = ['d.restored_at IS NULL']
    const params = []
    if (!isAdmin(req.user)) { params.push(req.user.id); where.push(`(d.assigned_to = $${params.length} OR d.deleted_by = $${params.length})`) }
    if (req.query.search) {
      params.push(`%${req.query.search}%`)
      where.push(`(d.contact_name ILIKE $${params.length} OR d.school_name ILIKE $${params.length} OR d.phone ILIKE $${params.length})`)
    }
    const W = 'WHERE ' + where.join(' AND ')
    const { rows: [{ total }] } = await db.query(`SELECT COUNT(*)::int AS total FROM deleted_leads d ${W}`, params)
    const { rows } = await db.query(`
      SELECT d.id, d.lead_id, d.contact_name, d.school_name, d.phone, d.email, d.status,
             d.product_name, d.agent_name, d.deleted_by_name, d.delete_reason, d.deleted_at,
             jsonb_array_length(d.call_logs) + jsonb_array_length(d.communication_logs) AS logs_count
      FROM deleted_leads d ${W}
      ORDER BY d.deleted_at DESC
      LIMIT ${per_page} OFFSET ${(page - 1) * per_page}
    `, params)
    res.json({ success: true, data: rows, total, page, per_page })
  } catch (err) { fail(res, err) }
})

// ══════════════════════════════════════════════════════════════════════
//  POST /api/leads/deleted/:id/restore — admin only
//  :id is the deleted_leads.id (archive id), not the lead id.
// ══════════════════════════════════════════════════════════════════════
router.post('/deleted/:id/restore', auth, adminOnly, async (req, res) => {
  await ready
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT * FROM deleted_leads WHERE id = $1 AND restored_at IS NULL FOR UPDATE`, [parseInt(req.params.id) || 0])
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Deleted lead not found (or already restored)' }) }
    const arc = rows[0]
    const lead = { ...arc.lead_data }

    const { rows: exists } = await client.query(`SELECT 1 FROM leads WHERE id = $1`, [arc.lead_id])
    if (exists.length) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'This lead already exists' }) }

    // Users referenced by the lead may have been removed since.
    for (const col of ['assigned_to', 'assigned_by', 'registration_pushed_by']) {
      if (lead[col]) {
        const { rows: u } = await client.query(`SELECT 1 FROM users WHERE id = $1`, [lead[col]])
        if (!u.length) lead[col] = null
      }
    }
    // Product may have been removed too.
    if (lead.product_id) {
      const { rows: p } = await client.query(`SELECT 1 FROM products WHERE id = $1`, [lead.product_id])
      if (!p.length) lead.product_id = null
    }

    await client.query(`INSERT INTO leads SELECT * FROM jsonb_populate_record(NULL::leads, $1::jsonb)`, [JSON.stringify(lead)])

    // Child logs — best-effort (savepoint each so one failure can't undo the lead).
    const tables = await existingTables(ARCHIVED)
    const warnings = []
    const children = [
      ['call_logs', arc.call_logs], ['communication_logs', arc.communication_logs], ['lead_status_history', arc.status_history],
    ]
    for (const [t, data] of children) {
      if (!tables.has(t) || !Array.isArray(data) || !data.length) continue
      await client.query('SAVEPOINT child')
      try {
        await client.query(
          `INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb) ON CONFLICT DO NOTHING`,
          [JSON.stringify(data)])
        await client.query('RELEASE SAVEPOINT child')
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT child')
        warnings.push(`${t} could not be restored: ${e.message}`)
      }
    }

    await client.query(`UPDATE deleted_leads SET restored_at = NOW(), restored_by = $2 WHERE id = $1`, [arc.id, req.user.id])
    await client.query('COMMIT')

    const { rows: dup } = await db.query(
      `SELECT COUNT(*)::int AS n FROM leads WHERE id <> $1 AND ${NORM('phone')} = ${NORM('$2::text')} AND LENGTH(${NORM('$2::text')}) >= 7`,
      [arc.lead_id, arc.phone || ''])
    res.json({ success: true, message: 'Lead restored', lead_id: arc.lead_id, duplicates_found: dup[0].n, warnings })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    fail(res, err)
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════
//  POST /api/leads/bulk-delete   body: { ids: [uuid…], reason? }
// ══════════════════════════════════════════════════════════════════════
router.post('/bulk-delete', auth, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(id => UUID_RE.test(String(id)))
    if (!ids.length) return res.status(400).json({ success: false, message: 'No valid lead ids provided' })
    const r = await archiveAndDelete(ids, req.user, req.body.reason)
    res.json({ success: true, ...r, message: `${r.deleted} lead(s) deleted` + (r.skipped ? `, ${r.skipped} skipped (not found / not yours)` : '') })
  } catch (err) { fail(res, err) }
})

// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/leads/:id   (optional body / query: reason)
// ══════════════════════════════════════════════════════════════════════
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ success: false, message: 'Lead not found' })
    const r = await archiveAndDelete([req.params.id], req.user, req.body?.reason || req.query.reason)
    if (!r.deleted) return res.status(404).json({ success: false, message: 'Lead not found, or you do not have permission to delete it' })
    res.json({ success: true, message: 'Lead deleted' })
  } catch (err) { fail(res, err) }
})

// ══════════════════════════════════════════════════════════════════════
//  GET /api/leads/duplicates — groups of leads sharing a phone number
//  Admin: every group.  Agent: groups where at least one lead is theirs.
// ══════════════════════════════════════════════════════════════════════
router.get('/duplicates', auth, async (req, res) => {
  try {
    await ready
    const admin  = isAdmin(req.user)
    const params = []
    let scope = ''
    if (!admin) {
      params.push(req.user.id)
      scope = `AND n.norm_phone IN (SELECT ${NORM('m.phone')} FROM leads m WHERE m.assigned_to = $1)`
    }
    const { rows } = await db.query(`
      WITH n AS (
        SELECT l.id, l.contact_name, l.school_name, l.phone, l.email, l.status, l.city,
               l.assigned_to, l.product_id, l.created_at, l.updated_at, ${NORM('l.phone')} AS norm_phone
        FROM leads l
      ),
      g AS (
        SELECT norm_phone, COUNT(*)::int AS cnt FROM n
        WHERE LENGTH(norm_phone) >= 7 GROUP BY norm_phone HAVING COUNT(*) > 1
      )
      SELECT n.*, g.cnt AS group_size,
             u.name AS agent_name, p.name AS product_name,
             (SELECT COUNT(*)::int FROM call_logs cl WHERE cl.lead_id = n.id) AS activity_count
      FROM n
      JOIN g ON g.norm_phone = n.norm_phone
      LEFT JOIN users    u ON u.id = n.assigned_to
      LEFT JOIN products p ON p.id = n.product_id
      WHERE 1=1 ${scope}
      ORDER BY g.cnt DESC, n.norm_phone, n.created_at ASC
    `, params)

    const groups = []
    const byKey = new Map()
    for (const r of rows) {
      let grp = byKey.get(r.norm_phone)
      if (!grp) { grp = { key: r.norm_phone, phone: r.phone, count: r.group_size, leads: [] }; byKey.set(r.norm_phone, grp); groups.push(grp) }
      grp.leads.push({
        id: r.id, contact_name: r.contact_name, school_name: r.school_name, phone: r.phone, email: r.email,
        status: r.status, city: r.city, agent_name: r.agent_name, product_name: r.product_name,
        created_at: r.created_at, updated_at: r.updated_at, activity_count: r.activity_count,
        can_delete: admin ? true : (AGENTS_CAN_DELETE && r.assigned_to === req.user.id),
      })
    }
    res.json({
      success: true, data: groups.slice(0, 300),
      total_groups: groups.length,
      total_duplicate_leads: groups.reduce((s, g) => s + g.leads.length, 0),
      extra_copies: groups.reduce((s, g) => s + g.leads.length - 1, 0),
    })
  } catch (err) { fail(res, err) }
})

// ══════════════════════════════════════════════════════════════════════
//  POST /api/leads/check-duplicate   body: { phone, exclude_id? }
//  For create/edit forms: warn before saving.
// ══════════════════════════════════════════════════════════════════════
router.post('/check-duplicate', auth, async (req, res) => {
  try {
    await ready
    const digits = String(req.body.phone || '').replace(/\D/g, '').slice(-10)
    if (digits.length < 7) return res.json({ success: true, data: [] })
    const { rows } = await db.query(`
      SELECT l.id, l.contact_name, l.school_name, l.phone, l.status, l.created_at, u.name AS agent_name
      FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
      WHERE ${NORM('l.phone')} = $1 ${UUID_RE.test(String(req.body.exclude_id || '')) ? `AND l.id <> '${req.body.exclude_id}'` : ''}
      ORDER BY l.created_at ASC LIMIT 5
    `, [digits])
    res.json({ success: true, data: rows })
  } catch (err) { fail(res, err) }
})

module.exports = router
module.exports.NORM = NORM
