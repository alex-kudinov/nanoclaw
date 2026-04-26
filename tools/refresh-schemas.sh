#!/usr/bin/env bash
# refresh-schemas.sh — regenerate agent_docs schema files from live databases
set -euo pipefail

cd "$(dirname "$0")/.."
export TOOLBOX_LIB=/Users/xbohdpukc/dev/toolbox/lib
DB_SCHEMA=/Users/xbohdpukc/dev/toolbox/shared/db/tools/db/db-schema.sh

mkdir -p agent_docs

# SQLite schemas (safe temp-file pattern)
"$DB_SCHEMA" --db store/messages.db --refresh > /tmp/nc-messages-schema.tmp
test -s /tmp/nc-messages-schema.tmp && mv /tmp/nc-messages-schema.tmp agent_docs/messages-db-schema.md

"$DB_SCHEMA" --db data/business/business.db --refresh > /tmp/nc-business-schema.tmp
test -s /tmp/nc-business-schema.tmp && mv /tmp/nc-business-schema.tmp agent_docs/business-db-schema.md

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
    "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' ORDER BY table_name, ordinal_position"
  );
  let out = "# Schema: nanoclaw_business (Postgres)\n\nGenerated: " + new Date().toISOString() + "\n";
  let tbl = "";
  for (const r of rows) {
    if (r.table_name !== tbl) {
      if (tbl) out += "\x60\x60\x60\n";
      out += "\n## " + r.table_name + "\n\n\x60\x60\x60\n";
      tbl = r.table_name;
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
