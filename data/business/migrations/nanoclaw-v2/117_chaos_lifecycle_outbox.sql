-- 117_chaos_lifecycle_outbox.sql
-- Durable, privacy-minimized delivery queue for authoritative lifecycle facts.
-- The row stores provider/canonical IDs and commerce metadata, but no email,
-- name, phone, or full provider payload. The sender resolves email transiently
-- from the existing private payments ledger immediately before delivery.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.chaos_lifecycle_outbox (
  id                         bigserial PRIMARY KEY,
  event_name                 text NOT NULL,
  source_system              text NOT NULL,
  source_event_id            text NOT NULL,
  canonical_transaction_id   text NOT NULL,
  provider_event_ids         text[] NOT NULL DEFAULT '{}'::text[],
  provider_object_ids        text[] NOT NULL DEFAULT '{}'::text[],
  occurred_at                timestamptz NOT NULL,
  amount_cents               bigint,
  currency                   text,
  properties                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                     text NOT NULL DEFAULT 'pending',
  attempts                   integer NOT NULL DEFAULT 0,
  next_attempt_at            timestamptz NOT NULL DEFAULT now(),
  last_attempted_at          timestamptz,
  sent_at                    timestamptz,
  last_error                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chaos_lifecycle_outbox_event_chk
    CHECK (event_name IN ('purchase_completed', 'purchase_refunded')),
  CONSTRAINT chaos_lifecycle_outbox_source_chk
    CHECK (source_system IN ('stripe-heartbeat', 'stripe-tandem')),
  CONSTRAINT chaos_lifecycle_outbox_source_event_uniq
    UNIQUE (source_system, source_event_id),
  CONSTRAINT chaos_lifecycle_outbox_transaction_chk
    CHECK (canonical_transaction_id ~ '^pi_[A-Za-z0-9_]+$'),
  CONSTRAINT chaos_lifecycle_outbox_status_chk
    CHECK (status IN ('pending', 'in_flight', 'failed', 'sent', 'dead_lettered')),
  CONSTRAINT chaos_lifecycle_outbox_amount_chk
    CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CONSTRAINT chaos_lifecycle_outbox_currency_chk
    CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE INDEX chaos_lifecycle_outbox_reaper_idx
  ON business_v2.chaos_lifecycle_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'in_flight');

COMMENT ON TABLE business_v2.chaos_lifecycle_outbox IS
  'Privacy-minimized Stripe lifecycle delivery queue. Email is resolved transiently from public.payments at send time and is not stored here.';

ALTER TABLE business_v2.chaos_lifecycle_outbox OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.chaos_lifecycle_outbox FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.chaos_lifecycle_outbox_id_seq FROM PUBLIC;
GRANT ALL ON business_v2.chaos_lifecycle_outbox TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.chaos_lifecycle_outbox_id_seq TO nanoclaw_admin;

COMMIT;

-- Transactional smoke checks: nothing persists.
BEGIN;
INSERT INTO business_v2.chaos_lifecycle_outbox
  (event_name, source_system, source_event_id, canonical_transaction_id,
   occurred_at, amount_cents, currency)
VALUES
  ('purchase_completed', 'stripe-heartbeat', 'pi_smoke', 'pi_smoke',
   now(), 100, 'USD');

DO $$
BEGIN
  BEGIN
    INSERT INTO business_v2.chaos_lifecycle_outbox
      (event_name, source_system, source_event_id, canonical_transaction_id,
       occurred_at)
    VALUES
      ('purchase_completed', 'stripe-heartbeat', 'pi_smoke', 'pi_smoke', now());
    RAISE EXCEPTION 'Smoke FAIL: duplicate source event accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO business_v2.chaos_lifecycle_outbox
      (event_name, source_system, source_event_id, canonical_transaction_id,
       occurred_at)
    VALUES
      ('purchase_completed', 'stripe-heartbeat', 'bad', 'cs_not_canonical', now());
    RAISE EXCEPTION 'Smoke FAIL: non-PI canonical transaction accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;
ROLLBACK;
