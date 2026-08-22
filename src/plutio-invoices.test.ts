import { describe, expect, it } from 'vitest';

import {
  isInvoicePaymentReconciled,
  parseInvoiceSnapshots,
  type InvoiceSnapshot,
} from './plutio-invoices.js';

describe('parseInvoiceSnapshots', () => {
  it('retains current status, due date, client, and explicit balance evidence', () => {
    expect(
      parseInvoiceSnapshots(
        `OK [{"_id":"i1","status":"OVERDUE","dueDate":"2026-08-01T00:00:00Z","amount":1000,"amountPaid":250,"currency":"usd","client":{"_id":"person-1"}}]`,
      ),
    ).toEqual([
      {
        id: 'i1',
        status: 'overdue',
        dueAt: '2026-08-01T00:00:00.000Z',
        totalAmount: 1000,
        paidAmount: 250,
        outstandingAmount: 750,
        currency: 'USD',
        clientId: 'person-1',
      },
    ]);
  });

  it('prefers explicit outstanding balance and preserves missing evidence', () => {
    const rows = parseInvoiceSnapshots(
      JSON.stringify({
        data: [
          { _id: 'i1', status: 'pending', balance: '125.50' },
          { _id: 'i2', status: 'pending', amount: 200 },
          { status: 'overdue', amount: 50 },
        ],
      }),
    );
    expect(rows).toEqual([
      {
        id: 'i1',
        status: 'pending',
        dueAt: null,
        totalAmount: null,
        paidAmount: null,
        outstandingAmount: 125.5,
        currency: null,
        clientId: null,
      },
      {
        id: 'i2',
        status: 'pending',
        dueAt: null,
        totalAmount: 200,
        paidAmount: null,
        outstandingAmount: null,
        currency: null,
        clientId: null,
      },
    ]);
  });

  it('returns no guessed rows on malformed output', () => {
    expect(parseInvoiceSnapshots('ERR upstream')).toEqual([]);
    expect(parseInvoiceSnapshots('{')).toEqual([]);
  });
});

describe('isInvoicePaymentReconciled', () => {
  const invoice: InvoiceSnapshot = {
    id: 'invoice-1',
    status: 'overdue',
    dueAt: '2026-08-01T00:00:00.000Z',
    totalAmount: 1000,
    paidAmount: 250,
    outstandingAmount: 750,
    currency: 'USD',
    clientId: 'person-1',
  };

  it('requires exact invoice arithmetic and paid receipts to agree', () => {
    expect(
      isInvoicePaymentReconciled(invoice, {
        invoiceId: 'invoice-1',
        paidAmount: 250,
        currencies: ['USD'],
        currencyEvidenceComplete: true,
        paidTransactionCount: 1,
      }),
    ).toBe(true);
  });

  it('treats a completed zero-receipt read as reconciliation for zero paid', () => {
    expect(
      isInvoicePaymentReconciled(
        { ...invoice, paidAmount: 0, outstandingAmount: 1000 },
        {
          invoiceId: 'invoice-1',
          paidAmount: 0,
          currencies: [],
          currencyEvidenceComplete: true,
          paidTransactionCount: 0,
        },
      ),
    ).toBe(true);
  });

  it.each([
    [undefined],
    [
      {
        invoiceId: 'invoice-1',
        paidAmount: 200,
        currencies: ['USD'],
        currencyEvidenceComplete: true,
        paidTransactionCount: 1,
      },
    ],
    [
      {
        invoiceId: 'invoice-1',
        paidAmount: 250,
        currencies: ['EUR'],
        currencyEvidenceComplete: true,
        paidTransactionCount: 1,
      },
    ],
    [
      {
        invoiceId: 'invoice-1',
        paidAmount: 250,
        currencies: [],
        currencyEvidenceComplete: false,
        paidTransactionCount: 1,
      },
    ],
  ])('blocks missing or contradictory payment evidence', (payment) => {
    expect(isInvoicePaymentReconciled(invoice, payment)).toBe(false);
  });
});
