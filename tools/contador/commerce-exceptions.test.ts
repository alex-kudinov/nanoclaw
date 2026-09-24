import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';

// NC-20260924-001: authenticated deliveries are always booked; unknown content
// becomes an owner-resolved exception whose resolution is remembered.
process.env.SHEETS_PAYMENTS_ID = 'payments-sheet';
process.env.SHEETS_ROSTER_ID = 'roster-sheet';
const require = createRequire(import.meta.url);
const recorder = require('./process-commerce-payment.cjs');
const resolver = require('./resolve-commerce-exception.cjs');
const ledger = require('./lib/commerce-ledger.cjs');

type Grid = string[][];
let book: Record<string, Record<string, Grid>>;
let psqlCalls: Array<Record<string, string>>;

function colIndex(letters: string): number {
  return letters.split('').reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function parseRange(range: string) {
  const match = range.match(/^(?:'([^']+)'|([^!]+))!(.+)$/);
  if (!match) throw new Error(`bad range ${range}`);
  const tab = match[1] ?? match[2];
  const [start, end = start] = match[3].split(':');
  const cell = (ref: string) => {
    const parts = ref.match(/^([A-Z]*)(\d*)$/)!;
    return { c: parts[1] ? colIndex(parts[1]) : null, r: parts[2] ? Number(parts[2]) - 1 : null };
  };
  const a = cell(start);
  const b = cell(end);
  return { tab, c1: a.c ?? 0, r1: a.r ?? 0, c2: b.c, r2: b.r };
}

function grid(sheet: string, tab: string): Grid {
  const tabs = book[sheet];
  if (!tabs[tab]) throw Object.assign(new Error(`HTTP 400: Unable to parse range: ${tab}`), {});
  return tabs[tab];
}

function readValues(sheet: string, range: string) {
  const { tab, c1, r1, c2, r2 } = parseRange(range);
  const rows = grid(sheet, tab);
  const last = r2 ?? rows.length - 1;
  const out: string[][] = [];
  for (let r = r1; r <= last; r += 1) {
    const row = (rows[r] || []).slice(c1, c2 === null ? undefined : c2 + 1).map((v) => v ?? '');
    while (row.length && row[row.length - 1] === '') row.pop();
    out.push(row);
  }
  while (out.length && !out[out.length - 1].length) out.pop();
  return { values: out };
}

function writeValues(sheet: string, range: string, values: string[][], atRow?: number) {
  const { tab, c1, r1 } = parseRange(range);
  const rows = grid(sheet, tab);
  const top = atRow ?? r1;
  values.forEach((line, i) => {
    rows[top + i] = rows[top + i] || [];
    line.forEach((value, j) => (rows[top + i][c1 + j] = String(value)));
  });
  return top;
}

async function fakeTransport(options: { path: string; method: string }, body: string) {
  const url = new URL(`https://x${options.path}`);
  const [, , , sheet, ...rest] = url.pathname.split('/');
  const [id, action] = decodeURIComponent(sheet).split(':');
  const payload = body ? JSON.parse(body) : null;
  if (action === 'batchUpdate') {
    for (const request of payload.requests) {
      if (request.addSheet) book[id][request.addSheet.properties.title] = [];
    }
    return {};
  }
  if (!rest.length) {
    return { sheets: Object.keys(book[id]).map((title, i) => ({ properties: { title, sheetId: i + 1 } })) };
  }
  const [range, verb] = decodeURIComponent(rest.slice(1).join('/')).split(/:(append)$/);
  if (options.method === 'GET') return readValues(id, range);
  if (verb === 'append') {
    const rows = grid(id, parseRange(range).tab);
    const top = writeValues(id, range, payload.values, rows.length);
    return { updates: { updatedRange: `'x'!A${top + 1}:Z${top + payload.values.length}` } };
  }
  writeValues(id, range, payload.values);
  return {};
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    deliveryId: '10000000-0000-4000-8000-000000000001',
    sentAt: '2026-09-24T13:02:21Z',
    environment: 'live',
    deliveryKind: 'payment',
    economics: null,
    issues: [{ target: 'review', code: 'cohort_program_new', value: 'supervision' }],
    notification: {
      pspReference: 'PSP-SUPERVISION-1', merchantReference: 'TCA-939DBACF9A7B', merchantAccountCode: 'TandemECOM',
      eventCode: 'AUTHORISATION', eventDate: '2026-09-24T13:01:00Z', success: 'true',
      amount: { value: 99900, currency: 'USD' }, additionalData: {},
    },
    order: {
      orderId: '8ff1312a-bb01-4698-ae0c-1b3ade6c282b', merchantReference: 'TCA-939DBACF9A7B',
      productId: 'supervision-inaugural', productName: 'Coaching Supervision Mastery - Inaugural Cohort',
      amountCents: 99900, currency: 'USD', rosterPolicy: 'catalog',
      payer: { firstName: 'Pat', lastName: 'Payer', email: 'pat@example.test' },
      learner: { firstName: 'Pat', lastName: 'Payer', email: 'pat@example.test' },
      purchaseRelationship: 'self',
      cohort: { program: 'supervision', rosterValue: 'Wednesdays — October 7, 2026 – January 20, 2027' },
    },
    refund: null,
    ...overrides,
  };
}

beforeEach(() => {
  book = {
    'payments-sheet': { 'Payment Log': [['Date', 'Recorded', 'Name', 'Email', 'Product', 'Gross', 'Fee', 'Net', 'Currency', 'Provider Payment ID', 'Status']] },
    'roster-sheet': {
      'Product Map': [['Product', 'Tab', 'Column']],
      Supervision: [['Email', 'Name', 'Enrolled', 'Cohort']],
    },
  };
  psqlCalls = [];
  recorder.setTestDoubles({
    token: 'test-token',
    transport: fakeTransport,
    psql: (args: string[]) => {
      const values = Object.fromEntries(
        args.filter((_, i) => args[i - 1] === '-v').map((pair) => pair.split(/=(.*)/s).slice(0, 2)),
      );
      psqlCalls.push(values);
      return `${values.delivery}|${values.psp}\n`;
    },
  });
});

