#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/nanoclaw-watchdog.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: expected $expected, got $actual"
}

assert_true() {
  local label="$1"
  shift
  "$@" || fail "$label"
}

assert_false() {
  local label="$1"
  shift
  if "$@"; then
    fail "$label"
  fi
}

assert_eq 600 "$(heartbeat_interval_sec 600000)" "configured interval converts to seconds"
assert_eq 600 "$(heartbeat_interval_sec malformed)" "malformed interval fails safe to default"
assert_eq 900 "$(heartbeat_stale_after_sec 600000)" "production stale threshold remains 15 minutes"
assert_eq 1500 "$(heartbeat_stale_after_sec 1200000)" "custom interval gets a derived stale threshold"
assert_eq 780 "$(heartbeat_startup_grace_sec 600000)" "first-heartbeat grace includes bounded jitter"

if command -v jq >/dev/null 2>&1; then
  health_fixture='{"uptime":520.9,"channels":{"slack":{"connected":true}}}'
  parsed_uptime=$(echo "$health_fixture" | jq -r 'if (.uptime? | type) == "number" then (.uptime | floor) else "null" end')
  assert_eq 520 "$parsed_uptime" "health endpoint uptime is normalized for Bash arithmetic"
fi

# 2026-08-26 incident: the healthy daemon was restarted at 23:17:58 and the
# watchdog acted at 23:26:38, 520 seconds into a 600-second heartbeat interval.
assert_true "incident timeline is graced" \
  should_grace_stale_heartbeat true 520 780

assert_true "connected daemon just inside grace is graced" \
  should_grace_stale_heartbeat true 779 780
assert_false "grace expires at the boundary" \
  should_grace_stale_heartbeat true 780 780
assert_false "disconnected Slack is never hidden by startup grace" \
  should_grace_stale_heartbeat false 520 780
assert_false "missing uptime is never treated as startup" \
  should_grace_stale_heartbeat true null 780
assert_false "genuinely stale connected daemon still fails loud" \
  should_grace_stale_heartbeat true 1800 780

echo "PASS: nanoclaw watchdog heartbeat timing"
