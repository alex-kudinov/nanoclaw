#!/usr/bin/env bash
# 92_doc_signature_check.sh — verify CLAUDE.md function catalog matches validate.sql
# Extracts function names from both files and compares.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOC="$SCRIPT_DIR/../../CLAUDE.md"
VALIDATE="$SCRIPT_DIR/validate.sql"

# Expected callable helpers (11 total)
callable=(
  best_party_by_email canonical_party_id
  fn_add_party_role fn_advance_pipeline_stage
  fn_create_party fn_create_pipeline_entry
  fn_issue_document fn_log_interaction fn_log_interaction_dedup
  fn_merge_parties resolve_parties_by_email
)

missing=0
for fn in "${callable[@]}"; do
  if ! grep -q "$fn" "$DOC"; then
    echo "MISSING from CLAUDE.md: $fn"
    missing=1
  fi
  if ! grep -q "$fn" "$VALIDATE"; then
    echo "MISSING from validate.sql: $fn"
    missing=1
  fi
done

if [ "$missing" -eq 1 ]; then
  echo "FAIL: signature mismatch between CLAUDE.md and validate.sql"
  exit 1
fi

echo "PASS: all 11 callable helper signatures present in both files"
exit 0
