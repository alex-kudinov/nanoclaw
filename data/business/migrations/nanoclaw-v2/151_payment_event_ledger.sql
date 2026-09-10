-- Initial TEST AUTHORISATION evidence, not settlement or fulfillment activation.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_attempts') IS NULL THEN RAISE EXCEPTION 'migration149 required'; END IF;
END; $$;
CREATE TABLE business_v2.payment_provider_references (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  payment_reference text NOT NULL CHECK (payment_reference ~ '^[A-Za-z0-9_:.\/-]{1,200}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  PRIMARY KEY(scope_sha256,payment_reference),
  UNIQUE(scope_sha256,payment_reference,attempt_id)
);
CREATE TABLE business_v2.payment_events (
  scope_sha256 text NOT NULL,
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 256),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  payment_reference text NOT NULL,
  fact jsonb NOT NULL CHECK (jsonb_typeof(fact)='object' AND pg_column_size(fact)<=4096),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_sha256,event_id),
  FOREIGN KEY(scope_sha256,payment_reference,attempt_id) REFERENCES business_v2.payment_provider_references(scope_sha256,payment_reference,attempt_id)
);
CREATE TABLE business_v2.payment_event_exceptions (
  exception_sha256 text PRIMARY KEY CHECK (exception_sha256 ~ '^[a-f0-9]{64}$'),
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  event_id_sha256 text NOT NULL CHECK (event_id_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_sha256 text NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_hint uuid NOT NULL,
  attempt_id uuid REFERENCES business_v2.payment_attempts(attempt_id),
  related_attempt_id uuid REFERENCES business_v2.payment_attempts(attempt_id),
  payment_reference text NOT NULL CHECK (payment_reference ~ '^[A-Za-z0-9_:.\/-]{1,200}$'),
  reason text NOT NULL CHECK (reason IN ('unknown_attempt','scope_conflict','delivery_payload_conflict','provider_reference_conflict','amount_or_fact_conflict','evidence_limit','financial_evidence_conflict')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX payment_event_exceptions_attempt ON business_v2.payment_event_exceptions(attempt_id);
CREATE INDEX payment_event_exceptions_related ON business_v2.payment_event_exceptions(related_attempt_id);
CREATE INDEX payment_events_attempt ON business_v2.payment_events(attempt_id);
CREATE TABLE business_v2.payment_checkout_evidence (
  attempt_id uuid PRIMARY KEY REFERENCES business_v2.payment_attempts(attempt_id),
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection)='object' AND pg_column_size(projection)<=262144),
  version integer NOT NULL CHECK (version>=1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER payment_reference_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_provider_references
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_event_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_events
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_event_exception_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_event_exceptions
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE FUNCTION business_v2.fn_payment_evidence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment evidence deletion refused'; END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment evidence version fence'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payment_evidence_guard BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_evidence
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_evidence_guard();
ALTER TABLE business_v2.payment_provider_references OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_events OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_event_exceptions OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_checkout_evidence OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_evidence_guard() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_provider_references,business_v2.payment_events,business_v2.payment_event_exceptions,business_v2.payment_checkout_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_evidence_guard() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_provider_references,business_v2.payment_events,business_v2.payment_event_exceptions,business_v2.payment_checkout_evidence FROM %I',role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.fn_payment_evidence_guard() FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
