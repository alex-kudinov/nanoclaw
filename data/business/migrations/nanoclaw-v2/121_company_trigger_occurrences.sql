-- 121_company_trigger_occurrences.sql
--
-- Dark, host-owned Company OS trigger-occurrence foundation. This migration
-- stores content-free normalized identities and evidence hashes only. It does
-- not wire a source, create/resume a task, select a skill, grant authority, or
-- perform an action.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_trigger_occurrences (
  id                    bigserial PRIMARY KEY,
  contract_version      smallint NOT NULL CHECK (contract_version = 1),
  definition_id         text NOT NULL CHECK (
                          definition_id ~ '^[0-9a-f]{64}$'
                        ),
  occurrence_id         text NOT NULL UNIQUE CHECK (
                          occurrence_id ~ '^[0-9a-f]{64}$'
                        ),
  semantic_fingerprint  text NOT NULL CHECK (
                          semantic_fingerprint ~ '^[0-9a-f]{64}$'
                        ),
  trigger_kind          text NOT NULL CHECK (
                          trigger_kind IN (
                            'time', 'gmail', 'webhook', 'topic',
                            'business_condition'
                          )
                        ),
  source_system         text NOT NULL CHECK (
                          source_system ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
                        ),
  source_key            text NOT NULL CHECK (
                          source_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                        ),
  occurrence_key        text NOT NULL CHECK (
                          occurrence_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                        ),
  observed_at           timestamptz NOT NULL,
  payload_sha256        text NOT NULL CHECK (
                          payload_sha256 ~ '^[0-9a-f]{64}$'
                        ),
  requested_operation   text NOT NULL CHECK (
                          requested_operation IN ('create', 'resume')
                        ),
  workflow_type         text NOT NULL CHECK (
                          workflow_type ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
                        ),
  work_source_system    text NOT NULL CHECK (
                          work_source_system ~
                            '^[a-z0-9][a-z0-9._-]{0,63}$'
                        ),
  work_source_key       text NOT NULL CHECK (
                          work_source_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                        ),
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_trigger_occurrences_source_uniq
    UNIQUE (trigger_kind, source_system, source_key, occurrence_key)
);

CREATE INDEX company_trigger_occurrences_definition_idx
  ON business_v2.company_trigger_occurrences
    (definition_id, observed_at, id);

CREATE INDEX company_trigger_occurrences_work_idx
  ON business_v2.company_trigger_occurrences
    (workflow_type, work_source_system, work_source_key, observed_at, id);

CREATE TRIGGER company_trigger_occurrences_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_trigger_occurrences
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_trigger_occurrences IS
  'Host-owned normalized source occurrences. Contains opaque identities and hashes only; acceptance grants no task, skill, capability, approval, or action authority.';

ALTER TABLE business_v2.company_trigger_occurrences OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_trigger_occurrences FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_trigger_occurrences_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_trigger_occurrences TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_trigger_occurrences_id_seq TO nanoclaw_admin;

COMMIT;
