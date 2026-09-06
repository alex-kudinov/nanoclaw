-- 145_academy_capacity_simple_sync.sql
--
-- Durable, non-expiring-before-delivery commitments and the privacy-minimized
-- website publication outbox for the owner-approved simple capacity sync.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.academy_capacity_operator_cases') IS NULL THEN
    RAISE EXCEPTION 'migration 144 must be applied before migration 145';
  END IF;
END $$;

ALTER TABLE business_v2.academy_capacity_operator_cases
  DROP CONSTRAINT academy_capacity_operator_cases_command_type_check;
ALTER TABLE business_v2.academy_capacity_operator_cases
  ADD CONSTRAINT academy_capacity_operator_cases_command_type_check
    CHECK (command_type IN (
      'reserve_manual', 'release_reservation', 'transfer_assignment',
      'withdraw_assignment', 'reconcile_pool', 'join_waitlist',
      'stage_waitlist_offer', 'commit_seat', 'change_capacity',
      'transfer_commitment', 'reconcile_commitment'
    ));

ALTER TABLE business_v2.academy_capacity_reservations
  DROP CONSTRAINT academy_capacity_reservations_channel_check,
  DROP CONSTRAINT academy_capacity_reservations_check5;

ALTER TABLE business_v2.academy_capacity_reservations
  ADD CONSTRAINT academy_capacity_reservations_channel_check
    CHECK (channel IN ('checkout', 'manual', 'waitlist_offer', 'commitment')),
  ADD CONSTRAINT academy_capacity_reservations_check5 CHECK (
    (channel = 'checkout' AND expires_at <= created_at + interval '30 minutes')
    OR
    (channel IN ('manual', 'waitlist_offer') AND expires_at <= created_at + interval '7 days')
    OR
    (channel = 'commitment' AND expires_at <= created_at + interval '3 years')
  );

CREATE OR REPLACE VIEW business_v2.v_academy_seat_pool_occupancy AS
WITH assignment_counts AS (
  SELECT delivery_block_key, count(*)::integer AS occupied
  FROM business_v2.student_class_assignments
  WHERE state IN ('pending', 'active')
  GROUP BY delivery_block_key
), reservation_counts AS (
  SELECT pool_id, count(*)::integer AS reserved
  FROM business_v2.academy_capacity_reservations
  WHERE state = 'held' AND expires_at > now() AND channel <> 'commitment'
  GROUP BY pool_id
), commitment_counts AS (
  SELECT pool_id, count(*)::integer AS committed
  FROM business_v2.academy_capacity_reservations
  WHERE state = 'held' AND expires_at > now() AND channel = 'commitment'
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
  GREATEST(
    0,
    sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0)
      - COALESCE(cc.committed, 0)
  ) AS available,
  COALESCE(wc.waitlist_count, 0) AS waitlist_count,
  CASE
    WHEN sp.operational_state = 'closed' THEN 'closed'
    WHEN sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0)
      - COALESCE(cc.committed, 0) <= 0 THEN 'sold_out'
    ELSE 'open'
  END AS public_state,
  sp.version AS pool_version,
  sp.updated_at AS source_updated_at,
  now() AS calculated_at,
  COALESCE(cc.committed, 0) AS committed
FROM business_v2.academy_seat_pools sp
JOIN business_v2.academy_delivery_blocks db ON db.id = sp.delivery_block_id
LEFT JOIN assignment_counts ac ON ac.delivery_block_key = db.delivery_block_key
LEFT JOIN reservation_counts rc ON rc.pool_id = sp.id
LEFT JOIN commitment_counts cc ON cc.pool_id = sp.id
LEFT JOIN waitlist_counts wc ON wc.pool_id = sp.id;

CREATE TABLE business_v2.academy_capacity_publications (
  id bigserial PRIMARY KEY,
  publication_key text NOT NULL UNIQUE
    CHECK (publication_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  pool_id bigint NOT NULL REFERENCES business_v2.academy_seat_pools(id),
  pool_version integer NOT NULL CHECK (pool_version >= 0),
  public_state text NOT NULL CHECK (public_state IN ('available', 'sold_out')),
  reason text NOT NULL CHECK (reason IN ('threshold', 'daily', 'initial')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('pending', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  last_error_code text
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  ack_sha256 text CHECK (ack_sha256 IS NULL OR ack_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  delivered_at timestamptz,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (pool_id, pool_version, reason, publication_key),
  CHECK (created_at <= updated_at),
  CHECK ((state = 'delivered') = (delivered_at IS NOT NULL AND ack_sha256 IS NOT NULL))
);
CREATE INDEX academy_capacity_publications_pending_idx
  ON business_v2.academy_capacity_publications
  (next_attempt_at, id)
  WHERE state IN ('pending', 'failed');
CREATE INDEX academy_capacity_publications_pool_idx
  ON business_v2.academy_capacity_publications
  (pool_id, delivered_at DESC, id DESC);

DO $$
BEGIN
  ALTER TABLE business_v2.academy_capacity_publications OWNER TO nanoclaw_admin;
  REVOKE ALL ON business_v2.academy_capacity_publications FROM PUBLIC;
  GRANT ALL ON business_v2.academy_capacity_publications TO nanoclaw_admin;
  ALTER SEQUENCE business_v2.academy_capacity_publications_id_seq OWNER TO nanoclaw_admin;
  REVOKE ALL ON SEQUENCE business_v2.academy_capacity_publications_id_seq FROM PUBLIC;
  GRANT ALL ON SEQUENCE business_v2.academy_capacity_publications_id_seq TO nanoclaw_admin;
  ALTER VIEW business_v2.v_academy_seat_pool_occupancy OWNER TO nanoclaw_admin;
END $$;

COMMIT;
