-- 09_documents.sql — documents + document_line_items
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T8 (interactions)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- documents — proposals, contracts, invoices, certificates, etc.
CREATE TABLE business_v2.documents (
  id bigserial PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  kind text NOT NULL REFERENCES business_v2.document_kinds(key),
  status text NOT NULL REFERENCES business_v2.document_statuses(key),
  issued_at timestamptz,
  due_at timestamptz,
  amount_cents int,
  currency text NOT NULL DEFAULT 'USD',
  document_number text,
  source_provider text REFERENCES business_v2.source_providers(key),
  source_id text,
  interaction_id bigint REFERENCES business_v2.interactions(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown'
);

CREATE UNIQUE INDEX documents_source_uniq
  ON business_v2.documents (source_provider, source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE business_v2.documents IS 'Business documents: proposals, contracts, invoices, certificates.';

-- document_line_items — line-level detail for invoices/proposals
CREATE TABLE business_v2.document_line_items (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES business_v2.documents(id),
  line_order int NOT NULL,
  description text,
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  unit_price_cents int NOT NULL DEFAULT 0,
  subtotal_cents int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE business_v2.document_line_items IS 'Line items for invoices, proposals, and other financial documents.';

COMMIT;
