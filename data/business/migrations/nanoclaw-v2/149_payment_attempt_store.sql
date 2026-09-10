-- NC-20260909-003. Host-only payment attempts; independent of enrollment 146-148.
-- No provider call, public/agent grant, financial action or enrollment effect.
BEGIN;
SET LOCAL search_path TO pg_catalog;

CREATE TABLE business_v2.payment_attempts (
  attempt_id uuid PRIMARY KEY,
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  quote_id uuid NOT NULL,
  contract jsonb NOT NULL CHECK (jsonb_typeof(contract)='object' AND pg_column_size(contract)<=16384),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (scope_sha256, quote_id)
);
CREATE TABLE business_v2.payment_operations (
  operation_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE REFERENCES business_v2.payment_attempts(attempt_id),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  contract jsonb NOT NULL CHECK (jsonb_typeof(contract)='object' AND pg_column_size(contract)<=4096),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_request text NOT NULL CHECK (octet_length(encrypted_request)<=90000),
  encrypted_response text CHECK (octet_length(encrypted_response)<=90000),
  state text NOT NULL CHECK (state IN ('dispatching','unknown','session_available','permanent_failure')),
  session_expires_at bigint,
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  lease_token uuid,
  lease_until bigint,
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (lease_until IS NULL OR lease_until>=0),
  CHECK ((state='session_available') = (session_expires_at IS NOT NULL)),
  CHECK ((state='session_available') = (encrypted_response IS NOT NULL)),
  CHECK (session_expires_at IS NULL OR session_expires_at>=0),
  CHECK (state NOT IN ('session_available','permanent_failure') OR lease_token IS NULL)
);
CREATE TABLE business_v2.payment_operation_receipts (
  operation_id uuid NOT NULL REFERENCES business_v2.payment_operations(operation_id),
  version integer NOT NULL CHECK (version>=0),
  kind text NOT NULL CHECK (kind IN ('prepared','claimed','unknown','session_available','permanent_failure')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (operation_id, version)
);

CREATE FUNCTION business_v2.fn_payment_store_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'payment store immutable evidence';
END;
$$;
CREATE FUNCTION business_v2.fn_payment_operation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment operation deletion refused'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state','session_expires_at','encrypted_response','version','lease_token','lease_until'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['state','session_expires_at','encrypted_response','version','lease_token','lease_until']) THEN
    RAISE EXCEPTION 'payment operation immutable contract';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'payment operation version fence'; END IF;
  IF OLD.state IN ('session_available','permanent_failure') THEN
    RAISE EXCEPTION 'payment operation terminal state';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_attempt_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_attempts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_receipt_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_operation_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_operation_guard BEFORE UPDATE OR DELETE ON business_v2.payment_operations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_operation_guard();

ALTER TABLE business_v2.payment_attempts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_operations OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_operation_receipts OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_store_immutable() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_operation_guard() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_attempts,business_v2.payment_operations,business_v2.payment_operation_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_store_immutable(),business_v2.fn_payment_operation_guard() FROM PUBLIC;
-- Do not inherit pre-existing default grants to agent roles.
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_attempts,business_v2.payment_operations,business_v2.payment_operation_receipts FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_payment_store_immutable(),business_v2.fn_payment_operation_guard() FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
