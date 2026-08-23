-- Guarded rollback for migration 132. Never erase healer decision history.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $rollback$
DECLARE
  v_items bigint;
  v_observations bigint;
BEGIN
  SELECT count(*) INTO v_items FROM business_v2.company_work_items
   WHERE workflow_type = 'healer_resolution';
  SELECT count(*) INTO v_observations
    FROM business_v2.company_healer_resolution_observations;
  IF v_items <> 0 OR v_observations <> 0 THEN
    RAISE EXCEPTION
      'healer-resolution Company Work history exists (items %, observations %); leave migration 132 dormant or perform a reviewed archival migration',
      v_items, v_observations;
  END IF;
END
$rollback$;

DROP TABLE business_v2.company_healer_resolution_observations;

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_workflow_identity_chk;

ALTER TABLE business_v2.company_work_items
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type IN ('sales_email', 'host_job_run', 'program_facts_drift')
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition IN (
      'gmail_ack_and_thread_close', 'host_job_terminal_receipt',
      'detector_clean_receipt'
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
      completion_definition = 'detector_clean_receipt')
  );

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. sales_email is Party/pipeline-bound; host_job_run and program_facts_drift use opaque source identities. No raw customer, prompt, detector finding, output, or error content.';

COMMIT;
