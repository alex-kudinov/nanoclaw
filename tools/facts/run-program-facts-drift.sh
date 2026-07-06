#!/bin/bash
# run-program-facts-drift.sh — Guard the sales KB against program-fact drift.
# Called by the NanoClaw job scheduler (data/jobs.json → program-facts-drift).
#
# Notify-only: posts a Slack alert when facts/programs.yaml diverges from
# tandemweb products.json or the sales KNOWLEDGE.md. Never auto-overwrites.
#
# tsconfig rootDir is "./src" so scripts/ is never emitted to dist/. This
# wrapper stays on the TS source via `npx tsx`. Same pattern as
# tools/hive/run-reaper.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
exec npx tsx scripts/run-program-facts-drift.ts "$@"
