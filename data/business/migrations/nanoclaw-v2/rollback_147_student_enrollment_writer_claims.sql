BEGIN;
LOCK TABLE business_v2.student_enrollment_authenticated_receipts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE business_v2.student_enrollment_writer_claims IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.student_enrollment_writer_claims) THEN
    RAISE EXCEPTION 'refusing writer-claim rollback while claims exist';
  END IF;
  IF EXISTS(SELECT 1 FROM business_v2.student_enrollment_authenticated_receipts) THEN
    RAISE EXCEPTION 'refusing authenticated-receipt rollback while receipts exist';
  END IF;
END $$;
DROP TABLE business_v2.student_enrollment_writer_claims;
DROP TABLE business_v2.student_enrollment_authenticated_receipts;
COMMIT;
