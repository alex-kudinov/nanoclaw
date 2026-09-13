BEGIN;

CREATE TABLE business_v2.contador_adyen_payments (
  delivery_id uuid NOT NULL,
  order_id uuid NOT NULL,
  psp_reference text PRIMARY KEY CHECK (char_length(psp_reference) BETWEEN 1 AND 100),
  merchant_reference text NOT NULL CHECK (char_length(merchant_reference) BETWEEN 1 AND 64),
  product_id text NOT NULL CHECK (product_id = 'mcq-program-a-foundations'),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  event_date timestamptz NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id),
  UNIQUE (merchant_reference)
);

COMMENT ON TABLE business_v2.contador_adyen_payments IS
  'Compatibility projection of WordPress-authoritative Adyen payments. No customer PII; Sheets remain the operational Bookkeeper views.';

ALTER TABLE business_v2.contador_adyen_payments OWNER TO nanoclaw_admin;
GRANT SELECT, INSERT, UPDATE ON business_v2.contador_adyen_payments TO nanoclaw_runtime;

COMMIT;
