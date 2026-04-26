#!/usr/bin/env bash
set -euo pipefail
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== generate-knowledge.sh bridge migration tests ==="

echo "Test 1: No direct claude --print calls"
if grep -v '^#' tools/generate-knowledge.sh | grep -q 'claude.*--print'; then
  fail "Still contains claude --print"
else
  pass "No direct claude --print calls"
fi

echo "Test 2: Uses BRIDGE_URL"
grep -q 'BRIDGE_URL' tools/generate-knowledge.sh && pass "References BRIDGE_URL" || fail "Missing BRIDGE_URL"

echo "Test 3: Uses X-Bridge-Key"
grep -q 'X-Bridge-Key' tools/generate-knowledge.sh && pass "Uses X-Bridge-Key" || fail "Missing X-Bridge-Key"

echo "Test 4: Loads CLAUDE_BRIDGE_KEY"
grep -q 'CLAUDE_BRIDGE_KEY' tools/generate-knowledge.sh && pass "Loads key" || fail "Missing key load"

echo "Test 5: Uses opus model"
grep -q '"model": "opus"' tools/generate-knowledge.sh && pass "Uses opus" || fail "Wrong model"

echo "Test 6: Captures curl exit code"
grep -q 'curl_exit=\$?' tools/generate-knowledge.sh && pass "Captures curl exit" || fail "Missing curl exit capture"

echo "Test 7: Pipes prompt file directly to python3"
grep -q '< "\$prompt_file"' tools/generate-knowledge.sh && pass "Pipes file directly" || fail "Not piping file"

echo "Test 8: No double collect-lessons.sh call"
count=$(grep -c '$COLLECT' tools/generate-knowledge.sh)
if [[ $count -le 1 ]]; then
  pass "Single collect call"
else
  fail "Multiple collect calls ($count)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
