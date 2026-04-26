#!/usr/bin/env bash
# Daily classification digest — posts summary of auto-classified emails to chief.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npx tsx scripts/classification-digest.ts "$@"
