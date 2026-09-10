-- Local/unapplied provider-projection prerequisite. No runtime or provider activation.
BEGIN;
ALTER TABLE business_v2.student_projection_outbox
  ADD COLUMN target_idempotency_key text,
  ADD COLUMN destination_key text,
  ADD COLUMN provider_operation_id text,
  ADD COLUMN last_readback_sha256 text,
  ADD COLUMN uncertain_acceptance boolean NOT NULL DEFAULT false,
  ADD COLUMN supersedes_outbox_id bigint REFERENCES business_v2.student_projection_outbox(id),
  ADD CONSTRAINT student_projection_target_idempotency_key_check
    CHECK (target_idempotency_key IS NULL OR char_length(target_idempotency_key) BETWEEN 1 AND 500),
  ADD CONSTRAINT student_projection_destination_key_check
    CHECK (destination_key IS NULL OR char_length(destination_key) BETWEEN 1 AND 300),
  ADD CONSTRAINT student_projection_operation_id_check
    CHECK (provider_operation_id IS NULL OR char_length(provider_operation_id) BETWEEN 1 AND 500),
  ADD CONSTRAINT student_projection_last_readback_sha256_check
    CHECK (last_readback_sha256 IS NULL OR last_readback_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT student_projection_delivery_identity_check
    CHECK ((target_idempotency_key IS NULL) = (destination_key IS NULL)),
  ADD CONSTRAINT student_projection_uncertain_hold_check
    CHECK (NOT uncertain_acceptance OR state = 'held');

CREATE UNIQUE INDEX student_projection_target_idempotency_uniq
  ON business_v2.student_projection_outbox (target, target_idempotency_key)
  WHERE target_idempotency_key IS NOT NULL;

CREATE INDEX student_projection_subject_version_idx
  ON business_v2.student_projection_outbox
    (target, subject_type, subject_key, subject_version DESC, id DESC);

COMMENT ON COLUMN business_v2.student_projection_outbox.target_idempotency_key IS
  'Target-scoped versioned key. Provider retries must search this key before apply.';
COMMENT ON COLUMN business_v2.student_projection_outbox.destination_key IS
  'Exact reviewed synthetic/provider destination identity; never inferred from target.';
COMMENT ON COLUMN business_v2.student_projection_outbox.uncertain_acceptance IS
  'True blocks retry until exact target reconciliation resolves possible acceptance.';
COMMIT;
