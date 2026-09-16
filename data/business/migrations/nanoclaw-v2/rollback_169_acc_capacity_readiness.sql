-- rollback_169_acc_capacity_readiness.sql

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.academy_capacity_reservations r
    JOIN business_v2.academy_seat_pools p ON p.id=r.pool_id
    WHERE p.pool_key IN (
      'calendar-publication:pool:acc.module-1:2026-10-07',
      'calendar-publication:pool:acc.module-1:2027-02-01',
      'calendar-publication:pool:acc.module-1:2027-04-05',
      'calendar-publication:pool:acc.module-1:2027-07-05'
    )
  ) THEN RAISE EXCEPTION 'rollback 169 refused: capacity commitments exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.academy_capacity_publications x
    JOIN business_v2.academy_seat_pools p ON p.id=x.pool_id
    WHERE p.pool_key IN (
      'calendar-publication:pool:acc.module-1:2026-10-07',
      'calendar-publication:pool:acc.module-1:2027-02-01',
      'calendar-publication:pool:acc.module-1:2027-04-05',
      'calendar-publication:pool:acc.module-1:2027-07-05'
    )
  ) THEN RAISE EXCEPTION 'rollback 169 refused: capacity publications exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.student_class_assignments
    WHERE delivery_block_key IN (
      'acc.module-1:2026-10-07','acc.module-1:2027-02-01',
      'acc.module-1:2027-04-05','acc.module-1:2027-07-05'
    )
  ) THEN RAISE EXCEPTION 'rollback 169 refused: class assignments exist'; END IF;
END $$;

DELETE FROM business_v2.academy_seat_pool_offers
WHERE mapping_key LIKE 'calendar-publication:mapping:acc.module-1:%'
  AND split_part(mapping_key, ':', 4) IN ('2026-10-07','2027-02-01','2027-04-05','2027-07-05');
DELETE FROM business_v2.academy_seat_pools
WHERE pool_key IN (
  'calendar-publication:pool:acc.module-1:2026-10-07',
  'calendar-publication:pool:acc.module-1:2027-02-01',
  'calendar-publication:pool:acc.module-1:2027-04-05',
  'calendar-publication:pool:acc.module-1:2027-07-05'
);
DELETE FROM business_v2.academy_delivery_blocks
WHERE delivery_block_key IN (
  'acc.module-1:2026-10-07','acc.module-1:2027-02-01',
  'acc.module-1:2027-04-05','acc.module-1:2027-07-05'
);

COMMIT;
