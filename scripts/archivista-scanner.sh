#!/usr/bin/env bash
# archivista-scanner.sh — Scan cloud sources and write file catalog to Obsidian vault
# Triggered by launchd WatchPaths + StartInterval
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

NANOCLAW="${HOME}/dev/NanoClaw"
VAULT="${HOME}/Vaults/My notes"
SCANNER="${NANOCLAW}/tools/archivista/scan.py"
PYTHON="${NANOCLAW}/tools/onedrive/.venv/bin/python3"
SOURCES="${VAULT}/Archivista/Sources.md"
LOG="${HOME}/.local/log/archivista-scanner.log"
LOCK="/tmp/archivista-scanner.lock"
SLACK_CHANNEL="C0ANG8UPTJ7"

# Load bot token from NanoClaw .env
SLACK_BOT_TOKEN=""
if [ -f "${NANOCLAW}/.env" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "${NANOCLAW}/.env" | cut -d= -f2- || true)
fi

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

slack() {
  [ -z "$SLACK_BOT_TOKEN" ] && return
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    >/dev/null 2>&1 || true
}

# Prevent overlapping runs
if [ -f "$LOCK" ]; then
  pid=$(cat "$LOCK" 2>/dev/null || true)
  if kill -0 "$pid" 2>/dev/null; then
    log "SKIP: already running (pid $pid)"
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Pre-step: refresh meta directory copies (Tag Registry, CLAUDE.md)
if [ -f "${VAULT}/Tag Registry.md" ]; then
  rsync -u "${VAULT}/Tag Registry.md" "${VAULT}/meta/Tag Registry.md" 2>/dev/null || true
fi
if [ -f "${VAULT}/CLAUDE.md" ]; then
  rsync -u "${VAULT}/CLAUDE.md" "${VAULT}/meta/CLAUDE.md" 2>/dev/null || true
fi

# Run scanner
log "Starting scan..."
summary=$("$PYTHON" "$SCANNER" --sources-file "$SOURCES" --vault-root "$VAULT" 2>>"$LOG") || {
  log "FAIL: scanner exited with error"
  slack "[ARCHIVISTA] Scanner failed — check logs"
  exit 1
}

# Parse JSON summary from stdout
new_count=$(echo "$summary" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("new",0))' 2>/dev/null || echo "0")
updated_count=$(echo "$summary" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("updated",0))' 2>/dev/null || echo "0")
error_count=$(echo "$summary" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("errors",0))' 2>/dev/null || echo "0")
scanned_count=$(echo "$summary" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("scanned",0))' 2>/dev/null || echo "0")

log "Scan complete: $scanned_count scanned, $new_count new, $updated_count updated, $error_count errors"

# Only notify Slack if there are changes
changes=$((new_count + updated_count))
if [ "$changes" -gt 0 ]; then
  slack "[ARCHIVISTA] Scanned $scanned_count files: $new_count new, $updated_count updated, $error_count errors"
fi

log "Done"
