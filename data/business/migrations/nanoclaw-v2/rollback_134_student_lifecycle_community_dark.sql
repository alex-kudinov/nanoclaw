-- Guarded rollback for migration 134. Runtime admission must be disabled first.
-- Recorded lifecycle history is never erased by rollback.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_catalog_entries LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_identity_links LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_events LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_enrollments LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_reconciliation_runs LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_state_history LIMIT 1
     ) OR EXISTS (
       SELECT 1 FROM business_v2.student_lifecycle_exceptions LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'rollback 134 refused: student lifecycle history exists; disable admission and use a separately reviewed archival migration';
  END IF;
END $$;

DROP VIEW business_v2.v_student_lifecycle_exception_queue;
DROP VIEW business_v2.v_student_lifecycle_health;
DROP TABLE business_v2.student_lifecycle_exceptions;
DROP TABLE business_v2.student_lifecycle_state_history;
ALTER TABLE business_v2.student_lifecycle_events
  DROP CONSTRAINT student_lifecycle_events_run_fk;
DROP TABLE business_v2.student_lifecycle_reconciliation_runs;
DROP TABLE business_v2.student_lifecycle_enrollments;
DROP TABLE business_v2.student_lifecycle_events;
DROP TABLE business_v2.student_lifecycle_identity_links;
DROP TABLE business_v2.student_lifecycle_catalog_entries;
DROP FUNCTION business_v2.fn_student_lifecycle_event_core_immutable();

COMMIT;
