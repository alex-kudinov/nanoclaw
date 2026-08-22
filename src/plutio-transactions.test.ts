import { describe, expect, it, vi } from 'vitest';

import {
  listInvoicePaymentEvidence,
  parsePaidTransactions,
} from './plutio-transactions.js';

describe('parsePaidTransactions', () => {
  it('keeps only exact numeric payment evidence', () => {
    expect(
      parsePaidTransactions(
        `OK [{"_id":"transaction-1","invoiceId":"invoice-1","amount":"125.50","currency":"usd","type":"in","status":"paid","title":"must not escape"}]`,
      ),
    ).toEqual([
      {
        id: 'transaction-1',
        invoiceId: 'invoice-1',
        amount: 125.5,
        currency: 'USD',
      },
    ]);
  });

  it('accepts an empty successful result as zero receipts', () => {
    expect(parsePaidTransactions('OK []')).toEqual([]);
  });

  it.each([
    ['ERR unavailable'],
    ['{'],
    [
      'OK [{"_id":"transaction-1","invoiceId":"invoice-1","amount":10,"type":"out","status":"paid"}]',
    ],
    [
      'OK [{"_id":"transaction-1","invoiceId":"invoice-1","amount":10,"type":"in","status":"pending"}]',
    ],
    ['OK [{"_id":"transaction-1","amount":10,"type":"in","status":"paid"}]'],
    ['OK [{"invoiceId":"invoice-1","amount":10,"type":"in","status":"paid"}]'],
  ])('fails closed on incomplete or contradictory evidence', (raw) => {
    expect(() => parsePaidTransactions(raw)).toThrow();
  });
});

describe('listInvoicePaymentEvidence', () => {
  it('uses one exact bounded filter and aggregates only content-free evidence', async () => {
    const callTool = vi.fn().mockResolvedValue(
      `OK [
        {"_id":"transaction-1","invoiceId":"invoice-1","amount":100,"currency":"USD","type":"in","status":"paid"},
        {"_id":"transaction-2","invoiceId":"invoice-1","amount":25,"currency":"usd","type":"in","status":"paid"}
      ]`,
    );
    const evidence = await listInvoicePaymentEvidence(
      ['invoice-1', 'invoice-2', 'invoice-1'],
      { callTool },
    );

    expect(callTool).toHaveBeenCalledTimes(1);
    const [script, args] = callTool.mock.calls[0];
    expect(script).toBe('list-transactions.sh');
    expect(JSON.parse(args[1])).toEqual({
      type: 'in',
      status: 'paid',
      invoiceId: { $in: ['invoice-1', 'invoice-2'] },
    });
    expect(args).toContain('_id');
    expect(evidence.get('invoice-1')).toEqual({
      invoiceId: 'invoice-1',
      paidAmount: 125,
      currencies: ['USD'],
      currencyEvidenceComplete: true,
      paidTransactionCount: 2,
    });
    expect(evidence.get('invoice-2')).toEqual({
      invoiceId: 'invoice-2',
      paidAmount: 0,
      currencies: [],
      currencyEvidenceComplete: true,
      paidTransactionCount: 0,
    });
  });

  it('fails closed when the source returns a transaction outside the exact filter', async () => {
    await expect(
      listInvoicePaymentEvidence(['invoice-1'], {
        callTool: vi
          .fn()
          .mockResolvedValue(
            'OK [{"_id":"transaction-1","invoiceId":"invoice-2","amount":1,"currency":"USD","type":"in","status":"paid"}]',
          ),
      }),
    ).rejects.toThrow('escaped exact invoice filter');
  });
});
