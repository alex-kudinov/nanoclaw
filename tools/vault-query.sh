#!/usr/bin/env bash
#
# vault-query.sh — Query Obsidian vault via Local REST API
#
# Wraps the Obsidian Local REST API for use by NanoClaw agents.
# Runs Dataview DQL queries, reads vault files, and searches content.
#
# Usage:
#   ./tools/vault-query.sh dataview "TABLE date FROM \"Solera/Meetings\" LIMIT 5"
#   ./tools/vault-query.sh read "Solera/People/Brian Groner.md"
#   ./tools/vault-query.sh search "Brian Croner"
#   ./tools/vault-query.sh health
#
set -euo pipefail

API_HOST="${OBSIDIAN_API_HOST:-https://localhost:27124}"
API_KEY="${OBSIDIAN_API_KEY:-01324f04b16a9a0084f07bf38500132b83c0d0e13709394bd1ae2fb5c2cd47c2}"

AUTH_HEADER="Authorization: Bearer $API_KEY"

# Self-signed cert — skip verification
CURL="curl -sk --connect-timeout 5 --max-time 30"

usage() {
  echo "Usage: vault-query.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  dataview <DQL>     Run a Dataview DQL query"
  echo "  read <path>        Read a vault file (e.g., Solera/People/Name.md)"
  echo "  search <query>     Full-text search across the vault"
  echo "  health             Check API connectivity"
  exit 1
}

cmd="${1:-}"
shift || true

case "$cmd" in
  dataview)
    query="${1:-}"
    [[ -z "$query" ]] && { echo "ERROR: DQL query required" >&2; exit 1; }
    $CURL "$API_HOST/search/" \
      -H "$AUTH_HEADER" \
      -X POST \
      -H "Content-Type: application/vnd.olrapi.dataview.dql+txt" \
      -d "$query"
    ;;

  read)
    filepath="${1:-}"
    [[ -z "$filepath" ]] && { echo "ERROR: file path required" >&2; exit 1; }
    # URL-encode the path
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$filepath', safe='/'))" 2>/dev/null || echo "$filepath")
    $CURL "$API_HOST/vault/$encoded" \
      -H "$AUTH_HEADER" \
      -H "Accept: text/markdown"
    ;;

  search)
    query="${1:-}"
    [[ -z "$query" ]] && { echo "ERROR: search query required" >&2; exit 1; }
    # Obsidian search uses the same endpoint with different content type
    $CURL "$API_HOST/search/" \
      -H "$AUTH_HEADER" \
      -X POST \
      -H "Content-Type: application/vnd.olrapi.dataview.dql+txt" \
      -d "LIST FROM \"\" WHERE contains(file.name, \"$query\") OR contains(file.content, \"$query\") LIMIT 20"
    ;;

  health)
    result=$($CURL "$API_HOST/" -H "$AUTH_HEADER" -w '\n%{http_code}' 2>&1)
    code=$(echo "$result" | tail -1)
    if [[ "$code" == "200" ]]; then
      echo "OK — Obsidian REST API v3.5.0 reachable"
    else
      echo "ERROR — API returned $code"
      echo "$result" | head -5
      exit 1
    fi
    ;;

  *)
    usage
    ;;
esac
