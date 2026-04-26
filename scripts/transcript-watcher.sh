#!/usr/bin/env bash
# transcript-watcher.sh — Watch Intake dirs for new transcript .md files and process them
# Triggered by launchd WatchPaths on Intake/Alter (Solera) and Intake/Zoom (Tandem).
# Sequential processing with lock-based dedup.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VAULT="${HOME}/Vaults/My Notes"
ALTER_DIR="${VAULT}/Intake/Alter"
ZOOM_DIR="${VAULT}/Intake/Zoom"
WORKER="${HOME}/dev/NanoClaw/scripts/transcript-worker.sh"
LOG="${HOME}/.local/log/transcript-watcher.log"
LOCK="/tmp/transcript-watcher.lock"

mkdir -p "$(dirname "$LOG")" "$ALTER_DIR" "$ZOOM_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [transcript-watcher] $*" >> "$LOG"; }

# Prevent overlapping runs
if [ -f "$LOCK" ]; then
  pid=$(cat "$LOCK" 2>/dev/null || true)
  if kill -0 "$pid" 2>/dev/null; then
    log "SKIP: already running (pid $pid)"
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Collect .md files from both intake dirs
shopt -s nullglob
files=("$ALTER_DIR"/*.md "$ZOOM_DIR"/*.md)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  log "No .md files found"
  exit 0
fi

log "Found ${#files[@]} transcript file(s)"

count=0
errors=0
for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  fname=$(basename "$file")
  parent=$(basename "$(dirname "$file")")
  log "Processing [$parent]: $fname"
  if bash "$WORKER" "$file" >> "$LOG" 2>&1; then
    count=$((count + 1))
  else
    errors=$((errors + 1))
    log "ERROR processing: $fname"
    # Move failed files to errors/ so they don't block future runs
    errdir="$(dirname "$file")/errors"
    mkdir -p "$errdir"
    mv "$file" "$errdir/" 2>/dev/null || true
  fi
done

log "Batch complete: $count processed, $errors errors"
