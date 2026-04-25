-- Classification schema for bidirectional Gmail classification
-- See: .claude/plans/nanoclaw/active/2026-04-09-bidirectional-gmail-classification.md
-- Applied via: psql -h 192.168.64.1 -U nanoclaw_admin -d nanoclaw_business -v ON_ERROR_STOP=1 -f data/business/classification-schema.sql
-- Re-runnable: all DDL uses IF NOT EXISTS; seed uses ON CONFLICT DO NOTHING.

BEGIN;

-- Classification taxonomy: extensible category tree
CREATE TABLE IF NOT EXISTS classification_taxonomy (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,             -- e.g. "MrGru/financial/receipt"
    parent_label TEXT,                      -- e.g. "MrGru/financial"
    description TEXT,
    hive_share_target TEXT[],               -- e.g. {"alex","cherie"} or NULL
    digest_priority INTEGER DEFAULT 0,      -- 0=skip, 1=normal, 2=high
    auto_archive BOOLEAN NOT NULL DEFAULT FALSE, -- remove INBOX label on classify
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON classification_taxonomy(parent_label);
CREATE INDEX IF NOT EXISTS idx_taxonomy_enabled ON classification_taxonomy(enabled);

-- Back-apply auto_archive column for installs that pre-date it
ALTER TABLE classification_taxonomy
  ADD COLUMN IF NOT EXISTS auto_archive BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-message classification record (history + idempotency)
CREATE TABLE IF NOT EXISTS email_classifications (
    id SERIAL PRIMARY KEY,
    gmail_message_id TEXT NOT NULL UNIQUE,
    gmail_thread_id TEXT NOT NULL,
    sender_email TEXT,
    subject TEXT,
    label TEXT NOT NULL,                    -- canonical label from taxonomy
    confidence NUMERIC(3,2),                -- 0.00 - 1.00
    classifier_version TEXT NOT NULL,       -- e.g. "mailman-v2-2026-04-09"
    reasoning TEXT,                         -- one-line LLM rationale
    classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    corrected_at TIMESTAMPTZ,               -- non-null if a lesson reclassified
    corrected_from_label TEXT,              -- previous label before correction
    hive_synced BOOLEAN DEFAULT FALSE,      -- did we write to Firestore
    hive_synced_at TIMESTAMPTZ,
    reaper_attempts INTEGER DEFAULT 0,      -- reaper max-retry-with-dead-letter
    hive_sync_dead_lettered BOOLEAN DEFAULT FALSE,
    routed_at TIMESTAMPTZ                         -- non-null once host-router dispatch succeeds
);
CREATE INDEX IF NOT EXISTS idx_class_thread ON email_classifications(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_class_sender ON email_classifications(sender_email);
CREATE INDEX IF NOT EXISTS idx_class_label ON email_classifications(label);
CREATE INDEX IF NOT EXISTS idx_class_classified_at ON email_classifications(classified_at);

-- Back-apply routed_at column for installs that pre-date it
ALTER TABLE email_classifications
  ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;

-- Deterministic pre-rules (sender/subject patterns mailman doesn't need to LLM-classify)
CREATE TABLE IF NOT EXISTS classification_rules (
    id SERIAL PRIMARY KEY,
    pattern_type TEXT NOT NULL,             -- 'sender_exact','sender_regex','subject_regex','header_match'
    pattern_value TEXT NOT NULL,
    target_label TEXT NOT NULL REFERENCES classification_taxonomy(label),
    source TEXT NOT NULL,                   -- 'lesson','manual','seed'
    lesson_id INTEGER,                      -- nullable, links to LEARNED.md lesson number
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    probation_until TIMESTAMPTZ,             -- if set, rule is provisional until this time
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pattern_type, pattern_value)
);
CREATE INDEX IF NOT EXISTS idx_rules_pattern_type ON classification_rules(pattern_type);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON classification_rules(enabled);

-- Back-apply probation_until column for installs that pre-date it
ALTER TABLE classification_rules
  ADD COLUMN IF NOT EXISTS probation_until TIMESTAMPTZ;

-- Pending backfill state (owned by T12; lives in DB, not router_state, because
-- router_state has no key-enumeration API).
CREATE TABLE IF NOT EXISTS classification_backfill_pending (
    id SERIAL PRIMARY KEY,
    lesson_title TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    pattern_value TEXT NOT NULL,
    target_label TEXT NOT NULL REFERENCES classification_taxonomy(label),
    match_count INTEGER NOT NULL,
    dry_run_summary TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_confirmation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_backfill_pending_status ON classification_backfill_pending(status);
CREATE INDEX IF NOT EXISTS idx_backfill_pending_expires ON classification_backfill_pending(expires_at);

-- Drift repair: ensure production-live columns exist in leads table
-- (plutio_person_id and thread_id live in production but are not in schema-pg.sql)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS plutio_person_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS thread_id TEXT;

COMMIT;
