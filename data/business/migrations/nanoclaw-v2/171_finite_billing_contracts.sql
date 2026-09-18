-- Finite website installment contracts. Host-owned; no agent grants or schedule loop.
BEGIN;
SET LOCAL search_path TO pg_catalog;

CREATE TABLE business_v2.finite_billing_contracts (
  contract_id uuid PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  billing_principal_id uuid NOT NULL,
  commerce_binding_id uuid NOT NULL,
  product_id text NOT NULL CHECK (product_id ~ '^[a-z0-9-]{1,100}$'),
  cadence text NOT NULL CHECK (cadence IN ('monthly','quarterly','annual')),
  timezone text NOT NULL CHECK (timezone='America/Chicago'),
  obligation_count integer NOT NULL CHECK (obligation_count BETWEEN 2 AND 24),
  total_cents bigint NOT NULL CHECK (total_cents>0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  schedule_sha256 text NOT NULL CHECK (schedule_sha256 ~ '^[a-f0-9]{64}$'),
  consent_sha256 text NOT NULL CHECK (consent_sha256 ~ '^[a-f0-9]{64}$'),
  binding_evidence_sha256 text NOT NULL CHECK (binding_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  first_submission_id uuid NOT NULL,
  first_order_id uuid NOT NULL,
  first_psp_reference text NOT NULL CHECK (char_length(first_psp_reference) BETWEEN 1 AND 100),
  state text NOT NULL CHECK (state IN ('active','past_due','customer_action','canceled','completed')),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  activated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(environment,billing_principal_id),
  UNIQUE(environment,first_submission_id),
  UNIQUE(environment,first_psp_reference)
);

CREATE TABLE business_v2.finite_billing_obligations (
  obligation_id uuid PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES business_v2.finite_billing_contracts(contract_id),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 24),
  due_at timestamptz NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents>0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  state text NOT NULL CHECK (state IN ('scheduled','claimed','awaiting_provider','dispatch_unknown','paid','customer_action','canceled')),
  paid_psp_reference text,
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(contract_id,ordinal),
  CHECK ((lease_token IS NULL)=(lease_until IS NULL)),
  CHECK (state<>'paid' OR paid_psp_reference IS NOT NULL)
);
CREATE INDEX finite_billing_due ON business_v2.finite_billing_obligations(state,due_at,contract_id,ordinal);

CREATE TABLE business_v2.finite_billing_attempts (
  attempt_id uuid PRIMARY KEY,
  obligation_id uuid NOT NULL REFERENCES business_v2.finite_billing_obligations(obligation_id),
  attempt_ordinal integer NOT NULL DEFAULT 0 CHECK (attempt_ordinal=0),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  command_sha256 text NOT NULL CHECK (command_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('prepared','dispatch_unknown','awaiting_provider','paid','customer_action')),
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(obligation_id,attempt_ordinal)
);

CREATE TABLE business_v2.finite_billing_receipts (
  receipt_sha256 text PRIMARY KEY CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  contract_id uuid NOT NULL REFERENCES business_v2.finite_billing_contracts(contract_id),
  obligation_id uuid REFERENCES business_v2.finite_billing_obligations(obligation_id),
  attempt_id uuid REFERENCES business_v2.finite_billing_attempts(attempt_id),
  kind text NOT NULL CHECK (kind IN ('activated','claimed','dispatch_accepted','dispatch_unknown','paid','customer_action','completed')),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE business_v2.finite_billing_recovery_requests (
  request_id uuid PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES business_v2.finite_billing_contracts(contract_id),
  obligation_id uuid NOT NULL UNIQUE REFERENCES business_v2.finite_billing_obligations(obligation_id),
  attempt_id uuid NOT NULL UNIQUE REFERENCES business_v2.finite_billing_attempts(attempt_id),
  amount_cents bigint NOT NULL CHECK (amount_cents>0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  state text NOT NULL CHECK (state IN ('required','prepared','paid','canceled')),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE business_v2.finite_billing_contracts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.finite_billing_obligations OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.finite_billing_attempts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.finite_billing_receipts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.finite_billing_recovery_requests OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.finite_billing_contracts,business_v2.finite_billing_obligations,business_v2.finite_billing_attempts,business_v2.finite_billing_receipts,business_v2.finite_billing_recovery_requests FROM PUBLIC;
COMMIT;
