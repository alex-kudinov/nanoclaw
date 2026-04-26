#!/usr/bin/env bash
# Test that merge-lessons.sh correctly calls the bridge instead of claude --print.
# Does NOT run the full merge — tests the bridge call in isolation.
set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== merge-lessons.sh bridge migration tests ==="

# --- Test 1: No direct claude references ---
echo ""
echo "Test 1: No direct 'claude --print' calls in merge-lessons.sh"
if grep -v '^#' tools/merge-lessons.sh | grep -q 'claude.*--print'; then
  fail "Still contains 'claude --print'"
else
  pass "No direct claude --print calls"
fi

# --- Test 2: Uses bridge URL ---
echo "Test 2: Uses CLAUDE_BRIDGE_URL"
if grep -q 'BRIDGE_URL' tools/merge-lessons.sh; then
  pass "References BRIDGE_URL"
else
  fail "Does not reference BRIDGE_URL"
fi

# --- Test 3: Uses bridge key ---
echo "Test 3: Uses X-Bridge-Key header"
if grep -q 'X-Bridge-Key' tools/merge-lessons.sh; then
  pass "Uses X-Bridge-Key header"
else
  fail "Missing X-Bridge-Key header"
fi

# --- Test 4: Loads bridge key from .env.shared ---
echo "Test 4: Loads CLAUDE_BRIDGE_KEY from .env.shared"
if grep -q 'CLAUDE_BRIDGE_KEY' tools/merge-lessons.sh; then
  pass "Loads CLAUDE_BRIDGE_KEY"
else
  fail "Does not load CLAUDE_BRIDGE_KEY"
fi

# --- Test 5: Parses bridge JSON response ---
echo "Test 5: Parses bridge response JSON"
if grep -q 'data.*result' tools/merge-lessons.sh; then
  pass "Extracts data.result from response"
else
  fail "Does not parse bridge response correctly"
fi

# --- Test 6: Checks bridge ok field ---
echo "Test 6: Checks bridge 'ok' field"
if grep -q 'bridge_ok' tools/merge-lessons.sh; then
  pass "Checks ok field in response"
else
  fail "Does not check ok field"
fi

# --- Test 7: Bridge is reachable (live test) ---
echo "Test 7: Bridge health check"
BRIDGE_URL="${CLAUDE_BRIDGE_URL:-http://100.115.115.206:40960}"
if curl -sf --max-time 5 "$BRIDGE_URL/health" >/dev/null 2>&1; then
  pass "Bridge is reachable at $BRIDGE_URL"
else
  fail "Bridge unreachable at $BRIDGE_URL"
fi

# --- Test 8: Bridge accepts a minimal prompt ---
echo "Test 8: Bridge accepts a prompt and returns valid JSON"
BRIDGE_KEY=""
if [[ -f "$HOME/dev/.env.shared" ]]; then
  BRIDGE_KEY=$(grep '^CLAUDE_BRIDGE_KEY=' "$HOME/dev/.env.shared" | cut -d= -f2- | tr -d "'" | tr -d '"') || true
fi
if [[ -n "$BRIDGE_KEY" ]]; then
  response=$(curl -sf --max-time 30 -X POST "$BRIDGE_URL/v1/print" \
    -H "Content-Type: application/json" \
    -H "X-Bridge-Key: $BRIDGE_KEY" \
    -d '{"prompt":"respond with exactly: BRIDGE_TEST_OK","model":"haiku"}' 2>/dev/null) || response=""
  if echo "$response" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["ok"]; assert d["data"]["result"]' 2>/dev/null; then
    pass "Bridge returned valid response"
  else
    fail "Bridge response invalid: ${response:0:200}"
  fi
else
  fail "CLAUDE_BRIDGE_KEY not available for live test"
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
