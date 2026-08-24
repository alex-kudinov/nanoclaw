import fs from 'fs';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('tools/contador/mark-refunds.cjs', 'utf8');

describe('mark-refunds exact fulfillment receipt', () => {
  it('requires exact single-refund resolution and post-write Payment Log readback', () => {
    expect(source).toContain('if (SINGLE_ID && !exactRefund)');
    expect(source).toContain('Payment Log!J${rowNumber}:M${rowNumber}');
    expect(source).toContain(
      "String(status || '').trim().toLowerCase() === 'refunded'",
    );
    expect(source).toContain(
      "String(refundId || '').trim() === exactRefund.refundId",
    );
  });

  it('never calls a refund operationally complete in this slice', () => {
    expect(source).toContain(
      "state: paymentLogVerified ? 'needs_review' : 'write_failed'",
    );
    expect(source).toContain('refund_fulfillment_review_required');
    expect(source).not.toContain("state: 'complete'");
  });

  it('emits a private content-minimized fulfillment sentinel', () => {
    expect(source).toContain('__CONTADOR_FULFILLMENT__');
    for (const forbidden of [
      'customerEmail',
      'customerName',
      'productName',
      'cardNumber',
    ]) {
      const sentinelBlock = source.slice(
        source.indexOf('const fulfillment = {'),
      );
      expect(sentinelBlock).not.toContain(forbidden);
    }
  });
});
