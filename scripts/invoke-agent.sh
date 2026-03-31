#!/bin/bash
# invoke-agent.sh — Invoke a NanoClaw agent with a workflow
# Usage: invoke-agent.sh <group> <workflow> [args...]
set -euo pipefail

source "${HOME}/dev/NanoClaw/scripts/lib/job-helpers.sh"

GROUP="${1:-}"
WORKFLOW="${2:-}"
ARGS="${3:-}"

if [ -z "$GROUP" ] || [ -z "$WORKFLOW" ]; then
    echo "Usage: invoke-agent.sh <group> <workflow> [args...]" >&2
    exit 1
fi

# Currently only archivarista/meeting-prep is wired
if [ "$GROUP" = "archivarista" ] && [ "$WORKFLOW" = "meeting-prep" ]; then
    TARGET_DATE="${ARGS:-$(date +%Y-%m-%d)}"
    log_msg "invoke-agent" "Running meeting-prep for $TARGET_DATE"

    GENERATOR="${NANOCLAW}/tools/archivarista/generate_briefings.py"
    if [ ! -f "$GENERATOR" ]; then
        log_msg "invoke-agent" "Generator not found: $GENERATOR"
        exit 1
    fi

    if python3 "$GENERATOR" "$TARGET_DATE"; then
        BRIEFINGS=$(find "${VAULT_ROOT}/Archivista/Briefings" -name "${TARGET_DATE}*.md" 2>/dev/null | wc -l | tr -d ' ')
        log_msg "invoke-agent" "Generated $BRIEFINGS briefings for $TARGET_DATE"
        exit 0
    else
        log_msg "invoke-agent" "Briefing generation failed for $TARGET_DATE"
        exit 1
    fi
fi

log_msg "invoke-agent" "Unknown agent/workflow: $GROUP/$WORKFLOW"
exit 1
