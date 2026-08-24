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
const { execFileSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────

const STRIPE_ID = process.argv[2];
// Only enforced when run as a CLI. Importing the module (to test its pure
// slug/product-preservation logic) must not exit the importing process.
if (!STRIPE_ID && require.main === module) {
  console.error('Usage: node process-payment.js <cs_... or pi_...>');
  process.exit(1);
}
const ID_TYPE = (STRIPE_ID || '').startsWith('cs_') ? 'checkout' : 'payment_intent';

const ACCOUNT_ARG = (() => {
  const i = process.argv.indexOf('--account');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : '';
})();
if (ACCOUNT_ARG && !['heartbeat', 'tandem'].includes(ACCOUNT_ARG)) {
  console.error('ERROR: --account must be heartbeat or tandem');
  process.exit(1);
}

const STRIPE_ACCOUNTS = [
  {
    label: 'heartbeat',
    key: process.env.STRIPE_RESTRICTED_KEY,
  },
  {
    label: 'tandem',
    key: process.env.STRIPE_SECRET_KEY_ALT,
  },
].filter((account) => account.key);
const STRIPE_KEYS = ACCOUNT_ARG
  ? STRIPE_ACCOUNTS.filter((account) => account.label === ACCOUNT_ARG)
  : STRIPE_ACCOUNTS;
if (STRIPE_KEYS.length === 0 && require.main === module) {
  console.error(
    ACCOUNT_ARG
      ? `ERROR: Stripe key for account ${ACCOUNT_ARG} is not configured`
      : 'ERROR: No Stripe API keys set (STRIPE_RESTRICTED_KEY / STRIPE_SECRET_KEY_ALT)',
  );
  process.exit(1);
}
let STRIPE_KEY = STRIPE_KEYS[0]?.key;
let STRIPE_ACCOUNT = STRIPE_KEYS[0]?.label;

const SHEETS_PAYMENTS_ID = process.env.SHEETS_PAYMENTS_ID;
const SHEETS_ROSTER_ID = process.env.SHEETS_ROSTER_ID;
const SA_PATH =
  process.env.SHEETS_SA_JSON ||
  '/workspace/extra/service-accounts/sheets-service-account.json';

// ── HTTP timeout guard ──────────────────────────────────────────────────────
// Node's https has NO default socket timeout: a stalled/half-open connection
// hangs forever. This script chains ~15-20 sequential calls whose only backstop
// is the caller's 120s process-level kill — so one quiet socket hangs the whole
// pipeline. Abort any request idle for HTTP_TIMEOUT_MS so the failure is fast
// and retryable (the webhook-inbox-reaper re-runs the idempotent pipeline).
const HTTP_TIMEOUT_MS = 20000;

function attachTimeout(req, label) {
  req.setTimeout(HTTP_TIMEOUT_MS, () => {
    req.destroy(new Error(`${label} timed out after ${HTTP_TIMEOUT_MS}ms`));
  });
}

// ── Stripe API ──────────────────────────────────────────────────────────────

function stripeGet(path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${STRIPE_KEY}:`).toString('base64');
    const req = https.get(
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
    );
    req.on('error', reject);
    attachTimeout(req, 'Stripe request');
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
    attachTimeout(req, 'Sheets token request');
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
        attachTimeout(req, 'Sheets request');
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

function sheetsBatchUpdate(spreadsheetId, requests) {
  return getAccessToken().then(
    (token) =>
      new Promise((resolve, reject) => {
        const body = JSON.stringify({ requests });
        const req = https.request(
          {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode >= 400)
                reject(new Error(`Sheets batchUpdate ${res.statusCode}: ${data}`));
              else resolve(JSON.parse(data));
            });
          },
        );
        req.on('error', reject);
        attachTimeout(req, 'Sheets batchUpdate');
        req.write(body);
        req.end();
      }),
  );
}

function getSheetMetadata(spreadsheetId) {
  return getAccessToken().then(
    (token) =>
      new Promise((resolve, reject) => {
        const req = https.get(
          {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode >= 400)
                reject(new Error(`Sheets metadata ${res.statusCode}: ${data}`));
              else resolve(JSON.parse(data));
            });
          },
        );
        req.on('error', reject);
        attachTimeout(req, 'Sheets metadata request');
      }),
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

// (sqlEscape removed: the Postgres write now passes values as psql -v
// variables referenced by :'name', which psql quotes itself. A hand-rolled
// escaper left lying around invites the next writer to build a query by
// string concatenation again — see the Postgres insert section below.)

// Tandem's checkout writes the canonical website product slug into the
// underlying PaymentIntent's metadata.product key (class-stripe-checkout.php),
// using the same kebab-case shape as data/checkout/products.json keys (e.g.
// "mcq-program-a-foundations"). This is the only trusted source for canonical
// product identity — validate the shape and fail closed (null, never the raw
// text) so a malformed or absent value can never reach Chaos as if it were a
// real slug.
const CANONICAL_PRODUCT_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function validateCanonicalProductSlug(value) {
  const slug = String(value || '').trim();
  if (!slug || slug.length > 191 || !CANONICAL_PRODUCT_SLUG_RE.test(slug)) {
    return null;
  }
  return slug;
}

/**
 * Build psql `-v NAME=value` argv pairs. Each value becomes ONE argv element
 * handed to execFileSync — never a shell, never concatenated into a command
 * or SQL string — so a product name containing `$`, backticks, single
 * quotes, or `$(...)` reaches psql as inert text with no interpretation step
 * in between. psql's own `:'var'` substitution (see the Postgres insert
 * below) is what turns the value into a safely quoted SQL string literal;
 * this function performs no escaping of its own on purpose.
 */
function buildPsqlVarArgs(params) {
  return Object.entries(params).flatMap(([k, v]) => ['-v', `${k}=${v ?? ''}`]);
}

/**
 * Which product name survives when both halves of one purchase (Checkout's
 * cs_ event and its PaymentIntent's pi_ event) write the same accounting row.
 * The checkout event expands the line item and knows the real product name;
 * the payment-intent half often carries only a generic description
 * ("Unknown", "Individual Mentor Coaching"). Whichever arrives second must
 * not degrade what the checkout event already recorded. Applied identically
 * to the Payment Log sheet and mirrored by the Postgres CASE guard below, so
 * a real Checkout and its PaymentIntent twin converge on one row with the
 * richer name in both stores regardless of arrival order.
 */
function preferredProductName(incoming, existing, eventType) {
  const keep = String(existing || '').trim();
  if (!keep || keep.toLowerCase() === 'unknown') return incoming;
  if (eventType === 'checkout.session.completed') return incoming;
  return keep;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Heartbeat (course/community platform) creates the Stripe customer and fires
// payment_intent.succeeded BEFORE writing customer.name onto the Customer, and
// charge.billing_details.name is null for these — so an immediate read often
// gets no name and the roster records "Unknown". Poll the customer a few times
// to win the race in the common case; backfill-names.cjs is the straggler
// backstop for anything slower than this window.
const NAME_RETRY_ATTEMPTS = 4;
const NAME_RETRY_DELAY_MS = 3000;

/** Fetch customer.name, retrying while empty (subscription-creation race). */
async function fetchCustomerWithName(customerId) {
  let last = {};
  for (let attempt = 0; attempt < NAME_RETRY_ATTEMPTS; attempt++) {
    try {
      last = await stripeGet(`/v1/customers/${customerId}`);
    } catch { /* non-fatal — keep prior result, retry */ }
    if ((last.name || '').trim()) break;
    if (attempt < NAME_RETRY_ATTEMPTS - 1) await sleep(NAME_RETRY_DELAY_MS);
  }
  return last;
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function fetchPaymentWithKeyFallback() {
  const debugLines = [];
  debugLines.push(`keys=${STRIPE_KEYS.length}`);
  for (let ki = 0; ki < STRIPE_KEYS.length; ki++) {
    STRIPE_KEY = STRIPE_KEYS[ki].key;
    STRIPE_ACCOUNT = STRIPE_KEYS[ki].label;
    debugLines.push(`try-${ki}=${STRIPE_ACCOUNT}`);
    try {
      const result = await fetchPaymentData();
      debugLines.push(`ok-${ki}=${STRIPE_ACCOUNT}`);
      result.stripeAccount = STRIPE_ACCOUNT;
      result._debug = debugLines.join(' | ');
      return result;
    } catch (err) {
      debugLines.push(`fail-${ki}=${err.message.slice(0, 40)}`);
      const isNotFound = /no such|resource_missing|invalid_request/i.test(err.message);
      if (isNotFound && ki < STRIPE_KEYS.length - 1) {
        continue; // try next key
      }
      throw err;
    }
  }
}

async function fetchPaymentData() {
  let productName, productId, customerEmail, customerName;
  let amountCents, currency, paymentStatus, eventType;
  let canonicalTransactionId = ID_TYPE === 'payment_intent' ? STRIPE_ID : '';
  let canonicalProductSlug = null;
  let feeCents = 0;
  let refundedCents = 0;
  let lineItems = [];
  let stripeCreatedAt = 0;
  let chargeId = '';
  let invoiceId = '';

  if (ID_TYPE === 'checkout') {
    const session = await stripeGet(
      `/v1/checkout/sessions/${STRIPE_ID}?expand[]=line_items.data.price.product&expand[]=customer_details`,
    );
    lineItems = session.line_items?.data || [];
    const firstItem = lineItems[0];
    productName = firstItem?.price?.product?.name || 'Unknown';
    productId = firstItem?.price?.product?.id || '';
    const csMeta = session.metadata || {};
    customerEmail = session.customer_details?.email || session.customer_email || csMeta.email || '';
    customerName = session.customer_details?.name || csMeta.name || 'Unknown';
    amountCents = session.amount_total || 0;
    currency = (session.currency || 'usd').toUpperCase();
    paymentStatus = session.payment_status || 'unknown';
    eventType = 'checkout.session.completed';
    stripeCreatedAt = session.created || 0;
    if (session.payment_intent) {
      canonicalTransactionId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent.id || '';
      try {
        const pi = await stripeGet(`/v1/payment_intents/${canonicalTransactionId}`);
        // Same underlying PaymentIntent the pi_ half of this purchase will
        // also fetch, so both halves read the identical metadata.product —
        // no drift/preservation logic is needed for the slug itself.
        canonicalProductSlug = validateCanonicalProductSlug(pi.metadata?.product);
        invoiceId = typeof pi.invoice === 'string' ? pi.invoice : pi.invoice?.id || '';
        if (pi.latest_charge) {
          chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id || '';
          const charge = await stripeGet(`/v1/charges/${chargeId}?expand[]=balance_transaction`);
          feeCents = charge.balance_transaction?.fee || 0;
          refundedCents = charge.amount_refunded || 0;
          if (customerName === 'Unknown' && charge.billing_details?.name) {
            customerName = charge.billing_details.name;
          }
        }
      } catch { /* non-fatal */ }
    }
  } else {
    const pi = await stripeGet(`/v1/payment_intents/${STRIPE_ID}`);
    productName = pi.description || 'Unknown';
    productId = '';
    canonicalProductSlug = validateCanonicalProductSlug(pi.metadata?.product);
    // Subscription / installment payments carry a useless PI description
    // ("Subscription creation"); the real product is on the invoice line item.
    // Follow pi.invoice → invoice line → product so the Product Map lookup and
    // roster update work for payment-plan students (e.g. MCS).
    invoiceId = typeof pi.invoice === 'string' ? pi.invoice : pi.invoice?.id || '';
    if (invoiceId) {
      try {
        const inv = await stripeGet(`/v1/invoices/${invoiceId}`);
        const line = (inv.lines && inv.lines.data && inv.lines.data[0]) || {};
        const prodId =
          (line.pricing && line.pricing.price_details && line.pricing.price_details.product) ||
          (line.price && line.price.product) ||
          '';
        if (prodId) {
          const prod = await stripeGet(`/v1/products/${prodId}`);
          if (prod.name) {
            productName = prod.name;
            productId = prodId;
          }
        }
      } catch { /* non-fatal — fall back to pi.description */ }
    }
    amountCents = pi.amount || 0;
    currency = (pi.currency || 'usd').toUpperCase();
    paymentStatus = pi.status || 'unknown';
    eventType = 'payment_intent.succeeded';
    stripeCreatedAt = pi.created || 0;

    let charge = null;
    if (pi.latest_charge) {
      chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id || '';
      charge = await stripeGet(`/v1/charges/${chargeId}?expand[]=balance_transaction`);
      feeCents = charge.balance_transaction?.fee || 0;
      refundedCents = charge.amount_refunded || 0;
    }

    const customerId = pi.customer || charge?.customer;
    if (customerId) {
      const cust = await fetchCustomerWithName(customerId);
      customerEmail = cust.email || '';
      customerName = cust.name || '';
    }
    if (!customerName && charge) customerName = charge.billing_details?.name || '';
    if (!customerEmail && charge) customerEmail = charge.billing_details?.email || '';
    // Fallback: metadata and receipt_email (e.g. Heartbeat/WP custom checkout)
    const meta = pi.metadata || {};
    if (!customerName && meta.name) customerName = meta.name;
    if (!customerEmail && meta.email) customerEmail = meta.email;
    if (!customerEmail && pi.receipt_email) customerEmail = pi.receipt_email;
    if (!customerName) customerName = 'Unknown';
    if (!customerEmail) customerEmail = '';
  }

  return {
    productName, productId, customerEmail, customerName,
    amountCents, currency, paymentStatus, eventType,
    feeCents, refundedCents, lineItems, stripeCreatedAt,
    canonicalTransactionId, canonicalProductSlug, chargeId, invoiceId,
  };
}

/**
 * Resolve exam routing: if student has modules on a program roster, write exam
 * there (they're an enrolled student). Otherwise write to Prep Exam tab only.
 */
async function resolveExamRouting(allMatches, programTabs, email) {
  const MODULE_HEADERS = new Set(['Full Program', 'M1', 'M2', 'M3', 'M4', 'Group Supervision', 'Group Mentoring', 'Individual Mentoring', 'Recording Review']);
  const prepExamMatches = allMatches.filter((m) => m.tab === 'Prep Exam');
  let studentHasModules = false;

  for (const { tab } of programTabs) {
    try {
      const fullTab = await sheetsGet(SHEETS_ROSTER_ID, `'${tab}'`);
      const tabRows = fullTab.values || [];
      if (tabRows.length < 2) continue;
      const headers = tabRows[0];
      const moduleCols = headers.reduce((acc, h, i) => {
        if (MODULE_HEADERS.has(h)) acc.push(i);
        return acc;
      }, []);
      for (let i = 1; i < tabRows.length; i++) {
        const row = tabRows[i];
        if (!row[0] || row[0].toLowerCase() !== email.toLowerCase()) continue;
        if (moduleCols.some((ci) => row[ci] && row[ci].trim())) {
          studentHasModules = true;
          break;
        }
      }
    } catch { /* non-fatal */ }
    if (studentHasModules) break;
  }

  if (studentHasModules) {
    // Student has modules → write to program roster tabs, skip Prep Exam
    return allMatches.filter((m) => m.tab !== 'Prep Exam');
  }
  // Exam-only buyer → write to Prep Exam only, skip program roster tabs
  return prepExamMatches;
}

/**
 * Convert content-free stage readback into the durable case outcome. A script
 * exit is intentionally absent from this decision: only exact source readback
 * or an explicit owned exception is terminal.
 */
function derivePaymentFulfillmentOutcome({
  paymentLogVerified,
  postgresVerified,
  rosterMode,
}) {
  const receipts = [
    {
      stage: 'stripe_source',
      outcome: 'verified',
      resultCode: 'stripe_source_resolved',
    },
    {
      stage: 'payment_log',
      outcome: paymentLogVerified ? 'verified' : 'failed',
      resultCode: paymentLogVerified
        ? 'payment_log_readback_verified'
        : 'payment_log_readback_failed',
    },
    {
      stage: 'postgres_payment',
      outcome: postgresVerified ? 'verified' : 'failed',
      resultCode: postgresVerified
        ? 'postgres_payment_readback_verified'
        : 'postgres_payment_readback_failed',
    },
  ];
  let state;
  let errorCode = null;
  if (!paymentLogVerified) {
    state = 'write_failed';
    errorCode = 'payment_log_readback_failed';
  } else if (!postgresVerified) {
    state = 'write_failed';
    errorCode = 'postgres_payment_readback_failed';
  } else if (rosterMode === 'missing_student') {
    state = 'needs_student';
    errorCode = 'student_identity_missing';
  } else if (rosterMode === 'unmapped_product') {
    state = 'needs_product';
    errorCode = 'product_mapping_missing';
  } else if (rosterMode === 'mapped_verified') {
    state = 'complete';
  } else {
    state = 'write_failed';
    errorCode = 'student_roster_readback_failed';
  }
  receipts.push({
    stage: 'student_roster',
    outcome:
      rosterMode === 'mapped_verified'
        ? 'verified'
        : ['missing_student', 'unmapped_product'].includes(rosterMode)
          ? 'exception'
          : 'failed',
    resultCode:
      rosterMode === 'mapped_verified'
        ? 'student_roster_readback_verified'
        : rosterMode === 'missing_student'
          ? 'student_identity_missing'
          : rosterMode === 'unmapped_product'
            ? 'product_mapping_missing'
            : 'student_roster_readback_failed',
  });
  return { state, errorCode, receipts };
}

function emitFulfillmentResult(result) {
  console.log(
    `__CONTADOR_FULFILLMENT__${Buffer.from(JSON.stringify(result)).toString('base64url')}`,
  );
}

function formatPaymentSummary({
  customerName, customerEmail, productName, amountDollars, currency,
  feeDollars, netDollars, refundedCents, transactionDate, recordedDate,
  accountingStripeId, idType, receivedStripeId, rosterSummary,
  paymentLogResult, studentRosterResult, dbResult, debug, lineItemCount,
}) {
  const refundNote = refundedCents > 0
    ? `; $${(refundedCents / 100).toFixed(2)} refunded`
    : '';
  const lines = [
    `Payment received: ${customerName} — ${productName} — $${amountDollars} ${currency}${refundNote}`,
    `Customer: ${customerEmail}`,
    `Date: ${transactionDate} (recorded: ${recordedDate})`,
    `Fee / net: $${feeDollars} / $${netDollars}`,
    `Roster: ${rosterSummary}`,
    `Processing: Payment Log ${paymentLogResult}; Student Roster ${studentRosterResult}; DB ${dbResult}`,
    `Stripe: ${accountingStripeId} (${idType}${accountingStripeId !== receivedStripeId ? `; received ${receivedStripeId}` : ''})`,
  ];
  if (lineItemCount > 1) {
    lines.push(`Warning: ${lineItemCount} line items — only the first was processed`);
  }
  if (debug && debug !== 'no-debug') lines.push(`Diagnostics: ${debug}`);
  return lines.join('\n');
}

async function main() {
  // 1. Fetch payment data from Stripe (tries each key until one works)
  const fetchResult = await fetchPaymentWithKeyFallback();
  const {
    productName, productId, customerEmail, customerName,
    amountCents, currency, paymentStatus, eventType,
    feeCents, refundedCents, lineItems, stripeCreatedAt,
    canonicalTransactionId, stripeAccount, canonicalProductSlug,
    chargeId, invoiceId,
  } = fetchResult;
  const accountingStripeId = canonicalTransactionId || STRIPE_ID;

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
  let rosterMatches = [];
  let paymentLogVerified = false;
  let postgresVerified = false;
  let rosterMode = 'write_failed';

  // 2. Google Sheets operations (separate sheets for payments vs roster)
  const hasSaCreds = fs.existsSync(SA_PATH);

  // 2a. Payment Log (private sheet) — upsert by Stripe ID (column I)
  if (SHEETS_PAYMENTS_ID && hasSaCreds) {
    try {
      let paymentLogRow = null;
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
        accountingStripeId,
        paymentStatus,
      ];
      // Check if this Stripe ID already exists in column J
      const existingIds = await sheetsGet(SHEETS_PAYMENTS_ID, 'Payment Log!J:J');
      const idCol = existingIds.values || [];
      const candidateIds = new Set([accountingStripeId, STRIPE_ID]);
      const existingRow = idCol.findIndex(
        (r, i) => i > 0 && candidateIds.has(r[0]),
      );
      if (existingRow >= 0) {
        const sheetRow = existingRow + 1;
        paymentLogRow = sheetRow;
        // Read the row back before overwriting it: the payment-intent half of
        // a Checkout purchase would otherwise replace the real product name
        // (column E) with its own generic description.
        const prior = await sheetsGet(SHEETS_PAYMENTS_ID, `Payment Log!E${sheetRow}`);
        logRow[4] = preferredProductName(productName, prior.values?.[0]?.[0], eventType);
        await sheetsUpdate(SHEETS_PAYMENTS_ID, `Payment Log!A${sheetRow}:K${sheetRow}`, [logRow]);
        results.sheets_log = `OK (updated existing${logRow[4] === productName ? '' : ', kept richer product name'})`;
      } else {
        const appendResult = await sheetsAppend(SHEETS_PAYMENTS_ID, 'Payment Log!A:K', [logRow]);
        results.sheets_log = 'OK';
        // Extend BasicFilter to include newly appended row.
        // endColumnIndex MUST span every per-row column (A:O) so they all sort
        // as a unit: Refund ID (L) + Refunded Amount (M) from mark-refunds, the
        // operator-editable Defer Month (N), and Payout Month (O). A filter that
        // stops short leaves a column outside the sort range, so a re-sort
        // reshuffles the rest while it stays frozen — orphaning that data from
        // its row (Status in K stays correct, masking the bug — that's how the
        // Refund ID column got scrambled). Keep at 15 (A:O). Payout (O) is a
        // PER-ROW formula (= same-row Defer + 6mo), not an ARRAYFORMULA, so it
        // sorts with its row and recomputes when Defer is edited — verified to
        // survive sorts. Do NOT make O a whole-column ARRAYFORMULA again.
        try {
          const rowMatch = (appendResult.updates?.updatedRange || '').match(/:.*?(\d+)$/);
          if (rowMatch) {
            const newRow = parseInt(rowMatch[1], 10);
            paymentLogRow = newRow;
            // Seed the operator-editable Defer Month (col N) = sale month (first
            // of month) and the Payout formula (col O) = Defer + 6. The operator
            // overrides Defer for future cohorts; Payout + the ladder recount.
            const deferMonth = `${txnDateObj.getFullYear()}-${String(txnDateObj.getMonth() + 1).padStart(2, '0')}-01`;
            const payoutFormula = `=IF(N${newRow}="","",IFERROR(EDATE(DATE(YEAR(N${newRow}),MONTH(N${newRow}),1),6),""))`;
            await sheetsUpdate(SHEETS_PAYMENTS_ID, `Payment Log!N${newRow}:O${newRow}`, [[deferMonth, payoutFormula]]);
            const meta = await getSheetMetadata(SHEETS_PAYMENTS_ID);
            const tab = meta.sheets?.find((s) => s.properties.title === 'Payment Log');
            if (tab) {
              await sheetsBatchUpdate(SHEETS_PAYMENTS_ID, [{
                setBasicFilter: {
                  filter: {
                    range: {
                      sheetId: tab.properties.sheetId,
                      startRowIndex: 0,
                      startColumnIndex: 0,
                      endRowIndex: newRow,
                      endColumnIndex: 15,
                    },
                  },
                },
              }]);
            }
          }
        } catch { /* non-fatal — filter update is nice-to-have */ }
      }
      if (paymentLogRow !== null) {
        const readback = await sheetsGet(
          SHEETS_PAYMENTS_ID,
          `Payment Log!J${paymentLogRow}:K${paymentLogRow}`,
        );
        const [readbackId, readbackStatus] = readback.values?.[0] || [];
        paymentLogVerified =
          readbackId === accountingStripeId && readbackStatus === paymentStatus;
        results.sheets_log = paymentLogVerified
          ? `${results.sheets_log} (readback verified)`
          : 'ERROR: payment log readback mismatch';
      } else {
        results.sheets_log = 'ERROR: payment log row identity unavailable';
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

  // 2b. Student Roster (shared sheet — tabs per credential: ACC/PCC/ACTC Roster)
  // Combo products (e.g. Professional Coach Program) can map to multiple tabs
  if (SHEETS_ROSTER_ID && hasSaCreds) {
    try {
      // Read Product Map (3 columns: product name, tab name, column header)
      // Combo products have multiple rows — one per roster tab
      const mapping = await sheetsGet(SHEETS_ROSTER_ID, 'Product Map!A:C');
      const rows = mapping.values || [];
      rosterMatches = rows
        .filter((r, i) => i > 0 && r[0] && r[0].toLowerCase() === productName.toLowerCase() && r[1] && r[2])
        .map((r) => ({ tab: r[1], column: r[2] }));

      // Exam routing: when product maps to both a program roster AND Prep Exam,
      // check if student already has modules on the program roster.
      // If yes → keep program roster entry, skip Prep Exam.
      // If no → use Prep Exam only, skip program roster.
      const hasPrepExam = rosterMatches.some((m) => m.tab === 'Prep Exam');
      const programTabs = rosterMatches.filter((m) => m.tab !== 'Prep Exam' && m.tab.endsWith(' Roster'));
      if (hasPrepExam && programTabs.length > 0 && customerEmail) {
        rosterMatches = await resolveExamRouting(rosterMatches, programTabs, customerEmail);
      }

      if (rosterMatches.length > 0 && customerEmail) {
        const rosterResults = [];
        let verifiedTargets = 0;
        for (const { tab, column } of rosterMatches) {
          try {
            const headers = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!1:1`);
            const headerRow = headers.values?.[0] || [];
            const colIndex = headerRow.findIndex((h) => h === column);

            if (colIndex >= 0) {
              const emails = await sheetsGet(SHEETS_ROSTER_ID, `${tab}!A:A`);
              const emailCol = emails.values || [];
              const rowIndex = emailCol.findIndex(
                (r, i) =>
                  i > 0 &&
                  r[0] &&
                  r[0].toLowerCase() === customerEmail.toLowerCase(),
              );

              let writtenRow;
              if (rowIndex < 0) {
                const newRow = new Array(headerRow.length).fill('');
                newRow[0] = customerEmail;
                newRow[1] = customerName;
                newRow[colIndex] = transactionDate;
                if (refundedCents > 0) {
                  const refundColIndex = headerRow.findIndex((h) => h === 'Refunded');
                  if (refundColIndex >= 0) newRow[refundColIndex] = transactionDate;
                }
                const appendResult = await sheetsAppend(
                  SHEETS_ROSTER_ID,
                  `${tab}!A:A`,
                  [newRow],
                );
                const rowMatch = (appendResult.updates?.updatedRange || '').match(
                  /:.*?(\d+)$/,
                );
                writtenRow = rowMatch ? parseInt(rowMatch[1], 10) : null;
              } else {
                const sheetRow = rowIndex + 1;
                writtenRow = sheetRow;
                const colLetter = colIndexToLetter(colIndex);
                await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!${colLetter}${sheetRow}`, [
                  [transactionDate],
                ]);
                try {
                  // Fill the name when the cell is blank OR a stale "Unknown"
                  // (a prior webhook lost the customer.name race and a replay
                  // would otherwise leave it stuck forever). Never clobber a
                  // real name, and only write a real name ourselves.
                  const existingName = (
                    (await sheetsGet(SHEETS_ROSTER_ID, `${tab}!B${sheetRow}`)).values?.[0]?.[0] || ''
                  ).trim();
                  const fillable = !existingName || existingName.toLowerCase() === 'unknown';
                  if (fillable && customerName && customerName !== 'Unknown') {
                    await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!B${sheetRow}`, [
                      [customerName],
                    ]);
                  }
                } catch { /* non-fatal */ }
                if (refundedCents > 0) {
                  const refundColIndex = headerRow.findIndex((h) => h === 'Refunded');
                  if (refundColIndex >= 0) {
                    const refundLetter = colIndexToLetter(refundColIndex);
                    await sheetsUpdate(SHEETS_ROSTER_ID, `${tab}!${refundLetter}${sheetRow}`, [
                      [transactionDate],
                    ]);
                  }
                }
              }
              if (writtenRow) {
                const colLetter = colIndexToLetter(colIndex);
                const readback = await sheetsGet(
                  SHEETS_ROSTER_ID,
                  `${tab}!A${writtenRow}:${colLetter}${writtenRow}`,
                );
                const row = readback.values?.[0] || [];
                const emailMatches =
                  String(row[0] || '').toLowerCase() ===
                  customerEmail.toLowerCase();
                const targetPresent = Boolean(String(row[colIndex] || '').trim());
                if (emailMatches && targetPresent) {
                  verifiedTargets++;
                  rosterResults.push(
                    `${tab}: ${refundedCents > 0 ? 'OK (refunded)' : 'OK'} (readback verified)`,
                  );
                } else {
                  rosterResults.push(`${tab}: ERROR: readback mismatch`);
                }
              } else {
                rosterResults.push(`${tab}: ERROR: row identity unavailable`);
              }
            } else {
              rosterResults.push(`${tab}: column "${column}" not found`);
            }
          } catch (e) {
            rosterResults.push(`${tab}: ERROR: ${e.message.slice(0, 80)}`);
          }
        }
        results.sheets_roster = rosterResults.join('; ');
        rosterMode =
          verifiedTargets === rosterMatches.length
            ? 'mapped_verified'
            : 'write_failed';
      } else if (rosterMatches.length === 0) {
        // Unrecognized product — no exact Product Map row. This is the case for
        // sales-closed deals paid via a Plutio/Stripe invoice (description is
        // unique per deal, e.g. "Invoice #tca-371-pl from Tandem Coaching
        // Partners LLC (...)"), a bare "Unknown", or a not-yet-mapped product.
        // These would otherwise land on NO roster tab ("skipped") even though
        // the Payment Log records the transaction. Capture them on the catch-all
        // "Sales" tab so sales-closed deals appear in the students log too.
        // Idempotent: upsert by Stripe ID (col F) so webhook retries / reaper
        // re-runs don't duplicate the row (mirrors the Payment Log upsert).
        if (customerEmail) {
          try {
            const salesRow = [
              customerEmail,
              customerName,
              productName,
              amountDollars,
              transactionDate,
              accountingStripeId,
            ];
            const salesIds = await sheetsGet(SHEETS_ROSTER_ID, 'Sales!F:F');
            const salesIdCol = salesIds.values || [];
            const candidateIds = new Set([accountingStripeId, STRIPE_ID]);
            const existingSales = salesIdCol.findIndex(
              (r, i) => i > 0 && candidateIds.has(r[0]),
            );
            if (existingSales >= 0) {
              const sheetRow = existingSales + 1;
              await sheetsUpdate(SHEETS_ROSTER_ID, `Sales!A${sheetRow}:F${sheetRow}`, [salesRow]);
              results.sheets_roster = 'Sales tab: OK (updated existing)';
            } else {
              await sheetsAppend(SHEETS_ROSTER_ID, 'Sales!A:F', [salesRow]);
              results.sheets_roster = 'Sales tab: OK (unmapped product)';
            }
          } catch (e) {
            results.sheets_roster = `Sales tab ERROR: ${e.message.slice(0, 100)}`;
          }
          rosterMode = results.sheets_roster.startsWith('Sales tab: OK')
            ? 'unmapped_product'
            : 'write_failed';
        } else {
          results.sheets_roster = 'unrecognized product, no email — skipped';
          rosterMode = 'missing_student';
        }
      } else {
        results.sheets_roster = 'no customer email — skipped';
        rosterMode = 'missing_student';
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
  //
  // Values are passed as psql variables and referenced as :'name', never
  // interpolated into a shell-built command string. The previous version ran
  // one shell command with the values inline, so the SHELL expanded them
  // before psql ever saw them: a product named "... ($999/mo x4)" was stored
  // as "... (99/mo x4)" and "... ($500/mo)" as "... (00/mo)" — $9 and $5 read
  // as positional shell parameters. The same interpolation could have
  // EXECUTED a product name containing backticks or $(...). execFileSync
  // removes the shell entirely — there is no metacharacter surface at all.
  try {
    const params = {
      email: customerEmail, name: customerName, product: productName,
      prodid: productId, amount: String(amountCents), currency,
      sid: accountingStripeId, status: paymentStatus, evt: eventType,
      paid: transactionDateISO, legacy: STRIPE_ID,
    };
    const args = buildPsqlVarArgs(params);
    const sql = `
      BEGIN;
      INSERT INTO payments (email, name, product_name, product_id, amount_cents,
                            currency, stripe_session_id, payment_status, event_type, paid_at)
      VALUES (:'email', :'name', :'product', :'prodid', :'amount'::int,
              :'currency', :'sid', :'status', :'evt', :'paid'::date)
      ON CONFLICT (stripe_session_id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        payment_status = EXCLUDED.payment_status,
        paid_at = EXCLUDED.paid_at,
        -- The checkout event expands the line item and knows the real
        -- product; the payment-intent half of the SAME purchase carries only
        -- a generic description ("Unknown", "Individual Mentor Coaching") and
        -- no product id. Now that both halves converge on ONE row (keyed on
        -- the shared pi_*), whichever arrives second must not degrade what
        -- the checkout event already recorded — mirrors preferredProductName.
        product_name = CASE
          WHEN EXCLUDED.event_type = 'checkout.session.completed'
            OR payments.event_type <> 'checkout.session.completed'
          THEN EXCLUDED.product_name ELSE payments.product_name END,
        product_id = CASE WHEN EXCLUDED.product_id <> '' THEN EXCLUDED.product_id
                          ELSE payments.product_id END,
        event_type = CASE
          WHEN EXCLUDED.event_type = 'checkout.session.completed'
          THEN EXCLUDED.event_type ELSE payments.event_type END;
      DELETE FROM payments WHERE stripe_session_id = :'legacy' AND :'legacy' <> :'sid';
      COMMIT;
      SELECT stripe_session_id
        FROM payments
       WHERE stripe_session_id = :'sid';`;
    // Fed on stdin via -f -, not -c: psql performs :'var' interpolation only
    // when reading a script, never for -c strings (where :'sid' would reach
    // the server verbatim and fail with a syntax error).
    const dbReadback = execFileSync(
      'psql',
      [...args, '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', '-'],
      {
        input: sql,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
      },
    );
    postgresVerified = dbReadback
      .split('\n')
      .map((line) => line.trim())
      .includes(accountingStripeId);
    results.db = postgresVerified
      ? 'OK (readback verified)'
      : 'ERROR: Postgres payment readback missing';
  } catch (e) {
    results.db = `ERROR: ${e.stderr?.toString().trim() || e.message}`;
  }

  // 4. Output summary
  console.log(formatPaymentSummary({
    customerName, customerEmail, productName, amountDollars, currency,
    feeDollars, netDollars, refundedCents, transactionDate, recordedDate,
    accountingStripeId, idType: ID_TYPE, receivedStripeId: STRIPE_ID,
    rosterSummary: rosterMatches.length > 0
      ? rosterMatches.map(m => `${m.tab} → ${m.column}`).join(', ')
      : 'Sales tab (unmapped product)',
    paymentLogResult: results.sheets_log,
    studentRosterResult: results.sheets_roster,
    dbResult: results.db,
    debug: fetchResult._debug,
    lineItemCount: lineItems.length,
  }));

  const fulfillment = derivePaymentFulfillmentOutcome({
    paymentLogVerified,
    postgresVerified,
    rosterMode,
  });
  const aliases = [
    { kind: 'payment_intent', id: accountingStripeId },
    ...(STRIPE_ID.startsWith('cs_')
      ? [{ kind: 'checkout_session', id: STRIPE_ID }]
      : []),
    ...(chargeId ? [{ kind: 'charge', id: chargeId }] : []),
    ...(invoiceId ? [{ kind: 'invoice', id: invoiceId }] : []),
  ];
  emitFulfillmentResult({
    version: 1,
    stripeAccount,
    paymentIntentId: accountingStripeId,
    sourceObjectId: STRIPE_ID,
    eventType,
    occurredAt: new Date(txnDateObj).toISOString(),
    aliases,
    ...fulfillment,
  });

  const lifecycleEligible =
    fulfillment.state === 'complete' &&
    /^pi_[A-Za-z0-9_]+$/.test(canonicalTransactionId || '') &&
    (ID_TYPE === 'checkout' ? paymentStatus === 'paid' : paymentStatus === 'succeeded');
  const lifecycle = {
    eligible: lifecycleEligible,
    event_name: 'purchase_completed',
    account: stripeAccount,
    canonical_transaction_id: canonicalTransactionId || null,
    canonical_product_slug: canonicalProductSlug || null,
    provider_object_id: STRIPE_ID,
    occurred_at: new Date(txnDateObj).toISOString(),
    amount_cents: amountCents,
    currency,
    payment_status: paymentStatus,
  };
  console.log(
    `__CHAOS_LIFECYCLE__${Buffer.from(JSON.stringify(lifecycle)).toString('base64url')}`,
  );
}

// Only run when executed directly. Without this guard, importing the file to
// test its pure slug/product-preservation logic would fire the whole
// Stripe → Sheets → Postgres pipeline as a side effect of the import.
module.exports = {
  validateCanonicalProductSlug,
  preferredProductName,
  buildPsqlVarArgs,
  formatPaymentSummary,
  derivePaymentFulfillmentOutcome,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`[EL CONTADOR] ERROR: ${err.message}`);
    process.exit(1);
  });
}
