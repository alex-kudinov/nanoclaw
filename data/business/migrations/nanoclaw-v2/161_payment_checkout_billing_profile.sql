-- Encrypted optional business invoice profile bound to immutable identity input.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_identity_preparations') IS NULL THEN
    RAISE EXCEPTION 'migration154 required';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_identity_preparations
  ADD COLUMN billing_profile_sha256 text
    CHECK (billing_profile_sha256 IS NULL OR billing_profile_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN encrypted_billing_profile text
    CHECK (encrypted_billing_profile IS NULL OR octet_length(encrypted_billing_profile)<=16384),
  ADD CONSTRAINT payment_identity_billing_profile_pair
    CHECK ((billing_profile_sha256 IS NULL)=(encrypted_billing_profile IS NULL));

COMMIT;
