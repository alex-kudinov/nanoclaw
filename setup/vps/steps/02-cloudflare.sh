#!/usr/bin/env bash
# 02-cloudflare.sh — DNS records + CF Access (for n8n UI) + WAF rate limit
# Idempotent: checks before creating.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_vars CF_ZONE_ID CF_API_TOKEN VPS_PUBLIC_IP \
             N8N_DOMAIN_UI N8N_DOMAIN_WEBHOOKS CF_ACCESS_EMAILS

# ---------------------------------------------------------------------------
step "02 — Cloudflare DNS + Access + WAF"
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
log "Getting Cloudflare account ID from zone"
ACCOUNT_ID=$(cf_api GET "/zones/${CF_ZONE_ID}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['account']['id'])")
ok "Account ID: $ACCOUNT_ID"

# ---------------------------------------------------------------------------
log "Creating DNS records"

create_or_update_dns() {
  local name="$1"   # e.g. "ops" or "webhooks"
  local full="$2"   # e.g. "ops.tandemcoach.co"

  # Check if record exists
  local existing
  existing=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?type=A&name=${full}")
  local count
  count=$(echo "$existing" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['result']))")

  if [[ "$count" -gt 0 ]]; then
    local rec_id
    rec_id=$(echo "$existing" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
    cf_api PATCH "/zones/${CF_ZONE_ID}/dns_records/${rec_id}" \
      "{\"content\":\"${VPS_PUBLIC_IP}\",\"proxied\":true}" > /dev/null
    ok "Updated A record: ${full} → ${VPS_PUBLIC_IP} (proxied)"
  else
    cf_api POST "/zones/${CF_ZONE_ID}/dns_records" \
      "{\"type\":\"A\",\"name\":\"${name}\",\"content\":\"${VPS_PUBLIC_IP}\",\"proxied\":true,\"ttl\":1}" > /dev/null
    ok "Created A record: ${full} → ${VPS_PUBLIC_IP} (proxied)"
  fi
}

create_or_update_dns "ops" "$N8N_DOMAIN_UI"
create_or_update_dns "webhooks" "$N8N_DOMAIN_WEBHOOKS"

# ---------------------------------------------------------------------------
log "Setting SSL mode to Full for new subdomains (zone-level Full SSL)"
# Check current zone SSL setting
CURRENT_SSL=$(cf_api GET "/zones/${CF_ZONE_ID}/settings/ssl" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['value'])")
log "  Current zone SSL mode: $CURRENT_SSL"
if [[ "$CURRENT_SSL" != "full" && "$CURRENT_SSL" != "strict" ]]; then
  cf_api PATCH "/zones/${CF_ZONE_ID}/settings/ssl" '{"value":"full"}' > /dev/null
  ok "SSL mode set to Full"
else
  ok "SSL mode already $CURRENT_SSL — no change"
fi

# ---------------------------------------------------------------------------
log "Creating Cloudflare Access application for ${N8N_DOMAIN_UI}"
# Note: requires "Access: Apps and Policies" permission on the API token.
# If your token is zone-scoped only, this step will 403 and fall back to
# manual instructions. DNS records are already created above.

# Check if Access app already exists (may fail if token lacks Access permission)
EXISTING_APPS=$(cf_api GET "/accounts/${ACCOUNT_ID}/access/apps" 2>/dev/null || echo '{"result":[]}')
EXISTING_APP_ID=$(echo "$EXISTING_APPS" | python3 -c "
import sys, json
apps = json.load(sys.stdin).get('result', [])
for app in apps:
    if app.get('domain') == '${N8N_DOMAIN_UI}':
        print(app['id'])
        break
" 2>/dev/null || true)

if [[ -n "$EXISTING_APP_ID" ]]; then
  ok "CF Access app already exists (ID: $EXISTING_APP_ID)"
  APP_ID="$EXISTING_APP_ID"
else
  APP_RESPONSE=$(cf_api POST "/accounts/${ACCOUNT_ID}/access/apps" \
    "{
      \"name\": \"n8n Operations UI\",
      \"domain\": \"${N8N_DOMAIN_UI}\",
      \"type\": \"self_hosted\",
      \"session_duration\": \"24h\",
      \"allowed_idps\": [],
      \"auto_redirect_to_identity\": false
    }" 2>/dev/null || echo '{"error":"403"}')

  APP_ID=$(echo "$APP_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('id',''))" 2>/dev/null || true)

  if [[ -n "$APP_ID" ]]; then
    ok "Created CF Access app (ID: $APP_ID)"
  else
    echo ""
    echo "  ⚠  CF Access API returned 403 — token lacks 'Access: Apps and Policies' permission."
    echo "  Set up CF Access manually in the dashboard:"
    echo "    1. dash.cloudflare.com → Zero Trust → Access → Applications → Add"
    echo "    2. Type: Self-hosted | Domain: ${N8N_DOMAIN_UI}"
    echo "    3. Policy: Allow | Rule: Emails in (${CF_ACCESS_EMAILS})"
    echo "  This MUST be done before n8n is accessible to the internet."
    echo ""
  fi
fi

# ---------------------------------------------------------------------------
if [[ -n "${APP_ID:-}" ]]; then
  log "Creating Access policy — allow specified emails"

  EMAIL_POLICY=$(python3 -c "
import json, sys
emails = '${CF_ACCESS_EMAILS}'.split(',')
includes = [{'email': {'email': e.strip()}} for e in emails]
print(json.dumps(includes))
")

  EXISTING_POLICIES=$(cf_api GET "/accounts/${ACCOUNT_ID}/access/apps/${APP_ID}/policies" 2>/dev/null || echo '{"result":[]}')
  EXISTING_POLICY_COUNT=$(echo "$EXISTING_POLICIES" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('result', [])))")

  if [[ "$EXISTING_POLICY_COUNT" -gt 0 ]]; then
    ok "CF Access policy already exists — skipping"
  else
    cf_api POST "/accounts/${ACCOUNT_ID}/access/apps/${APP_ID}/policies" \
      "{
        \"name\": \"Allow Tandem Admins\",
        \"decision\": \"allow\",
        \"include\": ${EMAIL_POLICY},
        \"require\": [],
        \"exclude\": []
      }" > /dev/null
    ok "Created Access policy for: ${CF_ACCESS_EMAILS}"
  fi
fi

# ---------------------------------------------------------------------------
log "WAF rate limit for ${N8N_DOMAIN_WEBHOOKS}"
# CF Pro rate limit rules require the Ruleset API (not the deprecated firewall/rules endpoint).
# Creating them via API requires the "Zone WAF" token permission + Pro plan.
# Instructions for manual setup via dashboard:
echo ""
echo "  ℹ  WAF rate limit — set up manually in CF dashboard (requires Pro plan):"
echo "     Security → WAF → Rate limiting rules → Create rule"
echo "     Rule: http.host eq \"${N8N_DOMAIN_WEBHOOKS}\""
echo "     Threshold: 200 requests per 10 seconds per IP → Block"
echo ""
ok "Rate limit instructions printed"

ok "Step 02 complete"
log ""
log "DNS propagation may take up to 5 minutes."
log "Verify with: dig +short ops.tandemcoach.co"
log "Then proceed to step 03 (LiteSpeed)."
