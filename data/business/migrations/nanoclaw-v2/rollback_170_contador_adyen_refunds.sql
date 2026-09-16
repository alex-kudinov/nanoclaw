BEGIN;

DO $$
BEGIN
  IF to_regclass('business_v2.contador_adyen_refunds') IS NOT NULL
     AND EXISTS (SELECT 1 FROM business_v2.contador_adyen_refunds LIMIT 1) THEN
    RAISE EXCEPTION 'rollback 170 refused: retained Adyen refund evidence exists';
  END IF;
END
$$;

DROP TABLE IF EXISTS business_v2.contador_adyen_refunds;

COMMIT;
