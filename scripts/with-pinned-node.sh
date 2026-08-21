#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PIN=$(tr -d '[:space:]' < "$ROOT/.nvmrc")
CURRENT=$(node -p 'process.versions.node' 2>/dev/null || true)

if [ "$CURRENT" = "$PIN" ]; then
  exec "$@"
fi

MAJOR=${PIN%%.*}
for BIN_DIR in \
  "${NANOCLAW_PINNED_NODE_DIR:-}" \
  "/opt/homebrew/opt/node@${MAJOR}/bin" \
  "${HOME:-}/.local/node/${PIN}/bin"
do
  [ -n "$BIN_DIR" ] || continue
  [ -x "$BIN_DIR/node" ] || continue
  CANDIDATE=$("$BIN_DIR/node" -p 'process.versions.node' 2>/dev/null || true)
  [ "$CANDIDATE" = "$PIN" ] || continue
  PATH="$BIN_DIR:$PATH"
  export PATH
  exec "$@"
done

echo "NanoClaw requires Node $PIN; current runtime is ${CURRENT:-unavailable}." >&2
echo "Install that exact version or set NANOCLAW_PINNED_NODE_DIR to its bin directory." >&2
exit 64
