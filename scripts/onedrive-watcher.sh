#!/usr/bin/env bash
# onedrive-watcher.sh — Copy files from OneDrive Drop to vault Intake,
# then spawn processors. Copy step is fast (seconds) and uses a short lock.
# Processors run independently in background with their own locks.
# AI processors (chat, email) share a semaphore (max 2 concurrent).
set -eo pipefail

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

# ── Acquire lock for copy phase only (seconds, not minutes) ──────────────────
acquire_lock() {
  if [ -f "$LOCK" ]; then
    pid=$(cat "$LOCK" 2>/dev/null || true)
    if kill -0 "$pid" 2>/dev/null; then
      log "SKIP: copy phase running (pid $pid)"
      exit 0
    fi
  fi
  echo $$ > "$LOCK"
}

release_lock() {
  rm -f "$LOCK"
}

acquire_lock

# ── Per-processor lock helpers ───────────────────────────────────────────────
try_proc_lock() {
  local lockfile="/tmp/nanoclaw-proc-${1}.lock"
  if [ -f "$lockfile" ]; then
    local pid
    pid=$(cat "$lockfile" 2>/dev/null || true)
    if kill -0 "$pid" 2>/dev/null; then
      log "  $1: already running (pid $pid), skipping"
      return 1
    fi
  fi
  echo "$BASHPID" > "$lockfile"
  return 0
}

release_proc_lock() {
  rm -f "/tmp/nanoclaw-proc-${1}.lock"
}

# ── AI semaphore (max 2 concurrent AI processors) ────────────────────────────
AI_SEM_DIR="/tmp/nanoclaw-ai-sem"
mkdir -p "$AI_SEM_DIR"

