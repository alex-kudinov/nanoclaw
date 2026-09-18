import crypto from 'crypto';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CommerceBookkeeperRequestError,
  prepareCommerceBookkeeperEnvelope,
} from './commerce-bookkeeper.js';

const require = createRequire(import.meta.url);
const recorder = require('../tools/contador/process-commerce-payment.cjs') as {
  column(index: number): string;
  psqlVars(values: Record<string, string>): string[];
  cohortRosterValue(
    current: string,
    cohort: { rosterValue: string } | null,
  ): string;
  refundPaymentLogStatus(refund: { remainingPaidCents: number }): string;
  finalRefundPaymentLogStatus(
    current: string,
    refund: { remainingPaidCents: number },
  ): string;
  formatCommerceSummary(
    fact: Record<string, unknown>,
    paymentLog: { verified: boolean; row: number; recordedDate: string },
    roster: Array<{ tab: string; column: string; row: number }>,
  ): string;
  formatCommerceRefundSummary(
    envelope: Record<string, unknown>,
    paymentLog: { verified: boolean; row: number; status: string },
  ): string;
};
const secret = 'bookkeeper-relay-secret-that-is-long-enough';
const now = Date.parse('2026-09-12T22:00:00Z');

function payload() {
  return {
    schemaVersion: 1,
    deliveryId: '10000000-0000-4000-8000-000000000001',
    sentAt: '2026-09-12T22:00:00Z',
    notification: {
      pspReference: 'WPFT7CXWRGM7NKZ3',
      merchantReference: 'TCA-ABC123',
      merchantAccountCode: 'TandemECOM',
      eventCode: 'AUTHORISATION',
      eventDate: '2026-09-12T21:59:00Z',
      success: 'true',
      amount: { value: 29900, currency: 'USD' },
      additionalData: { hmacSignature: 'provider-native-signature' },
    },
    order: {
      orderId: '20000000-0000-4000-8000-000000000002',
      merchantReference: 'TCA-ABC123',
      productId: 'mcq-program-a-foundations',
      productName: 'Mentor Coaching Foundations (Program A)',
      amountCents: 29900,
      currency: 'USD',
      payer: {
        firstName: 'Alex',
        lastName: 'Buyer',
        email: 'buyer@example.test',
      },
      learner: {
        firstName: 'Taylor',
        lastName: 'Learner',
        email: 'learner@example.test',
      },
      purchaseRelationship: 'other',
      cohort: null as null | Record<string, unknown>,
    },
  };
}

function signed(value = payload()) {
  const rawBody = Buffer.from(JSON.stringify(value));
  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const signatureHeader = crypto
    .createHmac('sha256', secret)
    .update(`tandem-commerce-bookkeeper-v1\n${digest}`)
    .digest('hex');
  return { rawBody, signatureHeader, relaySecret: secret, now };
}

function refundPayload() {
  const value = payload();
  const notification = {
    ...value.notification,
    pspReference: 'RFND7CXWRGM7NKZ3',
    merchantReference: 'TCA-ABC123-RF-01',
    eventCode: 'REFUND',
    amount: { value: 9900, currency: 'USD' },
    originalReference: 'WPFT7CXWRGM7NKZ3',
  };
  return {
    ...value,
    notification,
    refund: {
      refundId: '30000000-0000-4000-8000-000000000003',
      requestReference: 'TCA-ABC123-RF-01',
      paymentPspReference: 'WPFT7CXWRGM7NKZ3',
      refundPspReference: 'RFND7CXWRGM7NKZ3',
      amountCents: 9900,
      cumulativeRefundedCents: 9900,
      remainingPaidCents: 20000,
    },
  };
}

