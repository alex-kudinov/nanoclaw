#!/usr/bin/env bash
#
# merge-lessons.sh — Merge collected lessons into KNOWLEDGE.md
#
# Collects lessons from all agent LEARNED.md files and uses Claude to
# incorporate them into the shared KNOWLEDGE.md. Preserves structure,
# re-injects hash/date comments, validates output before writing.
#
# Usage:
#   ./tools/merge-lessons.sh            # merge lessons into KNOWLEDGE.md
#   ./tools/merge-lessons.sh --dry-run  # show diff without writing
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KNOWLEDGE="$PROJECT_ROOT/knowledge/shared/KNOWLEDGE.md"
MERGE_LOG="$PROJECT_ROOT/knowledge/shared/merge.log"
LOCK_DIR="/tmp/nanoclaw-knowledge-merge.lock"
COLLECT="$SCRIPT_DIR/collect-lessons.sh"

# Find Claude CLI
CLAUDE="${CLAUDE_CLI:-$(command -v claude 2>/dev/null || echo /opt/homebrew/bin/claude)}"

dry_run=false
[[ "${1:-}" == "--dry-run" ]] && dry_run=true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$MERGE_LOG"; }

# --- Lock ---
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT
    return 0
  fi
  # Check for stale lock
  if [[ -f "$LOCK_DIR/pid" ]]; then
    local lock_pid
    lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
    local lock_age
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
    if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null && [[ $lock_age -gt 300 ]]; then
      log "Removing stale lock (pid=$lock_pid, age=${lock_age}s)"
      rm -rf "$LOCK_DIR"
      mkdir "$LOCK_DIR" 2>/dev/null || { log "Failed to acquire lock after stale removal"; exit 1; }
      echo $$ > "$LOCK_DIR/pid"
      trap 'rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT
      return 0
    fi
  fi
  log "Lock held by another process, skipping"
  exit 0
}

acquire_lock

# --- Collect lessons ---
lessons=$("$COLLECT" 2>/dev/null) || true
if [[ -z "$lessons" ]]; then
  log "No lessons to merge"
  exit 0
fi

lesson_count=$("$COLLECT" --count 2>/dev/null) || lesson_count=0
log "Collected $lesson_count lesson(s) for merge"

# --- Read current KNOWLEDGE.md ---
if [[ ! -f "$KNOWLEDGE" ]]; then
  log "ERROR: $KNOWLEDGE not found"
  exit 1
fi

original=$(cat "$KNOWLEDGE")
original_size=${#original}

# Save hash/date comments
hash_comment=$(grep -o '<!-- llms-full-hash: [a-f0-9]* -->' "$KNOWLEDGE" || echo "")
date_comment=$(grep -o '<!-- validated-at: [0-9-]* -->' "$KNOWLEDGE" || echo "")

# Extract section headers for validation
section_headers=$(grep -E '^#{1,3} ' "$KNOWLEDGE" | head -20)

# --- Build prompt ---
prompt_file=$(mktemp)
trap 'rm -f "$prompt_file"; rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT

cat > "$prompt_file" <<'PROMPT_END'
You are updating a knowledge base document. Below is the current document followed by lessons (corrections/additions from human review).

INSTRUCTIONS:
- Incorporate each lesson naturally into the relevant section of the document
- Preserve ALL existing section headers and hierarchy exactly as they are
- Only modify specific sentences/paragraphs that lessons correct or expand
- Do not reorganize sections or change the document structure
- Do not add commentary, notes, or "updated" markers
- Output the complete updated document and nothing else
- Do NOT include the llms-full-hash or validated-at HTML comments — they will be re-injected separately

=== CURRENT KNOWLEDGE BASE ===

PROMPT_END

cat "$KNOWLEDGE" >> "$prompt_file"

cat >> "$prompt_file" <<LESSONS_END

=== LESSONS TO INCORPORATE ===

$lessons

=== END ===

Output the complete updated knowledge base document. Nothing else.
LESSONS_END

# --- Call Claude ---
log "Calling claude --print --model sonnet..."
merged=$("$CLAUDE" --print --model sonnet < "$prompt_file" 2>/dev/null) || {
  log "ERROR: claude --print failed (exit $?)"
  exit 1
}

# --- Re-inject hash/date comments ---
# Strip any hash/date comments Claude may have included
merged=$(echo "$merged" | grep -v '<!-- llms-full-hash:' | grep -v '<!-- validated-at:')
# Remove existing title line and prepend our header with comments
merged=$(echo "$merged" | sed '1{/^# /d;}')
{
  echo "# Tandem Coaching — Knowledge Base"
  echo ""
  [[ -n "$hash_comment" ]] && echo "$hash_comment"
  [[ -n "$date_comment" ]] && echo "$date_comment"
  echo ""
  echo "$merged"
} > /tmp/nanoclaw-merge-output.tmp
merged=$(cat /tmp/nanoclaw-merge-output.tmp)
rm -f /tmp/nanoclaw-merge-output.tmp

# --- Validate ---
merged_size=${#merged}

if [[ -z "$merged" ]]; then
  log "ERROR: Merged output is empty"
  exit 1
fi

min_size=$(( original_size / 2 ))
if [[ $merged_size -lt $min_size ]]; then
  log "ERROR: Merged output too small (${merged_size} < ${min_size} min)"
  exit 1
fi

# Check required section headers exist in output
missing_headers=0
while IFS= read -r header_line; do
  if ! echo "$merged" | grep -qF "$header_line"; then
    log "WARNING: Missing section header: $header_line"
    ((missing_headers++))
  fi
done <<< "$section_headers"

if [[ $missing_headers -gt 3 ]]; then
  log "ERROR: Too many missing section headers ($missing_headers)"
  exit 1
fi

# --- Dry run or write ---
if $dry_run; then
  log "DRY RUN — showing diff"
  diff <(echo "$original") <(echo "$merged") || true
  echo ""
  log "DRY RUN complete. No files changed."
  exit 0
fi

# Backup
cp "$KNOWLEDGE" "$KNOWLEDGE.bak"

# Write merged output
echo "$merged" > "$KNOWLEDGE"
log "KNOWLEDGE.md updated (${original_size} → ${merged_size} bytes)"

# Propagate to agents
if [[ -x "$SCRIPT_DIR/validate-knowledge.sh" ]]; then
  "$SCRIPT_DIR/validate-knowledge.sh" --update 2>&1 | tee -a "$MERGE_LOG" || true
fi

log "Merge complete: $lesson_count lesson(s) incorporated"
