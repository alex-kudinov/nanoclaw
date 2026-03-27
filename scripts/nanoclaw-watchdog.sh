#!/usr/bin/env bash
# nanoclaw-watchdog.sh — External health monitor and auto-recovery for NanoClaw.
# Runs via launchd every 120s. Checks heartbeat, health endpoint, Slack connection,
# error logs, DB heartbeat messages, and zombie containers. Restarts when degraded.
set -uo pipefail  # NO -e — explicit error handling to prevent jq/sqlite3 failures from killing the script

PROJECT_ROOT="/Users/xbohdpukc/dev/NanoClaw"
STATE_FILE="$HOME/.local/state/nanoclaw-watchdog.json"
HEARTBEAT_FILE="$PROJECT_ROOT/data/heartbeat.json"
ERROR_LOG="$PROJECT_ROOT/logs/nanoclaw.error.log"
DB_FILE="$PROJECT_ROOT/store/messages.db"

# Toolbox setup — required for pushover/send-message.sh
export TOOLBOX_HOME="$HOME/dev/toolbox"
export TOOLBOX_LIB="$TOOLBOX_HOME/lib"
PUSHOVER_SEND="$TOOLBOX_HOME/shared/pushover/tools/pushover/send-message.sh"

# Load env + map .env.shared names to TOOLBOX_ prefix for toolbox tools
set -a; source "$HOME/dev/.env.shared" 2>/dev/null; set +a
export TOOLBOX_PUSHOVER_APP_TOKEN="${TOOLBOX_PUSHOVER_APP_TOKEN:-${PUSHOVER_APP_TOKEN:-}}"
export TOOLBOX_PUSHOVER_USER_KEY="${TOOLBOX_PUSHOVER_USER_KEY:-${PUSHOVER_USER_KEY:-}}"
HEARTBEAT_JID="${HEARTBEAT_JID:-}"

# Prevent concurrent execution (macOS has no flock — use mkdir atomic lock)
LOCK_DIR="$STATE_FILE.lock"
cleanup_lock() { rmdir "$LOCK_DIR" 2>/dev/null; }
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # Check if lock is stale (older than 5 min = previous run crashed)
  if [[ -d "$LOCK_DIR" ]]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR") ))
    if (( lock_age > 300 )); then
      rmdir "$LOCK_DIR" 2>/dev/null; mkdir "$LOCK_DIR" 2>/dev/null
    else
      echo "$(date -Iseconds) Another watchdog running, exiting"; exit 0
    fi
  fi
fi
trap 'save_state; cleanup_lock' EXIT

log() { echo "$(date -Iseconds) $*"; }

# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------
consecutive_failures=0
needs_restart=false
restart_reason=""

load_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"last_restart_ts":0,"last_restart_success":false,"consecutive_failures":0}' > "$STATE_FILE"
  fi
  consecutive_failures=$(jq -r '.consecutive_failures // 0' "$STATE_FILE" 2>/dev/null || echo 0)
  [[ "$consecutive_failures" =~ ^[0-9]+$ ]] || consecutive_failures=0
}

save_state() {
  jq --arg f "$consecutive_failures" '.consecutive_failures = ($f | tonumber)' \
    "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null && mv "$STATE_FILE.tmp" "$STATE_FILE" \
    || echo '{"last_restart_ts":0,"last_restart_success":false,"consecutive_failures":'"$consecutive_failures"'}' > "$STATE_FILE"
}

load_state

