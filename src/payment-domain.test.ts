import { describe, expect, it } from 'vitest';

import {
  assertPaymentAttemptReuse,
  createPaymentAttempt,
  decidePaymentOperationRecovery,
  paymentMethodCapabilitiesForAttempt,
  paymentQuoteFingerprint,
  preparePaymentOperation,
  projectPaymentEvidence,
  recordPaymentOperationResult,
  validatePaymentMethodCapabilities,
  validatePaymentQuote,
  type PaymentFact,
  type PaymentQuote,
} from './payment-domain.js';

const NOW = Date.parse('2026-09-09T20:00:00Z');
const scope = {
  provider: 'adyen',
  environment: 'test',
  company: 'test-company',
  merchant: 'test-merchant',
  store: 'test-store',
  endpointRegion: 'eu',
} as const;
const ID = '42af665e-0116-42b0-a74e-7e406a6b7c7c';
const OP = 'fa8abec9-a0fa-4263-baff-73976eae3cb9';
const requestFingerprint = 'b'.repeat(64);
const quote = (changes: Partial<PaymentQuote> = {}): PaymentQuote => ({
  schemaVersion: 1,
  quoteId: 'b6f8fb2c-1c46-4f83-b9aa-36b548f24060',
  authority: 'wordpress:test',
  offerKey: 'mcq-program-a-foundations',
  catalogVersion: 'fixture-v1',
  bundleVersion: 'fixture-v1',
  deliveryVersion: 'fixture-v1',
  locale: 'en',
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
  termsVersion: 'fixture-v1',
  consentReceipt: 'receipt:test',
  acceptedAt: NOW,
  createdAt: NOW,
  expiresAt: NOW + 30 * 60 * 1000,
  ...changes,
});
const attempt = (q = quote()) =>
  createPaymentAttempt({ attemptId: ID, quote: q, scope, now: NOW });
const operation = () =>
  preparePaymentOperation({
    attempt: attempt(),
    operationId: OP,
    idempotencyKey: 'fixture-operation-key',
    requestFingerprint,
    now: NOW,
    retryUntil: NOW + 60 * 60 * 1000,
  });
const fact = (changes: Partial<PaymentFact> = {}): PaymentFact => ({
  deliveryId: 'delivery:auth',
  scope,
  attemptId: ID,
  paymentReference: 'psp:test',
  kind: 'authorization',
  operationReference: 'psp:test',
  success: true,
  amount: 29900,
  currency: 'USD',
  ...changes,
});
const capture = (changes: Partial<PaymentFact> = {}) =>
  fact({
    deliveryId: 'delivery:capture',
    kind: 'capture',
    operationReference: 'capture:1',
    ...changes,
  });
const refund = (changes: Partial<PaymentFact> = {}) =>
  fact({
    deliveryId: 'delivery:refund',
    kind: 'refund',
    operationReference: 'refund:1',
    ...changes,
  });
const project = (facts: unknown[]) =>
  projectPaymentEvidence({
    attempt: attempt(),
    paymentReference: 'psp:test',
    facts,
  });
const recover = (changes = {}) =>
  decidePaymentOperationRecovery({
    attempt: attempt(),
    operation: operation(),
    requestFingerprint,
    now: NOW + 1,
    ...changes,
  });

