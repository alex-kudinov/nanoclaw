-- 168_contador_adyen_product_identity.sql
-- Generalize the existing WordPress-authoritative Adyen compatibility projection
-- without adding a new destination or changing ownership/grants.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'business_v2.contador_adyen_payments'::regclass
     AND conname = 'contador_adyen_payments_product_id_check';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'migration 168 refused: expected product identity constraint is missing';
  ELSIF position('product_id = ''mcq-program-a-foundations''' IN current_definition) > 0 THEN
    ALTER TABLE business_v2.contador_adyen_payments
      DROP CONSTRAINT contador_adyen_payments_product_id_check;
  ELSIF position('char_length(product_id)' IN current_definition) > 0
    AND position('^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' IN current_definition) > 0 THEN
    RETURN;
  ELSE
    RAISE EXCEPTION 'migration 168 refused: unexpected product identity constraint: %', current_definition;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'business_v2.contador_adyen_payments'::regclass
       AND conname = 'contador_adyen_payments_product_id_check'
  ) THEN
    ALTER TABLE business_v2.contador_adyen_payments
      ADD CONSTRAINT contador_adyen_payments_product_id_check
      CHECK (
        char_length(product_id) BETWEEN 1 AND 100
        AND product_id ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
      );
  END IF;
END $$;

COMMENT ON COLUMN business_v2.contador_adyen_payments.product_id IS
  'Validated Tandem Commerce checkout slug from the signed WordPress Bookkeeper envelope.';

COMMIT;
