#!/usr/bin/env node
/**
 * mark-refunds.cjs — Reconcile Stripe refunds into the Payment Log sheet.
 *
 * Two modes:
 *   (bulk, default) scan succeeded refunds across BOTH Stripe accounts
 *                   (STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY_ALT) for the last
 *                   N days and match them against the Payment Log.
 *   (single)        --id <pi_/cs_/ch_>  resolve the refund(s) for one payment;
 *                   used by the host Stripe refund webhook handler.
 *
 * For each match it sets the status column (K) to "refunded", records the
 * Stripe refund id (re_) in the Refund ID column (L), and the actual refunded
 * dollar amount (partial refunds are common) in the Refunded Amount column (M).
 * Dry-run by default — pass --apply to write. Re-runs are idempotent and
 * backfill a blank column L or M on rows already marked "refunded".
 *
 * Env (self-loaded from ~/dev/.env.shared then ./.env, project .env wins):
 *   STRIPE_RESTRICTED_KEY  — primary account (read)
 *   STRIPE_SECRET_KEY_ALT  — second account (read)
 *   SHEETS_PAYMENTS_ID     — Payment Log sheet id
 *   SHEETS_SA_JSON         — service-account key path
 *                            (default: ./data/service-accounts/sheets-service-account.json)
 *
 * Optional:
 *   REFUND_LOOKBACK_DAYS   — bulk mode: refunds created within N days (default 365)
 *
 * Usage:
 *   node tools/contador/mark-refunds.cjs [--apply]
 *   node tools/contador/mark-refunds.cjs --id pi_xxx --apply
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Args / config / env ─────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const SINGLE_ID = (() => {
  const i = ARGV.indexOf('--id');
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1].trim() : null;
})();
const LOOKBACK_DAYS = parseInt(process.env.REFUND_LOOKBACK_DAYS || '365', 10);
const CREATED_AFTER = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
const ID_COL_INDEX = 9; // column J (0-indexed) holds the Stripe id
const REFUND_COL_INDEX = 11; // column L (0-indexed) holds the Refund ID
const REFUND_HEADER = 'Refund ID';
const REFUND_AMT_COL_INDEX = 12; // column M (0-indexed) holds the Refunded Amount ($)
const REFUND_AMT_HEADER = 'Refunded Amount';

function loadEnv(keys) {
  const wanted = new Set(keys);
  const out = {};
  for (const file of [
    path.join(os.homedir(), 'dev', '.env.shared'),
    path.join(process.cwd(), '.env'),
  ]) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!wanted.has(k)) continue;
      let v = t.slice(eq + 1).trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      if (v) out[k] = v;
    }
  }
  return out;
}

const ENV = loadEnv([
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_SECRET_KEY_ALT',
  'SHEETS_PAYMENTS_ID',
  'SHEETS_SA_JSON',
]);

const STRIPE_ACCOUNTS = [
  { label: 'primary', key: ENV.STRIPE_RESTRICTED_KEY },
  { label: 'alt', key: ENV.STRIPE_SECRET_KEY_ALT },
].filter((a) => a.key);

const SHEETS_PAYMENTS_ID = ENV.SHEETS_PAYMENTS_ID;
const SA_PATH =
  ENV.SHEETS_SA_JSON ||
  path.join(process.cwd(), 'data/service-accounts/sheets-service-account.json');

if (STRIPE_ACCOUNTS.length === 0) {
  console.error('ERROR: no Stripe keys (STRIPE_RESTRICTED_KEY / STRIPE_SECRET_KEY_ALT)');
  process.exit(1);
}
if (!SHEETS_PAYMENTS_ID) {
  console.error('ERROR: SHEETS_PAYMENTS_ID not set');
  process.exit(1);
}
if (!fs.existsSync(SA_PATH)) {
  console.error(`ERROR: service-account key not found at ${SA_PATH}`);
  process.exit(1);
}

// ── Stripe API ──────────────────────────────────────────────────────────────

function stripeGet(key, apiPath) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${key}:`).toString('base64');
    https
      .get(
        { hostname: 'api.stripe.com', path: apiPath, headers: { Authorization: `Basic ${auth}` } },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) reject(new Error(parsed.error.message));
              else resolve(parsed);
            } catch (e) {
              reject(new Error(`Stripe parse error: ${data.slice(0, 200)}`));
            }
          });
        },
      )
      .on('error', reject);
  });
}

// List all refunds for one account (paginated), newest first.
async function listRefunds(key) {
  const all = [];
  let startingAfter = null;
  for (let page = 0; page < 50; page++) {
    let p = `/v1/refunds?limit=100&expand[]=data.charge&created[gte]=${CREATED_AFTER}`;
    if (startingAfter) p += `&starting_after=${startingAfter}`;
    const res = await stripeGet(key, p);
    const batch = res.data || [];
    all.push(...batch);
    if (!res.has_more || batch.length === 0) break;
    startingAfter = batch[batch.length - 1].id;
  }
  return all;
}

// Map a refunded payment_intent to its checkout-session id (sheet may key on cs_).
async function findCheckoutSession(key, pi) {
  if (!pi) return null;
  try {
    const res = await stripeGet(key, `/v1/checkout/sessions?payment_intent=${pi}&limit=1`);
    return res.data && res.data[0] ? res.data[0].id : null;
  } catch {
    return null;
  }
}

// Build the candidate-id → refund-info record for a single refund object.
async function refundInfo(account, key, refund, charge) {
  const pi = refund.payment_intent || (charge && charge.payment_intent) || null;
  const ch = charge ? charge.id : refund.charge || null;
  const cs = await findCheckoutSession(key, pi);
  return {
    account,
    refundId: refund.id, // re_…
    amount: refund.amount,
    currency: (refund.currency || '').toUpperCase(),
    created: refund.created,
    reason: refund.reason || '',
    ids: [pi, cs, ch].filter(Boolean),
  };
}

// Single-id mode: resolve the latest succeeded refund for one pi_/cs_/ch_.
async function resolveSingle(account, key, id) {
  try {
    let chargeId = null;
    if (id.startsWith('pi_')) {
      const pi = await stripeGet(key, `/v1/payment_intents/${id}?expand[]=latest_charge`);
      chargeId = pi.latest_charge && (pi.latest_charge.id || pi.latest_charge);
    } else if (id.startsWith('cs_')) {
      const cs = await stripeGet(key, `/v1/checkout/sessions/${id}`);
      if (cs.payment_intent) {
        const pi = await stripeGet(key, `/v1/payment_intents/${cs.payment_intent}?expand[]=latest_charge`);
        chargeId = pi.latest_charge && (pi.latest_charge.id || pi.latest_charge);
      }
    } else if (id.startsWith('ch_') || id.startsWith('py_')) {
      chargeId = id;
    }
    if (!chargeId) return null;
    const charge = await stripeGet(key, `/v1/charges/${chargeId}`);
    const refundsRes = await stripeGet(key, `/v1/refunds?charge=${chargeId}&limit=10`);
    const succeeded = (refundsRes.data || []).filter((r) => r.status === 'succeeded');
    if (succeeded.length === 0) return null;
    return refundInfo(account, key, succeeded[0], charge); // newest first
  } catch {
    return null; // wrong account / not found — caller tries the next key
  }
}

// ── Google Sheets ─────────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
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
  const sig = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key)
    .toString('base64url');
  const jwt = `${header}.${claims}.${sig}`;
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
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              cachedToken = parsed.access_token;
              tokenExpiry = Date.now() + 3000 * 1000;
              resolve(cachedToken);
            } else reject(new Error(`Token error: ${data.slice(0, 200)}`));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sheetsRequest(method, suffix, payload) {
  return new Promise((resolve, reject) => {
    getAccessToken()
      .then((token) => {
        const body = payload ? JSON.stringify(payload) : null;
        const req = https.request(
          {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${SHEETS_PAYMENTS_ID}/${suffix}`,
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              if (res.statusCode >= 400) reject(new Error(`Sheets ${res.statusCode}: ${data}`));
              else resolve(data ? JSON.parse(data) : {});
            });
          },
        );
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      })
      .catch(reject);
  });
}

const sheetsGet = (range) => sheetsRequest('GET', `values/${encodeURIComponent(range)}`, null);
const sheetsUpdate = (range, values) =>
  sheetsRequest('PUT', `values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    values,
  });

// ── Build the refund index ──────────────────────────────────────────────────

async function buildRefundIndex() {
  // candidate id (pi_/cs_/ch_) → refund info. First (newest) wins per id.
  const index = new Map();
  const add = (info) => {
    if (!info) return;
    for (const id of info.ids) if (!index.has(id)) index.set(id, info);
  };

  if (SINGLE_ID) {
    for (const acct of STRIPE_ACCOUNTS) {
      const info = await resolveSingle(acct.label, acct.key, SINGLE_ID);
      if (info) {
        add(info);
        console.log(`[${acct.label}] resolved refund ${info.refundId} for ${SINGLE_ID}`);
        break; // found the owning account
      }
    }
    if (index.size === 0) console.log(`no succeeded refund found for ${SINGLE_ID}`);
    return index;
  }

  for (const acct of STRIPE_ACCOUNTS) {
    let refunds;
    try {
      refunds = await listRefunds(acct.key);
    } catch (e) {
      console.error(`[${acct.label}] refund list failed: ${e.message}`);
      continue;
    }
    let succeeded = 0;
    for (const r of refunds) {
      if (r.status !== 'succeeded') continue;
      succeeded++;
      const charge = r.charge && typeof r.charge === 'object' ? r.charge : null;
      add(await refundInfo(acct.label, acct.key, r, charge));
    }
    console.log(`[${acct.label}] ${succeeded} succeeded refund(s) in last ${LOOKBACK_DAYS}d`);
  }
  return index;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const refundIndex = await buildRefundIndex();

  const resp = await sheetsGet('Payment Log!A:M');
  const rows = resp.values || [];
  const headerHasRefundCol = (rows[0] || [])[REFUND_COL_INDEX] === REFUND_HEADER;
  const headerHasAmtCol = (rows[0] || [])[REFUND_AMT_COL_INDEX] === REFUND_AMT_HEADER;

  const toMark = []; // status not yet refunded → set K + L + M
  const toBackfill = []; // already refunded but L or M blank → set L + M
  const seenIds = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = (row[ID_COL_INDEX] || '').trim();
    if (!id || !refundIndex.has(id)) continue;
    seenIds.add(id);
    const rec = {
      rowNum: i + 1,
      date: row[0] || '',
      name: row[2] || '',
      product: row[4] || '',
      amount: row[5] || '',
      id,
      status: (row[10] || '').trim(),
      existingRefundId: (row[REFUND_COL_INDEX] || '').trim(),
      existingAmt: (row[REFUND_AMT_COL_INDEX] || '').toString().trim(),
      refund: refundIndex.get(id),
    };
    if (rec.status.toLowerCase() === 'refunded') {
      if (!rec.existingRefundId || !rec.existingAmt) toBackfill.push(rec);
    } else {
      toMark.push(rec);
    }
  }

  const unmatched = [];
  for (const [id, info] of refundIndex) {
    if (info.ids[0] !== id) continue; // report once per refund
    if (!info.ids.some((x) => seenIds.has(x))) unmatched.push(info);
  }

  // ── Report ──
  const money = (cents, cur) => `${(cents / 100).toFixed(2)} ${cur}`;
  console.log(`\n=== MATCHED rows to mark refunded (${toMark.length}) ===`);
  for (const m of toMark)
    console.log(
      `  row ${m.rowNum} | ${m.date} | ${m.name} | ${m.product} | sheet $${m.amount} | ` +
        `refund ${money(m.refund.amount, m.refund.currency)} [${m.refund.account}] | ` +
        `${m.refund.refundId} | "${m.status || '(blank)'}" → refunded`,
    );
  if (toBackfill.length) {
    console.log(`\n=== already refunded, backfill Refund ID (${toBackfill.length}) ===`);
    for (const m of toBackfill)
      console.log(`  row ${m.rowNum} | ${m.name} | ${m.product} | ${m.refund.refundId}`);
  }
  if (unmatched.length) {
    console.log(`\n=== refunds with NO Payment Log row (${unmatched.length}) ===`);
    for (const u of unmatched)
      console.log(
        `  ${u.ids.join(' / ')} | ${money(u.amount, u.currency)} [${u.account}] | ${u.refundId}`,
      );
  }

  if (!APPLY) {
    console.log(
      `\n(dry-run) ${toMark.length} to mark, ${toBackfill.length} to backfill. Re-run with --apply.`,
    );
    return;
  }

  // ── Apply ──
  if (!headerHasRefundCol) await sheetsUpdate('Payment Log!L1', [[REFUND_HEADER]]);
  if (!headerHasAmtCol) await sheetsUpdate('Payment Log!M1', [[REFUND_AMT_HEADER]]);
  const amt = (cents) => (cents / 100).toFixed(2);
  let marked = 0;
  for (const m of toMark) {
    await sheetsUpdate(`Payment Log!K${m.rowNum}:M${m.rowNum}`, [
      ['refunded', m.refund.refundId, amt(m.refund.amount)],
    ]);
    marked++;
  }
  let backfilled = 0;
  for (const m of toBackfill) {
    await sheetsUpdate(`Payment Log!L${m.rowNum}:M${m.rowNum}`, [
      [m.refund.refundId, amt(m.refund.amount)],
    ]);
    backfilled++;
  }
  console.log(`\nAPPLIED — marked ${marked} refunded, backfilled ${backfilled} Refund ID/Amount(s).`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