const paymentRows = () => book['payments-sheet']['Payment Log'].slice(1).filter((row) => row[9]);
const openRows = () => book['payments-sheet']['Bookkeeper Exceptions'].slice(1).filter((row) => row[10] === 'open');

describe('Commerce Bookkeeper accept-and-flag', () => {
  it('books an unmapped new-program payment, writes the database and flags it once', async () => {
    const result = await recorder.project(payment());
    expect(paymentRows()).toHaveLength(1);
    expect(psqlCalls).toHaveLength(1);
    expect(result).toMatchObject({ paymentLogVerified: true, studentRosterVerified: false, postgresVerified: true, exceptionsRecorded: true });
    expect(result.exceptions.map((item: any) => item.code)).toEqual(['roster_product_unmapped', 'cohort_program_new']);
    expect(result.summary).toContain('Student Roster: held — needs your decision below');
    expect(result.summary).toContain('Needs your decision (2)');

    // Commerce may re-enqueue the same payment under a new delivery ID: nothing duplicates.
    await recorder.project(payment({ deliveryId: '10000000-0000-4000-8000-000000000009' }));
    expect(paymentRows()).toHaveLength(1);
    expect(openRows()).toHaveLength(2);
  });

  it('learns roster placement and accepted variations, then books the next sale without a flag', async () => {
    await recorder.project(payment());
    const [rosterRow, reviewRow] = openRows().map((_, i) => i + 2);
    await expect(resolver.map({ row: rosterRow, tab: 'Supervision', column: 'Missing' })).rejects.toThrow(/no column/);
    expect(book['roster-sheet']['Product Map']).toHaveLength(1);

    const mapped = await resolver.map({ row: rosterRow, tab: 'Supervision', column: 'Enrolled' });
    expect(mapped).toContain('Rule saved');
    expect(book['roster-sheet'].Supervision[1]).toEqual(['pat@example.test', 'Pat Payer', '9/24/2026', 'Wednesdays — October 7, 2026 – January 20, 2027']);
    await expect(resolver.accept({ row: reviewRow, remember: true, note: 'Supervision is a normal program' })).resolves.toContain('normal from now on');
    expect(openRows()).toHaveLength(0);

    const next = await recorder.project(payment({
      deliveryId: '10000000-0000-4000-8000-000000000002',
      notification: { ...payment().notification, pspReference: 'PSP-SUPERVISION-2' },
      order: { ...payment().order, learner: { firstName: 'Sam', lastName: 'Second', email: 'sam@example.test' } },
    }));
    expect(next.exceptions).toEqual([]);
    expect(next.studentRosterVerified).toBe(true);
    expect(book['roster-sheet'].Supervision[2][0]).toBe('sam@example.test');
  });

  it('never turns person data into a standing rule and supports no-roster products', async () => {
    await recorder.project(payment({ issues: [{ target: 'review', code: 'payer_email_invalid', value: 'x@' }] }));
    const rows = openRows().map((_, i) => i + 2);
    await expect(resolver.accept({ row: rows[1], remember: true })).rejects.toThrow(/cannot become a standing rule/);
    await expect(resolver.noRoster({ row: rows[0] })).resolves.toContain('has no roster');
    const again = await recorder.project(payment({ deliveryId: '10000000-0000-4000-8000-000000000003', issues: [] }));
    expect(again.studentRosterVerified).toBe(true);
    expect(again.summary).toContain('Product Map says no roster');
  });

  it('books fees that arrive before the payment row and keeps them when the payment follows', async () => {
    const fees = payment({
      deliveryKind: 'fee_reconciliation', issues: [],
      economics: { feeBasis: 'adyen_detailed', providerFeeCents: 3000, periFeeCents: 500 },
      order: { ...payment().order, cohort: null },
    });
    const feeResult = await recorder.project(fees);
    expect(feeResult).toMatchObject({ paymentLogVerified: true, feeReconciliationVerified: true, exceptions: [] });
    expect(paymentRows()[0].slice(5, 8)).toEqual(['999.00', '35.00', '964.00']);
    book['roster-sheet']['Product Map'].push(['Coaching Supervision Mastery - Inaugural Cohort', 'Supervision', 'Enrolled']);
    await recorder.project(payment({ issues: [] }));
    expect(paymentRows()).toHaveLength(1);
    expect(paymentRows()[0].slice(6, 8)).toEqual(['35.00', '964.00']);
  });

  it('holds fees against a changed Payment Log row instead of retrying forever', async () => {
    book['roster-sheet']['Product Map'].push(['Coaching Supervision Mastery - Inaugural Cohort', '(none)', '']);
    await recorder.project(payment({ issues: [] }));
    book['payments-sheet']['Payment Log'][1][5] = '1.00';
    const result = await recorder.project(payment({
      deliveryKind: 'fee_reconciliation', issues: [],
      economics: { feeBasis: 'adyen_detailed', providerFeeCents: 3000, periFeeCents: 500 },
    }));
    expect(result).toMatchObject({ paymentLogVerified: false, feeReconciliationVerified: false, exceptionsRecorded: true });
    expect(result.exceptions).toEqual([{ target: 'fees', code: 'fee_payment_row_mismatch', value: 'PSP-SUPERVISION-1' }]);
    expect(ledger.describeException(result.exceptions[0])).toContain('no longer matches the order');
  });
});
