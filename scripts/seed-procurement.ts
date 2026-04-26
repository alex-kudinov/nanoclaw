/**
 * Seed procurement_opportunities from the latest scan snapshot.
 * Must run on Mac Mini (admin creds only in Mac Mini .env).
 *
 * Usage: npx tsx scripts/seed-procurement.ts
 */
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PSQL = '/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql';

// Load DB connection from .env
const envPath = path.join(import.meta.dirname, '..', '.env');
const envSharedPath = path.join(
  process.env.HOME || '~',
  'dev',
  '.env.shared',
);

function loadEnv(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return result;
}

const env = { ...loadEnv(envSharedPath), ...loadEnv(envPath) };

// .env has 192.168.64.1 (container bridge) but this script runs on the Mac Mini host
const DB_HOST = 'localhost';
const DB_PORT = env.BUSINESS_DB_PORT || '5432';
const DB_NAME = env.BUSINESS_DB_NAME || 'nanoclaw_business';
const DB_ROLE = env.BUSINESS_DB_ROLE_ADMIN;
const DB_PASS = env.BUSINESS_DB_PASS_ADMIN;

if (!DB_ROLE || !DB_PASS) {
  console.error(
    'ERROR: BUSINESS_DB_ROLE_ADMIN / BUSINESS_DB_PASS_ADMIN not found in .env',
  );
  process.exit(1);
}

// Read snapshot
const snapshotPath = path.join(
  import.meta.dirname,
  '..',
  'groups',
  'procurement',
  'snapshots',
  'latest.json',
);

if (!fs.existsSync(snapshotPath)) {
  console.error(`ERROR: Snapshot not found at ${snapshotPath}`);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
const opportunities: Array<Record<string, unknown>> = snapshot.opportunities;

if (!opportunities?.length) {
  console.error('ERROR: No opportunities in snapshot');
  process.exit(1);
}

// Extract bonfire_id
function extractBonfireId(opp: Record<string, unknown>): string {
  const url = opp.url as string | null;
  if (url) {
    const match = url.match(/\/opportunities\/(\d+)$/);
    if (match) return match[1];
  }
  // Fallback: SHA256 hash for null-URL opportunities
  const title = (opp.title as string) || '';
  const agency = (opp.agency as string) || '';
  return crypto
    .createHash('sha256')
    .update(title + agency)
    .digest('hex')
    .slice(0, 8);
}

// Build SQL
const sqlLines: string[] = ['BEGIN;'];

for (const opp of opportunities) {
  const bonfireId = extractBonfireId(opp);
  if (!bonfireId) {
    console.error(`WARNING: empty bonfire_id for "${opp.title}" — skipping`);
    continue;
  }

  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const relevance =
    opp.relevant === 'relevant'
      ? 'relevant'
      : opp.relevant === 'borderline'
        ? 'borderline'
        : 'noise';

  const rawJson = JSON.stringify(opp);

  sqlLines.push(`INSERT INTO procurement_opportunities
  (bonfire_id, bonfire_url, title, agency, close_date, category, search_keyword, relevance, relevance_reason, raw_snapshot)
VALUES
  (${esc(bonfireId)}, ${opp.url ? esc(opp.url) : 'NULL'}, ${esc(opp.title)}, ${opp.agency ? esc(opp.agency) : 'NULL'}, ${opp.close_date ? esc(opp.close_date) : 'NULL'}, ${opp.category !== undefined ? esc(opp.category) : 'NULL'}, ${opp.search_keyword !== undefined ? esc(opp.search_keyword) : 'NULL'}, ${esc(relevance)}, ${opp.relevance_reason ? esc(opp.relevance_reason) : 'NULL'}, $$${rawJson}$$::jsonb)
ON CONFLICT (bonfire_id) DO UPDATE SET last_seen_at = NOW();`);
}

sqlLines.push('COMMIT;');

const sql = sqlLines.join('\n');

// Execute
try {
  const result = execSync(
    `PGPASSWORD='${DB_PASS}' ${PSQL} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_ROLE} -d ${DB_NAME}`,
    {
      input: sql,
      encoding: 'utf-8',
      timeout: 30000,
    },
  );
  console.log(result);

  // Verify count
  const countResult = execSync(
    `PGPASSWORD='${DB_PASS}' ${PSQL} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_ROLE} -d ${DB_NAME} -t -A -c "SELECT count(*), status FROM procurement_opportunities GROUP BY status"`,
    { encoding: 'utf-8', timeout: 10000 },
  );
  console.log(`\nSeeded ${opportunities.length} opportunities:`);
  console.log(countResult.trim());
} catch (err) {
  console.error('ERROR executing SQL:', err);
  process.exit(1);
}
