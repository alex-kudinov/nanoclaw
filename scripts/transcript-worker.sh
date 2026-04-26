#!/usr/bin/env bash
# transcript-worker.sh — Process a single transcript file end-to-end
# Spawned by transcript-watcher.sh, one per file
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

FILE="$1"
FILENAME=$(basename "$FILE")
PROCESSOR="${HOME}/dev/toolbox/shared/transcript/lib/process_one.py"

# Domain → Slack channel routing
CHANNEL_SOLERA="C0ANF38B91R"   # #gru-archivarista
CHANNEL_TANDEM="C0AR3K7QU85"  # #gru-courses
SLACK_CHANNEL="$CHANNEL_SOLERA"  # default until domain is known

# Load bot token from NanoClaw .env
SLACK_BOT_TOKEN=""
if [ -f "${HOME}/dev/NanoClaw/.env" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2- || true)
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [worker:${FILENAME}] $*"; }

slack() {
  [ -z "$SLACK_BOT_TOKEN" ] && return 0
  local channel="${2:-$SLACK_CHANNEL}"
  local encoded
  encoded=$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null) || return 0
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$channel\",\"text\":$encoded}" \
    >/dev/null 2>&1 || true
}

# Verify file still exists (may have been picked up by another worker)
if [ ! -f "$FILE" ]; then
  log "SKIP: file gone"
  exit 0
fi

log "START"

# Detect source from file headers before processing (for early notification routing)
file_source=$(head -10 "$FILE" | grep '^Source:' | head -1 | sed 's/Source: *//' || true)
if [[ "$file_source" == zoom-* ]]; then
  SLACK_CHANNEL="$CHANNEL_TANDEM"
fi

slack "[TRANSCRIPT] Processing: $FILENAME"

