-- rollback_125_company_program_facts_work.sql
--
-- Not auto-discovered by run_migration.sh. Refuse to erase detector/work
-- evidence. Once the pilot has history, leave the additive schema dormant.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $rollback$
DECLARE
  v_items bigint := 0;
  v_observations bigint := 0;
  v_reopened bigint := 0;
BEGIN
  SELECT count(*) INTO v_items
    FROM business_v2.company_work_items
   WHERE workflow_type = 'program_facts_drift';

  SELECT count(*) INTO v_observations
    FROM business_v2.company_program_fact_observations;

  SELECT count(*) INTO v_reopened
    FROM business_v2.company_work_events
   WHERE event_type = 'reopened';

  IF v_items <> 0 OR v_observations <> 0 OR v_reopened <> 0 THEN
    RAISE EXCEPTION
      'program-facts Company Work history exists (items %, observations %, reopened %); leave migration 125 dormant or perform a reviewed archival migration',
      v_items, v_observations, v_reopened;
  END IF;
END
$rollback$;

DROP TABLE business_v2.company_program_fact_observations;

ALTER TABLE business_v2.company_work_events
  DROP CONSTRAINT company_work_events_event_type_check;

ALTER TABLE business_v2.company_work_events
  ADD CONSTRAINT company_work_events_event_type_check CHECK (
    event_type IN (
      'accepted', 'sales_dispatched', 'approval_requested', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'execution_started', 'execution_failed', 'outcome_validated',
      'blocked', 'failed', 'resumed', 'cancelled'
    )
  );

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_workflow_identity_chk;

ALTER TABLE business_v2.company_work_items
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type IN ('sales_email', 'host_job_run')
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition IN (
      'gmail_ack_and_thread_close', 'host_job_terminal_receipt'
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
    )
  );

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. sales_email is Party/pipeline-bound; host_job_run is keyed only by an opaque job/run identity. No raw customer, prompt, output, or error content.';

COMMENT ON TABLE business_v2.company_work_events IS
  'Append-only, optimistic-versioned host transition facts for approved email and host job-run pilots. Agent prose is never a transition source.';

COMMIT;
