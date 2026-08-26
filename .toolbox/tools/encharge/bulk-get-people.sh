#!/usr/bin/env bash
# bulk-get-people -- least-privilege wrapper for the shared Encharge bulk read.

set -euo pipefail

shared_tool="${TOOLBOX_HOME:?TOOLBOX_HOME not set}/shared/encharge/tools/encharge/people.sh"
if [[ ! -x "$shared_tool" ]]; then
  printf 'FAIL TOOL_UNAVAILABLE shared Encharge people tool is unavailable\n' >&2
  exit 1
fi

exec "$shared_tool" bulk-get "$@"
