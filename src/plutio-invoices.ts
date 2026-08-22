/**
 * Content-minimized Plutio invoice reader for the Company OS follow-up shadow.
 *
 * This module reads current invoice fields only. It deliberately does not call
 * an invoice "paid" merely because arithmetic reaches zero; the shadow keeps
 * transaction reconciliation as a separate required receipt.
 */

import { callPlutioTool, stripToJson } from './plutio-cli.js';
import type { InvoicePaymentEvidence } from './plutio-transactions.js';

export interface InvoiceSnapshot {
  id: string;
  status: string;
  dueAt: string | null;
  totalAmount: number | null;
  paidAmount: number | null;
  outstandingAmount: number | null;
  currency: string | null;
  clientId: string | null;
}

function asArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: unknown[] }).data;
  }
  return [];
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

function timestampFrom(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = finiteNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function toInvoiceSnapshot(
  invoice: Record<string, unknown>,
): InvoiceSnapshot | null {
  const id = idFrom(invoice._id);
  if (!id) return null;
  const totalAmount = firstNumber(invoice, ['totalAmount', 'total', 'amount']);
  const paidAmount = firstNumber(invoice, ['amountPaid', 'paidAmount', 'paid']);
  const explicitOutstanding = firstNumber(invoice, [
    'outstandingAmount',
    'amountDue',
    'balance',
  ]);
  const outstandingAmount =
    explicitOutstanding ??
    (totalAmount !== null && paidAmount !== null
      ? Math.max(0, totalAmount - paidAmount)
      : null);
  const nestedCurrency = invoice.currency as { code?: unknown } | undefined;
  const currencyRaw =
    typeof invoice.currency === 'string'
      ? invoice.currency
      : typeof nestedCurrency?.code === 'string'
        ? nestedCurrency.code
        : null;
  return {
    id,
    status:
      typeof invoice.status === 'string'
        ? invoice.status.trim().toLowerCase()
        : 'unknown',
    dueAt: timestampFrom(invoice.dueDate ?? invoice.dueAt),
    totalAmount,
    paidAmount,
    outstandingAmount,
    currency: currencyRaw?.trim().toUpperCase() ?? null,
    clientId: idFrom(invoice.client),
  };
}

export function parseInvoiceSnapshots(raw: string): InvoiceSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripToJson(raw));
  } catch {
    return [];
  }
  return asArray(parsed)
    .map((invoice) => toInvoiceSnapshot(invoice as Record<string, unknown>))
    .filter((invoice): invoice is InvoiceSnapshot => invoice !== null);
}

const MONEY_TOLERANCE = 0.005;

/**
 * Require the invoice arithmetic and exact paid-transaction sum to agree.
 * A completed exact filtered read with zero receipts reconciles a zero
 * amountPaid; missing/mixed-currency evidence never becomes permission.
 */
export function isInvoicePaymentReconciled(
  invoice: InvoiceSnapshot,
  payment: InvoicePaymentEvidence | undefined,
): boolean {
  const { totalAmount, paidAmount, outstandingAmount, currency } = invoice;
  if (
    !payment ||
    totalAmount === null ||
    paidAmount === null ||
    outstandingAmount === null ||
    !currency ||
    totalAmount < 0 ||
    paidAmount < 0 ||
    outstandingAmount < 0
  ) {
    return false;
  }
  if (
    !payment.currencyEvidenceComplete ||
    payment.currencies.some((item) => item !== currency)
  ) {
    return false;
  }
  return (
    Math.abs(totalAmount - paidAmount - outstandingAmount) < MONEY_TOLERANCE &&
    Math.abs(payment.paidAmount - paidAmount) < MONEY_TOLERANCE
  );
}

async function listInvoiceStatus(status: string): Promise<InvoiceSnapshot[]> {
  const raw = await callPlutioTool('list-invoices.sh', [
    '--filter',
    JSON.stringify({ status }),
    '--limit',
    '200',
    '--sort',
    'dueDate',
    '--order',
    'desc',
  ]);
  if (!stripToJson(raw)) {
    throw new Error(`Plutio invoice source returned no JSON for ${status}`);
  }
  return parseInvoiceSnapshots(raw);
}

/** Future-due pending plus currently overdue invoices, deduped by exact ID. */
export async function listInvoiceSnapshots(): Promise<InvoiceSnapshot[]> {
  const [pending, overdue] = await Promise.all([
    listInvoiceStatus('pending'),
    listInvoiceStatus('overdue'),
  ]);
  return [
    ...new Map([...pending, ...overdue].map((row) => [row.id, row])).values(),
  ];
}
