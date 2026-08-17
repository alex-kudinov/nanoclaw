-- rollback_119_company_work_job_runs.sql
--
-- Not auto-discovered by run_migration.sh. The rollback refuses to narrow the
-- schema while any host-job work history exists. Email history is preserved.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $rollback$
DECLARE
  v_job_items bigint := 0;
BEGIN
  SELECT count(*)
    INTO v_job_items
    FROM business_v2.company_work_items
   WHERE workflow_type = 'host_job_run';

  IF v_job_items <> 0 THEN
    RAISE EXCEPTION
      'company work ledger contains host-job history (items %); leave migration 119 dormant or perform a reviewed archival migration',
      v_job_items;
  END IF;
END
$rollback$;

ALTER TABLE business_v2.company_work_events
  DROP CONSTRAINT company_work_events_event_type_check,
  DROP CONSTRAINT company_work_events_receipt_required_chk,
  DROP CONSTRAINT company_work_events_exception_code_chk;

ALTER TABLE business_v2.company_work_events
  ADD CONSTRAINT company_work_events_event_type_check CHECK (
    event_type IN (
      'accepted', 'sales_dispatched', 'approval_requested', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'outcome_validated', 'blocked', 'failed', 'resumed', 'cancelled'
    )
  ),
  ADD CONSTRAINT company_work_events_receipt_required_chk CHECK (
    (event_type IN (
      'approved', 'action_claimed', 'external_acknowledged',
      'outcome_validated', 'cancelled'
    )) = (receipt_id IS NOT NULL)
  ),
  ADD CONSTRAINT company_work_events_exception_code_chk CHECK (
    (event_type IN ('blocked', 'failed')) = (exception_code IS NOT NULL)
  );

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_stage_check,
  DROP CONSTRAINT company_work_items_workflow_identity_chk,
  DROP CONSTRAINT company_work_items_completed_stage_chk;

ALTER TABLE business_v2.company_work_items
  ALTER COLUMN party_id SET NOT NULL,
  ALTER COLUMN pipeline_entry_id SET NOT NULL,
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type = 'sales_email'
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition = 'gmail_ack_and_thread_close'
  ),
  ADD CONSTRAINT company_work_items_stage_check CHECK (
    stage IN (
      'accepted', 'sales_dispatched', 'awaiting_approval', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'outcome_validated'
    )
  ),
  ADD CONSTRAINT company_work_items_completed_stage_chk CHECK (
    (stage = 'outcome_validated') = (disposition = 'completed')
  );

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. Stores stable internal identities and state only; no raw customer or approval content.';
COMMENT ON TABLE business_v2.company_work_events IS
  'Append-only, optimistic-versioned host transition facts. Agent prose is never a transition source.';

COMMIT;
