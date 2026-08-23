-- 132_company_healer_resolution_work.sql
-- Dark Company Work schema for privacy-minimized healer resolution decisions.
-- No producer, scheduler, Slack path, action, or agent grant is enabled here.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_workflow_identity_chk;

ALTER TABLE business_v2.company_work_items
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type IN (
      'sales_email', 'host_job_run', 'program_facts_drift',
      'healer_resolution'
    )
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition IN (
      'gmail_ack_and_thread_close', 'host_job_terminal_receipt',
      'detector_clean_receipt', 'healer_resolution_receipt'
    )
  ),
  ADD CONSTRAINT company_work_items_workflow_identity_chk CHECK (
    (workflow_type = 'sales_email' AND party_id IS NOT NULL AND
      pipeline_entry_id IS NOT NULL AND
      completion_definition = 'gmail_ack_and_thread_close') OR
    (workflow_type = 'host_job_run' AND party_id IS NULL AND
      pipeline_entry_id IS NULL AND
      completion_definition = 'host_job_terminal_receipt') OR
    (workflow_type = 'program_facts_drift' AND party_id IS NULL AND
      pipeline_entry_id IS NULL AND
      completion_definition = 'detector_clean_receipt') OR
    (workflow_type = 'healer_resolution' AND party_id IS NULL AND
      pipeline_entry_id IS NULL AND
      completion_definition = 'healer_resolution_receipt')
  );

CREATE TABLE business_v2.company_healer_resolution_observations (
  id                     bigserial PRIMARY KEY,
  observation_key        text NOT NULL UNIQUE CHECK (
                           observation_key ~ '^[a-z0-9][a-z0-9._:-]*$' AND
                           length(observation_key) <= 500
                         ),
  work_item_id           bigint NOT NULL
                         REFERENCES business_v2.company_work_items(id),
  catalog_version        smallint NOT NULL CHECK (catalog_version = 1),
  resolution_fingerprint text NOT NULL CHECK (
                           resolution_fingerprint ~ '^[0-9a-f]{64}$'
                         ),
  disposition            text NOT NULL CHECK (
                           disposition IN (
                             'monitoring', 'pending_decision',
                             'verified_fixed', 'decided_no_action'
                           )
                         ),
  decision_code          text CHECK (
                           decision_code IS NULL OR
                           decision_code ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
                         ),
  decision_owner         text CHECK (
                           decision_owner IS NULL OR
                           decision_owner ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
                         ),
  decision_actor_sha256  text CHECK (
                           decision_actor_sha256 IS NULL OR
                           decision_actor_sha256 ~ '^[0-9a-f]{64}$'
                         ),
  evidence_sha256        text NOT NULL CHECK (
                           evidence_sha256 ~ '^[0-9a-f]{64}$'
                         ),
  observed_at            timestamptz NOT NULL,
  recorded_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_healer_resolution_decision_chk CHECK (
    (disposition = 'pending_decision') = (decision_code IS NOT NULL) AND
    (disposition = 'pending_decision') = (decision_owner IS NOT NULL) AND
    (disposition = 'decided_no_action') =
      (decision_actor_sha256 IS NOT NULL)
  )
);

CREATE INDEX company_healer_resolution_observations_item_idx
  ON business_v2.company_healer_resolution_observations
    (work_item_id, observed_at DESC, id DESC);

CREATE TRIGGER company_healer_resolution_observations_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.company_healer_resolution_observations
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_healer_resolution_observations IS
  'Append-only minimized healer resolution evidence: opaque identity, hashes, disposition, decision code/owner, and time only; no raw context, diagnosis, solution text, command, diff, Slack identity, or transcript.';

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. healer_resolution is incident-fingerprint-bound and closes only with a verified recovery or named no-action receipt. No raw customer, prompt, detector finding, healer diagnosis, proposed solution, output, or error content.';

ALTER TABLE business_v2.company_healer_resolution_observations
  OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.company_healer_resolution_observations FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_healer_resolution_observations_id_seq FROM PUBLIC;
GRANT ALL ON business_v2.company_healer_resolution_observations
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_healer_resolution_observations_id_seq TO nanoclaw_admin;

COMMIT;
