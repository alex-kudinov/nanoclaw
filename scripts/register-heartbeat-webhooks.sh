#!/usr/bin/env bash
# register-heartbeat-webhooks.sh
#
# Register Heartbeat.chat webhooks for the TCA community notification pipeline.
# All subscriptions point at the n8n relay URL.
#
# Subscribed triggers:
#   - THREAD_CREATE, one per POSTS channel (new posts in forum-style channels)
#   - DIRECT_MESSAGE, one per user with role Administrator or Instructor
#     (catches "Chat with an Admin" and any student DM to an admin/instructor)
#
# Idempotent: skips subscriptions that already exist, creates only the missing.
#
# Usage:
#   scripts/register-heartbeat-webhooks.sh              # live
#   scripts/register-heartbeat-webhooks.sh --dry-run    # preview only
#   scripts/register-heartbeat-webhooks.sh --url URL    # custom target
#
# Default target: https://webhooks.tandemcoach.co/webhook/heartbeat-community
#
# Requires HEARTBEAT_API_KEY (from ~/dev/.env.shared) and jq.
#
# NOTE: curl/jq instead of Node because Node 25 on this host has undici
# connect-timeout issues against api.heartbeat.chat (CloudFront routing).

set -euo pipefail

HEARTBEAT_API="https://api.heartbeat.chat/v0"
DEFAULT_URL="https://webhooks.tandemcoach.co/webhook/heartbeat-community"

N8N_URL="$DEFAULT_URL"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) N8N_URL="$2"; shift 2;;
    --dry-run) DRY_RUN=true; shift;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# //' | sed 's/^#//'
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "error: jq required" >&2; exit 1; }

# Load HEARTBEAT_API_KEY — parse one line explicitly (never `export $(...)`
# which leaks the environment on empty input).
_load_key() {
  local file="$1" line value
  [[ -f "$file" ]] || return 0
  line=$(grep -E '^HEARTBEAT_API_KEY=' "$file" | tail -n1 || true)
  [[ -z "$line" ]] && return 0
  value="${line#HEARTBEAT_API_KEY=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  [[ -n "$value" ]] && HEARTBEAT_API_KEY="$value"
}
_load_key "$HOME/dev/.env.shared"
_load_key "$(pwd)/.env"
if [[ -z "${HEARTBEAT_API_KEY:-}" ]]; then
  echo "error: HEARTBEAT_API_KEY not found" >&2
  exit 1
fi
export HEARTBEAT_API_KEY

echo "register-heartbeat-webhooks: target URL = $N8N_URL"
$DRY_RUN && echo "  (dry run — no changes will be made)"

auth_header=(-H "Authorization: Bearer $HEARTBEAT_API_KEY")
json_header=(-H "Content-Type: application/json")

CHANNELS_JSON=$(curl -sS "${auth_header[@]}" "$HEARTBEAT_API/channels")
WEBHOOKS_JSON=$(curl -sS "${auth_header[@]}" "$HEARTBEAT_API/webhooks")
USERS_JSON=$(curl -sS "${auth_header[@]}" "$HEARTBEAT_API/users?limit=500")

POSTS_CHANNELS=$(jq -c '[.[] | select(.type == "POSTS")]' <<<"$CHANNELS_JSON")
# Heartbeat only allows DIRECT_MESSAGE webhooks for Administrator-role users
# ("Direct message webhooks can only be set up for admins"). Instructors
# cannot subscribe to DMs even though they exist in the role taxonomy.
ADMIN_USERS=$(jq -c '[.[] | select(.role == "Administrator")]' <<<"$USERS_JSON")

N_POSTS=$(jq 'length' <<<"$POSTS_CHANNELS")
N_ADMINS=$(jq 'length' <<<"$ADMIN_USERS")
N_WEBHOOKS=$(jq 'length' <<<"$WEBHOOKS_JSON")
echo "  $N_POSTS POSTS channels, $N_ADMINS admin/instructor users, $N_WEBHOOKS existing webhooks"

created_thread=0
skipped_thread=0
created_dm=0
skipped_dm=0