describe('immutable authoritative quote', () => {
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid minor-unit money %s',
    (amount) => {
      expect(() =>
        validatePaymentQuote(
          quote({ originalAmount: amount, finalAmount: amount }),
        ),
      ).toThrow('invalid_contract');
    },
  );
  it.each([
    { discountAmount: 30000, finalAmount: 0 },
    { discountAmount: 100, finalAmount: 29900 },
  ])('rejects inconsistent arithmetic %o', (changes) => {
    expect(() => validatePaymentQuote(quote(changes))).toThrow(
      'quote_arithmetic_mismatch',
    );
  });
  it('requires a policy reference for discounts, without inventing eligibility', () => {
    expect(() =>
      validatePaymentQuote(quote({ discountAmount: 100, finalAmount: 29800 })),
    ).toThrow('discount_policy_missing');
  });
  it('accepts fixed/percent authority-calculated amounts and maximum safe integers exactly', () => {
    for (const discountAmount of [0, 1000, 2990, 29900]) {
      const q = quote({
        discountAmount,
        finalAmount: 29900 - discountAmount,
        discountPolicyReference: 'policy:fixture',
      });
      expect(validatePaymentQuote(q).finalAmount).toBe(29900 - discountAmount);
    }
    expect(
      validatePaymentQuote(
        quote({
          originalAmount: Number.MAX_SAFE_INTEGER,
          finalAmount: Number.MAX_SAFE_INTEGER,
        }),
      ).finalAmount,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('uses a separate path for a valid zero-price order', () => {
    const q = quote({
      discountAmount: 29900,
      finalAmount: 0,
      discountPolicyReference: 'policy:free',
    });
    expect(validatePaymentQuote(q).finalAmount).toBe(0);
    expect(() => attempt(q)).toThrow('free_order_requires_separate_admission');
  });
  it.each([{ expiresAt: NOW }, { acceptedAt: NOW + 1 }])(
    'rejects invalid time relation %o',
    (changes) => {
      expect(() => validatePaymentQuote(quote(changes))).toThrow(
        'quote_time_mismatch',
      );
    },
  );
  it('rejects unversioned, unknown, raw financial or unsupported recurring fields', () => {
    for (const changes of [
      { schemaVersion: 2 },
      { cardNumber: 'fixture' },
      { paymentOption: 'subscription' },
      { currency: 'usd' },
    ]) {
      expect(() => validatePaymentQuote({ ...quote(), ...changes })).toThrow(
        'invalid_contract',
      );
    }
  });
  it('has an order-independent canonical fingerprint sensitive to every contract field', () => {
    const q = quote();
    expect(
      paymentQuoteFingerprint(Object.fromEntries(Object.entries(q).reverse())),
    ).toBe(paymentQuoteFingerprint(q));
    for (const changes of [
      { offerKey: 'second-product' },
      { termsVersion: 'v2' },
      { locale: 'fr' },
      { payerReference: 'party:2' },
      { redemptionReference: 'redemption:2' },
      { deliveryVersion: 'v2' },
    ]) {
      expect(paymentQuoteFingerprint(quote(changes))).not.toBe(
        paymentQuoteFingerprint(q),
      );
    }
  });
  it('does not share mutable caller data', () => {
    const q = quote();
    const a = attempt(q);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.quote)).toBe(true);
    expect(Object.isFrozen(a.scope)).toBe(true);
    expect(a.quote).not.toBe(q);
  });
  it('preserves legacy v1 attempts as card-only and snapshots new capabilities', () => {
    expect(paymentMethodCapabilitiesForAttempt(attempt())).toEqual(['card']);
    const methods = ['card', 'ach_direct_debit'] as const;
    const next = createPaymentAttempt({
      attemptId: ID,
      quote: quote(),
      scope,
      paymentMethodCapabilities: methods,
      now: NOW,
    });
    expect(next.paymentMethodCapabilities).toEqual(methods);
    expect(Object.isFrozen(next.paymentMethodCapabilities)).toBe(true);
    expect(next.paymentMethodCapabilities).not.toBe(methods);
  });
  it.each(
    [
      [],
      ['card', 'card'],
      ['ach_direct_debit', 'card'],
      ['scheme'],
      ['ach'],
      ['plaid'],
      ['apple_pay'],
    ].map((methods) => ({ methods })),
  )(
    'rejects invalid or noncanonical capability snapshots $methods',
    ({ methods }) => {
      expect(() => validatePaymentMethodCapabilities(methods)).toThrow();
      expect(() =>
        createPaymentAttempt({
          attemptId: ID,
          quote: quote(),
          scope,
          paymentMethodCapabilities: methods,
          now: NOW,
        }),
      ).toThrow();
    },
  );
  it('rejects stale/not-yet-valid quotes at attempt creation and dispatch', () => {
    for (const now of [NOW - 1, quote().expiresAt]) {
      expect(() =>
        createPaymentAttempt({ attemptId: ID, quote: quote(), scope, now }),
      ).toThrow('quote_not_current_at_attempt_creation');
      expect(() =>
        preparePaymentOperation({
          attempt: attempt(),
          operationId: OP,
          idempotencyKey: OP,
          requestFingerprint,
          now,
          retryUntil: now + 1000,
        }),
      ).toThrow('quote_expired_before_dispatch');
    }
  });
  it('rejects tampered persisted quotes', () => {
    expect(() =>
      assertPaymentAttemptReuse(
        { ...attempt(), quote: quote({ termsVersion: 'v2' }) },
        quote(),
        scope,
      ),
    ).toThrow('quote_fingerprint_mismatch');
  });
  it('pins quote and every provider scope dimension', () => {
    expect(assertPaymentAttemptReuse(attempt(), quote(), scope)).toEqual(
      attempt(),
    );
    expect(() =>
      assertPaymentAttemptReuse(
        attempt(),
        quote({ consentReceipt: 'receipt:2' }),
        scope,
      ),
    ).toThrow('attempt_quote_conflict');
    for (const changes of [
      { provider: 'stripe' },
      { environment: 'live' },
      { company: 'other' },
      { merchant: 'other' },
      { store: null },
      { endpointRegion: 'us' },
    ]) {
      expect(() =>
        assertPaymentAttemptReuse(attempt(), quote(), { ...scope, ...changes }),
      ).toThrow('attempt_scope_conflict');
    }
  });
  it.each([
    { offerKey: 'mcq-program-a-foundations', locale: 'en', finalAmount: 29900 },
    { offerKey: 'mcs-foundations-fr', locale: 'fr', finalAmount: 29900 },
    { offerKey: 'second-product-fixture', locale: 'en', finalAmount: 4900 },
  ])('uses identical contracts for $offerKey', (fixture) => {
    const q = quote({ ...fixture, originalAmount: fixture.finalAmount });
    expect(attempt(q).quote.offerKey).toBe(fixture.offerKey);
  });
  it('preserves the configured es-419 product locale identity', () => {
    expect(attempt(quote({ locale: 'es-419' })).quote.locale).toBe('es-419');
    for (const locale of ['es-41', 'es-latam', 'ES-419', 'es_419'])
      expect(() => attempt(quote({ locale }))).toThrow('invalid_contract');
  });
});

