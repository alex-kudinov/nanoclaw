-- 100_email_followup_suppressions.sql — proposal ↔ email-followup de-dup
-- Part of NanoClaw Schema v2 (post-base extension)
--
-- Why: the sales email follow-up cron and the Plutio proposal follow-up loop
-- were independent. A lead we sent a Plutio proposal to could still get sales
-- email nudges. Sending a proposal does NOT advance pipeline_entries.stage, so
-- stage is not a usable de-dup signal. The authoritative "has an open proposal"
-- set is Plutio (status:pending), which the host already fetches daily. This
-- table is that set, refreshed each run by the proposal tick. The sales queue
-- view (105) excludes anyone present here with a recent last_seen_open_at.
--
-- Self-healing: a signed/declined/voided proposal drops out of Plutio's open
-- set, stops being refreshed, and ages out (view uses a recency window). No
-- manual cleanup. Matched by lower(email) OR party_id (party_id may be null).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE IF NOT EXISTS business_v2.email_followup_suppressions (
  proposal_plutio_id text        PRIMARY KEY,
  party_id           bigint,
  email              text,        -- store lowercased by the writer
  reason             text        NOT NULL DEFAULT 'open_proposal',
  last_seen_open_at  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.email_followup_suppressions IS
  'Open Plutio proposals (status:pending), refreshed daily by the proposal follow-up tick. The sales follow-up queue view excludes these recipients so proposal recipients are not also email-nudged. Rows age out via last_seen_open_at once a proposal leaves Plutio''s open set.';

CREATE INDEX IF NOT EXISTS idx_efs_email
  ON business_v2.email_followup_suppressions (email);
CREATE INDEX IF NOT EXISTS idx_efs_party
  ON business_v2.email_followup_suppressions (party_id);
CREATE INDEX IF NOT EXISTS idx_efs_last_seen
  ON business_v2.email_followup_suppressions (last_seen_open_at);

-- Host writes via the nanoclaw_admin pool (business-db.ts). Agent roles never
-- touch this table directly — they only see its effect through view 101.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON business_v2.email_followup_suppressions TO nanoclaw_admin;

COMMIT;
