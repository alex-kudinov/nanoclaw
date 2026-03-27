#!/usr/bin/env bash
#
# collect-lessons.sh — Collect lessons from all agent LEARNED.md files
#
# Reads from knowledge/agents/*/LEARNED.md (source of truth).
# Parses ### Lesson N: entries, skips redundant lessons, deduplicates by title.
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

# Collect lessons into temp file, dedup later
tmp_lessons=$(mktemp)
tmp_titles=$(mktemp)
trap 'rm -f "$tmp_lessons" "$tmp_titles"' EXIT

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
        if ! grep -qxF "$current_title" "$tmp_titles" 2>/dev/null; then
          echo "$current_title" >> "$tmp_titles"
          printf '[%s] %s\n\n' "$agent" "$current_block" >> "$tmp_lessons"
        fi
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
          if ! grep -qxF "$current_title" "$tmp_titles" 2>/dev/null; then
            echo "$current_title" >> "$tmp_titles"
            printf '[%s] %s\n\n' "$agent" "$current_block" >> "$tmp_lessons"
          fi
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
    if ! grep -qxF "$current_title" "$tmp_titles" 2>/dev/null; then
      echo "$current_title" >> "$tmp_titles"
      printf '[%s] %s\n\n' "$agent" "$current_block" >> "$tmp_lessons"
    fi
  fi
done

if $count_only; then
  wc -l < "$tmp_titles" | tr -d ' '
  exit 0
fi

if [[ ! -s "$tmp_lessons" ]]; then
  exit 0
fi

cat "$tmp_lessons"