describe('durable-operation recovery decisions (not locks)', () => {
  it('keeps expired-lease/ambiguous dispatch on the exact operation', () => {
    expect(recover()).toBe('retry_same_operation');
    const unknown = recordPaymentOperationResult(operation(), 'unknown');
    expect(recover({ operation: unknown, now: quote().expiresAt + 1 })).toBe(
      'retry_same_operation',
    );
    expect(unknown.idempotencyKey).toBe(operation().idempotencyKey);
  });
  it('requires reconciliation at and beyond the retry deadline', () => {
    for (const now of [operation().retryUntil, operation().retryUntil + 1])
      expect(recover({ now })).toBe('reconcile');
  });
  it('never extends retry validity on a repeated ambiguous result', () => {
    const unknown = recordPaymentOperationResult(operation(), 'unknown');
    expect(recordPaymentOperationResult(unknown, 'unknown')).toEqual(unknown);
  });
  it('rejects an invalid or overlong retry horizon even when rehydrated', () => {
    for (const retryUntil of [NOW, NOW - 1, NOW + 7 * 24 * 60 * 60 * 1000]) {
      expect(() =>
        recover({ operation: { ...operation(), retryUntil } }),
      ).toThrow('invalid_retry_window');
    }
  });
  it('rejects request changes and scope rerouting for an existing operation', () => {
    expect(() => recover({ requestFingerprint: 'c'.repeat(64) })).toThrow(
      'operation_request_conflict',
    );
    expect(() =>
      recover({
        attempt: { ...attempt(), scope: { ...scope, environment: 'live' } },
      }),
    ).toThrow('operation_attempt_conflict');
    expect(() =>
      recover({ operation: { ...operation(), attemptId: OP } }),
    ).toThrow('operation_attempt_conflict');
    expect(() =>
      recover({
        attempt: createPaymentAttempt({
          attemptId: ID,
          quote: quote(),
          scope,
          paymentMethodCapabilities: ['card', 'ach_direct_debit'],
          now: NOW,
        }),
      }),
    ).toThrow('operation_attempt_conflict');
  });
  it('rejects clock rollback and invalid original dispatch time', () => {
    expect(() => recover({ now: NOW - 1 })).toThrow('clock_before_dispatch');
    expect(() =>
      recover({ operation: { ...operation(), firstDispatchAt: NOW - 1 } }),
    ).toThrow('operation_dispatch_time_conflict');
  });
  it('reuses only an unexpired session and never silently replaces it', () => {
    const available = recordPaymentOperationResult(
      operation(),
      'session_available',
      NOW + 1000,
    );
    expect(recover({ operation: available })).toBe('reuse_session');
    expect(recover({ operation: available, now: NOW + 1000 })).toBe(
      'reconcile',
    );
    expect(() => recordPaymentOperationResult(available, 'unknown')).toThrow(
      'operation_result_conflict',
    );
    expect(() =>
      recordPaymentOperationResult(available, 'session_available', NOW + 2000),
    ).toThrow('session_expiry_conflict');
  });
  it('requires a session expiry and stops a confirmed permanent failure', () => {
    expect(() =>
      recordPaymentOperationResult(operation(), 'session_available'),
    ).toThrow('invalid_session_expiry');
    const failed = recordPaymentOperationResult(
      operation(),
      'permanent_failure',
    );
    expect(recover({ operation: failed })).toBe('stop');
    expect(() =>
      recordPaymentOperationResult(failed, 'session_available', NOW + 1000),
    ).toThrow('operation_result_conflict');
  });
});

