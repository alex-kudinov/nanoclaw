-- Unsigned Adyen ESD/3DS supplemental results, isolated from payment facts.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_events') IS NULL THEN
    RAISE EXCEPTION 'migration151 required';
  END IF;
END; $$;
CREATE TABLE business_v2.payment_provider_optimization_evidence (
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 256),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  event_code text NOT NULL CHECK (event_code IN ('AUTHORISATION','CAPTURE')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object' AND pg_column_size(evidence)<=4096),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_sha256,event_id,evidence_sha256)
);
CREATE INDEX payment_provider_optimization_attempt
  ON business_v2.payment_provider_optimization_evidence(attempt_id,recorded_at);
CREATE TRIGGER payment_provider_optimization_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_provider_optimization_evidence
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
ALTER TABLE business_v2.payment_provider_optimization_evidence OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_provider_optimization_evidence FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_provider_optimization_evidence FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
