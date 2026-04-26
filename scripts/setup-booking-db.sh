#!/usr/bin/env bash
# Setup booking_events table and nanoclaw_booking role in nanoclaw_business DB.
# Run on Mac Mini where PostgreSQL is installed.
set -euo pipefail

PSQL="/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql"
DB_NAME="nanoclaw_business"
DB_HOST="192.168.64.1"
DB_PORT="5432"
ROLE_NAME="nanoclaw_booking"

# Generate a random password
ROLE_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "=== Creating booking_events table ==="
$PSQL -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" <<'SQL'
CREATE TABLE IF NOT EXISTS booking_events (
  id SERIAL PRIMARY KEY,
  trafft_appointment_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  service_name TEXT,
  employee_name TEXT,
  start_date_time TIMESTAMPTZ,
  end_date_time TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  follow_up_status TEXT DEFAULT 'pending',
  follow_up_draft TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trafft_appointment_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_booking_events_email ON booking_events(customer_email);
CREATE INDEX IF NOT EXISTS idx_booking_events_type ON booking_events(event_type);
SQL

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
GRANT SELECT, INSERT, UPDATE ON booking_events TO ${ROLE_NAME};
GRANT USAGE, SELECT ON SEQUENCE booking_events_id_seq TO ${ROLE_NAME};
-- Read access to leads for cross-referencing
GRANT SELECT ON leads TO ${ROLE_NAME};
SQL

echo "=== Adding credentials to .env ==="
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

# Remove existing entries if present
grep -v '^BUSINESS_DB_ROLE_BOOKING=' "$ENV_FILE" > "$ENV_FILE.tmp" 2>/dev/null || true
grep -v '^BUSINESS_DB_PASS_BOOKING=' "$ENV_FILE.tmp" > "$ENV_FILE" 2>/dev/null || true
rm -f "$ENV_FILE.tmp"

# Append new credentials
cat >> "$ENV_FILE" <<ENVEOF

# Booking Coordinator DB credentials
BUSINESS_DB_ROLE_BOOKING=${ROLE_NAME}
BUSINESS_DB_PASS_BOOKING=${ROLE_PASS}
ENVEOF

echo "=== Done ==="
echo "Role: ${ROLE_NAME}"
echo "Password: ${ROLE_PASS}"
echo "Added to: ${ENV_FILE}"
echo ""
echo "Next: rebuild NanoClaw (npm run build) and restart"