describe('Tandem Commerce Bookkeeper adapter', () => {
  it('accepts the signed native Adyen notification plus matching order facts', () => {
    const prepared = prepareCommerceBookkeeperEnvelope(signed());
    expect(prepared.notification.pspReference).toBe('WPFT7CXWRGM7NKZ3');
    expect(prepared.notification.additionalData.hmacSignature).toBe(
      'provider-native-signature',
    );
    expect(prepared.order.learner.email).toBe('learner@example.test');
  });

  it('accepts a signed provider-neutral Practitioner product identity', () => {
    const practitioner = payload();
    practitioner.order.productId = 'practitioner-ai-for-coaches';
    practitioner.order.productName = 'AI for Coaches';
    const prepared = prepareCommerceBookkeeperEnvelope(signed(practitioner));
    expect(prepared.order.productId).toBe('practitioner-ai-for-coaches');
    expect(prepared.order.productName).toBe('AI for Coaches');
  });

  it('accepts an exact signed refund and rejects cross-payment or cumulative mismatch', () => {
    const prepared = prepareCommerceBookkeeperEnvelope(signed(refundPayload()));
    expect(prepared.notification.eventCode).toBe('REFUND');
    expect(prepared.refund?.paymentPspReference).toBe('WPFT7CXWRGM7NKZ3');
    expect(prepared.refund?.remainingPaidCents).toBe(20000);

    const wrongPayment = refundPayload();
    wrongPayment.notification.originalReference = 'OTHERPAYMENT';
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(wrongPayment)),
    ).toThrow(/refund identity mismatch/);

    const wrongCumulative = refundPayload();
    wrongCumulative.refund.remainingPaidCents = 19999;
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(wrongCumulative)),
    ).toThrow(/refund identity mismatch/);
  });

  it('accepts one bounded signed cohort and rejects malformed cohort evidence', () => {
    const credential = payload();
    credential.order.productId = 'pcc-module-1';
    credential.order.productName = 'PCC Module 1: System Coaching Mindset';
    credential.order.cohort = {
      key: 'pcc-m1-0123456789abcdef01234567',
      program: 'pcc',
      module: 1,
      enrollmentScope: 'module',
      start: '2026-10-07T19:00:00-04:00',
      end: '2026-10-28T21:00:00-04:00',
      label: 'PCC Module 1',
      range: 'Oct 7, 2026 - Oct 28, 2026',
      time: '7:00 PM ET',
      timezone: 'America/New_York',
      sessions: [
        '2026-10-07T19:00:00-04:00',
        '2026-10-14T19:00:00-04:00',
        '2026-10-21T19:00:00-04:00',
        '2026-10-28T19:00:00-04:00',
      ],
      rosterValue: 'PCC Module 1 — Oct 7, 2026 - Oct 28, 2026',
    };
    const prepared = prepareCommerceBookkeeperEnvelope(signed(credential));
    expect(prepared.order.cohort?.key).toBe('pcc-m1-0123456789abcdef01234567');
    const acc = structuredClone(credential);
    acc.order.productId = 'acc-module-1';
    acc.order.productName = 'ACC Module 1: Coaching Fundamentals';
    Object.assign(acc.order.cohort as Record<string, unknown>, {
      key: 'acc-m1-0123456789abcdef01234567',
      program: 'acc',
      label: 'ACC Module 1',
      rosterValue: '2026-10',
    });
    expect(
      prepareCommerceBookkeeperEnvelope(signed(acc)).order.cohort?.program,
    ).toBe('acc');
    const accDisplayValue = structuredClone(acc);
    (accDisplayValue.order.cohort as Record<string, unknown>).rosterValue =
      'ACC Module 1 — Oct 7, 2026 - Oct 28, 2026';
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(accDisplayValue)),
    ).toThrow(/order.cohort invalid/);
    const malformed = structuredClone(credential);
    (malformed.order.cohort as Record<string, unknown>).rosterValue =
      'browser supplied replacement';
    expect(() => prepareCommerceBookkeeperEnvelope(signed(malformed))).toThrow(
      /order.cohort invalid/,
    );
  });

  it('rejects tampering, stale deliveries, and order/payment mismatches', () => {
    const badSignature = signed();
    badSignature.signatureHeader = '0'.repeat(64);
    expect(() => prepareCommerceBookkeeperEnvelope(badSignature)).toThrow(
      CommerceBookkeeperRequestError,
    );
    const stale = signed();
    stale.now += 6 * 60 * 1000;
    expect(() => prepareCommerceBookkeeperEnvelope(stale)).toThrow(
      /sentAt expired/,
    );
    const mismatch = payload();
    mismatch.order.amountCents = 1;
    expect(() => prepareCommerceBookkeeperEnvelope(signed(mismatch))).toThrow(
      /payment identity mismatch/,
    );
    const invalidProduct = payload();
    invalidProduct.order.productId = 'Practitioner AI';
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(invalidProduct)),
    ).toThrow(/payment identity mismatch/);
  });

  it('keeps spreadsheet and SQL coordinates data-only', () => {
    expect(recorder.column(0)).toBe('A');
    expect(recorder.column(27)).toBe('AB');
    expect(recorder.psqlVars({ psp: "x'; DROP TABLE payments;--" })).toEqual([
      '-v',
      "psp=x'; DROP TABLE payments;--",
    ]);
    expect(
      recorder.cohortRosterValue('', {
        rosterValue: 'PCC Module 1 — Oct 2026',
      }),
    ).toBe('PCC Module 1 — Oct 2026');
    expect(
      recorder.cohortRosterValue('Existing cohort', {
        rosterValue: 'Replacement',
      }),
    ).toBe('Existing cohort');
  });

  it('writes and verifies explicit Adyen provenance without renaming the legacy ID header', () => {
    const source = readFileSync(
      new URL(
        '../tools/contador/process-commerce-payment.cjs',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain(
      "const PAYMENT_PROVIDER_HEADER = 'Payment Provider'",
    );
    expect(source).toContain("'Payment Log!P1'");
    expect(source).toContain("[['Adyen']]");
    expect(source).toContain("provider !== 'Adyen'");
    expect(source).toContain('endColumnIndex: 16');
    expect(source).toContain('...(tab.basicFilter || {})');
    expect(source).toContain("headers.findIndex(value => value === 'Cohort')");
    expect(source).toContain(
      'if (!before) await update(ROSTER_ID, cell, [[expected]])',
    );
    expect(source).toContain("fail('student roster cohort readback mismatch')");
    expect(source).not.toContain("Payment Log!J1', [['Provider Payment ID']]");
  });

  it('formats a rich mechanical receipt with provider and destination readback', () => {
    const summary = recorder.formatCommerceSummary(
      {
        learnerName: 'Alex Kudinov',
        learnerEmail: 'alex@example.test',
        productName: 'AI for Coaches',
        amountDollars: '1.00',
        currency: 'USD',
        pspReference: 'RTKPSQMVRMMV3RR9',
        transactionDate: '9/15/2026',
        recordedDate: '9/15/2026',
        cohort: null,
      },
      { verified: true, row: 430, recordedDate: '9/15/2026' },
      [{ tab: 'Practitioner Series', column: 'AI for Coaches', row: 15 }],
    );
    expect(summary.split('\n')[0]).toBe(
      'Payment received: Alex Kudinov — AI for Coaches — $1.00 USD',
    );
    expect(summary).toContain('Provider: Adyen · RTKPSQMVRMMV3RR9');
    expect(summary).toContain('Paid: 9/15/2026 · Recorded: 9/15/2026');
    expect(summary).toContain(
      'Fee: pending — awaiting Adyen settlement/fee evidence',
    );
    expect(summary).toContain(
      'Payment Log: recorded and verified (row 430; provider Adyen)',
    );
    expect(summary).toContain(
      'Student Roster: recorded and verified (Practitioner Series → AI for Coaches (row 15))',
    );
  });

  it('projects refund status without a roster mutation and formats exact provider refs', () => {
    expect(recorder.refundPaymentLogStatus({ remainingPaidCents: 20000 })).toBe(
      'partially refunded',
    );
    expect(recorder.refundPaymentLogStatus({ remainingPaidCents: 0 })).toBe(
      'refunded',
    );
    expect(
      recorder.finalRefundPaymentLogStatus('refunded', {
        remainingPaidCents: 20000,
      }),
    ).toBe('refunded');
    expect(
      recorder.finalRefundPaymentLogStatus('partially refunded', {
        remainingPaidCents: 0,
      }),
    ).toBe('refunded');
    const summary = recorder.formatCommerceRefundSummary(refundPayload(), {
      verified: true,
      row: 430,
      status: 'partially refunded',
    });
    expect(summary).toContain('Refund recorded: $99.00 USD');
    expect(summary).toContain(
      'refund RFND7CXWRGM7NKZ3 · payment WPFT7CXWRGM7NKZ3',
    );
    expect(summary).toContain('Payment Log: status partially refunded');
    expect(summary).toContain('Student Roster: unchanged by refund policy');
  });
});
