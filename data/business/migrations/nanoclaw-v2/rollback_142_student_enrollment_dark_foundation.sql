-- Guarded rollback for migration 142. Refuse after any evidence exists.
BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.student_enrollment_orders LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollment_order_source_refs LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollment_evidence LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollment_seats LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_financial_agreements LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_financial_obligations LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollments_v2 LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_component_entitlements LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_class_assignments LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_projection_outbox LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_projection_receipts LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollment_exceptions_v2 LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.student_enrollment_history LIMIT 1)
  THEN
    RAISE EXCEPTION 'migration 142 rollback refused: student enrollment evidence exists';
  END IF;
END $$;

DROP VIEW business_v2.v_student_enrollment_dark_health;
DROP TABLE business_v2.student_enrollment_history;
DROP TABLE business_v2.student_enrollment_exceptions_v2;
DROP TABLE business_v2.student_projection_receipts;
DROP TABLE business_v2.student_projection_outbox;
DROP TABLE business_v2.student_class_assignments;
DROP TABLE business_v2.student_component_entitlements;
DROP TABLE business_v2.student_enrollments_v2;
DROP TABLE business_v2.student_financial_obligations;
DROP TABLE business_v2.student_financial_agreements;
DROP TABLE business_v2.student_enrollment_seats;
DROP TABLE business_v2.student_enrollment_evidence;
DROP TABLE business_v2.student_enrollment_order_source_refs;
DROP TABLE business_v2.student_enrollment_orders;

COMMIT;
