#!/usr/bin/env bash
# 93_e2e_pipeline_test.sh — End-to-end integration test: full pipeline through business_v2
# Simulates 7 agent roles with PGOPTIONS identity injection using actual per-role credentials.
set -euo pipefail

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
DB="nanoclaw_business"
HOST="192.168.64.1"
ENV_FILE="$HOME/dev/NanoClaw/.env"

# Source passwords from .env
get_pass() {
  grep "^BUSINESS_DB_PASS_$1=" "$ENV_FILE" | cut -d= -f2-
}

run_as() {
  local agent="$1" role="$2" sql="$3"
  local pass_key
  pass_key=$(echo "$agent" | tr '[:lower:]' '[:upper:]')
  local pass
  pass=$(get_pass "$pass_key")
  PGOPTIONS="-c app.current_agent=$agent -c app.current_agent_role=$role" \
  PGPASSWORD="$pass" \
    $PSQL -U "$role" -h "$HOST" -d "$DB" -t -A -c "$sql"
}

run_as_admin() {
  $PSQL -U nanoclaw_admin -d "$DB" -t -A -c "$1"
}

echo "=== Step 0: Check for stale test data ==="
STALE=$(run_as_admin "SELECT count(*) FROM business_v2.parties WHERE primary_email IN ('test@e2e.com', 'vendor@e2e.com')")
if [ "$STALE" -gt 0 ]; then
  echo "Stale test data found ($STALE rows). Running cleanup first..."
  bash "$(dirname "$0")/93_e2e_cleanup.sh"
fi

echo "=== Step 1: As nanoclaw_inbox — create party + pipeline ==="
PARTY_ID=$(run_as inbox nanoclaw_inbox \
  "SELECT business_v2.fn_create_party('person', 'Test Lead', 'test@e2e.com', 'wordpress')")
echo "  Party ID: $PARTY_ID"

PROG_ID=$(run_as inbox nanoclaw_inbox \
  "SELECT id FROM business_v2.programs WHERE slug = 'coaching-inquiry'")
echo "  Program ID: $PROG_ID"

ENTRY_ID=$(run_as inbox nanoclaw_inbox \
  "SELECT business_v2.fn_create_pipeline_entry($PARTY_ID, $PROG_ID, 'new', 10000, 'USD', '{}')")
echo "  Pipeline Entry ID: $ENTRY_ID"

run_as inbox nanoclaw_inbox \
  "SELECT business_v2.fn_add_party_role($PARTY_ID, 'prospect')" > /dev/null
echo "  Role: prospect assigned"

run_as inbox nanoclaw_inbox \
  "SELECT business_v2.fn_log_interaction($PARTY_ID, 'form-submission', 'inbound', 'Coaching inquiry', NOW(), '{}')" > /dev/null
echo "  Interaction: form-submission logged"

echo "=== Step 2: As nanoclaw_sales — qualify + propose ==="
PIPELINE=$(run_as sales nanoclaw_sales \
  "SELECT stage FROM business_v2.v_active_pipeline WHERE party_id = $PARTY_ID")
echo "  Current stage: $PIPELINE"

run_as sales nanoclaw_sales \
  "SELECT business_v2.fn_advance_pipeline_stage($ENTRY_ID, 'qualifying', 'looks promising')" > /dev/null
echo "  Advanced to: qualifying"

DOC_ID=$(run_as sales nanoclaw_sales \
  "SELECT business_v2.fn_issue_document($PARTY_ID, 'proposal', 50000, 'USD', '{}')")
echo "  Document ID: $DOC_ID"

echo "=== Step 3: As nanoclaw_mailman — resolve + log + advance ==="
RESOLVED=$(run_as mailman nanoclaw_mailman \
  "SELECT business_v2.best_party_by_email('test@e2e.com')")
echo "  Resolved party: $RESOLVED (expected: $PARTY_ID)"
if [ "$RESOLVED" != "$PARTY_ID" ]; then
  echo "  FAIL: best_party_by_email mismatch"
  exit 1
fi

run_as mailman nanoclaw_mailman \
  "SELECT business_v2.fn_log_interaction($PARTY_ID, 'email', 'outbound', 'Proposal sent', NOW(), '{}')" > /dev/null
echo "  Interaction: outbound email logged"

run_as mailman nanoclaw_mailman \
  "SELECT business_v2.fn_advance_pipeline_stage($ENTRY_ID, 'proposal', 'email sent')" > /dev/null
echo "  Advanced to: proposal"

echo "=== Step 4: As nanoclaw_chief — view timeline + log escalation ==="
TIMELINE_COUNT=$(run_as chief nanoclaw_chief \
  "SELECT count(*) FROM business_v2.v_party_timeline WHERE party_id = $PARTY_ID")
echo "  Timeline events: $TIMELINE_COUNT"

run_as chief nanoclaw_chief \
  "SELECT business_v2.fn_log_interaction($PARTY_ID, 'other', 'internal', 'Chief review: test escalation', NOW(), '{\"test\": true}'::jsonb)" > /dev/null
echo "  Interaction: internal escalation logged"

