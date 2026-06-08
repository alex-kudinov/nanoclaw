#!/usr/bin/env bash
# clean-sync-conflicts.sh — remove Syncthing conflict-copy files from this repo.
# Usage: tools/clean-sync-conflicts.sh [--dry-run]
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

COUNT=$(find . -type f -name '*.sync-conflict-*' | wc -l | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "No sync-conflict files found."
  exit 0
fi

if $DRY_RUN; then
  find . -type f -name '*.sync-conflict-*'
  echo "[dry-run] $COUNT file(s) would be deleted."
  exit 0
fi

find . -type f -name '*.sync-conflict-*' -print -delete
echo "Deleted $COUNT sync-conflict file(s)."
