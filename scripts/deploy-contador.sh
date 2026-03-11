#!/bin/bash
# Deploy El Contador to Mac Mini
# Run this AFTER:
#   1. Creating #gru-bookkeeper channel in Slack
#   2. Getting the channel ID (right-click → View channel details → Channel ID)
#   3. Updating CHANNEL_ID below
#
# Usage: bash scripts/deploy-contador.sh

set -euo pipefail

# Ensure Homebrew binaries are in PATH (needed for non-interactive SSH)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/Cellar/node/25.6.1_1/bin:$PATH"

# ── Configuration ─────────────────────────────────────────────────────────────
CHANNEL_ID="${1:?Usage: bash scripts/deploy-contador.sh <slack-channel-id>}"
CHANNEL_JID="slack:${CHANNEL_ID}"
DB_PASS="$(openssl rand -base64 24)"

echo "=== El Contador Deployment ==="
echo "Channel: ${CHANNEL_JID}"
echo ""

# ── Step 1: Register group in SQLite ──────────────────────────────────────────
echo "[1/5] Registering contador group..."

CONTAINER_CONFIG='{"additionalMounts":[{"hostPath":"tools/contador","containerPath":"/workspace/extra/tools","readonly":true},{"hostPath":"data/service-accounts","containerPath":"/workspace/extra/credentials","readonly":true},{"hostPath":"knowledge/agents/contador","containerPath":"/workspace/extra/knowledge","readonly":true}]}'

# Use the compiled JS to register (better-sqlite3 available on Mac Mini)
node -e "
const Database = require('better-sqlite3');
const db = new Database('data/nanoclaw.db');
db.prepare(\`INSERT OR REPLACE INTO registered_groups
  (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`).run(
  '${CHANNEL_JID}',
  'El Contador',
  'contador',
  '@Gru',
  new Date().toISOString(),
  '${CONTAINER_CONFIG}',
  0,
  0
);
console.log('  Group registered: contador → ${CHANNEL_JID}');
"

# ── Step 2: Update webhook definition with real channel JID ───────────────────
echo "[2/5] Updating webhook definition..."
# Replace placeholder in webhooks.json
if grep -q 'PLACEHOLDER_BOOKKEEPER_JID' data/webhooks.json; then
  sed -i '' "s|PLACEHOLDER_BOOKKEEPER_JID|${CHANNEL_JID}|" data/webhooks.json
  echo "  Updated webhooks.json with ${CHANNEL_JID}"
else
  echo "  webhooks.json already configured (no placeholder found)"
fi

# ── Step 3: Create PostgreSQL role ────────────────────────────────────────────
echo "[3/5] Creating PostgreSQL role nanoclaw_contador..."

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
PGPASSWORD="${BUSINESS_DB_PASS_ADMIN:-8oABTYn3O58q16bct9nvZcyeVwaZi4kP}" $PSQL \
  -h 192.168.64.1 -U nanoclaw_admin -d nanoclaw_business -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nanoclaw_contador') THEN
    CREATE ROLE nanoclaw_contador LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;

-- Create payments table if not exists
CREATE TABLE IF NOT EXISTS payments (
  id                SERIAL PRIMARY KEY,
  email             VARCHAR(255) NOT NULL,
  name              VARCHAR(255),
  product_name      VARCHAR(500),
  product_id        VARCHAR(255) DEFAULT '',
  amount_cents      INTEGER,
  currency          VARCHAR(10) DEFAULT 'USD',
  stripe_session_id VARCHAR(255) UNIQUE,
  payment_status    VARCHAR(50),
  event_type        VARCHAR(100),
  paid_at           TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_email   ON payments (email);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at DESC);

GRANT INSERT, SELECT ON payments TO nanoclaw_contador;
GRANT USAGE, SELECT ON SEQUENCE payments_id_seq TO nanoclaw_contador;
"
echo "  PostgreSQL role created with password: ${DB_PASS}"
echo "  UPDATE .env: BUSINESS_DB_PASS_CONTADOR=${DB_PASS}"

# ── Step 4: Update .env with real password ────────────────────────────────────
echo "[4/5] Updating .env with contador DB password..."
if grep -q 'CHANGE_ME_AFTER_CREATING_PG_ROLE' .env; then
  sed -i '' "s/CHANGE_ME_AFTER_CREATING_PG_ROLE/${DB_PASS}/" .env
  echo "  .env updated"
else
  echo "  .env already has a real password (no placeholder found)"
fi

# ── Step 5: Rebuild and restart ───────────────────────────────────────────────
echo "[5/5] Building and restarting NanoClaw..."
npm run build
launchctl kickstart -k "gui/$(id -u)/com.nanoclaw"
echo "  NanoClaw restarted"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Remaining manual steps:"
echo "  1. Configure n8n Stripe webhook workflow:"
echo "     - Trigger: Stripe webhook for payment_intent.succeeded"
echo "     - JS Code node: extract { stripe_id: event.data.object.id, event_type: event.type }"
echo "     - HTTP Request: POST http://mini-claw:8088/hook/stripe-payment"
echo "       Headers: X-Webhook-Secret: ed43647461a200485b69ec48c2e00b243941a859ac678307"
echo "       Body: { stripe_id, event_type }"
echo ""
echo "  2. Rebuild container image (agent-runner has Stripe/Sheets env injection):"
echo "     ./container/build.sh"
echo ""
echo "  3. Test with a real payment or re-process an existing one:"
echo "     curl -X POST http://localhost:8088/hook/stripe-payment \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -H 'X-Webhook-Secret: ed43647461a200485b69ec48c2e00b243941a859ac678307' \\"
echo "       -d '{\"stripe_id\":\"pi_3T7efDRnZI4gH1uA0wtCCWnA\",\"event_type\":\"payment_intent.succeeded\"}'"
