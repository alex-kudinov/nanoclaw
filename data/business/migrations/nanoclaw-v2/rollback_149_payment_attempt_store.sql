BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_attempts,business_v2.payment_operations,business_v2.payment_operation_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.payment_attempts)
    OR EXISTS (SELECT 1 FROM business_v2.payment_operations)
    OR EXISTS (SELECT 1 FROM business_v2.payment_operation_receipts) THEN
    RAISE EXCEPTION 'rollback 149 refused: payment evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_operation_receipts,business_v2.payment_operations,business_v2.payment_attempts;
DROP FUNCTION business_v2.fn_payment_operation_guard(),business_v2.fn_payment_store_immutable();
COMMIT;
