#!/usr/bin/env bash
#
# generate-knowledge.sh — Regenerate KNOWLEDGE.md from llms-full.txt + lessons
#
# Weekly regeneration: generates fresh KNOWLEDGE.md from website content,
# incorporates all current lessons, and detects redundant lessons.
#
# Usage:
#   ./tools/generate-knowledge.sh            # full regeneration
#   ./tools/generate-knowledge.sh --dry-run  # show output without writing
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KNOWLEDGE="$PROJECT_ROOT/knowledge/shared/KNOWLEDGE.md"
LLMS_FULL="$PROJECT_ROOT/knowledge/shared/llms-full.txt"
LLMS_PIECES="$PROJECT_ROOT/knowledge/shared/llms-pieces"
PIECES_STATE="$PROJECT_ROOT/knowledge/shared/.pieces-state.json"
TANDEMWEB_LLMS="${HOME}/dev/tandemweb/llms-full.txt"
TANDEMWEB_PIECES="${HOME}/dev/tandemweb/llms-pieces"
MERGE_LOG="$PROJECT_ROOT/knowledge/shared/merge.log"
LOCK_DIR="/tmp/nanoclaw-knowledge-merge.lock"
COLLECT="$SCRIPT_DIR/collect-lessons.sh"
HELPER="$SCRIPT_DIR/regen-kb-delta.py"
AGENTS_DIR="$PROJECT_ROOT/knowledge/agents"

# Bridge config — never call claude --print directly
BRIDGE_URL="${CLAUDE_BRIDGE_URL:-http://100.115.115.206:40960/v1/print}"
BRIDGE_KEY=""
if [[ -f "$HOME/dev/.env.shared" ]]; then
  BRIDGE_KEY=$(grep '^CLAUDE_BRIDGE_KEY=' "$HOME/dev/.env.shared" | cut -d= -f2- | tr -d "'" | tr -d '"') || true
fi
if [[ -z "$BRIDGE_KEY" ]]; then
  echo "ERROR: CLAUDE_BRIDGE_KEY not found in ~/dev/.env.shared" >&2
  exit 1
fi

dry_run=false
[[ "${1:-}" == "--dry-run" ]] && dry_run=true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$MERGE_LOG"; }

# --- Lock (same as merge-lessons.sh) ---
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT
    return 0
  fi
  if [[ -f "$LOCK_DIR/pid" ]]; then
    local lock_pid lock_age
    lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
    if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null && [[ $lock_age -gt 300 ]]; then
      log "Removing stale lock (pid=$lock_pid, age=${lock_age}s)"
      rm -rf "$LOCK_DIR"
      mkdir "$LOCK_DIR" 2>/dev/null || { log "Failed to acquire lock"; exit 1; }
      echo $$ > "$LOCK_DIR/pid"
      trap 'rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT
      return 0
    fi
  fi
  log "Lock held by another process, skipping"
  exit 0
}

acquire_lock

# --- Copy llms-full.txt + llms-pieces/ from tandemweb ---
if [[ -f "$TANDEMWEB_LLMS" ]]; then
  cp "$TANDEMWEB_LLMS" "$LLMS_FULL"
  cp "$TANDEMWEB_LLMS" "$AGENTS_DIR/inbox/llms-full.txt" 2>/dev/null || true
  log "Copied llms-full.txt from tandemweb"
else
  log "WARNING: $TANDEMWEB_LLMS not found, using existing $LLMS_FULL"
fi

if [[ -d "$TANDEMWEB_PIECES" ]]; then
  rm -rf "$LLMS_PIECES"
  cp -R "$TANDEMWEB_PIECES" "$LLMS_PIECES"
  piece_count=$(find "$LLMS_PIECES" -name '*.md' | wc -l | tr -d ' ')
  log "Copied $piece_count pieces from tandemweb/llms-pieces"
else
  log "ERROR: $TANDEMWEB_PIECES not found — run tandemweb generate-llms-full.py first"
  exit 1
fi

if [[ ! -f "$LLMS_PIECES/manifest.json" ]]; then
  log "ERROR: No manifest.json in $LLMS_PIECES"
  exit 1
fi
if [[ ! -f "$HELPER" ]]; then
  log "ERROR: delta helper not found at $HELPER"
  exit 1
fi

# --- Collect current lessons into a file for the helper ---
lessons_file=$(mktemp)
trap 'rm -f "$lessons_file"; rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT
"$COLLECT" > "$lessons_file" 2>/dev/null || true
lesson_count=$(grep -c '^-' "$lessons_file" 2>/dev/null || echo 0)

# --- Snapshot current KB size for validation ---
original_size=0
[[ -f "$KNOWLEDGE" ]] && original_size=$(wc -c < "$KNOWLEDGE" | tr -d ' ')

log "Delta regeneration: manifest=$LLMS_PIECES/manifest.json lessons=$lesson_count"

# --- Backup current KB before touching it (helper writes in place) ---
[[ -f "$KNOWLEDGE" ]] && cp "$KNOWLEDGE" "$KNOWLEDGE.bak"

# --- Call helper: computes delta, chunks, calls bridge, writes KB + state ---
helper_args=(
  --knowledge "$KNOWLEDGE"
  --manifest "$LLMS_PIECES/manifest.json"
  --pieces-dir "$LLMS_PIECES"
  --state "$PIECES_STATE"
  --lessons-file "$lessons_file"
  --bridge-url "$BRIDGE_URL"
  --bridge-key "$BRIDGE_KEY"
  --model opus
)
$dry_run && helper_args+=(--dry-run)

