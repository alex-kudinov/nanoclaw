#!/usr/bin/env bash
# recording-watcher.sh — Watch OneDrive Recordings for new MP4s and process them
# Triggered by launchd WatchPaths on the Recordings directory.
# Sequential processing with manifest-based dedup.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

RECORDINGS_DIR="${HOME}/Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Recordings"
PROCESSOR="${HOME}/dev/NanoClaw/tools/recording/process_recording.sh"
LOG="${HOME}/.local/log/recording-watcher.log"
LOCK="/tmp/recording-watcher.lock"
SLACK_CHANNEL="C0ANF38B91R"

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [recording-watcher] $*" >> "$LOG"; }

# Slack helper
slack() {
  local token=""
  if [ -f "${HOME}/dev/NanoClaw/.env" ]; then
    token=$(grep '^SLACK_BOT_TOKEN=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2- || true)
  fi
  [ -z "$token" ] && return 0
  local encoded
  encoded=$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null) || return 0
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$encoded}" \
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

# Collect MP4 files
shopt -s nullglob
files=("$RECORDINGS_DIR"/*.mp4)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  log "No MP4 files found"
  exit 0
fi

log "Found ${#files[@]} MP4 file(s)"

count=0
errors=0
for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  fname=$(basename "$file")
  log "Processing: $fname"
  if bash "$PROCESSOR" "$file" >> "$LOG" 2>&1; then
    count=$((count + 1))
  else
    errors=$((errors + 1))
    log "ERROR processing: $fname"
  fi
  # Courtesy sleep between files (ElevenLabs rate limiting)
  sleep 5
done

log "Batch complete: $count processed, $errors errors"
if [ $errors -gt 0 ]; then
  slack "[RECORDING-WATCHER] Batch done: $count processed, $errors errors"
fi
