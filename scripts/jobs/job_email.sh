#!/bin/bash
# job_email.sh — process one email file from Intake/Email/
set -euo pipefail
JOB_NAME="job_email"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

INTAKE="${VAULT_ROOT}/Intake/Email"
FILE=""
for f in "$INTAKE"/*.eml; do
    [ -f "$f" ] || continue
    [[ "$(basename "$f")" == *".sync-conflict-"* ]] && continue
    [ -d "${f}.lock" ] && continue
    FILE="$f"
    break
done
[ -z "$FILE" ] && exit 0

mkdir "${FILE}.lock" 2>/dev/null || exit 0

log_start "$JOB_NAME" "$(basename "$FILE")"
"$VENV" "$NANOCLAW/tools/email/process_email.py" --input "$FILE" --vault-root "$VAULT_ROOT" || true

if [ ! -f "$FILE" ]; then
    rmdir "${FILE}.lock"
    log_end "$JOB_NAME" "$(basename "$FILE")" "SUCCESS"
else
    log_end "$JOB_NAME" "$(basename "$FILE")" "FAILED"
fi
