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

function cohortRosterValue(current, cohort) {
  const existing = String(current || '').trim();
  if (existing) return existing;
  return cohort && typeof cohort.rosterValue === 'string' ? cohort.rosterValue.trim() : '';
}

function commerceEconomics(amountCents, economics) {
  if (!economics) return null;
  const providerFeeCents = Number(economics.providerFeeCents);
  const periFeeCents = Number(economics.periFeeCents);
  const feeBasis = String(economics.feeBasis || '');
  const feeCents = providerFeeCents + periFeeCents;
  if (!['adyen_detailed', 'zentact_settled'].includes(feeBasis) || !Number.isSafeInteger(amountCents) || amountCents <= 0 ||
      !Number.isSafeInteger(providerFeeCents) || providerFeeCents < 0 || !Number.isSafeInteger(periFeeCents) || periFeeCents < 0 || feeCents > amountCents) {
    fail('payment economics invalid');
  }
  return {
    feeBasis,
    providerFeeCents,
    periFeeCents,
    feeCents,
    netCents: amountCents - feeCents,
    feeDollars: (feeCents / 100).toFixed(2),
    netDollars: ((amountCents - feeCents) / 100).toFixed(2),
  };
}

function sheetMoneyCents(value) {
  const text = String(value ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) fail('payment log money invalid');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
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
  const row = [fact.transactionDate, fact.recordedDate, fact.learnerName, fact.learnerEmail, fact.productName, fact.amountDollars, fact.economics?.feeDollars || '', fact.economics?.netDollars || '', fact.currency, fact.pspReference, 'paid'];
  let sheetRow;
  if (index >= 0) {
    sheetRow = index + 1;
    const priorRecordedDate = String((await get(PAYMENTS_ID, `Payment Log!B${sheetRow}`)).values?.[0]?.[0] || '').trim();
    if (priorRecordedDate) row[1] = priorRecordedDate;
    if (!fact.economics) {
      const priorEconomics = (await get(PAYMENTS_ID, `Payment Log!G${sheetRow}:H${sheetRow}`)).values?.[0] || [];
      row[6] = String(priorEconomics[0] || '').trim();
      row[7] = String(priorEconomics[1] || '').trim();
    }
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

async function recordPaymentFees(envelope) {
  const economics = commerceEconomics(envelope.order.amountCents, envelope.economics);
  if (!economics) fail('payment economics missing');
  await ensurePaymentProviderHeader();
  const ids = (await get(PAYMENTS_ID, 'Payment Log!J:J')).values || [];
  const matches = ids
    .map((row, index) => ({ id: String(row[0] || ''), index }))
    .filter(entry => entry.index > 0 && entry.id === envelope.notification.pspReference);
  if (matches.length !== 1) fail('payment log fee row unavailable');
  const sheetRow = matches[0].index + 1;
  const before = (await get(PAYMENTS_ID, `Payment Log!F${sheetRow}:K${sheetRow}`)).values?.[0] || [];
  const provider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
  const grossCents = sheetMoneyCents(before[0]);
  const currency = String(before[3] || '');
  const psp = String(before[4] || '');
  const status = String(before[5] || '').toLowerCase();
  if (grossCents !== envelope.order.amountCents || currency !== envelope.order.currency ||
      psp !== envelope.notification.pspReference || !['paid','partially refunded','refunded'].includes(status) || provider !== 'Adyen') {
    fail('payment log fee identity mismatch');
  }
  await update(PAYMENTS_ID, `Payment Log!G${sheetRow}:H${sheetRow}`, [[economics.feeDollars, economics.netDollars]]);
  const after = (await get(PAYMENTS_ID, `Payment Log!F${sheetRow}:J${sheetRow}`)).values?.[0] || [];
  const finalProvider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
  if (sheetMoneyCents(after[0]) !== envelope.order.amountCents || sheetMoneyCents(after[1]) !== economics.feeCents ||
      sheetMoneyCents(after[2]) !== economics.netCents || String(after[3] || '') !== envelope.order.currency ||
      String(after[4] || '') !== envelope.notification.pspReference || finalProvider !== 'Adyen') {
    fail('payment log fee readback mismatch');
  }
  return { verified: true, row: sheetRow, economics };
}

function refundPaymentLogStatus(refund) {
  if (!refund || !Number.isSafeInteger(refund.remainingPaidCents) || refund.remainingPaidCents < 0) fail('refund status invalid');
  return refund.remainingPaidCents === 0 ? 'refunded' : 'partially refunded';
}

function finalRefundPaymentLogStatus(current, refund) {
  const existing = String(current || '').trim().toLowerCase();
  return existing === 'refunded' ? 'refunded' : refundPaymentLogStatus(refund);
}

async function recordRefundPaymentLog(envelope) {
  const refund = envelope.refund;
  if (!refund) fail('refund evidence missing');
  await ensurePaymentProviderHeader();
  const ids = (await get(PAYMENTS_ID, 'Payment Log!J:J')).values || [];
  const matches = ids
    .map((row, index) => ({ id: String(row[0] || ''), index }))
    .filter(entry => entry.index > 0 && entry.id === refund.paymentPspReference);
  if (matches.length !== 1) fail('original payment log row unavailable');
  const sheetRow = matches[0].index + 1;
  const currentStatus = String((await get(PAYMENTS_ID, `Payment Log!K${sheetRow}`)).values?.[0]?.[0] || '').trim();
  const status = finalRefundPaymentLogStatus(currentStatus, refund);
  if (status !== currentStatus) await update(PAYMENTS_ID, `Payment Log!K${sheetRow}`, [[status]]);
  const identity = (await get(PAYMENTS_ID, `Payment Log!J${sheetRow}:K${sheetRow}`)).values?.[0] || [];
  const provider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
  if (identity[0] !== refund.paymentPspReference || identity[1] !== status || provider !== 'Adyen') fail('refund payment log readback mismatch');
  return { verified: true, row: sheetRow, status };
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
    const cohortIndex = headers.findIndex(value => value === 'Cohort');
    if (fact.cohort && cohortIndex < 0) fail(`roster cohort target missing: ${tab}/Cohort`);
    const emails = (await get(ROSTER_ID, `'${tab}'!A:A`)).values || [];
    const found = emails.findIndex((row, i) => i > 0 && String(row[0] || '').toLowerCase() === fact.learnerEmail);
    let sheetRow;
    let cohortValue = '';
    if (found >= 0) {
      sheetRow = found + 1;
      await update(ROSTER_ID, `'${tab}'!${column(targetIndex)}${sheetRow}`, [[fact.transactionDate]]);
      const currentName = String((await get(ROSTER_ID, `'${tab}'!B${sheetRow}`)).values?.[0]?.[0] || '').trim();
      if (!currentName || currentName.toLowerCase() === 'unknown') await update(ROSTER_ID, `'${tab}'!B${sheetRow}`, [[fact.learnerName]]);
      if (fact.cohort) {
        const cell = `'${tab}'!${column(cohortIndex)}${sheetRow}`;
        const before = String((await get(ROSTER_ID, cell)).values?.[0]?.[0] || '').trim();
        const expected = cohortRosterValue(before, fact.cohort);
        if (!before) await update(ROSTER_ID, cell, [[expected]]);
        const after = String((await get(ROSTER_ID, cell)).values?.[0]?.[0] || '').trim();
        if (after !== expected) fail('student roster cohort readback mismatch');
        cohortValue = after;
      }
    } else {
      const row = new Array(Math.max(headers.length, targetIndex + 1, cohortIndex + 1)).fill('');
      row[0] = fact.learnerEmail; row[1] = fact.learnerName; row[targetIndex] = fact.transactionDate;
      if (fact.cohort) row[cohortIndex] = cohortRosterValue('', fact.cohort);
      const result = await append(ROSTER_ID, `'${tab}'!A:A`, [row]);
      const match = String(result.updates?.updatedRange || '').match(/:.*?(\d+)$/);
      sheetRow = match ? Number(match[1]) : 0;
    }
    if (!sheetRow) fail('roster row unavailable');
    const verify = (await get(ROSTER_ID, `'${tab}'!A${sheetRow}:${column(targetIndex)}${sheetRow}`)).values?.[0] || [];
    if (String(verify[0] || '').toLowerCase() !== fact.learnerEmail || !String(verify[targetIndex] || '').trim()) fail('student roster readback mismatch');
    if (fact.cohort && !cohortValue) {
      cohortValue = String((await get(ROSTER_ID, `'${tab}'!${column(cohortIndex)}${sheetRow}`)).values?.[0]?.[0] || '').trim();
      if (!cohortValue) fail('student roster cohort readback mismatch');
    }
    destinations.push({ tab, column: target, row: sheetRow, cohort: cohortValue });
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

function recordPostgresRefund(envelope) {
  const refund = envelope.refund;
  if (!refund) fail('refund evidence missing');
  const values = {
    delivery: envelope.deliveryId,
    refundid: refund.refundId,
    orderid: envelope.order.orderId,
    refundpsp: refund.refundPspReference,
    paymentpsp: refund.paymentPspReference,
    requestref: refund.requestReference,
    merchant: envelope.order.merchantReference,
    amount: String(refund.amountCents),
    cumulative: String(refund.cumulativeRefundedCents),
    remaining: String(refund.remainingPaidCents),
    currency: envelope.order.currency,
    eventdate: envelope.notification.eventDate,
    evidence: crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex'),
  };
  const sql = `
    INSERT INTO business_v2.contador_adyen_refunds
      (delivery_id,refund_id,order_id,refund_psp_reference,payment_psp_reference,request_reference,merchant_reference,amount_cents,cumulative_refunded_cents,remaining_paid_cents,currency,event_date,evidence_sha256)
    SELECT :'delivery'::uuid,:'refundid'::uuid,:'orderid'::uuid,:'refundpsp',:'paymentpsp',:'requestref',:'merchant',:'amount'::bigint,:'cumulative'::bigint,:'remaining'::bigint,:'currency',:'eventdate'::timestamptz,:'evidence'
      FROM business_v2.contador_adyen_payments p
     WHERE p.psp_reference=:'paymentpsp'
       AND p.order_id=:'orderid'::uuid
       AND p.merchant_reference=:'merchant'
       AND p.amount_cents=:'cumulative'::bigint + :'remaining'::bigint
    ON CONFLICT (refund_psp_reference) DO UPDATE
      SET last_seen_at=now(),delivery_id=EXCLUDED.delivery_id
    WHERE business_v2.contador_adyen_refunds.refund_id=EXCLUDED.refund_id
      AND business_v2.contador_adyen_refunds.order_id=EXCLUDED.order_id
      AND business_v2.contador_adyen_refunds.payment_psp_reference=EXCLUDED.payment_psp_reference
      AND business_v2.contador_adyen_refunds.request_reference=EXCLUDED.request_reference
      AND business_v2.contador_adyen_refunds.merchant_reference=EXCLUDED.merchant_reference
      AND business_v2.contador_adyen_refunds.amount_cents=EXCLUDED.amount_cents
      AND business_v2.contador_adyen_refunds.cumulative_refunded_cents=EXCLUDED.cumulative_refunded_cents
      AND business_v2.contador_adyen_refunds.remaining_paid_cents=EXCLUDED.remaining_paid_cents
      AND business_v2.contador_adyen_refunds.currency=EXCLUDED.currency;
    SELECT delivery_id::text,refund_psp_reference FROM business_v2.contador_adyen_refunds WHERE refund_psp_reference=:'refundpsp';`;
  const output = execFileSync('psql', [...psqlVars(values), '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', '-'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return output.split('\n').some(line => line.trim() === `${envelope.deliveryId}|${refund.refundPspReference}`);
}

function formatCommerceSummary(fact, paymentLog, rosterDestinations) {
  const roster = rosterDestinations.map(destination => `${destination.tab} → ${destination.column} (row ${destination.row})`).join('; ');
  const fee = fact.economics
    ? `Fee / net: $${fact.economics.feeDollars} / $${fact.economics.netDollars} (${fact.economics.feeBasis === 'adyen_detailed' ? 'Adyen detail' : 'Zentact settled'} + estimated Peri)`
    : 'Fee: pending — awaiting Adyen settlement/fee evidence';
  return [
    `Payment received: ${fact.learnerName} — ${fact.productName} — $${fact.amountDollars} ${fact.currency}`,
    `Learner: ${fact.learnerName} <${fact.learnerEmail}>`,
    `Provider: Adyen · ${fact.pspReference}`,
    `Paid: ${fact.transactionDate} · Recorded: ${paymentLog.recordedDate}`,
    fee,
    `Payment Log: recorded and verified (row ${paymentLog.row}; provider Adyen)`,
    fact.rosterPolicy === 'none'
      ? 'Student Roster: not applicable — invoice payment'
      : `Student Roster: recorded and verified (${roster})`,
    ...(fact.cohort ? [`Cohort: ${fact.cohort.rosterValue}`] : []),
    'Database: recorded and verified',
  ].join('\n');
}

function formatCommerceTestSummary(envelope) {
  const providerId = envelope.refund ? envelope.refund.refundPspReference : envelope.notification.pspReference;
  return [
    `TEST ${envelope.refund ? 'refund' : 'payment'} validated — excluded from the official Bookkeeper ledger`,
    `Provider: Adyen TEST · ${providerId}`,
    `Reference: ${envelope.notification.merchantReference}`,
    'Official record: not written (Payment Log, Student Roster, PostgreSQL, Capacity)',
  ].join('\n');
}

function formatCommerceFeeSummary(envelope, paymentLog) {
  const economics = paymentLog.economics;
  return [
    `Payment fees reconciled: ${envelope.order.productName} — $${(envelope.order.amountCents / 100).toFixed(2)} ${envelope.order.currency}`,
    `Provider: Adyen · ${envelope.notification.pspReference}`,
    `Fee / net: $${economics.feeDollars} / $${economics.netDollars}`,
    `Fee basis: ${economics.feeBasis === 'adyen_detailed' ? 'Adyen detailed facts' : 'Zentact settled processing cost'} + estimated Peri`,
    `Payment Log: fee and net recorded and verified (row ${paymentLog.row})`,
    'Student Roster: unchanged',
    'Database: unchanged',
  ].join('\n');
}

function formatCommerceRefundSummary(envelope, paymentLog) {
  const refund = envelope.refund;
  if (!refund) fail('refund evidence missing');
  return [
    `Refund recorded: $${(refund.amountCents / 100).toFixed(2)} ${envelope.order.currency} — ${envelope.order.productName}`,
    `Provider: Adyen · refund ${refund.refundPspReference} · payment ${refund.paymentPspReference}`,
    `Reference: ${refund.requestReference}`,
    `Cumulative refunded: $${(refund.cumulativeRefundedCents / 100).toFixed(2)} · Remaining paid: $${(refund.remainingPaidCents / 100).toFixed(2)}`,
    `Payment Log: status ${paymentLog.status} and verified (row ${paymentLog.row}; provider Adyen)`,
    'Student Roster: unchanged by refund policy',
    'Database: refund recorded and verified',
  ].join('\n');
}

async function main() {
  const envelope = await readInput();
  if (envelope.environment === 'test') {
    const result = {
      deliveryId: envelope.deliveryId,
      provider: 'adyen',
      providerPaymentId: envelope.refund ? envelope.refund.refundPspReference : envelope.notification.pspReference,
      paymentLogVerified: false,
      studentRosterVerified: false,
      postgresVerified: false,
      officialRecordSuppressed: true,
      feeReconciliationVerified: false,
      summary: formatCommerceTestSummary(envelope),
    };
    console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
    return;
  }
  if (!PAYMENTS_ID || !ROSTER_ID || !SA_PATH || !fs.existsSync(SA_PATH)) fail('bookkeeper configuration missing');
  if (envelope.deliveryKind === 'fee_reconciliation') {
    const paymentLog = await recordPaymentFees(envelope);
    const result = {
      deliveryId: envelope.deliveryId,
      provider: 'adyen',
      providerPaymentId: envelope.notification.pspReference,
      paymentLogVerified: paymentLog.verified,
      studentRosterVerified: false,
      postgresVerified: false,
      officialRecordSuppressed: false,
      feeReconciliationVerified: true,
      summary: formatCommerceFeeSummary(envelope, paymentLog),
    };
    console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
    return;
  }
  if (envelope.refund) {
    const paymentLog = await recordRefundPaymentLog(envelope);
    const postgresVerified = recordPostgresRefund(envelope);
    const result = {
      deliveryId: envelope.deliveryId,
      provider: 'adyen',
      providerPaymentId: envelope.refund.refundPspReference,
      paymentLogVerified: paymentLog.verified,
      studentRosterVerified: true,
      postgresVerified,
      officialRecordSuppressed: false,
      feeReconciliationVerified: false,
      summary: formatCommerceRefundSummary(envelope, paymentLog),
    };
    console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
    return;
  }
  const event = new Date(envelope.notification.eventDate);
  if (!Number.isFinite(event.getTime())) fail('event date invalid');
  const format = date => `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const learner = envelope.order.learner;
  const fact = {
    pspReference: envelope.notification.pspReference,
    transactionDate: format(event), recordedDate: format(new Date()),
    learnerName: `${learner.firstName} ${learner.lastName}`.trim(), learnerEmail: learner.email.toLowerCase(),
    productName: envelope.order.productName, amountDollars: (envelope.order.amountCents / 100).toFixed(2), currency: envelope.order.currency,
    cohort: envelope.order.cohort || null, rosterPolicy: envelope.order.rosterPolicy,
    economics: commerceEconomics(envelope.order.amountCents, envelope.economics),
  };
  // Each destination is idempotent by provider payment ID. A retry repairs an
  // incomplete prior delivery and only succeeds after exact readback.
  const paymentLog = await recordPaymentLog(fact);
  const rosterDestinations = envelope.order.rosterPolicy === 'none' ? [] : await recordRoster(fact);
  const postgresVerified = recordPostgres(envelope, fact);
  const result = { deliveryId: envelope.deliveryId, provider: 'adyen', providerPaymentId: fact.pspReference, paymentLogVerified: paymentLog.verified, studentRosterVerified: envelope.order.rosterPolicy === 'none' || rosterDestinations.length > 0, postgresVerified, officialRecordSuppressed: false, feeReconciliationVerified: false, summary: formatCommerceSummary(fact, paymentLog, rosterDestinations) };
  console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
}

if (require.main === module) main().catch(error => { console.error(`[EL CONTADOR] ${error.message}`); process.exit(1); });

module.exports = { column, psqlVars, cohortRosterValue, commerceEconomics, sheetMoneyCents, refundPaymentLogStatus, finalRefundPaymentLogStatus, formatCommerceSummary, formatCommerceTestSummary, formatCommerceFeeSummary, formatCommerceRefundSummary };
