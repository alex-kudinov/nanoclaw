#!/bin/bash
# clean_chat.sh — remove stale .lock dirs in Intake/Chats/
set -euo pipefail
JOB_NAME="clean_chat"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

DIR="${VAULT_ROOT}/Intake/Chats"
find "$DIR" -maxdepth 1 -name "*.lock" -type d -mmin +30 2>/dev/null | while IFS= read -r lock; do
    SRC="${lock%.lock}"
    FNAME="$(basename "$SRC")"
    mkdir -p "$DIR/errors"
    if [ -f "$SRC" ]; then
        mv "$SRC" "$DIR/errors/"
        log_msg "$JOB_NAME" "STALE_LOCK $FNAME moved_to_errors"
    else
        log_msg "$JOB_NAME" "GHOST_LOCK $FNAME source_gone"
    fi
    rmdir "$lock"
done
