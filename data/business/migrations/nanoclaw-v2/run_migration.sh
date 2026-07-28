#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:/usr/local/bin:$PATH"

PSQL="$(command -v psql)" || { echo "ERROR: psql not in PATH"; exit 2; }
MIG_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ "${1:-}" == "--migration-dir" ]] && { MIG_DIR="$2"; shift 2; }
DB_URL="postgresql:///nanoclaw_business?host=/tmp&user=xbohdpukc"

cd "$MIG_DIR"

# Match 2- AND 3-digit prefixes (migrations grew past 99); sort -V keeps numeric
# order so 100_ runs after 99_, not after 10_.
for f in $(ls [0-9][0-9]*_*.sql | sort -V); do
  # Per-file daemon re-check with explicit exit code
  if ! launchctl_out=$(launchctl list 2>/dev/null); then
    echo "ERROR: launchctl list failed — halting before $f"; exit 1
  fi
  if echo "$launchctl_out" | grep -q com.nanoclaw; then
    echo "ERROR: com.nanoclaw.* re-registered mid-migration — halting before $f"; exit 1
  fi
  echo "==> $f"
  "$PSQL" "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -f "$f"
done
echo "✓ migration complete. Run validate.sh next."
