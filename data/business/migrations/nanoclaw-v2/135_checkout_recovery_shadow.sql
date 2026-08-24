-- 135_checkout_recovery_shadow.sql
--
-- Host-owned, privacy-minimized checkout recovery truth layer. Shadow only:
-- no outbox, send authority, CRM write, or agent grants.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.checkout_recovery_cases (
  id                         bigserial PRIMARY KEY,
  case_uuid                  uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  source_system              text NOT NULL CHECK (
                               source_system IN ('tandemweb', 'stripe')
                             ),
  source_case_key            text NOT NULL CHECK (
                               char_length(source_case_key) BETWEEN 1 AND 500 AND
                               source_case_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('tandem', 'heartbeat')
                             ),
  state                      text NOT NULL CHECK (
                               state IN (
                                 'captured', 'payment_created', 'payment_failed',
                                 'client_abandoned', 'shadow_ready', 'purchased',
                                 'recovered', 'suppressed', 'expired', 'held',
                                 'closed'
                               )
                             ),
  version                    integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  program_slug               text CHECK (
                               program_slug IS NULL OR
                               (char_length(program_slug) BETWEEN 1 AND 200 AND
                                program_slug ~ '^[a-z0-9][a-z0-9._:-]*$')
                             ),
  product_slug               text CHECK (
                               product_slug IS NULL OR
                               (char_length(product_slug) BETWEEN 1 AND 300 AND
                                product_slug ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
                             ),
  amount_cents               bigint CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency                   text CHECK (
                               currency IS NULL OR currency ~ '^[a-z]{3}$'
                             ),
  contact_email              citext,
  email_sha256               text CHECK (
                               email_sha256 IS NULL OR email_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  consent_state              text NOT NULL DEFAULT 'unknown' CHECK (
                               consent_state IN ('unknown', 'denied', 'granted')
                             ),
  consent_policy_version     text CHECK (
                               consent_policy_version IS NULL OR
                               (char_length(consent_policy_version) BETWEEN 1 AND 100 AND
                                consent_policy_version ~ '^[a-z0-9][a-z0-9._:-]*$')
                             ),
  eligibility_state          text NOT NULL DEFAULT 'unknown' CHECK (
                               eligibility_state IN ('unknown', 'ineligible', 'eligible')
                             ),
  suppression_code           text CHECK (
                               suppression_code IS NULL OR
                               suppression_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  last_event_type            text NOT NULL CHECK (
                               last_event_type ~ '^[a-z][a-z0-9_.]{0,99}$'
                             ),
  last_source_event_key      text NOT NULL CHECK (
                               char_length(last_source_event_key) BETWEEN 1 AND 500
                             ),
  last_evidence_sha256       text NOT NULL CHECK (
                               last_evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  started_at                 timestamptz NOT NULL,
  last_observed_at           timestamptz NOT NULL,
  shadow_due_at              timestamptz,
  shadow_ready_at            timestamptz,
  purchased_at               timestamptz,
  closed_at                  timestamptz,
  owner_review_deadline      timestamptz,
  shadow_notified_at         timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_case_key),
  CONSTRAINT checkout_recovery_case_time_chk CHECK (
    started_at <= last_observed_at AND
    (shadow_due_at IS NULL OR started_at <= shadow_due_at) AND
    (shadow_ready_at IS NULL OR started_at <= shadow_ready_at) AND
    (purchased_at IS NULL OR started_at <= purchased_at) AND
    (closed_at IS NULL OR started_at <= closed_at)
  ),
  CONSTRAINT checkout_recovery_case_email_chk CHECK (
    (contact_email IS NULL) = (email_sha256 IS NULL)
  ),
  CONSTRAINT checkout_recovery_case_terminal_chk CHECK (
    (state IN ('purchased', 'recovered')) = (purchased_at IS NOT NULL)
  )
);

CREATE INDEX checkout_recovery_cases_shadow_idx
  ON business_v2.checkout_recovery_cases
    (stripe_account, state, shadow_due_at, id)
  WHERE state NOT IN ('purchased', 'recovered', 'closed');

CREATE INDEX checkout_recovery_cases_email_idx
  ON business_v2.checkout_recovery_cases
    (stripe_account, email_sha256, product_slug, started_at DESC)
  WHERE email_sha256 IS NOT NULL;

CREATE TABLE business_v2.checkout_recovery_aliases (
  id                         bigserial PRIMARY KEY,
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_cases(id),
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('tandem', 'heartbeat')
                             ),
  alias_kind                 text NOT NULL CHECK (
                               alias_kind IN (
                                 'checkout_token', 'payment_intent',
                                 'checkout_session', 'charge', 'event',
                                 'recovered_from'
                               )
                             ),
  alias_id                   text NOT NULL CHECK (
                               char_length(alias_id) BETWEEN 1 AND 500 AND
                               alias_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_account, alias_kind, alias_id)
);

CREATE INDEX checkout_recovery_aliases_case_idx
  ON business_v2.checkout_recovery_aliases(case_id, id);

CREATE TABLE business_v2.checkout_recovery_events (
  id                         bigserial PRIMARY KEY,
  event_uuid                 uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_cases(id),
  schema_version             integer NOT NULL CHECK (schema_version = 1),
  source_system              text NOT NULL CHECK (
                               source_system IN ('tandemweb', 'stripe', 'host_timeout')
                             ),
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('tandem', 'heartbeat')
                             ),
  source_event_key           text NOT NULL UNIQUE CHECK (
                               char_length(source_event_key) BETWEEN 1 AND 500 AND
                               source_event_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  event_type                 text NOT NULL CHECK (
                               event_type ~ '^[a-z][a-z0-9_.]{0,99}$'
                             ),
  observed_at                timestamptz NOT NULL,
  received_at                timestamptz NOT NULL DEFAULT now(),
  webhook_inbox_id           bigint UNIQUE REFERENCES
                               business_v2.webhook_inbox(id),
  payload_sha256             text NOT NULL CHECK (
                               payload_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  previous_state             text,
  next_state                 text NOT NULL,
  result_code                text NOT NULL CHECK (
                               result_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  facts                      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                               jsonb_typeof(facts) = 'object' AND
                               octet_length(facts::text) <= 4096
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkout_recovery_events_case_idx
  ON business_v2.checkout_recovery_events(case_id, observed_at, id);

CREATE TABLE business_v2.checkout_recovery_receipts (
  id                         bigserial PRIMARY KEY,
  receipt_uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_cases(id),
  case_version               integer NOT NULL CHECK (case_version >= 0),
  receipt_type               text NOT NULL CHECK (
                               receipt_type IN (
                                 'admission', 'alias_binding', 'state_transition',
                                 'shadow_projection', 'suppression', 'closure'
                               )
                             ),
  outcome                    text NOT NULL CHECK (
                               outcome IN (
                                 'verified', 'no_op', 'held', 'ineligible',
                                 'not_applicable'
                               )
                             ),
  result_code                text NOT NULL CHECK (
                               result_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  source_event_key           text NOT NULL CHECK (
                               char_length(source_event_key) BETWEEN 1 AND 500
                             ),
  occurred_at                timestamptz NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, case_version, receipt_type, source_event_key)
);

CREATE OR REPLACE FUNCTION business_v2.fn_checkout_recovery_event_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.case_id IS DISTINCT FROM NEW.case_id OR
     OLD.source_event_key IS DISTINCT FROM NEW.source_event_key OR
     OLD.event_type IS DISTINCT FROM NEW.event_type OR
     OLD.payload_sha256 IS DISTINCT FROM NEW.payload_sha256 OR
     OLD.observed_at IS DISTINCT FROM NEW.observed_at THEN
    RAISE EXCEPTION 'checkout recovery event core fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_recovery_events_core_immutable
BEFORE UPDATE ON business_v2.checkout_recovery_events
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_checkout_recovery_event_immutable();

CREATE OR REPLACE FUNCTION business_v2.fn_checkout_recovery_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'checkout recovery history is append-only';
END;
$$;

CREATE TRIGGER checkout_recovery_events_no_delete
BEFORE DELETE ON business_v2.checkout_recovery_events
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_checkout_recovery_append_only();

CREATE TRIGGER checkout_recovery_receipts_append_only
BEFORE UPDATE OR DELETE ON business_v2.checkout_recovery_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_checkout_recovery_append_only();

REVOKE ALL ON TABLE
  business_v2.checkout_recovery_cases,
  business_v2.checkout_recovery_aliases,
  business_v2.checkout_recovery_events,
  business_v2.checkout_recovery_receipts
FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.checkout_recovery_cases_id_seq,
  business_v2.checkout_recovery_aliases_id_seq,
  business_v2.checkout_recovery_events_id_seq,
  business_v2.checkout_recovery_receipts_id_seq
FROM PUBLIC;

COMMIT;
