-- 125_company_program_facts_work.sql
--
-- Add the first business-condition Company Work pilot. The program-facts
-- detector may create one durable, owner-visible exception and may close it
-- only with a clean-detector receipt. This migration stores hashes, counts,
-- opaque identities, and lifecycle state only; it stores no finding text,
-- product data, knowledge text, prompt, or automatic correction authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_workflow_identity_chk;

ALTER TABLE business_v2.company_work_items
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type IN (
      'sales_email', 'host_job_run', 'program_facts_drift'
    )
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition IN (
      'gmail_ack_and_thread_close', 'host_job_terminal_receipt',
      'detector_clean_receipt'
    )
  ),
  ADD CONSTRAINT company_work_items_workflow_identity_chk CHECK (
    (
      workflow_type = 'sales_email' AND
      party_id IS NOT NULL AND pipeline_entry_id IS NOT NULL AND
      completion_definition = 'gmail_ack_and_thread_close'
    ) OR (
      workflow_type = 'host_job_run' AND
      party_id IS NULL AND pipeline_entry_id IS NULL AND
      completion_definition = 'host_job_terminal_receipt'
    ) OR (
      workflow_type = 'program_facts_drift' AND
      party_id IS NULL AND pipeline_entry_id IS NULL AND
      completion_definition = 'detector_clean_receipt'
    )
  );

ALTER TABLE business_v2.company_work_events
  DROP CONSTRAINT company_work_events_event_type_check;

ALTER TABLE business_v2.company_work_events
  ADD CONSTRAINT company_work_events_event_type_check CHECK (
    event_type IN (
      'accepted', 'sales_dispatched', 'approval_requested', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'execution_started', 'execution_failed', 'outcome_validated',
      'blocked', 'failed', 'resumed', 'reopened', 'cancelled'
    )
  );

CREATE TABLE business_v2.company_program_fact_observations (
  id                   bigserial PRIMARY KEY,
  occurrence_id        text NOT NULL UNIQUE
                       REFERENCES business_v2.company_trigger_occurrences(
                         occurrence_id
                       ),
  work_item_id         bigint NOT NULL
                       REFERENCES business_v2.company_work_items(id),
  detector_version     smallint NOT NULL CHECK (detector_version = 1),
  outcome              text NOT NULL CHECK (outcome IN ('drift', 'clean')),
  finding_fingerprint  text NOT NULL CHECK (
                         finding_fingerprint ~ '^[0-9a-f]{64}$'
                       ),
  facts_sha256         text NOT NULL CHECK (
                         facts_sha256 ~ '^[0-9a-f]{64}$'
                       ),
  sales_kb_sha256      text NOT NULL CHECK (
                         sales_kb_sha256 ~ '^[0-9a-f]{64}$'
                       ),
  products_sha256      text CHECK (
                         products_sha256 IS NULL OR
                         products_sha256 ~ '^[0-9a-f]{64}$'
                       ),
  products_available   boolean NOT NULL,
  finding_count        integer NOT NULL CHECK (finding_count >= 0),
  checked_programs     integer NOT NULL CHECK (checked_programs >= 0),
  observed_at          timestamptz NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_program_fact_observations_outcome_chk CHECK (
    (outcome = 'clean' AND finding_count = 0) OR
    (outcome = 'drift' AND finding_count > 0)
  ),
  CONSTRAINT company_program_fact_observations_products_chk CHECK (
    products_available = (products_sha256 IS NOT NULL)
  )
);

CREATE INDEX company_program_fact_observations_item_idx
  ON business_v2.company_program_fact_observations
    (work_item_id, observed_at DESC, id DESC);

CREATE TRIGGER company_program_fact_observations_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.company_program_fact_observations
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_program_fact_observations IS
  'Append-only content-minimized detector evidence for the program-facts Company Work pilot. No raw facts, products, KB text, finding detail, or correction authority.';

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. sales_email is Party/pipeline-bound; host_job_run and program_facts_drift use opaque source identities. No raw customer, prompt, detector finding, output, or error content.';

COMMENT ON TABLE business_v2.company_work_events IS
  'Append-only, optimistic-versioned host transition facts for approved email, host job-run, and program-facts pilots. Agent prose is never a transition source.';

ALTER TABLE business_v2.company_program_fact_observations
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_program_fact_observations FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_program_fact_observations_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_program_fact_observations
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_program_fact_observations_id_seq TO nanoclaw_admin;

COMMIT;
