-- 136_checkout_recovery_two_reminders.sql
--
-- Prospective, consented, two-touch checkout-recovery delivery ledger.
-- Separate from the existing shadow timer and owner projection.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.checkout_recovery_cases
  ADD COLUMN checkout_locale text,
  ADD COLUMN return_url text,
  ADD COLUMN product_name text,
  ADD CONSTRAINT checkout_recovery_case_locale_chk CHECK (
    checkout_locale IS NULL OR checkout_locale IN ('en', 'es', 'ja', 'fr')
  ),
  ADD CONSTRAINT checkout_recovery_case_return_url_chk CHECK (
    return_url IS NULL OR (
      char_length(return_url) BETWEEN 20 AND 1000 AND
      return_url ~ '^https://(www\.)?tandemcoach\.co/'
    )
  ),
  ADD CONSTRAINT checkout_recovery_case_product_name_chk CHECK (
    product_name IS NULL OR char_length(product_name) BETWEEN 1 AND 300
  );

CREATE TABLE business_v2.checkout_recovery_send_intents (
  id                         bigserial PRIMARY KEY,
  intent_uuid                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_cases(id),
  touch                      smallint NOT NULL CHECK (touch IN (1, 2)),
  due_at                     timestamptz NOT NULL,
  status                     text NOT NULL DEFAULT 'pending' CHECK (
                               status IN (
                                 'pending', 'leased', 'accepted', 'suppressed',
                                 'held', 'failed'
                               )
                             ),
  attempt_count              integer NOT NULL DEFAULT 0 CHECK (
                               attempt_count BETWEEN 0 AND 10
                             ),
  next_attempt_at            timestamptz NOT NULL,
  lease_token                uuid,
  lease_expires_at           timestamptz,
  accepted_at                timestamptz,
  suppressed_at              timestamptz,
  held_at                    timestamptz,
  last_error_code            text CHECK (
                               last_error_code IS NULL OR
                               last_error_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  payload_sha256             text CHECK (
                               payload_sha256 IS NULL OR
                               payload_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, touch),
  CONSTRAINT checkout_recovery_send_intent_terminal_chk CHECK (
    (status = 'accepted') = (accepted_at IS NOT NULL) AND
    (status = 'suppressed') = (suppressed_at IS NOT NULL) AND
    (status = 'held') = (held_at IS NOT NULL)
  ),
  CONSTRAINT checkout_recovery_send_intent_lease_chk CHECK (
    (status = 'leased') =
      (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX checkout_recovery_send_intents_due_idx
  ON business_v2.checkout_recovery_send_intents
    (next_attempt_at, due_at, id)
  WHERE status IN ('pending', 'failed', 'leased');

CREATE TABLE business_v2.checkout_recovery_send_receipts (
  id                         bigserial PRIMARY KEY,
  receipt_uuid               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  intent_id                  bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_send_intents(id),
  case_id                    bigint NOT NULL REFERENCES
                               business_v2.checkout_recovery_cases(id),
  touch                      smallint NOT NULL CHECK (touch IN (1, 2)),
  attempt_number             integer NOT NULL CHECK (
                               attempt_number BETWEEN 0 AND 10
                             ),
  receipt_type               text NOT NULL CHECK (
                               receipt_type IN (
                                 'scheduled', 'leased', 'provider_event_accepted',
                                 'retry_scheduled', 'suppressed', 'held'
                               )
                             ),
  outcome                    text NOT NULL CHECK (
                               outcome IN (
                                 'verified', 'accepted', 'retryable',
                                 'suppressed', 'held'
                               )
                             ),
  result_code                text NOT NULL CHECK (
                               result_code ~ '^[a-z][a-z0-9_]{0,99}$'
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  occurred_at                timestamptz NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intent_id, attempt_number, receipt_type, result_code)
);

CREATE INDEX checkout_recovery_send_receipts_case_idx
  ON business_v2.checkout_recovery_send_receipts(case_id, id);

CREATE TRIGGER checkout_recovery_send_receipts_append_only
BEFORE UPDATE OR DELETE ON business_v2.checkout_recovery_send_receipts
FOR EACH ROW EXECUTE FUNCTION business_v2.fn_checkout_recovery_append_only();

ALTER TABLE business_v2.checkout_recovery_send_intents
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.checkout_recovery_send_receipts
  OWNER TO nanoclaw_admin;

ALTER SEQUENCE business_v2.checkout_recovery_send_intents_id_seq
  OWNER TO nanoclaw_admin;
ALTER SEQUENCE business_v2.checkout_recovery_send_receipts_id_seq
  OWNER TO nanoclaw_admin;

REVOKE ALL ON TABLE
  business_v2.checkout_recovery_send_intents,
  business_v2.checkout_recovery_send_receipts
  FROM PUBLIC;

REVOKE ALL ON SEQUENCE
  business_v2.checkout_recovery_send_intents_id_seq,
  business_v2.checkout_recovery_send_receipts_id_seq
  FROM PUBLIC;

COMMIT;
