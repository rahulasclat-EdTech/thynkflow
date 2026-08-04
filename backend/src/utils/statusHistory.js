// backend/src/utils/statusHistory.js
//
// Tracks every lead status transition so we can report "status change
// counts" product-wise and agent-wise (who changed what, and to what).
// Called from routes/leads.js (PUT /:id, PATCH /:id/status) and
// routes/followups.js (PATCH /:leadId) — the three places a lead's
// status can change.

const db = require('../config/db')

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_status_history (
      id          SERIAL PRIMARY KEY,
      lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
      from_status VARCHAR(30),
      to_status   VARCHAR(30) NOT NULL,
      changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      product_id  INT,
      changed_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lsh_lead_id    ON lead_status_history(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lsh_changed_at ON lead_status_history(changed_at);
    CREATE INDEX IF NOT EXISTS idx_lsh_changed_by ON lead_status_history(changed_by);
  `)
}
ensureTable().catch(console.error)

// Logs a transition only if the status actually changed.
// Snapshots product_id at the time of change so the report can group
// by "what product was this lead for when the status changed" even if
// the product gets reassigned later.
async function logStatusChange(leadId, fromStatus, toStatus, changedBy) {
  try {
    if (!toStatus || fromStatus === toStatus) return
    const { rows } = await db.query(`SELECT product_id FROM leads WHERE id = $1`, [leadId])
    const productId = rows[0]?.product_id || null
    await db.query(
      `INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_by, product_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [leadId, fromStatus || null, toStatus, changedBy || null, productId]
    )
  } catch (err) {
    console.error('[statusHistory] logStatusChange error:', err.message)
  }
}

module.exports = { logStatusChange }