acquire_ai_slot() {
  while true; do
    local count
    count=$(find "$AI_SEM_DIR" -maxdepth 1 -name "*.slot" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -lt 2 ]; then
      echo "$$" > "$AI_SEM_DIR/$$.slot"
      return 0
    fi
    # Clean stale slots
    for slot in "$AI_SEM_DIR"/*.slot; do
      [ -f "$slot" ] || continue
      local spid
      spid=$(cat "$slot" 2>/dev/null || true)
      if ! kill -0 "$spid" 2>/dev/null; then
        rm -f "$slot"
      fi
    done
    sleep 2
  done
}

release_ai_slot() {
  rm -f "$AI_SEM_DIR/$$.slot"
}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: Copy from Drop to Intake (Python — bash can't read CloudStorage
# under launchd due to macOS TCC restrictions, but Python can)
# ══════════════════════════════════════════════════════════════════════════════
COPY_SCRIPT="${HOME}/dev/NanoClaw/scripts/copy-drop.py"
copy_json=$("$VENV" "$COPY_SCRIPT" 2>>"$LOG") || true

# Parse JSON counts
cal_count=$(echo "$copy_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("cal",0))' 2>/dev/null || echo 0)
chat_count=$(echo "$copy_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("chat",0))' 2>/dev/null || echo 0)
people_count=$(echo "$copy_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("people",0))' 2>/dev/null || echo 0)
email_count=$(echo "$copy_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("email",0))' 2>/dev/null || echo 0)
drop_count=$(echo "$copy_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("drop",0))' 2>/dev/null || echo 0)

[ "$cal_count" -gt 0 ] 2>/dev/null && log "Calendar: copied $cal_count file(s)"
[ "$chat_count" -gt 0 ] 2>/dev/null && log "Chats: copied $chat_count file(s)"
[ "$people_count" -gt 0 ] 2>/dev/null && log "People: copied $people_count file(s)"
[ "$email_count" -gt 0 ] 2>/dev/null && log "Email: copied $email_count file(s)"
[ "$drop_count" -gt 0 ] 2>/dev/null && log "Drop: copied $drop_count file(s)"

# ── Release copy lock — processors run independently below ───────────────────
release_lock
log "Copy phase done: cal=$cal_count chat=$chat_count people=$people_count email=$email_count drop=$drop_count"

# ══════════════════════════════════════════════════════════════════════════════
# Helper: check if directory has files matching pattern
has_files() {
  local dir="$1" pattern="${2:-*}"
  [ -d "$dir" ] || return 1
  local count
  count=$(find "$dir" -maxdepth 1 -name "$pattern" -type f 2>/dev/null | head -1 | wc -l | tr -d ' ')
  [ "$count" -gt 0 ]
}


# PHASE 2: Spawn processors (independent, background, own locks)
# ══════════════════════════════════════════════════════════════════════════════

# ── No-AI processors: run immediately, no semaphore ──────────────────────────

if has_files "${VAULT_ROOT}/Intake/Calendar" "*.txt"; then
  (
    try_proc_lock calendar || exit 0
    trap 'release_proc_lock calendar' EXIT
    log "Processing calendar events..."
    proc_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/calendar/process_calendar.py" --vault-root "$VAULT_ROOT" 2>&1) || true
    log "Calendar processor: $proc_out"
    cal_new=$(echo "$proc_out" | grep "New:" | grep -oE '[0-9]+' || echo "0")
    [ "$cal_new" != "0" ] && slack "[CALENDAR] Processed $cal_new new calendar event(s)."
  ) &
fi

if has_files "${VAULT_ROOT}/Intake/People" "*.json"; then
  (
    try_proc_lock people || exit 0
    trap 'release_proc_lock people' EXIT
    log "Processing people harvest..."
    proc_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/people/process_people.py" --vault-root "$VAULT_ROOT" --input "${VAULT_ROOT}/Intake/People/people.json" 2>&1) || true
    log "People processor: $proc_out"
  ) &
fi

# ── AI processors: acquire semaphore slot (max 2 concurrent) ─────────────────

if has_files "${VAULT_ROOT}/Intake/Chats" "*.txt"; then
  (
    try_proc_lock chat || exit 0
    trap 'release_proc_lock chat; release_ai_slot' EXIT
    acquire_ai_slot
    log "Processing chat exports..."
    "$VENV" "${HOME}/dev/NanoClaw/tools/chat/process_chat.py" --vault-root "$VAULT_ROOT" 2>&1 | while read -r line; do log "[CHAT] $line"; done || true
  ) &
fi

if has_files "${VAULT_ROOT}/Intake/Email"; then
  (
    try_proc_lock email || exit 0
    trap 'release_proc_lock email; release_ai_slot' EXIT
    acquire_ai_slot
    log "Processing email exports..."
    "$VENV" "${HOME}/dev/NanoClaw/tools/email/process_email.py" --vault-root "$VAULT_ROOT" 2>&1 | while read -r line; do log "[EMAIL] $line"; done || true
  ) &
fi

# ── Wait for all processors before post-processing ───────────────────────────
wait

# ── Speaker resolution (runs after all processors to maximize data) ──────────
if [ "$cal_count" -gt 0 ] || [ "$chat_count" -gt 0 ] || [ "$email_count" -gt 0 ] || has_files "${VAULT_ROOT}/Intake/Chats" "*.txt" || has_files "${VAULT_ROOT}/Intake/Email"; then
  log "Running speaker resolution..."
  resolve_out=$("$VENV" "${HOME}/dev/NanoClaw/tools/resolver/resolve_speakers.py" --vault-root "$VAULT_ROOT" 2>&1) || true
  resolved=$(echo "$resolve_out" | grep "Speakers resolved:" | grep -oE '[0-9]+' || echo "0")
  log "Speaker resolver: resolved $resolved speakers"
  [ "$resolved" != "0" ] && slack "[RESOLVER] Resolved $resolved speaker(s) in transcripts."
fi

# ── Vault hygiene ────────────────────────────────────────────────────────────
log "Running post-pipeline hygiene..."
bash "${HOME}/dev/NanoClaw/scripts/vault-hygiene.sh" --checks crossref-broken-links,crossref-speaker-sync --vault-root "$VAULT_ROOT" 2>&1 | while read -r l; do log "[HYGIENE] $l"; done

# ── OneDrive file scan/classify ──────────────────────────────────────────────
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

ok_count=$(echo "$cls_out" | grep -oE '[0-9]+ ok' | grep -oE '[0-9]+' || echo "0")
slack "[ONEDRIVE] Triaged $new_count new files ($ok_count classified). Run \`report\` to review."

log "Done"
