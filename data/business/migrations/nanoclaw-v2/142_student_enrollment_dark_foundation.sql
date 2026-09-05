-- 142_student_enrollment_dark_foundation.sql
--
-- Admin-only, default-off multi-source enrollment foundation. This migration
-- creates no rows, grants no minion access, wires no runtime, and performs no
-- reconciliation or provider action.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.student_enrollment_orders (
  id bigserial PRIMARY KEY,
  order_key text NOT NULL UNIQUE CHECK (order_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  source_channel text NOT NULL CHECK (source_channel IN (
    'website_stripe_checkout', 'manual_stripe_payment',
    'plutio_invoice_or_contract', 'check_ach_or_wire', 'sponsored_cohort',
    'scholarship', 'complimentary_owner_grant', 'migration_or_correction'
  )),
  offer_key text CHECK (offer_key IS NULL OR offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  bundle_key text CHECK (bundle_key IS NULL OR bundle_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  bundle_version integer CHECK (bundle_version IS NULL OR bundle_version > 0),
  payer_party_id bigint REFERENCES business_v2.parties(id),
  seat_count integer NOT NULL CHECK (seat_count BETWEEN 1 AND 10000),
  financial_classification text NOT NULL CHECK (financial_classification IN (
    'not_applicable', 'unverified', 'settled', 'active_terms', 'held'
  )),
  state text NOT NULL CHECK (state IN (
    'captured', 'needs_source_evidence', 'needs_offer',
    'needs_financial_terms', 'needs_participants', 'ready_to_materialize',
    'partially_materialized', 'materialized', 'held', 'cancelled'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  policy_revision integer NOT NULL CHECK (policy_revision > 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK ((bundle_key IS NULL) = (bundle_version IS NULL)),
  CHECK (created_at <= updated_at)
);

CREATE TABLE business_v2.student_enrollment_order_source_refs (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES business_v2.student_enrollment_orders(id),
  source_scope text NOT NULL CHECK (source_scope ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  source_object_type text NOT NULL CHECK (source_object_type ~ '^[a-z0-9][a-z0-9._:-]{0,99}$'),
  source_object_id text NOT NULL CHECK (char_length(source_object_id) BETWEEN 1 AND 300),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 500),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  recorded_by text NOT NULL CHECK (btrim(recorded_by) <> ''),
  UNIQUE (source_scope, source_object_type, source_object_id)
);
CREATE INDEX student_enrollment_order_source_refs_order_idx
  ON business_v2.student_enrollment_order_source_refs (order_id, recorded_at, id);

CREATE TABLE business_v2.student_enrollment_evidence (
  id bigserial PRIMARY KEY,
  evidence_key text NOT NULL UNIQUE CHECK (evidence_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  subject_type text NOT NULL CHECK (subject_type IN (
    'order', 'seat', 'enrollment', 'agreement', 'obligation',
    'entitlement', 'assignment', 'projection', 'exception'
  )),
  subject_key text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 300),
  evidence_type text NOT NULL CHECK (evidence_type ~ '^[a-z][a-z0-9_]{0,99}$'),
  source_reference_id bigint REFERENCES business_v2.student_enrollment_order_source_refs(id),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  recorded_by text NOT NULL CHECK (btrim(recorded_by) <> '')
);
CREATE INDEX student_enrollment_evidence_subject_idx
  ON business_v2.student_enrollment_evidence (subject_type, subject_key, recorded_at, id);

CREATE TABLE business_v2.student_enrollment_seats (
  id bigserial PRIMARY KEY,
  seat_key text NOT NULL UNIQUE CHECK (seat_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  order_id bigint NOT NULL REFERENCES business_v2.student_enrollment_orders(id),
  seat_number integer NOT NULL CHECK (seat_number > 0),
  participant_party_id bigint REFERENCES business_v2.parties(id),
  participant_evidence_sha256 text CHECK (
    participant_evidence_sha256 IS NULL OR participant_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  payer_relationship text NOT NULL CHECK (payer_relationship IN (
    'unknown', 'self_purchase_explicit', 'separate_payer', 'sponsor', 'not_applicable'
  )),
  state text NOT NULL CHECK (state IN (
    'unassigned', 'assigned', 'accepted', 'materialized', 'transferred', 'cancelled'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (order_id, seat_number),
  CHECK ((participant_party_id IS NULL) = (participant_evidence_sha256 IS NULL)),
  CHECK (state <> 'unassigned' OR participant_party_id IS NULL),
  CHECK (participant_party_id IS NOT NULL OR state IN ('unassigned', 'cancelled')),
  CHECK (created_at <= updated_at)
);
CREATE INDEX student_enrollment_seats_order_state_idx
  ON business_v2.student_enrollment_seats (order_id, state, seat_number);

CREATE TABLE business_v2.student_financial_agreements (
  id bigserial PRIMARY KEY,
  agreement_key text NOT NULL UNIQUE CHECK (agreement_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  order_id bigint NOT NULL UNIQUE REFERENCES business_v2.student_enrollment_orders(id),
  agreement_type text NOT NULL CHECK (agreement_type IN (
    'paid_in_full', 'installment', 'pay_as_you_go', 'invoice',
    'scholarship', 'complimentary', 'other_explicit'
  )),
  state text NOT NULL CHECK (state IN ('unverified', 'active', 'held', 'complete', 'cancelled')),
  source_reference_id bigint REFERENCES business_v2.student_enrollment_order_source_refs(id),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (created_at <= updated_at)
);

CREATE TABLE business_v2.student_financial_obligations (
  id bigserial PRIMARY KEY,
  obligation_key text NOT NULL UNIQUE CHECK (obligation_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  agreement_id bigint NOT NULL REFERENCES business_v2.student_financial_agreements(id),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  due_at timestamptz,
  state text NOT NULL CHECK (state IN (
    'not_due', 'due', 'paid', 'waived', 'cancelled', 'refunded', 'disputed'
  )),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (agreement_id, sequence_number),
  CHECK ((amount_minor IS NULL) = (currency IS NULL)),
  CHECK (created_at <= updated_at)
);
CREATE INDEX student_financial_obligations_due_idx
  ON business_v2.student_financial_obligations (state, due_at, id)
  WHERE state IN ('not_due', 'due', 'disputed');

CREATE TABLE business_v2.student_enrollments_v2 (
  id bigserial PRIMARY KEY,
  enrollment_key text NOT NULL UNIQUE CHECK (enrollment_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  order_id bigint NOT NULL REFERENCES business_v2.student_enrollment_orders(id),
  seat_id bigint NOT NULL REFERENCES business_v2.student_enrollment_seats(id),
  participant_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  offer_key text NOT NULL CHECK (offer_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  bundle_key text NOT NULL CHECK (bundle_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  bundle_version integer NOT NULL CHECK (bundle_version > 0),
  catalog_revision integer NOT NULL CHECK (catalog_revision > 0),
  state text NOT NULL CHECK (state IN ('pending', 'active', 'held', 'completed', 'withdrawn', 'cancelled')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  effective_at timestamptz,
  ended_at timestamptz,
  materialization_sha256 text NOT NULL CHECK (materialization_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (ended_at IS NULL OR effective_at IS NULL OR effective_at <= ended_at),
  CHECK (created_at <= updated_at)
);

CREATE UNIQUE INDEX student_enrollments_v2_current_seat_uniq
  ON business_v2.student_enrollments_v2 (seat_id)
  WHERE state IN ('pending', 'active', 'held');

CREATE TABLE business_v2.student_component_entitlements (
  id bigserial PRIMARY KEY,
  entitlement_key text NOT NULL UNIQUE CHECK (entitlement_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  enrollment_id bigint NOT NULL REFERENCES business_v2.student_enrollments_v2(id),
  component_key text NOT NULL CHECK (component_key ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'),
  grant_episode integer NOT NULL DEFAULT 1 CHECK (grant_episode > 0),
  state text NOT NULL CHECK (state IN ('included', 'conditional', 'earned_on_completion', 'held', 'revoked')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  UNIQUE (enrollment_id, component_key, grant_episode),
  CHECK (created_at <= updated_at)
);
CREATE INDEX student_component_entitlements_enrollment_idx
  ON business_v2.student_component_entitlements (enrollment_id, state, component_key);

CREATE TABLE business_v2.student_class_assignments (
  id bigserial PRIMARY KEY,
  assignment_key text NOT NULL UNIQUE CHECK (assignment_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  enrollment_id bigint NOT NULL REFERENCES business_v2.student_enrollments_v2(id),
  entitlement_id bigint NOT NULL REFERENCES business_v2.student_component_entitlements(id),
  delivery_block_key text NOT NULL CHECK (delivery_block_key ~ '^[a-z0-9][a-z0-9._:-]{0,249}$'),
  state text NOT NULL CHECK (state IN ('pending', 'active', 'completed', 'transferred', 'cancelled')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  schedule_evidence_sha256 text NOT NULL CHECK (schedule_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR starts_at <= ends_at),
  CHECK (created_at <= updated_at)
);
CREATE INDEX student_class_assignments_delivery_idx
  ON business_v2.student_class_assignments (delivery_block_key, state, enrollment_id);

CREATE TABLE business_v2.student_projection_outbox (
  id bigserial PRIMARY KEY,
  projection_key text NOT NULL UNIQUE CHECK (char_length(projection_key) BETWEEN 1 AND 500),
  target text NOT NULL CHECK (target IN ('student_roster', 'heartbeat', 'encharge', 'plutio')),
  subject_type text NOT NULL CHECK (subject_type IN ('order', 'seat', 'enrollment', 'entitlement', 'assignment', 'obligation', 'exception')),
  subject_key text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 300),
  subject_version integer NOT NULL CHECK (subject_version >= 0),
  state text NOT NULL CHECK (state IN ('queued', 'claimed', 'applied', 'verified', 'failed', 'held', 'superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1000),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  expected_readback_sha256 text NOT NULL CHECK (expected_readback_sha256 ~ '^[0-9a-f]{64}$'),
  payload_json jsonb NOT NULL CHECK (octet_length(payload_json::text) <= 8192),
  lease_token text,
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((state = 'claimed') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (created_at <= updated_at)
);
CREATE INDEX student_projection_outbox_work_idx
  ON business_v2.student_projection_outbox (state, target, updated_at, id)
  WHERE state IN ('queued', 'failed', 'held');

CREATE TABLE business_v2.student_projection_receipts (
  id bigserial PRIMARY KEY,
  receipt_key text NOT NULL UNIQUE CHECK (char_length(receipt_key) BETWEEN 1 AND 500),
  outbox_id bigint NOT NULL REFERENCES business_v2.student_projection_outbox(id),
  subject_version integer NOT NULL CHECK (subject_version >= 0),
  stage text NOT NULL CHECK (stage IN ('requested', 'accepted', 'applied', 'readback', 'final')),
  outcome text NOT NULL CHECK (outcome IN ('verified', 'failed', 'held', 'not_applicable', 'superseded')),
  result_code text NOT NULL CHECK (result_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE business_v2.student_enrollment_exceptions_v2 (
  id bigserial PRIMARY KEY,
  exception_key text NOT NULL UNIQUE CHECK (char_length(exception_key) BETWEEN 1 AND 500),
  subject_type text NOT NULL CHECK (subject_type IN ('order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement', 'obligation', 'projection')),
  subject_key text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 300),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  state text NOT NULL CHECK (state IN ('open', 'acknowledged', 'resolved', 'accepted_no_action', 'superseded')),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  owner_role text NOT NULL CHECK (owner_role IN ('enrollment_operator', 'finance_operator', 'owner_admin', 'projection_worker')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  review_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution_sha256 text CHECK (resolution_sha256 IS NULL OR resolution_sha256 ~ '^[0-9a-f]{64}$'),
  updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
  CHECK (first_seen_at <= last_seen_at),
  CHECK (resolved_at IS NULL OR resolved_at >= last_seen_at),
  CHECK ((state IN ('resolved', 'accepted_no_action', 'superseded')) = (resolved_at IS NOT NULL AND resolution_sha256 IS NOT NULL))
);
CREATE INDEX student_enrollment_exceptions_v2_open_idx
  ON business_v2.student_enrollment_exceptions_v2 (state, review_at, severity, id)
  WHERE state IN ('open', 'acknowledged');

CREATE TABLE business_v2.student_enrollment_history (
  id bigserial PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement', 'obligation', 'projection', 'exception')),
  subject_key text NOT NULL CHECK (char_length(subject_key) BETWEEN 1 AND 300),
  previous_version integer CHECK (previous_version IS NULL OR previous_version >= 0),
  new_version integer NOT NULL CHECK (new_version >= 0),
  command_key text NOT NULL CHECK (command_key ~ '^[a-z][a-z0-9_]{0,99}$'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (subject_type, subject_key, new_version),
  CHECK (previous_version IS NULL OR new_version = previous_version + 1)
);

CREATE TRIGGER student_enrollment_source_refs_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_order_source_refs
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
CREATE TRIGGER student_enrollment_evidence_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_evidence
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
CREATE TRIGGER student_projection_receipts_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_projection_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
CREATE TRIGGER student_enrollment_history_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_history
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE VIEW business_v2.v_student_enrollment_dark_health AS
SELECT
  (SELECT count(*) FROM business_v2.student_enrollment_orders) AS order_count,
  (SELECT count(*) FROM business_v2.student_enrollment_seats) AS seat_count,
  (SELECT count(*) FROM business_v2.student_enrollments_v2) AS enrollment_count,
  (SELECT count(*) FROM business_v2.student_projection_outbox WHERE state NOT IN ('verified', 'superseded')) AS pending_projection_count,
  (SELECT count(*) FROM business_v2.student_enrollment_exceptions_v2 WHERE state IN ('open', 'acknowledged')) AS open_exception_count;

COMMENT ON VIEW business_v2.v_student_enrollment_dark_health IS
  'Aggregate-only health for the default-off multi-source enrollment foundation.';

DO $$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'student_enrollment_orders', 'student_enrollment_order_source_refs',
    'student_enrollment_evidence',
    'student_enrollment_seats', 'student_financial_agreements',
    'student_financial_obligations', 'student_enrollments_v2',
    'student_component_entitlements', 'student_class_assignments',
    'student_projection_outbox', 'student_projection_receipts',
    'student_enrollment_exceptions_v2', 'student_enrollment_history'
  ] LOOP
    EXECUTE format('ALTER TABLE business_v2.%I OWNER TO nanoclaw_admin', object_name);
    EXECUTE format('REVOKE ALL ON business_v2.%I FROM PUBLIC', object_name);
    EXECUTE format('GRANT ALL ON business_v2.%I TO nanoclaw_admin', object_name);
  END LOOP;
  ALTER VIEW business_v2.v_student_enrollment_dark_health OWNER TO nanoclaw_admin;
  REVOKE ALL ON business_v2.v_student_enrollment_dark_health FROM PUBLIC;
  GRANT ALL ON business_v2.v_student_enrollment_dark_health TO nanoclaw_admin;
END $$;

DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'student_enrollment_orders_id_seq', 'student_enrollment_order_source_refs_id_seq',
    'student_enrollment_evidence_id_seq',
    'student_enrollment_seats_id_seq', 'student_financial_agreements_id_seq',
    'student_financial_obligations_id_seq', 'student_enrollments_v2_id_seq',
    'student_component_entitlements_id_seq', 'student_class_assignments_id_seq',
    'student_projection_outbox_id_seq', 'student_projection_receipts_id_seq',
    'student_enrollment_exceptions_v2_id_seq', 'student_enrollment_history_id_seq'
  ] LOOP
    EXECUTE format('ALTER SEQUENCE business_v2.%I OWNER TO nanoclaw_admin', sequence_name);
    EXECUTE format('REVOKE ALL ON SEQUENCE business_v2.%I FROM PUBLIC', sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE business_v2.%I TO nanoclaw_admin', sequence_name);
  END LOOP;
END $$;

COMMIT;
