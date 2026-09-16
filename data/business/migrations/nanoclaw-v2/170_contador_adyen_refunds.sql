BEGIN;

CREATE TABLE IF NOT EXISTS business_v2.contador_adyen_refunds (
  delivery_id uuid NOT NULL,
  refund_id uuid NOT NULL UNIQUE,
  order_id uuid NOT NULL,
  refund_psp_reference text PRIMARY KEY CHECK (char_length(refund_psp_reference) BETWEEN 1 AND 100),
  payment_psp_reference text NOT NULL REFERENCES business_v2.contador_adyen_payments(psp_reference),
  request_reference text NOT NULL UNIQUE CHECK (char_length(request_reference) BETWEEN 1 AND 80),
  merchant_reference text NOT NULL CHECK (char_length(merchant_reference) BETWEEN 1 AND 64),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  cumulative_refunded_cents bigint NOT NULL CHECK (cumulative_refunded_cents >= amount_cents),
  remaining_paid_cents bigint NOT NULL CHECK (remaining_paid_cents >= 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  event_date timestamptz NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, request_reference),
  CHECK (request_reference LIKE merchant_reference || '-RF-%')
);

COMMENT ON TABLE business_v2.contador_adyen_refunds IS
  'PII-free compatibility projection of WordPress-authoritative signed Adyen refunds. Original payment and roster projections remain unchanged.';

ALTER TABLE business_v2.contador_adyen_refunds OWNER TO nanoclaw_admin;
GRANT SELECT, INSERT, UPDATE ON business_v2.contador_adyen_refunds TO nanoclaw_contador;

COMMIT;
