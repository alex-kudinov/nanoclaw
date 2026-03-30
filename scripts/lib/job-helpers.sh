#!/bin/bash
# job-helpers.sh — shared constants and logging for pipeline jobs
# Source this file; do not execute directly.

VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
VAULT_ROOT="${HOME}/Vaults/My Notes"
LOG_DIR="${HOME}/.local/log"
NANOCLAW="${HOME}/dev/NanoClaw"

mkdir -p "$LOG_DIR"

_ts() { date '+%Y-%m-%d %H:%M:%S'; }

log_start() {
    local job="$1" file="$2"
    _JOB_START=$(date +%s)
    echo "[$(_ts)] [$job] START file=$file" >> "$LOG_DIR/$job.log"
}

log_end() {
    local job="$1" file="$2" result="$3"
    local now=$(date +%s)
    local dur=$(( now - ${_JOB_START:-$now} ))
    echo "[$(_ts)] [$job] END file=$file result=$result duration=${dur}s" >> "$LOG_DIR/$job.log"
}

log_msg() {
    local job="$1" msg="$2"
    echo "[$(_ts)] [$job] $msg" >> "$LOG_DIR/$job.log"
}
