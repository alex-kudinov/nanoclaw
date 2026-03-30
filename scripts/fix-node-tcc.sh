#!/usr/bin/env bash
# fix-node-tcc.sh — Re-register node's TCC FileProviderDomain grant
# after Homebrew upgrades change the binary path/cdhash.
#
# Idempotent — safe to run after every `brew upgrade`.
# Called automatically by the brewup alias.
set -eo pipefail

NODE_BIN="$(realpath /opt/homebrew/bin/node)"
if [ ! -x "$NODE_BIN" ]; then
  echo "node not found at /opt/homebrew/bin/node" >&2
  exit 1
fi

# Extract cdhash from codesign output
CDHASH=$(codesign -d --requirements - "$NODE_BIN" 2>&1 \
  | grep 'cdhash H"' \
  | sed 's/.*cdhash H"\([a-f0-9]*\)".*/\1/')

if [ -z "$CDHASH" ]; then
  echo "Could not extract cdhash from $NODE_BIN" >&2
  exit 1
fi

# Generate csreq blob from cdhash
CSREQ_HEX=$(echo "cdhash H\"$CDHASH\"" \
  | csreq -r- -b /dev/stdout 2>/dev/null \
  | xxd -p \
  | tr -d '\n')

if [ -z "$CSREQ_HEX" ]; then
  echo "Could not generate csreq for $NODE_BIN" >&2
  exit 1
fi

TCC_DB="$HOME/Library/Application Support/com.apple.TCC/TCC.db"

sqlite3 "$TCC_DB" "INSERT OR REPLACE INTO access (
  service, client, client_type, auth_value, auth_reason, auth_version,
  csreq, indirect_object_identifier, boot_uuid
) VALUES (
  'kTCCServiceFileProviderDomain',
  '$NODE_BIN', 1, 2, 3, 1,
  X'$CSREQ_HEX', 'UNUSED', 'UNUSED'
);"

echo "TCC: granted FileProviderDomain to $NODE_BIN (cdhash ${CDHASH:0:12}...)"