set +e
python3 "$HELPER" "${helper_args[@]}" 2>&1 | tee -a "$MERGE_LOG"
helper_exit=${PIPESTATUS[0]}
set -e

if [[ $helper_exit -eq 99 ]]; then
  log "NOCHANGE: all pieces match state — KNOWLEDGE.md already current"
  # Restore backup (helper didn't touch KB, but remove the .bak noise)
  [[ -f "$KNOWLEDGE.bak" ]] && rm -f "$KNOWLEDGE.bak"
  # Run propagation anyway so agent copies stay in sync
  if [[ -x "$SCRIPT_DIR/validate-knowledge.sh" ]]; then
    "$SCRIPT_DIR/validate-knowledge.sh" --update 2>&1 | tee -a "$MERGE_LOG" || true
  fi
  exit 0
elif [[ $helper_exit -ne 0 ]]; then
  log "ERROR: regen-kb-delta.py exited $helper_exit"
  # Restore from backup if KB was corrupted mid-run
  [[ -f "$KNOWLEDGE.bak" ]] && cp "$KNOWLEDGE.bak" "$KNOWLEDGE"
  exit 1
fi

if $dry_run; then
  log "DRY RUN complete. No files changed."
  [[ -f "$KNOWLEDGE.bak" ]] && rm -f "$KNOWLEDGE.bak"
  exit 0
fi

# --- Validate written KB ---
if [[ ! -f "$KNOWLEDGE" ]]; then
  log "ERROR: KNOWLEDGE.md missing after regen"
  exit 1
fi

gen_size=$(wc -c < "$KNOWLEDGE" | tr -d ' ')
if (( gen_size == 0 )); then
  log "ERROR: KNOWLEDGE.md is empty after regen"
  [[ -f "$KNOWLEDGE.bak" ]] && cp "$KNOWLEDGE.bak" "$KNOWLEDGE"
  exit 1
fi
if (( original_size > 0 )) && (( gen_size < original_size / 2 )); then
  log "ERROR: KNOWLEDGE.md shrunk too much (${gen_size} < ${original_size}/2) — reverting"
  [[ -f "$KNOWLEDGE.bak" ]] && cp "$KNOWLEDGE.bak" "$KNOWLEDGE"
  exit 1
fi

# --- Inject hash/date comments ---
today=$(date '+%Y-%m-%d')
manifest_hash=$(shasum -a 256 "$LLMS_PIECES/manifest.json" | cut -d' ' -f1)
python3 - "$KNOWLEDGE" "$manifest_hash" "$today" <<'PYEOF'
import re, sys
path, mhash, today = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(path, encoding="utf-8").read()
# Strip any existing hash/validated-at comment lines
t = re.sub(r'^<!-- (llms-full-hash|manifest-hash|validated-at):[^\n]*-->\n', '', t, flags=re.MULTILINE)
# Replace the first '# ...' heading with the new header block
header = (
    f"# Tandem Coaching — Knowledge Base\n\n"
    f"<!-- manifest-hash: {mhash} -->\n"
    f"<!-- validated-at: {today} -->"
)
t = re.sub(r'^# [^\n]*', header, t, count=1)
open(path, 'w', encoding="utf-8").write(t)
PYEOF

log "KNOWLEDGE.md regenerated (${gen_size} bytes, manifest-hash=${manifest_hash:0:16}...)"

# --- Redundancy detection ---
if [[ $lesson_count -gt 0 ]] && [[ -n "$lessons" ]]; then
  log "Checking lessons for redundancy against raw llms-full.txt..."
  for learned_file in "$AGENTS_DIR"/*/LEARNED.md; do
    [[ -f "$learned_file" ]] || continue
    agent=$(basename "$(dirname "$learned_file")")

    # For each lesson, check if its core rule concept appears in llms-full.txt
    while IFS= read -r line; do
      if [[ "$line" =~ ^###\ Lesson\ ([0-9]+):\ (.+)$ ]]; then
        lesson_num="${BASH_REMATCH[1]}"
        lesson_title="${BASH_REMATCH[2]}"
      fi
      if [[ "$line" =~ ^\*\*Rule:\*\*\ (.+)$ ]]; then
        rule="${BASH_REMATCH[1]}"
        # Extract key phrases (first 80 chars) and check llms-full
        key_phrase=$(echo "$rule" | cut -c1-80)
        if grep -qiF "$key_phrase" "$LLMS_FULL" 2>/dev/null; then
          # Check if already flagged
          if ! grep -q "<!-- status: redundant" "$learned_file" 2>/dev/null || \
             ! grep -A1 "### Lesson ${lesson_num}:" "$learned_file" | grep -q "<!-- status: redundant"; then
            log "Lesson $lesson_num ($lesson_title) in $agent may be redundant — flagging"
            # Insert redundant marker after the lesson heading
            sed -i '' "/^### Lesson ${lesson_num}: /a\\
<!-- status: redundant ${today} -->" "$learned_file" 2>/dev/null || true
          fi
        fi
      fi
    done < "$learned_file"
  done
fi

# Propagate to agents
if [[ -x "$SCRIPT_DIR/validate-knowledge.sh" ]]; then
  "$SCRIPT_DIR/validate-knowledge.sh" --update 2>&1 | tee -a "$MERGE_LOG" || true
fi

log "Regeneration complete"
