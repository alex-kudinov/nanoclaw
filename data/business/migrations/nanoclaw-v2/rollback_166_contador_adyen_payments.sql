BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.contador_adyen_payments LIMIT 1) THEN
    RAISE EXCEPTION 'rollback refused: Adyen compatibility payments exist';
  END IF;
END $$;

DROP TABLE IF EXISTS business_v2.contador_adyen_payments;

COMMIT;
