-- Explicit customer retry after authenticated terminal card nonpayment.
-- Source-only: no production apply, provider call, payment or activation.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_operations') IS NULL
    OR to_regclass('business_v2.payment_session_result_operations') IS NULL
    OR to_regclass('business_v2.payment_events') IS NULL
    OR to_regclass('business_v2.payment_method_bindings') IS NULL THEN
    RAISE EXCEPTION 'migrations 149, 151 and 152 required';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_operations
  DROP CONSTRAINT payment_operations_attempt_id_key,
  ADD COLUMN session_sequence integer NOT NULL DEFAULT 1
    CHECK (session_sequence BETWEEN 1 AND 3),
  ADD COLUMN predecessor_operation_id uuid
    REFERENCES business_v2.payment_operations(operation_id),
  ADD CONSTRAINT payment_operations_attempt_sequence_uniq
    UNIQUE(attempt_id,session_sequence),
  ADD CONSTRAINT payment_operations_identity_sequence_uniq
    UNIQUE(operation_id,attempt_id,session_sequence),
  ADD CONSTRAINT payment_operations_predecessor_uniq
    UNIQUE(predecessor_operation_id);

CREATE TABLE business_v2.payment_session_terminal_nonpayment_receipts (
  receipt_sha256 text PRIMARY KEY CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  scope_sha256 text NOT NULL CHECK (scope_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  payment_operation_id uuid NOT NULL UNIQUE,
  session_sequence integer NOT NULL CHECK (session_sequence BETWEEN 1 AND 3),
  session_id_sha256 text NOT NULL CHECK (session_id_sha256 ~ '^[a-f0-9]{64}$'),
  result_sha256 text NOT NULL CHECK (result_sha256 ~ '^[a-f0-9]{64}$'),
  response_sha256 text NOT NULL CHECK (response_sha256 ~ '^[a-f0-9]{64}$'),
  terminal_status text NOT NULL CHECK (terminal_status IN ('refused','canceled','expired')),
  source text NOT NULL CHECK (source='authenticated_session_result'),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(attempt_id,session_sequence),
  FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)
    REFERENCES business_v2.payment_operations(operation_id,attempt_id,session_sequence)
);

ALTER TABLE business_v2.payment_operations
  ADD COLUMN retry_terminal_receipt_sha256 text
    REFERENCES business_v2.payment_session_terminal_nonpayment_receipts(receipt_sha256),
  ADD CONSTRAINT payment_operations_retry_terminal_uniq
    UNIQUE(retry_terminal_receipt_sha256),
  ADD CONSTRAINT payment_operations_retry_lineage_check CHECK (
    (session_sequence=1 AND predecessor_operation_id IS NULL
      AND retry_terminal_receipt_sha256 IS NULL)
    OR
    (session_sequence>1 AND predecessor_operation_id IS NOT NULL
      AND retry_terminal_receipt_sha256 IS NOT NULL)
  );

-- Migration149's operation guard compares every column except its explicit
-- state/lease/result allowlist. These additive lineage columns are therefore
-- DB-immutable without weakening or replacing that guard.

ALTER TABLE business_v2.payment_session_result_operations
  DROP CONSTRAINT payment_session_result_operations_attempt_id_key,
  DROP CONSTRAINT payment_session_result_operations_state_check,
  ADD COLUMN payment_operation_id uuid,
  ADD COLUMN session_sequence integer NOT NULL DEFAULT 1
    CHECK (session_sequence BETWEEN 1 AND 3),
  ADD COLUMN terminal_status text
    CHECK (terminal_status IS NULL OR terminal_status IN ('refused','canceled','expired'));

-- The existing immutable/version trigger correctly refuses these additive
-- backfills. Disable only that named trigger inside this transaction; any
-- failure rolls the DDL and trigger state back together.
ALTER TABLE business_v2.payment_session_result_operations
  DISABLE TRIGGER payment_session_result_guard;
UPDATE business_v2.payment_session_result_operations r
SET payment_operation_id=o.operation_id
FROM business_v2.payment_operations o
WHERE o.attempt_id=r.attempt_id AND o.session_sequence=1;
ALTER TABLE business_v2.payment_session_result_operations
  ENABLE TRIGGER payment_session_result_guard;

ALTER TABLE business_v2.payment_session_result_operations
  ALTER COLUMN payment_operation_id SET NOT NULL,
  ADD CONSTRAINT payment_session_result_payment_operation_fk
    FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)
    REFERENCES business_v2.payment_operations(operation_id,attempt_id,session_sequence),
  ADD CONSTRAINT payment_session_result_operation_result_uniq
    UNIQUE(payment_operation_id,result_sha256),
  ADD CONSTRAINT payment_session_result_state_check
    CHECK (state IN ('prepared','unknown','verified','conflict','terminal_nonpayment')),
  ADD CONSTRAINT payment_session_result_terminal_status_check CHECK (
    (state='terminal_nonpayment')=(terminal_status IS NOT NULL)
  ),
  ADD CONSTRAINT payment_session_result_terminal_lease_check CHECK (
    state<>'terminal_nonpayment' OR lease_token IS NULL
  );