# --- THREAD_CREATE, one per POSTS channel ---
echo
echo "THREAD_CREATE subscriptions:"
while IFS=$'\t' read -r channel_id channel_name; do
  [[ -z "$channel_id" ]] && continue
  existing=$(jq -r --arg id "$channel_id" --arg url "$N8N_URL" '
    .[] | select(
      .trigger.name == "THREAD_CREATE"
      and .trigger.filter.channelID == $id
      and .url == $url
    ) | .id' <<<"$WEBHOOKS_JSON" | head -n1)
  if [[ -n "$existing" ]]; then
    echo "  = exists: $channel_name  ($channel_id) → $existing"
    skipped_thread=$((skipped_thread + 1))
    continue
  fi
  if $DRY_RUN; then
    echo "  [dry] would create: $channel_name  ($channel_id)"
    created_thread=$((created_thread + 1))
    continue
  fi
  payload=$(jq -nc --arg id "$channel_id" --arg url "$N8N_URL" '{
    action: { name: "THREAD_CREATE", filter: { channelID: $id } }, url: $url
  }')
  resp=$(curl -sS -w "\n%{http_code}" -X PUT \
    "${auth_header[@]}" "${json_header[@]}" \
    -d "$payload" "$HEARTBEAT_API/webhooks")
  code=$(tail -n1 <<<"$resp"); body=$(sed '$d' <<<"$resp")
  if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then
    new_id=$(jq -r '.id // empty' <<<"$body" 2>/dev/null || echo "")
    echo "  ✓ created: $channel_name  ($channel_id) → $new_id"
    created_thread=$((created_thread + 1))
  else
    echo "  ✗ FAILED: $channel_name  ($channel_id) — HTTP $code"
    echo "    $body" | head -c 400; echo
  fi
done < <(jq -r '.[] | [.id, .name] | @tsv' <<<"$POSTS_CHANNELS")

# --- DIRECT_MESSAGE, one per admin/instructor user ---
echo
echo "DIRECT_MESSAGE subscriptions:"
while IFS=$'\t' read -r user_id user_name user_role; do
  [[ -z "$user_id" ]] && continue
  existing=$(jq -r --arg id "$user_id" --arg url "$N8N_URL" '
    .[] | select(
      .trigger.name == "DIRECT_MESSAGE"
      and .trigger.filter.userID == $id
      and .url == $url
    ) | .id' <<<"$WEBHOOKS_JSON" | head -n1)
  if [[ -n "$existing" ]]; then
    echo "  = exists: $user_name  [$user_role] → $existing"
    skipped_dm=$((skipped_dm + 1))
    continue
  fi
  if $DRY_RUN; then
    echo "  [dry] would create: $user_name  [$user_role]  ($user_id)"
    created_dm=$((created_dm + 1))
    continue
  fi
  payload=$(jq -nc --arg id "$user_id" --arg url "$N8N_URL" '{
    action: { name: "DIRECT_MESSAGE", filter: { userID: $id } }, url: $url
  }')
  resp=$(curl -sS -w "\n%{http_code}" -X PUT \
    "${auth_header[@]}" "${json_header[@]}" \
    -d "$payload" "$HEARTBEAT_API/webhooks")
  code=$(tail -n1 <<<"$resp"); body=$(sed '$d' <<<"$resp")
  if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then
    new_id=$(jq -r '.id // empty' <<<"$body" 2>/dev/null || echo "")
    echo "  ✓ created: $user_name  [$user_role] → $new_id"
    created_dm=$((created_dm + 1))
  else
    echo "  ✗ FAILED: $user_name  [$user_role] — HTTP $code"
    echo "    $body" | head -c 400; echo
  fi
done < <(jq -r '.[] | [.id, .name, .role] | @tsv' <<<"$ADMIN_USERS")

echo
echo "Done."
echo "  THREAD_CREATE: created=$created_thread skipped=$skipped_thread total=$N_POSTS"
echo "  DIRECT_MESSAGE: created=$created_dm skipped=$skipped_dm total=$N_ADMINS"
