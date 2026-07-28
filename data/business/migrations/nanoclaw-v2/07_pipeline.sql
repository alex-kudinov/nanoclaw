-- 07_pipeline.sql — pipeline_entries + pipeline_stage_history
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T3 (parties), T6 (programs)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- pipeline_entries — sales pipeline tracking per party+program
CREATE TABLE business_v2.pipeline_entries (
  id bigserial PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  program_id bigint NOT NULL REFERENCES business_v2.programs(id),
  stage text NOT NULL REFERENCES business_v2.pipeline_stages(key),
  amount_cents int,
  currency text NOT NULL DEFAULT 'USD',
  dedupe_key text,
  entered_stage_at timestamptz NOT NULL DEFAULT now(),
  expected_close_date date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

-- One non-terminal entry per (party, program)
CREATE UNIQUE INDEX pipeline_one_active_per_program
  ON business_v2.pipeline_entries (party_id, program_id)
  WHERE stage NOT IN ('won', 'lost');

-- Dedupe key unique when present
CREATE UNIQUE INDEX pipeline_dedupe_key_uniq
  ON business_v2.pipeline_entries (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE business_v2.pipeline_entries IS 'Sales pipeline: one active entry per (party, program). Stage transitions recorded in history.';

-- pipeline_stage_history — audit trail of stage transitions
CREATE TABLE business_v2.pipeline_stage_history (
  id bigserial PRIMARY KEY,
  pipeline_entry_id bigint NOT NULL REFERENCES business_v2.pipeline_entries(id),
  from_stage text,
  to_stage text NOT NULL,
  transitioned_at timestamptz NOT NULL DEFAULT now(),
  transitioned_by text NOT NULL DEFAULT 'unknown',
  reason text NOT NULL DEFAULT 'unspecified',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.pipeline_stage_history IS 'Immutable audit trail of pipeline stage transitions.';
COMMENT ON COLUMN business_v2.pipeline_stage_history.reason IS 'NOT NULL with default unspecified — eliminates NULL ambiguity (ARFPF A-24).';

COMMIT;