# ---------------------------------------------------------------------------
# Alert — Pushover primary, alert.sh (email) fallback
# ---------------------------------------------------------------------------
alert() {
  local reason="$1"
  log "ALERT: $reason"
  if ! "$PUSHOVER_SEND" \
    --title "NanoClaw Watchdog" \
    --message "$reason" \
    --priority 1 \
    --sound siren 2>/dev/null; then
    log "Pushover failed, falling back to alert.sh (email)"
    "$HOME/dev/toolbox/shared/claude/lib/alert.sh" \
      --level critical --subject "NanoClaw Watchdog" --message "$reason" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Restart — all paths go through here (single cooldown gate)
# ---------------------------------------------------------------------------
do_restart() {
  local reason="$1"
  local last_ts
  last_ts=$(jq -r '.last_restart_ts // 0' "$STATE_FILE" 2>/dev/null || echo 0)
  local last_ok
  last_ok=$(jq -r '.last_restart_success // false' "$STATE_FILE" 2>/dev/null || echo false)
  local now
  now=$(date +%s)
  local cooldown=120; [[ "$last_ok" == "true" ]] && cooldown=300

  if (( now - last_ts < cooldown )); then
    log "Cooldown active ($(( now - last_ts ))s since last restart, success=$last_ok)"
    return
  fi

  log "RESTARTING — $reason"
  local old_pid
  old_pid=$(jq -r '.pid // 0' "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
  launchctl kickstart -k "gui/$(id -u)/com.nanoclaw"

  # Poll for fresh heartbeat with new PID (up to 45s)
  local success=false
  for _ in {1..9}; do
    sleep 5
    if [[ -f "$HEARTBEAT_FILE" ]]; then
      local new_pid new_ts new_age
      new_pid=$(jq -r '.pid // 0' "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
      new_ts=$(jq -r '.ts // 0' "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
      [[ "$new_ts" =~ ^[0-9]+$ ]] || new_ts=0
      new_age=$(( ($(date +%s) * 1000 - new_ts) / 1000 ))
      if [[ "$new_pid" != "$old_pid" ]] && (( new_age >= 0 && new_age < 30 )); then
        success=true; break
      fi
    fi
  done

  jq --arg ts "$now" --arg ok "$success" \
    '.last_restart_ts = ($ts | tonumber) | .last_restart_success = ($ok == "true") | .consecutive_failures = (if $ok == "true" then 0 else 1 end)' \
    "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null && mv "$STATE_FILE.tmp" "$STATE_FILE" \
    || echo "{\"last_restart_ts\":$now,\"last_restart_success\":$success,\"consecutive_failures\":0}" > "$STATE_FILE"

  alert "$reason (restart_success=$success)"
}

request_restart() {
  needs_restart=true
  restart_reason="$1"
}

# ===========================================================================
# CHECKS
# ===========================================================================

failures_at_start=$consecutive_failures
now_s=$(date +%s)
last_restart_ts=$(jq -r '.last_restart_ts // 0' "$STATE_FILE" 2>/dev/null || echo 0)
[[ "$last_restart_ts" =~ ^[0-9]+$ ]] || last_restart_ts=0

# --- Check 1: Process alive (heartbeat file) ---
if [[ ! -f "$HEARTBEAT_FILE" ]]; then
  if (( now_s - last_restart_ts < 180 )); then
    log "Grace period — heartbeat missing but recent restart ($(( now_s - last_restart_ts ))s ago)"
  else
    request_restart "Heartbeat file missing — process not running"
  fi
else
  ts=$(jq -r '.ts // 0' "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
  [[ "$ts" =~ ^[0-9]+$ ]] || ts=0
  if (( ts == 0 )); then
    request_restart "Heartbeat file corrupt"
  else
    now_ms=$(( now_s * 1000 ))
    age_sec=$(( (now_ms - ts) / 1000 ))
    if (( age_sec < 0 )); then age_sec=0; fi
    if (( age_sec > 90 )); then
      if (( now_s - last_restart_ts < 180 )); then
        log "Grace period — heartbeat stale (${age_sec}s) but recent restart"
      else
        request_restart "Process frozen — heartbeat ${age_sec}s stale"
      fi
    fi
  fi
fi

# --- Check 2: Health endpoint ---
health=""
slack_connected="null"
slack_last_sec="null"
if ! $needs_restart; then
  health=$(curl -sf --max-time 5 http://localhost:8088/health 2>/dev/null) || health=""
  if [[ -z "$health" ]]; then
    consecutive_failures=$(( consecutive_failures + 1 ))
    if (( consecutive_failures >= 3 )); then
      request_restart "Health endpoint unreachable for 3+ checks"
    else
      log "WARN: health endpoint down (failures=$consecutive_failures)"
    fi
  fi
fi

# --- Check 3: Slack connection (from health JSON) ---
if [[ -n "$health" ]] && ! $needs_restart; then
  slack_connected=$(echo "$health" | jq -r '.channels.slack.connected // "null"' 2>/dev/null || echo "null")
  slack_last_sec=$(echo "$health" | jq -r '.channels.slack.lastActivitySec // "null"' 2>/dev/null || echo "null")

  if [[ "$slack_connected" == "false" ]]; then
    if [[ "$slack_last_sec" == "null" ]] || { [[ "$slack_last_sec" =~ ^[0-9]+$ ]] && (( slack_last_sec > 300 )); }; then
      consecutive_failures=$(( consecutive_failures + 1 ))
      log "WARN: Slack disconnected, lastActivity=${slack_last_sec}s (failures=$consecutive_failures)"
    else
      log "INFO: Slack disconnected but recent activity (${slack_last_sec}s) — reconnecting"
    fi
  fi
fi

# --- Check 4: Error log death spiral (accelerator) ---
if [[ -f "$ERROR_LOG" ]] && ! $needs_restart; then
  ws_errors=$(tail -100 "$ERROR_LOG" 2>/dev/null | grep -c "Failed to send a message as the client has no active connection" || echo 0)
  if (( ws_errors > 20 )) && [[ "$slack_connected" == "false" ]]; then
    log "CRITICAL: Slack death spiral (${ws_errors} WebSocket errors)"
    consecutive_failures=$(( consecutive_failures + 2 ))
  fi
fi

# --- Check 5: Slack heartbeat message (quiet vs broken) ---
if [[ -n "$HEARTBEAT_JID" ]] && ! $needs_restart && command -v sqlite3 &>/dev/null; then
  hb_epoch=$(sqlite3 "$DB_FILE" \
    "SELECT COALESCE(MAX(CAST(strftime('%s', timestamp) AS INTEGER)), 0) FROM messages WHERE chat_jid='$HEARTBEAT_JID' AND is_from_me=1" 2>/dev/null || echo 0)
  [[ "$hb_epoch" =~ ^[0-9]+$ ]] || hb_epoch=0
  if (( hb_epoch > 0 )); then
    hb_age=$(( now_s - hb_epoch ))
    if (( hb_age > 900 )); then
      log "WARN: Slack heartbeat stale (${hb_age}s) — send failing"
      consecutive_failures=$(( consecutive_failures + 2 ))
    fi
  fi
fi

# --- Check 6: Zombie containers ---
if command -v container &>/dev/null && ! $needs_restart; then
  container ls --format json 2>/dev/null \
    | jq -r '.[]? | select(.configuration.id | startswith("nanoclaw-")) | .configuration.id' 2>/dev/null \
    | while read -r cname; do
    ts_part="${cname##*-}"
    if [[ "$ts_part" =~ ^[0-9]{10,13}$ ]]; then
      age_sec=$(( now_s - (ts_part / 1000) ))
      if (( age_sec > 3600 )); then
        container stop "$cname" 2>/dev/null || true
        container rm "$cname" 2>/dev/null || true
        log "Killed zombie: $cname (${age_sec}s old)"
      fi
    fi
  done
fi

# ===========================================================================
# DECISION GATE
# ===========================================================================
if $needs_restart || (( consecutive_failures >= 3 )); then
  [[ -z "$restart_reason" ]] && restart_reason="Consecutive failures: $consecutive_failures"
  do_restart "$restart_reason"
elif (( consecutive_failures == failures_at_start )); then
  # No new failures this run — all checks passed, reset counter
  consecutive_failures=0
  log "OK"
else
  log "DEGRADED (failures=$consecutive_failures)"
fi
