BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_request_nonces,business_v2.payment_status_capabilities,business_v2.payment_status_revocations IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_request_nonces)
    OR EXISTS(SELECT 1 FROM business_v2.payment_status_capabilities)
    OR EXISTS(SELECT 1 FROM business_v2.payment_status_revocations) THEN
    RAISE EXCEPTION 'rollback 150 refused: payment admission evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_status_revocations,business_v2.payment_status_capabilities,business_v2.payment_request_nonces;
COMMIT;
