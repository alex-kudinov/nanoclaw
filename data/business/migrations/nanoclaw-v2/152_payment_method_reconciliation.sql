-- Durable TEST Session-result reconciliation, method binding and child-event lineage.
-- Source only: no provider call, settlement, fulfillment or certificate action.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_events') IS NULL THEN RAISE EXCEPTION 'migration151 required'; END IF;
END; $$;

CREATE TABLE business_v2.payment_session_result_operations (
  operation_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE REFERENCES business_v2.payment_attempts(attempt_id),
  session_id_sha256 text NOT NULL CHECK (session_id_sha256 ~ '^[a-f0-9]{64}$'),
  result_sha256 text NOT NULL CHECK (result_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_result text NOT NULL CHECK (octet_length(encrypted_result)<=90000),
  retry_until bigint NOT NULL CHECK (retry_until>=0),
  state text NOT NULL CHECK (state IN ('prepared','unknown','verified','conflict')),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  lease_token uuid,
  lease_until bigint,
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (lease_until IS NULL OR lease_until>=0),
  CHECK (state NOT IN ('verified','conflict') OR lease_token IS NULL)
);
CREATE TABLE business_v2.payment_session_result_receipts (
  operation_id uuid NOT NULL REFERENCES business_v2.payment_session_result_operations(operation_id),
  version integer NOT NULL CHECK (version>=0),
  kind text NOT NULL CHECK (kind IN ('prepared','claimed','unknown','verified','conflict')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(operation_id,version)
);
CREATE TABLE business_v2.payment_method_bindings (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  payment_reference text NOT NULL CHECK (payment_reference ~ '^[A-Za-z0-9_:.\/\-]{1,200}$'),
  attempt_id uuid NOT NULL UNIQUE REFERENCES business_v2.payment_attempts(attempt_id),
  method text NOT NULL CHECK (method IN ('card','ach_direct_debit')),
  operation_id uuid NOT NULL UNIQUE REFERENCES business_v2.payment_session_result_operations(operation_id),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_sha256,payment_reference)
);
CREATE TABLE business_v2.payment_event_operation_parents (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  operation_reference text NOT NULL CHECK (operation_reference ~ '^[A-Za-z0-9_:.\/\-]{1,200}$'),
  payment_reference text NOT NULL,
  attempt_id uuid NOT NULL,
  PRIMARY KEY(scope_sha256,operation_reference),
  FOREIGN KEY(scope_sha256,payment_reference,attempt_id)
    REFERENCES business_v2.payment_provider_references(scope_sha256,payment_reference,attempt_id)
);
CREATE TABLE business_v2.payment_event_operations (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  operation_reference text NOT NULL CHECK (operation_reference ~ '^[A-Za-z0-9_:.\/\-]{1,200}$'),
  payment_reference text NOT NULL,
  attempt_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('capture','capture_failed','cancellation','expire','refund','refund_failed','refund_reversed','chargeback','chargeback_reversed')),
  PRIMARY KEY(scope_sha256,operation_reference,kind),
  FOREIGN KEY(scope_sha256,operation_reference)
    REFERENCES business_v2.payment_event_operation_parents(scope_sha256,operation_reference),
  FOREIGN KEY(scope_sha256,payment_reference,attempt_id)
    REFERENCES business_v2.payment_provider_references(scope_sha256,payment_reference,attempt_id)
);
CREATE TABLE business_v2.payment_owned_event_exceptions (
  exception_sha256 text PRIMARY KEY CHECK (exception_sha256 ~ '^[a-f0-9]{64}$'),
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  event_id_sha256 text NOT NULL CHECK (event_id_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_hint uuid,
  event_code text NOT NULL CHECK (event_code ~ '^[A-Z0-9_]{1,80}$'),
  reason text NOT NULL CHECK (reason IN ('unsupported_event','malformed_correlation','financial_return')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION business_v2.fn_payment_session_result_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment session result deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','version','lease_token','lease_until']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','version','lease_token','lease_until']) THEN
    RAISE EXCEPTION 'payment session result immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment session result version fence'; END IF;
  IF OLD.state IN ('verified','conflict') THEN RAISE EXCEPTION 'payment session result terminal state'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payment_session_result_guard BEFORE UPDATE OR DELETE ON business_v2.payment_session_result_operations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_session_result_guard();
CREATE TRIGGER payment_session_result_receipt_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_session_result_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_method_binding_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_method_bindings
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_event_operation_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_event_operations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_event_operation_parent_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_event_operation_parents
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_owned_event_exception_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_owned_event_exceptions
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();

ALTER TABLE business_v2.payment_session_result_operations OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_session_result_receipts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_method_bindings OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_event_operations OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_event_operation_parents OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_owned_event_exceptions OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_session_result_guard() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_session_result_operations,business_v2.payment_session_result_receipts,business_v2.payment_method_bindings,business_v2.payment_event_operation_parents,business_v2.payment_event_operations,business_v2.payment_owned_event_exceptions FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_session_result_guard() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_session_result_operations,business_v2.payment_session_result_receipts,business_v2.payment_method_bindings,business_v2.payment_event_operation_parents,business_v2.payment_event_operations,business_v2.payment_owned_event_exceptions FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_payment_session_result_guard() FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
