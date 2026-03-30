#!/bin/bash
# job_meeting_prep.sh — trigger Archivista morning meeting briefing
set -euo pipefail
JOB_NAME="job_meeting_prep"
source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

LOCK="/tmp/nanoclaw-job-meeting-prep.lock"
if [ -f "$LOCK" ]; then
    FRESH=$(find "$LOCK" -mmin -30 2>/dev/null)
    if [ -n "$FRESH" ]; then
        log_msg "$JOB_NAME" "already running"
        exit 0
    fi
    rm -f "$LOCK"
fi

echo "$(date +%s)" > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log_start "$JOB_NAME" "today"

# Invoke Archivista agent with meeting-prep workflow for today
# Uses NanoClaw's agent invocation mechanism
TARGET_DATE=$(date +%Y-%m-%d)
if "${NANOCLAW}/scripts/invoke-agent.sh" archivista meeting-prep "$TARGET_DATE"; then
    log_end "$JOB_NAME" "$TARGET_DATE" "SUCCESS"
else
    log_msg "$JOB_NAME" "Agent invocation failed or unavailable"
fi

# Always attempt Slack notification — briefings may exist from manual generation
NOTIFY="${NANOCLAW}/tools/archivista/notify_briefings.py"
if python3 "$NOTIFY" "$TARGET_DATE"; then
    log_end "$JOB_NAME" "$TARGET_DATE" "NOTIFIED"
else
    log_end "$JOB_NAME" "$TARGET_DATE" "NO_BRIEFINGS"
fi
