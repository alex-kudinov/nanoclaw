-- 116_cnpc_intake_control_plane.sql
--
-- Host-owned CNPC intake, coach-roster, capacity, matching, chemistry-call,
-- engagement, and external-action state. The CNPC minion receives a bounded
-- match pool; it never receives Plutio credentials or direct table writes.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE IF NOT EXISTS business_v2.cnpc_intakes (
  id                       bigserial PRIMARY KEY,
  submission_id            text NOT NULL UNIQUE,
  webhook_inbox_id         bigint UNIQUE
                             REFERENCES business_v2.webhook_inbox(id),
  applicant_party_id       bigint NOT NULL
                             REFERENCES business_v2.parties(id),
  submitted_at             timestamptz NOT NULL,
  organization_name        text NOT NULL,
  organization_website     text,
  organization_city        text,
  organization_state       text,
  organization_type        text NOT NULL CHECK (
    organization_type IN (
      'nonprofit_501c3', 'nonprofit_other_501c', 'government',
      'for_profit', 'unsure'
    )
  ),
  operating_expense_band   text NOT NULL CHECK (
    operating_expense_band IN (
      'under_250k', '250k_to_499999', '500k_plus', 'unknown'
    )
  ),
  program_track            text NOT NULL DEFAULT 'cnpc' CHECK (
    program_track IN ('cnpc', 'eit', 'unsure')
  ),
  coaching_type            text NOT NULL CHECK (
    coaching_type IN ('individual', 'team', 'both', 'unsure')
  ),
  why_coaching             text NOT NULL,
  first_choice_coach       text,
  second_choice_coach      text,
  anything_else            text,
  lead_source              text,
  consent                  boolean NOT NULL,
  eligibility_status       text NOT NULL CHECK (
    eligibility_status IN ('eligible', 'ineligible', 'needs_review')
  ),
  individual_price_cents   integer CHECK (
    individual_price_cents IS NULL OR individual_price_cents >= 0
  ),
  team_price_cents         integer CHECK (
    team_price_cents IS NULL OR team_price_cents >= 0
  ),
  currency                 text NOT NULL DEFAULT 'USD',
  workflow_status          text NOT NULL DEFAULT 'new' CHECK (
    workflow_status IN (
      'new', 'needs_review', 'ineligible', 'matching', 'match_review',
      'match_sent', 'chemistry', 'coach_selected', 'contract_pending',
      'payment_pending', 'ready_to_begin', 'active', 'closed'
    )
  ),
  source_form_id           text NOT NULL,
  source_entry_id          text NOT NULL,
  source_payload           jsonb NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  last_updated_by          text NOT NULL DEFAULT 'cnpc:host'
);

CREATE INDEX IF NOT EXISTS cnpc_intakes_work_queue_idx
  ON business_v2.cnpc_intakes(workflow_status, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS cnpc_intakes_source_entry_idx
  ON business_v2.cnpc_intakes(source_form_id, source_entry_id);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_coaches (
  id                       bigserial PRIMARY KEY,
  applicant_party_id       bigint REFERENCES business_v2.parties(id),
  onboarding_response_id   text UNIQUE,
  display_name             text NOT NULL,
  roster_status            text NOT NULL DEFAULT 'pending' CHECK (
    roster_status IN ('pending', 'active', 'paused', 'offboarded')
  ),
  icf_credential           text,
  full_bio                 text,
  matching_summary         text,
  languages                text[] NOT NULL DEFAULT '{}',
  time_zones               text[] NOT NULL DEFAULT '{}',
  work_types               text[] NOT NULL DEFAULT '{}',
  chemistry_booking_url    text,
  public_profile_url       text,
  profile_source_updated_at timestamptz,
  last_reconciled_at       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  last_updated_by          text NOT NULL DEFAULT 'cnpc:host'
);

CREATE INDEX IF NOT EXISTS cnpc_coaches_active_idx
  ON business_v2.cnpc_coaches(roster_status, display_name);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_coach_capacity_snapshots (
  id                       bigserial PRIMARY KEY,
  coach_id                 bigint NOT NULL
                             REFERENCES business_v2.cnpc_coaches(id),
  availability_response_id text UNIQUE,
  effective_quarter        text,
  current_client_count     integer NOT NULL DEFAULT 0 CHECK (
    current_client_count >= 0
  ),
  declared_available_slots integer NOT NULL DEFAULT 0 CHECK (
    declared_available_slots >= 0
  ),
  client_progress_summary  text,
  observed_at              timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cnpc_capacity_latest_idx
  ON business_v2.cnpc_coach_capacity_snapshots(coach_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_match_runs (
  id                       bigserial PRIMARY KEY,
  intake_id                bigint NOT NULL
                             REFERENCES business_v2.cnpc_intakes(id),
  roster_version           text NOT NULL,
  prompt_version           text NOT NULL,
  model_id                 text,
  result_sha256            text NOT NULL CHECK (
    result_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status                   text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'reviewed', 'approved', 'superseded', 'failed')
  ),
  created_at               timestamptz NOT NULL DEFAULT now(),
  reviewed_at              timestamptz,
  approved_at              timestamptz,
  UNIQUE (intake_id, roster_version, prompt_version)
);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_match_candidates (
  id                       bigserial PRIMARY KEY,
  match_run_id             bigint NOT NULL
                             REFERENCES business_v2.cnpc_match_runs(id),
  coach_id                 bigint NOT NULL
                             REFERENCES business_v2.cnpc_coaches(id),
  capacity_snapshot_id     bigint
                             REFERENCES business_v2.cnpc_coach_capacity_snapshots(id),
  rank                     integer NOT NULL CHECK (rank > 0),
  fit_score                numeric(5,2) CHECK (
    fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100)
  ),
  reasons                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation_role      text NOT NULL CHECK (
    recommendation_role IN ('primary', 'alternate', 'backup')
  ),
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_run_id, coach_id),
  UNIQUE (match_run_id, rank)
);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_chemistry_calls (
  id                       bigserial PRIMARY KEY,
  intake_id                bigint NOT NULL
                             REFERENCES business_v2.cnpc_intakes(id),
  coach_id                 bigint NOT NULL
                             REFERENCES business_v2.cnpc_coaches(id),
  status                   text NOT NULL DEFAULT 'invited' CHECK (
    status IN ('invited', 'scheduled', 'completed', 'declined', 'expired')
  ),
  soft_hold_expires_at     timestamptz,
  scheduled_at             timestamptz,
  completed_at             timestamptz,
  source_thread_id         text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_id, coach_id)
);

