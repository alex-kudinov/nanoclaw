-- 06_programs.sql — programs, program_variants, variant_enrollments + deferred FK on engagements
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- programs — coaching programs, certifications, etc.
CREATE TABLE business_v2.programs (
  id bigserial PRIMARY KEY,
  slug citext NOT NULL UNIQUE,
  kind text NOT NULL REFERENCES business_v2.program_kinds(key),
  display_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE business_v2.programs IS 'Program catalog: certification tracks, coaching services, etc.';

-- program_variants — cohort instances, pricing tiers
CREATE TABLE business_v2.program_variants (
  id bigserial PRIMARY KEY,
  program_id bigint NOT NULL REFERENCES business_v2.programs(id),
  variant_key text NOT NULL,
  display_name text NOT NULL,
  capacity int,
  price_cents int,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX program_variants_program_key_uniq
  ON business_v2.program_variants (program_id, variant_key);

COMMENT ON TABLE business_v2.program_variants IS 'Program delivery instances with capacity and pricing.';

-- variant_enrollments — links engagements to variants
CREATE TABLE business_v2.variant_enrollments (
  id bigserial PRIMARY KEY,
  variant_id bigint NOT NULL REFERENCES business_v2.program_variants(id),
  engagement_id bigint NOT NULL REFERENCES business_v2.engagements(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX variant_enrollments_active_uniq
  ON business_v2.variant_enrollments (variant_id, engagement_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE business_v2.variant_enrollments IS 'Engagement-to-variant enrollment with seat tracking.';

-- Deferred FK: engagements.program_variant_id → program_variants
ALTER TABLE business_v2.engagements
  ADD CONSTRAINT engagements_variant_fk
  FOREIGN KEY (program_variant_id) REFERENCES business_v2.program_variants(id);

COMMIT;
