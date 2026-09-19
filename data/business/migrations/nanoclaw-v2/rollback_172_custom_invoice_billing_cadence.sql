-- Guarded rollback for migration 172. Runtime rollback preserves custom
-- contracts. Restoring the old CHECK is allowed only before any custom row.

BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$
DECLARE
  current_definition text;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.finite_billing_contracts
     WHERE cadence = 'custom'
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'rollback 172 refused: custom invoice billing contracts exist; restore code only and preserve the wider cadence constraint';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'business_v2.finite_billing_contracts'::regclass
     AND conname = 'finite_billing_contracts_cadence_check';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'rollback 172 refused: expected cadence constraint is missing';
  ELSIF position('custom' IN current_definition) > 0 THEN
    ALTER TABLE business_v2.finite_billing_contracts
      DROP CONSTRAINT finite_billing_contracts_cadence_check;
  ELSIF position('monthly' IN current_definition) > 0
    AND position('quarterly' IN current_definition) > 0
    AND position('annual' IN current_definition) > 0 THEN
    RETURN;
  ELSE
    RAISE EXCEPTION 'rollback 172 refused: unexpected cadence constraint: %', current_definition;
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
      CHECK (cadence IN ('monthly','quarterly','annual'));
  END IF;
END $$;

COMMIT;
