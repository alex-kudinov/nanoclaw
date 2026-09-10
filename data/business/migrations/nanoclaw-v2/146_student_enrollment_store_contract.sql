-- Local/unapplied store prerequisite. No runtime or provider activation.
BEGIN;
ALTER TABLE business_v2.student_projection_outbox
  ADD COLUMN version integer NOT NULL DEFAULT 0
    CONSTRAINT student_projection_outbox_version_check CHECK (version >= 0);
COMMENT ON COLUMN business_v2.student_projection_outbox.version IS
  'Canonical projection version for host compare-and-swap; distinct from delivery attempts.';
ALTER TABLE business_v2.student_enrollment_history
  DROP CONSTRAINT student_enrollment_history_subject_type_check;
ALTER TABLE business_v2.student_enrollment_history
  ADD CONSTRAINT student_enrollment_history_subject_type_check CHECK (subject_type IN (
    'order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement',
    'obligation', 'projection', 'exception', 'evidence'
  ));
COMMIT;
