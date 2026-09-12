-- Defer checkout Party creation until authenticated payment confirmation.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_identity_preparations') IS NULL
    OR to_regclass('business_v2.payment_attempts') IS NULL
    OR to_regprocedure('business_v2.fn_payment_store_immutable()') IS NULL THEN
    RAISE EXCEPTION 'migrations 149 and 154 required';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_identity_preparations
  DROP CONSTRAINT payment_identity_preparations_check1,
  ALTER COLUMN payer_party_id DROP NOT NULL,
  ALTER COLUMN participant_party_id DROP NOT NULL,
  ALTER COLUMN payer_interaction_id DROP NOT NULL,
  ALTER COLUMN participant_interaction_id DROP NOT NULL,
  ADD CONSTRAINT payment_identity_preparations_materialization_shape CHECK (
    (payer_party_id IS NULL AND participant_party_id IS NULL
      AND payer_interaction_id IS NULL AND participant_interaction_id IS NULL)
    OR
    (payer_party_id IS NOT NULL AND participant_party_id IS NOT NULL
      AND payer_interaction_id IS NOT NULL AND participant_interaction_id IS NOT NULL
      AND ((purchase_relationship='self')=(payer_party_id=participant_party_id)))
  );

CREATE TABLE business_v2.payment_checkout_submission_payloads (
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  preparation_id uuid NOT NULL,
  payer_reference text NOT NULL UNIQUE CHECK (payer_reference ~ '^party-ref:v1:[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_payload text NOT NULL CHECK (length(encrypted_payload)>40),
  created_at bigint NOT NULL CHECK (created_at>=0),
  expires_at bigint NOT NULL CHECK (expires_at>created_at),
  PRIMARY KEY(caller,preparation_id),
  FOREIGN KEY(caller,preparation_id)
    REFERENCES business_v2.payment_identity_preparations(caller,preparation_id)
);

CREATE INDEX payment_checkout_submission_expiry_idx
  ON business_v2.payment_checkout_submission_payloads(expires_at);

CREATE TABLE business_v2.payment_identity_materializations (
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  preparation_id uuid NOT NULL,
  payer_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  participant_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  payer_interaction_id bigint NOT NULL REFERENCES business_v2.interactions(id),
  participant_interaction_id bigint NOT NULL REFERENCES business_v2.interactions(id),
  billing_profile_sha256 text CHECK (billing_profile_sha256 IS NULL OR billing_profile_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_billing_profile text,
  materialized_at bigint NOT NULL CHECK (materialized_at>=0),
  PRIMARY KEY(caller,preparation_id),
  FOREIGN KEY(caller,preparation_id)
    REFERENCES business_v2.payment_identity_preparations(caller,preparation_id),
  CHECK ((payer_party_id=participant_party_id)=(payer_interaction_id=participant_interaction_id)),
  CHECK ((billing_profile_sha256 IS NULL)=(encrypted_billing_profile IS NULL))
);

CREATE TRIGGER payment_identity_materialization_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_identity_materializations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();

ALTER TABLE business_v2.payment_checkout_submission_payloads OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_identity_materializations OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_checkout_submission_payloads,
  business_v2.payment_identity_materializations FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_checkout_submission_payloads, business_v2.payment_identity_materializations FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
