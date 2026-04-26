#!/bin/bash
# run-label-poll.sh — Invoke the Gmail label-change poller.
# Called by the NanoClaw job scheduler (data/jobs.json → gmail-label-poll).
#
# Detects when operators move classified emails between `MrGru/...` labels
# in the Gmail UI and emits classify_correction_detected IPCs to chief.
#
# tsconfig rootDir is "./src" so scripts/ is never emitted to dist/. This
# wrapper stays on the TS source via `npx tsx`. Same pattern as
# tools/hive/run-reaper.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec npx tsx scripts/run-label-poll.ts "$@"
