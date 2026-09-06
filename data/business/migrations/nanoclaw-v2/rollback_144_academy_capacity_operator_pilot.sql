-- rollback_144_academy_capacity_operator_pilot.sql

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF to_regclass('business_v2.academy_capacity_operator_cases') IS NOT NULL
     AND EXISTS (SELECT 1 FROM business_v2.academy_capacity_operator_cases)
  THEN
    RAISE EXCEPTION 'refusing to drop populated Academy Capacity operator cases';
  END IF;
  IF to_regclass('business_v2.academy_capacity_operator_receipts') IS NOT NULL
     AND EXISTS (SELECT 1 FROM business_v2.academy_capacity_operator_receipts)
  THEN
    RAISE EXCEPTION 'refusing to drop populated Academy Capacity operator receipts';
  END IF;
END $$;

DROP VIEW IF EXISTS business_v2.v_academy_capacity_operator_cases;
DROP TRIGGER IF EXISTS academy_capacity_operator_receipts_append_only
  ON business_v2.academy_capacity_operator_receipts;
DROP TABLE IF EXISTS business_v2.academy_capacity_operator_receipts;
DROP TABLE IF EXISTS business_v2.academy_capacity_operator_cases;

COMMIT;
