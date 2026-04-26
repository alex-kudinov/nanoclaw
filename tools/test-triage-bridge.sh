#!/usr/bin/env bash
set -euo pipefail
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== triage.py bridge migration tests ==="

echo "Test 1: No direct claude --print calls"
if grep -v '^#' tools/onedrive/triage.py | grep -q "'claude'.*'--print'"; then
  fail "Still contains claude --print subprocess"
else
  pass "No direct claude --print calls"
fi

echo "Test 2: Uses bridge URL"
grep -q 'CLAUDE_BRIDGE_URL\|100.115.115.206:40960' tools/onedrive/triage.py && pass "References bridge URL" || fail "Missing bridge URL"

echo "Test 3: Uses X-Bridge-Key"
grep -q 'X-Bridge-Key' tools/onedrive/triage.py && pass "Uses X-Bridge-Key" || fail "Missing X-Bridge-Key"

echo "Test 4: Loads key from .env.shared"
grep -q 'CLAUDE_BRIDGE_KEY' tools/onedrive/triage.py && pass "Loads bridge key" || fail "Missing key load"

echo "Test 5: Passes system_prompt to bridge"
grep -q '"system_prompt"' tools/onedrive/triage.py && pass "Passes system_prompt" || fail "Missing system_prompt"

echo "Test 6: Checks bridge ok field"
grep -q 'bridge_result.*ok' tools/onedrive/triage.py && pass "Checks ok field" || fail "Missing ok check"

echo "Test 7: Extracts data.result"
grep -q 'data.*result' tools/onedrive/triage.py && pass "Extracts result" || fail "Missing result extraction"

echo "Test 8: Python syntax valid"
python3 -c "import py_compile; py_compile.compile('tools/onedrive/triage.py', doraise=True)" 2>/dev/null && pass "Python compiles" || fail "Syntax error"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
