#!/usr/bin/env bash
# onedrive-watcher.sh — Auto-classify new files appearing in OneDrive
# Triggered by launchd WatchPaths
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

ONEDRIVE="${HOME}/Library/CloudStorage/OneDrive-SoleraHoldings,Inc"
DROP_DIR="${ONEDRIVE}/Drop"
VAULT_ROOT="${HOME}/Vaults/My Notes"
VAULT_INTAKE="${VAULT_ROOT}/Intake/OneDrive"
TRIAGE="${HOME}/dev/NanoClaw/tools/onedrive/triage.py"
VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
LOG="${HOME}/.local/log/onedrive-watcher.log"
LOCK="/tmp/onedrive-watcher.lock"
SLACK_CHANNEL="C0ANF38B91R"

SLACK_BOT_TOKEN=""
if [ -f "${HOME}/dev/NanoClaw/.env" ]; then
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "${HOME}/dev/NanoClaw/.env" | cut -d= -f2-)
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

# ── Calendar subfolder: copy to vault Calendar intake ────────────────────────
cal_count=0
if [ -d "$DROP_DIR/Calendar" ]; then
  mkdir -p "${HOME}/Vaults/My Notes/Intake/Calendar"
  shopt -s nullglob
  cal_files=("$DROP_DIR"/Calendar/*.txt)
  shopt -u nullglob
  for f in "${cal_files[@]}"; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    cp "$f" "${HOME}/Vaults/My Notes/Intake/Calendar/$fname"
    mkdir -p "$DROP_DIR/Calendar/.processed"
    mv "$f" "$DROP_DIR/Calendar/.processed/$fname"
    cal_count=$((cal_count + 1))
  done
  if [ "$cal_count" -gt 0 ]; then
    log "Calendar: copied $cal_count file(s) to vault Calendar intake"
    slack "[ONEDRIVE] Copied $cal_count calendar file(s) from Drop/Calendar to vault intake."
  fi
fi

# ── Chats subfolder: copy to vault Chats intake ─────────────────────────────
chat_count=0
if [ -d "$DROP_DIR/Chats" ]; then
  mkdir -p "${VAULT_ROOT}/Intake/Chats"
  shopt -s nullglob
  chat_files=("$DROP_DIR"/Chats/*.txt)
  shopt -u nullglob
  for f in "${chat_files[@]}"; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    cp "$f" "${VAULT_ROOT}/Intake/Chats/$fname"
    mkdir -p "$DROP_DIR/Chats/.processed"
    mv "$f" "$DROP_DIR/Chats/.processed/$fname"
    chat_count=$((chat_count + 1))
  done
  if [ "$chat_count" -gt 0 ]; then
    log "Chats: copied $chat_count file(s) to vault Chats intake"
    slack "[ONEDRIVE] Copied $chat_count chat file(s) from Drop/Chats to vault intake."
  fi
fi

# ── People subfolder: copy to vault People intake ───────────────────────────
people_count=0
if [ -d "$DROP_DIR/People" ]; then
  mkdir -p "${VAULT_ROOT}/Intake/People"
  shopt -s nullglob
  people_files=("$DROP_DIR"/People/*.json)
  shopt -u nullglob
  for f in "${people_files[@]}"; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    cp "$f" "${VAULT_ROOT}/Intake/People/$fname"
    people_count=$((people_count + 1))
  done
  if [ "$people_count" -gt 0 ]; then
    log "People: copied $people_count file(s) to vault People intake"
  fi
fi

# ── Run processors on new data ──────────────────────────────────────────────
if [ "$cal_count" -gt 0 ]; then
  log "Processing calendar events..."
  proc_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/calendar/process_calendar.py" --vault-root "$VAULT_ROOT" 2>&1) || true
  log "Calendar processor: $proc_out"
  cal_new=$(echo "$proc_out" | grep "New:" | grep -oE '[0-9]+' || echo "0")
  [ "$cal_new" != "0" ] && slack "[CALENDAR] Processed $cal_new new calendar event(s)."
fi

if [ "$people_count" -gt 0 ]; then
  log "Processing people harvest..."
  proc_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/people/process_people.py" --vault-root "$VAULT_ROOT" --input "${VAULT_ROOT}/Intake/People/people.json" 2>&1) || true
  log "People processor: $proc_out"
fi

if [ "$chat_count" -gt 0 ]; then
  log "Processing chat exports..."
  proc_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/chat/process_chat.py" --vault-root "$VAULT_ROOT" 2>&1) || true
  log "Chat processor: $proc_out"
  chat_new=$(echo "$proc_out" | grep "New:" | grep -oE '[0-9]+' || echo "0")
  [ "$chat_new" != "0" ] && slack "[CHATS] Processed $chat_new new chat thread(s)."
fi

# ── Speaker resolution on any new transcripts ───────────────────────────────
# Runs after calendar/chat processing to maximize matching data
# Checks all transcripts for unresolved speakers — idempotent
if [ "$cal_count" -gt 0 ] || [ "$chat_count" -gt 0 ]; then
  log "Running speaker resolution..."
  resolve_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/resolver/resolve_speakers.py" --vault-root "$VAULT_ROOT" 2>&1) || true
  resolved=$(echo "$resolve_out" | grep "Speakers resolved:" | grep -oE '[0-9]+' || echo "0")
  log "Speaker resolver: resolved $resolved speakers"
  [ "$resolved" != "0" ] && slack "[RESOLVER] Resolved $resolved speaker(s) in transcripts."
fi

# ── Drop folder: copy to vault intake, skip triage ──────────────────────────
drop_count=0
if [ -d "$DROP_DIR" ]; then
  mkdir -p "$VAULT_INTAKE"
  shopt -s nullglob
  drop_files=("$DROP_DIR"/*.txt "$DROP_DIR"/*.eml)
  shopt -u nullglob
  for f in "${drop_files[@]}"; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    cp "$f" "$VAULT_INTAKE/$fname"
    mkdir -p "$DROP_DIR/.processed"
    mv "$f" "$DROP_DIR/.processed/$fname"
    drop_count=$((drop_count + 1))
  done
  if [ "$drop_count" -gt 0 ]; then
    log "Drop: copied $drop_count file(s) to vault intake"
    slack "[ONEDRIVE] Copied $drop_count file(s) from Drop to vault intake."
  fi
fi

# Scan new files into catalog (incremental — skips already-scanned)
log "Scanning for new files..."
scan_out=$("${HOME}/dev/NanoClaw/tools/onedrive/.venv/bin/python3" "$TRIAGE" scan "$ONEDRIVE" 2>&1) || true
new_count=$(echo "$scan_out" | grep "Newly cataloged:" | sed 's/.*: //')

if [ -z "$new_count" ] || [ "$new_count" = "0" ]; then
  log "No new files"
  exit 0
fi

log "Found $new_count new files, classifying..."
cls_out=$("${HOME}/dev/NanoClaw/tools/onedrive/.venv/bin/python3" "$TRIAGE" classify 2>&1) || true
log "Classification: $cls_out"

# Report to Slack
ok_count=$(echo "$cls_out" | grep -oE '[0-9]+ ok' | grep -oE '[0-9]+' || echo "0")
slack "[ONEDRIVE] Triaged $new_count new files ($ok_count classified). Run \`report\` to review."

log "Done"
