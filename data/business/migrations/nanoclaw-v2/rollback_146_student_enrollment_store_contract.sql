BEGIN;
LOCK TABLE business_v2.student_projection_outbox IN ACCESS EXCLUSIVE MODE;
LOCK TABLE business_v2.student_enrollment_history IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.student_projection_outbox) THEN
    RAISE EXCEPTION 'refusing projection-version rollback while outbox rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.student_enrollment_history WHERE subject_type='evidence') THEN
    RAISE EXCEPTION 'refusing store-contract rollback while evidence history exists';
  END IF;
END $$;
ALTER TABLE business_v2.student_projection_outbox DROP COLUMN version;
ALTER TABLE business_v2.student_enrollment_history
  DROP CONSTRAINT student_enrollment_history_subject_type_check;
ALTER TABLE business_v2.student_enrollment_history
  ADD CONSTRAINT student_enrollment_history_subject_type_check CHECK (subject_type IN (
    'order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement',
    'obligation', 'projection', 'exception'
  ));
COMMIT;
