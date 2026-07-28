-- 08_interactions.sql — interactions + attachments
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T3 (parties), T5 (engagements)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- interactions — all party communications/touchpoints
CREATE TABLE business_v2.interactions (
  id bigserial PRIMARY KEY,
  party_id bigint REFERENCES business_v2.parties(id),
  engagement_id bigint REFERENCES business_v2.engagements(id),
  channel text NOT NULL REFERENCES business_v2.interaction_channels(key),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  subject text,
  body text,
  occurred_at timestamptz NOT NULL,
  source_provider text REFERENCES business_v2.source_providers(key),
  source_id text,
  source_thread_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

CREATE INDEX interactions_party_occurred_idx
  ON business_v2.interactions (party_id, occurred_at DESC);

CREATE INDEX interactions_source_idx
  ON business_v2.interactions (source_provider, source_id)
  WHERE source_provider IS NOT NULL;

COMMENT ON TABLE business_v2.interactions IS 'All party communications: email, meeting, call, form, booking, payment, etc.';

-- attachments — files attached to interactions
CREATE TABLE business_v2.attachments (
  id bigserial PRIMARY KEY,
  interaction_id bigint NOT NULL REFERENCES business_v2.interactions(id),
  filename text,
  mime_type text,
  size_bytes bigint,
  storage_provider text,
  storage_url text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.attachments IS 'File attachments on interactions.';

COMMIT;
