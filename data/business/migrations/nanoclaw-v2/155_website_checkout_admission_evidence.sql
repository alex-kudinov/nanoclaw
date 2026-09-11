-- Authenticated checkout admission and immutable enrollment consumption evidence.
-- Source-only: no route/runtime/provider/projection activation.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_identity_preparations') IS NULL
    OR to_regclass('business_v2.payment_method_bindings') IS NULL
    OR to_regclass('business_v2.student_enrollment_orders') IS NULL THEN
    RAISE EXCEPTION 'migrations 142, 152 and 154 required';
  END IF;
END; $$;

CREATE TABLE business_v2.payment_checkout_admission_evidence (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  operation_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  quote_id uuid NOT NULL,
  quote_fingerprint text NOT NULL CHECK (quote_fingerprint ~ '^[a-f0-9]{64}$'),
  identity_preparation_id uuid NOT NULL,
  identity_origin_operation_id uuid NOT NULL,
  identity_receipt_reference text NOT NULL CHECK (identity_receipt_reference ~ '^identity-preparation:[A-Za-z0-9_:./-]{1,180}$'),
  payer_reference text NOT NULL CHECK (payer_reference ~ '^party-ref:[A-Za-z0-9_:./-]{1,180}$'),
  participant_reference text NOT NULL CHECK (participant_reference ~ '^party-ref:[A-Za-z0-9_:./-]{1,180}$'),
  payer_role_proof text NOT NULL CHECK (payer_role_proof ~ '^party-role-proof:[A-Za-z0-9_:./-]{1,180}$'),
  participant_role_proof text NOT NULL CHECK (participant_role_proof ~ '^party-role-proof:[A-Za-z0-9_:./-]{1,180}$'),
  purchase_relationship text NOT NULL CHECK (purchase_relationship IN ('self','other')),
  consent_bundle_receipt text NOT NULL CHECK (consent_bundle_receipt ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  terms_version text NOT NULL CHECK (terms_version ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  terms_content_sha256 text NOT NULL CHECK (terms_content_sha256 ~ '^[a-f0-9]{64}$'),
  terms_receipt_reference text NOT NULL CHECK (terms_receipt_reference ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  terms_accepted_at bigint NOT NULL CHECK (terms_accepted_at>=0),
  privacy_version text NOT NULL CHECK (privacy_version ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  privacy_content_sha256 text NOT NULL CHECK (privacy_content_sha256 ~ '^[a-f0-9]{64}$'),
  privacy_receipt_reference text NOT NULL CHECK (privacy_receipt_reference ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  privacy_accepted_at bigint NOT NULL CHECK (privacy_accepted_at>=0),
  mandate_version text CHECK (mandate_version IS NULL OR mandate_version ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  mandate_content_sha256 text CHECK (mandate_content_sha256 IS NULL OR mandate_content_sha256 ~ '^[a-f0-9]{64}$'),
  mandate_receipt_reference text CHECK (mandate_receipt_reference IS NULL OR mandate_receipt_reference ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  mandate_accepted_at bigint CHECK (mandate_accepted_at IS NULL OR mandate_accepted_at>=0),
  mandate_amount_minor bigint CHECK (mandate_amount_minor IS NULL OR mandate_amount_minor>0),
  mandate_currency text CHECK (mandate_currency IS NULL OR mandate_currency ~ '^[A-Z]{3}$'),
  mandate_frequency text CHECK (mandate_frequency IS NULL OR mandate_frequency='one_time'),
  mandate_sec_code text CHECK (mandate_sec_code IS NULL OR mandate_sec_code='WEB'),
  request_body_sha256 text NOT NULL CHECK (request_body_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_reference text NOT NULL UNIQUE CHECK (evidence_reference ~ '^checkout-admission:v1:[a-f0-9]{64}$'),
  accepted_at bigint NOT NULL CHECK (accepted_at>=0),
  PRIMARY KEY(scope_sha256,caller,operation_id),
  UNIQUE(scope_sha256,caller,attempt_id),
  FOREIGN KEY(caller,identity_preparation_id)
    REFERENCES business_v2.payment_identity_preparations(caller,preparation_id),
  CHECK (payer_role_proof<>participant_role_proof),
  CHECK (privacy_accepted_at=terms_accepted_at),
  CHECK ((purchase_relationship='self')=(payer_reference=participant_reference)),
  CHECK ((mandate_version IS NULL)=(mandate_content_sha256 IS NULL)
    AND (mandate_version IS NULL)=(mandate_receipt_reference IS NULL)
    AND (mandate_version IS NULL)=(mandate_accepted_at IS NULL)
    AND (mandate_version IS NULL)=(mandate_amount_minor IS NULL)
    AND (mandate_version IS NULL)=(mandate_currency IS NULL)
    AND (mandate_version IS NULL)=(mandate_frequency IS NULL)
    AND (mandate_version IS NULL)=(mandate_sec_code IS NULL))
);

CREATE TABLE business_v2.payment_enrollment_admissions (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  checkout_caller text NOT NULL,
  checkout_operation_id uuid NOT NULL,
  checkout_evidence_reference text NOT NULL,
  identity_receipt_reference text NOT NULL,
  payment_reference text NOT NULL CHECK (payment_reference ~ '^[A-Za-z0-9_:./-]{1,200}$'),
  payment_method text NOT NULL CHECK (payment_method IN ('card','ach_direct_debit')),
  method_operation_id uuid NOT NULL REFERENCES business_v2.payment_session_result_operations(operation_id),
  method_evidence_sha256 text NOT NULL CHECK (method_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  payment_projection_version integer NOT NULL CHECK (payment_projection_version>0),
  payment_projection_sha256 text NOT NULL CHECK (payment_projection_sha256 ~ '^[a-f0-9]{64}$'),
  publication_id text NOT NULL CHECK (publication_id='student-foundations-publication-v1'),
  publication_revision integer NOT NULL CHECK (publication_revision>0),
  publication_payload_sha256 text NOT NULL CHECK (publication_payload_sha256 ~ '^[a-f0-9]{64}$'),
  offer_key text NOT NULL CHECK (offer_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$'),
  content_locale text NOT NULL CHECK (content_locale ~ '^[a-z]{2}(-([A-Z]{2}|[0-9]{3}))?$'),
  bundle_key text NOT NULL CHECK (bundle_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$'),
  component_key text NOT NULL CHECK (component_key ~ '^[a-z0-9][a-z0-9._:-]{1,199}$'),
  order_key text NOT NULL UNIQUE,
  seat_key text NOT NULL UNIQUE,
  enrollment_key text NOT NULL UNIQUE,
  financial_evidence_sha256 text NOT NULL CHECK (financial_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  admission_evidence_sha256 text NOT NULL CHECK (admission_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_reference text NOT NULL UNIQUE CHECK (evidence_reference ~ '^enrollment-admission:v1:[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state='provisional_materialized'),
  materialized_at bigint NOT NULL CHECK (materialized_at>=0),
  PRIMARY KEY(scope_sha256,attempt_id),
  UNIQUE(scope_sha256,payment_reference),
  FOREIGN KEY(scope_sha256,checkout_caller,checkout_operation_id)
    REFERENCES business_v2.payment_checkout_admission_evidence(scope_sha256,caller,operation_id),
  FOREIGN KEY(scope_sha256,payment_reference)
    REFERENCES business_v2.payment_method_bindings(scope_sha256,payment_reference)
);

CREATE TRIGGER payment_checkout_admission_evidence_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_admission_evidence
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_enrollment_admissions_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_enrollment_admissions
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
ALTER TABLE business_v2.payment_checkout_admission_evidence OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_enrollment_admissions OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_checkout_admission_evidence,business_v2.payment_enrollment_admissions FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_checkout_admission_evidence,business_v2.payment_enrollment_admissions FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
