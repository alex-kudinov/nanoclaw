-- 05_engagements.sql — engagements + engagement_participants
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- program_variant_id FK added by 06_programs.sql (deferred).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- engagements — coaching packages, cohort deliveries, etc.
CREATE TABLE business_v2.engagements (
  id bigserial PRIMARY KEY,
  kind text NOT NULL REFERENCES business_v2.engagement_kinds(key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  program_variant_id bigint,  -- FK added in 06_programs.sql
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE business_v2.engagements IS 'Active service deliveries: coaching, mentoring, cohort, etc.';

-- engagement_participants — who participates in an engagement
CREATE TABLE business_v2.engagement_participants (
  id bigserial PRIMARY KEY,
  engagement_id bigint NOT NULL REFERENCES business_v2.engagements(id),
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  participant_role text NOT NULL REFERENCES business_v2.participant_roles(key),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active participation per (engagement, party, role) combo
CREATE UNIQUE INDEX engagement_participants_active_uniq
  ON business_v2.engagement_participants (engagement_id, party_id, participant_role)
  WHERE ended_at IS NULL;

COMMENT ON TABLE business_v2.engagement_participants IS 'Party participation in engagements with role and date range.';

COMMIT;
