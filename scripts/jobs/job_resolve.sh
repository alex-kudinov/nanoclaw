#!/bin/bash
# job_resolve.sh — batch speaker resolution across all transcripts
set -euo pipefail
JOB_NAME="job_resolve"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

LOCK="/tmp/nanoclaw-job-resolve.lock"
if [ -f "$LOCK" ]; then
    FRESH=$(find "$LOCK" -mmin -10 2>/dev/null)
    if [ -n "$FRESH" ]; then
        log_msg "$JOB_NAME" "already running"
        exit 0
    fi
    rm -f "$LOCK"
fi

echo "$(date +%s)" > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log_start "$JOB_NAME" "batch"
if "$VENV" "$NANOCLAW/tools/resolver/resolve_speakers.py" --vault-root "$VAULT_ROOT"; then
    log_end "$JOB_NAME" "batch" "SUCCESS"
else
    log_end "$JOB_NAME" "batch" "FAILED"
fi
