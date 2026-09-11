BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_enrollment_admissions,business_v2.payment_checkout_admission_evidence IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_checkout_admission_evidence)
    OR EXISTS(SELECT 1 FROM business_v2.payment_enrollment_admissions) THEN
    RAISE EXCEPTION 'rollback155 refused: checkout admission evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_enrollment_admissions,business_v2.payment_checkout_admission_evidence;
COMMIT;
