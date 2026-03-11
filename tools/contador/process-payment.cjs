#!/usr/bin/env node
/**
 * process-payment.js — El Contador payment processor
 *
 * Deterministic pipeline: Stripe expand → Sheets append → roster update → DB insert → summary
 * Uses only Node.js built-in modules (no npm install needed).
 *
 * Usage: node process-payment.js <stripe_id>
 *        Accepts: cs_... (checkout session) or pi_... (payment intent)
 *
 * Required env vars:
 *   STRIPE_RESTRICTED_KEY  — Stripe restricted API key (read-only)
 *   SHEETS_PAYMENTS_ID     — Google Sheet ID for Payment Log (private)
 *   SHEETS_ROSTER_ID       — Google Sheet ID for Student Roster + Product Map (shared with trainers)
 *
 * Optional env vars:
 *   SHEETS_SA_JSON — path to service account key
 *                    (default: /workspace/extra/service-accounts/sheets-service-account.json)
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────

const STRIPE_ID = process.argv[2];
if (!STRIPE_ID) {
  console.error('Usage: node process-payment.js <cs_... or pi_...>');
  process.exit(1);
}
const ID_TYPE = STRIPE_ID.startsWith('cs_') ? 'checkout' : 'payment_intent';

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
              reject(new Error(`Stripe response parse error: ${data.slice(0, 200)}`));
            }
          });
        },
      )
      .on('error', reject);
  });
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
            reject(new Error(`Token response parse error: ${data.slice(0, 200)}`));
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
  return sheetsRequest(sheetId,
    'POST',
    `values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values },
  );
}

function sheetsUpdate(sheetId, range, values) {
  return sheetsRequest(sheetId,
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

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  // 1. Fetch payment data from Stripe
  let productName, productId, customerEmail, customerName;
  let amountCents, currency, paymentStatus, eventType;
  let feeCents = 0;
  let refundedCents = 0;
  let lineItems = [];
  let stripeCreatedAt = 0; // Unix timestamp from Stripe

  if (ID_TYPE === 'checkout') {
    // Checkout Session — expand line_items for structured product data
    const session = await stripeGet(
      `/v1/checkout/sessions/${STRIPE_ID}?expand[]=line_items.data.price.product&expand[]=customer_details`,
    );
    lineItems = session.line_items?.data || [];
    const firstItem = lineItems[0];
    productName = firstItem?.price?.product?.name || 'Unknown';
    productId = firstItem?.price?.product?.id || '';
    customerEmail = session.customer_details?.email || session.customer_email || '';
    customerName = session.customer_details?.name || 'Unknown';
    amountCents = session.amount_total || 0;
    currency = (session.currency || 'usd').toUpperCase();
    paymentStatus = session.payment_status || 'unknown';
    eventType = 'checkout.session.completed';
    stripeCreatedAt = session.created || 0;

    // Fetch fee and refund status from charge's balance_transaction
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
  } else {
    // PaymentIntent (e.g., Heartbeat in-app payment) — product from description
    const pi = await stripeGet(`/v1/payment_intents/${STRIPE_ID}`);
    productName = pi.description || 'Unknown';
    productId = '';
    amountCents = pi.amount || 0;
    currency = (pi.currency || 'usd').toUpperCase();
    paymentStatus = pi.status || 'unknown';
    eventType = 'payment_intent.succeeded';
    stripeCreatedAt = pi.created || 0;

    // Fetch customer details (name + email) and fee from charge
    if (pi.customer) {
      const cust = await stripeGet(`/v1/customers/${pi.customer}`);
      customerEmail = cust.email || '';
      customerName = cust.name || 'Unknown';
    }
    if (pi.latest_charge) {
      const charge = await stripeGet(`/v1/charges/${pi.latest_charge}?expand[]=balance_transaction`);
      if (!customerEmail) customerEmail = charge.billing_details?.email || '';
      if (customerName === 'Unknown') customerName = charge.billing_details?.name || 'Unknown';
      feeCents = charge.balance_transaction?.fee || 0;
      refundedCents = charge.amount_refunded || 0;
    }
    if (!pi.customer && !pi.latest_charge) {
      customerEmail = '';
      customerName = 'Unknown';
    }
  }

  const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const fmtISO = (d) => d.toISOString().split('T')[0];
  const txnDateObj = stripeCreatedAt ? new Date(stripeCreatedAt * 1000) : new Date();
  const transactionDate = fmtDate(txnDateObj);
  const transactionDateISO = fmtISO(txnDateObj);
  const recordedDate = fmtDate(new Date());
  const amountDollars = (amountCents / 100).toFixed(2);
  const feeDollars = (feeCents / 100).toFixed(2);
  const netDollars = ((amountCents - feeCents) / 100).toFixed(2);

  const results = {
    stripe: 'OK',
    sheets_log: 'skipped',
    sheets_roster: 'skipped',
    db: 'skipped',
  };
  let matrixColumn = '';

  // 2. Google Sheets operations (separate sheets for payments vs roster)
  const hasSaCreds = fs.existsSync(SA_PATH);

  // 2a. Payment Log (private sheet) — upsert by Stripe ID (column I)
  if (SHEETS_PAYMENTS_ID && hasSaCreds) {
    try {
      const logRow = [
        transactionDate,
        recordedDate,
        customerName,
        customerEmail,
        productName,
        amountDollars,
        feeDollars,
        netDollars,
        currency,
        STRIPE_ID,
        paymentStatus,
      ];
      // Check if this Stripe ID already exists in column J
      const existingIds = await sheetsGet(SHEETS_PAYMENTS_ID, 'Payment Log!J:J');
      const idCol = existingIds.values || [];
      const existingRow = idCol.findIndex(
        (r, i) => i > 0 && r[0] === STRIPE_ID,
      );
      if (existingRow >= 0) {
        const sheetRow = existingRow + 1;
        await sheetsUpdate(SHEETS_PAYMENTS_ID, `Payment Log!A${sheetRow}:K${sheetRow}`, [logRow]);
        results.sheets_log = 'OK (updated existing)';
      } else {
        await sheetsAppend(SHEETS_PAYMENTS_ID, 'Payment Log!A:K', [logRow]);
        results.sheets_log = 'OK';
      }
    } catch (e) {
      results.sheets_log = `ERROR: ${e.message.slice(0, 100)}`;
    }
  } else {
    const missing = [];
    if (!SHEETS_PAYMENTS_ID) missing.push('SHEETS_PAYMENTS_ID');
    if (!hasSaCreds) missing.push(`SA file (${SA_PATH})`);
    results.sheets_log = `skipped (missing: ${missing.join(', ')})`;
  }

  // 2b. Student Roster (shared sheet — 3 tabs: ACC/PCC/ACTC Roster)
  let rosterTab = '';
  if (SHEETS_ROSTER_ID && hasSaCreds) {
    try {
      // Read Product Map (3 columns: product name, tab name, column header)
      const mapping = await sheetsGet(SHEETS_ROSTER_ID, 'Product Map!A:C');
      const rows = mapping.values || [];
      const match = rows.find(
        (r, i) =>
          i > 0 && r[0] && r[0].toLowerCase() === productName.toLowerCase(),
      );
      if (match && match[1] && match[2]) {
        rosterTab = match[1];
        matrixColumn = match[2];
      }

      if (rosterTab && matrixColumn && customerEmail) {
        const headers = await sheetsGet(SHEETS_ROSTER_ID, `${rosterTab}!1:1`);
        const headerRow = headers.values?.[0] || [];
        const colIndex = headerRow.findIndex((h) => h === matrixColumn);

        if (colIndex >= 0) {
          const emails = await sheetsGet(SHEETS_ROSTER_ID, `${rosterTab}!A:A`);
          const emailCol = emails.values || [];
          const rowIndex = emailCol.findIndex(
            (r, i) =>
              i > 0 &&
              r[0] &&
              r[0].toLowerCase() === customerEmail.toLowerCase(),
          );

          if (rowIndex < 0) {
            const newRow = new Array(headerRow.length).fill('');
            newRow[0] = customerEmail;
            newRow[1] = customerName;
            newRow[colIndex] = transactionDate;
            // Mark refund if applicable
            if (refundedCents > 0) {
              const refundColIndex = headerRow.findIndex((h) => h === 'Refunded');
              if (refundColIndex >= 0) newRow[refundColIndex] = transactionDate;
            }
            await sheetsAppend(SHEETS_ROSTER_ID, `${rosterTab}!A:A`, [newRow]);
          } else {
            const sheetRow = rowIndex + 1;
            const colLetter = colIndexToLetter(colIndex);
            await sheetsUpdate(SHEETS_ROSTER_ID, `${rosterTab}!${colLetter}${sheetRow}`, [
              [transactionDate],
            ]);
            try {
              const nameCheck = await sheetsGet(SHEETS_ROSTER_ID, `${rosterTab}!B${sheetRow}`);
              if (!nameCheck.values?.[0]?.[0]) {
                await sheetsUpdate(SHEETS_ROSTER_ID, `${rosterTab}!B${sheetRow}`, [
                  [customerName],
                ]);
              }
            } catch {
              // non-fatal
            }
            // Mark refund if applicable
            if (refundedCents > 0) {
              const refundColIndex = headerRow.findIndex((h) => h === 'Refunded');
              if (refundColIndex >= 0) {
                const refundLetter = colIndexToLetter(refundColIndex);
                await sheetsUpdate(SHEETS_ROSTER_ID, `${rosterTab}!${refundLetter}${sheetRow}`, [
                  [transactionDate],
                ]);
              }
            }
          }
          results.sheets_roster = refundedCents > 0 ? 'OK (refunded)' : 'OK';
        } else {
          results.sheets_roster = `column "${matrixColumn}" not found in ${rosterTab} headers`;
        }
      } else if (!rosterTab) {
        results.sheets_roster = 'unrecognized product — skipped';
      } else {
        results.sheets_roster = 'no customer email — skipped';
      }
    } catch (e) {
      results.sheets_roster = `ERROR: ${e.message.slice(0, 100)}`;
    }
  } else {
    const missing = [];
    if (!SHEETS_ROSTER_ID) missing.push('SHEETS_ROSTER_ID');
    if (!hasSaCreds) missing.push(`SA file (${SA_PATH})`);
    results.sheets_roster = `skipped (missing: ${missing.join(', ')})`;
  }

  // 3. PostgreSQL insert
  try {
    execSync(
      `psql -c "INSERT INTO payments (email, name, product_name, product_id, amount_cents, currency, stripe_session_id, payment_status, event_type, paid_at) VALUES ('${sqlEscape(customerEmail)}', '${sqlEscape(customerName)}', '${sqlEscape(productName)}', '${sqlEscape(productId)}', ${amountCents}, '${sqlEscape(currency)}', '${sqlEscape(STRIPE_ID)}', '${sqlEscape(paymentStatus)}', '${sqlEscape(eventType)}', '${transactionDateISO}') ON CONFLICT (stripe_session_id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, product_name=EXCLUDED.product_name, amount_cents=EXCLUDED.amount_cents, payment_status=EXCLUDED.payment_status;"`,
      { stdio: 'pipe' },
    );
    results.db = 'OK';
  } catch (e) {
    results.db = `ERROR: ${e.stderr?.toString().trim() || e.message}`;
  }

  // 4. Output summary
  const lines = [
    '[PAYMENT RECEIVED]',
    `Date: ${transactionDate} (recorded: ${recordedDate})`,
    `Customer: ${customerName} (${customerEmail})`,
    `Product: ${productName}`,
    `Amount: $${amountDollars} ${currency} (fee: $${feeDollars}, net: $${netDollars})${refundedCents > 0 ? ` [REFUNDED $${(refundedCents / 100).toFixed(2)}]` : ''}`,
    `Stripe ID: ${STRIPE_ID} (${ID_TYPE})`,
    `Roster: ${rosterTab ? `${rosterTab} → ${matrixColumn}` : 'unrecognized product — skipped'}`,
    `Payment Log: ${results.sheets_log}`,
    `Student Roster: ${results.sheets_roster}`,
    `DB: ${results.db}`,
  ];

  // Note multiple line items if present
  if (lineItems.length > 1) {
    lines.push(`WARNING: ${lineItems.length} line items — only first processed`);
  }

  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(`[EL CONTADOR] ERROR: ${err.message}`);
  process.exit(1);
});
