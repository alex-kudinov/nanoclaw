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
TANDEMWEB_LLMS="${HOME}/dev/tandemweb/llms-full.txt"
MERGE_LOG="$PROJECT_ROOT/knowledge/shared/merge.log"
LOCK_DIR="/tmp/nanoclaw-knowledge-merge.lock"
COLLECT="$SCRIPT_DIR/collect-lessons.sh"
AGENTS_DIR="$PROJECT_ROOT/knowledge/agents"

CLAUDE="${CLAUDE_CLI:-$(command -v claude 2>/dev/null || echo /opt/homebrew/bin/claude)}"

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

# --- Copy llms-full.txt from tandemweb ---
if [[ -f "$TANDEMWEB_LLMS" ]]; then
  cp "$TANDEMWEB_LLMS" "$LLMS_FULL"
  cp "$TANDEMWEB_LLMS" "$AGENTS_DIR/inbox/llms-full.txt" 2>/dev/null || true
  log "Copied llms-full.txt from tandemweb"
else
  log "WARNING: $TANDEMWEB_LLMS not found, using existing $LLMS_FULL"
fi

if [[ ! -f "$LLMS_FULL" ]]; then
  log "ERROR: No llms-full.txt available"
  exit 1
fi

# --- Collect current lessons ---
lessons=$("$COLLECT" 2>/dev/null) || true
lesson_count=$("$COLLECT" --count 2>/dev/null) || lesson_count=0
log "Regenerating KNOWLEDGE.md from llms-full.txt with $lesson_count lesson(s)"

# --- Extract current section headers for structure guidance ---
if [[ -f "$KNOWLEDGE" ]]; then
  section_headers=$(grep -E '^#{1,3} ' "$KNOWLEDGE" | head -30)
  original_size=$(wc -c < "$KNOWLEDGE" | tr -d ' ')
else
  section_headers=""
  original_size=0
fi

# --- Build prompt ---
prompt_file=$(mktemp)
trap 'rm -f "$prompt_file"; rm -rf "$LOCK_DIR"' EXIT SIGTERM SIGINT

cat > "$prompt_file" <<'PROMPT_END'
You are generating a structured knowledge base document from website source material.

INSTRUCTIONS:
- Extract all coaching programs, pricing, prerequisites, timelines, instructors, services, and FAQs
- Organize into clear sections with markdown headers
- Include specific prices, URLs, and requirements — do not generalize
- Use tables for program comparisons
- Do NOT include llms-full-hash or validated-at comments
- Output a complete, standalone knowledge base document

PROMPT_END

if [[ -n "$section_headers" ]]; then
  cat >> "$prompt_file" <<STRUCTURE_END

PREFERRED SECTION STRUCTURE (preserve this hierarchy):
$section_headers

STRUCTURE_END
fi

if [[ -n "$lessons" ]]; then
  cat >> "$prompt_file" <<LESSONS_END

MANDATORY LESSONS (these are human-verified corrections that override source material):
$lessons

Incorporate these lessons into the appropriate sections. They take precedence over source material.

LESSONS_END
fi

cat >> "$prompt_file" <<'SOURCE_HEADER'

=== SOURCE MATERIAL ===

SOURCE_HEADER

cat "$LLMS_FULL" >> "$prompt_file"

cat >> "$prompt_file" <<'FOOTER'

=== END SOURCE ===

Output the complete knowledge base document. Nothing else.
FOOTER

# --- Call Claude (opus for large context) ---
log "Calling claude --print --model opus (this may take a few minutes)..."
generated=$("$CLAUDE" --print --model opus < "$prompt_file" 2>/dev/null) || {
  log "ERROR: claude --print failed (exit $?)"
  exit 1
}

# --- Inject hash/date comments ---
new_hash=$(shasum -a 256 "$LLMS_FULL" | cut -d' ' -f1)
today=$(date '+%Y-%m-%d')
header="# Tandem Coaching — Knowledge Base"$'\n\n'"<!-- llms-full-hash: $new_hash -->"$'\n'"<!-- validated-at: $today -->"

generated=$(echo "$generated" | sed '/<!-- llms-full-hash:/d' | sed '/<!-- validated-at:/d')
generated=$(echo "$generated" | sed "1s|^# .*|$header|")

# --- Validate ---
gen_size=${#generated}

if [[ -z "$generated" ]]; then
  log "ERROR: Generated output is empty"
  exit 1
fi

if [[ $original_size -gt 0 ]]; then
  min_size=$(( original_size / 2 ))
  if [[ $gen_size -lt $min_size ]]; then
    log "ERROR: Generated output too small (${gen_size} < ${min_size} min)"
    exit 1
  fi
fi

# --- Dry run or write ---
if $dry_run; then
  log "DRY RUN — output size: $gen_size bytes"
  if [[ -f "$KNOWLEDGE" ]]; then
    diff "$KNOWLEDGE" <(echo "$generated") | head -100 || true
  fi
  log "DRY RUN complete. No files changed."
  exit 0
fi

# Backup
[[ -f "$KNOWLEDGE" ]] && cp "$KNOWLEDGE" "$KNOWLEDGE.bak"

# Write
echo "$generated" > "$KNOWLEDGE"
log "KNOWLEDGE.md regenerated (${gen_size} bytes, hash=$new_hash)"

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
