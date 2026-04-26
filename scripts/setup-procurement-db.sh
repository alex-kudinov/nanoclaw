#!/usr/bin/env bash
# Setup procurement_opportunities table and nanoclaw_procurement role in nanoclaw_business DB.
# Run on Mac Mini where PostgreSQL is installed.
set -euo pipefail

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
DB_NAME="nanoclaw_business"
DB_HOST="localhost"
DB_PORT="5432"
ROLE_NAME="nanoclaw_procurement"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

# Pre-flight checks
if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl not found" >&2
  exit 1
fi

echo "=== Pre-flight: testing DB connection ==="
if ! $PSQL -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: cannot connect to $DB_NAME at $DB_HOST:$DB_PORT" >&2
  exit 1
fi

# Backup .env
echo "=== Backing up .env ==="
cp "$ENV_FILE" "$ENV_FILE.bak"

# Generate a random password
ROLE_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "=== Applying procurement schema ==="
$PSQL -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$(cd "$(dirname "$0")/.." && pwd)/data/business/procurement-schema.sql"

echo "=== Creating role: $ROLE_NAME ==="
$PSQL -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE_NAME}') THEN
    CREATE ROLE ${ROLE_NAME} WITH LOGIN PASSWORD '${ROLE_PASS}';
  ELSE
    ALTER ROLE ${ROLE_NAME} WITH PASSWORD '${ROLE_PASS}';
  END IF;
END
\$\$;

GRANT USAGE ON SCHEMA public TO ${ROLE_NAME};
GRANT SELECT, INSERT, UPDATE ON procurement_opportunities TO ${ROLE_NAME};
GRANT USAGE, SELECT ON SEQUENCE procurement_opportunities_id_seq TO ${ROLE_NAME};
-- Read access to leads for cross-referencing
GRANT SELECT ON leads TO ${ROLE_NAME};
SQL

echo "=== Verifying table exists ==="
COUNT=$($PSQL -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM procurement_opportunities")
echo "Row count: $COUNT"

echo "=== Verifying procurement role access ==="
PGPASSWORD="$ROLE_PASS" $PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$ROLE_NAME" -d "$DB_NAME" -c "SELECT 1 FROM procurement_opportunities LIMIT 0"

echo "=== Adding credentials to .env ==="
# Remove existing entries if present
grep -v '^BUSINESS_DB_ROLE_PROCUREMENT=' "$ENV_FILE" > "$ENV_FILE.tmp" 2>/dev/null || true
grep -v '^BUSINESS_DB_PASS_PROCUREMENT=' "$ENV_FILE.tmp" > "$ENV_FILE" 2>/dev/null || true
rm -f "$ENV_FILE.tmp"

# Append new credentials
cat >> "$ENV_FILE" <<ENVEOF

# Procurement Scout DB credentials
BUSINESS_DB_ROLE_PROCUREMENT=${ROLE_NAME}
BUSINESS_DB_PASS_PROCUREMENT=${ROLE_PASS}
ENVEOF

echo "=== Done ==="
echo "Role: ${ROLE_NAME}"
echo "Password: ${ROLE_PASS}"
echo "Added to: ${ENV_FILE}"
echo "Backup: ${ENV_FILE}.bak"
echo ""
echo "Next: rebuild NanoClaw (npm run build) and restart"
