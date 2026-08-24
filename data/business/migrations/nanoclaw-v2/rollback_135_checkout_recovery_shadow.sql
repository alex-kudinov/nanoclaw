BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM business_v2.checkout_recovery_cases LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.checkout_recovery_aliases LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.checkout_recovery_events LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.checkout_recovery_receipts LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'rollback 135 refused: checkout recovery history exists; disable admission and use a separately reviewed archival migration';
  END IF;
END $$;

DROP TRIGGER IF EXISTS checkout_recovery_receipts_append_only
  ON business_v2.checkout_recovery_receipts;
DROP TRIGGER IF EXISTS checkout_recovery_events_no_delete
  ON business_v2.checkout_recovery_events;
DROP TRIGGER IF EXISTS checkout_recovery_events_core_immutable
  ON business_v2.checkout_recovery_events;
DROP FUNCTION IF EXISTS business_v2.fn_checkout_recovery_append_only();
DROP FUNCTION IF EXISTS business_v2.fn_checkout_recovery_event_immutable();
DROP TABLE IF EXISTS business_v2.checkout_recovery_receipts;
DROP TABLE IF EXISTS business_v2.checkout_recovery_events;
DROP TABLE IF EXISTS business_v2.checkout_recovery_aliases;
DROP TABLE IF EXISTS business_v2.checkout_recovery_cases;

COMMIT;
