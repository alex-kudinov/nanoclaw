#!/usr/bin/env bash
#
# collect-lessons.sh — Collect lessons from all agent LEARNED.md files
#
# Reads from knowledge/agents/*/LEARNED.md (source of truth).
# Parses ### Lesson N: entries, skips redundant lessons, deduplicates by
# CONTENT HASH — NOT by title. Many lessons share the title "Untitled" (the
# capture path used to fall back to it), and title-keyed dedup silently
# collapsed ~80% of real lessons into one. Hashing the block keeps every
# distinct lesson and only drops exact duplicates.
# Outputs combined lessons to stdout with source agent tags.
#
# Usage:
#   ./tools/collect-lessons.sh          # output lessons to stdout
#   ./tools/collect-lessons.sh --count  # just print count
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/knowledge/agents"

count_only=false
[[ "${1:-}" == "--count" ]] && count_only=true

# Collect lessons into temp file; dedup by content hash
tmp_lessons=$(mktemp)
tmp_seen=$(mktemp)
trap 'rm -f "$tmp_lessons" "$tmp_seen"' EXIT

# record_if_new <agent> <block> — append the block once per unique content.
record_if_new() {
  local agent="$1" block="$2" h
  h=$(printf '%s' "$block" | shasum | cut -d' ' -f1)
  grep -qxF "$h" "$tmp_seen" 2>/dev/null && return 0
  echo "$h" >> "$tmp_seen"
  printf '[%s] %s\n\n' "$agent" "$block" >> "$tmp_lessons"
}

for learned_file in "$AGENTS_DIR"/*/LEARNED.md; do
  [[ -f "$learned_file" ]] || continue
  agent=$(basename "$(dirname "$learned_file")")

  current_block=""
  current_title=""
  in_lesson=false
  is_redundant=false

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^###\ Lesson\ [0-9]+:\ (.+)$ ]]; then
      # Flush previous block
      if $in_lesson && [[ -n "$current_title" ]] && ! $is_redundant; then
        record_if_new "$agent" "$current_block"
      fi
      current_title="${BASH_REMATCH[1]}"
      current_block="$line"
      in_lesson=true
      is_redundant=false
      continue
    fi

    if $in_lesson && [[ "$line" == *"<!-- status: redundant"* ]]; then
      is_redundant=true
      continue
    fi

    if $in_lesson; then
      if [[ "$line" =~ ^###\  ]] || [[ "$line" =~ ^##\  ]] || [[ "$line" == ---* ]]; then
        if [[ -n "$current_title" ]] && ! $is_redundant; then
          record_if_new "$agent" "$current_block"
        fi
        in_lesson=false
        current_block=""
        current_title=""
      else
        [[ -n "$current_block" ]] && current_block+=$'\n'
        current_block+="$line"
      fi
    fi
  done < "$learned_file"

  # Flush last block
  if $in_lesson && [[ -n "$current_title" ]] && ! $is_redundant; then
    record_if_new "$agent" "$current_block"
  fi
done

if $count_only; then
  wc -l < "$tmp_seen" | tr -d ' '
  exit 0
fi

if [[ ! -s "$tmp_lessons" ]]; then
  exit 0
fi

cat "$tmp_lessons"
