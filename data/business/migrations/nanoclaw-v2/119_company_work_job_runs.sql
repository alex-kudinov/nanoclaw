-- 119_company_work_job_runs.sql
--
-- Local, dark schema contract for the second Company OS ledger pilot. This
-- widens the migration-118 tables just enough to represent one immutable host
-- job run. It does not read SQLite, wire a producer, grant an agent access, or
-- change the scheduler/job execution authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.company_work_items
  DROP CONSTRAINT company_work_items_workflow_type_check,
  DROP CONSTRAINT company_work_items_completion_definition_check,
  DROP CONSTRAINT company_work_items_stage_check,
  DROP CONSTRAINT company_work_items_completed_stage_chk,
  ALTER COLUMN party_id DROP NOT NULL,
  ALTER COLUMN pipeline_entry_id DROP NOT NULL;

ALTER TABLE business_v2.company_work_items
  ADD CONSTRAINT company_work_items_workflow_type_check CHECK (
    workflow_type IN ('sales_email', 'host_job_run')
  ),
  ADD CONSTRAINT company_work_items_completion_definition_check CHECK (
    completion_definition IN (
      'gmail_ack_and_thread_close', 'host_job_terminal_receipt'
    )
  ),
  ADD CONSTRAINT company_work_items_stage_check CHECK (
    stage IN (
      'accepted', 'sales_dispatched', 'awaiting_approval', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'execution_started', 'outcome_validated'
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
  ),
  ADD CONSTRAINT company_work_items_completed_stage_chk CHECK (
    (stage = 'outcome_validated') = (disposition = 'completed')
  );

ALTER TABLE business_v2.company_work_events
  DROP CONSTRAINT company_work_events_event_type_check,
  DROP CONSTRAINT company_work_events_receipt_required_chk,
  DROP CONSTRAINT company_work_events_exception_code_chk;

ALTER TABLE business_v2.company_work_events
  ADD CONSTRAINT company_work_events_event_type_check CHECK (
    event_type IN (
      'accepted', 'sales_dispatched', 'approval_requested', 'approved',
      'mailman_dispatched', 'action_claimed', 'external_acknowledged',
      'execution_started', 'execution_failed', 'outcome_validated',
      'blocked', 'failed', 'resumed', 'cancelled'
    )
  ),
  ADD CONSTRAINT company_work_events_receipt_required_chk CHECK (
    (event_type IN (
      'approved', 'action_claimed', 'external_acknowledged',
      'execution_failed', 'outcome_validated', 'cancelled'
    )) = (receipt_id IS NOT NULL)
  ),
  ADD CONSTRAINT company_work_events_exception_code_chk CHECK (
    (event_type IN ('blocked', 'failed', 'execution_failed')) =
      (exception_code IS NOT NULL)
  );

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. sales_email is Party/pipeline-bound; host_job_run is keyed only by an opaque job/run identity. No raw customer, prompt, output, or error content.';
COMMENT ON TABLE business_v2.company_work_events IS
  'Append-only, optimistic-versioned host transition facts for approved email and host job-run pilots. Agent prose is never a transition source.';

COMMIT;