if result=$(python3 "$PROCESSOR" "$FILE"); then
  log "OK: $result"

  # Extract domain from result and route notifications
  domain=$(echo "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("domain",""))' 2>/dev/null) || true
  case "$domain" in
    tandem) SLACK_CHANNEL="$CHANNEL_TANDEM" ;;
    *)      SLACK_CHANNEL="$CHANNEL_SOLERA" ;;
  esac

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
  # Derive transcript path from process_one.py output (not ls -t which picks wrong file)
  transcript_note="${VAULT_ROOT}/Transcripts/${FILENAME}"
  if [ -f "$transcript_note" ] && [ -f "$VENV" ] && [ -f "$RESOLVER" ]; then
    log "Resolving speakers: $(basename "$transcript_note")"
    resolve_out=$("$VENV" "$RESOLVER" --vault-root "$VAULT_ROOT" --transcript "$transcript_note" 2>&1) || true
    resolved=$(echo "$resolve_out" | grep "Speakers resolved:" | grep -oE '[0-9]+' || echo "0")
    log "Speaker resolution: resolved $resolved speakers"
    [ "$resolved" != "0" ] && slack "[RESOLVER] Resolved $resolved speaker(s) in $(basename "$transcript_note")"
  fi

  # Session enrichment — only for Tandem coaching class transcripts
  ENRICHER="${HOME}/dev/NanoClaw/tools/enricher/enrich_session.py"
  is_tandem_class=$(echo "$result" | python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  if d.get("domain") == "tandem" and "courses" in d.get("tags", []):
    print("yes")
  else:
    print("no")
except:
  print("no")
' 2>/dev/null) || true

  # Detect session type: orientation vs regular class
  session_type=$(echo "$result" | python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  title = d.get("meeting_title", "").lower()
  tags = [t.lower() for t in d.get("tags", [])]
  if "orientation" in title or "orientation" in tags:
    print("orientation")
  else:
    print("class")
except:
  print("class")
' 2>/dev/null) || session_type="class"

  if [ "$is_tandem_class" = "yes" ] && [ -f "$transcript_note" ] && [ -f "$ENRICHER" ]; then
    log "Enriching session (type=$session_type): $(basename "$transcript_note")"
    slack "[ENRICHER] Starting session enrichment ($session_type)..."
    enrich_out=$(python3 "$ENRICHER" "$transcript_note" --session-type "$session_type" 2>&1) || true
    enrich_ok=$(echo "$enrich_out" | tail -1 | python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  print(f"{d.get("succeeded",0)} ok, {d.get("failed",0)} failed")
except:
  print("error")
' 2>/dev/null) || true
    log "Enrichment: $enrich_ok"
    if [ -n "$enrich_ok" ] && [ "$enrich_ok" != "error" ]; then
      slack "[ENRICHER] Session enriched: $enrich_ok"
    fi

    # Get enrichment output directory
    enrich_dir=$(echo "$enrich_out" | tail -1 | python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get("output_dir", ""))
except:
  print("")
' 2>/dev/null) || true

    # Attendance tracking
    ATTENDANCE="${HOME}/dev/NanoClaw/tools/enricher/track_attendance.py"
    attendance_file=""
    if [ -n "$enrich_dir" ] && [ -d "$enrich_dir" ] && [ -f "$ATTENDANCE" ]; then
      log "Tracking attendance..."
      att_program=$(python3 -c '
import json, sys, os
meta = os.path.join(sys.argv[1], "meta.json")
try:
  d = json.load(open(meta))
  prog = d.get("program", "")
  if not prog:
    topic = d.get("topic", d.get("transcript", "")).lower()
    if "acc" in topic or "pcc" in topic: prog = "acc"
    elif "actc" in topic: prog = "actc"
  print(prog)
except: print("")
' "$enrich_dir" 2>/dev/null) || true
      att_flags=""
      [ -n "$att_program" ] && att_flags="--program $att_program"
      attendance_out=$(python3 "$ATTENDANCE" "$enrich_dir" $att_flags 2>&1) || true
      attendance_ok=$(echo "$attendance_out" | tail -1 | python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  if not d.get("ok", False):
    print("zoom_failed")
  else:
    print(f"{d.get("present",0)} present, {d.get("unmatched",0)} unmatched")
except:
  print("error")
' 2>/dev/null) || true
      log "Attendance: $attendance_ok"
      [ -n "$attendance_ok" ] && [ "$attendance_ok" != "error" ] && [ "$attendance_ok" != "zoom_failed" ] && slack "[ATTENDANCE] $attendance_ok"
      attendance_file=$(echo "$attendance_out" | tail -1 | python3 -c '
import json, sys
try: print(json.load(sys.stdin).get("attendance_file", ""))
except: print("")
' 2>/dev/null) || true
    fi

    # Trigger courses minion for review (skip for orientations — no email to send)
    if [ "$session_type" = "orientation" ]; then
      log "Orientation session — skipping email pipeline"
      slack "[ENRICHER] Orientation enriched (no student email). Data in $enrich_dir"
    elif [ -n "$enrich_dir" ] && [ -d "$enrich_dir" ]; then
      WEBHOOK_SECRET=$(grep '^WEBHOOK_SECRET=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2- || true)
      summary_file=$(ls -t "${VAULT_ROOT}/Tandem/Meetings/"*.md 2>/dev/null | head -1)
      if [ -n "$WEBHOOK_SECRET" ]; then
        curl -s -X POST http://127.0.0.1:8088/hook/course-recap \
          -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
          -H "Content-Type: application/json" \
          -d "{\"enrich_dir\":\"$enrich_dir\",\"transcript_note\":\"$(basename "$transcript_note")\",\"summary_file\":\"${summary_file:-}\",\"attendance_file\":\"${attendance_file:-}\"}" \
          >/dev/null 2>&1 || log "Webhook POST failed"
        log "Triggered courses minion for review"
        slack "[ENRICHER] Session recap ready for review in #gru-courses"
      else
        log "Skipping webhook: WEBHOOK_SECRET empty"
      fi
    fi
  fi
else
  log "FAIL ($?): $result"
  slack "[TRANSCRIPT] FAILED: $FILENAME"
  log "DONE"
  exit 1
fi

log "DONE"
