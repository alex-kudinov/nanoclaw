-- 111_v_inbound_documents.sql
--
-- Expose inbound documents (vendor bills / supplier statements that contador
-- logs from emailed invoices) as a stable, read-only contract for the bizmgr
-- bookkeeping pipeline.
--
-- Why a view instead of a base-table grant: 14_grants.sql deliberately gives
-- no role except nanoclaw_admin SELECT on business_v2.documents. The only
-- granted view that touches documents is v_party_timeline, which omits
-- amount_cents / due_at / metadata and hardcodes direction = 'outbound' — so
-- it cannot describe a received vendor bill at all. Rather than widen a
-- timeline view with billing detail (a surface other agents already read), or
-- hand a downstream consumer admin credentials, this adds a purpose-built
-- read surface.
--
-- Normalization, and why it is needed: fn_issue_document (see
-- 98_fn_issue_document_direction_guard.sql) inserts only party_id, kind,
-- status, amount_cents, currency, metadata, last_updated_by. It never sets
-- issued_at, due_at, or document_number, so on every contador-logged bill
-- those three columns are NULL and the real values live in metadata
-- ('due_date', 'invoice_number'). Consumers should not have to know that, so
-- the view coalesces base column first, metadata second.
--
-- Line items are aggregated to keep this one row per document. As of this
-- migration business_v2.document_line_items is empty (fn_issue_document does
-- not populate it), so line_items is '[]' for every current row; the shape is
-- here so the contract does not change when contador starts writing them.
--
-- Inbound test: COALESCE(metadata->>'direction','outbound') = 'inbound',
-- matching fn_issue_document's own default rather than assuming the key is
-- always present.
--
-- Online-safe: CREATE OR REPLACE VIEW, additive. Reversible with DROP VIEW.
--
-- Depends: 09_documents.sql, 03_parties.sql,
--          98_fn_issue_document_direction_guard.sql (direction convention)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE OR REPLACE VIEW business_v2.v_inbound_documents AS
SELECT
  d.id                AS document_id,
  d.party_id,
  p.display_name      AS party_name,
  p.legal_name        AS party_legal_name,
  p.primary_email     AS party_email,
  d.kind,
  d.status,
  d.currency,
  d.amount_cents,

  -- Normalized natural key: base column first, metadata fallback.
  COALESCE(d.document_number, d.metadata->>'invoice_number') AS invoice_number,

  -- Normalized dates. fn_issue_document leaves both base columns NULL.
  COALESCE(d.issued_at, d.created_at)                        AS issued_at,
  COALESCE(
    d.due_at,
    CASE
      WHEN d.metadata->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (d.metadata->>'due_date')::timestamptz
    END
  )                                                          AS due_at,

  d.metadata->>'vendor'       AS vendor_name,
  d.metadata->>'source_email' AS source_email,
  d.metadata->>'subject'      AS subject,

  d.source_provider,
  d.source_id,
  d.interaction_id,
  d.metadata,

  COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'line_order',       li.line_order,
                 'description',      li.description,
                 'quantity',         li.quantity,
                 'unit_price_cents', li.unit_price_cents,
                 'subtotal_cents',   li.subtotal_cents,
                 'metadata',         li.metadata
               )
               ORDER BY li.line_order
             )
        FROM business_v2.document_line_items li
       WHERE li.document_id = d.id
    ),
    '[]'::jsonb
  ) AS line_items,

  d.created_at,
  d.updated_at,
  -- Stored values currently arrive quote-wrapped for contador ("'contador'");
  -- trimmed here so consumers get a clean agent name.
  btrim(d.last_updated_by, '''') AS last_updated_by

FROM business_v2.documents d
JOIN business_v2.parties p ON p.id = d.party_id
WHERE COALESCE(d.metadata->>'direction', 'outbound') = 'inbound';

ALTER VIEW business_v2.v_inbound_documents OWNER TO nanoclaw_admin;

COMMENT ON VIEW business_v2.v_inbound_documents IS
  'Inbound documents (vendor bills) with metadata-normalized invoice_number/due_at and aggregated line items. Read contract for the bizmgr bookkeeping pipeline. One row per document.';

-- Read-only consumers. nanoclaw_readonly is NOLOGIN (grant-only group role);
-- the actual bizmgr login principal is granted in 112.
GRANT SELECT ON business_v2.v_inbound_documents
   TO nanoclaw_readonly, nanoclaw_contador;

COMMIT;
