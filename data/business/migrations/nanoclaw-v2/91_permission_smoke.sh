#!/usr/bin/env bash
# 91_permission_smoke.sh — Permission boundary verification for all 7 agent roles
# Uses has_table_privilege() and has_function_privilege() via nanoclaw_admin peer auth.
# These catalog functions check the target role's privileges without needing SET ROLE.
set -euo pipefail

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
DB="nanoclaw_business"

ROLES=(nanoclaw_inbox nanoclaw_sales nanoclaw_mailman nanoclaw_chief nanoclaw_booking nanoclaw_contador nanoclaw_procurement)
VIEWS=(v_party_contact_card v_active_pipeline v_active_engagements v_party_timeline v_client_status v_program_variant_seats)

CALLABLE_HELPERS=(
  "business_v2.fn_create_party(text,text,citext,text,jsonb)"
  "business_v2.fn_add_party_role(bigint,text)"
  "business_v2.fn_log_interaction_dedup(bigint,text,text,text,timestamptz,jsonb,text,text)"
  "business_v2.fn_log_interaction(bigint,text,text,text,timestamptz,jsonb)"
  "business_v2.fn_create_pipeline_entry(bigint,bigint,text,int,text,jsonb)"
  "business_v2.fn_advance_pipeline_stage(bigint,text,text)"
  "business_v2.fn_issue_document(bigint,text,int,text,jsonb)"
  "business_v2.fn_merge_parties(bigint,bigint,text)"
  "business_v2.canonical_party_id(bigint)"
  "business_v2.resolve_parties_by_email(citext)"
  "business_v2.best_party_by_email(citext)"
)

BASE_TABLES=(parties party_emails party_roles interactions documents pipeline_entries)
LOOKUP_TABLES=(role_types programs pipeline_stages document_types document_statuses interaction_channels interaction_directions source_providers)

pass=0
fail=0

run_sql() {
  $PSQL -U nanoclaw_admin -d "$DB" -t -A -c "$1" 2>&1
}

check_privilege() {
  local role="$1" check_fn="$2" object="$3" privs="$4" expected="$5" desc="$6"
  local result
  result=$(run_sql "SELECT $check_fn('$role', '$object', '$privs')")
  if [ "$result" = "$expected" ]; then
    echo "  PASS: $desc"
    ((pass++))
  else
    echo "  FAIL: $desc (expected=$expected, got=$result)"
    ((fail++))
  fi
}

for role in "${ROLES[@]}"; do
  echo "=== $role ==="

  # Should succeed: SELECT on views
  for view in "${VIEWS[@]}"; do
    check_privilege "$role" "has_table_privilege" "business_v2.$view" "SELECT" "t" \
      "SELECT view $view"
  done

  # Should succeed: SELECT on lookup tables
  for tbl in "${LOOKUP_TABLES[@]}"; do
    check_privilege "$role" "has_table_privilege" "business_v2.$tbl" "SELECT" "t" \
      "SELECT lookup $tbl"
  done

  # Should succeed: EXECUTE on callable helpers
  for fn in "${CALLABLE_HELPERS[@]}"; do
    shortname=$(echo "$fn" | sed 's/business_v2\.//')
    check_privilege "$role" "has_function_privilege" "$fn" "EXECUTE" "t" \
      "EXECUTE $shortname"
  done

  # Should fail: SELECT on base tables
  for tbl in "${BASE_TABLES[@]}"; do
    check_privilege "$role" "has_table_privilege" "business_v2.$tbl" "SELECT" "f" \
      "DENIED: SELECT base table $tbl"
  done

  # Should fail: INSERT on base tables
  for tbl in "${BASE_TABLES[@]}"; do
    check_privilege "$role" "has_table_privilege" "business_v2.$tbl" "INSERT" "f" \
      "DENIED: INSERT base table $tbl"
  done

  # Exception: procurement can access public.procurement_opportunities
  if [ "$role" = "nanoclaw_procurement" ]; then
    check_privilege "$role" "has_table_privilege" "public.procurement_opportunities" "SELECT" "t" \
      "SELECT public.procurement_opportunities"
    check_privilege "$role" "has_table_privilege" "public.procurement_opportunities" "INSERT" "t" \
      "INSERT public.procurement_opportunities"
  fi

  echo ""
done

echo "=== Summary ==="
echo "Passed: $pass"
echo "Failed: $fail"

if [ "$fail" -gt 0 ]; then
  echo "OVERALL: FAIL"
  exit 1
else
  echo "OVERALL: PASS"
  exit 0
fi