CREATE INDEX IF NOT EXISTS cnpc_chemistry_active_holds_idx
  ON business_v2.cnpc_chemistry_calls(coach_id, soft_hold_expires_at)
  WHERE status IN ('invited', 'scheduled');

CREATE TABLE IF NOT EXISTS business_v2.cnpc_engagements (
  id                       bigserial PRIMARY KEY,
  intake_id                bigint NOT NULL UNIQUE
                             REFERENCES business_v2.cnpc_intakes(id),
  coach_id                 bigint NOT NULL
                             REFERENCES business_v2.cnpc_coaches(id),
  engagement_id            bigint UNIQUE
                             REFERENCES business_v2.engagements(id),
  contract_document_id     bigint
                             REFERENCES business_v2.documents(id),
  invoice_document_id      bigint
                             REFERENCES business_v2.documents(id),
  contract_signed_at       timestamptz,
  payment_confirmed_at     timestamptz,
  ready_to_begin_at        timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnpc_ready_requires_signed_and_paid CHECK (
    ready_to_begin_at IS NULL OR
    (contract_signed_at IS NOT NULL AND payment_confirmed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS business_v2.cnpc_action_outbox (
  id                       bigserial PRIMARY KEY,
  intake_id                bigint NOT NULL
                             REFERENCES business_v2.cnpc_intakes(id),
  action_type              text NOT NULL CHECK (
    action_type IN (
      'client_match_email', 'coach_intro_email', 'contract_draft',
      'invoice_draft', 'ready_to_begin_email', 'capacity_commit'
    )
  ),
  idempotency_key          text NOT NULL UNIQUE,
  approved_payload         jsonb NOT NULL,
  approved_payload_sha256  text NOT NULL CHECK (
    approved_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status                   text NOT NULL DEFAULT 'pending_review' CHECK (
    status IN (
      'pending_review', 'approved', 'in_flight', 'completed', 'failed',
      'cancelled'
    )
  ),
  approved_by              text,
  approved_at              timestamptz,
  external_receipt         jsonb,
  attempts                 integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW business_v2.v_cnpc_match_pool
WITH (security_barrier = true)
AS
SELECT
  c.id AS coach_id,
  c.display_name,
  c.icf_credential,
  c.matching_summary,
  c.languages,
  c.time_zones,
  c.work_types,
  c.chemistry_booking_url,
  c.public_profile_url,
  c.profile_source_updated_at,
  cap.id AS capacity_snapshot_id,
  cap.current_client_count,
  cap.declared_available_slots,
  cap.observed_at AS capacity_observed_at,
  GREATEST(
    COALESCE(cap.declared_available_slots, 0) -
    COALESCE(holds.active_holds, 0),
    0
  )::integer AS available_slots_after_holds
FROM business_v2.cnpc_coaches c
LEFT JOIN LATERAL (
  SELECT s.*
    FROM business_v2.cnpc_coach_capacity_snapshots s
   WHERE s.coach_id = c.id
   ORDER BY s.observed_at DESC, s.id DESC
   LIMIT 1
) cap ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS active_holds
    FROM business_v2.cnpc_chemistry_calls h
   WHERE h.coach_id = c.id
     AND h.status IN ('invited', 'scheduled')
     AND h.soft_hold_expires_at > now()
) holds ON true
WHERE c.roster_status = 'active'
  AND COALESCE(cap.declared_available_slots, 0) > 0
  AND GREATEST(
    COALESCE(cap.declared_available_slots, 0) -
    COALESCE(holds.active_holds, 0),
    0
  ) > 0;

REVOKE ALL ON business_v2.cnpc_intakes,
  business_v2.cnpc_coaches,
  business_v2.cnpc_coach_capacity_snapshots,
  business_v2.cnpc_match_runs,
  business_v2.cnpc_match_candidates,
  business_v2.cnpc_chemistry_calls,
  business_v2.cnpc_engagements,
  business_v2.cnpc_action_outbox
FROM PUBLIC;
REVOKE ALL ON business_v2.v_cnpc_match_pool FROM PUBLIC;

GRANT ALL ON business_v2.cnpc_intakes,
  business_v2.cnpc_coaches,
  business_v2.cnpc_coach_capacity_snapshots,
  business_v2.cnpc_match_runs,
  business_v2.cnpc_match_candidates,
  business_v2.cnpc_chemistry_calls,
  business_v2.cnpc_engagements,
  business_v2.cnpc_action_outbox
TO nanoclaw_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA business_v2 TO nanoclaw_admin;
GRANT SELECT ON business_v2.v_cnpc_match_pool TO nanoclaw_admin;

COMMIT;
