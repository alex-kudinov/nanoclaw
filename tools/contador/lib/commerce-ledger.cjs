'use strict';

// Commerce Bookkeeper exception ledger and learned rules (NC-20260924-001).
//
// An authenticated Commerce delivery is always booked. Anything the recorder
// cannot place or did not expect becomes an open row in the private payments
// spreadsheet's "Bookkeeper Exceptions" tab and is flagged in Contador's Slack
// channel. The owner answers there; Contador applies the answer with
// resolve-commerce-exception.cjs, which stores it as a rule:
//   - roster placement → a Product Map row (tab "(none)" = no roster), and
//   - an accepted variation → a "Bookkeeper Rules" row (code + value),
// so the next delivery of the same kind is placed or accepted without a flag.
//
// Every write here uses RAW input so data can never become a formula.

const EXCEPTIONS_TAB = 'Bookkeeper Exceptions';
const RULES_TAB = 'Bookkeeper Rules';
const NO_ROSTER = '(none)';
const EXCEPTION_HEADERS = [
  'Opened (UTC)', 'Delivery ID', 'Kind', 'PSP Reference', 'Order Reference', 'Product ID',
  'Product Name', 'Target', 'Code', 'Value', 'Status', 'Resolved (UTC)', 'Resolution', 'Replay',
];
const RULE_HEADERS = ['Code', 'Value', 'Note', 'Added (UTC)'];
// Only variations that carry no person data may become standing rules.
const REMEMBERABLE = new Set([
  'cohort_program_new', 'cohort_schedule_unexpected', 'currency_new', 'product_id_unexpected',
  'purchase_relationship_new', 'additional_data_missing',
]);

/** Content the recorder cannot apply without an owner decision (never a transient failure). */
class LedgerHold extends Error {
  constructor(target, code, value) {
    super(`${target}:${code}`);
    this.name = 'LedgerHold';
    this.target = target;
    this.code = code;
    this.value = String(value ?? '').slice(0, 200);
  }
}

const QUESTIONS = {
  roster_product_unmapped: v => `No roster mapping for "${v}". Which roster tab and column should it use, or no roster?`,
  roster_tab_missing: v => `Roster tab "${v}" named in the Product Map does not exist. Which tab should this product use?`,
  roster_column_missing: v => `Roster column ${v} does not exist. Which column should this product use?`,
  roster_cohort_column_missing: v => `Roster tab "${v}" has no Cohort column. Add one, or say where the cohort goes.`,
  learner_email_invalid: v => `Student email "${v}" can't be used for the roster. What is the student's email?`,
  cohort_unreadable: v => `The cohort for ${v} could not be read. What cohort should the roster show?`,
  cohort_roster_value_unexpected: v => `Cohort value ${v} is not the usual format. Record it as is, or which value?`,
  roster_policy_new: v => `Unknown roster policy "${v}". Should this purchase go on the roster?`,
  roster_policy_cohort_conflict: v => `An invoice-only payment carried a ${v} cohort. Should it go on the roster?`,
  cohort_program_new: v => `New cohort program "${v}". Recorded normally; treat it as normal from now on?`,
  cohort_schedule_unexpected: v => `The ${v} cohort schedule has unusual dates. Recorded; OK?`,
  cohort_shape_unexpected: v => `The ${v} cohort details (module, key or session count) are unusual. Recorded; please check the enrollment.`,
  currency_new: v => `Payment in ${v}, not USD. Recorded as is; OK from now on?`,
  product_id_unexpected: v => `Unusual product ID "${v}". Recorded; OK from now on?`,
  product_name_adjusted: v => `Product name was cleaned up to "${v}". Recorded; OK?`,
  purchase_relationship_new: v => `Unknown buyer relationship "${v}". Recorded; OK from now on?`,
  event_date_unreadable: v => `Payment date "${v}" was unreadable; the delivery time was used. OK?`,
  additional_data_missing: () => 'The provider notification had no extra data. Recorded; OK?',
  payer_email_invalid: v => `Payer email "${v}" looks wrong. Recorded; OK?`,
  payer_name_missing: v => `Payer ${v} has no name. Recorded; OK?`,
  learner_name_missing: v => `Student ${v} has no name. Recorded; OK?`,
  database_conflict: v => `The database already holds payment ${v} with different order details. Needs review.`,
  fee_payment_row_missing: v => `Fees for ${v} arrived before its payment row. They apply automatically once the payment is recorded.`,
  fee_payment_row_duplicate: v => `Payment ${v} appears more than once in the Payment Log. Fees held until one row remains.`,
  fee_payment_row_mismatch: v => `The Payment Log row for ${v} no longer matches the order (amount, currency or status). Fees held.`,
  refund_payment_row_missing: v => `Refund arrived but original payment ${v} is not in the Payment Log. Needs review.`,
  refund_database_unmatched: v => `Refund for payment ${v} does not match the database payment. Needs review.`,
};

