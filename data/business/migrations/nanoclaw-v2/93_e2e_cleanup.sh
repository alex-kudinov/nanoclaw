#!/usr/bin/env bash
# 93_e2e_cleanup.sh — Clean up E2E test data (runs as nanoclaw_admin)
set -euo pipefail

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
DB="nanoclaw_business"

# Uses peer auth (no -h flag = Unix socket = peer auth)
$PSQL -U nanoclaw_admin -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_id bigint; v_vendor_id bigint;
BEGIN
  -- Clean procurement test data first (no FK to business_v2)
  DELETE FROM public.procurement_opportunities WHERE source = 'e2e';

  -- Clean vendor party
  SELECT id INTO v_vendor_id FROM business_v2.parties WHERE primary_email = 'vendor@e2e.com';
  IF v_vendor_id IS NOT NULL THEN
    DELETE FROM business_v2.plutio_outbox WHERE party_id = v_vendor_id;
    DELETE FROM business_v2.interactions WHERE party_id = v_vendor_id;
    DELETE FROM business_v2.party_roles WHERE party_id = v_vendor_id;
    DELETE FROM business_v2.party_emails WHERE party_id = v_vendor_id;
    DELETE FROM business_v2.parties WHERE id = v_vendor_id;
  END IF;

  -- Clean main test party
  SELECT id INTO v_id FROM business_v2.parties WHERE primary_email = 'test@e2e.com';
  IF v_id IS NOT NULL THEN
    DELETE FROM business_v2.plutio_outbox WHERE party_id = v_id;
    DELETE FROM business_v2.pipeline_stage_history WHERE pipeline_entry_id IN (SELECT id FROM business_v2.pipeline_entries WHERE party_id = v_id);
    DELETE FROM business_v2.document_line_items WHERE document_id IN (SELECT id FROM business_v2.documents WHERE party_id = v_id);
    DELETE FROM business_v2.attachments WHERE interaction_id IN (SELECT id FROM business_v2.interactions WHERE party_id = v_id);
    DELETE FROM business_v2.documents WHERE party_id = v_id;
    DELETE FROM business_v2.interactions WHERE party_id = v_id;
    DELETE FROM business_v2.pipeline_entries WHERE party_id = v_id;
    DELETE FROM business_v2.party_roles WHERE party_id = v_id;
    DELETE FROM business_v2.party_emails WHERE party_id = v_id;
    DELETE FROM business_v2.parties WHERE id = v_id;
  END IF;

  -- Conditionally clean optional tables
  IF to_regclass('business_v2.party_phones') IS NOT NULL THEN
    EXECUTE 'DELETE FROM business_v2.party_phones WHERE party_id IN ($1, $2)' USING v_id, v_vendor_id;
  END IF;
  IF to_regclass('business_v2.party_addresses') IS NOT NULL THEN
    EXECUTE 'DELETE FROM business_v2.party_addresses WHERE party_id IN ($1, $2)' USING v_id, v_vendor_id;
  END IF;

  RAISE NOTICE 'E2E cleanup complete';
END $$;
SQL
