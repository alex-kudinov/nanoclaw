-- 144_academy_capacity_operator_pilot.sql
--
-- Host-owned, privacy-minimized case and receipt ledger for the Gate D
-- Academy Capacity operator pilot. Migration 143 must already exist. The
-- Capacity minion receives no database role or direct table access.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.academy_capacity_events') IS NULL THEN
    RAISE EXCEPTION 'migration 143 must be applied before migration 144';
  END IF;
END $$;

CREATE TABLE business_v2.academy_capacity_operator_cases (
  id bigserial PRIMARY KEY,
  case_key text NOT NULL UNIQUE
    CHECK (case_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  source_group text NOT NULL CHECK (source_group = 'capacity'),
  command_type text NOT NULL CHECK (command_type IN (
    'reserve_manual', 'release_reservation', 'transfer_assignment',
    'withdraw_assignment', 'reconcile_pool', 'join_waitlist',
    'stage_waitlist_offer'
  )),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  request_summary jsonb NOT NULL
    CHECK (jsonb_typeof(request_summary) = 'object')
    CHECK (octet_length(request_summary::text) <= 4096),
  state text NOT NULL CHECK (state IN (
    'processing', 'applied', 'denied', 'needs_review', 'failed'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  result_code text
    CHECK (result_code IS NULL OR result_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  result_sha256 text
    CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  result_summary jsonb
    CHECK (result_summary IS NULL OR jsonb_typeof(result_summary) = 'object')
    CHECK (result_summary IS NULL OR octet_length(result_summary::text) <= 4096),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (created_at <= updated_at),
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK ((state = 'processing') =
    (completed_at IS NULL AND result_code IS NULL AND
     result_sha256 IS NULL AND result_summary IS NULL))
);
CREATE INDEX academy_capacity_operator_cases_queue_idx
  ON business_v2.academy_capacity_operator_cases
  (state, updated_at, id)
  WHERE state IN ('needs_review', 'failed');

CREATE TABLE business_v2.academy_capacity_operator_receipts (
  id bigserial PRIMARY KEY,
  receipt_key text NOT NULL UNIQUE
    CHECK (char_length(receipt_key) BETWEEN 1 AND 500),
  case_id bigint NOT NULL
    REFERENCES business_v2.academy_capacity_operator_cases(id),
  case_version integer NOT NULL CHECK (case_version >= 0),
  stage text NOT NULL CHECK (stage IN ('requested', 'final')),
  outcome text NOT NULL CHECK (outcome IN (
    'accepted', 'verified', 'denied', 'needs_review', 'failed'
  )),
  result_code text NOT NULL CHECK (result_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  summary_json jsonb NOT NULL
    CHECK (jsonb_typeof(summary_json) = 'object')
    CHECK (octet_length(summary_json::text) <= 4096),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (case_id, case_version, stage),
  CHECK (occurred_at <= recorded_at)
);
CREATE INDEX academy_capacity_operator_receipts_case_idx
  ON business_v2.academy_capacity_operator_receipts
  (case_id, case_version, recorded_at, id);

CREATE TRIGGER academy_capacity_operator_receipts_append_only
  BEFORE UPDATE OR DELETE ON business_v2.academy_capacity_operator_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE VIEW business_v2.v_academy_capacity_operator_cases AS
SELECT
  c.case_key,
  c.command_type,
  c.state,
  c.version,
  c.result_code,
  c.request_summary,
  c.result_summary,
  c.created_at,
  c.completed_at,
  count(r.id)::integer AS receipt_count,
  max(r.recorded_at) AS last_receipt_at
FROM business_v2.academy_capacity_operator_cases c
LEFT JOIN business_v2.academy_capacity_operator_receipts r
  ON r.case_id = c.id
GROUP BY c.id;

COMMENT ON VIEW business_v2.v_academy_capacity_operator_cases IS
  'Privacy-minimized Gate D Capacity command outcomes; no student names, emails, payment details, or provider payloads.';

DO $$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'academy_capacity_operator_cases',
    'academy_capacity_operator_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE business_v2.%I OWNER TO nanoclaw_admin', object_name);
    EXECUTE format('REVOKE ALL ON business_v2.%I FROM PUBLIC', object_name);
    EXECUTE format('GRANT ALL ON business_v2.%I TO nanoclaw_admin', object_name);
  END LOOP;
  ALTER VIEW business_v2.v_academy_capacity_operator_cases OWNER TO nanoclaw_admin;
  REVOKE ALL ON business_v2.v_academy_capacity_operator_cases FROM PUBLIC;
  GRANT ALL ON business_v2.v_academy_capacity_operator_cases TO nanoclaw_admin;
END $$;

DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'academy_capacity_operator_cases_id_seq',
    'academy_capacity_operator_receipts_id_seq'
  ] LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin', sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC', sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE business_v2.%I TO nanoclaw_admin', sequence_name);
  END LOOP;
END $$;

COMMIT;