describe('scoped immutable financial evidence', () => {
  it('does not invent settlement or fulfillment from authorization', () => {
    expect(project([fact()])).toEqual({
      pending: false,
      authorization: 'authorized',
      capturedAmount: 0,
      captureFailed: false,
      refundedAmount: 0,
      refundFailed: false,
      refundReversedAmount: 0,
      chargebackAmount: 0,
      chargebackReversedAmount: 0,
      canceled: false,
      expired: false,
      evidenceState: 'consistent',
      exceptions: [],
      settlement: 'unproven',
      fulfillment: 'not_evaluated',
    });
  });
  it('deduplicates delivery IDs and operation IDs independently', () => {
    expect(
      project([
        fact(),
        capture(),
        capture(),
        capture({ deliveryId: 'retry:1' }),
      ]),
    ).toEqual(project([fact(), capture()]));
  });
  it('counts distinct partial captures/refunds, not failed child operations', () => {
    const result = project([
      fact(),
      capture({ amount: 10000 }),
      capture({
        deliveryId: 'c:2',
        operationReference: 'capture:2',
        amount: 19900,
      }),
      refund({ amount: 1000 }),
      refund({
        deliveryId: 'r:2',
        operationReference: 'refund:2',
        amount: 500,
        success: false,
      }),
    ]);
    expect(result).toMatchObject({
      capturedAmount: 29900,
      refundedAmount: 1000,
      evidenceState: 'consistent',
    });
  });
  it('keeps missing predecessor evidence pending and resolves after late arrival', () => {
    expect(project([capture(), refund()]).evidenceState).toBe(
      'awaiting_prior_evidence',
    );
    expect(project([refund()]).evidenceState).toBe('awaiting_prior_evidence');
    expect(project([refund(), capture(), fact()]).evidenceState).toBe(
      'consistent',
    );
  });
  it.each([
    { amount: 1 },
    { currency: 'EUR' },
    { attemptId: OP },
    { paymentReference: 'wrong' },
    { scope: { ...scope, merchant: 'wrong' } },
    { scope: { ...scope, environment: 'live' } },
    { scope: { ...scope, endpointRegion: 'us' } },
    { amount: 29901 },
    { amount: 0 },
    { success: 'true' },
    { kind: 'dispute' },
  ])('rejects bad scope/amount/type instead of admitting it %o', (changes) => {
    expect(() => project([{ ...fact(), ...changes }])).toThrow();
  });
  it('makes a repeated delivery with a changed payload an exception', () => {
    expect(project([fact(), fact({ success: false })])).toMatchObject({
      authorization: 'conflict',
      capturedAmount: 0,
      evidenceState: 'conflict',
      exceptions: ['delivery_payload_conflict', 'operation_payload_conflict'],
    });
  });
  it('makes a late refund failure conflict, never last-event-wins', () => {
    const events = [
      fact(),
      capture(),
      refund(),
      refund({ deliveryId: 'r:late', success: false }),
    ];
    expect(project(events)).toEqual(project([...events].reverse()));
    expect(project(events).exceptions).toContain('operation_payload_conflict');
  });
  it('detects aggregate overcapture/overrefund without integer overflow', () => {
    expect(
      project([
        fact(),
        capture(),
        capture({ deliveryId: 'c:2', operationReference: 'capture:2' }),
      ]).exceptions,
    ).toContain('capture_exceeds_payment');
    expect(
      project([
        fact(),
        capture(),
        refund(),
        refund({ deliveryId: 'r:2', operationReference: 'refund:2' }),
      ]).exceptions,
    ).toContain('refund_exceeds_payment');
    const q = quote({
      originalAmount: Number.MAX_SAFE_INTEGER,
      finalAmount: Number.MAX_SAFE_INTEGER,
    });
    expect(
      projectPaymentEvidence({
        attempt: attempt(q),
        paymentReference: 'psp:test',
        facts: [
          capture({ amount: Number.MAX_SAFE_INTEGER }),
          capture({
            deliveryId: 'c:2',
            operationReference: 'capture:2',
            amount: Number.MAX_SAFE_INTEGER,
          }),
        ],
      }).capturedAmount,
    ).toBe(0);
    expect(
      project([
        fact({
          kind: 'chargeback_reversed',
          operationReference: 'dispute:1',
        }),
        fact({
          kind: 'chargeback_reversed',
          operationReference: 'dispute:2',
          deliveryId: 'chargeback-reversed:2',
        }),
      ]).exceptions,
    ).toContain('chargeback_reversal_exceeds_payment');
  });
  it('holds a capture after refusal as an owned conflict', () => {
    expect(project([fact({ success: false }), capture()]).exceptions).toEqual([
      'capture_after_refusal',
    ]);
  });
  it('holds a successful refund after refusal even without a capture fact', () => {
    const events = [fact({ success: false }), refund({ amount: 1000 })];
    for (const order of [events, [...events].reverse()]) {
      expect(project(order)).toMatchObject({
        authorization: 'conflict',
        evidenceState: 'conflict',
        capturedAmount: 0,
        refundedAmount: 0,
        exceptions: ['refund_after_refusal'],
      });
    }
    expect(
      project([fact({ success: false }), refund({ success: false })]),
    ).toMatchObject({
      authorization: 'refused',
      evidenceState: 'consistent',
      exceptions: [],
    });
  });
  it('projects pending, late capture/refund failures and chargeback returns without last-event-wins', () => {
    const lifecycle = (kind: PaymentFact['kind'], operationReference: string) =>
      fact({
        deliveryId: `delivery:${kind}`,
        kind,
        operationReference,
      });
    const facts = [
      lifecycle('pending', 'psp:test'),
      fact(),
      lifecycle('capture', 'capture:2'),
      lifecycle('capture_failed', 'capture:2'),
      lifecycle('refund', 'refund:2'),
      lifecycle('refund_failed', 'refund:2'),
      lifecycle('refund_reversed', 'refund:3'),
      lifecycle('chargeback', 'dispute:1'),
    ];
    const expected = project(facts);
    expect(expected).toMatchObject({
      pending: true,
      authorization: 'authorized',
      capturedAmount: 0,
      captureFailed: true,
      refundedAmount: 0,
      refundFailed: true,
      refundReversedAmount: 29900,
      chargebackAmount: 29900,
      chargebackReversedAmount: 0,
      settlement: 'unproven',
      fulfillment: 'not_evaluated',
    });
    expect(project([...facts].reverse())).toEqual(expected);
    expect(
      project([
        fact(),
        lifecycle('chargeback', 'dispute:1'),
        lifecycle('chargeback_reversed', 'dispute:1'),
      ]),
    ).toMatchObject({
      chargebackAmount: 0,
      chargebackReversedAmount: 29900,
    });
  });
  it('is deterministic for every permutation, including conflicting evidence', () => {
    function permutations<T>(items: T[]): T[][] {
      return items.length === 0
        ? [[]]
        : items.flatMap((item, i) =>
            permutations(items.filter((_, j) => i !== j)).map((rest) => [
              item,
              ...rest,
            ]),
          );
    }
    for (const events of [
      [
        fact(),
        capture(),
        refund({ amount: 1000 }),
        capture({ deliveryId: 'c:retry' }),
      ],
      [
        fact(),
        fact({ deliveryId: 'a:2', success: false }),
        capture(),
        refund(),
      ],
      [capture(), capture({ amount: 1 }), refund(), fact()],
    ]) {
      const expected = project(events);
      for (const order of permutations(events))
        expect(project(order)).toEqual(expected);
    }
  });
  it('does not mutate supplied evidence or attempt data', () => {
    const input = [fact(), capture()];
    const before = structuredClone(input);
    project(input);
    expect(input).toEqual(before);
  });
});
