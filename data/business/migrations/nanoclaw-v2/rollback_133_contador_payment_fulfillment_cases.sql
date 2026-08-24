-- Guarded rollback for migration 133. Runtime admission must be disabled first.
-- Recorded payment/refund fulfillment history is never erased by rollback.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM business_v2.contador_payment_fulfillment_cases LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.contador_payment_fulfillment_aliases LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.contador_payment_fulfillment_receipts LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'rollback 133 refused: Contador payment fulfillment history exists; leave the additive tables in place or perform a separately reviewed archival migration';
  END IF;
END $$;

DROP TABLE business_v2.contador_payment_fulfillment_receipts;
DROP TABLE business_v2.contador_payment_fulfillment_aliases;
DROP TABLE business_v2.contador_payment_fulfillment_cases;

COMMIT;
