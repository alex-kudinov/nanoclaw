#!/usr/bin/env node
/**
 * backfill-names.js — repair "Unknown" student names from Stripe.
 *
 * Why this exists: Heartbeat (the course/community platform) creates the Stripe
 * customer and fires `payment_intent.succeeded` BEFORE it writes `customer.name`
 * onto the Customer object. process-payment.cjs fetches the customer at webhook
 * time and races — when the name isn't set yet (and charge.billing_details.name
 * is null, as it always is for these), it records "Unknown". Stripe back-fills
 * customer.name seconds later, so the name is reliably available after the fact.
 *
 * This reconciler finds every payment whose stored name is empty/Unknown,
 * re-resolves it from Stripe, and patches BOTH the `payments` table and the
 * Student Roster sheet (name column, only when currently blank/Unknown — never
 * overwrites a manually-corrected name). Idempotent and safe to run repeatedly:
 * it is both the historical backfill and the going-forward straggler backstop.
 *
 * Usage:
 *   node backfill-names.cjs            # dry-run (default — reports, writes nothing)
 *   node backfill-names.cjs --apply    # resolve + write payments table + roster
 *
 * Required env (same as process-payment.cjs):
 *   STRIPE_RESTRICTED_KEY / STRIPE_SECRET_KEY_ALT, SHEETS_ROSTER_ID,
 *   SHEETS_SA_JSON, plus psql on PATH (PGDATABASE=nanoclaw_business).
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const APPLY = process.argv.includes('--apply');

/**
 * Fill any required key missing from process.env from the project env files
 * (~/dev/.env.shared base, then ./.env overlay — project wins), mirroring
 * src/env.ts. Lets this tool run standalone (manual backfill / cron) without
 * the caller exporting secrets onto argv. A host wrapper that already exports
 * the vars is unaffected.
 */
function loadEnvFallback(keys) {
  const wanted = new Set(keys.filter((k) => !process.env[k]));
  if (wanted.size === 0) return;
  for (const file of [path.join(os.homedir(), 'dev', '.env.shared'), path.join(process.cwd(), '.env')]) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      if (!wanted.has(k)) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[k] = v;
    }
  }
}

loadEnvFallback([
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_SECRET_KEY_ALT',
  'SHEETS_ROSTER_ID',
  'SHEETS_PAYMENTS_ID',
]);

const STRIPE_KEYS = [
  process.env.STRIPE_RESTRICTED_KEY,
  process.env.STRIPE_SECRET_KEY_ALT,
].filter(Boolean);
if (STRIPE_KEYS.length === 0) {
  console.error('ERROR: no Stripe keys (STRIPE_RESTRICTED_KEY / STRIPE_SECRET_KEY_ALT)');
  process.exit(1);
}

const SHEETS_ROSTER_ID = process.env.SHEETS_ROSTER_ID;
const SHEETS_PAYMENTS_ID = process.env.SHEETS_PAYMENTS_ID;
const SA_PATH =
  process.env.SHEETS_SA_JSON ||
  '/workspace/extra/service-accounts/sheets-service-account.json';
const PGDATABASE = process.env.PGDATABASE || 'nanoclaw_business';

// ── Stripe ────────────────────────────────────────────────────────────────

