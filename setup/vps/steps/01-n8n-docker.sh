#!/usr/bin/env bash
# 01-n8n-docker.sh — Deploy n8n + PostgreSQL on VPS via Docker Compose
# Idempotent: safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_vars VPS_HOST VPS_PORT VPS_USER VPS_KEY VPS_SUDO_PASS \
             POSTGRES_PASSWORD N8N_ENCRYPTION_KEY N8N_WEBHOOK_URL \
             N8N_DOMAIN_WEBHOOKS

# ---------------------------------------------------------------------------
step "01 — n8n + PostgreSQL Docker Compose"
# ---------------------------------------------------------------------------

N8N_DATA_DIR="/home/${VPS_USER}/n8n"

# ---------------------------------------------------------------------------
log "Creating remote directory structure"
vps_exec "mkdir -p ${N8N_DATA_DIR}/{postgres-data,n8n-data}"

# ---------------------------------------------------------------------------
log "Writing docker-compose.yml"
cat > /tmp/n8n-compose.yml <<COMPOSE
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: n8n
    volumes:
      - ${N8N_DATA_DIR}/postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - n8n-net

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # Database
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      # Security
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      # URLs
      N8N_HOST: ${N8N_DOMAIN_UI}
      WEBHOOK_URL: ${N8N_WEBHOOK_URL}
      N8N_PROTOCOL: https
      # Execution
      EXECUTIONS_PROCESS: main
      N8N_PAYLOAD_SIZE_MAX: 16
      # Timezone
      GENERIC_TIMEZONE: America/Chicago
      TZ: America/Chicago
      # Disable telemetry
      N8N_DIAGNOSTICS_ENABLED: "false"
      N8N_VERSION_NOTIFICATIONS_ENABLED: "false"
    ports:
      - "127.0.0.1:5678:5678"
    volumes:
      - ${N8N_DATA_DIR}/n8n-data:/home/node/.n8n
    networks:
      - n8n-net

networks:
  n8n-net:
    driver: bridge
COMPOSE

vps_upload /tmp/n8n-compose.yml "${N8N_DATA_DIR}/docker-compose.yml"
rm /tmp/n8n-compose.yml
ok "docker-compose.yml uploaded"

# ---------------------------------------------------------------------------
log "Starting containers"
vps_exec "cd ${N8N_DATA_DIR} && docker compose up -d --pull always"

# ---------------------------------------------------------------------------
log "Waiting for n8n to be ready (up to 60s)"
for i in $(seq 1 12); do
  if vps_exec "curl -fs http://127.0.0.1:5678/healthz" > /dev/null 2>&1; then
    ok "n8n is up"
    break
  fi
  if [[ $i -eq 12 ]]; then
    fail "n8n did not start within 60s — check: ssh into VPS and run: cd ~/n8n && docker compose logs n8n"
  fi
  sleep 5
done

ok "Step 01 complete — n8n running on 127.0.0.1:5678"
