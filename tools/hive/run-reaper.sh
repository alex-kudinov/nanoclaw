#!/bin/bash
# run-reaper.sh — Invoke the Hive sync reaper (retry failed Firestore writes).
# Called by the NanoClaw job scheduler (data/jobs.json → hive-sync-reaper).
#
# Usage: ./tools/hive/run-reaper.sh
#
# tsconfig rootDir is "./src" so scripts/ is never emitted to dist/. This
# wrapper stays on the TS source via `npx tsx`. Same pattern as
# tools/digest/run-digest.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec npx tsx scripts/run-hive-reaper.ts "$@"
