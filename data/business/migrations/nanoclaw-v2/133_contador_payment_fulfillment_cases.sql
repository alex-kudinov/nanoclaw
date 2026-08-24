-- 133_contador_payment_fulfillment_cases.sql
--
-- Host-owned, privacy-minimized operational closure for Stripe payment and
-- refund events. This is not an accounting ledger and grants no agent access.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.contador_payment_fulfillment_cases (
  id                         bigserial PRIMARY KEY,
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('heartbeat', 'tandem')
                             ),
  payment_intent_id          text NOT NULL CHECK (
                               payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
                             ),
  state                      text NOT NULL CHECK (
                               state IN (
                                 'processing', 'complete', 'needs_student',
                                 'needs_product', 'write_failed',
                                 'needs_review'
                               )
                             ),
  version                    integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  attempt_count              integer NOT NULL DEFAULT 1 CHECK (
                               attempt_count BETWEEN 1 AND 1000
                             ),
  lease_token                text CHECK (
                               lease_token IS NULL OR
                               lease_token ~
                                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             ),
  lease_expires_at           timestamptz,
  owner_group                text NOT NULL DEFAULT 'contador' CHECK (
                               owner_group = 'contador'
                             ),
  last_event_type            text NOT NULL CHECK (
                               last_event_type IN (
                                 'payment_intent.succeeded',
                                 'checkout.session.completed',
                                 'charge.refunded', 'refund.created',
                                 'refund.updated', 'charge.refund.updated'
                               )
                             ),
  last_source_object_id      text NOT NULL CHECK (
                               last_source_object_id ~ '^(pi|cs)_[A-Za-z0-9_]+$'
                             ),
  last_source_event_id       text NOT NULL CHECK (
                               char_length(last_source_event_id) BETWEEN 1 AND 300 AND
                               last_source_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  last_error_code            text CHECK (
                               last_error_code IS NULL OR
                               last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  last_evidence_sha256       text NOT NULL CHECK (
                               last_evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  review_deadline            timestamptz,
  first_observed_at          timestamptz NOT NULL,
  last_observed_at           timestamptz NOT NULL,
  resolved_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contador_payment_fulfillment_cases_identity_uniq
    UNIQUE (stripe_account, payment_intent_id),
  CONSTRAINT contador_payment_fulfillment_cases_resolution_chk CHECK (
    (state = 'complete') = (resolved_at IS NOT NULL)
  ),
  CONSTRAINT contador_payment_fulfillment_cases_lease_chk CHECK (
    (state = 'processing') =
      (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT contador_payment_fulfillment_cases_exception_chk CHECK (
    (state IN (
      'needs_student', 'needs_product', 'write_failed', 'needs_review'
    )) = (last_error_code IS NOT NULL AND review_deadline IS NOT NULL)
  ),
  CONSTRAINT contador_payment_fulfillment_cases_time_chk CHECK (
    first_observed_at <= last_observed_at
  )
);

CREATE INDEX contador_payment_fulfillment_cases_exception_idx
  ON business_v2.contador_payment_fulfillment_cases
    (state, review_deadline, last_observed_at, id)
  WHERE state <> 'complete';

CREATE TABLE business_v2.contador_payment_fulfillment_aliases (
  id                         bigserial PRIMARY KEY,
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.contador_payment_fulfillment_cases(id),
  stripe_account             text NOT NULL CHECK (
                               stripe_account IN ('heartbeat', 'tandem')
                             ),
  alias_kind                 text NOT NULL CHECK (
                               alias_kind IN (
                                 'payment_intent', 'checkout_session',
                                 'charge', 'invoice', 'refund', 'event'
                               )
                             ),
  alias_id                   text NOT NULL CHECK (
                               alias_id ~ '^(pi|cs|ch|in|re|evt)_[A-Za-z0-9_]+$'
                             ),
  recorded_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contador_payment_fulfillment_aliases_identity_uniq
    UNIQUE (stripe_account, alias_kind, alias_id)
);

CREATE INDEX contador_payment_fulfillment_aliases_case_idx
  ON business_v2.contador_payment_fulfillment_aliases
    (case_id, alias_kind, recorded_at, id);

CREATE TABLE business_v2.contador_payment_fulfillment_receipts (
  id                         bigserial PRIMARY KEY,
  receipt_key                text NOT NULL UNIQUE CHECK (
                               char_length(receipt_key) BETWEEN 1 AND 500 AND
                               receipt_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.contador_payment_fulfillment_cases(id),
  case_version               integer NOT NULL CHECK (case_version >= 0),
  stage                      text NOT NULL CHECK (
                               stage IN (
                                 'admission', 'stripe_source', 'payment_log',
                                 'postgres_payment', 'student_roster',
                                 'refund_fulfillment', 'final'
                               )
                             ),
  outcome                    text NOT NULL CHECK (
                               outcome IN (
                                 'verified', 'exception', 'failed',
                                 'not_applicable'
                               )
                             ),
  result_code                text NOT NULL CHECK (
                               result_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  source_event_id            text NOT NULL CHECK (
                               char_length(source_event_id) BETWEEN 1 AND 300 AND
                               source_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                             ),
  actor                      text NOT NULL CHECK (btrim(actor) <> ''),
  occurred_at                timestamptz NOT NULL,
  recorded_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contador_payment_fulfillment_receipts_case_idx
  ON business_v2.contador_payment_fulfillment_receipts
    (case_id, case_version, recorded_at, id);

CREATE TRIGGER contador_payment_fulfillment_aliases_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.contador_payment_fulfillment_aliases
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE TRIGGER contador_payment_fulfillment_receipts_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.contador_payment_fulfillment_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.contador_payment_fulfillment_cases IS
  'Host-owned current operational payment/refund fulfillment state. Contains opaque Stripe identity, state, counters, codes, hashes, and timestamps only; no names, email, product text, amount, card, accounting, or raw webhook content.';
COMMENT ON TABLE business_v2.contador_payment_fulfillment_aliases IS
  'Append-only opaque Stripe provider aliases bound to one Contador fulfillment case.';
COMMENT ON TABLE business_v2.contador_payment_fulfillment_receipts IS
  'Append-only content-minimized stage receipts. A script exit or Slack post is not a completion receipt.';

ALTER TABLE business_v2.contador_payment_fulfillment_cases
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.contador_payment_fulfillment_aliases
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.contador_payment_fulfillment_receipts
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.contador_payment_fulfillment_cases FROM PUBLIC;
REVOKE ALL ON business_v2.contador_payment_fulfillment_aliases FROM PUBLIC;
REVOKE ALL ON business_v2.contador_payment_fulfillment_receipts FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_cases_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_aliases_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_receipts_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.contador_payment_fulfillment_cases
  TO nanoclaw_admin;
GRANT ALL ON business_v2.contador_payment_fulfillment_aliases
  TO nanoclaw_admin;
GRANT ALL ON business_v2.contador_payment_fulfillment_receipts
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_cases_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_aliases_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.contador_payment_fulfillment_receipts_id_seq TO nanoclaw_admin;

COMMIT;
