#!/bin/bash
# Vault hygiene — systematic data quality checks with auto-fix and AI dedup.
# Runs vault_hygiene.py, posts Slack summary if findings exist.

set -u

VAULT_ROOT="${HOME}/Vaults/My Notes"
VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
TOOL="${HOME}/dev/NanoClaw/tools/hygiene/vault_hygiene.py"
LOCK="/tmp/vault-hygiene.lock"
LOG="${HOME}/.local/log/vault-hygiene.log"
SLACK_CHANNEL="C0ANF38B91R"

# ── Logging ──────────────────────────────────────────────────────────────────

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; echo "$1"; }

# ── Lock ─────────────────────────────────────────────────────────────────────

if [ -f "$LOCK" ]; then
  pid=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    log "SKIP: already running (pid $pid)"
    exit 0
  fi
  log "WARN: stale lock removed (pid $pid)"
  rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# ── Slack ────────────────────────────────────────────────────────────────────

SLACK_BOT_TOKEN=""
if [ -f "${HOME}/dev/NanoClaw/.env" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2-)
fi

slack() {
  [ -z "$SLACK_BOT_TOKEN" ] && return
  local encoded
  encoded=$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null) || return 0
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$encoded}" \
    >/dev/null 2>&1 || true
}

# ── Ensure log dir ───────────────────────────────────────────────────────────

mkdir -p "$(dirname "$LOG")"

# ── Run ──────────────────────────────────────────────────────────────────────

log "Starting vault hygiene..."

OUTPUT=$("$VENV" "$TOOL" --vault-root "$VAULT_ROOT" "$@" 2>&1)
EXIT_CODE=$?

# Log full output
echo "$OUTPUT" >> "$LOG"

if [ $EXIT_CODE -ne 0 ]; then
  log "ERROR: vault hygiene failed (exit $EXIT_CODE)"
  slack "[HYGIENE] ❌ Failed (exit $EXIT_CODE). Check logs."
  exit $EXIT_CODE
fi

# Extract summary line (last line of print_report output)
SUMMARY=$(echo "$OUTPUT" | grep "^Summary:" | tail -1 | sed 's/^Summary: //')

if [ -n "$SUMMARY" ]; then
  # Only notify if there are findings
  if echo "$SUMMARY" | grep -qvE "^0 auto-fixes, 0 review items$"; then
    log "Findings: $SUMMARY"
    slack "[HYGIENE] $SUMMARY"
  else
    log "Clean: no findings"
  fi
else
  log "Done (no summary line)"
fi
