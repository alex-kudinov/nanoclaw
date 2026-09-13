import crypto from 'crypto';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

import {
  CommerceBookkeeperRequestError,
  prepareCommerceBookkeeperEnvelope,
} from './commerce-bookkeeper.js';

const require = createRequire(import.meta.url);
const recorder = require('../tools/contador/process-commerce-payment.cjs') as {
  column(index: number): string;
  psqlVars(values: Record<string, string>): string[];
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

describe('Tandem Commerce Bookkeeper adapter', () => {
  it('accepts the signed native Adyen notification plus matching order facts', () => {
    const prepared = prepareCommerceBookkeeperEnvelope(signed());
    expect(prepared.notification.pspReference).toBe('WPFT7CXWRGM7NKZ3');
    expect(prepared.notification.additionalData.hmacSignature).toBe(
      'provider-native-signature',
    );
    expect(prepared.order.learner.email).toBe('learner@example.test');
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
  });

  it('keeps spreadsheet and SQL coordinates data-only', () => {
    expect(recorder.column(0)).toBe('A');
    expect(recorder.column(27)).toBe('AB');
    expect(recorder.psqlVars({ psp: "x'; DROP TABLE payments;--" })).toEqual([
      '-v',
      "psp=x'; DROP TABLE payments;--",
    ]);
  });
});
