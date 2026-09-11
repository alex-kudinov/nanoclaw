BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_chaos_observability_outbox)
    OR EXISTS(SELECT 1 FROM business_v2.payment_chaos_observability_receipts) THEN
    RAISE EXCEPTION 'payment observability rollback refused: retained evidence exists';
  END IF;
END $$;
DROP TABLE business_v2.payment_chaos_observability_receipts;
DROP TABLE business_v2.payment_chaos_observability_outbox;
DROP FUNCTION business_v2.fn_payment_chaos_observability_guard();
COMMIT;
