#!/usr/bin/env bash
# Wrapper for the Zoom recording scanner — delegates to toolbox script.
# Exists so the job runner can resolve the script relative to NanoClaw project_root.
set -euo pipefail
exec "${HOME}/dev/toolbox/shared/zoom/tools/zoom/scan-recordings.sh" "$@"
