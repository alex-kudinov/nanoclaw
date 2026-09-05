-- rollback_143_academy_capacity_dark.sql
-- Refuse destructive rollback after any capacity evidence exists.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE evidence_count bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM business_v2.academy_delivery_blocks) +
    (SELECT count(*) FROM business_v2.academy_seat_pools) +
    (SELECT count(*) FROM business_v2.academy_seat_pool_offers) +
    (SELECT count(*) FROM business_v2.academy_capacity_reservations) +
    (SELECT count(*) FROM business_v2.academy_waitlist_entries) +
    (SELECT count(*) FROM business_v2.academy_waitlist_offers) +
    (SELECT count(*) FROM business_v2.academy_capacity_events)
  INTO evidence_count;

  IF evidence_count <> 0 THEN
    RAISE EXCEPTION
      'migration 143 rollback refused: Academy capacity evidence exists';
  END IF;
END $$;

ALTER TABLE business_v2.student_class_assignments
  DROP CONSTRAINT student_class_assignments_delivery_block_fk;
DROP INDEX business_v2.student_class_assignments_current_enrollment_block_uniq;

DROP VIEW business_v2.v_academy_seat_pool_occupancy;
DROP TABLE business_v2.academy_capacity_events;
DROP TABLE business_v2.academy_waitlist_offers;
DROP TABLE business_v2.academy_waitlist_entries;
DROP TABLE business_v2.academy_capacity_reservations;
DROP TABLE business_v2.academy_seat_pool_offers;
DROP TABLE business_v2.academy_seat_pools;
DROP TABLE business_v2.academy_delivery_blocks;

ALTER TABLE business_v2.student_enrollment_seats
  DROP CONSTRAINT student_enrollment_seats_order_id_id_uniq;

COMMIT;
