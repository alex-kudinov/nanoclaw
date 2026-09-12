BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.payment_identity_preparations
    WHERE billing_profile_sha256 IS NOT NULL OR encrypted_billing_profile IS NOT NULL
  ) THEN RAISE EXCEPTION 'populated payment billing profile rollback refused';
  END IF;
END; $$;
ALTER TABLE business_v2.payment_identity_preparations
  DROP CONSTRAINT payment_identity_billing_profile_pair,
  DROP COLUMN encrypted_billing_profile,
  DROP COLUMN billing_profile_sha256;
COMMIT;
