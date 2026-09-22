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
  commerceEconomics(
    amountCents: number,
    economics: Record<string, unknown> | null,
  ): {
    feeBasis: string;
    feeCents: number;
    netCents: number;
    feeDollars: string;
    netDollars: string;
  } | null;
  sheetMoneyCents(value: unknown): number;
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
  formatCommerceTestSummary(envelope: Record<string, unknown>): string;
  formatCommerceFeeSummary(
    envelope: Record<string, unknown>,
    paymentLog: Record<string, unknown>,
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
    environment: 'live',
    deliveryKind: 'payment',
    economics: null as null | Record<string, unknown>,
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
      rosterPolicy: 'catalog',
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
    deliveryKind: 'refund',
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
    expect(prepared.environment).toBe('live');
    expect(prepared.deliveryKind).toBe('payment');
  });

  it('accepts exact signed fee economics and rejects scope or arithmetic drift', () => {
    const fees = payload();
    fees.deliveryKind = 'fee_reconciliation';
    fees.economics = {
      feeBasis: 'zentact_settled',
      providerFeeCents: 741,
      periFeeCents: 85,
    };
    const prepared = prepareCommerceBookkeeperEnvelope(signed(fees));
    expect(prepared.economics).toEqual(fees.economics);
    expect(recorder.commerceEconomics(29900, fees.economics)).toMatchObject({
      feeCents: 826,
      netCents: 29074,
      feeDollars: '8.26',
      netDollars: '290.74',
    });
    expect(recorder.sheetMoneyCents('$1,299.00')).toBe(129900);
    expect(recorder.sheetMoneyCents('8.2')).toBe(820);
    expect(() => recorder.sheetMoneyCents('=SUM(A1:A2)')).toThrow(
      /payment log money invalid/,
    );

    const testFee = structuredClone(fees);
    testFee.environment = 'test';
    expect(() => prepareCommerceBookkeeperEnvelope(signed(testFee))).toThrow(
      /delivery scope invalid/,
    );
    const overcharge = structuredClone(fees);
    overcharge.economics = {
      feeBasis: 'zentact_settled',
      providerFeeCents: 29899,
      periFeeCents: 2,
    };
    expect(() => prepareCommerceBookkeeperEnvelope(signed(overcharge))).toThrow(
      /economics invalid/,
    );
  });

  it('requires a signed environment and delivery kind for every projection', () => {
    const missingEnvironment = payload() as any;
    delete missingEnvironment.environment;
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(missingEnvironment)),
    ).toThrow(/environment invalid/);
    const wrongKind = payload();
    wrongKind.deliveryKind = 'refund';
    expect(() => prepareCommerceBookkeeperEnvelope(signed(wrongKind))).toThrow(
      /delivery scope invalid/,
    );
  });

  it('accepts a signed provider-neutral Practitioner product identity', () => {
    const practitioner = payload();
    practitioner.order.productId = 'practitioner-ai-for-coaches';
    practitioner.order.productName = 'AI for Coaches';
    const prepared = prepareCommerceBookkeeperEnvelope(signed(practitioner));
    expect(prepared.order.productId).toBe('practitioner-ai-for-coaches');
    expect(prepared.order.productName).toBe('AI for Coaches');
  });

  it('accepts explicit no-roster invoice payments and rejects inferred or contradictory policy', () => {
    const invoice = payload();
    invoice.order.productId = 'invoice-0713aac48f0eba63d80d7a71';
    invoice.order.productName = 'Custom invoice installments - TEST';
    invoice.order.rosterPolicy = 'none';
    const prepared = prepareCommerceBookkeeperEnvelope(signed(invoice));
    expect(prepared.order.rosterPolicy).toBe('none');
    expect(prepared.order.cohort).toBeNull();

    const missing = structuredClone(invoice) as any;
    delete missing.order.rosterPolicy;
    expect(() => prepareCommerceBookkeeperEnvelope(signed(missing))).toThrow(
      /rosterPolicy invalid/,
    );
    const contradictory = structuredClone(invoice);
    contradictory.order.cohort = {
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
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(contradictory)),
    ).toThrow(/rosterPolicy invalid/);
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

  it('accepts only the canonical MCS Practicum full-program cohort shape', () => {
    const mcs = payload();
    mcs.notification.amount.value = 99900;
    mcs.order.productId = 'mcs-full';
    mcs.order.productName = 'Mentor Coach Training (AAMC)';
    mcs.order.amountCents = 99900;
    mcs.order.cohort = {
      key: 'mcs-practicum-0123456789abcdef01234567',
      program: 'mcs-practicum',
      module: 0,
      enrollmentScope: 'full_program',
      start: '2026-09-24T18:00:00-04:00',
      end: '2026-12-17T18:00:00-05:00',
      label: 'Thursdays',
      range: 'September 24 – December 17, 2026',
      time: '6:00 PM ET · US & Asia-Pacific',
      timezone: 'America/New_York',
      sessions: [
        '2026-09-24T18:00:00-04:00',
        '2026-10-01T18:00:00-04:00',
        '2026-10-08T18:00:00-04:00',
        '2026-10-15T18:00:00-04:00',
        '2026-10-22T18:00:00-04:00',
        '2026-10-29T18:00:00-04:00',
        '2026-11-05T18:00:00-05:00',
        '2026-11-12T18:00:00-05:00',
        '2026-11-19T18:00:00-05:00',
        '2026-12-03T18:00:00-05:00',
        '2026-12-10T18:00:00-05:00',
        '2026-12-17T18:00:00-05:00',
      ],
      rosterValue: 'Thursdays — September 24 – December 17, 2026',
    };

    const prepared = prepareCommerceBookkeeperEnvelope(signed(mcs));
    expect(prepared.order.cohort).toMatchObject({
      program: 'mcs-practicum',
      module: 0,
      enrollmentScope: 'full_program',
      rosterValue: 'Thursdays — September 24 – December 17, 2026',
    });
    expect(prepared.order.cohort?.sessions).toHaveLength(12);

    const wrongModule = structuredClone(mcs);
    (wrongModule.order.cohort as Record<string, unknown>).module = 1;
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(wrongModule)),
    ).toThrow(/order.cohort invalid/);

    const wrongKey = structuredClone(mcs);
    (wrongKey.order.cohort as Record<string, unknown>).key =
      'mcs-practicum-m123456789abcdef01234567';
    expect(() => prepareCommerceBookkeeperEnvelope(signed(wrongKey))).toThrow(
      /order.cohort invalid/,
    );

    const shortSchedule = structuredClone(mcs);
    (
      (shortSchedule.order.cohort as Record<string, unknown>)
        .sessions as string[]
    ).pop();
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(shortSchedule)),
    ).toThrow(/order.cohort invalid/);

    const widenedCredential = structuredClone(mcs);
    Object.assign(widenedCredential.order.cohort as Record<string, unknown>, {
      key: 'pcc-m0-0123456789abcdef01234567',
      program: 'pcc',
    });
    expect(() =>
      prepareCommerceBookkeeperEnvelope(signed(widenedCredential)),
    ).toThrow(/order.cohort invalid/);
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
    expect(source).toContain(
      "envelope.order.rosterPolicy === 'none' ? [] : await recordRoster(fact)",
    );
    expect(source).toContain(
      "studentRosterVerified: envelope.order.rosterPolicy === 'none' || rosterDestinations.length > 0",
    );
    expect(source.indexOf("if (envelope.environment === 'test')")).toBeLessThan(
      source.indexOf("fail('bookkeeper configuration missing')"),
    );
    expect(source).toContain(
      'await update(PAYMENTS_ID, `Payment Log!G${sheetRow}:H${sheetRow}`',
    );
    expect(source).toContain(
      'const priorEconomics = (await get(PAYMENTS_ID, `Payment Log!G${sheetRow}:H${sheetRow}`))',
    );
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
        rosterPolicy: 'catalog',
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

  it('formats explicit no-roster invoice payment readback', () => {
    const summary = recorder.formatCommerceSummary(
      {
        learnerName: 'Alex Kudinov',
        learnerEmail: 'alex@example.test',
        productName: 'Custom invoice installments - TEST',
        amountDollars: '1.00',
        currency: 'USD',
        pspReference: 'INVOICEPSP1',
        transactionDate: '9/19/2026',
        recordedDate: '9/19/2026',
        cohort: null,
        rosterPolicy: 'none',
      },
      { verified: true, row: 431, recordedDate: '9/19/2026' },
      [],
    );
    expect(summary).toContain(
      'Student Roster: not applicable — invoice payment',
    );
    expect(summary).not.toContain('Student Roster: recorded and verified');
  });

  it('formats explicit TEST exclusion and all-in fee reconciliation receipts', () => {
    const testEnvelope = payload();
    testEnvelope.environment = 'test';
    expect(recorder.formatCommerceTestSummary(testEnvelope)).toContain(
      'Official record: not written (Payment Log, Student Roster, PostgreSQL, Capacity)',
    );
    const feeEnvelope = payload();
    feeEnvelope.deliveryKind = 'fee_reconciliation';
    feeEnvelope.economics = {
      feeBasis: 'zentact_settled',
      providerFeeCents: 741,
      periFeeCents: 85,
    };
    const summary = recorder.formatCommerceFeeSummary(feeEnvelope, {
      row: 430,
      economics: recorder.commerceEconomics(29900, feeEnvelope.economics),
    });
    expect(summary).toContain('Fee / net: $8.26 / $290.74');
    expect(summary).toContain(
      'Fee basis: Zentact settled processing cost + estimated Peri',
    );
    expect(summary).toContain('Student Roster: unchanged');
    expect(summary).toContain('Database: unchanged');
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
