-- NanoClaw Business Agent Schema
-- Single-writer pattern per table. Owner listed in comments.
-- Run: sqlite3 data/business/business.db < data/business/schema.sql

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Owner: inbox (write), all agents (read)
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,           -- 'contact-form' | 'email' | 'referral' | ...
  status      TEXT NOT NULL DEFAULT 'new', -- 'new' | 'qualified' | 'opportunity' | 'closed-won' | 'closed-lost'
  name        TEXT,
  email       TEXT,
  company     TEXT,
  message     TEXT,
  assigned_to TEXT,                    -- agent group name or human name
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: sales (write), all agents (read)
CREATE TABLE IF NOT EXISTS proposals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER REFERENCES leads(id),
  status      TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'sent' | 'negotiating' | 'signed' | 'declined'
  amount      REAL,
  sent_at     TEXT,
  signed_at   TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: contracts (write), all agents (read)
CREATE TABLE IF NOT EXISTS contracts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id     INTEGER REFERENCES proposals(id),
  client          TEXT NOT NULL,
  coach_assigned  TEXT,
  start_date      TEXT,
  end_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: billing (write), all agents (read)
CREATE TABLE IF NOT EXISTS invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER REFERENCES contracts(id),
  amount      REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'paid' | 'overdue'
  due_date    TEXT,
  paid_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: coach-ops (write), all agents (read)
CREATE TABLE IF NOT EXISTS coaches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT,
  capacity        INTEGER NOT NULL DEFAULT 5,  -- max concurrent clients
  current_clients INTEGER NOT NULL DEFAULT 0,
  certifications  TEXT,                        -- JSON array
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: coach-ops (write), all agents (read)
CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id   INTEGER REFERENCES contracts(id),
  name          TEXT NOT NULL,
  email         TEXT,
  coach_id      INTEGER REFERENCES coaches(id),
  start_date    TEXT,
  session_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: procurement (write), all agents (read)
CREATE TABLE IF NOT EXISTS vendors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  category     TEXT,                    -- 'software' | 'service' | 'contractor'
  cost         REAL,
  renewal_date TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owner: any agent (write — append only), all agents (read)
-- Cross-agent async task handoffs
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent  TEXT NOT NULL,
  to_agent    TEXT NOT NULL,
  type        TEXT NOT NULL,            -- e.g. 'qualify-lead', 'draft-proposal'
  payload     TEXT NOT NULL,            -- JSON
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in-progress' | 'done' | 'failed'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Triggers to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS leads_updated AFTER UPDATE ON leads
  BEGIN UPDATE leads SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS proposals_updated AFTER UPDATE ON proposals
  BEGIN UPDATE proposals SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS contracts_updated AFTER UPDATE ON contracts
  BEGIN UPDATE contracts SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS invoices_updated AFTER UPDATE ON invoices
  BEGIN UPDATE invoices SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS coaches_updated AFTER UPDATE ON coaches
  BEGIN UPDATE coaches SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS clients_updated AFTER UPDATE ON clients
  BEGIN UPDATE clients SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS tasks_updated AFTER UPDATE ON tasks
  BEGIN UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id; END;
