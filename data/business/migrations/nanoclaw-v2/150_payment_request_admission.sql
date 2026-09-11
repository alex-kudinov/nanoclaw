-- Host-only request replay admission and scoped guest status capabilities.
BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF to_regclass('business_v2.payment_attempts') IS NULL THEN RAISE EXCEPTION 'migration 149 required'; END IF;
END; $$;
CREATE TABLE business_v2.payment_request_nonces (
  caller text NOT NULL CHECK (caller ~ '^[a-zA-Z0-9_-]{1,64}$'),
  nonce_sha256 text NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  operation_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  received_at bigint NOT NULL CHECK (received_at>=0),
  retain_until bigint NOT NULL CHECK (retain_until>received_at AND retain_until<=received_at+600001),
  PRIMARY KEY(caller,nonce_sha256)
);
CREATE TABLE business_v2.payment_status_capabilities (
  capability_id uuid PRIMARY KEY,
  caller text NOT NULL,
  issuer_nonce_sha256 text NOT NULL,
  operation_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_token text NOT NULL CHECK (octet_length(encrypted_token)<=1024),
  issued_at bigint NOT NULL CHECK (issued_at>=0),
  expires_at bigint NOT NULL CHECK (expires_at>issued_at AND expires_at<=issued_at+86400000),
  FOREIGN KEY(caller,issuer_nonce_sha256) REFERENCES business_v2.payment_request_nonces(caller,nonce_sha256),
  UNIQUE(caller,operation_id)
);
CREATE TABLE business_v2.payment_status_revocations (
  capability_id uuid PRIMARY KEY REFERENCES business_v2.payment_status_capabilities(capability_id),
  caller text NOT NULL,
  request_nonce_sha256 text NOT NULL,
  operation_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('rotation','operator','security')),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(caller,request_nonce_sha256) REFERENCES business_v2.payment_request_nonces(caller,nonce_sha256)
);
CREATE TRIGGER payment_nonce_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_request_nonces
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_capability_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_status_capabilities
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
CREATE TRIGGER payment_revocation_immutable BEFORE UPDATE OR DELETE ON business_v2.payment_status_revocations
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_store_immutable();
ALTER TABLE business_v2.payment_request_nonces OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_status_capabilities OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_status_revocations OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_request_nonces,business_v2.payment_status_capabilities,business_v2.payment_status_revocations FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%' LOOP
    EXECUTE format('REVOKE ALL ON business_v2.payment_request_nonces,business_v2.payment_status_capabilities,business_v2.payment_status_revocations FROM %I',role_name);
  END LOOP;
END; $$;
COMMIT;
