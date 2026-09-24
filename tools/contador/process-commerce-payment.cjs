#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const ledger = require('./lib/commerce-ledger.cjs');

const HTTP_TIMEOUT_MS = 20000;
const PAYMENTS_ID = process.env.SHEETS_PAYMENTS_ID;
const ROSTER_ID = process.env.SHEETS_ROSTER_ID;
// The host passes an explicit path; Contador's container mounts the same key here.
const SA_PATH = process.env.SHEETS_SA_JSON || '/workspace/extra/service-accounts/sheets-service-account.json';
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
// Replaceable only by tests; production always uses https + psql.
let transport = request;
let psqlRunner = (args, input) => execFileSync('psql', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

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

async function spreadsheet(sheetId, method, suffix, body = null) {
  const encoded = body === null ? '' : JSON.stringify(body);
  return transport({ hostname: 'sheets.googleapis.com', path: `/v4/spreadsheets/${sheetId}${suffix}`, method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(encoded ? { 'Content-Length': Buffer.byteLength(encoded) } : {}) } }, encoded);
}
const sheets = (sheetId, method, path, body = null) => spreadsheet(sheetId, method, `/${path}`, body);
const get = (id, range) => sheets(id, 'GET', `values/${encodeURIComponent(range)}`);
const update = (id, range, values) => sheets(id, 'PUT', `values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { values });
const append = (id, range, values) => sheets(id, 'POST', `values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values });
const updateRaw = (id, range, values) => sheets(id, 'PUT', `values/${encodeURIComponent(range)}?valueInputOption=RAW`, { values });
const appendRaw = (id, range, values) => sheets(id, 'POST', `values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values });
const client = {
  get, updateRaw, appendRaw,
  tabTitles: async id => ((await spreadsheet(id, 'GET', '?fields=sheets.properties.title')).sheets || []).map(item => item.properties?.title),
  addTabs: (id, titles) => spreadsheet(id, 'POST', ':batchUpdate', { requests: titles.map(title => ({ addSheet: { properties: { title } } })) }),
};

async function extendPaymentLogFilter(sheetRow) {
  const meta = await spreadsheet(PAYMENTS_ID, 'GET', '?fields=sheets.properties,sheets.basicFilter');
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
  await spreadsheet(PAYMENTS_ID, 'POST', ':batchUpdate', { requests: [{ setBasicFilter: { filter: { ...(tab.basicFilter || {}), range } } }] });
}

function column(index) {
  let result = '';
  for (let value = index; value >= 0; value = Math.floor(value / 26) - 1) result = String.fromCharCode(65 + value % 26) + result;
  return result;
}

function psqlVars(values) {
  return Object.entries(values).flatMap(([key, value]) => ['-v', `${key}=${value ?? ''}`]);
}

function runPsql(values, sql) {
  return psqlRunner([...psqlVars(values), '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', '-'], sql);
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

/** Payment Log / roster facts from a verified delivery (payment or fee reconciliation). */
function buildFact(envelope) {
  const event = new Date(envelope.notification.eventDate);
  if (!Number.isFinite(event.getTime())) fail('event date invalid');
  const format = date => `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const learner = envelope.order.learner || {};
  return {
    pspReference: envelope.notification.pspReference,
    transactionDate: format(event), recordedDate: format(new Date()),
    learnerName: `${learner.firstName || ''} ${learner.lastName || ''}`.trim(), learnerEmail: String(learner.email || '').toLowerCase(),
    productName: envelope.order.productName, amountDollars: (envelope.order.amountCents / 100).toFixed(2), currency: envelope.order.currency,
    cohort: envelope.order.cohort || null, rosterPolicy: envelope.order.rosterPolicy,
    economics: commerceEconomics(envelope.order.amountCents, envelope.economics),
  };
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
  if (matches.length === 0) {
    // Fees arrived first: the signed fee delivery carries the verified payment, so book it with fees.
    const written = await recordPaymentLog(buildFact(envelope));
    return { verified: true, row: written.row, economics };
  }
  if (matches.length !== 1) fail('payment log fee row unavailable');
  const sheetRow = matches[0].index + 1;
  const before = (await get(PAYMENTS_ID, `Payment Log!F${sheetRow}:K${sheetRow}`)).values?.[0] || [];
  const provider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
  const grossText = String(before[0] ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  const grossCents = /^\d+(?:\.\d{1,2})?$/.test(grossText) ? sheetMoneyCents(grossText) : -1;
  const currency = String(before[3] || '');
  const psp = String(before[4] || '');
  const status = String(before[5] || '').toLowerCase();
  if (grossCents !== envelope.order.amountCents || currency !== envelope.order.currency ||
      psp !== envelope.notification.pspReference || !['paid','partially refunded','refunded'].includes(status) || provider !== 'Adyen') {
    throw new ledger.LedgerHold('fees', 'fee_payment_row_mismatch', envelope.notification.pspReference);
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
  if (matches.length === 0) throw new ledger.LedgerHold('payment_log', 'refund_payment_row_missing', refund.paymentPspReference);
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

/**
 * Product Map is the roster rule store. A product with no row, a missing tab or
 * a missing column is a LedgerHold for the owner, never a guessed placement.
 * A Product Map tab of "(none)" means the product has no roster.
 */
async function recordRoster(fact) {
  const productRows = ((await get(ROSTER_ID, 'Product Map!A:C')).values || [])
    .filter(row => String(row[0] || '').trim() === fact.productName && row[1] && (row[2] || row[1] === ledger.NO_ROSTER));
  if (!productRows.length) throw new ledger.LedgerHold('roster', 'roster_product_unmapped', fact.productName);
  const mappings = productRows.filter(row => String(row[1]) !== ledger.NO_ROSTER);
  if (!mappings.length) return { destinations: [], notApplicable: true };
  const tabs = await client.tabTitles(ROSTER_ID);
  const destinations = [];
  for (const mapping of mappings) {
    const tab = String(mapping[1]);
    const target = String(mapping[2]);
    if (!tabs.includes(tab)) throw new ledger.LedgerHold('roster', 'roster_tab_missing', tab);
    const headers = (await get(ROSTER_ID, `'${tab}'!1:1`)).values?.[0] || [];
    const targetIndex = headers.findIndex(value => value === target);
    if (targetIndex < 0) throw new ledger.LedgerHold('roster', 'roster_column_missing', `${tab}/${target}`);
    const cohortIndex = headers.findIndex(value => value === 'Cohort');
    if (fact.cohort && cohortIndex < 0) throw new ledger.LedgerHold('roster', 'roster_cohort_column_missing', tab);
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
  return { destinations, notApplicable: false };
}

/** Places the roster unless the receiver or Product Map needs an owner decision first. */
async function placeRoster(fact, issues, exceptions) {
  if (fact.rosterPolicy === 'none') return { destinations: [], notApplicable: true };
  const held = issues.filter(issue => issue.target === 'roster');
  if (held.length) {
    exceptions.push(...held.map(({ code, value }) => ({ target: 'roster', code, value })));
    return { destinations: [], notApplicable: false };
  }
  try {
    return await recordRoster(fact);
  } catch (error) {
    if (!(error instanceof ledger.LedgerHold)) throw error;
    exceptions.push({ target: error.target, code: error.code, value: error.value });
    return { destinations: [], notApplicable: false };
  }
}

function rosterReplay(fact) {
  return {
    learnerName: fact.learnerName, learnerEmail: fact.learnerEmail, transactionDate: fact.transactionDate,
    productName: fact.productName, cohort: fact.cohort ? { rosterValue: fact.cohort.rosterValue } : null,
  };
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
  const output = runPsql(values, sql);
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
  const output = runPsql(values, sql);
  return output.split('\n').some(line => line.trim() === `${envelope.deliveryId}|${refund.refundPspReference}`);
}

function formatCommerceSummary(fact, paymentLog, roster, exceptions = [], deliveryId = '') {
  const placement = Array.isArray(roster) ? { destinations: roster, notApplicable: false } : roster;
  const destinations = placement.destinations.map(destination => `${destination.tab} → ${destination.column} (row ${destination.row})`).join('; ');
  const fee = fact.economics
    ? `Fee / net: $${fact.economics.feeDollars} / $${fact.economics.netDollars} (${fact.economics.feeBasis === 'adyen_detailed' ? 'Adyen detail' : 'Zentact settled'} + estimated Peri)`
    : 'Fee: pending — awaiting Adyen settlement/fee evidence';
  const rosterLine = fact.rosterPolicy === 'none'
    ? 'Student Roster: not applicable — invoice payment'
    : placement.notApplicable
      ? 'Student Roster: not applicable — Product Map says no roster'
      : exceptions.some(item => item.target === 'roster')
        ? 'Student Roster: held — needs your decision below'
        : `Student Roster: recorded and verified (${destinations})`;
  return [
    `Payment received: ${fact.learnerName} — ${fact.productName} — $${fact.amountDollars} ${fact.currency}`,
    `Learner: ${fact.learnerName} <${fact.learnerEmail}>`,
    `Provider: Adyen · ${fact.pspReference}`,
    `Paid: ${fact.transactionDate} · Recorded: ${paymentLog.recordedDate}`,
    fee,
    `Payment Log: recorded and verified (row ${paymentLog.row}; provider Adyen)`,
    rosterLine,
    ...(fact.cohort ? [`Cohort: ${fact.cohort.rosterValue}`] : []),
    exceptions.some(item => item.target === 'postgres') ? 'Database: held — needs review below' : 'Database: recorded and verified',
    ...ledger.formatExceptionBlock(exceptions, deliveryId),
  ].join('\n');
}

function formatCommerceTestSummary(envelope) {
  const providerId = envelope.refund ? envelope.refund.refundPspReference : envelope.notification.pspReference;
  return [
    `TEST ${envelope.refund ? 'refund' : 'payment'} validated — excluded from the official Bookkeeper ledger`,
    `Provider: Adyen TEST · ${providerId}`,
    `Reference: ${envelope.notification.merchantReference}`,
    'Official record: not written (Payment Log, Student Roster, PostgreSQL, Capacity)',
    ...(Array.isArray(envelope.issues) ? envelope.issues : []).map(issue => `Would flag: ${ledger.describeException(issue)}`),
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

function formatCommerceFeeHeldSummary(envelope, exceptions) {
  return [
    `Payment fees held: ${envelope.order.productName} — $${(envelope.order.amountCents / 100).toFixed(2)} ${envelope.order.currency}`,
    `Provider: Adyen · ${envelope.notification.pspReference}`,
    'Payment Log: fee and net not written',
    ...ledger.formatExceptionBlock(exceptions, envelope.deliveryId),
  ].join('\n');
}

function formatCommerceRefundSummary(envelope, paymentLog, exceptions = []) {
  const refund = envelope.refund;
  if (!refund) fail('refund evidence missing');
  return [
    `Refund recorded: $${(refund.amountCents / 100).toFixed(2)} ${envelope.order.currency} — ${envelope.order.productName}`,
    `Provider: Adyen · refund ${refund.refundPspReference} · payment ${refund.paymentPspReference}`,
    `Reference: ${refund.requestReference}`,
    `Cumulative refunded: $${(refund.cumulativeRefundedCents / 100).toFixed(2)} · Remaining paid: $${(refund.remainingPaidCents / 100).toFixed(2)}`,
    paymentLog ? `Payment Log: status ${paymentLog.status} and verified (row ${paymentLog.row}; provider Adyen)` : 'Payment Log: held — needs review below',
    'Student Roster: unchanged by refund policy',
    exceptions.some(item => item.target === 'postgres') ? 'Database: held — needs review below' : 'Database: refund recorded and verified',
    ...ledger.formatExceptionBlock(exceptions, envelope.deliveryId),
  ].join('\n');
}

function holdOrThrow(error, exceptions) {
  if (!(error instanceof ledger.LedgerHold)) throw error;
  exceptions.push({ target: error.target, code: error.code, value: error.value });
}

function baseResult(envelope, providerPaymentId) {
  return { deliveryId: envelope.deliveryId, provider: 'adyen', providerPaymentId, officialRecordSuppressed: false };
}

async function projectFees(envelope) {
  const exceptions = [];
  let paymentLog = null;
  try { paymentLog = await recordPaymentFees(envelope); } catch (error) { holdOrThrow(error, exceptions); }
  const replay = { fees: { pspReference: envelope.notification.pspReference, amountCents: envelope.order.amountCents, currency: envelope.order.currency, economics: envelope.economics } };
  const exceptionsRecorded = await ledger.recordExceptions(client, PAYMENTS_ID, envelope, exceptions, replay);
  return {
    ...baseResult(envelope, envelope.notification.pspReference),
    paymentLogVerified: Boolean(paymentLog), studentRosterVerified: false, postgresVerified: false,
    feeReconciliationVerified: Boolean(paymentLog), exceptions, exceptionsRecorded,
    summary: paymentLog ? formatCommerceFeeSummary(envelope, paymentLog) : formatCommerceFeeHeldSummary(envelope, exceptions),
  };
}

async function projectRefund(envelope) {
  const exceptions = [];
  let paymentLog = null;
  try { paymentLog = await recordRefundPaymentLog(envelope); } catch (error) { holdOrThrow(error, exceptions); }
  const postgresVerified = recordPostgresRefund(envelope);
  if (!postgresVerified) exceptions.push({ target: 'postgres', code: 'refund_database_unmatched', value: envelope.refund.paymentPspReference });
  const exceptionsRecorded = await ledger.recordExceptions(client, PAYMENTS_ID, envelope, exceptions);
  return {
    ...baseResult(envelope, envelope.refund.refundPspReference),
    paymentLogVerified: Boolean(paymentLog), studentRosterVerified: true, postgresVerified,
    feeReconciliationVerified: false, exceptions, exceptionsRecorded,
    summary: formatCommerceRefundSummary(envelope, paymentLog, exceptions),
  };
}

// Write order (NC-20260924-001): Payment Log → roster attempt → PostgreSQL → exception rows.
// A held roster never skips PostgreSQL; the receiver posts Slack only after this returns.
async function projectPayment(envelope) {
  const issues = Array.isArray(envelope.issues) ? envelope.issues : [];
  const fact = buildFact(envelope);
  const exceptions = [];
  const paymentLog = await recordPaymentLog(fact);
  const roster = await placeRoster(fact, issues, exceptions);
  const postgresVerified = recordPostgres(envelope, fact);
  if (!postgresVerified) exceptions.push({ target: 'postgres', code: 'database_conflict', value: fact.pspReference });
  exceptions.push(...await ledger.unacceptedReviewIssues(client, PAYMENTS_ID, issues));
  const exceptionsRecorded = await ledger.recordExceptions(client, PAYMENTS_ID, envelope, exceptions, { roster: rosterReplay(fact) });
  return {
    ...baseResult(envelope, fact.pspReference),
    paymentLogVerified: paymentLog.verified,
    studentRosterVerified: roster.notApplicable || roster.destinations.length > 0,
    postgresVerified, feeReconciliationVerified: false, exceptions, exceptionsRecorded,
    summary: formatCommerceSummary(fact, paymentLog, roster, exceptions, envelope.deliveryId),
  };
}

async function project(envelope) {
  if (envelope.environment === 'test') {
    return {
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
  }
  if (!PAYMENTS_ID || !ROSTER_ID || !SA_PATH || (!accessToken && !fs.existsSync(SA_PATH))) fail('bookkeeper configuration missing');
  if (envelope.deliveryKind === 'fee_reconciliation') return projectFees(envelope);
  if (envelope.refund) return projectRefund(envelope);
  return projectPayment(envelope);
}

async function main() {
  const result = await project(await readInput());
  console.log(`__COMMERCE_BOOKKEEPER__${Buffer.from(JSON.stringify(result)).toString('base64url')}`);
}

if (require.main === module) main().catch(error => { console.error(`[EL CONTADOR] ${error.message}`); process.exit(1); });

module.exports = {
  column, psqlVars, cohortRosterValue, commerceEconomics, sheetMoneyCents, refundPaymentLogStatus, finalRefundPaymentLogStatus,
  formatCommerceSummary, formatCommerceTestSummary, formatCommerceFeeSummary, formatCommerceRefundSummary,
  client, buildFact, recordRoster, recordPaymentFees, project, PAYMENTS_ID, ROSTER_ID,
  setTestDoubles({ transport: nextTransport, psql, token: nextToken } = {}) {
    if (nextTransport) transport = nextTransport;
    if (psql) psqlRunner = psql;
    if (nextToken) accessToken = nextToken;
  },
};