ALTER TABLE business_v2.payment_session_result_receipts
  DROP CONSTRAINT payment_session_result_receipts_kind_check,
  ADD CONSTRAINT payment_session_result_receipts_kind_check
    CHECK (kind IN ('prepared','claimed','unknown','verified','conflict','terminal_nonpayment'));

CREATE OR REPLACE FUNCTION business_v2.fn_payment_session_result_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment session result deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','version','lease_token','lease_until','terminal_status']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','version','lease_token','lease_until','terminal_status']) THEN
    RAISE EXCEPTION 'payment session result immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment session result version fence'; END IF;
  IF OLD.state IN ('verified','conflict','terminal_nonpayment') THEN
    RAISE EXCEPTION 'payment session result terminal state';
  END IF;
  IF NEW.state='terminal_nonpayment' AND NEW.terminal_status IS NULL THEN
    RAISE EXCEPTION 'payment session terminal status missing';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE business_v2.payment_provider_references
  ADD COLUMN payment_operation_id uuid,
  ADD COLUMN session_sequence integer NOT NULL DEFAULT 1
    CHECK (session_sequence BETWEEN 1 AND 3);
ALTER TABLE business_v2.payment_provider_references
  DISABLE TRIGGER payment_reference_immutable;
UPDATE business_v2.payment_provider_references r
SET payment_operation_id=o.operation_id
FROM business_v2.payment_operations o
WHERE o.attempt_id=r.attempt_id AND o.session_sequence=1;
ALTER TABLE business_v2.payment_provider_references
  ENABLE TRIGGER payment_reference_immutable;
ALTER TABLE business_v2.payment_provider_references
  ALTER COLUMN payment_operation_id SET NOT NULL,
  ADD CONSTRAINT payment_provider_reference_operation_fk
    FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)
    REFERENCES business_v2.payment_operations(operation_id,attempt_id,session_sequence);

ALTER TABLE business_v2.payment_events
  ADD COLUMN payment_operation_id uuid,
  ADD COLUMN session_sequence integer NOT NULL DEFAULT 1
    CHECK (session_sequence BETWEEN 1 AND 3);
ALTER TABLE business_v2.payment_events
  DISABLE TRIGGER payment_event_immutable;
UPDATE business_v2.payment_events e
SET payment_operation_id=o.operation_id
FROM business_v2.payment_operations o
WHERE o.attempt_id=e.attempt_id AND o.session_sequence=1;
ALTER TABLE business_v2.payment_events
  ENABLE TRIGGER payment_event_immutable;
ALTER TABLE business_v2.payment_events
  ALTER COLUMN payment_operation_id SET NOT NULL,
  ADD CONSTRAINT payment_event_operation_source_fk
    FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)
    REFERENCES business_v2.payment_operations(operation_id,attempt_id,session_sequence);

CREATE TABLE business_v2.payment_session_retry_exceptions (
  exception_sha256 text PRIMARY KEY CHECK (exception_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES business_v2.payment_attempts(attempt_id),
  payment_operation_id uuid NOT NULL REFERENCES business_v2.payment_operations(operation_id),
  session_sequence integer NOT NULL CHECK (session_sequence BETWEEN 1 AND 3),
  event_id_sha256 text CHECK (event_id_sha256 IS NULL OR event_id_sha256 ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (reason IN (
    'late_positive_after_terminal','terminal_evidence_conflict','retry_chain_conflict'
  )),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(payment_operation_id,attempt_id,session_sequence)
    REFERENCES business_v2.payment_operations(operation_id,attempt_id,session_sequence)
);
CREATE INDEX payment_session_retry_exceptions_attempt_idx
  ON business_v2.payment_session_retry_exceptions(attempt_id,recorded_at);

CREATE FUNCTION business_v2.fn_payment_session_retry_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  RAISE EXCEPTION 'payment session retry evidence immutable';
END $$;
CREATE TRIGGER payment_session_terminal_receipt_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_session_terminal_nonpayment_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_session_retry_immutable();
CREATE TRIGGER payment_session_retry_exception_immutable
BEFORE UPDATE OR DELETE ON business_v2.payment_session_retry_exceptions
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_session_retry_immutable();

DO $$ BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='business_v2' AND (
      (c.relname='payment_session_result_operations'
        AND t.tgname='payment_session_result_guard') OR
      (c.relname='payment_provider_references'
        AND t.tgname='payment_reference_immutable') OR
      (c.relname='payment_events' AND t.tgname='payment_event_immutable')
    ) AND t.tgenabled<>'O'
  ) THEN
    RAISE EXCEPTION 'payment migration guard restoration failed';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_session_terminal_nonpayment_receipts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.payment_session_retry_exceptions OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_payment_session_retry_immutable() OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.payment_session_terminal_nonpayment_receipts,
  business_v2.payment_session_retry_exceptions FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_payment_session_retry_immutable() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname<>'nanoclaw_admin' AND rolname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON business_v2.payment_session_terminal_nonpayment_receipts,business_v2.payment_session_retry_exceptions FROM %I',
      role_name
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION business_v2.fn_payment_session_retry_immutable() FROM %I',
      role_name
    );
  END LOOP;
END $$;

COMMIT;
