#!/bin/bash
# job_people.sh — batch process people data
set -euo pipefail
JOB_NAME="job_people"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

INPUT="${VAULT_ROOT}/Intake/People/people.json"
[ -f "$INPUT" ] || exit 0

LOCK="/tmp/nanoclaw-job-people.lock"
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

log_start "$JOB_NAME" "people.json"
if "$VENV" "$NANOCLAW/tools/people/process_people.py" --vault-root "$VAULT_ROOT" --input "$INPUT"; then
    log_end "$JOB_NAME" "people.json" "SUCCESS"
else
    log_end "$JOB_NAME" "people.json" "FAILED"
fi
