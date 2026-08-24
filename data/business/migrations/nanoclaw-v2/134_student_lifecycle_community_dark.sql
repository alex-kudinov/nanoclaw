-- 134_student_lifecycle_community_dark.sql
--
-- Community-only, host-owned, privacy-minimized student lifecycle foundation.
-- Dark by construction: no live catalog rows, schedules, provider writes,
-- action outboxes, message paths, minion grants, or Circle support.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.student_lifecycle_catalog_entries (
  id                         bigserial PRIMARY KEY,
  entry_key                  text NOT NULL UNIQUE CHECK (
                               char_length(entry_key) BETWEEN 1 AND 300 AND
                               entry_key ~ '^[a-z0-9][a-z0-9._:-]*$'
                             ),
  catalog_revision           integer NOT NULL CHECK (catalog_revision > 0),
  catalog_sha256             text NOT NULL CHECK (
                               catalog_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  heartbeat_community_id     uuid NOT NULL,
  heartbeat_group_id         uuid,
  heartbeat_course_id        uuid,
  heartbeat_cohort_id        uuid,
  offer_id                   text CHECK (
                               offer_id IS NULL OR
                               (char_length(offer_id) BETWEEN 1 AND 300 AND
                                offer_id ~ '^[a-z0-9][a-z0-9._:-]*$')
                             ),
  program_slug               text CHECK (
                               program_slug IS NULL OR
                               (char_length(program_slug) BETWEEN 1 AND 300 AND
                                program_slug ~ '^[a-z0-9][a-z0-9._:-]*$')
                             ),
  language                   text NOT NULL DEFAULT 'en' CHECK (
                               language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'
                             ),
  mapping_scope              text NOT NULL CHECK (
                               mapping_scope IN (
                                 'access_family', 'course_only',
                                 'exact_offer', 'exact_cohort'
                               )
                             ),
  lifecycle_enabled          boolean NOT NULL DEFAULT false,
  policy_version             text NOT NULL CHECK (
                               policy_version ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
                             ),
  source_ref                 text NOT NULL CHECK (
                               char_length(source_ref) BETWEEN 1 AND 1000
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  effective_from             timestamptz NOT NULL,
  effective_until            timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lifecycle_catalog_identifier_chk CHECK (
    heartbeat_group_id IS NOT NULL OR heartbeat_course_id IS NOT NULL
  ),
  CONSTRAINT student_lifecycle_catalog_time_chk CHECK (
    effective_until IS NULL OR effective_from < effective_until
  )
);

CREATE INDEX student_lifecycle_catalog_lookup_idx
  ON business_v2.student_lifecycle_catalog_entries
    (workspace, heartbeat_community_id, heartbeat_group_id,
     heartbeat_course_id, heartbeat_cohort_id, lifecycle_enabled);

CREATE TABLE business_v2.student_lifecycle_identity_links (
  id                         bigserial PRIMARY KEY,
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  heartbeat_community_id     uuid NOT NULL,
  heartbeat_user_id          uuid NOT NULL,
  party_id                   bigint NOT NULL REFERENCES business_v2.parties(id),
  binding_status             text NOT NULL DEFAULT 'confirmed' CHECK (
                               binding_status IN ('confirmed', 'revoked')
                             ),
  source_event_key           text NOT NULL CHECK (
                               char_length(source_event_key) BETWEEN 1 AND 500
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  bound_at                   timestamptz NOT NULL,
  revoked_at                 timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lifecycle_identity_status_chk CHECK (
    (binding_status = 'revoked') = (revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX student_lifecycle_identity_active_uniq
  ON business_v2.student_lifecycle_identity_links
    (workspace, heartbeat_community_id, heartbeat_user_id)
  WHERE binding_status = 'confirmed';

CREATE INDEX student_lifecycle_identity_party_idx
  ON business_v2.student_lifecycle_identity_links
    (party_id, binding_status, bound_at DESC);

CREATE TABLE business_v2.student_lifecycle_events (
  id                         bigserial PRIMARY KEY,
  event_uuid                 uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  schema_version             integer NOT NULL CHECK (schema_version = 1),
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  delivery_id                uuid NOT NULL,
  source_system              text NOT NULL DEFAULT 'heartbeat' CHECK (
                               source_system = 'heartbeat'
                             ),
  source_action              text NOT NULL CHECK (
                               source_action IN (
                                 'USER_JOIN', 'USER_UPDATE', 'EVENT_CREATE',
                                 'EVENT_RSVP', 'THREAD_CREATE', 'MENTION',
                                 'DIRECT_MESSAGE', 'COURSE_COMPLETED',
                                 'GROUP_JOIN', 'ABANDONED_CART',
                                 'DOCUMENT_CREATE'
                               )
                             ),
  source_event_key           text NOT NULL UNIQUE CHECK (
                               char_length(source_event_key) BETWEEN 1 AND 500 AND
                               source_event_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  event_name                 text NOT NULL CHECK (
                               event_name ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  observed_at                timestamptz NOT NULL,
  received_at                timestamptz NOT NULL DEFAULT now(),
  webhook_inbox_id           bigint NOT NULL UNIQUE REFERENCES
                               business_v2.webhook_inbox(id),
  reconciliation_run_id      bigint,
  party_id                   bigint REFERENCES business_v2.parties(id),
  catalog_entry_id           bigint REFERENCES
                               business_v2.student_lifecycle_catalog_entries(id),
  heartbeat_community_id     uuid NOT NULL,
  heartbeat_user_id          uuid,
  heartbeat_group_id         uuid,
  heartbeat_course_id        uuid,
  heartbeat_cohort_id        uuid,
  heartbeat_lesson_id        uuid,
  heartbeat_invitation_id    uuid,
  heartbeat_event_id         uuid,
  heartbeat_channel_id       uuid,
  heartbeat_thread_id        uuid,
  heartbeat_chat_id          uuid,
  heartbeat_message_id       uuid,
  heartbeat_document_id      uuid,
  identity_fingerprint       text CHECK (
                               identity_fingerprint IS NULL OR
                               identity_fingerprint ~ '^[0-9a-f]{64}$'
                             ),
  payload_sha256             text NOT NULL CHECK (
                               payload_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  relay_authenticity         text NOT NULL DEFAULT 'hmac_verified' CHECK (
                               relay_authenticity = 'hmac_verified'
                             ),
  provider_authenticity      text NOT NULL CHECK (
                               provider_authenticity IN (
                                 'source_asserted_unreconciled',
                                 'provider_reconciled', 'unverifiable'
                               )
                             ),
  mapping_status             text NOT NULL CHECK (
                               mapping_status IN (
                                 'unresolved_identity', 'unknown_catalog',
                                 'ambiguous_catalog', 'course_known_offer_ambiguous',
                                 'exact', 'not_applicable'
                               )
                             ),
  processing_status          text NOT NULL CHECK (
                               processing_status IN (
                                 'normalized', 'reconciled', 'applied',
                                 'quarantined', 'superseded'
                               )
                             ),
  facts                      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(facts) = 'object' AND
                               octet_length(facts::text) <= 8192
                             ),
  supersedes_event_id        bigint REFERENCES
                               business_v2.student_lifecycle_events(id),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_lifecycle_events_party_idx
  ON business_v2.student_lifecycle_events
    (party_id, observed_at DESC, id DESC)
  WHERE party_id IS NOT NULL;

CREATE INDEX student_lifecycle_events_processing_idx
  ON business_v2.student_lifecycle_events
    (processing_status, observed_at, id);

CREATE TABLE business_v2.student_lifecycle_enrollments (
  id                         bigserial PRIMARY KEY,
  episode_uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  enrollment_key             text NOT NULL UNIQUE CHECK (
                               char_length(enrollment_key) BETWEEN 1 AND 500 AND
                               enrollment_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  version                    integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  party_id                   bigint NOT NULL REFERENCES business_v2.parties(id),
  heartbeat_community_id     uuid NOT NULL,
  heartbeat_user_id          uuid NOT NULL,
  heartbeat_group_id         uuid,
  heartbeat_course_id        uuid,
  heartbeat_cohort_id        uuid,
  catalog_entry_id           bigint REFERENCES
                               business_v2.student_lifecycle_catalog_entries(id),
  access_state               text NOT NULL DEFAULT 'unknown' CHECK (
                               access_state IN (
                                 'unknown', 'pending', 'provisioned',
                                 'failed', 'revoked'
                               )
                             ),
  activation_state           text NOT NULL DEFAULT 'unknown' CHECK (
                               activation_state IN (
                                 'unknown', 'invited', 'activated'
                               )
                             ),
  learning_state             text NOT NULL DEFAULT 'not_started' CHECK (
                               learning_state IN (
                                 'not_started', 'started', 'progressing',
                                 'stalled', 'resumed', 'completed',
                                 'completion_unclassified'
                               )
                             ),
  grading_state              text NOT NULL DEFAULT 'unknown' CHECK (
                               grading_state IN (
                                 'not_applicable', 'unknown', 'in_progress',
                                 'retry_required', 'approved'
                               )
                             ),
  feedback_state             text NOT NULL DEFAULT 'missing' CHECK (
                               feedback_state IN (
                                 'not_applicable', 'missing', 'submitted'
                               )
                             ),
  certificate_state          text NOT NULL DEFAULT 'blocked' CHECK (
                               certificate_state IN (
                                 'not_applicable', 'blocked', 'ready',
                                 'issued', 'failed'
                               )
                             ),
  finance_state              text NOT NULL DEFAULT 'unknown' CHECK (
                               finance_state IN (
                                 'unknown', 'not_required', 'pending', 'paid',
                                 'refunded', 'disputed'
                               )
                             ),
  marketing_consent_state    text NOT NULL DEFAULT 'unknown' CHECK (
                               marketing_consent_state IN (
                                 'unknown', 'opted_in', 'opted_out'
                               )
                             ),
  contact_suppression_state  text NOT NULL DEFAULT 'none' CHECK (
                               contact_suppression_state IN (
                                 'none', 'marketing', 'all_nonrequired'
                               )
                             ),
  freshness_state            text NOT NULL DEFAULT 'unknown' CHECK (
                               freshness_state IN ('unknown', 'current', 'stale')
                             ),
  missing_fact_codes         text[] NOT NULL DEFAULT '{}'::text[],
  last_event_id              bigint REFERENCES
                               business_v2.student_lifecycle_events(id),
  last_reconciled_at         timestamptz,
  started_at                 timestamptz NOT NULL,
  ended_at                   timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lifecycle_enrollment_identifier_chk CHECK (
    heartbeat_group_id IS NOT NULL OR heartbeat_course_id IS NOT NULL
  ),
  CONSTRAINT student_lifecycle_enrollment_time_chk CHECK (
    ended_at IS NULL OR started_at <= ended_at
  )
);

CREATE INDEX student_lifecycle_enrollments_party_idx
  ON business_v2.student_lifecycle_enrollments
    (party_id, ended_at, updated_at DESC, id DESC);

CREATE INDEX student_lifecycle_enrollments_health_idx
  ON business_v2.student_lifecycle_enrollments
    (freshness_state, access_state, learning_state, updated_at, id)
  WHERE ended_at IS NULL;

CREATE TABLE business_v2.student_lifecycle_reconciliation_runs (
  id                         bigserial PRIMARY KEY,
  run_uuid                   uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  run_key                    text NOT NULL UNIQUE CHECK (
                               char_length(run_key) BETWEEN 1 AND 500 AND
                               run_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  run_type                   text NOT NULL CHECK (
                               run_type IN (
                                 'registry', 'catalog', 'membership', 'progress'
                               )
                             ),
  scope_key                  text NOT NULL CHECK (
                               char_length(scope_key) BETWEEN 1 AND 500
                             ),
  catalog_revision           integer CHECK (catalog_revision > 0),
  source_snapshot_sha256     text NOT NULL CHECK (
                               source_snapshot_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  watermark_before           text CHECK (
                               watermark_before IS NULL OR
                               char_length(watermark_before) <= 500
                             ),
  watermark_after            text CHECK (
                               watermark_after IS NULL OR
                               char_length(watermark_after) <= 500
                             ),
  scopes_expected            integer NOT NULL CHECK (scopes_expected >= 0),
  scopes_observed            integer NOT NULL CHECK (scopes_observed >= 0),
  facts_new                  integer NOT NULL DEFAULT 0 CHECK (facts_new >= 0),
  facts_unchanged            integer NOT NULL DEFAULT 0 CHECK (
                               facts_unchanged >= 0
                             ),
  facts_conflicting          integer NOT NULL DEFAULT 0 CHECK (
                               facts_conflicting >= 0
                             ),
  facts_quarantined          integer NOT NULL DEFAULT 0 CHECK (
                               facts_quarantined >= 0
                             ),
  status                     text NOT NULL CHECK (
                               status IN (
                                 'running', 'completed', 'partial',
                                 'failed', 'quarantined'
                               )
                             ),
  error_code                 text CHECK (
                               error_code IS NULL OR
                               error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  started_at                 timestamptz NOT NULL,
  completed_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lifecycle_run_completeness_chk CHECK (
    scopes_observed <= scopes_expected
  ),
  CONSTRAINT student_lifecycle_run_terminal_chk CHECK (
    (status = 'running') = (completed_at IS NULL)
  ),
  CONSTRAINT student_lifecycle_run_watermark_chk CHECK (
    status = 'completed' OR watermark_after IS NOT DISTINCT FROM watermark_before
  )
);

ALTER TABLE business_v2.student_lifecycle_events
  ADD CONSTRAINT student_lifecycle_events_run_fk
  FOREIGN KEY (reconciliation_run_id)
  REFERENCES business_v2.student_lifecycle_reconciliation_runs(id);

CREATE INDEX student_lifecycle_runs_health_idx
  ON business_v2.student_lifecycle_reconciliation_runs
    (run_type, scope_key, started_at DESC, id DESC);

CREATE TABLE business_v2.student_lifecycle_state_history (
  id                         bigserial PRIMARY KEY,
  enrollment_id              bigint NOT NULL REFERENCES
                               business_v2.student_lifecycle_enrollments(id),
  enrollment_version         integer NOT NULL CHECK (enrollment_version > 0),
  axis                       text NOT NULL CHECK (
                               axis IN (
                                 'access', 'activation', 'learning', 'grading',
                                 'feedback', 'certificate', 'finance',
                                 'marketing_consent', 'contact_suppression'
                               )
                             ),
  previous_value             text NOT NULL CHECK (btrim(previous_value) <> ''),
  next_value                 text NOT NULL CHECK (btrim(next_value) <> ''),
  reason_code                text NOT NULL CHECK (
                               reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  event_id                   bigint REFERENCES
                               business_v2.student_lifecycle_events(id),
  reconciliation_run_id      bigint REFERENCES
                               business_v2.student_lifecycle_reconciliation_runs(id),
  policy_version             text NOT NULL CHECK (
                               policy_version ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
                             ),
  catalog_revision           integer CHECK (catalog_revision > 0),
  effective_at               timestamptz NOT NULL,
  recorded_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lifecycle_history_changed_chk CHECK (
    previous_value <> next_value
  ),
  CONSTRAINT student_lifecycle_history_evidence_chk CHECK (
    event_id IS NOT NULL OR reconciliation_run_id IS NOT NULL
  ),
  CONSTRAINT student_lifecycle_history_version_uniq
    UNIQUE (enrollment_id, enrollment_version, axis)
);

CREATE INDEX student_lifecycle_history_enrollment_idx
  ON business_v2.student_lifecycle_state_history
    (enrollment_id, enrollment_version, recorded_at, id);

CREATE TABLE business_v2.student_lifecycle_exceptions (
  id                         bigserial PRIMARY KEY,
  fingerprint               text NOT NULL UNIQUE CHECK (
                               fingerprint ~ '^[0-9a-f]{64}$'
                             ),
  workspace                  text NOT NULL DEFAULT 'community' CHECK (
                               workspace = 'community'
                             ),
  event_id                   bigint REFERENCES
                               business_v2.student_lifecycle_events(id),
  enrollment_id              bigint REFERENCES
                               business_v2.student_lifecycle_enrollments(id),
  reconciliation_run_id      bigint REFERENCES
                               business_v2.student_lifecycle_reconciliation_runs(id),
  reason_code                text NOT NULL CHECK (
                               reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  severity                   text NOT NULL CHECK (
                               severity IN ('p0', 'p1', 'p2')
                             ),
  status                     text NOT NULL DEFAULT 'open' CHECK (
                               status IN ('open', 'resolved', 'no_action')
                             ),
  owner_group                text NOT NULL DEFAULT 'chief' CHECK (
                               owner_group = 'chief'
                             ),
  occurrence_count           integer NOT NULL DEFAULT 1 CHECK (
                               occurrence_count BETWEEN 1 AND 1000000
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  first_seen_at              timestamptz NOT NULL,
  last_seen_at               timestamptz NOT NULL,
  review_due_at              timestamptz NOT NULL,
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
  CONSTRAINT student_lifecycle_exception_evidence_chk CHECK (
    event_id IS NOT NULL OR enrollment_id IS NOT NULL OR
    reconciliation_run_id IS NOT NULL
  ),
  CONSTRAINT student_lifecycle_exception_time_chk CHECK (
    first_seen_at <= last_seen_at
  ),
  CONSTRAINT student_lifecycle_exception_resolution_chk CHECK (
    (status = 'open') =
      (resolved_at IS NULL AND resolution_code IS NULL AND
       resolution_receipt_sha256 IS NULL)
  )
);

CREATE INDEX student_lifecycle_exceptions_open_idx
  ON business_v2.student_lifecycle_exceptions
    (severity, review_due_at, last_seen_at, id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION business_v2.fn_student_lifecycle_event_core_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
       NEW.event_uuid, NEW.schema_version, NEW.workspace, NEW.delivery_id,
       NEW.source_system, NEW.source_action, NEW.source_event_key,
       NEW.event_name, NEW.observed_at, NEW.received_at,
       NEW.webhook_inbox_id, NEW.heartbeat_community_id,
       NEW.heartbeat_user_id, NEW.heartbeat_group_id,
       NEW.heartbeat_course_id, NEW.heartbeat_cohort_id,
       NEW.heartbeat_lesson_id, NEW.heartbeat_invitation_id,
       NEW.heartbeat_event_id, NEW.heartbeat_channel_id,
       NEW.heartbeat_thread_id, NEW.heartbeat_chat_id,
       NEW.heartbeat_message_id, NEW.heartbeat_document_id,
       NEW.identity_fingerprint, NEW.payload_sha256,
       NEW.relay_authenticity, NEW.facts, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.event_uuid, OLD.schema_version, OLD.workspace, OLD.delivery_id,
       OLD.source_system, OLD.source_action, OLD.source_event_key,
       OLD.event_name, OLD.observed_at, OLD.received_at,
       OLD.webhook_inbox_id, OLD.heartbeat_community_id,
       OLD.heartbeat_user_id, OLD.heartbeat_group_id,
       OLD.heartbeat_course_id, OLD.heartbeat_cohort_id,
       OLD.heartbeat_lesson_id, OLD.heartbeat_invitation_id,
       OLD.heartbeat_event_id, OLD.heartbeat_channel_id,
       OLD.heartbeat_thread_id, OLD.heartbeat_chat_id,
       OLD.heartbeat_message_id, OLD.heartbeat_document_id,
       OLD.identity_fingerprint, OLD.payload_sha256,
       OLD.relay_authenticity, OLD.facts, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'student lifecycle source fact is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER student_lifecycle_events_core_immutable
  BEFORE UPDATE ON business_v2.student_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_student_lifecycle_event_core_immutable();

CREATE TRIGGER student_lifecycle_events_no_delete
  BEFORE DELETE ON business_v2.student_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE TRIGGER student_lifecycle_history_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_lifecycle_state_history
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE OR REPLACE VIEW business_v2.v_student_lifecycle_health AS
SELECT
  (SELECT count(*) FROM business_v2.student_lifecycle_events) AS event_count,
  (SELECT count(*) FROM business_v2.student_lifecycle_enrollments
    WHERE ended_at IS NULL) AS active_enrollment_count,
  (SELECT count(*) FROM business_v2.student_lifecycle_exceptions
    WHERE status = 'open') AS open_exception_count,
  (SELECT max(received_at) FROM business_v2.student_lifecycle_events)
    AS last_event_received_at,
  (SELECT max(completed_at) FROM business_v2.student_lifecycle_reconciliation_runs
    WHERE status = 'completed') AS last_reconciliation_completed_at;

CREATE OR REPLACE VIEW business_v2.v_student_lifecycle_exception_queue AS
SELECT
  id,
  fingerprint,
  reason_code,
  severity,
  status,
  owner_group,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  review_due_at,
  resolution_code,
  resolved_at
FROM business_v2.student_lifecycle_exceptions
WHERE status = 'open';

COMMENT ON TABLE business_v2.student_lifecycle_events IS
  'Community-only append-safe normalized Heartbeat facts. No name, email, message content, callback path, credential, payment detail, grading text, or certificate URL.';
COMMENT ON TABLE business_v2.student_lifecycle_enrollments IS
  'Community-only current multi-axis enrollment projection. Presence does not authorize any lifecycle action or message.';
COMMENT ON TABLE business_v2.student_lifecycle_exceptions IS
  'Privacy-minimized durable lifecycle exceptions. Slack/logs are projections and cannot close these rows.';

ALTER FUNCTION business_v2.fn_student_lifecycle_event_core_immutable()
  OWNER TO nanoclaw_admin;

DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'student_lifecycle_catalog_entries',
    'student_lifecycle_identity_links',
    'student_lifecycle_events',
    'student_lifecycle_enrollments',
    'student_lifecycle_reconciliation_runs',
    'student_lifecycle_state_history',
    'student_lifecycle_exceptions',
    'v_student_lifecycle_health',
    'v_student_lifecycle_exception_queue'
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
    'student_lifecycle_catalog_entries_id_seq',
    'student_lifecycle_identity_links_id_seq',
    'student_lifecycle_events_id_seq',
    'student_lifecycle_enrollments_id_seq',
    'student_lifecycle_reconciliation_runs_id_seq',
    'student_lifecycle_state_history_id_seq',
    'student_lifecycle_exceptions_id_seq'
  ] LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin',
                   sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC',
                   sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE business_v2.%I TO nanoclaw_admin',
                   sequence_name);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION
  business_v2.fn_student_lifecycle_event_core_immutable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  business_v2.fn_student_lifecycle_event_core_immutable() TO nanoclaw_admin;

COMMIT;
