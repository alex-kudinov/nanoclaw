#!/usr/bin/env bash
# El Campanero CLI — deterministic job management
# Usage: ./tools/campanero.sh <command> [args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Mac Mini SSH config
SSH_KEY="$HOME/Sync/keys/xbohdpukc"
SSH_HOST="xbohdpukc@100.115.115.206"
SSH_OPTS="-o UserKnownHostsFile=/tmp/nanoclaw_known_hosts -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -i $SSH_KEY"
REMOTE_DB="~/dev/NanoClaw/store/messages.db"
REMOTE_JOBS="~/dev/NanoClaw/data/jobs.json"

# Detect if running on Mac Mini (local) or remote
if curl -sf http://localhost:8088/health >/dev/null 2>&1; then
  LOCAL=true
  DB="$PROJECT_ROOT/store/messages.db"
else
  LOCAL=false
fi

run_sql() {
  if $LOCAL; then
    sqlite3 -separator '|' "$DB" "$1"
  else
    ssh $SSH_OPTS "$SSH_HOST" "sqlite3 -separator '|' $REMOTE_DB \"$1\""
  fi
}

run_cmd() {
  if $LOCAL; then
    eval "$1"
  else
    ssh $SSH_OPTS "$SSH_HOST" "$1"
  fi
}

cmd_list() {
  echo "JOBS"
  echo "──────────��───────────────────────────────────────────────────────────"
  printf "%-22s %-9s %-16s %-20s %-8s\n" "NAME" "ENABLED" "CRON" "LAST RUN" "RESULT"
  echo "───────────────��──────────────────────────────────────────────────────"

  # run_interval_days may not exist in older schemas — use CASE to handle gracefully
  local has_interval
  has_interval=$(run_sql "SELECT COUNT(*) FROM pragma_table_info('jobs') WHERE name='run_interval_days'" 2>/dev/null || echo "0")
  local interval_col
  if [ "$has_interval" = "1" ]; then
    interval_col="COALESCE(run_interval_days, '')"
  else
    interval_col="''"
  fi
  run_sql "SELECT name, enabled, cron, COALESCE(last_run, 'never'), COALESCE(last_result, '-'), $interval_col FROM jobs ORDER BY name" | while IFS='|' read -r name enabled cron last_run result interval; do
    if [ "$enabled" = "1" ]; then
      status="yes"
    else
      status="PAUSED"
    fi
    # Truncate last_run to just date+time
    if [ "$last_run" != "never" ]; then
      last_run="${last_run:0:19}"
    fi
    suffix=""
    if [ -n "$interval" ]; then
      suffix=" (${interval}d)"
    fi
    printf "%-22s %-9s %-16s %-20s %-8s\n" "$name" "$status" "${cron}${suffix}" "$last_run" "$result"
  done
}

cmd_status() {
  local name="$1"
  local row
  row=$(run_sql "SELECT name, description, enabled, cron, timezone, retries, timeout_ms, COALESCE(last_run,'never'), COALESCE(last_result,'-'), COALESCE(last_duration_ms,0), COALESCE(next_run,'not set'), COALESCE(lockfile,'-'), COALESCE(run_interval_days,''), script FROM jobs WHERE name='$name'")

  if [ -z "$row" ]; then
    echo "FAIL: job '$name' not found"
    exit 1
  fi

  IFS='|' read -r j_name desc enabled cron tz retries timeout last_run result duration next_run lockfile interval script <<< "$row"

  echo "$j_name"
  echo "  $desc"
  echo ""
  echo "  Script:    $script"
  echo "  Schedule:  $cron ($tz)"
  [ -n "$interval" ] && echo "  Interval:  every ${interval} days"
  echo "  Enabled:   $([ "$enabled" = "1" ] && echo "yes" || echo "PAUSED")"
  echo "  Retries:   $retries"
  echo "  Timeout:   $((timeout / 60000))m"
  echo "  Lockfile:  $lockfile"
  echo ""
  echo "  Last run:  $last_run ($result, ${duration}ms)"
  echo "  Next run:  $next_run"
  echo ""
  echo "  Recent runs:"
  run_sql "SELECT started_at, status, COALESCE(duration_ms,0), COALESCE(exit_code,'-'), triggered_by FROM job_run_logs WHERE job_name='$name' ORDER BY started_at DESC LIMIT 5" | while IFS='|' read -r started status dur exit_code trigger; do
    printf "    %-20s %-8s %6sms  exit=%s  (%s)\n" "${started:0:19}" "$status" "$dur" "$exit_code" "$trigger"
  done
}