function stripeGet(key, path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${key}:`).toString('base64');
    https
      .get({ hostname: 'api.stripe.com', path, headers: { Authorization: `Basic ${auth}` } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j);
          } catch (e) {
            reject(new Error(`parse error: ${data.slice(0, 120)}`));
          }
        });
      })
      .on('error', reject);
  });
}

/** GET against each key in turn; skip a key only on a not-found-style error. */
async function stripeGetAnyKey(path) {
  let lastErr;
  for (const key of STRIPE_KEYS) {
    try {
      return await stripeGet(key, path);
    } catch (err) {
      lastErr = err;
      if (!/no such|resource_missing|invalid_request/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

/** Best-effort customer name for a pi_/cs_ id. '' when Stripe has none yet. */
async function resolveName(stripeId) {
  if (stripeId.startsWith('cs_')) {
    const s = await stripeGetAnyKey(
      `/v1/checkout/sessions/${stripeId}?expand[]=customer_details`,
    );
    return (
      s.customer_details?.name || (s.metadata && s.metadata.name) || ''
    ).trim();
  }
  const pi = await stripeGetAnyKey(
    `/v1/payment_intents/${stripeId}?expand[]=latest_charge&expand[]=customer`,
  );
  const cust = pi.customer && typeof pi.customer === 'object' ? pi.customer : null;
  const charge =
    pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  return (
    cust?.name ||
    charge?.billing_details?.name ||
    (pi.metadata && pi.metadata.name) ||
    ''
  ).trim();
}

// ── Google Sheets ───────────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiry = 0;

function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return Promise.resolve(cachedToken);
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf-8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key)
    .toString('base64url');
  const jwt = `${header}.${claims}.${signature}`;
  return new Promise((resolve, reject) => {
    const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.access_token) {
              cachedToken = j.access_token;
              tokenExpiry = Date.now() + 3500_000;
              resolve(j.access_token);
            } else reject(new Error(`token exchange failed: ${data}`));
          } catch (e) {
            reject(new Error(`token parse error: ${data.slice(0, 120)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sheetsRequest(spreadsheetId, method, path, body) {
  return getAccessToken().then(
    (token) =>
      new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/${path}`,
            method,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              if (res.statusCode >= 400) reject(new Error(`Sheets ${res.statusCode}: ${data.slice(0, 160)}`));
              else resolve(JSON.parse(data));
            });
          },
        );
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      }),
  );
}

const sheetsGet = (spreadsheetId, range) =>
  sheetsRequest(spreadsheetId, 'GET', `values/${encodeURIComponent(range)}`, null);
const sheetsUpdate = (spreadsheetId, range, values) =>
  sheetsRequest(
    spreadsheetId,
    'PUT',
    `values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { values },
  );

function getSheetTitles() {
  return getAccessToken().then(
    (token) =>
      new Promise((resolve, reject) => {
        https
          .get(
            {
              hostname: 'sheets.googleapis.com',
              path: `/v4/spreadsheets/${SHEETS_ROSTER_ID}?fields=sheets.properties.title`,
              headers: { Authorization: `Bearer ${token}` },
            },
            (res) => {
              let data = '';
              res.on('data', (c) => (data += c));
              res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error(`metadata ${res.statusCode}`));
                const j = JSON.parse(data);
                resolve((j.sheets || []).map((s) => s.properties.title));
              });
            },
          )
          .on('error', reject);
      }),
  );
}

/**
 * Prefetch the Email/Name columns of every student tab ONCE (one read per tab),
 * so per-email resolution is in-memory. Avoids the Sheets 60-reads/min quota
 * that a per-email-per-tab scan blows through. A student tab is any tab whose
 * header row is Email | Name.
 */
