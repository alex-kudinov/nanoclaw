-- 109_incidents_thread.sql
-- Self-healing Phase 4 — per-incident Slack thread root.
--
-- Keep an incident's whole lifecycle (investigate → diagnose → apply/implement →
-- resolve) under ONE threaded conversation in #gru-incidents instead of a flat
-- list of disconnected messages. The first healer post about an incident becomes
-- the thread ROOT; its ts+channel are stored here and every later post replies
-- in-thread. (Distinct from proposal_ts, which remains the specific message whose
-- 👍 we poll — itself posted as a reply under this root.)
--
-- Online-safe: 2 nullable columns. Idempotent (ADD COLUMN IF NOT EXISTS).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.incidents
  ADD COLUMN IF NOT EXISTS thread_ts      text,
  ADD COLUMN IF NOT EXISTS thread_channel text;

COMMENT ON COLUMN business_v2.incidents.thread_ts IS
  'Phase 4: Slack ts of the incident thread ROOT (first healer post); later posts reply in-thread.';
COMMENT ON COLUMN business_v2.incidents.thread_channel IS
  'Phase 4: Slack channel of the incident thread root.';

COMMIT;
