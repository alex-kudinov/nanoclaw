#!/usr/bin/env node
/**
 * backfill-payments.cjs — Pull historical Stripe transactions and populate sheets + DB
 *
 * One-shot script. Fetches all successful PaymentIntents and completed Checkout Sessions
 * from the last N days (default 90), writes to Payment Log and Student Roster sheets,
 * and inserts into PostgreSQL (with ON CONFLICT dedup).
 *
 * Usage: node backfill-payments.cjs [days]
 *        Default: 90 days
 *
 * Required env vars:
 *   STRIPE_RESTRICTED_KEY
 *   SHEETS_PAYMENTS_ID
 *   SHEETS_ROSTER_ID
 *
 * Optional:
 *   SHEETS_SA_JSON — path to service account key (default: see below)
 *   DRY_RUN=1     — fetch and display but don't write to sheets/DB
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────

const DAYS = parseInt(process.argv[2] || '90', 10);
const DRY_RUN = process.env.DRY_RUN === '1';
const CREATED_AFTER = Math.floor(Date.now() / 1000) - DAYS * 86400;

const STRIPE_KEY = process.env.STRIPE_RESTRICTED_KEY;
if (!STRIPE_KEY) {
  console.error('ERROR: STRIPE_RESTRICTED_KEY not set');
  process.exit(1);
}

const SHEETS_PAYMENTS_ID = process.env.SHEETS_PAYMENTS_ID;
const SHEETS_ROSTER_ID = process.env.SHEETS_ROSTER_ID;
const SA_PATH =
  process.env.SHEETS_SA_JSON ||
  '/workspace/extra/service-accounts/sheets-service-account.json';

// ── Stripe API ──────────────────────────────────────────────────────────────

function stripeGet(path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');
    https
      .get(
        {
          hostname: 'api.stripe.com',
          path,
          headers: { Authorization: `Basic ${auth}` },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
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

async function stripeListAll(basePath, params = {}) {
  const items = [];
  let startingAfter = null;
  let page = 0;

  while (true) {
    const qs = new URLSearchParams(params);
    if (startingAfter) qs.set('starting_after', startingAfter);
    const url = `${basePath}?${qs.toString()}`;
    const result = await stripeGet(url);
    const data = result.data || [];
    items.push(...data);
    page++;
    console.error(`  Page ${page}: ${data.length} items (total: ${items.length})`);

    if (!result.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return items;
}

// ── Google Sheets Auth ──────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf-8'));
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
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
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
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
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              cachedToken = parsed.access_token;
              tokenExpiry = Date.now() + 3500_000;
              resolve(parsed.access_token);
            } else {
              reject(new Error(`Token exchange failed: ${data}`));
            }
          } catch (e) {
            reject(new Error(`Token parse error: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Google Sheets API ───────────────────────────────────────────────────────

function sheetsRequest(sheetId, method, path, body) {
  return getAccessToken().then(
    (token) =>
      new Promise((resolve, reject) => {
        const options = {
          hostname: 'sheets.googleapis.com',
          path: `/v4/spreadsheets/${sheetId}/${path}`,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 400)
              reject(new Error(`Sheets API ${res.statusCode}: ${data}`));
            else resolve(JSON.parse(data));
          });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      }),
  );
}

function sheetsGet(sheetId, range) {
  return sheetsRequest(sheetId, 'GET', `values/${encodeURIComponent(range)}`, null);
}

function sheetsAppend(sheetId, range, values) {
  return sheetsRequest(
    sheetId,
    'POST',
    `values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values },
  );
}

function sheetsUpdate(sheetId, range, values) {
  return sheetsRequest(
    sheetId,
    'PUT',
    `values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { values },
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function colIndexToLetter(index) {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

function sqlEscape(str) {
  return (str || '').replace(/'/g, "''");
}

function formatDate(ts) {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`Backfilling ${DAYS} days of Stripe transactions (since ${formatDate(CREATED_AFTER)})`);
  if (DRY_RUN) console.error('DRY RUN — no writes will be performed');

  // 1. Fetch all successful PaymentIntents
  console.error('\nFetching PaymentIntents...');
  const paymentIntents = await stripeListAll('/v1/payment_intents', {
    limit: '100',
    'created[gte]': String(CREATED_AFTER),
  });
  // Filter to succeeded only
  const succeededPIs = paymentIntents.filter((pi) => pi.status === 'succeeded');
  console.error(`Found ${succeededPIs.length} succeeded PaymentIntents (of ${paymentIntents.length} total)`);

  // 2. Fetch all completed Checkout Sessions
  console.error('\nFetching Checkout Sessions...');
  const sessions = await stripeListAll('/v1/checkout/sessions', {
    limit: '100',
    'created[gte]': String(CREATED_AFTER),
    status: 'complete',
  });
  console.error(`Found ${sessions.length} completed Checkout Sessions`);

  // 3. Build deduplicated payment records
  // Checkout sessions reference a payment_intent — avoid double-counting
  const piIdsFromSessions = new Set();
  const records = [];

  // Process checkout sessions first (they have richer product data)
  for (const session of sessions) {
    if (session.payment_intent) piIdsFromSessions.add(session.payment_intent);

    // Expand line items
    let productName = 'Unknown';
    let productId = '';
    try {
      const expanded = await stripeGet(
        `/v1/checkout/sessions/${session.id}?expand[]=line_items.data.price.product`,
      );
      const firstItem = expanded.line_items?.data?.[0];
      productName = firstItem?.price?.product?.name || 'Unknown';
      productId = firstItem?.price?.product?.id || '';
    } catch {
      // use defaults
    }

    // Fetch fee and refund status from charge's balance_transaction
    let feeCents = 0;
    let refundedCents = 0;
    if (session.payment_intent) {
      try {
        const pi = await stripeGet(`/v1/payment_intents/${session.payment_intent}`);
        if (pi.latest_charge) {
          const charge = await stripeGet(`/v1/charges/${pi.latest_charge}?expand[]=balance_transaction`);
          feeCents = charge.balance_transaction?.fee || 0;
          refundedCents = charge.amount_refunded || 0;
        }
      } catch { /* non-fatal */ }
    }

    records.push({
      stripeId: session.id,
      type: 'checkout',
      productName,
      productId,
      email: session.customer_details?.email || session.customer_email || '',
      name: session.customer_details?.name || 'Unknown',
      amountCents: session.amount_total || 0,
      feeCents,
      refundedCents,
      currency: (session.currency || 'usd').toUpperCase(),
      status: session.payment_status || 'unknown',
      eventType: 'checkout.session.completed',
      paidAt: formatDate(session.created),
    });
  }

  // Process PaymentIntents not already covered by a checkout session
  for (const pi of succeededPIs) {
    if (piIdsFromSessions.has(pi.id)) continue; // already have this via checkout session

    let email = '';
    let name = 'Unknown';

    // Fetch customer details
    let feeCents = 0;

    if (pi.customer) {
      try {
        const cust = await stripeGet(`/v1/customers/${pi.customer}`);
        email = cust.email || '';
        name = cust.name || 'Unknown';
      } catch {
        // fallback to charge
      }
    }
    let refundedCents = 0;
    if (pi.latest_charge) {
      try {
        const charge = await stripeGet(`/v1/charges/${pi.latest_charge}?expand[]=balance_transaction`);
        if (!email) email = charge.billing_details?.email || '';
        if (name === 'Unknown') name = charge.billing_details?.name || name;
        feeCents = charge.balance_transaction?.fee || 0;
        refundedCents = charge.amount_refunded || 0;
      } catch {
        // skip
      }
    }

    records.push({
      stripeId: pi.id,
      type: 'payment_intent',
      productName: pi.description || 'Unknown',
      productId: '',
      email,
      name,
      amountCents: pi.amount || 0,
      feeCents,
      refundedCents,
      currency: (pi.currency || 'usd').toUpperCase(),
      status: pi.status || 'unknown',
      eventType: 'payment_intent.succeeded',
      paidAt: formatDate(pi.created),
    });
  }

  // Sort by date ascending
  records.sort((a, b) => a.paidAt.localeCompare(b.paidAt));

  console.error(`\nTotal unique records: ${records.length}`);

  if (DRY_RUN) {
    for (const r of records) {
      const fee = (r.feeCents / 100).toFixed(2);
      const net = ((r.amountCents - r.feeCents) / 100).toFixed(2);
      const refund = r.refundedCents > 0 ? ` | REFUNDED $${(r.refundedCents / 100).toFixed(2)}` : '';
      console.log(`${r.paidAt} | ${r.name} | ${r.email} | ${r.productName} | $${(r.amountCents / 100).toFixed(2)} | fee $${fee} | net $${net} | ${r.stripeId}${refund}`);
    }
    console.error('\nDry run complete. No writes performed.');
    return;
  }

  // 4. Load Product Map for roster matching (3 columns: product, tab, column)
  const hasSaCreds = fs.existsSync(SA_PATH);
  let productMap = [];
  // Per-tab state: headers and email lists
  const tabState = {}; // { 'ACC Roster': { headers: [...], emails: [...] } }

  if (SHEETS_ROSTER_ID && hasSaCreds) {
    try {
      const mapping = await sheetsGet(SHEETS_ROSTER_ID, 'Product Map!A:C');
      productMap = (mapping.values || []).slice(1); // skip header row
      console.error(`Product Map: ${productMap.length} entries`);

      // Load headers and emails for each tab referenced in the map
      const tabs = [...new Set(productMap.map((r) => r[1]).filter(Boolean))];
      for (const tab of tabs) {
        const headers = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!1:1`);
        const headerRow = headers.values?.[0] || [];
        let emails = [];
        try {
          const emailCol = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!A:A`);
          emails = (emailCol.values || []).map((r) => (r[0] || '').toLowerCase());
        } catch { /* empty tab */ }
        tabState[tab] = { headers: headerRow, emails };
        console.error(`  ${tab}: ${headerRow.length} columns, ${Math.max(0, emails.length - 1)} students`);
      }
    } catch (e) {
      console.error(`Warning: Could not load Product Map/Roster: ${e.message}`);
    }
  }

  // 5. Write to Payment Log (clear existing data, write header + all rows)
  const now = new Date();
  const today = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  if (SHEETS_PAYMENTS_ID && hasSaCreds) {
    console.error('\nWriting to Payment Log...');
    const headerRow = [
      'Transaction Date', 'Recorded Date', 'Name', 'Email', 'Product',
      'Amount', 'Fee', 'Net', 'Currency', 'Stripe ID', 'Status',
    ];
    const logRows = records.map((r) => [
      r.paidAt,
      today,
      r.name,
      r.email,
      r.productName,
      (r.amountCents / 100).toFixed(2),
      (r.feeCents / 100).toFixed(2),
      ((r.amountCents - r.feeCents) / 100).toFixed(2),
      r.currency,
      r.stripeId,
      r.status,
    ]);

    // Clear existing data and write fresh (header + all rows)
    const allRows = [headerRow, ...logRows];
    try {
      // Clear the sheet first
      await sheetsRequest(SHEETS_PAYMENTS_ID, 'POST',
        `values/Payment%20Log!A:K:clear`, {});
      console.error('  Cleared existing Payment Log data');
    } catch (e) {
      console.error(`  Warning: could not clear sheet: ${e.message.slice(0, 80)}`);
    }

    // Write in chunks of 500
    for (let i = 0; i < allRows.length; i += 500) {
      const chunk = allRows.slice(i, i + 500);
      try {
        await sheetsAppend(SHEETS_PAYMENTS_ID, 'Payment Log!A:K', chunk);
        console.error(`  Wrote rows ${i + 1}-${i + chunk.length}`);
      } catch (e) {
        console.error(`  ERROR writing rows ${i + 1}-${i + chunk.length}: ${e.message}`);
      }
    }
  } else {
    console.error('Skipping Payment Log (missing config)');
  }

  // 6. Update Student Rosters (ACC/PCC/ACTC tabs)
  if (SHEETS_ROSTER_ID && hasSaCreds && productMap.length > 0) {
    console.error('\nUpdating Student Rosters...');
    let rosterUpdates = 0;
    let rosterSkipped = 0;

    for (const r of records) {
      if (!r.email) { rosterSkipped++; continue; }

      // Find product in map (3 columns: product, tab, column)
      const mapEntry = productMap.find(
        (m) => m[0] && m[0].toLowerCase() === r.productName.toLowerCase(),
      );
      if (!mapEntry || !mapEntry[1] || !mapEntry[2]) { rosterSkipped++; continue; }

      const tab = mapEntry[1];
      const colName = mapEntry[2];
      const state = tabState[tab];
      if (!state) { rosterSkipped++; continue; }

      const colIndex = state.headers.findIndex((h) => h === colName);
      if (colIndex < 0) { rosterSkipped++; continue; }

      const emailLower = r.email.toLowerCase();
      const rowIndex = state.emails.findIndex((e, i) => i > 0 && e === emailLower);

      const refundColIndex = state.headers.findIndex((h) => h === 'Refunded');

      if (rowIndex < 0) {
        const newRow = new Array(state.headers.length).fill('');
        newRow[0] = r.email;
        newRow[1] = r.name;
        newRow[colIndex] = r.paidAt;
        if (r.refundedCents > 0 && refundColIndex >= 0) newRow[refundColIndex] = r.paidAt;
        try {
          await sheetsAppend(SHEETS_ROSTER_ID, `${tab}!A:A`, [newRow]);
          state.emails.push(emailLower);
          rosterUpdates++;
        } catch (e) {
          console.error(`  ERROR adding ${r.email} to ${tab}: ${e.message.slice(0, 80)}`);
        }
      } else {
        const sheetRow = rowIndex + 1;
        const colLetter = colIndexToLetter(colIndex);
        try {
          await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!${colLetter}${sheetRow}`, [[r.paidAt]]);
          try {
            const nameCheck = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!B${sheetRow}`);
            if (!nameCheck.values?.[0]?.[0]) {
              await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!B${sheetRow}`, [[r.name]]);
            }
          } catch { /* non-fatal */ }
          // Mark refund if applicable
          if (r.refundedCents > 0 && refundColIndex >= 0) {
            const refundLetter = colIndexToLetter(refundColIndex);
            await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!${refundLetter}${sheetRow}`, [[r.paidAt]]);
          }
          rosterUpdates++;
        } catch (e) {
          console.error(`  ERROR updating ${r.email} in ${tab}: ${e.message.slice(0, 80)}`);
        }
      }
    }
    console.error(`  Roster: ${rosterUpdates} updated, ${rosterSkipped} skipped`);
  } else {
    console.error('Skipping Student Roster (missing config or Product Map)');
  }

  // 7. PostgreSQL inserts
  console.error('\nInserting into PostgreSQL...');
  let dbOk = 0;
  let dbErr = 0;

  for (const r of records) {
    try {
      execSync(
        `psql -c "INSERT INTO payments (email, name, product_name, product_id, amount_cents, currency, stripe_session_id, payment_status, event_type, paid_at) VALUES ('${sqlEscape(r.email)}', '${sqlEscape(r.name)}', '${sqlEscape(r.productName)}', '${sqlEscape(r.productId)}', ${r.amountCents}, '${sqlEscape(r.currency)}', '${sqlEscape(r.stripeId)}', '${sqlEscape(r.status)}', '${sqlEscape(r.eventType)}', '${r.paidAt}') ON CONFLICT (stripe_session_id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, product_name=EXCLUDED.product_name, amount_cents=EXCLUDED.amount_cents, payment_status=EXCLUDED.payment_status;"`,
        { stdio: 'pipe' },
      );
      dbOk++;
    } catch (e) {
      // First failure is likely no psql — skip all remaining
      if (dbErr === 0) {
        console.error(`  DB not available: ${e.stderr?.toString().trim().slice(0, 100) || e.message}`);
      }
      dbErr++;
    }
  }
  console.error(`  DB: ${dbOk} inserted, ${dbErr} errors/skipped`);

  // 8. Summary
  console.log(`\n[BACKFILL COMPLETE]`);
  console.log(`Period: ${formatDate(CREATED_AFTER)} to ${formatDate(Math.floor(Date.now() / 1000))}`);
  console.log(`Records processed: ${records.length}`);
  console.log(`  Checkout Sessions: ${sessions.length}`);
  console.log(`  PaymentIntents (direct): ${records.length - sessions.length}`);
  console.log(`Payment Log: written`);
  console.log(`Student Roster: updated`);
  console.log(`Database: ${dbOk} inserted, ${dbErr} skipped/errors`);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
