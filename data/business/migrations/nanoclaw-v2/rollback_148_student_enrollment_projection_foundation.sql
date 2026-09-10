BEGIN;
LOCK TABLE business_v2.student_projection_outbox IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.student_projection_outbox
    WHERE target_idempotency_key IS NOT NULL
       OR destination_key IS NOT NULL
       OR provider_operation_id IS NOT NULL
       OR last_readback_sha256 IS NOT NULL
       OR uncertain_acceptance
       OR supersedes_outbox_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'refusing projection-foundation rollback while delivery evidence exists';
  END IF;
END $$;
DROP INDEX business_v2.student_projection_subject_version_idx;
DROP INDEX business_v2.student_projection_target_idempotency_uniq;
ALTER TABLE business_v2.student_projection_outbox
  DROP CONSTRAINT student_projection_uncertain_hold_check,
  DROP CONSTRAINT student_projection_delivery_identity_check,
  DROP CONSTRAINT student_projection_last_readback_sha256_check,
  DROP CONSTRAINT student_projection_operation_id_check,
  DROP CONSTRAINT student_projection_destination_key_check,
  DROP CONSTRAINT student_projection_target_idempotency_key_check,
  DROP COLUMN supersedes_outbox_id,
  DROP COLUMN uncertain_acceptance,
  DROP COLUMN last_readback_sha256,
  DROP COLUMN provider_operation_id,
  DROP COLUMN destination_key,
  DROP COLUMN target_idempotency_key;
COMMIT;
