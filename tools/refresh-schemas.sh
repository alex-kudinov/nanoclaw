#!/usr/bin/env bash
# refresh-schemas.sh — regenerate agent_docs schema files from live databases
set -euo pipefail

cd "$(dirname "$0")/.."
export TOOLBOX_LIB=/Users/xbohdpukc/dev/toolbox/lib
DB_SCHEMA=/Users/xbohdpukc/dev/toolbox/shared/db/tools/db/db-schema.sh

mkdir -p agent_docs

# SQLite schema (safe temp-file pattern). The shared toolbox includes one live
# sample row per table for interactive diagnosis; repository documentation must
# remain structure-only, so strip those rows before writing the tracked file.
"$DB_SCHEMA" --db store/messages.db --refresh \
  | /opt/homebrew/bin/node scripts/sanitize-schema-doc.mjs \
  > /tmp/nc-messages-schema.tmp
test -s /tmp/nc-messages-schema.tmp && mv /tmp/nc-messages-schema.tmp agent_docs/messages-db-schema.md

# Postgres schema via node (no psql binary on host)
/opt/homebrew/bin/node -e '
const { Pool } = require("pg");
const fs = require("fs");
const envContent = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["'"'"']|["'"'"']$/g, "");
}
const pool = new Pool({
  host: env.BUSINESS_DB_HOST,
  port: parseInt(env.BUSINESS_DB_PORT || "5432"),
  database: env.BUSINESS_DB_NAME,
  user: env.BUSINESS_DB_ROLE_ADMIN,
  password: env.BUSINESS_DB_PASS_ADMIN,
});
(async () => {
  const { rows } = await pool.query(
    "SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema IN ('"'"'public'"'"', '"'"'business_v2'"'"') ORDER BY table_schema DESC, table_name, ordinal_position"
  );
  let out = "# Schema: nanoclaw_business (Postgres)\n\nGenerated: " + new Date().toISOString() + "\n\nCovers the public.* and business_v2.* schemas. business_v2 tables are\nheaded with their schema prefix; access them via business_v2.v_* views and\nbusiness_v2.fn_*() helpers (see data/business/CLAUDE.md), not base-table DML.\n";
  let tbl = "";
  for (const r of rows) {
    const key = r.table_schema + "." + r.table_name;
    if (key !== tbl) {
      if (tbl) out += "\x60\x60\x60\n";
      const heading = r.table_schema === "public" ? r.table_name : r.table_schema + "." + r.table_name;
      out += "\n## " + heading + "\n\n\x60\x60\x60\n";
      tbl = key;
    }
    const nl = r.is_nullable === "YES" ? "" : " NOT NULL";
    const def = r.column_default ? " DEFAULT=" + r.column_default : "";
    out += "  " + r.column_name.padEnd(30) + r.data_type.padEnd(20) + nl + def + "\n";
  }
  if (tbl) out += "\x60\x60\x60\n";
  process.stdout.write(out);
  await pool.end();
})();
' > /tmp/nc-pg-schema.tmp
test -s /tmp/nc-pg-schema.tmp && mv /tmp/nc-pg-schema.tmp agent_docs/nanoclaw-business-pg-schema.md

echo "Schema files refreshed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