echo "=== Step 5: As nanoclaw_contador — issue invoice ==="
INV_DOC=$(run_as contador nanoclaw_contador \
  "SELECT business_v2.fn_issue_document($PARTY_ID, 'invoice', 50000, 'USD', '{}')")
echo "  Invoice document ID: $INV_DOC"

echo "=== Step 6: As nanoclaw_booking — dedup interaction ==="
BOOKING_ID=$(run_as booking nanoclaw_booking \
  "SELECT business_v2.fn_log_interaction_dedup($PARTY_ID, 'booking', 'inbound', 'Coaching session', NOW(), '{\"trafft_appointment_id\":\"123\"}'::jsonb, 'trafft', '123')")
echo "  Booking interaction ID: $BOOKING_ID"

# Test idempotency
BOOKING_ID2=$(run_as booking nanoclaw_booking \
  "SELECT business_v2.fn_log_interaction_dedup($PARTY_ID, 'booking', 'inbound', 'Coaching session again', NOW(), '{\"trafft_appointment_id\":\"123\"}'::jsonb, 'trafft', '123')")
if [ "$BOOKING_ID" != "$BOOKING_ID2" ]; then
  echo "  FAIL: fn_log_interaction_dedup not idempotent: $BOOKING_ID vs $BOOKING_ID2"
  exit 1
fi
echo "  Dedup verified: same ID returned ($BOOKING_ID)"

echo "=== Step 7: As nanoclaw_procurement — vendor party + public.procurement_opportunities ==="
VENDOR_ID=$(run_as procurement nanoclaw_procurement \
  "SELECT business_v2.fn_create_party('org', 'Test Vendor', 'vendor@e2e.com', 'manual')")
echo "  Vendor Party ID: $VENDOR_ID"

run_as procurement nanoclaw_procurement \
  "SELECT business_v2.fn_add_party_role($VENDOR_ID, 'vendor')" > /dev/null
echo "  Role: vendor assigned"

run_as procurement nanoclaw_procurement \
  "INSERT INTO public.procurement_opportunities (bonfire_id, bonfire_url, title, agency, category, search_keyword, status, source) VALUES ('e2e-test-99', 'https://e2e.test', 'E2E Test Opp', 'Test Vendor', 'test', 'e2e-test', 'new', 'e2e')" > /dev/null
echo "  procurement_opportunities: row inserted"

run_as procurement nanoclaw_procurement \
  "SELECT business_v2.fn_log_interaction($VENDOR_ID, 'other', 'inbound', 'Opportunity logged', NOW(), '{}')" > /dev/null
echo "  Interaction: vendor opportunity logged"

echo ""
echo "=== Verification ==="

# V3: Timeline count >= 6
FINAL_TIMELINE=$(run_as_admin "SELECT count(*) FROM business_v2.v_party_timeline WHERE party_id = $PARTY_ID")
echo "  Timeline events for party $PARTY_ID: $FINAL_TIMELINE (expected >= 6)"
if [ "$FINAL_TIMELINE" -lt 6 ]; then
  echo "  FAIL: expected >= 6 timeline events"
  exit 1
fi

# V4: Agent identity captured
AGENTS=$(run_as_admin "SELECT DISTINCT last_updated_by FROM business_v2.interactions WHERE party_id = $PARTY_ID ORDER BY last_updated_by")
echo "  Agent identities captured: $(echo "$AGENTS" | tr '\n' ', ')"

# V5: Program ID matches
PROG_CHECK=$(run_as_admin "SELECT program_id FROM business_v2.pipeline_entries WHERE id = $ENTRY_ID")
echo "  Pipeline entry program_id: $PROG_CHECK (expected: $PROG_ID)"
if [ "$PROG_CHECK" != "$PROG_ID" ]; then
  echo "  FAIL: program_id mismatch"
  exit 1
fi

# V9: source_provider/source_id populated for dedup interaction
SOURCE_CHECK=$(run_as_admin "SELECT source_provider || ':' || source_id FROM business_v2.interactions WHERE party_id = $PARTY_ID AND source_provider = 'trafft'")
echo "  Dedup source: $SOURCE_CHECK (expected: trafft:123)"
if [ "$SOURCE_CHECK" != "trafft:123" ]; then
  echo "  FAIL: source columns not populated correctly"
  exit 1
fi

echo ""
echo "=== All 7 E2E steps PASSED ==="
echo ""
echo "=== Cleanup ==="
bash "$(dirname "$0")/93_e2e_cleanup.sh"

# V7+V8: Verify cleanup
REMAINING=$(run_as_admin "SELECT count(*) FROM business_v2.parties WHERE primary_email IN ('test@e2e.com', 'vendor@e2e.com')")
REMAINING_PROC=$(run_as_admin "SELECT count(*) FROM public.procurement_opportunities WHERE source = 'e2e'")
echo "  Remaining parties: $REMAINING (expected: 0)"
echo "  Remaining procurement rows: $REMAINING_PROC (expected: 0)"
if [ "$REMAINING" -gt 0 ] || [ "$REMAINING_PROC" -gt 0 ]; then
  echo "  FAIL: cleanup incomplete"
  exit 1
fi
echo "  Cleanup verified: all test data removed"
echo ""
echo "=== E2E INTEGRATION TEST COMPLETE ==="
