#!/usr/bin/env node
'use strict';

// Applies the owner's Slack answer to an open Commerce Bookkeeper exception
// (NC-20260924-001) and stores it as a rule, so the next delivery of the same
// kind needs no decision. Sheets only: no Commerce, WordPress or PostgreSQL writes.
//
//   list
//   map <row> --tab "<roster tab>" --column "<roster column>" [--note "..."]
//   no-roster <row> [--note "..."]
//   retry <row> [--note "..."]
//   accept <row> [--remember] [--note "..."]
//
// <row> is the exception's row number in the "Bookkeeper Exceptions" tab (see `list`).

const recorder = require('./process-commerce-payment.cjs');
const ledger = require('./lib/commerce-ledger.cjs');

const { client, PAYMENTS_ID, ROSTER_ID } = recorder;
const UNRETRYABLE_ROSTER = new Set(['learner_email_invalid', 'cohort_unreadable']);

function parseArgs(argv) {
  const [command, row, ...rest] = argv;
  const options = { command, row: Number(row), remember: false };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--remember') options.remember = true;
    else if (['--tab', '--column', '--note'].includes(rest[i])) options[rest[i].slice(2)] = String(rest[++i] ?? '').trim();
    else throw new Error(`unknown option ${rest[i]}`);
  }
  return options;
}

async function openRow(rowNumber, target) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('give the exception row number from `list`');
  const item = (await ledger.openExceptions(client, PAYMENTS_ID)).find(entry => entry.row === rowNumber);
  if (!item) throw new Error(`row ${rowNumber} is not an open exception`);
  if (target && item.target !== target) throw new Error(`row ${rowNumber} is a ${item.target} exception, not ${target}`);
  return item;
}

async function placeFromReplay(item) {
  const replay = item.replay;
  if (!replay || !replay.learnerEmail) throw new Error(`row ${item.row} has no placement inputs; place it by hand`);
  const placement = await recorder.recordRoster({ ...replay, cohort: replay.cohort || null });
  if (placement.notApplicable) return 'no roster (Product Map)';
  return placement.destinations.map(d => `${d.tab} → ${d.column} row ${d.row}${d.cohort ? ` (cohort ${d.cohort})` : ''}`).join('; ');
}

async function resolveWith(item, text, note) {
  await ledger.resolveException(client, PAYMENTS_ID, item, note ? `${text} — ${note}` : text);
  return `Resolved row ${item.row} (${item.productName}): ${text}`;
}

async function list() {
  const open = await ledger.openExceptions(client, PAYMENTS_ID);
  if (!open.length) return 'No open Bookkeeper exceptions.';
  return open.map(item => `Row ${item.row} · ${item.orderReference} · ${item.productName} · ${item.target}: ${ledger.describeException(item)}`).join('\n');
}

/** Stores the Product Map rule, then places every open sale of that product. */
async function map(options) {
  const item = await openRow(options.row, 'roster');
  if (item.code !== 'roster_product_unmapped') throw new Error(`row ${item.row} is ${item.code}; fix the roster sheet, then use retry`);
  if (!options.tab || !options.column) throw new Error('map needs --tab and --column');
  await ledger.addProductMapping(client, ROSTER_ID, item.productName, options.tab, options.column);
  const peers = (await ledger.openExceptions(client, PAYMENTS_ID, { target: 'roster', code: item.code }))
    .filter(entry => entry.productName === item.productName);
  const lines = [`Rule saved: "${item.productName}" → ${options.tab} / ${options.column}`];
  for (const peer of peers) lines.push(await resolveWith(peer, `roster ${await placeFromReplay(peer)}`, options.note));
  return lines.join('\n');
}

async function noRoster(options) {
  const item = await openRow(options.row, 'roster');
  if (item.code !== 'roster_product_unmapped') throw new Error(`row ${item.row} is ${item.code}, not an unmapped product`);
  await ledger.addProductMapping(client, ROSTER_ID, item.productName, ledger.NO_ROSTER, '');
  const peers = (await ledger.openExceptions(client, PAYMENTS_ID, { target: 'roster', code: item.code }))
    .filter(entry => entry.productName === item.productName);
  const lines = [`Rule saved: "${item.productName}" has no roster`];
  for (const peer of peers) lines.push(await resolveWith(peer, 'no roster (Product Map)', options.note));
  return lines.join('\n');
}

async function retry(options) {
  const item = await openRow(options.row);
  if (item.target === 'roster') {
    if (UNRETRYABLE_ROSTER.has(item.code)) throw new Error(`row ${item.row} (${item.code}) needs a corrected value; place it by hand`);
    return resolveWith(item, `roster ${await placeFromReplay(item)}`, options.note);
  }
  if (item.target === 'fees') {
    const replay = item.replay || {};
    const applied = await recorder.recordPaymentFees({
      notification: { pspReference: replay.pspReference }, order: { amountCents: replay.amountCents, currency: replay.currency },
      economics: replay.economics,
    });
    return resolveWith(item, `fees applied to Payment Log row ${applied.row}`, options.note);
  }
  throw new Error(`row ${item.row} is a ${item.target} exception; use accept after reviewing it`);
}

async function accept(options) {
  const item = await openRow(options.row);
  if (item.target === 'roster' || item.target === 'fees') throw new Error(`row ${item.row} needs map, no-roster or retry`);
  const lines = [];
  let peers = [item];
  if (options.remember) {
    await ledger.addAcceptedVariation(client, PAYMENTS_ID, item.code, item.value, options.note);
    lines.push(`Rule saved: ${item.code} "${item.value}" is normal from now on`);
    peers = (await ledger.openExceptions(client, PAYMENTS_ID, { target: 'review', code: item.code }))
      .filter(entry => entry.value === item.value);
  }
  for (const peer of peers) lines.push(await resolveWith(peer, 'reviewed and accepted', options.note));
  return lines.join('\n');
}

async function main() {
  if (!PAYMENTS_ID || !ROSTER_ID) throw new Error('Bookkeeper sheets are not configured in this environment');
  const options = parseArgs(process.argv.slice(2));
  const commands = { list, map, 'no-roster': noRoster, retry, accept };
  const run = commands[options.command];
  if (!run) throw new Error('usage: list | map <row> --tab T --column C | no-roster <row> | retry <row> | accept <row> [--remember]');
  console.log(await run(options));
}

if (require.main === module) main().catch(error => { console.error(`[EL CONTADOR] ${error.message}`); process.exit(1); });

module.exports = { parseArgs, list, map, noRoster, retry, accept };
