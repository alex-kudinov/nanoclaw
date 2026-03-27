#!/usr/bin/env bash
# transcript-worker.sh — Process a single transcript file end-to-end
# Spawned by transcript-watcher.sh, one per file
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

FILE="$1"
FILENAME=$(basename "$FILE")
PROCESSOR="${HOME}/dev/toolbox/shared/transcript/lib/process_one.py"
SLACK_CHANNEL="C0ANF38B91R"

# Load bot token from NanoClaw .env
SLACK_BOT_TOKEN=""
if [ -f "${HOME}/dev/NanoClaw/.env" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2- || true)
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [worker:${FILENAME}] $*"; }

slack() {
  [ -z "$SLACK_BOT_TOKEN" ] && return 0
  local encoded
  encoded=$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null) || return 0
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$encoded}" \
    >/dev/null 2>&1 || true
}

# Verify file still exists (may have been picked up by another worker)
if [ ! -f "$FILE" ]; then
  log "SKIP: file gone"
  exit 0
fi

log "START"
slack "[TRANSCRIPT] Processing: $FILENAME"

if result=$(python3 "$PROCESSOR" "$FILE" 2>&1); then
  log "OK: $result"

  # Build Slack summary from JSON output
  title=$(echo "$result" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  parts=[d.get("meeting_title","")]
  if d.get("domain"): parts.append(f"({d[\"domain\"]})")
  decisions=d.get("decisions",0)
  actions=d.get("action_items",0)
  tags=d.get("tags",[])
  details=[]
  if decisions: details.append(f"{decisions} decisions")
  if actions: details.append(f"{actions} action items")
  if tags: details.append(" ".join(f"#{t}" for t in tags[:5]))
  summary=" | ".join(details)
  print(f"{\" \".join(parts)}\n{summary}" if summary else " ".join(parts))
except: print("")' 2>/dev/null) || true

  if [ -n "$title" ]; then
    slack "[TRANSCRIPT] Done: $title"
  else
    slack "[TRANSCRIPT] Done: $FILENAME"
  fi

  # Speaker resolution — match to calendar event and resolve Speaker N labels
  VAULT_ROOT="${HOME}/Vaults/My Notes"
  VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
  RESOLVER="${HOME}/dev/NanoClaw/tools/resolver/resolve_speakers.py"
  # Find the transcript note that was just created (most recent in Transcripts/)
  transcript_note=$(ls -t "${VAULT_ROOT}/Transcripts/"*.md 2>/dev/null | head -1)
  if [ -n "$transcript_note" ] && [ -f "$VENV" ] && [ -f "$RESOLVER" ]; then
    log "Resolving speakers: $(basename "$transcript_note")"
    resolve_out=$("$VENV" "$RESOLVER" --vault-root "$VAULT_ROOT" --transcript "$transcript_note" 2>&1) || true
    resolved=$(echo "$resolve_out" | grep "Speakers resolved:" | grep -oE '[0-9]+' || echo "0")
    log "Speaker resolution: resolved $resolved speakers"
    [ "$resolved" != "0" ] && slack "[RESOLVER] Resolved $resolved speaker(s) in $(basename "$transcript_note")"
  fi
else
  log "FAIL ($?): $result"
  slack "[TRANSCRIPT] FAILED: $FILENAME"
fi

log "DONE"
