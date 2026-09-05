-- 143_academy_capacity_dark.sql
--
-- Admin-only, default-off Academy capacity extension. Migration 142 must exist.
-- This migration creates no rows, grants no minion access, wires no runtime,
-- and performs no reconciliation, provider action, or cohort-state change.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.academy_delivery_blocks (
  id bigserial PRIMARY KEY,
  delivery_block_key text NOT NULL UNIQUE
    CHECK (delivery_block_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  component_key text NOT NULL
    CHECK (component_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  source_scope text NOT NULL
    CHECK (source_scope ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  source_object_id text NOT NULL
    CHECK (char_length(source_object_id) BETWEEN 1 AND 300),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 100),
  session_set_sha256 text NOT NULL
    CHECK (session_set_sha256 ~ '^[0-9a-f]{64}$'),
  schedule_evidence_sha256 text NOT NULL
    CHECK (schedule_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL
    CHECK (state IN ('scheduled', 'cancelled', 'completed')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (source_scope, source_object_id),
  CHECK (starts_at < ends_at),
  CHECK (created_at <= updated_at)
);

CREATE TABLE business_v2.academy_seat_pools (
  id bigserial PRIMARY KEY,
  pool_key text NOT NULL UNIQUE
    CHECK (pool_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  delivery_block_id bigint NOT NULL UNIQUE
    REFERENCES business_v2.academy_delivery_blocks(id),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
  operational_state text NOT NULL CHECK (operational_state IN ('open', 'closed')),
  close_reason text CHECK (close_reason IS NULL OR char_length(close_reason) BETWEEN 1 AND 500),
  configuration_evidence_sha256 text NOT NULL
    CHECK (configuration_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK ((operational_state = 'closed') = (close_reason IS NOT NULL)),
  CHECK (created_at <= updated_at)
);

CREATE TABLE business_v2.academy_seat_pool_offers (
  id bigserial PRIMARY KEY,
  mapping_key text NOT NULL UNIQUE
    CHECK (mapping_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  pool_id bigint NOT NULL REFERENCES business_v2.academy_seat_pools(id),
  offer_key text NOT NULL
    CHECK (offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  catalog_revision integer NOT NULL CHECK (catalog_revision > 0),
  state text NOT NULL CHECK (state IN ('active', 'inactive')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (pool_id, offer_key, catalog_revision),
  CHECK (created_at <= updated_at)
);
CREATE INDEX academy_seat_pool_offers_active_idx
  ON business_v2.academy_seat_pool_offers
  (pool_id, offer_key, catalog_revision)
  WHERE state = 'active';

ALTER TABLE business_v2.student_enrollment_seats
  ADD CONSTRAINT student_enrollment_seats_order_id_id_uniq
  UNIQUE (order_id, id);

CREATE TABLE business_v2.academy_capacity_reservations (
  id bigserial PRIMARY KEY,
  reservation_key text NOT NULL UNIQUE
    CHECK (reservation_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  pool_id bigint NOT NULL REFERENCES business_v2.academy_seat_pools(id),
  channel text NOT NULL CHECK (channel IN ('checkout', 'manual', 'waitlist_offer')),
  source_scope text NOT NULL
    CHECK (source_scope ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 500),
  offer_key text NOT NULL
    CHECK (offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  catalog_revision integer NOT NULL CHECK (catalog_revision > 0),
  order_id bigint REFERENCES business_v2.student_enrollment_orders(id),
  seat_id bigint,
  state text NOT NULL
    CHECK (state IN ('held', 'consumed', 'released', 'expired', 'cancelled')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  expires_at timestamptz NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  source_evidence_sha256 text NOT NULL
    CHECK (source_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (channel, idempotency_key),
  UNIQUE (pool_id, id),
  FOREIGN KEY (order_id, seat_id)
    REFERENCES business_v2.student_enrollment_seats(order_id, id),
  CHECK (seat_id IS NULL OR order_id IS NOT NULL),
  CHECK (created_at < expires_at),
  CHECK (created_at <= updated_at),
  CHECK (channel <> 'manual' OR reason IS NOT NULL),
  CHECK (channel <> 'waitlist_offer' OR reason = 'waitlist_offer'),
  CHECK (
    (channel = 'checkout' AND expires_at <= created_at + interval '30 minutes')
    OR
    (channel IN ('manual', 'waitlist_offer') AND expires_at <= created_at + interval '7 days')
  )
);
CREATE INDEX academy_capacity_reservations_live_idx
  ON business_v2.academy_capacity_reservations (pool_id, expires_at, id)
  WHERE state = 'held';

CREATE TABLE business_v2.academy_waitlist_entries (
  id bigserial PRIMARY KEY,
  entry_key text NOT NULL UNIQUE
    CHECK (entry_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  pool_id bigint NOT NULL REFERENCES business_v2.academy_seat_pools(id),
  offer_key text NOT NULL
    CHECK (offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  catalog_revision integer NOT NULL CHECK (catalog_revision > 0),
  participant_party_id bigint REFERENCES business_v2.parties(id),
  contact_reference_sha256 text NOT NULL
    CHECK (contact_reference_sha256 ~ '^[0-9a-f]{64}$'),
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  state text NOT NULL CHECK (state IN (
    'waiting', 'offered', 'accepted', 'enrolled',
    'withdrawn', 'ineligible', 'expired'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  joined_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (pool_id, sequence_number),
  UNIQUE (pool_id, id),
  CHECK (joined_at <= updated_at)
);
CREATE UNIQUE INDEX academy_waitlist_entries_active_contact_uniq
  ON business_v2.academy_waitlist_entries (pool_id, contact_reference_sha256)
  WHERE state IN ('waiting', 'offered', 'accepted');
CREATE INDEX academy_waitlist_entries_fifo_idx
  ON business_v2.academy_waitlist_entries
  (pool_id, joined_at, sequence_number, id)
  WHERE state = 'waiting';

CREATE TABLE business_v2.academy_waitlist_offers (
  id bigserial PRIMARY KEY,
  waitlist_offer_key text NOT NULL UNIQUE
    CHECK (waitlist_offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  entry_id bigint NOT NULL REFERENCES business_v2.academy_waitlist_entries(id),
  pool_id bigint NOT NULL REFERENCES business_v2.academy_seat_pools(id),
  reservation_id bigint NOT NULL UNIQUE
    REFERENCES business_v2.academy_capacity_reservations(id),
  state text NOT NULL CHECK (state IN (
    'staged', 'approved', 'sent', 'accepted', 'converted',
    'declined', 'expired', 'cancelled'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  expires_at timestamptz NOT NULL,
  approval_evidence_sha256 text
    CHECK (approval_evidence_sha256 IS NULL OR approval_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  delivery_receipt_sha256 text
    CHECK (delivery_receipt_sha256 IS NULL OR delivery_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (created_at < expires_at),
  CHECK (created_at <= updated_at),
  CHECK (state NOT IN ('approved', 'sent', 'accepted', 'converted') OR approval_evidence_sha256 IS NOT NULL),
  CHECK (state <> 'sent' OR delivery_receipt_sha256 IS NOT NULL),
  FOREIGN KEY (pool_id, entry_id)
    REFERENCES business_v2.academy_waitlist_entries(pool_id, id),
  FOREIGN KEY (pool_id, reservation_id)
    REFERENCES business_v2.academy_capacity_reservations(pool_id, id)
);
CREATE UNIQUE INDEX academy_waitlist_offers_one_active_pool_uniq
  ON business_v2.academy_waitlist_offers (pool_id)
  WHERE state IN ('staged', 'approved', 'sent', 'accepted');

CREATE TABLE business_v2.academy_capacity_events (
  id bigserial PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (char_length(event_key) BETWEEN 1 AND 500),
  subject_type text NOT NULL CHECK (subject_type IN (
    'delivery_block', 'seat_pool', 'offer_mapping', 'reservation',
    'assignment', 'waitlist_entry', 'waitlist_offer'
  )),
  subject_key text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 300),
  previous_version integer CHECK (previous_version IS NULL OR previous_version >= 0),
  new_version integer NOT NULL CHECK (new_version >= 0),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (subject_type, subject_key, new_version),
  CHECK (previous_version IS NULL OR new_version = previous_version + 1)
);

ALTER TABLE business_v2.student_class_assignments
  ADD CONSTRAINT student_class_assignments_delivery_block_fk
  FOREIGN KEY (delivery_block_key)
  REFERENCES business_v2.academy_delivery_blocks(delivery_block_key)
  NOT VALID;

CREATE UNIQUE INDEX student_class_assignments_current_enrollment_block_uniq
  ON business_v2.student_class_assignments (enrollment_id, delivery_block_key)
  WHERE state IN ('pending', 'active');

CREATE TRIGGER academy_capacity_events_append_only
  BEFORE UPDATE OR DELETE ON business_v2.academy_capacity_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

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
  GREATEST(
    0,
    sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0)
  ) AS available,
  COALESCE(wc.waitlist_count, 0) AS waitlist_count,
  CASE
    WHEN sp.operational_state = 'closed' THEN 'closed'
    WHEN sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0) <= 0
      THEN 'sold_out'
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

COMMENT ON VIEW business_v2.v_academy_seat_pool_occupancy IS
  'Aggregate-only Academy capacity projection. Pending and active assignments consume seats; only unexpired held reservations are reserved.';

DO $$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'academy_delivery_blocks', 'academy_seat_pools',
    'academy_seat_pool_offers', 'academy_capacity_reservations',
    'academy_waitlist_entries', 'academy_waitlist_offers',
    'academy_capacity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE business_v2.%I OWNER TO nanoclaw_admin', object_name);
    EXECUTE format('REVOKE ALL ON business_v2.%I FROM PUBLIC', object_name);
    EXECUTE format('GRANT ALL ON business_v2.%I TO nanoclaw_admin', object_name);
  END LOOP;
  ALTER VIEW business_v2.v_academy_seat_pool_occupancy OWNER TO nanoclaw_admin;
  REVOKE ALL ON business_v2.v_academy_seat_pool_occupancy FROM PUBLIC;
  GRANT ALL ON business_v2.v_academy_seat_pool_occupancy TO nanoclaw_admin;
END $$;

DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'academy_delivery_blocks_id_seq', 'academy_seat_pools_id_seq',
    'academy_seat_pool_offers_id_seq', 'academy_capacity_reservations_id_seq',
    'academy_waitlist_entries_id_seq', 'academy_waitlist_offers_id_seq',
    'academy_capacity_events_id_seq'
  ] LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin', sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC', sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE business_v2.%I TO nanoclaw_admin', sequence_name);
  END LOOP;
END $$;

COMMIT;
