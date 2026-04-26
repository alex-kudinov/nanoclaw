#!/bin/bash
# run-digest.sh — Invoke the daily per-recipient email digest.
# Called by the NanoClaw job scheduler (data/jobs.json → digest-alex / digest-cherie).
#
# Usage: ./tools/digest/run-digest.sh --recipient cherie
#
# tsconfig rootDir is "./src" so scripts/ is never emitted to dist/. This
# wrapper stays on the TS source via `npx tsx`. Precedent:
# tools/archivarista/daily-briefing.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec npx tsx scripts/run-digest.ts "$@"
