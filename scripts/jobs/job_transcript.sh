#!/bin/bash
# job_transcript.sh — process one transcript from Intake/Alter/
set -euo pipefail
JOB_NAME="job_transcript"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

INTAKE="${VAULT_ROOT}/Intake/Alter"
FILE=""
for f in "$INTAKE"/*.txt "$INTAKE"/*.md; do
    [ -f "$f" ] || continue
    [[ "$(basename "$f")" == *".sync-conflict-"* ]] && continue
    [ -d "${f}.lock" ] && continue
    FILE="$f"
    break
done
[ -z "$FILE" ] && exit 0

mkdir "${FILE}.lock" 2>/dev/null || exit 0

log_start "$JOB_NAME" "$(basename "$FILE")"
if bash "$NANOCLAW/scripts/transcript-worker.sh" "$FILE"; then
    rm -f "$FILE"
    rmdir "${FILE}.lock"
    log_end "$JOB_NAME" "$(basename "$FILE")" "SUCCESS"
else
    log_end "$JOB_NAME" "$(basename "$FILE")" "FAILED"
fi
