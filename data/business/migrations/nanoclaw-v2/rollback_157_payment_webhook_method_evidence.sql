-- Rollback is safe only before any webhook-derived method/enrollment evidence exists.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF EXISTS(
    SELECT 1 FROM business_v2.payment_method_bindings
    WHERE source_kind='card_scope_webhook'
  ) OR EXISTS(
    SELECT 1 FROM business_v2.payment_enrollment_admissions
    WHERE method_source_kind='card_scope_webhook'
  ) THEN
    RAISE EXCEPTION 'rollback refused: webhook-derived method evidence exists';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_enrollment_admissions
  DROP CONSTRAINT payment_enrollment_method_exact_source_check,
  DROP CONSTRAINT payment_enrollment_method_event_fk,
  ALTER COLUMN method_operation_id SET NOT NULL,
  DROP COLUMN method_event_id,
  DROP COLUMN method_source_kind;

ALTER TABLE business_v2.payment_method_bindings
  DROP CONSTRAINT payment_method_binding_exact_source_check,
  DROP CONSTRAINT payment_method_binding_source_event_fk,
  ALTER COLUMN operation_id SET NOT NULL,
  DROP COLUMN source_event_id,
  DROP COLUMN source_kind;

COMMIT;
