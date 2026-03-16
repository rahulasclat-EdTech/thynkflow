require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('./db');

async function migrate() {
  try {
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Roles
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Users
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role_id INTEGER REFERENCES roles(id) DEFAULT 2,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Leads
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        school_name VARCHAR(200),
        contact_name VARCHAR(100),
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        city VARCHAR(100),
        source VARCHAR(50) DEFAULT 'excel_upload',
        status VARCHAR(50) DEFAULT 'new',
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Call Logs / Follow-ups
      CREATE TABLE IF NOT EXISTS call_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        status VARCHAR(50) NOT NULL,
        discussion TEXT,
        next_followup_date DATE,
        called_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_next_followup ON call_logs(next_followup_date);
    `);

    // Seed default roles
    await db.query(`
      INSERT INTO roles (id, name, permissions) VALUES
        (1, 'admin', '{"all": true}'),
        (2, 'agent', '{"leads": true, "followups": true, "reports": "own"}')
      ON CONFLICT (name) DO NOTHING;
    `);

    // Seed default admin user (password: Admin@123)
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Admin@123', 10);
    await db.query(`
      INSERT INTO users (name, email, password, role_id)
      VALUES ('Admin User', 'admin@thynkflow.com', $1, 1)
      ON CONFLICT (email) DO NOTHING;
    `, [hash]);

    console.log('✅ Migration complete! Admin: admin@thynkflow.com / Admin@123');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
