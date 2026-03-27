#!/usr/bin/env bash
#
# validate-knowledge.sh — Cross-check KNOWLEDGE.md against llms-full.txt
#
# Detects two classes of drift:
#   1. Staleness: KNOWLEDGE.md was validated against an older llms-full.txt
#   2. Fact mismatch: prices or URLs in KNOWLEDGE.md not found in llms-full.txt
#
# Usage:
#   ./tools/validate-knowledge.sh              # check + report
#   ./tools/validate-knowledge.sh --update     # also update hash after review
#   ./tools/validate-knowledge.sh --copy-first # copy llms-full from tandemweb first
#   ./tools/validate-knowledge.sh --regenerate # copy + regen if hash changed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KNOWLEDGE="$PROJECT_ROOT/knowledge/shared/KNOWLEDGE.md"
LLMS_FULL="$PROJECT_ROOT/knowledge/shared/llms-full.txt"
TANDEMWEB_LLMS="${HOME}/dev/tandemweb/llms-full.txt"

UPDATE_HASH=false
COPY_FIRST=false

REGENERATE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --update)      UPDATE_HASH=true; shift ;;
        --copy-first)  COPY_FIRST=true; shift ;;
        --regenerate)  REGENERATE=true; COPY_FIRST=true; shift ;;
        *)             echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# ── Optional: copy fresh llms-full from tandemweb ──

if $COPY_FIRST; then
    if [[ -f "$TANDEMWEB_LLMS" ]]; then
        cp "$TANDEMWEB_LLMS" "$LLMS_FULL"
        cp "$LLMS_FULL" "$PROJECT_ROOT/knowledge/agents/inbox/llms-full.txt"
        echo "Copied llms-full.txt from tandemweb ($(date -r "$TANDEMWEB_LLMS" '+%Y-%m-%d'))"
    else
        echo "WARNING: $TANDEMWEB_LLMS not found, using existing copy" >&2
    fi
fi

# ── Staleness check ──

CURRENT_HASH=$(shasum -a 256 "$LLMS_FULL" | cut -d' ' -f1)
STORED_HASH=$(grep -o 'llms-full-hash: [a-f0-9]*' "$KNOWLEDGE" 2>/dev/null | cut -d' ' -f2)
VALIDATED_AT=$(grep -o 'validated-at: [0-9-]*' "$KNOWLEDGE" 2>/dev/null | cut -d' ' -f2)

ERRORS=0

echo "=== Knowledge Base Validation ==="
echo ""

if [[ -z "$STORED_HASH" ]]; then
    echo "WARNING: No llms-full-hash in KNOWLEDGE.md — cannot check staleness"
    echo "  Run with --update to add it"
    ERRORS=$((ERRORS + 1))
elif [[ "$STORED_HASH" != "$CURRENT_HASH" ]]; then
    echo "STALE: KNOWLEDGE.md was validated against a different llms-full.txt"
    echo "  Stored hash:  ${STORED_HASH:0:16}... (validated $VALIDATED_AT)"
    echo "  Current hash: ${CURRENT_HASH:0:16}... ($(date -r "$LLMS_FULL" '+%Y-%m-%d'))"
    echo "  → Review KNOWLEDGE.md for outdated facts, then run with --update"
    ERRORS=$((ERRORS + 1))
else
    echo "Hash: OK (validated $VALIDATED_AT)"
fi

# ── Price cross-check ──
# Extract unique dollar amounts from KNOWLEDGE.md, check each exists in llms-full.txt

echo ""
echo "--- Price check ---"

PRICE_ERRORS=0
while IFS= read -r price; do
    [[ -z "$price" ]] && continue
    # Escape for grep ($ is literal in the file)
    escaped=$(printf '%s' "$price" | sed 's/[.[\*^$()+?{|]/\\&/g')
    if ! grep -qF "$price" "$LLMS_FULL"; then
        # Check if it's a well-known standalone price not from website
        # (e.g., ICF credential fees set by ICF, not Tandem)
        context=$(grep -n "$escaped" "$KNOWLEDGE" | head -1)
        echo "  NOT IN SOURCE: $price"
        echo "    Context: $context"
        PRICE_ERRORS=$((PRICE_ERRORS + 1))
    fi
