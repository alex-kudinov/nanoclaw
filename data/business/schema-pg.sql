-- NanoClaw Business Agent Schema (PostgreSQL)
-- Single-writer pattern per table. Owner listed in comments.
-- Run: psql nanoclaw_business < data/business/schema-pg.sql

-- Shared trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Owner: inbox (write), all agents (read)
CREATE TABLE IF NOT EXISTS leads (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',
  name        TEXT,
  email       TEXT,
  company     TEXT,
  message     TEXT,
  assigned_to TEXT,
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_status_last_contact_idx ON leads(status, last_contact_at);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);

CREATE TRIGGER leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: sales (write), all agents (read)
CREATE TABLE IF NOT EXISTS proposals (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER REFERENCES leads(id),
  status      TEXT NOT NULL DEFAULT 'draft',
  amount      NUMERIC(12,2),
  sent_at     TIMESTAMPTZ,
  signed_at   TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER proposals_updated BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: contracts (write), all agents (read)
CREATE TABLE IF NOT EXISTS contracts (
  id              SERIAL PRIMARY KEY,
  proposal_id     INTEGER REFERENCES proposals(id),
  client          TEXT NOT NULL,
  coach_assigned  TEXT,
  start_date      DATE,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER contracts_updated BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: billing (write), all agents (read)
CREATE TABLE IF NOT EXISTS invoices (
  id          SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id),
  amount      NUMERIC(12,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  due_date    DATE,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: coach-ops (write), all agents (read)
CREATE TABLE IF NOT EXISTS coaches (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT,
  capacity        INTEGER NOT NULL DEFAULT 5,
  current_clients INTEGER NOT NULL DEFAULT 0,
  certifications  JSONB,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER coaches_updated BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: coach-ops (write), all agents (read)
CREATE TABLE IF NOT EXISTS clients (
  id            SERIAL PRIMARY KEY,
  contract_id   INTEGER REFERENCES contracts(id),
  name          TEXT NOT NULL,
  email         TEXT,
  coach_id      INTEGER REFERENCES coaches(id),
  start_date    DATE,
  session_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Owner: procurement (write), all agents (read)
CREATE TABLE IF NOT EXISTS vendors (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT,
  cost         NUMERIC(12,2),
  renewal_date DATE,
  status       TEXT NOT NULL DEFAULT 'active',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Owner: any agent (write — append only), all agents (read)
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  from_agent  TEXT NOT NULL,
  to_agent    TEXT NOT NULL,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Roles
-- nanoclaw_inbox:    INSERT on leads
-- nanoclaw_sales:    SELECT, UPDATE on leads + proposals
-- nanoclaw_mailman:  SELECT on leads, UPDATE(status, last_contact_at, follow_up_count) on leads
-- nanoclaw_chief:    SELECT on all tables
-- nanoclaw_admin:    Full access (DDL + DML)