function describeException(exception) {
  const question = QUESTIONS[exception.code];
  return question ? question(exception.value) : `${exception.code}: ${exception.value}`;
}

// Keyed by provider payment reference: Commerce may re-enqueue one payment under new delivery IDs.
function exceptionKey(pspReference, target, code, value) {
  return [pspReference, target, code, value].map(item => String(item ?? '')).join('\u0000');
}

async function ensureTabs(client, sheetId, tabs) {
  const titles = await client.tabTitles(sheetId);
  const missing = Object.keys(tabs).filter(title => !titles.includes(title));
  if (missing.length) await client.addTabs(sheetId, missing);
  for (const [title, headers] of Object.entries(tabs)) {
    const row = (await client.get(sheetId, `'${title}'!1:1`)).values?.[0] || [];
    if (!row.length) await client.updateRaw(sheetId, `'${title}'!A1`, [headers]);
    else if (headers.some((header, index) => row[index] !== header)) throw new Error(`${title} header conflict`);
  }
}

async function readRows(client, sheetId, title, range) {
  if (!(await client.tabTitles(sheetId)).includes(title)) return [];
  return (await client.get(sheetId, `'${title}'!${range}`)).values || [];
}

async function acceptedVariations(client, sheetId) {
  const rows = await readRows(client, sheetId, RULES_TAB, 'A2:B');
  return new Set(rows.map(row => exceptionKey('', '', String(row[0] || '').trim(), String(row[1] || '').trim())));
}

/** Review-only issues the owner has not already accepted as normal. */
async function unacceptedReviewIssues(client, sheetId, issues) {
  const review = issues.filter(issue => issue.target === 'review');
  if (!review.length) return [];
  const accepted = await acceptedVariations(client, sheetId);
  return review
    .filter(issue => !accepted.has(exceptionKey('', '', issue.code, issue.value)))
    .map(issue => ({ target: 'review', code: issue.code, value: issue.value }));
}

function parseExceptionRow(row, index) {
  let replay = null;
  try { replay = row[13] ? JSON.parse(row[13]) : null; } catch { replay = null; }
  return {
    row: index + 2, deliveryId: row[1] || '', kind: row[2] || '', pspReference: row[3] || '',
    orderReference: row[4] || '', productId: row[5] || '', productName: row[6] || '',
    target: row[7] || '', code: row[8] || '', value: row[9] || '', status: row[10] || '', replay,
  };
}

async function exceptionRows(client, sheetId) {
  return (await readRows(client, sheetId, EXCEPTIONS_TAB, 'A2:N')).map(parseExceptionRow);
}

async function openExceptions(client, sheetId, filter = {}) {
  return (await exceptionRows(client, sheetId)).filter(item => item.status === 'open' &&
    Object.entries(filter).every(([field, expected]) => item[field] === expected));
}

