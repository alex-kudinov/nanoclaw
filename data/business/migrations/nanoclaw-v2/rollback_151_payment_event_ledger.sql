BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_provider_references,business_v2.payment_events,business_v2.payment_event_exceptions,business_v2.payment_checkout_evidence IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_provider_references)
    OR EXISTS(SELECT 1 FROM business_v2.payment_events)
    OR EXISTS(SELECT 1 FROM business_v2.payment_event_exceptions)
    OR EXISTS(SELECT 1 FROM business_v2.payment_checkout_evidence) THEN
    RAISE EXCEPTION 'rollback151 refused: payment event evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_checkout_evidence,business_v2.payment_event_exceptions,business_v2.payment_events,business_v2.payment_provider_references;
DROP FUNCTION business_v2.fn_payment_evidence_guard();
COMMIT;