done < <(grep -oE '\$[0-9,]+' "$KNOWLEDGE" | sed 's/,$//' | sort -u)

if [[ $PRICE_ERRORS -eq 0 ]]; then
    echo "  All prices found in llms-full.txt"
else
    echo "  $PRICE_ERRORS price(s) not found — may be ICF fees (OK) or errors (review)"
    ERRORS=$((ERRORS + PRICE_ERRORS))
fi

# ── URL cross-check ──
# Extract /path/ URLs from KNOWLEDGE.md, check each exists in llms-full.txt

echo ""
echo "--- URL check ---"

URL_ERRORS=0
while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    if ! grep -qF "$url" "$LLMS_FULL"; then
        context=$(grep -n "$url" "$KNOWLEDGE" | head -1)
        echo "  NOT IN SOURCE: $url"
        echo "    Context: $context"
        URL_ERRORS=$((URL_ERRORS + 1))
    fi
done < <(grep -oE '/[a-z][a-z0-9-]+(/[a-z0-9-]+)*/' "$KNOWLEDGE" | grep -v '/in/' | sort -u)

if [[ $URL_ERRORS -eq 0 ]]; then
    echo "  All URLs found in llms-full.txt"
else
    echo "  $URL_ERRORS URL(s) not found in source"
    ERRORS=$((ERRORS + URL_ERRORS))
fi

# ── Update hash if requested ──

if $UPDATE_HASH; then
    TODAY=$(date '+%Y-%m-%d')
    if [[ -n "$STORED_HASH" ]]; then
        sed -i '' "s/llms-full-hash: [a-f0-9]*/llms-full-hash: $CURRENT_HASH/" "$KNOWLEDGE"
        sed -i '' "s/validated-at: [0-9-]*/validated-at: $TODAY/" "$KNOWLEDGE"
    else
        # Insert after first line
        sed -i '' "2i\\
\\
<!-- llms-full-hash: $CURRENT_HASH -->\\
<!-- validated-at: $TODAY -->
" "$KNOWLEDGE"
    fi
    echo ""
    echo "Updated hash to ${CURRENT_HASH:0:16}... (validated $TODAY)"

    # Copy to all agents (dynamic — discovers from directory listing)
    for agent_dir in "$PROJECT_ROOT"/knowledge/agents/*/; do
        [[ -d "$agent_dir" ]] && cp "$KNOWLEDGE" "$agent_dir/KNOWLEDGE.md"
    done
    echo "Copied to all agent folders"
fi

# ── Regenerate if requested and hash changed ──

if $REGENERATE; then
    if [[ -n "$STORED_HASH" ]] && [[ "$STORED_HASH" != "$CURRENT_HASH" ]]; then
        echo ""
        echo "Hash changed — regenerating KNOWLEDGE.md..."
        if [[ -x "$SCRIPT_DIR/generate-knowledge.sh" ]]; then
            "$SCRIPT_DIR/generate-knowledge.sh"
        else
            echo "ERROR: generate-knowledge.sh not found or not executable" >&2
            exit 1
        fi
        exit 0  # generate-knowledge.sh handles validation + propagation
    elif [[ -z "$STORED_HASH" ]]; then
        echo ""
        echo "No stored hash — regenerating KNOWLEDGE.md..."
        if [[ -x "$SCRIPT_DIR/generate-knowledge.sh" ]]; then
            "$SCRIPT_DIR/generate-knowledge.sh"
        else
            echo "ERROR: generate-knowledge.sh not found or not executable" >&2
            exit 1
        fi
        exit 0
    else
        echo ""
        echo "Hash matches — skipping regeneration"
    fi
fi

# ── Summary ──

echo ""
if [[ $ERRORS -eq 0 ]]; then
    echo "PASSED — knowledge base is current"
    exit 0
else
    echo "ISSUES: $ERRORS item(s) need review"
    exit 1
fi
