BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_checkout_attribution_admissions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(
    SELECT 1 FROM business_v2.payment_checkout_attribution_admissions
  ) THEN
    RAISE EXCEPTION 'rollback156 refused: checkout attribution admission exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_checkout_attribution_admissions;
COMMIT;
