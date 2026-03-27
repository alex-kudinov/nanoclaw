#!/usr/bin/env bash
# transcript-watcher.sh — Dispatch new Alter transcripts for parallel processing
# Triggered by launchd WatchPaths on ~/Vaults/My Notes/Intake/Alter/
# Workers run in parallel; dispatcher waits for all to finish.
# launchd TimeOut (900s) covers up to ~5 transcripts.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

WATCH_DIR="${HOME}/Vaults/My Notes/Intake/Alter"
WORKER="${HOME}/dev/NanoClaw/scripts/transcript-worker.sh"
LOG="${HOME}/.local/log/transcript-watcher.log"
LOCK="/tmp/transcript-watcher.lock"

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

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

# Collect eligible files
shopt -s nullglob
files=("$WATCH_DIR"/*.txt "$WATCH_DIR"/*.md)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  exit 0
fi

log "Processing ${#files[@]} file(s) in parallel"

count=0
for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  log "Spawning worker: $filename"
  bash "$WORKER" "$file" >> "$LOG" 2>&1 &
  log "  -> pid $!"
  count=$((count + 1))
done

# Wait for all workers — keeps process group alive so launchd doesn't kill them
log "Waiting for $count worker(s)"
wait
log "All workers finished"
