#!/bin/bash
# job_chat.sh — process one chat file from Intake/Chats/
set -euo pipefail
JOB_NAME="job_chat"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

INTAKE="${VAULT_ROOT}/Intake/Chats"
FILE=""
for f in "$INTAKE"/*.txt; do
    [ -f "$f" ] || continue
    [[ "$(basename "$f")" == *".sync-conflict-"* ]] && continue
    [ -d "${f}.lock" ] && continue
    FILE="$f"
    break
done
[ -z "$FILE" ] && exit 0

mkdir "${FILE}.lock" 2>/dev/null || exit 0

log_start "$JOB_NAME" "$(basename "$FILE")"
"$VENV" "$NANOCLAW/tools/chat/process_chat.py" --input "$FILE" --vault-root "$VAULT_ROOT" || true

if [ ! -f "$FILE" ]; then
    rmdir "${FILE}.lock"
    log_end "$JOB_NAME" "$(basename "$FILE")" "SUCCESS"
else
    log_end "$JOB_NAME" "$(basename "$FILE")" "FAILED"
fi
