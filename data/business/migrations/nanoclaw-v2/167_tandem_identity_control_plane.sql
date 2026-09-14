-- 167_tandem_identity_control_plane.sql
-- Tandem Identity D1: admin-only, unwired persistence contracts.
-- This migration cannot dispatch provider writes or materialize a Party.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.party_external_refs
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE business_v2.party_context_adapter_registrations
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_entity_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS identity_event_types text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'business_v2.party_external_refs'::regclass
       AND conname = 'party_external_refs_environment_chk'
  ) THEN
    ALTER TABLE business_v2.party_external_refs
      ADD CONSTRAINT party_external_refs_environment_chk
      CHECK (environment IN ('development', 'test', 'production', 'legacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'business_v2.party_context_adapter_registrations'::regclass
       AND conname = 'party_context_adapter_environment_chk'
  ) THEN
    ALTER TABLE business_v2.party_context_adapter_registrations
      ADD CONSTRAINT party_context_adapter_environment_chk
      CHECK (environment IN ('development', 'test', 'production', 'legacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'business_v2.party_context_adapter_registrations'::regclass
       AND conname = 'party_context_adapter_effective_time_chk'
  ) THEN
    ALTER TABLE business_v2.party_context_adapter_registrations
      ADD CONSTRAINT party_context_adapter_effective_time_chk
      CHECK (retired_at IS NULL OR accepted_at IS NOT NULL AND accepted_at <= retired_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'business_v2.party_context_adapter_registrations'::regclass
       AND conname = 'party_context_adapter_identity_declarations_chk'
  ) THEN
    ALTER TABLE business_v2.party_context_adapter_registrations
      ADD CONSTRAINT party_context_adapter_identity_declarations_chk
      CHECK (
        cardinality(identity_entity_types) <= 100 AND
        cardinality(identity_event_types) <= 200 AND
        octet_length(to_jsonb(identity_entity_types)::text) <= 8192 AND
        octet_length(to_jsonb(identity_event_types)::text) <= 16384
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS party_external_refs_environment_identity_uniq
  ON business_v2.party_external_refs
    (provider, environment, source_scope, entity_type, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS party_context_adapter_environment_uniq
  ON business_v2.party_context_adapter_registrations
    (adapter_key, adapter_version, environment, source_scope);

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_sha256(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT encode(sha256(convert_to(value, 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'tandem identity evidence is append-only';
END;
$$;

CREATE TABLE IF NOT EXISTS business_v2.identity_event_receipts (
  id                         bigserial PRIMARY KEY,
  receipt_uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  adapter_registration_id    bigint NOT NULL REFERENCES
                               business_v2.party_context_adapter_registrations(id),
  provider                   text NOT NULL CHECK (
                               provider ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (
                               char_length(source_scope) BETWEEN 1 AND 160
                             ),
  entity_type                text NOT NULL CHECK (
                               entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  external_id                text NOT NULL CHECK (
                               char_length(external_id) BETWEEN 1 AND 500
                             ),
  event_type                 text NOT NULL CHECK (
                               event_type ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  provider_event_id          text CHECK (
                               provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 500
                             ),
  deduplication_key          text NOT NULL CHECK (
                               char_length(deduplication_key) BETWEEN 1 AND 500
                             ),
  payload_sha256             text NOT NULL CHECK (
                               payload_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  protected_payload_ref      text CHECK (
                               protected_payload_ref IS NULL OR char_length(protected_payload_ref) <= 1000
                             ),
  authenticity_status        text NOT NULL CHECK (
                               authenticity_status IN ('authenticated', 'unverified_hint', 'rejected_authenticity')
                             ),
  verification_method        text NOT NULL CHECK (
                               verification_method ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  normalization_status       text NOT NULL CHECK (
                               normalization_status IN (
                                 'durably_stored', 'normalized', 'rejected_schema',
                                 'staged', 'held', 'ignored_stale'
                               )
                             ),
  schema_version             integer NOT NULL CHECK (schema_version > 0),
  api_version                text CHECK (
                               api_version IS NULL OR char_length(api_version) <= 100
                             ),
  source_effective_at        timestamptz,
  received_at                timestamptz NOT NULL,
  relay_identity_sha256      text NOT NULL CHECK (
                               relay_identity_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_event_receipts_auth_normalization_chk CHECK (
    authenticity_status = 'authenticated' OR normalization_status IN (
      'durably_stored', 'rejected_schema', 'held'
    )
  ),
  CONSTRAINT identity_event_receipts_idempotency_uniq UNIQUE (
    provider, environment, source_scope, deduplication_key, payload_sha256
  )
);

CREATE INDEX IF NOT EXISTS identity_event_receipts_scope_idx
  ON business_v2.identity_event_receipts
    (provider, environment, source_scope, received_at DESC);

CREATE TABLE IF NOT EXISTS business_v2.identity_event_related_refs (
  id                         bigserial PRIMARY KEY,
  receipt_id                 bigint NOT NULL REFERENCES
                               business_v2.identity_event_receipts(id),
  ref_index                  integer NOT NULL CHECK (ref_index >= 0 AND ref_index <= 99),
  provider                   text NOT NULL CHECK (
                               provider ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (
                               char_length(source_scope) BETWEEN 1 AND 160
                             ),
  entity_type                text NOT NULL CHECK (
                               entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  external_id                text NOT NULL CHECK (
                               char_length(external_id) BETWEEN 1 AND 500
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, ref_index),
  UNIQUE (receipt_id, provider, environment, source_scope, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS business_v2.identity_candidates (
  id                         bigserial PRIMARY KEY,
  candidate_uuid             uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  subject_sha256             text NOT NULL CHECK (subject_sha256 ~ '^[0-9a-f]{64}$'),
  provider                   text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,127}$'),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  entity_type                text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
  external_id_sha256         text NOT NULL CHECK (external_id_sha256 ~ '^[0-9a-f]{64}$'),
  candidate_version          integer NOT NULL CHECK (candidate_version > 0),
  status                     text NOT NULL CHECK (
                               status IN (
                                 'open', 'evidence_pending', 'claim_available',
                                 'accepted', 'rejected', 'expired', 'superseded'
                               )
                             ),
  creation_basis             text NOT NULL CHECK (
                               creation_basis IN (
                                 'none', 'verified_tandem_registration',
                                 'explicit_purchase_seat', 'accepted_invitation_claim',
                                 'operator_approved_decision'
                               )
                             ),
  party_materialization_allowed boolean NOT NULL DEFAULT false,
  evidence_sha256            text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  first_seen_at              timestamptz NOT NULL,
  last_observed_at           timestamptz NOT NULL,
  valid_until                timestamptz,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_candidates_time_chk CHECK (
    first_seen_at <= last_observed_at AND
    (valid_until IS NULL OR first_seen_at <= valid_until)
  ),
  CONSTRAINT identity_candidates_materialization_chk CHECK (
    NOT party_materialization_allowed OR
    status = 'accepted' AND creation_basis IN (
      'verified_tandem_registration', 'explicit_purchase_seat',
      'accepted_invitation_claim', 'operator_approved_decision'
    )
  ),
  UNIQUE (
    provider, environment, source_scope, entity_type, external_id_sha256,
    candidate_version
  )
);

CREATE TABLE IF NOT EXISTS business_v2.auth_accounts (
  id                         bigserial PRIMARY KEY,
  issuer                     text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 500),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  subject                    text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 500),
  account_version            integer NOT NULL CHECK (account_version > 0),
  party_id                   bigint REFERENCES business_v2.parties(id),
  account_state              text NOT NULL CHECK (
                               account_state IN ('observed', 'accepted', 'disabled', 'deleted')
                             ),
  binding_basis              text NOT NULL CHECK (
                               binding_basis IN ('none', 'auth_subject', 'accepted_claim', 'operator_decision')
                             ),
  source_receipt_id          bigint NOT NULL REFERENCES business_v2.identity_event_receipts(id),
  source_effective_at        timestamptz,
  last_observed_at           timestamptz NOT NULL,
  last_verified_at           timestamptz,
  valid_from                 timestamptz NOT NULL,
  valid_until                timestamptz,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_binding_chk CHECK (
    (account_state = 'accepted' AND party_id IS NOT NULL AND binding_basis <> 'none') OR
    (account_state <> 'accepted' AND binding_basis = 'none')
  ),
  CONSTRAINT auth_accounts_time_chk CHECK (
    valid_until IS NULL OR valid_from <= valid_until
  ),
  UNIQUE (issuer, environment, source_scope, subject, account_version)
);

CREATE TABLE IF NOT EXISTS business_v2.identity_resolution_decisions (
  id                         bigserial PRIMARY KEY,
  decision_uuid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provider                   text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,127}$'),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  entity_type                text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
  external_id_sha256         text NOT NULL CHECK (external_id_sha256 ~ '^[0-9a-f]{64}$'),
  result                     text NOT NULL CHECK (
                               result IN (
                                 'resolved_exact_reference', 'resolved_merge_lineage',
                                 'resolved_auth_subject', 'resolved_claim_or_operation',
                                 'staged_candidate', 'ambiguous', 'not_found',
                                 'conflict', 'ignored_stale'
                               )
                             ),
  resolution_basis           text CHECK (
                               resolution_basis IS NULL OR resolution_basis IN (
                                 'exact_external_reference', 'accepted_merge_lineage',
                                 'accepted_auth_subject', 'accepted_claim',
                                 'tandem_operation_correlation'
                               )
                             ),
  party_id                   bigint REFERENCES business_v2.parties(id),
  candidate_id               bigint REFERENCES business_v2.identity_candidates(id),
  evidence_refs              jsonb NOT NULL CHECK (
                               jsonb_typeof(evidence_refs) = 'array' AND
                               jsonb_array_length(evidence_refs) BETWEEN 1 AND 100 AND
                               octet_length(evidence_refs::text) <= 16384
                             ),
  evidence_sha256            text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code                text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,99}$'),
  decided_at                 timestamptz NOT NULL,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_resolution_target_chk CHECK (
    (result IN (
       'resolved_exact_reference', 'resolved_merge_lineage',
       'resolved_auth_subject', 'resolved_claim_or_operation'
     ) AND party_id IS NOT NULL AND candidate_id IS NULL AND resolution_basis IS NOT NULL) OR
    (result = 'staged_candidate' AND party_id IS NULL AND candidate_id IS NOT NULL
      AND resolution_basis IS NULL) OR
    (result IN ('ambiguous', 'not_found', 'conflict') AND party_id IS NULL
      AND candidate_id IS NULL AND resolution_basis IS NULL) OR
    (result = 'ignored_stale' AND party_id IS NULL AND candidate_id IS NULL
      AND resolution_basis IS NULL)
  ),
  CONSTRAINT identity_resolution_basis_chk CHECK (
    (result = 'resolved_exact_reference' AND resolution_basis = 'exact_external_reference') OR
    (result = 'resolved_merge_lineage' AND resolution_basis = 'accepted_merge_lineage') OR
    (result = 'resolved_auth_subject' AND resolution_basis = 'accepted_auth_subject') OR
    (result = 'resolved_claim_or_operation' AND resolution_basis IN (
      'accepted_claim', 'tandem_operation_correlation'
    )) OR
    (result NOT IN (
      'resolved_exact_reference', 'resolved_merge_lineage',
      'resolved_auth_subject', 'resolved_claim_or_operation'
    ) AND resolution_basis IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS identity_resolution_decisions_scope_idx
  ON business_v2.identity_resolution_decisions
    (provider, environment, source_scope, decided_at DESC);

CREATE TABLE IF NOT EXISTS business_v2.provider_desired_projections (
  id                         bigserial PRIMARY KEY,
  provider                   text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,127}$'),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  entity_type                text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
  external_id                text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 500),
  managed_object_key         text NOT NULL CHECK (char_length(managed_object_key) BETWEEN 1 AND 500),
  projection_key             text NOT NULL CHECK (projection_key ~ '^[0-9a-f]{64}$'),
  desired_version            integer NOT NULL CHECK (desired_version > 0),
  managed_fields             jsonb NOT NULL CHECK (
                               jsonb_typeof(managed_fields) = 'object' AND
                               octet_length(managed_fields::text) <= 16384
                             ),
  projection_sha256          text NOT NULL CHECK (projection_sha256 ~ '^[0-9a-f]{64}$'),
  source_authority_versions  jsonb NOT NULL CHECK (
                               jsonb_typeof(source_authority_versions) = 'object' AND
                               octet_length(source_authority_versions::text) <= 8192
                             ),
  source_effective_at        timestamptz,
  last_observed_at           timestamptz NOT NULL,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, source_scope, projection_key, desired_version)
);

CREATE TABLE IF NOT EXISTS business_v2.provider_projection_commands (
  id                         bigserial PRIMARY KEY,
  command_uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provider                   text NOT NULL,
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL,
  projection_key             text NOT NULL CHECK (projection_key ~ '^[0-9a-f]{64}$'),
  desired_version            integer NOT NULL CHECK (desired_version > 0),
  idempotency_key            text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  status                     text NOT NULL CHECK (status IN ('simulated', 'superseded', 'blocked')),
  writes_enabled             boolean NOT NULL DEFAULT false CHECK (writes_enabled = false),
  attempt_count              integer NOT NULL DEFAULT 0 CHECK (attempt_count = 0),
  provider_operation_id      text CHECK (provider_operation_id IS NULL),
  next_attempt_at            timestamptz CHECK (next_attempt_at IS NULL),
  reason_code                text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,99}$'),
  source_effective_at        timestamptz,
  last_observed_at           timestamptz NOT NULL,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, source_scope, projection_key, desired_version),
  FOREIGN KEY (provider, environment, source_scope, projection_key, desired_version)
    REFERENCES business_v2.provider_desired_projections
      (provider, environment, source_scope, projection_key, desired_version)
);

CREATE TABLE IF NOT EXISTS business_v2.provider_projection_attempts (
  id                         bigserial PRIMARY KEY,
  command_id                 bigint NOT NULL REFERENCES business_v2.provider_projection_commands(id),
  attempt_number             integer NOT NULL CHECK (attempt_number > 0),
  provider_operation_id      text,
  outcome                    text NOT NULL CHECK (
                               outcome IN ('accepted', 'rejected', 'uncertain', 'non_acceptance_proven')
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (command_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS business_v2.provider_projection_readbacks (
  id                         bigserial PRIMARY KEY,
  command_id                 bigint NOT NULL REFERENCES business_v2.provider_projection_commands(id),
  readback_uuid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  result                     text NOT NULL CHECK (
                               result IN ('simulated_match', 'simulated_mismatch', 'unavailable')
                             ),
  managed_fields_sha256      text CHECK (
                               managed_fields_sha256 IS NULL OR managed_fields_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  evidence_sha256            text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at                timestamptz NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_v2.provider_reconciliation_runs (
  id                         bigserial PRIMARY KEY,
  run_uuid                   uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  adapter_registration_id    bigint NOT NULL REFERENCES
                               business_v2.party_context_adapter_registrations(id),
  provider                   text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,127}$'),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  entity_set                 text NOT NULL CHECK (entity_set ~ '^[a-z][a-z0-9._-]{0,127}$'),
  run_mode                   text NOT NULL CHECK (run_mode IN ('full', 'incremental')),
  status                     text NOT NULL DEFAULT 'running' CHECK (
                               status IN ('running', 'complete', 'incomplete', 'failed')
                             ),
  complete                   boolean NOT NULL DEFAULT false,
  final_page_complete        boolean NOT NULL DEFAULT false,
  source_watermark           text,
  observed_count             integer NOT NULL DEFAULT 0 CHECK (observed_count >= 0),
  normalized_count           integer NOT NULL DEFAULT 0 CHECK (normalized_count >= 0),
  duplicate_count            integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  held_count                 integer NOT NULL DEFAULT 0 CHECK (held_count >= 0),
  snapshot_sha256            text CHECK (
                               snapshot_sha256 IS NULL OR snapshot_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  previous_snapshot_sha256   text CHECK (
                               previous_snapshot_sha256 IS NULL OR
                               previous_snapshot_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  started_at                 timestamptz NOT NULL,
  completed_at               timestamptz,
  fresh_until                timestamptz,
  last_observed_at           timestamptz NOT NULL,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_reconciliation_terminal_chk CHECK (
    (status = 'running' AND NOT complete AND completed_at IS NULL AND
      fresh_until IS NULL AND snapshot_sha256 IS NULL) OR
    (status = 'complete' AND complete AND run_mode = 'full' AND
      final_page_complete AND completed_at IS NOT NULL AND
      fresh_until IS NOT NULL AND completed_at <= fresh_until AND
      source_watermark IS NOT NULL AND snapshot_sha256 IS NOT NULL) OR
    (status IN ('incomplete', 'failed') AND NOT complete AND
      completed_at IS NOT NULL AND fresh_until IS NULL AND snapshot_sha256 IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS business_v2.provider_snapshot_items (
  id                         bigserial PRIMARY KEY,
  run_id                     bigint NOT NULL REFERENCES business_v2.provider_reconciliation_runs(id),
  provider                   text NOT NULL,
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL,
  entity_type                text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
  external_id                text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 500),
  fact_type                  text NOT NULL CHECK (fact_type ~ '^[a-z][a-z0-9_.-]{0,127}@[1-9][0-9]*$'),
  source_version             text NOT NULL CHECK (char_length(source_version) BETWEEN 1 AND 200),
  fact_sha256                text NOT NULL CHECK (fact_sha256 ~ '^[0-9a-f]{64}$'),
  item_state                 text NOT NULL CHECK (item_state IN ('normalized', 'held')),
  source_effective_at        timestamptz,
  observed_at                timestamptz NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, provider, environment, source_scope, entity_type, external_id, fact_type)
);

CREATE TABLE IF NOT EXISTS business_v2.provider_drift_items (
  id                         bigserial PRIMARY KEY,
  drift_uuid                 uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provider                   text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._-]{0,127}$'),
  environment                text NOT NULL CHECK (
                               environment IN ('development', 'test', 'production', 'legacy')
                             ),
  source_scope               text NOT NULL CHECK (char_length(source_scope) BETWEEN 1 AND 160),
  entity_type                text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9._-]{0,127}$'),
  external_id_sha256         text NOT NULL CHECK (external_id_sha256 ~ '^[0-9a-f]{64}$'),
  drift_class                text NOT NULL CHECK (
                               drift_class IN (
                                 'missing_managed_state', 'dropped_event', 'stale_event',
                                 'unknown_reference', 'identity_collision', 'test_live_collision',
                                 'payer_learner_conflict', 'unexpected_access',
                                 'provider_unreadable', 'snapshot_incomplete'
                               )
                             ),
  severity                   text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  absence_based              boolean NOT NULL DEFAULT false,
  reconciliation_run_id      bigint REFERENCES business_v2.provider_reconciliation_runs(id),
  decision_at                timestamptz NOT NULL,
  repair_eligibility         text NOT NULL CHECK (
                               repair_eligibility IN ('none', 'simulated', 'blocked')
                             ),
  owner_group                text NOT NULL CHECK (owner_group ~ '^[a-z][a-z0-9_-]{0,99}$'),
  status                     text NOT NULL CHECK (status IN ('open', 'held', 'verified_absent', 'superseded')),
  evidence_sha256            text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  source_effective_at        timestamptz,
  last_observed_at           timestamptz NOT NULL,
  retention_policy_version   integer NOT NULL CHECK (retention_policy_version > 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_action_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_drift_absence_reference_chk CHECK (
    (absence_based AND reconciliation_run_id IS NOT NULL) OR
    (NOT absence_based)
  )
);

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_event_receipt_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  manifest business_v2.party_context_adapter_registrations%ROWTYPE;
BEGIN
  SELECT * INTO manifest
    FROM business_v2.party_context_adapter_registrations
   WHERE id = NEW.adapter_registration_id;
  IF NOT FOUND OR manifest.source_system <> NEW.provider
     OR manifest.environment <> NEW.environment
     OR manifest.source_scope <> NEW.source_scope
     OR manifest.conformance_status <> 'passed'
     OR NOT NEW.entity_type = ANY(manifest.identity_entity_types)
     OR NOT NEW.event_type = ANY(manifest.identity_event_types)
     OR manifest.accepted_at IS NULL
     OR manifest.accepted_at > NEW.received_at
     OR manifest.retired_at IS NOT NULL AND NEW.received_at >= manifest.retired_at
  THEN
    RAISE EXCEPTION 'tandem identity receipt manifest mismatch or not effective';
  END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.identity_event_receipts prior
     WHERE prior.provider = NEW.provider
       AND prior.environment = NEW.environment
       AND prior.source_scope = NEW.source_scope
       AND prior.deduplication_key = NEW.deduplication_key
       AND prior.payload_sha256 <> NEW.payload_sha256
  ) THEN
    RAISE EXCEPTION 'tandem identity receipt deduplication hash conflict';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_store_event_receipt(
  target_adapter_registration_id bigint,
  target_provider text,
  target_environment text,
  target_source_scope text,
  target_entity_type text,
  target_external_id text,
  target_event_type text,
  target_provider_event_id text,
  target_deduplication_key text,
  target_payload_sha256 text,
  target_protected_payload_ref text,
  target_authenticity_status text,
  target_verification_method text,
  target_normalization_status text,
  target_schema_version integer,
  target_api_version text,
  target_source_effective_at timestamptz,
  target_received_at timestamptz,
  target_relay_identity_sha256 text,
  target_retention_policy_version integer
)
RETURNS TABLE(stored_receipt_id bigint, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH accepted AS (
    INSERT INTO business_v2.identity_event_receipts (
      adapter_registration_id, provider, environment, source_scope,
      entity_type, external_id, event_type, provider_event_id,
      deduplication_key, payload_sha256, protected_payload_ref,
      authenticity_status, verification_method, normalization_status,
      schema_version, api_version, source_effective_at, received_at,
      relay_identity_sha256, retention_policy_version
    ) VALUES (
      target_adapter_registration_id, target_provider, target_environment,
      target_source_scope, target_entity_type, target_external_id,
      target_event_type, target_provider_event_id, target_deduplication_key,
      target_payload_sha256, target_protected_payload_ref,
      target_authenticity_status, target_verification_method,
      target_normalization_status, target_schema_version, target_api_version,
      target_source_effective_at, target_received_at,
      target_relay_identity_sha256, target_retention_policy_version
    )
    ON CONFLICT (
      provider, environment, source_scope, deduplication_key, payload_sha256
    ) DO NOTHING
    RETURNING id
  )
  SELECT accepted.id, true FROM accepted
  UNION ALL
  SELECT existing.id, false
    FROM business_v2.identity_event_receipts existing
   WHERE existing.provider = target_provider
     AND existing.environment = target_environment
     AND existing.source_scope = target_source_scope
     AND existing.deduplication_key = target_deduplication_key
     AND existing.payload_sha256 = target_payload_sha256
     AND NOT EXISTS (SELECT 1 FROM accepted)
   LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_reconciliation_manifest_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  manifest business_v2.party_context_adapter_registrations%ROWTYPE;
BEGIN
  SELECT * INTO manifest
    FROM business_v2.party_context_adapter_registrations
   WHERE id = NEW.adapter_registration_id;
  IF NOT FOUND OR manifest.source_system <> NEW.provider
     OR manifest.environment <> NEW.environment
     OR manifest.source_scope <> NEW.source_scope
     OR manifest.conformance_status <> 'passed'
     OR manifest.accepted_at IS NULL OR manifest.accepted_at > NEW.started_at
     OR manifest.retired_at IS NOT NULL AND NEW.started_at >= manifest.retired_at
  THEN
    RAISE EXCEPTION 'tandem identity reconciliation manifest mismatch or not effective';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_related_ref_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  primary_environment text;
BEGIN
  SELECT environment INTO primary_environment
    FROM business_v2.identity_event_receipts
   WHERE id = NEW.receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tandem identity related reference receipt missing';
  END IF;
  IF (primary_environment IN ('development', 'test')) <>
     (NEW.environment IN ('development', 'test'))
  THEN
    RAISE EXCEPTION 'tandem identity related reference environment class collision at index %',
      NEW.ref_index;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_resolution_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  IF NEW.evidence_sha256 <>
     business_v2.fn_tandem_identity_sha256(NEW.evidence_refs::text)
  THEN
    RAISE EXCEPTION 'tandem identity resolution evidence hash mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_auth_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  prior_version integer;
BEGIN
  SELECT max(account_version) INTO prior_version
    FROM business_v2.auth_accounts
   WHERE issuer = NEW.issuer AND environment = NEW.environment
     AND source_scope = NEW.source_scope AND subject = NEW.subject;
  IF NEW.account_version <> COALESCE(prior_version, 0) + 1 THEN
    RAISE EXCEPTION 'tandem identity auth account version is not monotonic';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_candidate_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  prior_version integer;
  prior_status text;
BEGIN
  SELECT candidate_version, status INTO prior_version, prior_status
    FROM business_v2.identity_candidates
   WHERE provider = NEW.provider AND environment = NEW.environment
     AND source_scope = NEW.source_scope AND entity_type = NEW.entity_type
     AND external_id_sha256 = NEW.external_id_sha256
   ORDER BY candidate_version DESC
   LIMIT 1;
  IF prior_version IS NULL THEN
    IF NEW.candidate_version <> 1 OR NEW.status <> 'open' THEN
      RAISE EXCEPTION 'tandem identity candidate must begin open at version 1';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.candidate_version <> prior_version + 1 THEN
    RAISE EXCEPTION 'tandem identity candidate version is not monotonic';
  END IF;
  IF NOT (
    (prior_status = 'open' AND NEW.status IN (
      'evidence_pending', 'rejected', 'expired', 'superseded'
    )) OR
    (prior_status = 'evidence_pending' AND NEW.status IN (
      'claim_available', 'rejected', 'expired', 'superseded'
    )) OR
    (prior_status = 'claim_available' AND NEW.status IN (
      'accepted', 'rejected', 'expired', 'superseded'
    ))
  ) THEN
    RAISE EXCEPTION 'tandem identity candidate transition is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_projection_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  expected_key text;
  prior_version integer;
BEGIN
  expected_key := business_v2.fn_tandem_identity_sha256(
    concat_ws(E'\x1f', NEW.provider, NEW.environment, NEW.source_scope,
      NEW.entity_type, NEW.external_id, NEW.managed_object_key)
  );
  IF NEW.projection_key <> expected_key THEN
    RAISE EXCEPTION 'tandem identity projection key mismatch';
  END IF;
  IF NEW.projection_sha256 <>
     business_v2.fn_tandem_identity_sha256(NEW.managed_fields::text)
  THEN
    RAISE EXCEPTION 'tandem identity projection hash mismatch';
  END IF;
  SELECT max(desired_version) INTO prior_version
    FROM business_v2.provider_desired_projections
   WHERE provider = NEW.provider AND environment = NEW.environment
     AND source_scope = NEW.source_scope AND projection_key = NEW.projection_key;
  IF NEW.desired_version <> COALESCE(prior_version, 0) + 1 THEN
    RAISE EXCEPTION 'tandem identity desired projection version is not monotonic';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_command_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  expected_key text;
BEGIN
  expected_key := business_v2.fn_tandem_identity_sha256(
    concat_ws(E'\x1f', NEW.provider, NEW.environment, NEW.source_scope,
      NEW.projection_key, NEW.desired_version::text, 'stage-d-shadow-v1')
  );
  IF NEW.idempotency_key <> expected_key THEN
    RAISE EXCEPTION 'tandem identity command idempotency key mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_attempt_prohibited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'tandem identity shadow provider attempts are prohibited';
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_snapshot_item_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  parent business_v2.provider_reconciliation_runs%ROWTYPE;
BEGIN
  SELECT * INTO parent
    FROM business_v2.provider_reconciliation_runs
   WHERE id = NEW.run_id
   FOR SHARE;
  IF NOT FOUND OR parent.status <> 'running' THEN
    RAISE EXCEPTION 'tandem identity snapshot run is not open';
  END IF;
  IF ROW(parent.provider, parent.environment, parent.source_scope)
     IS DISTINCT FROM ROW(NEW.provider, NEW.environment, NEW.source_scope)
  THEN
    RAISE EXCEPTION 'tandem identity snapshot item scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_reconciliation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  actual_count integer;
  actual_held integer;
  actual_hash text;
BEGIN
  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'tandem identity reconciliation run is terminal';
  END IF;
  IF NEW.status = 'running' THEN
    RAISE EXCEPTION 'tandem identity reconciliation run update must terminalize';
  END IF;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE item_state = 'held')::integer,
         business_v2.fn_tandem_identity_sha256(
           concat_ws(E'\x1e', COALESCE(NEW.source_watermark, ''), COALESCE(
             string_agg(
               concat_ws(E'\x1f', provider, environment, source_scope,
                 entity_type, external_id, fact_type, source_version, fact_sha256),
               E'\n' ORDER BY provider, environment, source_scope,
                 entity_type, external_id, fact_type, source_version, fact_sha256, id
             ), ''
           ))
         )
    INTO actual_count, actual_held, actual_hash
    FROM business_v2.provider_snapshot_items
   WHERE run_id = NEW.id;
  IF NEW.status = 'complete' AND (
       NOT NEW.complete OR NEW.run_mode <> 'full' OR NOT NEW.final_page_complete
       OR NEW.source_watermark IS NULL
       OR NEW.observed_count <> actual_count
       OR NEW.normalized_count <> actual_count - actual_held
       OR NEW.held_count <> actual_held
       OR NEW.duplicate_count <> 0
       OR NEW.snapshot_sha256 IS DISTINCT FROM actual_hash
     )
  THEN
    RAISE EXCEPTION 'tandem identity complete snapshot integrity mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_finalize_reconciliation_run(
  target_run_id bigint,
  target_watermark text,
  target_completed_at timestamptz,
  target_fresh_until timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  item_count integer;
  computed_held_count integer;
  computed_hash text;
BEGIN
  IF target_watermark IS NULL OR target_watermark = '' OR
     target_completed_at IS NULL OR target_fresh_until IS NULL OR
     target_completed_at > target_fresh_until
  THEN
    RAISE EXCEPTION 'tandem identity reconciliation finalization input invalid';
  END IF;
  PERFORM 1 FROM business_v2.provider_reconciliation_runs
   WHERE id = target_run_id AND status = 'running' AND run_mode = 'full'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tandem identity reconciliation run is not finalizable';
  END IF;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE item_state = 'held')::integer,
         business_v2.fn_tandem_identity_sha256(
           concat_ws(E'\x1e', target_watermark, COALESCE(
             string_agg(
               concat_ws(E'\x1f', provider, environment, source_scope,
                 entity_type, external_id, fact_type, source_version, fact_sha256),
               E'\n' ORDER BY provider, environment, source_scope,
                 entity_type, external_id, fact_type, source_version, fact_sha256, id
             ), ''
           ))
         )
    INTO item_count, computed_held_count, computed_hash
    FROM business_v2.provider_snapshot_items
   WHERE run_id = target_run_id;
  UPDATE business_v2.provider_reconciliation_runs
     SET status = 'complete', complete = true, final_page_complete = true,
         source_watermark = target_watermark,
         observed_count = item_count,
         normalized_count = item_count - computed_held_count,
         duplicate_count = 0, held_count = computed_held_count,
         snapshot_sha256 = computed_hash,
         completed_at = target_completed_at, fresh_until = target_fresh_until,
         updated_at = now(), last_action_at = now()
   WHERE id = target_run_id;
  RETURN computed_hash;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_tandem_identity_drift_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  run business_v2.provider_reconciliation_runs%ROWTYPE;
BEGIN
  IF NOT NEW.absence_based THEN
    RETURN NEW;
  END IF;
  SELECT * INTO run FROM business_v2.provider_reconciliation_runs
   WHERE id = NEW.reconciliation_run_id;
  IF NOT FOUND OR run.run_mode <> 'full' OR run.status <> 'complete'
     OR NOT run.complete OR NOT run.final_page_complete
     OR ROW(run.provider, run.environment, run.source_scope)
        IS DISTINCT FROM ROW(NEW.provider, NEW.environment, NEW.source_scope)
     OR run.completed_at > NEW.decision_at OR NEW.decision_at > run.fresh_until
  THEN
    RAISE EXCEPTION 'tandem identity absence requires matching complete fresh snapshot';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identity_event_receipts_guard ON business_v2.identity_event_receipts;
CREATE TRIGGER identity_event_receipts_guard
  BEFORE INSERT ON business_v2.identity_event_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_event_receipt_guard();
DROP TRIGGER IF EXISTS identity_event_receipts_immutable ON business_v2.identity_event_receipts;
CREATE TRIGGER identity_event_receipts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.identity_event_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS identity_event_related_refs_guard ON business_v2.identity_event_related_refs;
CREATE TRIGGER identity_event_related_refs_guard
  BEFORE INSERT ON business_v2.identity_event_related_refs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_related_ref_guard();
DROP TRIGGER IF EXISTS identity_event_related_refs_immutable ON business_v2.identity_event_related_refs;
CREATE TRIGGER identity_event_related_refs_immutable
  BEFORE UPDATE OR DELETE ON business_v2.identity_event_related_refs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS identity_candidates_immutable ON business_v2.identity_candidates;
DROP TRIGGER IF EXISTS identity_candidates_version_guard ON business_v2.identity_candidates;
CREATE TRIGGER identity_candidates_version_guard
  BEFORE INSERT ON business_v2.identity_candidates
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_candidate_version_guard();
CREATE TRIGGER identity_candidates_immutable
  BEFORE UPDATE OR DELETE ON business_v2.identity_candidates
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS auth_accounts_version_guard ON business_v2.auth_accounts;
CREATE TRIGGER auth_accounts_version_guard
  BEFORE INSERT ON business_v2.auth_accounts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_auth_version_guard();
DROP TRIGGER IF EXISTS auth_accounts_immutable ON business_v2.auth_accounts;
CREATE TRIGGER auth_accounts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.auth_accounts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS identity_resolution_decisions_guard ON business_v2.identity_resolution_decisions;
CREATE TRIGGER identity_resolution_decisions_guard
  BEFORE INSERT ON business_v2.identity_resolution_decisions
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_resolution_guard();
DROP TRIGGER IF EXISTS identity_resolution_decisions_immutable ON business_v2.identity_resolution_decisions;
CREATE TRIGGER identity_resolution_decisions_immutable
  BEFORE UPDATE OR DELETE ON business_v2.identity_resolution_decisions
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_desired_projections_guard ON business_v2.provider_desired_projections;
CREATE TRIGGER provider_desired_projections_guard
  BEFORE INSERT ON business_v2.provider_desired_projections
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_projection_guard();
DROP TRIGGER IF EXISTS provider_desired_projections_immutable ON business_v2.provider_desired_projections;
CREATE TRIGGER provider_desired_projections_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_desired_projections
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_projection_commands_guard ON business_v2.provider_projection_commands;
CREATE TRIGGER provider_projection_commands_guard
  BEFORE INSERT ON business_v2.provider_projection_commands
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_command_guard();
DROP TRIGGER IF EXISTS provider_projection_commands_immutable ON business_v2.provider_projection_commands;
CREATE TRIGGER provider_projection_commands_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_projection_commands
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_projection_attempts_prohibited ON business_v2.provider_projection_attempts;
CREATE TRIGGER provider_projection_attempts_prohibited
  BEFORE INSERT ON business_v2.provider_projection_attempts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_attempt_prohibited();
DROP TRIGGER IF EXISTS provider_projection_attempts_immutable ON business_v2.provider_projection_attempts;
CREATE TRIGGER provider_projection_attempts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_projection_attempts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_projection_readbacks_immutable ON business_v2.provider_projection_readbacks;
CREATE TRIGGER provider_projection_readbacks_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_projection_readbacks
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_reconciliation_runs_manifest_guard ON business_v2.provider_reconciliation_runs;
CREATE TRIGGER provider_reconciliation_runs_manifest_guard
  BEFORE INSERT ON business_v2.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_reconciliation_manifest_guard();
DROP TRIGGER IF EXISTS provider_reconciliation_runs_transition ON business_v2.provider_reconciliation_runs;
CREATE TRIGGER provider_reconciliation_runs_transition
  BEFORE UPDATE ON business_v2.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_reconciliation_transition();
DROP TRIGGER IF EXISTS provider_reconciliation_runs_no_delete ON business_v2.provider_reconciliation_runs;
CREATE TRIGGER provider_reconciliation_runs_no_delete
  BEFORE DELETE ON business_v2.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_snapshot_items_guard ON business_v2.provider_snapshot_items;
CREATE TRIGGER provider_snapshot_items_guard
  BEFORE INSERT ON business_v2.provider_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_snapshot_item_guard();
DROP TRIGGER IF EXISTS provider_snapshot_items_immutable ON business_v2.provider_snapshot_items;
CREATE TRIGGER provider_snapshot_items_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

DROP TRIGGER IF EXISTS provider_drift_items_guard ON business_v2.provider_drift_items;
CREATE TRIGGER provider_drift_items_guard
  BEFORE INSERT ON business_v2.provider_drift_items
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_drift_guard();
DROP TRIGGER IF EXISTS provider_drift_items_immutable ON business_v2.provider_drift_items;
CREATE TRIGGER provider_drift_items_immutable
  BEFORE UPDATE OR DELETE ON business_v2.provider_drift_items
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_tandem_identity_append_only();

CREATE OR REPLACE VIEW business_v2.v_tandem_identity_shadow_health AS
SELECT
  (SELECT count(*) FROM business_v2.identity_event_receipts) AS receipt_count,
  (SELECT count(*) FROM business_v2.identity_candidates) AS candidate_count,
  (SELECT count(*) FROM business_v2.identity_resolution_decisions) AS decision_count,
  (SELECT count(*) FROM business_v2.provider_desired_projections) AS desired_projection_count,
  (SELECT count(*) FROM business_v2.provider_projection_commands WHERE status = 'blocked') AS blocked_command_count,
  (SELECT count(*) FROM business_v2.provider_projection_attempts) AS provider_attempt_count,
  (SELECT count(*) FROM business_v2.provider_reconciliation_runs
    WHERE status = 'complete' AND fresh_until >= now()) AS fresh_complete_run_count,
  (SELECT count(*) FROM business_v2.provider_drift_items
    WHERE status IN ('open', 'held')) AS open_drift_count;

DO $$
DECLARE
  relation_name text;
  sequence_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'identity_event_receipts', 'identity_event_related_refs',
    'identity_candidates', 'auth_accounts', 'identity_resolution_decisions',
    'provider_desired_projections', 'provider_projection_commands',
    'provider_projection_attempts', 'provider_projection_readbacks',
    'provider_reconciliation_runs', 'provider_snapshot_items',
    'provider_drift_items'
  ] LOOP
    EXECUTE format('ALTER TABLE business_v2.%I OWNER TO nanoclaw_admin', relation_name);
    EXECUTE format('REVOKE ALL ON TABLE business_v2.%I FROM PUBLIC', relation_name);
  END LOOP;
  FOR sequence_name IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'business_v2' AND c.relkind = 'S'
       AND (c.relname LIKE 'identity_%_id_seq' OR c.relname LIKE 'provider_%_id_seq')
  LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin', sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC', sequence_name);
  END LOOP;
END $$;

ALTER VIEW business_v2.v_tandem_identity_shadow_health OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.v_tandem_identity_shadow_health FROM PUBLIC;

ALTER FUNCTION business_v2.fn_tandem_identity_sha256(text) OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_append_only() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_event_receipt_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_store_event_receipt(bigint, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, integer) OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_reconciliation_manifest_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_related_ref_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_resolution_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_candidate_version_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_auth_version_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_projection_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_command_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_attempt_prohibited() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_snapshot_item_guard() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_reconciliation_transition() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_finalize_reconciliation_run(bigint, text, timestamptz, timestamptz) OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_tandem_identity_drift_guard() OWNER TO nanoclaw_admin;

REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_sha256(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_event_receipt_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_store_event_receipt(bigint, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_reconciliation_manifest_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_related_ref_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_resolution_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_candidate_version_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_auth_version_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_projection_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_command_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_attempt_prohibited() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_snapshot_item_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_reconciliation_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_finalize_reconciliation_run(bigint, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_tandem_identity_drift_guard() FROM PUBLIC;

COMMIT;
