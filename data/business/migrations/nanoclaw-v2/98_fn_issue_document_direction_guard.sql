-- 98_fn_issue_document_direction_guard.sql
--
-- Skip Plutio outbox enqueue for inbound documents (vendor bills logged by
-- contador from emailed invoices). Without this guard, every emailed invoice
-- forwarded by mailman → contador becomes a "create invoice in Plutio"
-- request, treating Tandem as the issuer instead of the recipient.
--
-- Caller convention: pass `"direction": "inbound"` in p_metadata for
-- received documents (vendor bills, supplier statements). Omit or use
-- `"direction": "outbound"` for documents Tandem issues to clients
-- (proposals, contracts, customer invoices).
--
-- Outbox row #35 (2026-04-28) was the trigger for this fix: contador logged
-- a vendor invoice via fn_issue_document, the outbox enqueued it, the reaper
-- pushed it to Plutio /invoices as a customer invoice, dead-lettered after 5
-- attempts (also blocked downstream by the unrelated CLI mismatch fixed in
-- src/plutio-outbox-reaper.ts).
--
-- Online-safe: CREATE OR REPLACE FUNCTION; in-flight calls finish on the old
-- definition, new calls use the new one. Grants are preserved.
--
-- Depends: 11_helpers.sql (original fn_issue_document definition)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE OR REPLACE FUNCTION business_v2.fn_issue_document(
  p_party_id bigint,
  p_kind text,
  p_amount_cents int,
  p_currency text,
  p_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_canonical bigint;
  v_doc_id bigint;
  v_agent text;
  v_direction text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_canonical := business_v2.canonical_party_id(p_party_id);
  v_direction := COALESCE(p_metadata->>'direction', 'outbound');

  -- Insert document
  INSERT INTO business_v2.documents
    (party_id, kind, status, amount_cents, currency, metadata, last_updated_by)
  VALUES
    (v_canonical, p_kind, 'draft', p_amount_cents, p_currency,
     COALESCE(p_metadata, '{}'::jsonb), v_agent)
  RETURNING id INTO v_doc_id;

  -- Record interaction
  INSERT INTO business_v2.interactions
    (party_id, channel, direction, subject, occurred_at, metadata, last_updated_by)
  VALUES
    (v_canonical, 'other',
     CASE WHEN v_direction = 'inbound' THEN 'inbound' ELSE 'outbound' END,
     format('Document issued: %s #%s', p_kind, v_doc_id),
     now(),
     jsonb_build_object('document_id', v_doc_id, 'document_kind', p_kind),
     v_agent);

  -- Emit outbox for Plutio sync ONLY for outbound documents Tandem issues
  -- to clients. Inbound documents (vendor bills) are logged for the audit
  -- trail but never pushed to Plutio's /invoices /proposals /contracts —
  -- those endpoints are for documents we issue, not documents we receive.
  IF v_direction != 'inbound'
     AND p_kind IN ('proposal', 'contract', 'invoice', 'receipt') THEN
    INSERT INTO business_v2.plutio_outbox
      (operation, kind, party_id, document_id, payload, last_updated_by)
    VALUES
      ('create', p_kind, v_canonical, v_doc_id,
       jsonb_build_object('kind', p_kind, 'party_id', v_canonical,
                          'document_id', v_doc_id, 'amount_cents', p_amount_cents),
       v_agent);
  END IF;

  RETURN v_doc_id;
END;
$$;

ALTER FUNCTION business_v2.fn_issue_document(bigint, text, int, text, jsonb) OWNER TO nanoclaw_admin;

COMMIT;
