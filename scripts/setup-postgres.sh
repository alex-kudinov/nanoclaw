#!/bin/bash
# Setup PostgreSQL for NanoClaw on Mac Mini.
# Idempotent — safe to re-run. Creates the database, admin role, and
# configures listen_addresses + pg_hba for Apple Container bridge access.
#
# Prerequisites: postgresql@16 installed via Homebrew
# Usage: bash scripts/setup-postgres.sh

set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
PG_CONF="/opt/homebrew/var/postgresql@16/postgresql.conf"
HBA_CONF="/opt/homebrew/var/postgresql@16/pg_hba.conf"
DB_NAME="nanoclaw_business"
ADMIN_ROLE="nanoclaw_admin"
BRIDGE_SUBNET="192.168.64.0/24"

echo "=== NanoClaw PostgreSQL Setup ==="

# ── Step 1: Ensure PG is running ─────────────────────────────────────────────
echo "[1/4] Checking PostgreSQL..."
if ! $PSQL -c "SELECT 1;" >/dev/null 2>&1; then
  echo "  Starting PostgreSQL..."
  brew services start postgresql@16
  sleep 3
fi
echo "  PostgreSQL is running"

# ── Step 2: Configure listen_addresses ────────────────────────────────────────
echo "[2/4] Configuring listen_addresses..."
CURRENT=$(grep "^listen_addresses" "$PG_CONF" | head -1)
if echo "$CURRENT" | grep -q "'\\*'"; then
  echo "  Already set to '*'"
else
  sed -i.bak "s/^listen_addresses = .*/listen_addresses = '*'\t\t# what IP address(es) to listen on;/" "$PG_CONF"
  echo "  Changed: ${CURRENT} → listen_addresses = '*'"
  NEEDS_RESTART=1
fi

# ── Step 3: Configure pg_hba.conf ─────────────────────────────────────────────
echo "[3/4] Configuring pg_hba.conf..."
if grep -q "$BRIDGE_SUBNET" "$HBA_CONF"; then
  echo "  Bridge subnet rule already present"
else
  echo "host    ${DB_NAME}    all    ${BRIDGE_SUBNET}    scram-sha-256" >> "$HBA_CONF"
  echo "  Added: host ${DB_NAME} all ${BRIDGE_SUBNET} scram-sha-256"
  NEEDS_RESTART=1
fi

# ── Step 4: Create database and admin role ────────────────────────────────────
echo "[4/4] Creating database and admin role..."

$PSQL -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" | grep -q 1 \
  || $PSQL -c "CREATE DATABASE ${DB_NAME};"
echo "  Database: ${DB_NAME}"

$PSQL -d "$DB_NAME" -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ADMIN_ROLE}') THEN
    CREATE ROLE ${ADMIN_ROLE} LOGIN PASSWORD '$(openssl rand -base64 24)';
    RAISE NOTICE 'Created role ${ADMIN_ROLE} — update BUSINESS_DB_PASS_ADMIN in .env';
  END IF;
END \$\$;

GRANT CONNECT ON DATABASE ${DB_NAME} TO ${ADMIN_ROLE};
GRANT CREATE ON SCHEMA public TO ${ADMIN_ROLE};
"
echo "  Admin role: ${ADMIN_ROLE}"

# ── Restart if config changed ─────────────────────────────────────────────────
if [[ "${NEEDS_RESTART:-0}" == "1" ]]; then
  echo ""
  echo "Restarting PostgreSQL to apply config changes..."
  brew services restart postgresql@16
  sleep 3
  echo "  Restarted"
fi

echo ""
echo "=== PostgreSQL Setup Complete ==="
echo ""
echo "listen_addresses = '*' — PG accepts connections on all interfaces."
echo "Apple Container agents reach PG via bridge IP (192.168.64.1)."
echo "pg_hba.conf restricts ${DB_NAME} access to ${BRIDGE_SUBNET} (scram-sha-256)."
echo ""
echo "Next: run agent-specific deploy scripts (e.g. scripts/deploy-contador.sh)"
