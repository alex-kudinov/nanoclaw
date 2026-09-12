-- NC-20260909-003. Immutable checkout receipt/invoice snapshots, deterministic
-- PDF bytes, attempt-bound download capabilities, and deduplicated email jobs.
-- Paid-invoice issuance remains a runtime finance/legal configuration gate.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_attempts') IS NULL OR
     to_regclass('business_v2.payment_identity_preparations') IS NULL OR
     to_regclass('business_v2.payment_enrollment_admissions') IS NULL THEN
    RAISE EXCEPTION 'migrations 149, 154 and 155 required';
  END IF;
END; $$;

CREATE TABLE business_v2.payment_checkout_document_sequences (
  series_key text PRIMARY KEY CHECK (series_key ~ '^TCA-[0-9]{4}$'),
  next_value bigint NOT NULL CHECK (next_value BETWEEN 1 AND 999999999),
  updated_at timestamptz NOT NULL
);

CREATE TABLE business_v2.payment_checkout_documents (
  document_id uuid PRIMARY KEY,
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  caller text NOT NULL CHECK (caller ~ '^[A-Za-z0-9_-]{1,64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  document_kind text NOT NULL CHECK (document_kind IN ('receipt','paid_invoice')),
  document_version text NOT NULL CHECK (document_version='mcs-checkout-document-v1'),
  document_number text NOT NULL CHECK (
    document_number ~ '^(TCA-[A-F0-9]{12}-R|TCA-[0-9]{4}-[0-9]{6})$'
  ),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_snapshot text NOT NULL CHECK (octet_length(encrypted_snapshot)<=65536),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_pdf text NOT NULL CHECK (octet_length(encrypted_pdf) BETWEEN 256 AND 1000000),
  issued_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(attempt_id,document_kind),
  UNIQUE(document_number)
);

CREATE TABLE business_v2.payment_checkout_document_capabilities (
  capability_id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES business_v2.payment_checkout_documents(document_id),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  document_kind text NOT NULL CHECK (document_kind IN ('receipt','paid_invoice')),
  capability_sha256 text NOT NULL UNIQUE CHECK (capability_sha256 ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '15 minutes')
);
CREATE INDEX payment_checkout_document_capability_expiry
  ON business_v2.payment_checkout_document_capabilities(expires_at);

CREATE TABLE business_v2.payment_checkout_document_email_jobs (
  job_id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES business_v2.payment_checkout_documents(document_id),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  document_kind text NOT NULL CHECK (document_kind IN ('receipt','paid_invoice')),
  recipient_email_sha256 text NOT NULL CHECK (recipient_email_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_recipient_email text NOT NULL CHECK (octet_length(encrypted_recipient_email)<=4096),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('queued','claimed','acknowledged','confirmed','held')),
  uncertain_acceptance boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  lease_token uuid,
  lease_expires_at timestamptz,
  gmail_message_id text CHECK (gmail_message_id IS NULL OR char_length(gmail_message_id) BETWEEN 1 AND 500),
  gmail_thread_id text CHECK (gmail_thread_id IS NULL OR char_length(gmail_thread_id) BETWEEN 1 AND 500),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(document_id,recipient_email_sha256),
  CHECK ((state='claimed')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((gmail_message_id IS NULL)=(gmail_thread_id IS NULL)),
  CHECK (state<>'confirmed' OR gmail_message_id IS NOT NULL),
  CHECK (NOT uncertain_acceptance OR state='held'),
  CHECK (created_at<=updated_at)
);
CREATE INDEX payment_checkout_document_email_work
  ON business_v2.payment_checkout_document_email_jobs(state,updated_at)
  WHERE state IN ('queued','acknowledged','held');

CREATE TABLE business_v2.payment_checkout_document_email_receipts (
  job_id uuid NOT NULL REFERENCES business_v2.payment_checkout_document_email_jobs(job_id),
  version integer NOT NULL CHECK (version>=0),
  stage text NOT NULL CHECK (stage IN ('queued','claimed','sent_acknowledged','readback','held')),
  outcome text NOT NULL CHECK (outcome IN ('pending','verified','held')),
  result_code text NOT NULL CHECK (result_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,version)
);

CREATE FUNCTION business_v2.fn_payment_checkout_document_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'payment checkout document immutable'; END;
$$;

CREATE FUNCTION business_v2.fn_payment_checkout_document_email_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment checkout document email deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at']) THEN
    RAISE EXCEPTION 'payment checkout document email immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment checkout document email version fence'; END IF;
  IF OLD.state='confirmed' THEN RAISE EXCEPTION 'payment checkout document email terminal state'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_checkout_documents_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_documents
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();
CREATE TRIGGER payment_checkout_document_capabilities_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_capabilities
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();
CREATE TRIGGER payment_checkout_document_email_guard
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_email_jobs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_email_guard();
CREATE TRIGGER payment_checkout_document_email_receipts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_email_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();

ALTER TABLE business_v2.payment_checkout_document_sequences OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_documents OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_document_capabilities OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_document_email_jobs OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_document_email_receipts OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_immutable() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_checkout_document_email_guard() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_checkout_document_sequences,
  business_v2.payment_checkout_documents,
  business_v2.payment_checkout_document_capabilities,
  business_v2.payment_checkout_document_email_jobs,
  business_v2.payment_checkout_document_email_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_checkout_document_immutable(),
  business_v2.fn_payment_checkout_document_email_guard() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_checkout_document_sequences,business_v2.payment_checkout_documents,business_v2.payment_checkout_document_capabilities,business_v2.payment_checkout_document_email_jobs,business_v2.payment_checkout_document_email_receipts FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_payment_checkout_document_immutable(),business_v2.fn_payment_checkout_document_email_guard() FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
