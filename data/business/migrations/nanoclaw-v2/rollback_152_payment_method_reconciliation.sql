BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_session_result_operations,business_v2.payment_session_result_receipts,business_v2.payment_method_bindings,business_v2.payment_event_operations,business_v2.payment_event_operation_parents,business_v2.payment_owned_event_exceptions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_session_result_operations)
    OR EXISTS(SELECT 1 FROM business_v2.payment_session_result_receipts)
    OR EXISTS(SELECT 1 FROM business_v2.payment_method_bindings)
    OR EXISTS(SELECT 1 FROM business_v2.payment_event_operations)
    OR EXISTS(SELECT 1 FROM business_v2.payment_event_operation_parents)
    OR EXISTS(SELECT 1 FROM business_v2.payment_owned_event_exceptions) THEN
    RAISE EXCEPTION 'rollback152 refused: payment reconciliation evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_owned_event_exceptions,business_v2.payment_event_operations,business_v2.payment_event_operation_parents,business_v2.payment_method_bindings,business_v2.payment_session_result_receipts,business_v2.payment_session_result_operations;
DROP FUNCTION business_v2.fn_payment_session_result_guard();
COMMIT;
