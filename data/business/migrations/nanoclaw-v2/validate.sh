#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:/usr/local/bin:$PATH"
psql "postgresql:///nanoclaw_business?host=/tmp&user=xbohdpukc" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$(cd "$(dirname "$0")" && pwd)/validate.sql"
