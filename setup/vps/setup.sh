#!/usr/bin/env bash
# setup.sh — Orchestrator for Gru VPS setup
# Runs steps in order: 01 (n8n), 02 (Cloudflare), 03 (LiteSpeed)
#
# Usage:
#   ./setup.sh              # Run all steps
#   ./setup.sh 01           # Run only step 01
#   ./setup.sh 02 03        # Run steps 02 and 03
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STEPS_DIR="$SCRIPT_DIR/steps"

# Parse args: if none, run all; otherwise run specified step numbers
if [[ $# -eq 0 ]]; then
  STEPS=(01 02 03)
else
  STEPS=("$@")
fi

echo "======================================================"
echo " Gru VPS Setup"
echo " Steps: ${STEPS[*]}"
echo "======================================================"
echo ""

for step in "${STEPS[@]}"; do
  # Find matching script
  script=$(find "$STEPS_DIR" -name "${step}-*.sh" | sort | head -1)
  if [[ -z "$script" ]]; then
    echo "ERROR: No script found for step ${step}" >&2
    exit 1
  fi
  bash "$script"
  echo ""
done

echo "======================================================"
echo " All requested steps complete."
echo " Run ./verify.sh to confirm the full stack is up."
echo "======================================================"
