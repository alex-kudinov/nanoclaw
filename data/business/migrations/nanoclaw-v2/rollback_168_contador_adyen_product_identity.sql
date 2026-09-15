-- Guarded rollback for migration 168.
-- Code rollback preserves provider-neutral rows. Restoring the former literal
-- constraint is allowed only while every retained row is still the MCS product.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  current_definition text;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.contador_adyen_payments
     WHERE product_id <> 'mcq-program-a-foundations'
     LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'rollback 168 refused: provider-neutral Adyen payment rows exist; restore code only and preserve the newer constraint';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'business_v2.contador_adyen_payments'::regclass
     AND conname = 'contador_adyen_payments_product_id_check';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'rollback 168 refused: expected product identity constraint is missing';
  ELSIF position('product_id = ''mcq-program-a-foundations''' IN current_definition) > 0 THEN
    RETURN;
  ELSIF position('char_length(product_id)' IN current_definition) > 0
    AND position('^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' IN current_definition) > 0 THEN
    ALTER TABLE business_v2.contador_adyen_payments
      DROP CONSTRAINT contador_adyen_payments_product_id_check;
  ELSE
    RAISE EXCEPTION 'rollback 168 refused: unexpected product identity constraint: %', current_definition;
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
      CHECK (product_id = 'mcq-program-a-foundations');
  END IF;
END $$;

COMMENT ON COLUMN business_v2.contador_adyen_payments.product_id IS NULL;

COMMIT;
