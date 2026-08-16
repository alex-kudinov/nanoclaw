#!/bin/bash
# run-reaper.sh — Invoke the Plutio outbox reaper from the active verified release.
# Called by the NanoClaw job scheduler (data/jobs.json → plutio-outbox-reaper).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLIST_PATH="${NANOCLAW_LAUNCHD_PLIST:-$HOME/Library/LaunchAgents/com.nanoclaw.plist}"

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "run-plutio-reaper: NanoClaw launchd plist not found" >&2
  exit 1
fi

NODE_BIN="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST_PATH")"
CODE_ROOT="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:NANOCLAW_CODE_ROOT' "$PLIST_PATH")"

if [[ "$NODE_BIN" != /* || ! -x "$NODE_BIN" ]]; then
  echo "run-plutio-reaper: active Node interpreter is invalid" >&2
  exit 1
fi
if [[ "$CODE_ROOT" != /* || ! -d "$CODE_ROOT" ]]; then
  echo "run-plutio-reaper: active NanoClaw code root is invalid" >&2
  exit 1
fi
if [[ ! -f "$CODE_ROOT/scripts/verify-release.mjs" || ! -f "$CODE_ROOT/dist/plutio-outbox-reaper-cli.js" ]]; then
  echo "run-plutio-reaper: active release lacks the compiled reaper boundary" >&2
  exit 1
fi

"$NODE_BIN" "$CODE_ROOT/scripts/verify-release.mjs" "$CODE_ROOT" --runtime >/dev/null

cd "$PROJECT_ROOT"
exec "$NODE_BIN" "$CODE_ROOT/dist/plutio-outbox-reaper-cli.js" "$@"
