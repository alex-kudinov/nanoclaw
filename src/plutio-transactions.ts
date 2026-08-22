/**
 * Content-minimized Plutio payment reader for the Company OS follow-up shadow.
 *
 * Reads only paid inbound transactions bound to the exact invoice document
 * IDs under review. The caller receives numeric reconciliation evidence, not
 * transaction titles, client data, payment metadata, or arbitrary source JSON.
 */

import { callPlutioTool, stripToJson } from './plutio-cli.js';

export interface InvoicePaymentEvidence {
  invoiceId: string;
  paidAmount: number;
  currencies: string[];
  currencyEvidenceComplete: boolean;
  paidTransactionCount: number;
}

interface PaidTransaction {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string | null;
}

const BATCH_SIZE = 100;
const PAGE_SIZE = 200;
const MAX_PAGES_PER_BATCH = 10;

function asArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: unknown[] }).data;
  }
  throw new Error('Plutio transaction source did not return an array');
}

function idFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { _id?: unknown })._id === 'string'
  ) {
    return (value as { _id: string })._id;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currencyFrom(value: unknown): string | null {
  const code =
    typeof value === 'string'
      ? value
      : value &&
          typeof value === 'object' &&
          typeof (value as { code?: unknown }).code === 'string'
        ? (value as { code: string }).code
        : null;
  return code?.trim().toUpperCase() || null;
}

export function parsePaidTransactions(raw: string): PaidTransaction[] {
  const json = stripToJson(raw);
  if (!json) {
    throw new Error('Plutio transaction source returned no JSON');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Plutio transaction source returned malformed JSON');
  }
  return asArray(parsed).map((value) => {
    const row = value as Record<string, unknown>;
    const id = idFrom(row._id);
    const invoiceId = idFrom(row.invoiceId);
    const amount = finiteNumber(row.amount);
    const type =
      typeof row.type === 'string' ? row.type.trim().toLowerCase() : null;
    const status =
      typeof row.status === 'string' ? row.status.trim().toLowerCase() : null;
    if (!id || !invoiceId || amount === null || amount < 0) {
      throw new Error(
        'Plutio transaction is missing exact receipt, invoice, or amount',
      );
    }
    if (type !== 'in' || status !== 'paid') {
      throw new Error('Plutio transaction did not match paid inbound filter');
    }
    return {
      id,
      invoiceId,
      amount,
      currency: currencyFrom(row.currency),
    };
  });
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Reconcile a bounded set of exact invoice IDs. An empty transaction result is
 * positive evidence of zero paid receipts only because the filtered read
 * completed; source failures throw and keep every affected case blocked.
 */
export async function listInvoicePaymentEvidence(
  invoiceIds: string[],
  deps?: {
    callTool?: typeof callPlutioTool;
  },
): Promise<Map<string, InvoicePaymentEvidence>> {
  const uniqueIds = [...new Set(invoiceIds.filter(Boolean))];
  const evidence = new Map<string, InvoicePaymentEvidence>(
    uniqueIds.map((invoiceId) => [
      invoiceId,
      {
        invoiceId,
        paidAmount: 0,
        currencies: [],
        currencyEvidenceComplete: true,
        paidTransactionCount: 0,
      },
    ]),
  );
  const seenTransactions = new Set<string>();
  for (const batch of chunks(uniqueIds, BATCH_SIZE)) {
    const requested = new Set(batch);
    for (let page = 0; page < MAX_PAGES_PER_BATCH; page++) {
      const raw = await (deps?.callTool ?? callPlutioTool)(
        'list-transactions.sh',
        [
          '--filter',
          JSON.stringify({
            type: 'in',
            status: 'paid',
            invoiceId: { $in: batch },
          }),
          '--limit',
          String(PAGE_SIZE),
          '--skip',
          String(page * PAGE_SIZE),
          '--sort',
          '_id',
          '--order',
          'asc',
        ],
      );
      const rows = parsePaidTransactions(raw);
      for (const row of rows) {
        if (seenTransactions.has(row.id)) {
          throw new Error('Plutio transaction pagination returned a duplicate');
        }
        seenTransactions.add(row.id);
        if (!requested.has(row.invoiceId)) {
          throw new Error('Plutio transaction escaped exact invoice filter');
        }
        const current = evidence.get(row.invoiceId)!;
        current.paidAmount += row.amount;
        current.paidTransactionCount += 1;
        if (!row.currency) current.currencyEvidenceComplete = false;
        if (row.currency && !current.currencies.includes(row.currency)) {
          current.currencies.push(row.currency);
          current.currencies.sort();
        }
      }
      if (rows.length < PAGE_SIZE) break;
      if (page === MAX_PAGES_PER_BATCH - 1) {
        throw new Error('Plutio transaction reconciliation exceeded page cap');
      }
    }
  }
  return evidence;
}
