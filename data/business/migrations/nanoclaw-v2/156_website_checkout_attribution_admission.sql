-- Private immutable WordPress attribution handoff for TEST checkout admission.
-- Local-only tentative NC-20260909-003 source; no production apply or runtime activation.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_checkout_admission_evidence') IS NULL
    OR to_regclass('business_v2.payment_status_capabilities') IS NULL THEN
    RAISE EXCEPTION 'migrations 150 and 155 required';
  END IF;
END; $$;

CREATE TABLE business_v2.payment_checkout_attribution_admissions (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  operation_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  checkout_evidence_reference text NOT NULL,
  snapshot_id uuid NOT NULL,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  binding_reference text NOT NULL CHECK (
    binding_reference ~ '^attribution-binding:v1:[0-9a-f-]{36}$'
  ),
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
  intent_id uuid NOT NULL,
  attempt_operation_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  quote_fingerprint text NOT NULL CHECK (quote_fingerprint ~ '^[a-f0-9]{64}$'),
  encrypted_snapshot text NOT NULL CHECK (octet_length(encrypted_snapshot)<=90000),
  encrypted_binding text NOT NULL CHECK (octet_length(encrypted_binding)<=90000),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_reference text NOT NULL UNIQUE CHECK (
    evidence_reference ~ '^checkout-attribution:v1:[a-f0-9]{64}$'
  ),
  accepted_at bigint NOT NULL CHECK (accepted_at>=0),
  PRIMARY KEY(scope_sha256,caller,operation_id),
  UNIQUE(scope_sha256,caller,attempt_id),
  UNIQUE(scope_sha256,caller,snapshot_id),
  UNIQUE(scope_sha256,caller,binding_reference),
  FOREIGN KEY(scope_sha256,caller,operation_id)
    REFERENCES business_v2.payment_checkout_admission_evidence(scope_sha256,caller,operation_id),
  FOREIGN KEY(checkout_evidence_reference)
    REFERENCES business_v2.payment_checkout_admission_evidence(evidence_reference),
  FOREIGN KEY(caller,attempt_operation_id)
    REFERENCES business_v2.payment_status_capabilities(caller,operation_id)
);

CREATE TRIGGER payment_checkout_attribution_admission_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_attribution_admissions
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();

ALTER TABLE business_v2.payment_checkout_attribution_admissions OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_checkout_attribution_admissions FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON business_v2.payment_checkout_attribution_admissions FROM %I',
      role_name
    );
  END LOOP;
END; $$;
COMMIT;