async function loadStudentTabs(titles) {
  const out = [];
  for (const tab of titles) {
    let resp;
    try {
      resp = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!A:B`);
    } catch {
      continue;
    }
    const rows = resp.values || [];
    const h = rows[0] || [];
    if ((h[0] || '').toLowerCase() !== 'email' || (h[1] || '').toLowerCase() !== 'name') continue;
    out.push({ tab, rows });
  }
  return out;
}

/** Set Name (col B) for `email` on each student tab where it is blank/Unknown. */
async function patchRoster(studentTabs, email, name) {
  const patched = [];
  for (const { tab, rows } of studentTabs) {
    const idx = rows.findIndex((r, i) => i > 0 && r[0] && r[0].toLowerCase() === email.toLowerCase());
    if (idx < 0) continue;
    const cur = (rows[idx][1] || '').trim();
    if (cur && cur.toLowerCase() !== 'unknown') continue; // never clobber a real name
    const cell = `${tab}!B${idx + 1}`;
    if (APPLY) {
      await sheetsUpdate(SHEETS_ROSTER_ID, cell, [[name]]);
      rows[idx][1] = name; // keep cache coherent for repeated runs
    }
    patched.push(cell);
  }
  return patched;
}

// ── Postgres (via psql) ───────────────────────────────────────────────────

function psql(args) {
  return execFileSync('psql', ['-d', PGDATABASE, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function findUnknownPayments() {
  const out = psql([
    '-tA',
    '-F',
    '|',
    '-c',
    "SELECT stripe_session_id, email FROM payments WHERE name IS NULL OR name = '' OR name = 'Unknown' ORDER BY paid_at",
  ]);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [stripeId, email] = l.split('|');
      return { stripeId, email };
    });
}

/** Double single-quotes for safe inclusion in a SQL string literal. */
const sqlEscape = (s) => (s || '').replace(/'/g, "''");

function updatePaymentName(stripeId, name) {
  // execFileSync runs psql with no shell (no shell-injection surface); sqlEscape
  // makes the value a safe SQL string literal. Matches process-payment.cjs.
  psql([
    '-c',
    `UPDATE payments SET name = '${sqlEscape(name)}' WHERE stripe_session_id = '${sqlEscape(stripeId)}'`,
  ]);
}

/** Most-recent real (non-Unknown) name recorded for this email, or ''. */
function paymentNameByEmail(email) {
  return psql([
    '-tA',
    '-c',
    `SELECT name FROM payments WHERE lower(email) = lower('${sqlEscape(email)}') AND name IS NOT NULL AND name <> '' AND name <> 'Unknown' ORDER BY paid_at DESC LIMIT 1`,
  ]).trim();
}

/** Most-recent Stripe id recorded for this email, or ''. */
function stripeIdByEmail(email) {
  return psql([
    '-tA',
    '-c',
    `SELECT stripe_session_id FROM payments WHERE lower(email) = lower('${sqlEscape(email)}') ORDER BY paid_at DESC LIMIT 1`,
  ]).trim();
}

/** Look the email up as a Stripe customer (each account); first non-empty name. */
async function resolveNameFromStripeByEmail(email) {
  for (const key of STRIPE_KEYS) {
    let r;
    try {
      r = await stripeGet(key, `/v1/customers?email=${encodeURIComponent(email)}&limit=5`);
    } catch {
      continue;
    }
    for (const c of r.data || []) {
      if ((c.name || '').trim()) return c.name.trim();
    }
  }
  return '';
}

/**
 * Resolve a real name for an email from any source, cheapest first:
 *   1. payments table (a prior row already has the real name)
 *   2. Stripe via that email's recorded payment id
 *   3. Stripe customer lookup by email (covers roster rows with no payment row)
 */
async function resolveNameByEmail(email) {
  const fromDb = paymentNameByEmail(email);
  if (fromDb) return fromDb;
  const stripeId = stripeIdByEmail(email);
  if (stripeId) {
    try {
      const n = await resolveName(stripeId);
      if (n) return n;
    } catch { /* fall through to email lookup */ }
  }
  return resolveNameFromStripeByEmail(email);
}

/** Every student-tab Name cell that is blank or a literal "Unknown". */
function scanRosterUnknowns(studentTabs) {
  const out = [];
  for (const { tab, rows } of studentTabs) {
    for (let i = 1; i < rows.length; i++) {
      const email = (rows[i][0] || '').trim();
      const name = (rows[i][1] || '').trim();
      if (email && (!name || name.toLowerCase() === 'unknown')) {
        out.push({ tab, rowIdx: i, email });
      }
    }
  }
  return out;
}

const PAYMENT_LOG_TAB = 'Payment Log';

/** 0-based column index → A1 letter (0→A, 2→C, 26→AA). */
function colLetter(index) {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/**
 * Phase C — Payment Log (SHEETS_PAYMENTS_ID, "Tandem - Stripe - Transactions").
 * Same race symptom: customerName was written "Unknown" at webhook time. Each
 * row carries its own Stripe ID, so resolution is exact (resolveName per id).
 * Header-driven column detection (Name / Stripe ID).
 */
async function runPaymentLogPhase() {
  if (!SHEETS_PAYMENTS_ID) {
    console.log('-- Phase C: skipped (SHEETS_PAYMENTS_ID not set)');
    return { fixed: 0, stuck: [] };
  }
  let resp;
  try {
    resp = await sheetsGet(SHEETS_PAYMENTS_ID, `${PAYMENT_LOG_TAB}!A:K`);
  } catch (e) {
    console.log(`-- Phase C: ERROR reading Payment Log: ${e.message.slice(0, 80)}`);
    return { fixed: 0, stuck: [] };
  }
  const rows = resp.values || [];
  const header = (rows[0] || []).map((x) => (x || '').toLowerCase());
  const nameC = header.findIndex((x) => x === 'name');
  const idC = header.findIndex((x) => x.includes('stripe'));
  if (nameC < 0 || idC < 0) {
    console.log('-- Phase C: Payment Log header missing Name/Stripe ID column — skipped');
    return { fixed: 0, stuck: [] };
  }
  const nameLetter = colLetter(nameC);
  const targets = [];
  for (let i = 1; i < rows.length; i++) {
    const nm = (rows[i][nameC] || '').trim();
    const id = (rows[i][idC] || '').trim();
    if ((!nm || nm.toLowerCase() === 'unknown') && /^(pi|cs)_/.test(id)) {
      targets.push({ row: i + 1, id });
    }
  }
  console.log(`-- Phase C: ${targets.length} Payment Log row(s) with missing name`);
  let fixed = 0;
  const stuck = [];
  for (const { row, id } of targets) {
    let name = '';
    try {
      name = await resolveName(id);
    } catch (e) {
      console.log(`  SKIP  PL row ${row} (${id}) — ${e.message.slice(0, 50)}`);
      stuck.push(`Payment Log row ${row} (${id})`);
      continue;
    }
    if (!name) {
      stuck.push(`Payment Log row ${row} (${id})`);
      continue;
    }
    const cell = `${PAYMENT_LOG_TAB}!${nameLetter}${row}`;
    if (APPLY) await sheetsUpdate(SHEETS_PAYMENTS_ID, cell, [[name]]);
    fixed++;
    console.log(`  ${APPLY ? 'FIXED' : 'WOULD-FIX'} ${cell} ${id} → "${name}"`);
  }
  return { fixed, stuck };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!SHEETS_ROSTER_ID) throw new Error('SHEETS_ROSTER_ID not set');
  if (!fs.existsSync(SA_PATH)) throw new Error(`SA file missing: ${SA_PATH}`);

  const titles = await getSheetTitles();
  const studentTabs = await loadStudentTabs(titles);
  console.log(
    `[BACKFILL-NAMES] ${APPLY ? 'APPLY' : 'DRY-RUN'} | student tabs: ${studentTabs.map((t) => t.tab).join(', ')}`,
  );

  let fixed = 0;
  const stuck = [];

  // ── Phase A: payments table — fix rows whose stored name is Unknown ──
  const pTargets = findUnknownPayments();
  console.log(`-- Phase A: ${pTargets.length} payment row(s) with missing name`);
  for (const { stripeId, email } of pTargets) {
    let name = '';
    try {
      name = await resolveName(stripeId);
    } catch (e) {
      console.log(`  SKIP  ${email} (${stripeId}) — Stripe error: ${e.message.slice(0, 60)}`);
      continue;
    }
    if (!name) {
      console.log(`  WAIT  ${email} (${stripeId}) — Stripe still has no name`);
      continue;
    }
    let rosterCells = [];
    try {
      rosterCells = await patchRoster(studentTabs, email, name);
    } catch (e) {
      console.log(`  ROSTER-ERR ${email}: ${e.message.slice(0, 60)}`);
    }
    let dbState = 'payments';
    if (APPLY) {
      try {
        updatePaymentName(stripeId, name);
      } catch (e) {
        dbState = `payments-ERR(${(e.stderr || e.message || '').toString().trim().slice(0, 50)})`;
      }
    }
    fixed++;
    console.log(
      `  ${APPLY ? 'FIXED' : 'WOULD-FIX'} ${email} → "${name}"  [${dbState} + ${rosterCells.length ? rosterCells.join(', ') : 'no roster row'}]`,
    );
  }

  // ── Phase B: roster — fix any Name cell still blank/Unknown ──
  // Catches stuck "Unknown" cells whose real name already lives in payments or
  // Stripe (a prior webhook lost the race and the cell was never overwritten).
  const rTargets = scanRosterUnknowns(studentTabs);
  console.log(`-- Phase B: ${rTargets.length} roster cell(s) still blank/Unknown`);
  for (const { tab, rowIdx, email } of rTargets) {
    const cell = `${tab}!B${rowIdx + 1}`;
    let name = '';
    try {
      name = await resolveNameByEmail(email);
    } catch (e) {
      console.log(`  SKIP  ${cell} ${email} — ${e.message.slice(0, 60)}`);
    }
    if (!name) {
      stuck.push(`${cell} ${email}`);
      continue;
    }
    if (APPLY) {
      await sheetsUpdate(SHEETS_ROSTER_ID, cell, [[name]]);
      studentTabs.find((t) => t.tab === tab).rows[rowIdx][1] = name;
    }
    fixed++;
    console.log(`  ${APPLY ? 'FIXED' : 'WOULD-FIX'} ${cell} ${email} → "${name}"`);
  }

  // ── Phase C: Payment Log (transaction sheet) ──
  const pl = await runPaymentLogPhase();
  fixed += pl.fixed;
  stuck.push(...pl.stuck);

  console.log(`[BACKFILL-NAMES] done — fixed ${fixed}, unresolvable ${stuck.length}`);
  if (stuck.length) {
    console.log('  Unresolvable (no name in payments or Stripe — needs manual entry):');
    for (const s of stuck) console.log(`    ${s}`);
  }
}

main().catch((err) => {
  console.error(`[BACKFILL-NAMES] FATAL: ${err.message}`);
  process.exit(1);
});