cmd_pause() {
  local name="$1"
  run_sql "UPDATE jobs SET enabled = 0 WHERE name = '$name'"
  local check
  check=$(run_sql "SELECT enabled FROM jobs WHERE name = '$name'")
  if [ "$check" = "0" ]; then
    echo "OK paused $name"
  else
    echo "FAIL: job '$name' not found"
    exit 1
  fi
}

cmd_resume() {
  local name="$1"
  run_sql "UPDATE jobs SET enabled = 1 WHERE name = '$name'"
  local check
  check=$(run_sql "SELECT enabled FROM jobs WHERE name = '$name'")
  if [ "$check" = "1" ]; then
    echo "OK resumed $name"
  else
    echo "FAIL: job '$name' not found"
    exit 1
  fi
}

cmd_run() {
  local name="$1"
  # Trigger via webhook API
  local secret
  if $LOCAL; then
    secret=$(grep '^WEBHOOK_SECRET=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    local response
    response=$(curl -sf -X POST -H "X-Webhook-Secret: $secret" "http://localhost:8088/api/job/$name" 2>&1) || {
      echo "FAIL: $response"
      exit 1
    }
    echo "OK triggered $name"
  else
    secret=$(ssh $SSH_OPTS "$SSH_HOST" "grep '^WEBHOOK_SECRET=' ~/dev/NanoClaw/.env 2>/dev/null | cut -d= -f2")
    local response
    response=$(ssh $SSH_OPTS "$SSH_HOST" "curl -sf -X POST -H 'X-Webhook-Secret: $secret' 'http://localhost:8088/api/job/$name'" 2>&1) || {
      echo "FAIL: $response"
      exit 1
    }
    echo "OK triggered $name"
  fi
}

cmd_logs() {
  local name="$1"
  local limit="${2:-10}"
  printf "%-20s %-8s %8s  %-5s  %-12s  %s\n" "STARTED" "STATUS" "DURATION" "EXIT" "TRIGGER" "LOG FILE"
  echo "───────��────────────────────────────────────────────────────────────────────────"
  run_sql "SELECT started_at, status, COALESCE(duration_ms,0), COALESCE(exit_code,'-'), triggered_by, COALESCE(log_file,'-') FROM job_run_logs WHERE job_name='$name' ORDER BY started_at DESC LIMIT $limit" | while IFS='|' read -r started status dur exit_code trigger log; do
    # Convert duration to human
    local dur_h
    if [ "$dur" -gt 60000 ] 2>/dev/null; then
      dur_h="$((dur / 60000))m$((dur % 60000 / 1000))s"
    elif [ "$dur" -gt 0 ] 2>/dev/null; then
      dur_h="${dur}ms"
    else
      dur_h="-"
    fi
    printf "%-20s %-8s %8s  %-5s  %-12s  %s\n" "${started:0:19}" "$status" "$dur_h" "$exit_code" "$trigger" "$log"
  done
}

cmd_help() {
  cat <<HELP
El Campanero CLI — job scheduler management

Usage: campanero.sh <command> [args]

Commands:
  list                    Show all jobs with status and schedule
  status <name>           Detailed status + recent run history
  pause <name>            Disable a job (stops cron scheduling)
  resume <name>           Re-enable a paused job
  run <name>              Trigger a job to run immediately
  logs <name> [limit]     Show run log history (default: 10)
  help                    Show this help

Examples:
  campanero.sh list
  campanero.sh pause newsletter-curation
  campanero.sh run calendar-refresh
  campanero.sh logs weekly-data-refresh 5
HELP
}

# --- Arg parsing ---
# Supports both positional (campanero.sh pause my-job)
# and flag style (campanero.sh pause --name my-job --limit 5)
command="${1:-help}"
shift || true

name=""
limit="10"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)  name="$2"; shift 2 ;;
    --limit) limit="$2"; shift 2 ;;
    -*)      shift ;;
    *)       [ -z "$name" ] && name="$1"; shift ;;
  esac
done

case "$command" in
  list)    cmd_list ;;
  status)  cmd_status "${name:?Usage: campanero.sh status <name>}" ;;
  pause)   cmd_pause "${name:?Usage: campanero.sh pause <name>}" ;;
  resume)  cmd_resume "${name:?Usage: campanero.sh resume <name>}" ;;
  run)     cmd_run "${name:?Usage: campanero.sh run <name>}" ;;
  logs)    cmd_logs "${name:?Usage: campanero.sh logs <name>}" "$limit" ;;
  help|--help|-h) cmd_help ;;
  *)       echo "Unknown command: $command"; cmd_help; exit 1 ;;
esac
