-- Typed website checkout and provisional provider acceptance. Source-only.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.student_enrollment_orders') IS NULL THEN RAISE EXCEPTION 'migration142 required'; END IF;
END; $$;
ALTER TABLE business_v2.student_enrollment_orders
  DROP CONSTRAINT student_enrollment_orders_source_channel_check,
  DROP CONSTRAINT student_enrollment_orders_financial_classification_check;
ALTER TABLE business_v2.student_enrollment_orders
  ADD CONSTRAINT student_enrollment_orders_source_channel_check CHECK (source_channel IN (
    'website_checkout','website_stripe_checkout','manual_stripe_payment',
    'plutio_invoice_or_contract','check_ach_or_wire','sponsored_cohort',
    'scholarship','complimentary_owner_grant','migration_or_correction'
  )),
  ADD CONSTRAINT student_enrollment_orders_financial_classification_check CHECK (financial_classification IN (
    'not_applicable','unverified','settled','active_terms','held','provider_accepted_provisional'
  ));
ALTER TABLE business_v2.student_financial_obligations
  DROP CONSTRAINT student_financial_obligations_state_check;
ALTER TABLE business_v2.student_financial_obligations
  ADD CONSTRAINT student_financial_obligations_state_check CHECK (state IN (
    'not_due','due','accepted_pending_receipt','paid','waived','cancelled','refunded','disputed'
  ));
COMMIT;
