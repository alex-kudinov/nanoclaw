-- NC-20260909-003. Host-admin customer notice jobs, ordered after card method
-- evidence migration 157. Source capacity only: no sender, schedule or activation.
BEGIN;
SET LOCAL search_path TO pg_catalog;

CREATE TABLE business_v2.website_checkout_customer_notice_jobs (
  id bigserial PRIMARY KEY,
  notice_key text NOT NULL UNIQUE CHECK (notice_key ~ '^website_checkout_notice:[0-9a-f-]{36}:(self_confirmation|gift_payer_receipt|gift_learner_access):v1$'),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 500),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  notice_kind text NOT NULL CHECK (notice_kind IN ('self_confirmation','gift_payer_receipt','gift_learner_access')),
  recipient_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  recipient_email_sha256 text NOT NULL CHECK (recipient_email_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  sender_account text NOT NULL CHECK (char_length(sender_account) BETWEEN 3 AND 254),
  sender_address text NOT NULL CHECK (char_length(sender_address) BETWEEN 3 AND 254),
  message_identity text NOT NULL UNIQUE CHECK (message_identity ~ '^mcs-foundations:[0-9a-f-]{36}:(self|payer|learner):v1$'),
  state text NOT NULL CHECK (state IN ('queued','claimed','acknowledged','confirmed','held')),
  uncertain_acceptance boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  lease_token uuid,
  lease_expires_at timestamptz,
  gmail_message_id text CHECK (gmail_message_id IS NULL OR char_length(gmail_message_id) BETWEEN 1 AND 500),
  gmail_thread_id text CHECK (gmail_thread_id IS NULL OR char_length(gmail_thread_id) BETWEEN 1 AND 500),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (attempt_id,notice_kind),
  CHECK ((state='claimed')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((gmail_message_id IS NULL)=(gmail_thread_id IS NULL)),
  CHECK (state<>'confirmed' OR gmail_message_id IS NOT NULL),
  CHECK (NOT uncertain_acceptance OR state='held'),
  CHECK (created_at <= updated_at)
);
CREATE INDEX website_checkout_notice_work_idx
  ON business_v2.website_checkout_customer_notice_jobs(state,updated_at,id)
  WHERE state IN ('queued','acknowledged','held');

CREATE TABLE business_v2.website_checkout_customer_notice_receipts (
  notice_id bigint NOT NULL REFERENCES business_v2.website_checkout_customer_notice_jobs(id),
  version integer NOT NULL CHECK (version >= 0),
  stage text NOT NULL CHECK (stage IN ('queued','claimed','sent_acknowledged','readback','held')),
  outcome text NOT NULL CHECK (outcome IN ('pending','verified','held')),
  result_code text NOT NULL CHECK (result_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(notice_id,version)
);

CREATE FUNCTION business_v2.fn_website_checkout_notice_job_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'website checkout notice deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at']) THEN
    RAISE EXCEPTION 'website checkout notice immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'website checkout notice version fence'; END IF;
  IF OLD.state='confirmed' THEN RAISE EXCEPTION 'website checkout notice terminal state'; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION business_v2.fn_website_checkout_notice_receipt_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'website checkout notice receipt immutable'; END;
$$;
CREATE TRIGGER website_checkout_notice_job_guard BEFORE UPDATE OR DELETE
  ON business_v2.website_checkout_customer_notice_jobs FOR EACH ROW
  EXECUTE FUNCTION business_v2.fn_website_checkout_notice_job_guard();
CREATE TRIGGER website_checkout_notice_receipt_immutable BEFORE UPDATE OR DELETE
  ON business_v2.website_checkout_customer_notice_receipts FOR EACH ROW
  EXECUTE FUNCTION business_v2.fn_website_checkout_notice_receipt_immutable();

ALTER TABLE business_v2.website_checkout_customer_notice_jobs OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.website_checkout_customer_notice_receipts OWNER TO nanoclaw_admin;
ALTER SEQUENCE business_v2.website_checkout_customer_notice_jobs_id_seq OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_website_checkout_notice_job_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_website_checkout_notice_receipt_immutable() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.website_checkout_customer_notice_jobs,
  business_v2.website_checkout_customer_notice_receipts FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.website_checkout_customer_notice_jobs_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_website_checkout_notice_job_guard(),
  business_v2.fn_website_checkout_notice_receipt_immutable() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.website_checkout_customer_notice_jobs,business_v2.website_checkout_customer_notice_receipts FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.website_checkout_customer_notice_jobs_id_seq FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_website_checkout_notice_job_guard(),business_v2.fn_website_checkout_notice_receipt_immutable() FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
