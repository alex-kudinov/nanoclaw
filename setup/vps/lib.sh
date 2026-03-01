#!/usr/bin/env bash
# lib.sh — shared functions for VPS setup scripts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Load .env
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

# SSH base options (lowercase -p for ssh)
SSH_OPTS="-i $VPS_KEY -p $VPS_PORT -o StrictHostKeyChecking=no -o BatchMode=yes"
# SCP base options (uppercase -P for port)
SCP_OPTS="-i $VPS_KEY -P $VPS_PORT -o StrictHostKeyChecking=no"

# ---------------------------------------------------------------------------
# log / step / ok / fail
# ---------------------------------------------------------------------------
log()  { echo "[$(date +%H:%M:%S)] $*"; }
step() { echo; echo "==> $*"; }
ok()   { echo "    ✓ $*"; }
fail() { echo "    ✗ $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# vps_exec <cmd>
# Run a command on the VPS (no sudo). Output streams to terminal.
# ---------------------------------------------------------------------------
vps_exec() {
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" "$@"
}

# ---------------------------------------------------------------------------
# vps_sudo <cmd>
# Run a command on the VPS with sudo via SUDO_ASKPASS pattern.
# Writes a tiny askpass helper to /tmp, runs the command, cleans up.
# ---------------------------------------------------------------------------
vps_sudo() {
  local cmd="$*"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" 'bash -s' <<ENDSSH
printf '#!/bin/bash\necho "'"$VPS_SUDO_PASS"'"\n' > /tmp/.ap.sh
chmod 700 /tmp/.ap.sh
SUDO_ASKPASS=/tmp/.ap.sh sudo -A bash -c '${cmd//\'/\'\\\'\'}'
rm -f /tmp/.ap.sh
ENDSSH
}

# ---------------------------------------------------------------------------
# vps_sudo_script
# Pipe a heredoc / multi-line script to VPS with sudo env available.
# Usage: vps_sudo_script <<'SCRIPT' ... SCRIPT
# ---------------------------------------------------------------------------
vps_sudo_script() {
  local remote_script
  remote_script="$(cat)"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" 'bash -s' <<ENDSSH
SUDO_PASS='${VPS_SUDO_PASS}'
do_sudo() { echo "\$SUDO_PASS" | sudo -S "\$@" 2>/dev/null; }
$remote_script
ENDSSH
}

# ---------------------------------------------------------------------------
# vps_upload <local_file> <remote_path>
# ---------------------------------------------------------------------------
vps_upload() {
  local local_file="$1"
  local remote_path="$2"
  # shellcheck disable=SC2086
  scp $SCP_OPTS "$local_file" "${VPS_USER}@${VPS_HOST}:${remote_path}"
}

# ---------------------------------------------------------------------------
# vps_download <remote_path> <local_file>
# ---------------------------------------------------------------------------
vps_download() {
  local remote_path="$1"
  local local_file="$2"
  # shellcheck disable=SC2086
  scp $SCP_OPTS "${VPS_USER}@${VPS_HOST}:${remote_path}" "$local_file"
}

# ---------------------------------------------------------------------------
# cf_api <method> <path> [body]
# Call Cloudflare API. Returns response JSON.
# ---------------------------------------------------------------------------
cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="https://api.cloudflare.com/client/v4${path}"
  if [[ -n "$body" ]]; then
    curl -fsSL -X "$method" "$url" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -fsSL -X "$method" "$url" \
      -H "Authorization: Bearer $CF_API_TOKEN"
  fi
}

# ---------------------------------------------------------------------------
# require_vars <var1> <var2> ...
# ---------------------------------------------------------------------------
require_vars() {
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then
      fail "Required variable $v is not set in .env"
    fi
  done
}
