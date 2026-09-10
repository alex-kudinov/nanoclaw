-- Durable provider-neutral pre-quote identity preparation. Source-only.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_request_nonces') IS NULL
    OR to_regclass('business_v2.parties') IS NULL
    OR to_regclass('business_v2.interactions') IS NULL
    OR to_regclass('business_v2.party_external_refs') IS NULL
    OR to_regprocedure('business_v2.fn_payment_store_immutable()') IS NULL THEN
    RAISE EXCEPTION 'migrations 3, 8, 137, 149 and 150 required';
  END IF;
END; $$;

CREATE TABLE business_v2.payment_identity_preparations (
  preparation_id uuid NOT NULL,
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  origin_operation_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  offer_key text NOT NULL CHECK (offer_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  purchase_relationship text NOT NULL CHECK (purchase_relationship IN ('self','other')),
  identity_request_sha256 text NOT NULL CHECK (identity_request_sha256 ~ '^[a-f0-9]{64}$'),
  source jsonb NOT NULL CHECK (jsonb_typeof(source)='object'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  payer_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  participant_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  payer_interaction_id bigint NOT NULL REFERENCES business_v2.interactions(id),
  participant_interaction_id bigint NOT NULL REFERENCES business_v2.interactions(id),
  payer_reference text NOT NULL CHECK (payer_reference ~ '^party-ref:v1:[a-f0-9]{64}$'),
  participant_reference text NOT NULL CHECK (participant_reference ~ '^party-ref:v1:[a-f0-9]{64}$'),
  payer_role_proof text NOT NULL CHECK (payer_role_proof ~ '^party-role-proof:v1:[a-f0-9]{64}$'),
  participant_role_proof text NOT NULL CHECK (participant_role_proof ~ '^party-role-proof:v1:[a-f0-9]{64}$'),
  payer_existing_stripe_customer_id text CHECK (payer_existing_stripe_customer_id IS NULL OR payer_existing_stripe_customer_id ~ '^cus_[A-Za-z0-9_]{10,200}$'),
  participant_existing_stripe_customer_id text CHECK (participant_existing_stripe_customer_id IS NULL OR participant_existing_stripe_customer_id ~ '^cus_[A-Za-z0-9_]{10,200}$'),
  receipt_reference text NOT NULL UNIQUE CHECK (receipt_reference ~ '^identity-preparation:v1:[a-f0-9]{64}$'),
  resolved_at bigint NOT NULL CHECK (resolved_at>=0),
  PRIMARY KEY(caller,preparation_id),
  UNIQUE(caller,origin_operation_id),
  UNIQUE(caller,intent_id),
  UNIQUE(payer_role_proof),
  UNIQUE(participant_role_proof),
  CHECK (payer_role_proof<>participant_role_proof),
  CHECK ((purchase_relationship='self')=(payer_party_id=participant_party_id)),
  CHECK ((purchase_relationship='self')=(payer_reference=participant_reference))
);

CREATE TRIGGER payment_identity_preparation_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_identity_preparations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
ALTER TABLE business_v2.payment_identity_preparations OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_identity_preparations FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_identity_preparations FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
