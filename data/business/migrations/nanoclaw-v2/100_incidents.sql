-- 100_incidents.sql
-- Self-healing system, Phase 0 (docs/SELF-HEALING-DESIGN.md §3.1).
--
-- Unified incident store. The healer's pull collector funnels every error
-- surface (minion errors, failed jobs, frozen sweeper watermarks, daemon
-- crashes) into one deduped, queryable queue. Mirrors the webhook_inbox
-- dead-letter pattern: durable queue -> driven to a terminal state.
--
-- Dedup: a partial unique index on fingerprint WHERE status is non-terminal
-- guarantees exactly ONE open incident per fingerprint, giving the collector a
-- clean ON CONFLICT upsert target (recurring errors bump occurrences instead
-- of flooding new rows).
--
-- Online-safe: new table only.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.incidents (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source            text NOT NULL,                 -- minion:sales | sweeper:trafft | job:digest | daemon
  fingerprint       text NOT NULL,                 -- hash of normalized error (dedup key)
  severity          text NOT NULL DEFAULT 'error', -- info | warn | error | critical
  status            text NOT NULL DEFAULT 'new',
  occurrences       int  NOT NULL DEFAULT 1,
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  raw_context       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- redacted: stderr, exit code, trigger
  remediation_class text,                          -- transient | config | code_bug | external_outage | data
  diagnosis         text,                          -- Phase 1: Claude root cause
  proposed_fix      jsonb,                         -- Phase 1: diff and/or rerun command
  applied_action    jsonb,                         -- what the healer actually did
  outcome           text,                          -- verified_fixed | still_failing | escalated
  origin            text NOT NULL DEFAULT 'collector', -- loop-prevention: tag healer-originated work
  restart_attempts  int  NOT NULL DEFAULT 0,       -- daemon-down restart cap
  proposal_channel  text,                          -- Phase 1: Slack channel of the proposal msg
  proposal_ts       text,                          -- Phase 1: Slack ts of the proposal msg
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_severity_chk
    CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  CONSTRAINT incidents_status_chk
    CHECK (status IN ('new', 'triaging', 'diagnosed', 'awaiting_approval',
                      'remediating', 'resolved', 'wont_fix', 'recurring'))
);

-- One OPEN incident per fingerprint -> ON CONFLICT upsert target for dedup.
CREATE UNIQUE INDEX incidents_open_fingerprint_uniq
  ON business_v2.incidents (fingerprint)
  WHERE status NOT IN ('resolved', 'wont_fix');

CREATE INDEX incidents_status_idx ON business_v2.incidents (status);
CREATE INDEX incidents_source_idx ON business_v2.incidents (source);
CREATE INDEX incidents_last_seen_idx ON business_v2.incidents (last_seen DESC);

COMMENT ON TABLE business_v2.incidents IS
  'Self-healing incident queue. Pull collector dedups errors by fingerprint (one open row per fingerprint via partial unique index). status drives the heal lifecycle; raw_context is redacted before write.';

ALTER TABLE business_v2.incidents OWNER TO nanoclaw_admin;

COMMIT;

-- Smoke (BEGIN/ROLLBACK)
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
DECLARE v int;
BEGIN
  -- Insert, then upsert same fingerprint -> occurrences bumps, no second row.
  INSERT INTO business_v2.incidents (source, fingerprint, severity)
  VALUES ('minion:test', 'fp-abc', 'error');

  INSERT INTO business_v2.incidents (source, fingerprint, severity)
  VALUES ('minion:test', 'fp-abc', 'error')
  ON CONFLICT (fingerprint) WHERE status NOT IN ('resolved', 'wont_fix')
  DO UPDATE SET occurrences = business_v2.incidents.occurrences + 1,
               last_seen = now();

  SELECT occurrences INTO v FROM business_v2.incidents WHERE fingerprint = 'fp-abc';
  IF v <> 2 THEN RAISE EXCEPTION 'Smoke FAIL: expected occurrences=2, got %', v; END IF;

  -- A resolved incident with the same fingerprint may coexist (history kept).
  UPDATE business_v2.incidents SET status = 'resolved' WHERE fingerprint = 'fp-abc';
  INSERT INTO business_v2.incidents (source, fingerprint, severity)
  VALUES ('minion:test', 'fp-abc', 'error');  -- new open row, no conflict

  SELECT count(*)::int INTO v FROM business_v2.incidents WHERE fingerprint = 'fp-abc';
  IF v <> 2 THEN RAISE EXCEPTION 'Smoke FAIL: expected 2 rows (1 resolved + 1 open), got %', v; END IF;

  -- Severity check enforces enum.
  BEGIN
    INSERT INTO business_v2.incidents (source, fingerprint, severity)
    VALUES ('x', 'y', 'bogus');
    RAISE EXCEPTION 'Smoke FAIL: invalid severity accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'Phase 0 smoke PASS: incidents table';
END $$;
ROLLBACK;
