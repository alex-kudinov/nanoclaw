-- Default-off, privacy-minimized Adyen payment observability delivery.
-- No provider call, analytics activation, agent grant or production apply.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_attempts') IS NULL
    OR to_regclass('business_v2.payment_events') IS NULL
    OR to_regclass('business_v2.payment_enrollment_admissions') IS NULL
    OR to_regclass('business_v2.payment_session_retry_exceptions') IS NULL THEN
    RAISE EXCEPTION 'migrations 149, 151, 155 and 159 required';
  END IF;
END $$;

CREATE TABLE business_v2.payment_chaos_observability_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_event_sha256 text NOT NULL UNIQUE CHECK (source_event_sha256 ~ '^[a-f0-9]{64}$'),
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid REFERENCES business_v2.payment_attempts(attempt_id),
  source_kind text NOT NULL CHECK (source_kind IN (
    'attempt','session_receipt','terminal_nonpayment','authorization',
    'payment_exception','owned_event_exception','retry_exception',
    'enrollment_admission'
  )),
  origin_reference text NOT NULL CHECK (origin_reference ~ '^[A-Za-z0-9-]{1,200}$'),
  origin_version integer NOT NULL CHECK (origin_version>=0),
  event_name text NOT NULL CHECK (event_name IN ('checkout_started','purchase_completed')),
  action text NOT NULL CHECK (action IN (
    'attempt_accepted','session_requested','retry_requested','session_ready',
    'session_unknown','session_failed','terminal_nonpayment',
    'authorization_verified','authorization_refused','payment_needs_review',
    'purchase_admitted'
  )),
  outcome text NOT NULL CHECK (outcome IN ('started','ready','held','failed','verified')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9_]{1,80}$'),
  session_sequence integer NOT NULL CHECK (session_sequence BETWEEN 1 AND 3),
  evidence_class text NOT NULL CHECK (evidence_class IN (
    'signed_private_request','signed_private_response',
    'authenticated_session_result','hmac_webhook','durable_exception',
    'hmac_owned_exception','durable_retry_exception','canonical_enrollment'
  )),
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','in_flight','failed','accepted','suppressed','dead_lettered'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempted_at timestamptz,
  accepted_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_http_status integer CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN (
    'transport_error','timeout','http_4xx','http_5xx','invalid_response',
    'authority_unavailable'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(scope_sha256,source_kind,origin_reference,origin_version),
  CHECK ((lease_token IS NULL)=(lease_until IS NULL)),
  CHECK ((status='in_flight')=(lease_token IS NOT NULL)),
  CHECK ((status='accepted')=(accepted_at IS NOT NULL))
);

CREATE TABLE business_v2.payment_chaos_observability_receipts (
  receipt_sha256 text PRIMARY KEY CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  outbox_id bigint NOT NULL REFERENCES business_v2.payment_chaos_observability_outbox(id),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 0 AND 8),
  kind text NOT NULL CHECK (kind IN ('queued','claimed','accepted','failed','suppressed')),
  outcome_code text NOT NULL CHECK (outcome_code ~ '^[a-z0-9_]{1,80}$'),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(outbox_id,attempt_number,kind)
);

CREATE INDEX payment_chaos_observability_due_idx
  ON business_v2.payment_chaos_observability_outbox(status,next_attempt_at,occurred_at)
  WHERE status IN ('pending','in_flight','failed');

CREATE FUNCTION business_v2.fn_payment_chaos_observability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment observability deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY[
        'status','attempts','next_attempt_at','last_attempted_at','accepted_at',
        'lease_token','lease_until','last_http_status','last_error_code','version'
      ]) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY[
        'status','attempts','next_attempt_at','last_attempted_at','accepted_at',
        'lease_token','lease_until','last_http_status','last_error_code','version'
      ]) THEN
    RAISE EXCEPTION 'payment observability immutable evidence';
  END IF;
  IF NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'payment observability version fence';
  END IF;
  IF OLD.status IN ('accepted','suppressed','dead_lettered') THEN
    RAISE EXCEPTION 'payment observability terminal state';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payment_chaos_observability_guard
BEFORE UPDATE OR DELETE ON business_v2.payment_chaos_observability_outbox
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_chaos_observability_guard();
CREATE TRIGGER payment_chaos_observability_receipt_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_chaos_observability_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();

ALTER TABLE business_v2.payment_chaos_observability_outbox OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_chaos_observability_receipts OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_chaos_observability_guard() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_chaos_observability_outbox,
  business_v2.payment_chaos_observability_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_chaos_observability_guard() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON business_v2.payment_chaos_observability_outbox,business_v2.payment_chaos_observability_receipts FROM %I',
      role_name
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION business_v2.fn_payment_chaos_observability_guard() FROM %I',
      role_name
    );
  END LOOP;
END $$;
COMMIT;