/** Appends each exception once per (delivery, target, code, value) and proves it by readback. */
async function recordExceptions(client, sheetId, envelope, exceptions, replay = {}) {
  if (!exceptions.length) return false;
  await ensureTabs(client, sheetId, { [EXCEPTIONS_TAB]: EXCEPTION_HEADERS, [RULES_TAB]: RULE_HEADERS });
  const psp = envelope.notification?.pspReference || '';
  const keyOf = item => exceptionKey(item.pspReference, item.target, item.code, item.value);
  const wanted = item => exceptionKey(psp, item.target, item.code, item.value);
  const existing = new Set((await exceptionRows(client, sheetId)).map(keyOf));
  const openedAt = new Date().toISOString();
  const rows = exceptions
    .filter(item => !existing.has(wanted(item)))
    .map(item => [openedAt, envelope.deliveryId, envelope.deliveryKind, psp, envelope.order?.merchantReference || '',
      envelope.order?.productId || '', envelope.order?.productName || '', item.target, item.code, item.value, 'open', '', '',
      JSON.stringify(replay[item.target] ?? null)]);
  if (rows.length) await client.appendRaw(sheetId, `'${EXCEPTIONS_TAB}'!A:N`, rows);
  const after = new Set((await exceptionRows(client, sheetId)).map(keyOf));
  return exceptions.every(item => after.has(wanted(item)));
}

async function resolveException(client, sheetId, exception, resolution) {
  const cells = `'${EXCEPTIONS_TAB}'!K${exception.row}:M${exception.row}`;
  await client.updateRaw(sheetId, cells, [['resolved', new Date().toISOString(), String(resolution).slice(0, 500)]]);
  const after = (await client.get(sheetId, cells)).values?.[0] || [];
  if (after[0] !== 'resolved') throw new Error('exception resolution readback mismatch');
}

/** Adds a Product Map rule only for an existing roster tab and header (or "(none)"). */
async function addProductMapping(client, rosterId, productName, tab, column) {
  if (tab !== NO_ROSTER) {
    if (!(await client.tabTitles(rosterId)).includes(tab)) throw new Error(`roster tab "${tab}" does not exist`);
    const headers = (await client.get(rosterId, `'${tab}'!1:1`)).values?.[0] || [];
    if (!column || !headers.includes(column)) throw new Error(`roster tab "${tab}" has no column "${column}"`);
  }
  const rows = (await client.get(rosterId, 'Product Map!A:C')).values || [];
  const same = rows.filter(row => String(row[0] || '').trim() === productName);
  if (same.some(row => row[1] === tab && (row[2] || '') === column)) return false;
  if (tab === NO_ROSTER ? same.length > 0 : same.some(row => row[1] === NO_ROSTER)) {
    throw new Error(`Product Map already has a different rule for "${productName}"; edit it by hand`);
  }
  await client.appendRaw(rosterId, 'Product Map!A:C', [[productName, tab, column]]);
  return true;
}

async function addAcceptedVariation(client, sheetId, code, value, note) {
  if (!REMEMBERABLE.has(code)) throw new Error(`"${code}" involves person or money data and cannot become a standing rule`);
  await ensureTabs(client, sheetId, { [EXCEPTIONS_TAB]: EXCEPTION_HEADERS, [RULES_TAB]: RULE_HEADERS });
  if ((await acceptedVariations(client, sheetId)).has(exceptionKey('', '', code, value))) return false;
  await client.appendRaw(sheetId, `'${RULES_TAB}'!A:D`, [[code, value, String(note || '').slice(0, 300), new Date().toISOString()]]);
  return true;
}

function formatExceptionBlock(exceptions, deliveryId) {
  if (!exceptions.length) return [];
  return [
    `Needs your decision (${exceptions.length}). Reply here; Contador applies it and remembers it:`,
    ...exceptions.map((item, index) => `${index + 1}. ${describeException(item)}`),
    `Reference: delivery ${deliveryId}`,
  ];
}

module.exports = {
  EXCEPTIONS_TAB, RULES_TAB, NO_ROSTER, EXCEPTION_HEADERS, RULE_HEADERS, REMEMBERABLE, LedgerHold,
  describeException, ensureTabs, acceptedVariations, unacceptedReviewIssues, openExceptions,
  recordExceptions, resolveException, addProductMapping, addAcceptedVariation, formatExceptionBlock,
};
