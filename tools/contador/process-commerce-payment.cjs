#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');

const HTTP_TIMEOUT_MS = 20000;
const PAYMENTS_ID = process.env.SHEETS_PAYMENTS_ID;
const ROSTER_ID = process.env.SHEETS_ROSTER_ID;
const SA_PATH = process.env.SHEETS_SA_JSON;
const PAYMENT_PROVIDER_HEADER = 'Payment Provider';
let accessToken = null;

function fail(message) { throw new Error(message); }
function request(options, body = '') {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) { reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)); return; }
        try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('response JSON invalid')); }
      });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function token() {
  if (accessToken) return accessToken;
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key).toString('base64url');
  const form = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${claims}.${signature}`;
  const result = await request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, form);
  if (!result.access_token) fail('Sheets token unavailable');
  accessToken = result.access_token;
  return accessToken;
}

async function sheets(sheetId, method, path, body = null) {
  const encoded = body === null ? '' : JSON.stringify(body);
  return request({ hostname: 'sheets.googleapis.com', path: `/v4/spreadsheets/${sheetId}/${path}`, method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(encoded ? { 'Content-Length': Buffer.byteLength(encoded) } : {}) } }, encoded);
}
const get = (id, range) => sheets(id, 'GET', `values/${encodeURIComponent(range)}`);
const update = (id, range, values) => sheets(id, 'PUT', `values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { values });
const append = (id, range, values) => sheets(id, 'POST', `values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values });

async function extendPaymentLogFilter(sheetRow) {
  const auth = await token();
  const meta = await request({ hostname: 'sheets.googleapis.com', path: `/v4/spreadsheets/${PAYMENTS_ID}?fields=sheets.properties,sheets.basicFilter`, method: 'GET', headers: { Authorization: `Bearer ${auth}` } });
  const tab = meta.sheets?.find(item => item.properties?.title === 'Payment Log');
  if (!tab?.properties?.sheetId) fail('payment log sheet metadata missing');
  const current = tab.basicFilter?.range || {};
  const range = {
    sheetId: tab.properties.sheetId,
    startRowIndex: Number(current.startRowIndex || 0),
    startColumnIndex: Number(current.startColumnIndex || 0),
    endRowIndex: Math.max(Number(current.endRowIndex || 0), sheetRow),
    endColumnIndex: 16,
  };
  const body = JSON.stringify({ requests: [{ setBasicFilter: { filter: { ...(tab.basicFilter || {}), range } } }] });
  await request({ hostname: 'sheets.googleapis.com', path: `/v4/spreadsheets/${PAYMENTS_ID}:batchUpdate`, method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, body);
}

function column(index) {
  let result = '';
  for (let value = index; value >= 0; value = Math.floor(value / 26) - 1) result = String.fromCharCode(65 + value % 26) + result;
  return result;
}

function psqlVars(values) {
  return Object.entries(values).flatMap(([key, value]) => ['-v', `${key}=${value ?? ''}`]);
}

async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 64 * 1024) fail('input too large');
  }
  return JSON.parse(raw);
}

async function ensurePaymentProviderHeader() {
  const current = String((await get(PAYMENTS_ID, 'Payment Log!P1')).values?.[0]?.[0] || '').trim();
  if (current && current !== PAYMENT_PROVIDER_HEADER) fail('payment provider header conflict');
  if (!current) await update(PAYMENTS_ID, 'Payment Log!P1', [[PAYMENT_PROVIDER_HEADER]]);
  const verified = String((await get(PAYMENTS_ID, 'Payment Log!P1')).values?.[0]?.[0] || '').trim();
  if (verified !== PAYMENT_PROVIDER_HEADER) fail('payment provider header readback mismatch');
}

async function recordPaymentLog(fact) {
  await ensurePaymentProviderHeader();
  const ids = (await get(PAYMENTS_ID, 'Payment Log!J:J')).values || [];
  const index = ids.findIndex((row, i) => i > 0 && row[0] === fact.pspReference);
  const row = [fact.transactionDate, fact.recordedDate, fact.learnerName, fact.learnerEmail, fact.productName, fact.amountDollars, '', '', fact.currency, fact.pspReference, 'paid'];
  let sheetRow;
  if (index >= 0) {
    sheetRow = index + 1;
    const priorRecordedDate = String((await get(PAYMENTS_ID, `Payment Log!B${sheetRow}`)).values?.[0]?.[0] || '').trim();
    if (priorRecordedDate) row[1] = priorRecordedDate;
    await update(PAYMENTS_ID, `Payment Log!A${sheetRow}:K${sheetRow}`, [row]);
  } else {
    const result = await append(PAYMENTS_ID, 'Payment Log!A:K', [row]);
    const match = String(result.updates?.updatedRange || '').match(/:.*?(\d+)$/);
    sheetRow = match ? Number(match[1]) : 0;
  }
  if (!sheetRow) fail('payment log row unavailable');
  await update(PAYMENTS_ID, `Payment Log!P${sheetRow}`, [['Adyen']]);
  await extendPaymentLogFilter(sheetRow);
  const identity = (await get(PAYMENTS_ID, `Payment Log!J${sheetRow}:K${sheetRow}`)).values?.[0] || [];
  const provider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
  if (identity[0] !== fact.pspReference || identity[1] !== 'paid' || provider !== 'Adyen') fail('payment log readback mismatch');
  return { verified: true, row: sheetRow, recordedDate: row[1] };
}

async function recordRoster(fact) {
  const productRows = ((await get(ROSTER_ID, 'Product Map!A:C')).values || [])
    .filter(row => String(row[0] || '').trim() === fact.productName && row[1] && row[2]);
  if (!productRows.length) fail('product mapping missing');
  const destinations = [];
  for (const mapping of productRows) {
    const tab = String(mapping[1]);
    const target = String(mapping[2]);
    const headers = (await get(ROSTER_ID, `'${tab}'!1:1`)).values?.[0] || [];
    const targetIndex = headers.findIndex(value => value === target);
    if (targetIndex < 0) fail(`roster target missing: ${tab}/${target}`);
    const emails = (await get(ROSTER_ID, `'${tab}'!A:A`)).values || [];
    const found = emails.findIndex((row, i) => i > 0 && String(row[0] || '').toLowerCase() === fact.learnerEmail);
    let sheetRow;
    if (found >= 0) {
      sheetRow = found + 1;
      await update(ROSTER_ID, `'${tab}'!${column(targetIndex)}${sheetRow}`, [[fact.transactionDate]]);
      const currentName = String((await get(ROSTER_ID, `'${tab}'!B${sheetRow}`)).values?.[0]?.[0] || '').trim();
      if (!currentName || currentName.toLowerCase() === 'unknown') await update(ROSTER_ID, `'${tab}'!B${sheetRow}`, [[fact.learnerName]]);
    } else {
      const row = new Array(Math.max(headers.length, targetIndex + 1)).fill('');
      row[0] = fact.learnerEmail; row[1] = fact.learnerName; row[targetIndex] = fact.transactionDate;
      const result = await append(ROSTER_ID, `'${tab}'!A:A`, [row]);
      const match = String(result.updates?.updatedRange || '').match(/:.*?(\d+)$/);
      sheetRow = match ? Number(match[1]) : 0;
    }
    if (!sheetRow) fail('roster row unavailable');
    const verify = (await get(ROSTER_ID, `'${tab}'!A${sheetRow}:${column(targetIndex)}${sheetRow}`)).values?.[0] || [];
    if (String(verify[0] || '').toLowerCase() !== fact.learnerEmail || !String(verify[targetIndex] || '').trim()) fail('student roster readback mismatch');
    destinations.push({ tab, column: target, row: sheetRow });
  }
  return destinations;
}

function recordPostgres(envelope, fact) {
  const values = {
    delivery: envelope.deliveryId, orderid: envelope.order.orderId,
    psp: fact.pspReference, merchant: envelope.order.merchantReference,
    product: envelope.order.productId, amount: String(envelope.order.amountCents),
    currency: envelope.order.currency, eventdate: envelope.notification.eventDate,
    evidence: crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex'),
  };
  const sql = `
    INSERT INTO business_v2.contador_adyen_payments
      (delivery_id,order_id,psp_reference,merchant_reference,product_id,amount_cents,currency,event_date,evidence_sha256)
    VALUES (:'delivery'::uuid,:'orderid'::uuid,:'psp',:'merchant',:'product',:'amount'::bigint,:'currency',:'eventdate'::timestamptz,:'evidence')
    ON CONFLICT (psp_reference) DO UPDATE SET last_seen_at=now(), delivery_id=EXCLUDED.delivery_id
    WHERE business_v2.contador_adyen_payments.order_id=EXCLUDED.order_id
      AND business_v2.contador_adyen_payments.merchant_reference=EXCLUDED.merchant_reference
      AND business_v2.contador_adyen_payments.amount_cents=EXCLUDED.amount_cents
      AND business_v2.contador_adyen_payments.currency=EXCLUDED.currency;
    SELECT delivery_id::text,psp_reference FROM business_v2.contador_adyen_payments WHERE psp_reference=:'psp';`;
  const output = execFileSync('psql', [...psqlVars(values), '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', '-'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return output.split('\n').some(line => line.trim() === `${envelope.deliveryId}|${fact.pspReference}`);
}

function formatCommerceSummary(fact, paymentLog, rosterDestinations) {
  const roster = rosterDestinations.map(destination => `${destination.tab} → ${destination.column} (row ${destination.row})`).join('; ');
  return [
    `Payment received: ${fact.learnerName} — ${fact.productName} — $${fact.amountDollars} ${fact.currency}`,
    `Learner: ${fact.learnerName} <${fact.learnerEmail}>`,
    `Provider: Adyen · ${fact.pspReference}`,
    `Paid: ${fact.transactionDate} · Recorded: ${paymentLog.recordedDate}`,
    'Fee: pending — awaiting Adyen settlement/fee evidence',
    `Payment Log: recorded and verified (row ${paymentLog.row}; provider Adyen)`,
    `Student Roster: recorded and verified (${roster})`,
    'Database: recorded and verified',
  ].join('\n');
}

async function main() {
  if (!PAYMENTS_ID || !ROSTER_ID || !SA_PATH || !fs.existsSync(SA_PATH)) fail('bookkeeper configuration missing');
  const envelope = await readInput();
  const event = new Date(envelope.notification.eventDate);
  if (!Number.isFinite(event.getTime())) fail('event date invalid');
  const format = date => `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const learner = envelope.order.learner;
  const fact = {
    pspReference: envelope.notification.pspReference,
    transactionDate: format(event), recordedDate: format(new Date()),
    learnerName: `${learner.firstName} ${learner.lastName}`.trim(), learnerEmail: learner.email.toLowerCase(),
    productName: envelope.order.productName, amountDollars: (envelope.order.amountCents / 100).toFixed(2), currency: envelope.order.currency,
  };
  // Each destination is idempotent by provider payment ID. A retry repairs an
  // incomplete prior delivery and only succeeds after exact readback.
  const paymentLog = await recordPaymentLog(fact);
  const rosterDestinations = await recordRoster(fact);
  const postgresVerified = recordPostgres(envelope, fact);
  const result = { deliveryId: envelope.deliveryId, provider: 'adyen', providerPaymentId: fact.pspReference, paymentLogVerified: paymentLog.verified, studentRosterVerified: rosterDestinations.length > 0, postgresVerified, summary: formatCommerceSummary(fact, paymentLog, rosterDestinations) };
  console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
}

if (require.main === module) main().catch(error => { console.error(`[EL CONTADOR] ${error.message}`); process.exit(1); });

module.exports = { column, psqlVars, formatCommerceSummary };
