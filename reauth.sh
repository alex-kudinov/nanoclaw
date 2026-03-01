#!/usr/bin/env bash
# reauth.sh — sync Claude Code OAuth token(s) from macOS keychain into NanoClaw .env
#
# For single-account setups:
#   ./reauth.sh              # Pull current token → CLAUDE_CODE_OAUTH_TOKEN
#   ./reauth.sh --login      # Run `claude login` first, then pull
#
# For multi-account setups (5-seat rotation):
#   ./reauth.sh 1            # Save current token as slot 1 (CLAUDE_CODE_OAUTH_TOKEN_1)
#   ./reauth.sh 2            # Save current token as slot 2
#   ...
#   ./reauth.sh --login 3    # Run `claude login` first, then save as slot 3
#
# Workflow for initial 5-seat setup:
#   claude login             # Log in as account 1
#   ./reauth.sh 1
#   claude login             # Log in as account 2
#   ./reauth.sh 2
#   ... repeat for accounts 3–5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
KEYCHAIN_SERVICE="Claude Code-credentials"

# Parse args: optional --login flag, optional slot number
DO_LOGIN=false
SLOT=""

for arg in "$@"; do
  case "$arg" in
    --login) DO_LOGIN=true ;;
    [1-5])   SLOT="$arg" ;;
    *) echo "Usage: ./reauth.sh [--login] [1-5]"; exit 1 ;;
  esac
done

if [[ "$DO_LOGIN" == "true" ]]; then
  echo "→ Running claude login..."
  claude login
  echo ""
fi

# Extract accessToken from keychain JSON
TOKEN=$(
  security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['claudeAiOauth']['accessToken'])" 2>/dev/null
) || true

if [[ -z "$TOKEN" ]]; then
  echo "✗ No Claude OAuth token found in keychain."
  echo "  Run: claude login"
  echo "  Then: ./reauth.sh${SLOT:+ $SLOT}"
  exit 1
fi

# Determine the .env key to set
if [[ -n "$SLOT" ]]; then
  ENV_KEY="CLAUDE_CODE_OAUTH_TOKEN_${SLOT}"
else
  ENV_KEY="CLAUDE_CODE_OAUTH_TOKEN"
fi

# Upsert the key in .env (update in place, or append)
if [[ -f "$ENV_FILE" ]] && grep -q "^${ENV_KEY}=" "$ENV_FILE"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^${ENV_KEY}=.*|${ENV_KEY}=${TOKEN}|" "$ENV_FILE"
  else
    sed -i "s|^${ENV_KEY}=.*|${ENV_KEY}=${TOKEN}|" "$ENV_FILE"
  fi
  echo "✓ Updated ${ENV_KEY} in .env"
else
  echo "${ENV_KEY}=${TOKEN}" >> "$ENV_FILE"
  echo "✓ Added ${ENV_KEY} to .env"
fi

echo "✓ NanoClaw will use the new token immediately (no restart needed)"

if [[ -z "$SLOT" ]]; then
  echo ""
  echo "  Tip: for 5-seat rotation, use numbered slots:"
  echo "    ./reauth.sh 1   ./reauth.sh 2   ... ./reauth.sh 5"
fi
