-- 137_relationship_context_dark.sql
-- Provider-neutral Relationship Context dark foundation.
-- No provider credentials, actions, minion grants, or executable Plutio outbox.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.party_external_refs (
  id                         bigserial PRIMARY KEY,
  party_id                   bigint NOT NULL REFERENCES business_v2.parties(id),
  provider                   text NOT NULL CHECK (
                               provider ~ '^[a-z][a-z0-9._-]{0,127}$'
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
  adapter_key                text NOT NULL CHECK (
                               adapter_key ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  adapter_version            text NOT NULL CHECK (
                               adapter_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
                             ),
  schema_version             integer NOT NULL CHECK (schema_version > 0),
  status                     text NOT NULL DEFAULT 'active' CHECK (
                               status IN ('active', 'inactive', 'conflicted')
                             ),
  verified_at                timestamptz,
  first_seen_at              timestamptz NOT NULL,
  last_seen_at               timestamptz NOT NULL,
  source_receipt_sha256      text NOT NULL CHECK (
                               source_receipt_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_external_refs_seen_chk CHECK (
    first_seen_at <= last_seen_at
  ),
  CONSTRAINT party_external_refs_identity_uniq UNIQUE (
    provider, source_scope, entity_type, external_id
  )
);

CREATE INDEX party_external_refs_party_idx
  ON business_v2.party_external_refs (party_id, status, provider, source_scope);

CREATE TABLE business_v2.party_identifier_claims (
  id                         bigserial PRIMARY KEY,
  party_id                   bigint NOT NULL REFERENCES business_v2.parties(id),
  identifier_kind            text NOT NULL CHECK (
                               identifier_kind IN (
                                 'provider_user_id',
                                 'verified_email_candidate',
                                 'email_candidate'
                               )
                             ),
  identifier_fingerprint     text NOT NULL CHECK (
                               identifier_fingerprint ~ '^[0-9a-f]{64}$'
                             ),
  restricted_value           text CHECK (
                               restricted_value IS NULL OR
                               char_length(restricted_value) <= 500
                             ),
  source_ref_id              bigint REFERENCES
                               business_v2.party_external_refs(id),
  verification_method        text NOT NULL CHECK (
                               verification_method ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  confidence                 text NOT NULL CHECK (
                               confidence IN (
                                 'source_verified', 'provider_asserted',
                                 'candidate', 'unknown'
                               )
                             ),
  status                     text NOT NULL DEFAULT 'active' CHECK (
                               status IN ('active', 'retired', 'conflicting')
                             ),
  valid_from                 timestamptz NOT NULL,
  valid_until                timestamptz,
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_identifier_claims_time_chk CHECK (
    valid_until IS NULL OR valid_from <= valid_until
  )
);

CREATE UNIQUE INDEX party_identifier_claims_active_exact_uniq
  ON business_v2.party_identifier_claims
    (party_id, identifier_kind, identifier_fingerprint)
  WHERE status = 'active';
CREATE INDEX party_identifier_claims_lookup_idx
  ON business_v2.party_identifier_claims
    (identifier_kind, identifier_fingerprint, status, party_id);

CREATE TABLE business_v2.party_identity_exceptions (
  id                         bigserial PRIMARY KEY,
  fingerprint                text NOT NULL UNIQUE CHECK (
                               fingerprint ~ '^[0-9a-f]{64}$'
                             ),
  current_party_id           bigint REFERENCES business_v2.parties(id),
  candidate_party_ids        bigint[] NOT NULL DEFAULT '{}'::bigint[] CHECK (
                               cardinality(candidate_party_ids) <= 20 AND
                               octet_length(to_jsonb(candidate_party_ids)::text) <= 8192
                             ),
  reason_code                text NOT NULL CHECK (
                               reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  status                     text NOT NULL DEFAULT 'open' CHECK (
                               status IN ('open', 'resolved', 'no_action')
                             ),
  owner_group                text NOT NULL DEFAULT 'chief' CHECK (
                               owner_group ~ '^[a-z][a-z0-9_-]{0,99}$'
                             ),
  evidence_refs              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(evidence_refs) = 'object' AND
                               octet_length(evidence_refs::text) <= 8192
                             ),
  occurrence_count           integer NOT NULL DEFAULT 1 CHECK (
                               occurrence_count > 0
                             ),
  first_seen_at              timestamptz NOT NULL,
  last_seen_at               timestamptz NOT NULL,
  resolution_code            text CHECK (
                               resolution_code IS NULL OR
                               resolution_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  resolution_receipt_sha256  text CHECK (
                               resolution_receipt_sha256 IS NULL OR
                               resolution_receipt_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  resolved_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_identity_exceptions_time_chk CHECK (
    first_seen_at <= last_seen_at
  ),
  CONSTRAINT party_identity_exceptions_resolution_chk CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolution_code IS NULL AND
      resolution_receipt_sha256 IS NULL) OR
    (status IN ('resolved', 'no_action') AND resolved_at IS NOT NULL AND
      resolution_code IS NOT NULL AND resolution_receipt_sha256 IS NOT NULL)
  )
);

CREATE INDEX party_identity_exceptions_open_idx
  ON business_v2.party_identity_exceptions (status, last_seen_at DESC)
  WHERE status = 'open';

CREATE TABLE business_v2.party_context_adapter_registrations (
  id                         bigserial PRIMARY KEY,
  adapter_key                text NOT NULL CHECK (
                               adapter_key ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  adapter_version            text NOT NULL CHECK (
                               adapter_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
                             ),
  source_system              text NOT NULL CHECK (
                               source_system ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  source_scope               text NOT NULL CHECK (
                               char_length(source_scope) BETWEEN 1 AND 160
                             ),
  manifest_version           integer NOT NULL CHECK (manifest_version > 0),
  manifest_sha256            text NOT NULL CHECK (
                               manifest_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  manifest                   jsonb NOT NULL CHECK (
                               jsonb_typeof(manifest) = 'object' AND
                               octet_length(manifest::text) <= 8192
                             ),
  config_declaration         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(config_declaration) = 'object' AND
                               octet_length(config_declaration::text) <= 8192
                             ),
  enabled                    boolean NOT NULL DEFAULT false,
  conformance_status         text NOT NULL DEFAULT 'pending' CHECK (
                               conformance_status IN ('pending', 'passed', 'failed')
                             ),
  conformance_receipt_sha256 text CHECK (
                               conformance_receipt_sha256 IS NULL OR
                               conformance_receipt_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  circuit_status             text NOT NULL DEFAULT 'closed' CHECK (
                               circuit_status IN ('closed', 'open')
                             ),
  failure_count              integer NOT NULL DEFAULT 0 CHECK (
                               failure_count >= 0
                             ),
  last_error_code            text CHECK (
                               last_error_code IS NULL OR
                               last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  last_health_at             timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adapter_key, adapter_version, source_scope),
  UNIQUE (source_system, source_scope)
);

CREATE TABLE business_v2.party_context_observations (
  id                         bigserial PRIMARY KEY,
  observation_uuid           uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  schema_version             integer NOT NULL CHECK (schema_version > 0),
  adapter_key                text NOT NULL,
  adapter_version            text NOT NULL,
  source_system              text NOT NULL,
  source_scope               text NOT NULL,
  source_fact_key            text NOT NULL CHECK (
                               char_length(source_fact_key) BETWEEN 1 AND 500
                             ),
  fact_type                  text NOT NULL CHECK (
                               fact_type ~ '^[a-z][a-z0-9_.-]{0,127}@[1-9][0-9]*$'
                             ),
  fact_schema_version        integer NOT NULL CHECK (fact_schema_version > 0),
  original_party_id          bigint REFERENCES business_v2.parties(id),
  current_party_id           bigint REFERENCES business_v2.parties(id),
  related_party_ids          bigint[] NOT NULL DEFAULT '{}'::bigint[] CHECK (
                               cardinality(related_party_ids) <= 20 AND
                               octet_length(to_jsonb(related_party_ids)::text) <= 8192
                             ),
  value                      jsonb NOT NULL CHECK (
                               jsonb_typeof(value) = 'object' AND
                               octet_length(value::text) <= 8192
                             ),
  value_sha256               text NOT NULL CHECK (
                               value_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  source_record_type         text NOT NULL CHECK (
                               source_record_type ~ '^[a-z][a-z0-9._-]{0,127}$'
                             ),
  source_record_id           text NOT NULL CHECK (
                               char_length(source_record_id) BETWEEN 1 AND 500
                             ),
  source_event_id            text CHECK (
                               source_event_id IS NULL OR
                               char_length(source_event_id) <= 500
                             ),
  effective_at               timestamptz,
  observed_at                timestamptz NOT NULL,
  verified_at                timestamptz,
  fresh_until                timestamptz,
  confidence                 text NOT NULL CHECK (
                               confidence IN (
                                 'source_verified', 'provider_asserted',
                                 'candidate', 'unknown'
                               )
                             ),
  conflict_state             text NOT NULL DEFAULT 'none' CHECK (
                               conflict_state IN (
                                 'none', 'candidate', 'conflicting', 'held'
                               )
                             ),
  privacy_class              text NOT NULL CHECK (
                               privacy_class IN (
                                 'internal', 'restricted_identifier'
                               )
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_scope, source_fact_key)
);

CREATE INDEX party_context_observations_party_idx
  ON business_v2.party_context_observations
    (current_party_id, fact_type, observed_at DESC);

CREATE TABLE business_v2.party_context_projections (
  id                         bigserial PRIMARY KEY,
  party_id                   bigint NOT NULL REFERENCES business_v2.parties(id),
  section                    text NOT NULL CHECK (
                               section IN (
                                 'identity', 'relationship', 'appointments',
                                 'commercial', 'communications', 'learning',
                                 'attribution', 'consent', 'open_work',
                                 'data_quality'
                               )
                             ),
  projection_key             text NOT NULL CHECK (
                               projection_key ~ '^[a-z][a-z0-9._:-]{0,199}$'
                             ),
  version                    integer NOT NULL DEFAULT 1 CHECK (version > 0),
  value                      jsonb NOT NULL CHECK (
                               jsonb_typeof(value) = 'object' AND
                               octet_length(value::text) <= 8192
                             ),
  value_sha256               text NOT NULL CHECK (
                               value_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  source_watermarks          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(source_watermarks) = 'object' AND
                               octet_length(source_watermarks::text) <= 8192
                             ),
  status                     text NOT NULL CHECK (
                               status IN (
                                 'current', 'stale', 'partial', 'conflicting',
                                 'unknown', 'unavailable'
                               )
                             ),
  missing_codes              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
                               jsonb_typeof(missing_codes) = 'array' AND
                               octet_length(missing_codes::text) <= 8192
                             ),
  conflict_codes             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
                               jsonb_typeof(conflict_codes) = 'array' AND
                               octet_length(conflict_codes::text) <= 8192
                             ),
  effective_at               timestamptz,
  observed_at                timestamptz NOT NULL,
  fresh_until                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, section, projection_key)
);

CREATE INDEX party_context_projections_status_idx
  ON business_v2.party_context_projections
    (party_id, section, status, fresh_until);

CREATE TABLE business_v2.party_context_query_receipts (
  id                         bigserial PRIMARY KEY,
  request_uuid               uuid NOT NULL UNIQUE,
  run_id                     uuid NOT NULL,
  source_container_sha256    text NOT NULL CHECK (
                               source_container_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  work_item_id               text NOT NULL CHECK (
                               char_length(work_item_id) BETWEEN 1 AND 500
                             ),
  actor_group                text NOT NULL CHECK (
                               actor_group ~ '^[a-z][a-z0-9_-]{0,99}$'
                             ),
  purpose                    text NOT NULL CHECK (
                               purpose ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  original_party_id          bigint REFERENCES business_v2.parties(id),
  current_party_id           bigint REFERENCES business_v2.parties(id),
  unresolved_subject_sha256  text CHECK (
                               unresolved_subject_sha256 IS NULL OR
                               unresolved_subject_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  requested_sections         jsonb NOT NULL CHECK (
                               jsonb_typeof(requested_sections) = 'array' AND
                               octet_length(requested_sections::text) <= 8192
                             ),
  returned_sections          jsonb NOT NULL CHECK (
                               jsonb_typeof(returned_sections) = 'array' AND
                               octet_length(returned_sections::text) <= 8192
                             ),
  projection_versions        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(projection_versions) = 'object' AND
                               octet_length(projection_versions::text) <= 8192
                             ),
  source_watermarks          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(source_watermarks) = 'object' AND
                               octet_length(source_watermarks::text) <= 8192
                             ),
  policy_decision            text NOT NULL CHECK (
                               policy_decision IN ('allowed', 'denied')
                             ),
  result_status              text NOT NULL CHECK (
                               result_status IN (
                                 'resolved', 'ambiguous', 'not_found',
                                 'needs_identity', 'denied', 'unavailable'
                               )
                             ),
  error_code                 text CHECK (
                               error_code IS NULL OR
                               error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  response_sha256            text NOT NULL CHECK (
                               response_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  delivery_status            text NOT NULL DEFAULT 'pending' CHECK (
                               delivery_status IN ('pending', 'delivered', 'failed')
                             ),
  delivery_error_code        text CHECK (
                               delivery_error_code IS NULL OR
                               delivery_error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  delivered_at               timestamptz,
  started_at                 timestamptz NOT NULL,
  completed_at               timestamptz NOT NULL,
  duration_ms                integer NOT NULL CHECK (duration_ms >= 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_context_query_subject_chk CHECK (
    current_party_id IS NOT NULL OR unresolved_subject_sha256 IS NOT NULL
  ),
  CONSTRAINT party_context_query_time_chk CHECK (
    started_at <= completed_at
  ),
  CONSTRAINT party_context_query_delivery_chk CHECK (
    (delivery_status = 'pending' AND delivered_at IS NULL AND
      delivery_error_code IS NULL) OR
    (delivery_status = 'delivered' AND delivered_at IS NOT NULL AND
      delivery_error_code IS NULL) OR
    (delivery_status = 'failed' AND delivered_at IS NULL AND
      delivery_error_code IS NOT NULL)
  )
);

CREATE INDEX party_context_query_receipts_party_idx
  ON business_v2.party_context_query_receipts
    (current_party_id, created_at DESC);

CREATE TABLE business_v2.party_context_plutio_projection_receipts (
  id                         bigserial PRIMARY KEY,
  plan_uuid                  uuid NOT NULL UNIQUE,
  original_party_id          bigint NOT NULL REFERENCES business_v2.parties(id),
  current_party_id           bigint NOT NULL REFERENCES business_v2.parties(id),
  plutio_ref_entity_type     text NOT NULL DEFAULT 'party' CHECK (
                               plutio_ref_entity_type = 'party'
                             ),
  plutio_ref_entity_id       bigint,
  projection_version         integer NOT NULL CHECK (projection_version > 0),
  projection_sha256          text NOT NULL CHECK (
                               projection_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  proposed_fields            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(proposed_fields) = 'object' AND
                               octet_length(proposed_fields::text) <= 8192
                             ),
  proposed_field_count       integer NOT NULL CHECK (
                               proposed_field_count >= 0 AND
                               proposed_field_count <= 100
                             ),
  mode                       text NOT NULL DEFAULT 'dry_run' CHECK (
                               mode = 'dry_run'
                             ),
  status                     text NOT NULL CHECK (
                               status IN ('planned', 'no_change', 'conflict', 'uncertain')
                             ),
  conflict_codes             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
                               jsonb_typeof(conflict_codes) = 'array' AND
                               octet_length(conflict_codes::text) <= 8192
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (current_party_id, projection_version, projection_sha256),
  FOREIGN KEY (plutio_ref_entity_type, plutio_ref_entity_id)
    REFERENCES business_v2.plutio_refs(entity_type, entity_id)
);

-- No executable provider outbox exists in this migration.

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'relationship context evidence is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_observation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  IF ROW(
       NEW.observation_uuid, NEW.schema_version, NEW.adapter_key,
       NEW.adapter_version, NEW.source_system, NEW.source_scope,
       NEW.source_fact_key, NEW.fact_type, NEW.fact_schema_version,
       NEW.original_party_id, NEW.related_party_ids, NEW.value,
       NEW.value_sha256, NEW.source_record_type, NEW.source_record_id,
       NEW.source_event_id, NEW.effective_at, NEW.observed_at,
       NEW.verified_at, NEW.fresh_until, NEW.confidence,
       NEW.privacy_class, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.observation_uuid, OLD.schema_version, OLD.adapter_key,
       OLD.adapter_version, OLD.source_system, OLD.source_scope,
       OLD.source_fact_key, OLD.fact_type, OLD.fact_schema_version,
       OLD.original_party_id, OLD.related_party_ids, OLD.value,
       OLD.value_sha256, OLD.source_record_type, OLD.source_record_id,
       OLD.source_event_id, OLD.effective_at, OLD.observed_at,
       OLD.verified_at, OLD.fresh_until, OLD.confidence,
       OLD.privacy_class, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'relationship context source fact is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_query_receipt_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  IF ROW(
       NEW.request_uuid, NEW.run_id, NEW.source_container_sha256,
       NEW.work_item_id, NEW.actor_group, NEW.purpose,
       NEW.original_party_id, NEW.unresolved_subject_sha256,
       NEW.requested_sections, NEW.returned_sections,
       NEW.projection_versions, NEW.source_watermarks,
       NEW.policy_decision, NEW.result_status, NEW.error_code,
       NEW.response_sha256, NEW.started_at, NEW.completed_at,
       NEW.duration_ms, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.request_uuid, OLD.run_id, OLD.source_container_sha256,
       OLD.work_item_id, OLD.actor_group, OLD.purpose,
       OLD.original_party_id, OLD.unresolved_subject_sha256,
       OLD.requested_sections, OLD.returned_sections,
       OLD.projection_versions, OLD.source_watermarks,
       OLD.policy_decision, OLD.result_status, OLD.error_code,
       OLD.response_sha256, OLD.started_at, OLD.completed_at,
       OLD.duration_ms, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'relationship context query receipt is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_query_delivery_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
BEGIN
  IF ROW(NEW.delivery_status, NEW.delivery_error_code, NEW.delivered_at)
     IS DISTINCT FROM
     ROW(OLD.delivery_status, OLD.delivery_error_code, OLD.delivered_at)
  THEN
    IF OLD.delivery_status <> 'pending'
       OR NEW.delivery_status NOT IN ('delivered', 'failed')
    THEN
      RAISE EXCEPTION 'relationship context query delivery is terminal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_reject_merged_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  candidate bigint;
BEGIN
  candidate := COALESCE(
    nullif(to_jsonb(NEW)->>'party_id', '')::bigint,
    nullif(to_jsonb(NEW)->>'current_party_id', '')::bigint
  );
  IF candidate IS NOT NULL AND EXISTS (
    SELECT 1 FROM business_v2.parties
     WHERE id = candidate AND merged_into IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot write active relationship context to merged party %',
      candidate;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_party_merged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_temp
AS $$
DECLARE
  winner bigint;
BEGIN
  IF OLD.merged_into IS NOT NULL OR NEW.merged_into IS NULL THEN
    RETURN NEW;
  END IF;
  winner := business_v2.canonical_party_id(NEW.merged_into);
  IF winner IS NULL OR winner = NEW.id THEN
    RAISE EXCEPTION 'relationship context merge winner is invalid';
  END IF;

  DELETE FROM business_v2.party_identifier_claims loser
   USING business_v2.party_identifier_claims survivor
   WHERE loser.party_id = NEW.id
     AND survivor.party_id = winner
     AND survivor.identifier_kind = loser.identifier_kind
     AND survivor.identifier_fingerprint = loser.identifier_fingerprint
     AND survivor.status = loser.status;
  UPDATE business_v2.party_identifier_claims
     SET party_id = winner, updated_at = now()
   WHERE party_id = NEW.id;

  UPDATE business_v2.party_external_refs
     SET party_id = winner, updated_at = now()
   WHERE party_id = NEW.id;
  UPDATE business_v2.party_identity_exceptions
     SET current_party_id = winner, updated_at = now()
   WHERE current_party_id = NEW.id;
  UPDATE business_v2.party_context_observations
     SET current_party_id = winner, updated_at = now()
   WHERE current_party_id = NEW.id;

  IF EXISTS (
    SELECT 1
      FROM business_v2.party_context_projections loser
      JOIN business_v2.party_context_projections survivor
        ON survivor.party_id = winner
       AND survivor.section = loser.section
       AND survivor.projection_key = loser.projection_key
     WHERE loser.party_id = NEW.id
       AND (
         survivor.value_sha256 <> loser.value_sha256 OR
         survivor.status <> loser.status OR
         survivor.source_watermarks <> loser.source_watermarks
       )
  ) THEN
    RAISE EXCEPTION 'relationship context projection merge conflict';
  END IF;
  DELETE FROM business_v2.party_context_projections loser
   USING business_v2.party_context_projections survivor
   WHERE loser.party_id = NEW.id
     AND survivor.party_id = winner
     AND survivor.section = loser.section
     AND survivor.projection_key = loser.projection_key;
  UPDATE business_v2.party_context_projections
     SET party_id = winner, updated_at = now()
   WHERE party_id = NEW.id;

  UPDATE business_v2.party_context_query_receipts
     SET current_party_id = winner
   WHERE current_party_id = NEW.id;
  UPDATE business_v2.party_context_plutio_projection_receipts
     SET current_party_id = winner
   WHERE current_party_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION business_v2.fn_relationship_context_backfill_legacy_refs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_temp
AS $$
DECLARE
  inserted integer;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.parties p
      JOIN business_v2.party_external_refs r
        ON r.provider = p.source_provider
       AND r.source_scope = 'legacy-primary'
       AND r.entity_type = p.party_type
       AND r.external_id = p.source_id
     WHERE p.merged_into IS NULL
       AND nullif(trim(p.source_provider), '') IS NOT NULL
       AND nullif(trim(p.source_id), '') IS NOT NULL
       AND r.party_id <> p.id
  ) THEN
    RAISE EXCEPTION
      'relationship context legacy source conflicts with existing scoped ref';
  END IF;

  INSERT INTO business_v2.party_external_refs (
    party_id, provider, source_scope, entity_type, external_id,
    adapter_key, adapter_version, schema_version, status, verified_at,
    first_seen_at, last_seen_at, source_receipt_sha256
  )
  SELECT
    p.id, p.source_provider, 'legacy-primary', p.party_type, p.source_id,
    'legacy_party_source', '1.0.0', 1, 'active', NULL,
    p.created_at, p.updated_at,
    encode(digest(
      jsonb_build_array(
        'legacy-party-source-v1', p.id, p.source_provider, p.source_id
      )::text,
      'sha256'
    ), 'hex')
  FROM business_v2.parties p
  WHERE p.merged_into IS NULL
    AND nullif(trim(p.source_provider), '') IS NOT NULL
    AND nullif(trim(p.source_id), '') IS NOT NULL
  ON CONFLICT (provider, source_scope, entity_type, external_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE TRIGGER party_context_observations_core_immutable
  BEFORE UPDATE ON business_v2.party_context_observations
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_observation_immutable();
CREATE TRIGGER party_context_observations_no_delete
  BEFORE DELETE ON business_v2.party_context_observations
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_append_only();
CREATE TRIGGER party_context_query_receipts_core_immutable
  BEFORE UPDATE ON business_v2.party_context_query_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_query_receipt_immutable();
CREATE TRIGGER party_context_query_receipts_delivery_transition
  BEFORE UPDATE ON business_v2.party_context_query_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_query_delivery_transition();
CREATE TRIGGER party_context_query_receipts_no_delete
  BEFORE DELETE ON business_v2.party_context_query_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_append_only();

CREATE TRIGGER party_external_refs_reject_merged
  BEFORE INSERT OR UPDATE OF party_id ON business_v2.party_external_refs
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER party_identifier_claims_reject_merged
  BEFORE INSERT OR UPDATE OF party_id ON business_v2.party_identifier_claims
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER party_context_observations_reject_merged
  BEFORE INSERT OR UPDATE OF current_party_id
  ON business_v2.party_context_observations
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER party_context_projections_reject_merged
  BEFORE INSERT OR UPDATE OF party_id
  ON business_v2.party_context_projections
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER party_context_query_receipts_reject_merged
  BEFORE INSERT OR UPDATE OF current_party_id
  ON business_v2.party_context_query_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER party_context_plutio_receipts_reject_merged
  BEFORE INSERT OR UPDATE OF current_party_id
  ON business_v2.party_context_plutio_projection_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_reject_merged_party();
CREATE TRIGGER parties_relationship_context_merge
  AFTER UPDATE OF merged_into ON business_v2.parties
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_relationship_context_party_merged();

CREATE VIEW business_v2.v_party_context_health AS
SELECT
  (SELECT count(*) FROM business_v2.party_external_refs
    WHERE status = 'active') AS active_external_ref_count,
  (SELECT count(*) FROM business_v2.party_identity_exceptions
    WHERE status = 'open') AS open_identity_exception_count,
  (SELECT count(*) FROM business_v2.party_context_observations)
    AS observation_count,
  (SELECT count(*) FROM business_v2.party_context_projections)
    AS projection_count,
  (SELECT count(*) FROM business_v2.party_context_adapter_registrations
    WHERE enabled) AS enabled_adapter_count,
  (SELECT max(observed_at) FROM business_v2.party_context_observations)
    AS last_observed_at,
  (SELECT max(created_at) FROM business_v2.party_context_query_receipts)
    AS last_query_at;

CREATE VIEW business_v2.v_party_context_identity_exception_queue AS
SELECT id, fingerprint, reason_code, status, owner_group, occurrence_count,
       first_seen_at, last_seen_at, resolution_code, resolved_at
  FROM business_v2.party_identity_exceptions
 WHERE status = 'open';

SELECT business_v2.fn_relationship_context_backfill_legacy_refs();

COMMENT ON TABLE business_v2.party_external_refs IS
  'Scoped external identities bound to canonical Parties. Email is never an implicit unique join.';
COMMENT ON TABLE business_v2.party_context_observations IS
  'Append-safe bounded normalized person-context facts. No raw provider payload, credentials, messages, or payment instruments.';
COMMENT ON TABLE business_v2.party_context_query_receipts IS
  'Content-minimized immutable context-query receipts. Returned context values are never stored here.';
COMMENT ON TABLE business_v2.party_context_plutio_projection_receipts IS
  'Dry-run-only Plutio projection plans. This table has no executable provider outbox or write authority.';

DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'party_external_refs',
    'party_identifier_claims',
    'party_identity_exceptions',
    'party_context_adapter_registrations',
    'party_context_observations',
    'party_context_projections',
    'party_context_query_receipts',
    'party_context_plutio_projection_receipts',
    'v_party_context_health',
    'v_party_context_identity_exception_queue'
  ] LOOP
    EXECUTE format('ALTER TABLE business_v2.%I OWNER TO nanoclaw_admin',
                   relation_name);
    EXECUTE format('REVOKE ALL ON business_v2.%I FROM PUBLIC', relation_name);
    EXECUTE format('GRANT ALL ON business_v2.%I TO nanoclaw_admin',
                   relation_name);
  END LOOP;
END $$;

DO $$
DECLARE
  sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'party_external_refs_id_seq',
    'party_identifier_claims_id_seq',
    'party_identity_exceptions_id_seq',
    'party_context_adapter_registrations_id_seq',
    'party_context_observations_id_seq',
    'party_context_projections_id_seq',
    'party_context_query_receipts_id_seq',
    'party_context_plutio_projection_receipts_id_seq'
  ] LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin',
                   sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC',
                   sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE business_v2.%I TO nanoclaw_admin',
                   sequence_name);
  END LOOP;
END $$;

DO $$
DECLARE
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'fn_relationship_context_append_only()',
    'fn_relationship_context_observation_immutable()',
    'fn_relationship_context_query_receipt_immutable()',
    'fn_relationship_context_query_delivery_transition()',
    'fn_relationship_context_reject_merged_party()',
    'fn_relationship_context_party_merged()',
    'fn_relationship_context_backfill_legacy_refs()'
  ] LOOP
    EXECUTE format('ALTER FUNCTION business_v2.%s OWNER TO nanoclaw_admin',
                   function_name);
    EXECUTE format('REVOKE ALL ON FUNCTION business_v2.%s FROM PUBLIC',
                   function_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION business_v2.%s TO nanoclaw_admin',
                   function_name);
  END LOOP;
END $$;

COMMIT;
