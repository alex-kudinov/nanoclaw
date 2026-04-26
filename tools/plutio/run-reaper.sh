#!/bin/bash
# run-reaper.sh — Invoke the Plutio outbox reaper (sync parties/docs to Plutio).
# Called by the NanoClaw job scheduler (data/jobs.json → plutio-outbox-reaper).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec npx tsx scripts/run-plutio-reaper.ts "$@"
