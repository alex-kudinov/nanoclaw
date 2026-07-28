-- 10_outbox.sql — plutio_outbox + plutio_refs
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T3 (parties), T5 (engagements), T9 (documents)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- plutio_outbox — async Plutio sync queue
CREATE TABLE business_v2.plutio_outbox (
  id bigserial PRIMARY KEY,
  operation text NOT NULL REFERENCES business_v2.plutio_outbox_operations(key),
  kind text NOT NULL,
  party_id bigint REFERENCES business_v2.parties(id),
  engagement_id bigint REFERENCES business_v2.engagements(id),
  document_id bigint REFERENCES business_v2.documents(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' REFERENCES business_v2.plutio_outbox_statuses(key),
  attempts int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

-- Active dedup: prevent duplicate pending/in_flight entries
CREATE UNIQUE INDEX plutio_outbox_active_dedup
  ON business_v2.plutio_outbox (kind, party_id, operation)
  WHERE status IN ('pending', 'in_flight');

-- Reaper polling index
CREATE INDEX plutio_outbox_reaper_idx
  ON business_v2.plutio_outbox (status, created_at)
  WHERE status IN ('pending', 'failed');

COMMENT ON TABLE business_v2.plutio_outbox IS 'Async Plutio sync queue. Reaper polls pending/failed entries (Plan #2).';

-- plutio_refs — bidirectional reference map between business_v2 entities and Plutio
CREATE TABLE business_v2.plutio_refs (
  entity_type text NOT NULL,
  entity_id bigint NOT NULL,
  plutio_entity_type text NOT NULL,
  plutio_id text NOT NULL,
  plutio_url text,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE UNIQUE INDEX plutio_refs_plutio_uniq
  ON business_v2.plutio_refs (plutio_entity_type, plutio_id);

COMMENT ON TABLE business_v2.plutio_refs IS 'Bidirectional reference map: business_v2 entity ↔ Plutio entity.';

COMMIT;
