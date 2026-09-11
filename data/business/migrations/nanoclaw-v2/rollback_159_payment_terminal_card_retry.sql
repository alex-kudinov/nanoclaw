-- Refuse rollback after any retry/terminal evidence exists.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_operations WHERE session_sequence>1)
    OR EXISTS(SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts)
    OR EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions)
    OR EXISTS(SELECT 1 FROM business_v2.payment_session_result_operations
      WHERE state='terminal_nonpayment') THEN
    RAISE EXCEPTION 'rollback refused: terminal retry evidence exists';
  END IF;
END $$;

DROP TRIGGER payment_session_retry_exception_immutable
  ON business_v2.payment_session_retry_exceptions;
DROP TRIGGER payment_session_terminal_receipt_immutable
  ON business_v2.payment_session_terminal_nonpayment_receipts;
DROP FUNCTION business_v2.fn_payment_session_retry_immutable();
DROP TABLE business_v2.payment_session_retry_exceptions;

ALTER TABLE business_v2.payment_events
  DROP CONSTRAINT payment_event_operation_source_fk,
  DROP COLUMN session_sequence,
  DROP COLUMN payment_operation_id;
ALTER TABLE business_v2.payment_provider_references
  DROP CONSTRAINT payment_provider_reference_operation_fk,
  DROP COLUMN session_sequence,
  DROP COLUMN payment_operation_id;

CREATE OR REPLACE FUNCTION business_v2.fn_payment_session_result_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment session result deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','version','lease_token','lease_until']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','version','lease_token','lease_until']) THEN
    RAISE EXCEPTION 'payment session result immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment session result version fence'; END IF;
  IF OLD.state IN ('verified','conflict') THEN RAISE EXCEPTION 'payment session result terminal state'; END IF;
  RETURN NEW;
END $$;

ALTER TABLE business_v2.payment_session_result_receipts
  DROP CONSTRAINT payment_session_result_receipts_kind_check,
  ADD CONSTRAINT payment_session_result_receipts_kind_check
    CHECK (kind IN ('prepared','claimed','unknown','verified','conflict'));

ALTER TABLE business_v2.payment_session_result_operations
  DROP CONSTRAINT payment_session_result_terminal_lease_check,
  DROP CONSTRAINT payment_session_result_terminal_status_check,
  DROP CONSTRAINT payment_session_result_state_check,
  DROP CONSTRAINT payment_session_result_operation_result_uniq,
  DROP CONSTRAINT payment_session_result_payment_operation_fk,
  DROP COLUMN terminal_status,
  DROP COLUMN session_sequence,
  DROP COLUMN payment_operation_id,
  ADD CONSTRAINT payment_session_result_operations_state_check
    CHECK (state IN ('prepared','unknown','verified','conflict')),
  ADD CONSTRAINT payment_session_result_operations_attempt_id_key UNIQUE(attempt_id);

ALTER TABLE business_v2.payment_operations
  DROP CONSTRAINT payment_operations_retry_lineage_check,
  DROP CONSTRAINT payment_operations_retry_terminal_uniq,
  DROP COLUMN retry_terminal_receipt_sha256;
DROP TABLE business_v2.payment_session_terminal_nonpayment_receipts;
ALTER TABLE business_v2.payment_operations
  DROP CONSTRAINT payment_operations_predecessor_uniq,
  DROP CONSTRAINT payment_operations_identity_sequence_uniq,
  DROP CONSTRAINT payment_operations_attempt_sequence_uniq,
  DROP COLUMN predecessor_operation_id,
  DROP COLUMN session_sequence,
  ADD CONSTRAINT payment_operations_attempt_id_key UNIQUE(attempt_id);

COMMIT;
