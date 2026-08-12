// backend/src/config/migrate_registration_integration.js
// Adds the schema needed to push a Converted lead from ThynkFlow into
// Thynk Registration as a school:
//   1. leads gets columns to track the push (idempotency + status display)
//   2. consultant_mapping — ThynkFlow user  ↔  Registration consultant
//   3. product_program_mapping — ThynkFlow product  ↔  Registration program
//
// Run this the same way migrate.js is run (see package.json "migrate" script).
// Safe to re-run — everything is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('./db');

async function migrate() {
  try {
    await db.query(`
      -- ── Track the push on the lead itself ─────────────────────────────
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_school_id UUID;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_school_code VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_pushed_at TIMESTAMP;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_pushed_by UUID REFERENCES users(id);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_push_error TEXT;

      -- ── Consultant identity mapping (admin-maintained) ────────────────
      -- One ThynkFlow user (consultant/agent) maps to one Registration
      -- consultant account. Kept as its own table (not a users column) so
      -- an admin can create/edit/remove mappings without touching auth data.
      CREATE TABLE IF NOT EXISTS consultant_mapping (
        id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        thynkflow_user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        registration_consultant_id  UUID NOT NULL,
        registration_consultant_code VARCHAR(100),
        registration_consultant_name VARCHAR(200),
        created_by                  UUID REFERENCES users(id),
        created_at                  TIMESTAMP DEFAULT NOW(),
        updated_at                  TIMESTAMP DEFAULT NOW(),
        UNIQUE (thynkflow_user_id)
      );

      -- ── Product ↔ Program mapping (admin-maintained) ──────────────────
      CREATE TABLE IF NOT EXISTS product_program_mapping (
        id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        thynkflow_product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        registration_project_id   UUID NOT NULL,
        registration_project_name VARCHAR(200),
        registration_project_slug VARCHAR(150),
        created_by                UUID REFERENCES users(id),
        created_at                 TIMESTAMP DEFAULT NOW(),
        updated_at                 TIMESTAMP DEFAULT NOW(),
        UNIQUE (thynkflow_product_id)
      );

      CREATE INDEX IF NOT EXISTS idx_leads_registration_school_id ON leads(registration_school_id);
    `);

    console.log('✅ Registration integration migration complete');
  } catch (err) {
    console.error('❌ Registration integration migration failed:', err.message);
    throw err;
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
