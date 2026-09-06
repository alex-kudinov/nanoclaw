-- rollback_145_academy_capacity_simple_sync.sql

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.academy_capacity_reservations
     WHERE channel = 'commitment'
  ) THEN
    RAISE EXCEPTION 'rollback 145 refused: commitment rows exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.academy_capacity_publications
  ) THEN
    RAISE EXCEPTION 'rollback 145 refused: publication rows exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.academy_capacity_operator_cases
     WHERE command_type IN (
       'commit_seat', 'change_capacity', 'transfer_commitment',
       'reconcile_commitment'
     )
  ) THEN
    RAISE EXCEPTION 'rollback 145 refused: simple-sync operator cases exist';
  END IF;
END $$;

DROP TABLE business_v2.academy_capacity_publications;

DROP VIEW business_v2.v_academy_seat_pool_occupancy;
CREATE VIEW business_v2.v_academy_seat_pool_occupancy AS
WITH assignment_counts AS (
  SELECT delivery_block_key, count(*)::integer AS occupied
  FROM business_v2.student_class_assignments
  WHERE state IN ('pending', 'active')
  GROUP BY delivery_block_key
), reservation_counts AS (
  SELECT pool_id, count(*)::integer AS reserved
  FROM business_v2.academy_capacity_reservations
  WHERE state = 'held' AND expires_at > now()
  GROUP BY pool_id
), waitlist_counts AS (
  SELECT pool_id, count(*)::integer AS waitlist_count
  FROM business_v2.academy_waitlist_entries
  WHERE state IN ('waiting', 'offered', 'accepted')
  GROUP BY pool_id
)
SELECT
  sp.pool_key,
  db.delivery_block_key,
  sp.capacity,
  COALESCE(ac.occupied, 0) AS occupied,
  COALESCE(rc.reserved, 0) AS reserved,
  GREATEST(0, sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0)) AS available,
  COALESCE(wc.waitlist_count, 0) AS waitlist_count,
  CASE
    WHEN sp.operational_state = 'closed' THEN 'closed'
    WHEN sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0) <= 0 THEN 'sold_out'
    ELSE 'open'
  END AS public_state,
  sp.version AS pool_version,
  sp.updated_at AS source_updated_at,
  now() AS calculated_at
FROM business_v2.academy_seat_pools sp
JOIN business_v2.academy_delivery_blocks db ON db.id = sp.delivery_block_id
LEFT JOIN assignment_counts ac ON ac.delivery_block_key = db.delivery_block_key
LEFT JOIN reservation_counts rc ON rc.pool_id = sp.id
LEFT JOIN waitlist_counts wc ON wc.pool_id = sp.id;
ALTER VIEW business_v2.v_academy_seat_pool_occupancy OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.v_academy_seat_pool_occupancy FROM PUBLIC;
GRANT ALL ON business_v2.v_academy_seat_pool_occupancy TO nanoclaw_admin;

ALTER TABLE business_v2.academy_capacity_operator_cases
  DROP CONSTRAINT academy_capacity_operator_cases_command_type_check;
ALTER TABLE business_v2.academy_capacity_operator_cases
  ADD CONSTRAINT academy_capacity_operator_cases_command_type_check
    CHECK (command_type IN (
      'reserve_manual', 'release_reservation', 'transfer_assignment',
      'withdraw_assignment', 'reconcile_pool', 'join_waitlist',
      'stage_waitlist_offer'
    ));

ALTER TABLE business_v2.academy_capacity_reservations
  DROP CONSTRAINT academy_capacity_reservations_channel_check,
  DROP CONSTRAINT academy_capacity_reservations_check5;

ALTER TABLE business_v2.academy_capacity_reservations
  ADD CONSTRAINT academy_capacity_reservations_channel_check
    CHECK (channel IN ('checkout', 'manual', 'waitlist_offer')),
  ADD CONSTRAINT academy_capacity_reservations_check5 CHECK (
    (channel = 'checkout' AND expires_at <= created_at + interval '30 minutes')
    OR
    (channel IN ('manual', 'waitlist_offer') AND expires_at <= created_at + interval '7 days')
  );

COMMIT;
