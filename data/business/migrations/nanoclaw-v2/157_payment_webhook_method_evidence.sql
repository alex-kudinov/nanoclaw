-- Browser-independent card method evidence from signed webhook authorization.
-- Source-only: no production apply, provider call, payment or fulfillment action.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.payment_method_bindings') IS NULL
    OR to_regclass('business_v2.payment_events') IS NULL
    OR to_regclass('business_v2.payment_enrollment_admissions') IS NULL THEN
    RAISE EXCEPTION 'migrations 151, 152 and 155 required';
  END IF;
END; $$;

ALTER TABLE business_v2.payment_method_bindings
  ADD COLUMN source_kind text NOT NULL DEFAULT 'session_result'
    CHECK (source_kind IN ('session_result','card_scope_webhook')),
  ADD COLUMN source_event_id text,
  ALTER COLUMN operation_id DROP NOT NULL,
  ADD CONSTRAINT payment_method_binding_source_event_fk
    FOREIGN KEY(scope_sha256,source_event_id)
    REFERENCES business_v2.payment_events(scope_sha256,event_id),
  ADD CONSTRAINT payment_method_binding_exact_source_check CHECK (
    (source_kind='session_result' AND operation_id IS NOT NULL
      AND source_event_id IS NULL)
    OR
    (source_kind='card_scope_webhook' AND operation_id IS NULL
      AND source_event_id IS NOT NULL)
  );

ALTER TABLE business_v2.payment_enrollment_admissions
  ADD COLUMN method_source_kind text NOT NULL DEFAULT 'session_result'
    CHECK (method_source_kind IN ('session_result','card_scope_webhook')),
  ADD COLUMN method_event_id text,
  ALTER COLUMN method_operation_id DROP NOT NULL,
  ADD CONSTRAINT payment_enrollment_method_event_fk
    FOREIGN KEY(scope_sha256,method_event_id)
    REFERENCES business_v2.payment_events(scope_sha256,event_id),
  ADD CONSTRAINT payment_enrollment_method_exact_source_check CHECK (
    (method_source_kind='session_result' AND method_operation_id IS NOT NULL
      AND method_event_id IS NULL)
    OR
    (method_source_kind='card_scope_webhook' AND method_operation_id IS NULL
      AND method_event_id IS NOT NULL)
  );

COMMENT ON COLUMN business_v2.payment_method_bindings.source_kind IS
  'Exact evidence authority: verified Session result or card-only signed webhook scope.';
COMMENT ON COLUMN business_v2.payment_method_bindings.source_event_id IS
  'Successful HMAC-admitted AUTHORISATION event used only for a pinned card-only attempt.';

COMMIT;
