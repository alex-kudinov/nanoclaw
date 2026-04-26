#!/bin/bash
# daily-briefing.sh — Generate and notify morning briefings
# Runs generate_briefings.py then notify_briefings.py
set -euo pipefail

# Unbuffer Python stdout so job log files show progress in real time.
# Without this, block-buffered output is lost when the scheduler kills the
# process on timeout, leaving log files that only show the shell's start line.
export PYTHONUNBUFFERED=1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Mirror job-runner.ts: prefer the tools/.venv/ Python (3.14) so modern type
# hints (e.g. `dict | None`) in tools/lib/parsing.py load under launchd's PATH,
# which otherwise resolves python3 to the system 3.9.6.
VENV_PYTHON="$SCRIPT_DIR/../.venv/bin/python3"
if [ -x "$VENV_PYTHON" ]; then
    PY="$VENV_PYTHON"
else
    PY="python3"
fi

echo "[briefing] Generating briefings..."
"$PY" "$SCRIPT_DIR/generate_briefings.py" "$@"
rc=$?
if [ $rc -ne 0 ]; then
    echo "[briefing] generate_briefings.py failed with exit $rc"
    exit $rc
fi

echo "[briefing] Posting to Slack..."
"$PY" "$SCRIPT_DIR/notify_briefings.py" "$@"
rc=$?
if [ $rc -ne 0 ]; then
    echo "[briefing] notify_briefings.py failed with exit $rc"
    exit $rc
fi

echo "[briefing] Done"
