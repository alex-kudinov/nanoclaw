-- Local authenticated-admission foundation only. No live writer cutover.
BEGIN;
CREATE TABLE business_v2.student_enrollment_authenticated_receipts (
  issuer_id text NOT NULL CHECK(length(issuer_id) BETWEEN 1 AND 100),
  receipt_id text NOT NULL CHECK(length(receipt_id) BETWEEN 1 AND 100),
  body_sha256 text NOT NULL CHECK(body_sha256 ~ '^[0-9a-f]{64}$'),
  source_key text NOT NULL CHECK(source_key ~ '^[0-9a-f]{64}$'),
  transport text NOT NULL CHECK(transport IN ('provider_event','provider_read','operator_decision')),
  purpose text NOT NULL CHECK(purpose IN ('funding','commercial','participant','assignment')),
  actor text NOT NULL CHECK(length(actor) BETWEEN 1 AND 100),
  role text NOT NULL CHECK(role IN ('source_adapter','finance_operator','enrollment_operator','owner_admin')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at > issued_at),
  PRIMARY KEY(issuer_id,receipt_id)
);
ALTER TABLE business_v2.student_enrollment_authenticated_receipts OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.student_enrollment_authenticated_receipts FROM PUBLIC;
GRANT ALL ON business_v2.student_enrollment_authenticated_receipts TO nanoclaw_admin;
CREATE TRIGGER student_enrollment_authenticated_receipts_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_authenticated_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
CREATE TABLE business_v2.student_enrollment_writer_claims (
  source_key text PRIMARY KEY CHECK (source_key ~ '^[0-9a-f]{64}$'),
  source_scope text NOT NULL CHECK (length(source_scope) BETWEEN 1 AND 100),
  source_object_type text NOT NULL CHECK (length(source_object_type) BETWEEN 1 AND 100),
  source_object_id text NOT NULL CHECK (length(source_object_id) BETWEEN 1 AND 200),
  writer text NOT NULL CHECK (writer IN ('legacy','enrollment')),
  policy_key text NOT NULL CHECK (policy_key ~ '^[a-z0-9][a-z0-9._:-]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz NOT NULL,
  claimed_by text NOT NULL CHECK (length(claimed_by) BETWEEN 1 AND 100),
  UNIQUE(source_scope,source_object_type,source_object_id)
);
ALTER TABLE business_v2.student_enrollment_writer_claims OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.student_enrollment_writer_claims FROM PUBLIC;
GRANT ALL ON business_v2.student_enrollment_writer_claims TO nanoclaw_admin;
CREATE TRIGGER student_enrollment_writer_claims_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_writer_claims
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
COMMIT;
