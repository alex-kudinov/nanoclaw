#!/usr/bin/env bash
# verify.sh — Smoke test the full Gru VPS stack
# Checks: Docker containers, n8n health, LiteSpeed vhosts, Cloudflare DNS, CF Access
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_vars VPS_HOST VPS_PORT VPS_USER VPS_KEY \
             N8N_DOMAIN_UI N8N_DOMAIN_WEBHOOKS CF_ZONE_ID CF_API_TOKEN

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "  ✓ ${label}"
    ((PASS++)) || true
  else
    echo "  ✗ ${label}: ${result}"
    ((FAIL++)) || true
  fi
}

echo ""
echo "=== VPS: Docker containers ==="
CONTAINERS=$(vps_exec "docker ps --format '{{.Names}}'")
check "postgres container running" \
  "$([[ "$CONTAINERS" == *"postgres"* ]] && echo ok || echo "not found")"
check "n8n container running" \
  "$([[ "$CONTAINERS" == *"n8n"* ]] && echo ok || echo "not found")"

echo ""
echo "=== VPS: n8n health (local loopback) ==="
N8N_HEALTH=$(vps_exec "curl -fs http://127.0.0.1:5678/healthz --max-time 5" 2>/dev/null || echo "FAIL")
check "n8n /healthz via port 5678" \
  "$([[ "$N8N_HEALTH" != "FAIL" ]] && echo ok || echo "curl failed")"

echo ""
echo "=== VPS: LiteSpeed proxy (Host header override, HTTPS) ==="
OPS_PROXY=$(vps_exec "curl -kso /dev/null -w '%{http_code}' -H 'Host: ${N8N_DOMAIN_UI}' https://127.0.0.1/ --max-time 5" 2>/dev/null || echo "000")
check "LiteSpeed → n8n proxy (ops vhost)" \
  "$([[ "$OPS_PROXY" =~ ^(200|401|302)$ ]] && echo ok || echo "HTTP $OPS_PROXY")"

WBHK_PROXY=$(vps_exec "curl -kso /dev/null -w '%{http_code}' -H 'Host: ${N8N_DOMAIN_WEBHOOKS}' 'https://127.0.0.1/webhook-test/health' --max-time 5" 2>/dev/null || echo "000")
check "LiteSpeed → n8n proxy (webhooks vhost)" \
  "$([[ "$WBHK_PROXY" =~ ^(200|404|401)$ ]] && echo ok || echo "HTTP $WBHK_PROXY")"

echo ""
echo "=== Cloudflare: DNS resolution ==="
OPS_IP=$(dig +short "${N8N_DOMAIN_UI}" A | tail -1)
check "ops.tandemcoach.co resolves" \
  "$([[ -n "$OPS_IP" ]] && echo ok || echo "no A record")"

WBHK_IP=$(dig +short "${N8N_DOMAIN_WEBHOOKS}" A | tail -1)
check "webhooks.tandemcoach.co resolves" \
  "$([[ -n "$WBHK_IP" ]] && echo ok || echo "no A record")"

echo ""
echo "=== Cloudflare: Access app registered ==="
ACCOUNT_ID=$(cf_api GET "/zones/${CF_ZONE_ID}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['account']['id'])")
APPS=$(cf_api GET "/accounts/${ACCOUNT_ID}/access/apps" 2>/dev/null || echo '{"result":[]}')
APP_FOUND=$(echo "$APPS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
apps = data.get('result', [])
errors = data.get('errors', [])
if errors or not isinstance(apps, list):
    print('action-required: set up manually at dash.cloudflare.com → Zero Trust → Access')
elif any(a.get('domain') == '${N8N_DOMAIN_UI}' for a in apps):
    print('ok')
else:
    print('action-required: set up manually at dash.cloudflare.com → Zero Trust → Access')
")
# CF Access is a security gate — warn but don't count as hard fail
if [[ "$APP_FOUND" == ok ]]; then
  echo "  ✓ CF Access app for ${N8N_DOMAIN_UI}"
  ((PASS++)) || true
else
  echo "  ⚠  CF Access app for ${N8N_DOMAIN_UI}: ${APP_FOUND}"
  echo "     Action: dash.cloudflare.com → Zero Trust → Access → Applications → Add"
  echo "     IMPORTANT: Complete before sharing the ops.tandemcoach.co URL"
fi

echo ""
echo "=== Public HTTPS (via Cloudflare) ==="
# Use -so (not -fso) so 4xx codes are captured rather than triggering || echo "000"
OPS_HTTP=$(curl -so /dev/null -w '%{http_code}' "https://${N8N_DOMAIN_UI}/" --max-time 10 2>/dev/null || echo "000")
check "https://${N8N_DOMAIN_UI}/ reachable" \
  "$([[ "$OPS_HTTP" =~ ^(200|302|401|403)$ ]] && echo ok || echo "HTTP $OPS_HTTP")"

# 404 on /webhook-test/health is expected — it means n8n answered (no workflow at that path)
WBHK_HTTP=$(curl -so /dev/null -w '%{http_code}' "https://${N8N_DOMAIN_WEBHOOKS}/webhook-test/health" --max-time 10 2>/dev/null || echo "000")
check "https://${N8N_DOMAIN_WEBHOOKS}/ reachable (404=expected, proxy working)" \
  "$([[ "$WBHK_HTTP" =~ ^(200|404|401)$ ]] && echo ok || echo "HTTP $WBHK_HTTP")"

echo ""
echo "======================================================"
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "======================================================"

[[ $FAIL -eq 0 ]]
