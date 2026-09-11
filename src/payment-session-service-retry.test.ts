import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createPaymentAttempt } from './payment-domain.js';
import { PaymentSessionService } from './payment-session-service.js';

function attempt() {
  const now = Date.now() - 1000;
  return createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope: {
      provider: 'adyen',
      environment: 'test',
      company: 'fixture',
      merchant: 'fixture',
      store: 'fixture',
      endpointRegion: 'eu',
    },
    paymentMethodCapabilities: ['card'],
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: 'fixture',
      bundleVersion: 'fixture',
      deliveryVersion: 'fixture',
      locale: 'en-US',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: 29900,
      discountAmount: 0,
      finalAmount: 29900,
      discountPolicyReference: null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: 'fixture',
      consentReceipt: 'fixture',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 60000,
    },
  });
}

describe('terminal retry new-charge gate', () => {
  it.each(['disabled_offer', 'reconcile_only'] as const)(
    'returns retry_not_allowed with zero store/provider writes for %s',
    async (mode) => {
      const stored = attempt();
      const prepareSuccessorSession = vi.fn();
      const create = vi.fn();
      const service = new PaymentSessionService(
        {
          readAttempt: vi.fn(async () => stored),
          prepareSuccessorSession,
        } as never,
        { create },
        {
          scope: stored.scope,
          allowedOrigin: 'https://example.test',
          returnPath: '/return',
        },
        mode === 'disabled_offer' ? [] : ['mcq-program-a-foundations:en-US'],
        ['card'],
        mode === 'reconcile_only' ? 'reconcile_only' : 'dispatch',
      );
      await expect(
        service.retry({
          attemptId: stored.attemptId,
          operationId: randomUUID(),
          terminalReceipt: `terminal-nonpayment:v1:${'a'.repeat(64)}`,
        }),
      ).resolves.toEqual({
        state: 'retry_not_allowed',
        paymentMethodCapabilities: ['card'],
      });
      expect(prepareSuccessorSession).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      await expect(
        service.checkSubmit({
          attemptId: stored.attemptId,
          returnBinding: 'must-not-open-while-authority-off',
        }),
      ).resolves.toEqual({
        state: 'session_submit_blocked',
        reason: 'unavailable',
      });
      expect(prepareSuccessorSession).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});
