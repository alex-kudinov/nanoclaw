-- 172_custom_invoice_billing_cadence.sql
-- Admit the custom cadence already authenticated by the signed Commerce
-- contract. No row, column, index, owner, grant, or worker changes.

BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'business_v2.finite_billing_contracts'::regclass
     AND conname = 'finite_billing_contracts_cadence_check';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'migration 172 refused: expected cadence constraint is missing';
  ELSIF position('custom' IN current_definition) > 0 THEN
    RETURN;
  ELSIF position('monthly' IN current_definition) > 0
    AND position('quarterly' IN current_definition) > 0
    AND position('annual' IN current_definition) > 0 THEN
    ALTER TABLE business_v2.finite_billing_contracts
      DROP CONSTRAINT finite_billing_contracts_cadence_check;
  ELSE
    RAISE EXCEPTION 'migration 172 refused: unexpected cadence constraint: %', current_definition;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'business_v2.finite_billing_contracts'::regclass
       AND conname = 'finite_billing_contracts_cadence_check'
  ) THEN
    ALTER TABLE business_v2.finite_billing_contracts
      ADD CONSTRAINT finite_billing_contracts_cadence_check
      CHECK (cadence IN ('monthly','quarterly','annual','custom'));
  END IF;
END $$;

COMMIT;
