/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveSource = vi.hoisted(() => vi.fn());
const mockBeginFulfillment = vi.hoisted(() => vi.fn());
const mockFinalizeFulfillment = vi.hoisted(() => vi.fn());

vi.mock('./stripe-payment-source.js', () => ({
  resolveStripePaymentSource: mockResolveSource,
}));
vi.mock('./contador-payment-fulfillment-store.js', () => ({
  beginContadorFulfillment: mockBeginFulfillment,
  finalizeContadorFulfillment: mockFinalizeFulfillment,
}));

vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nc-test/data' }));
vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({})) }));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let execFileImpl: any;
vi.mock('child_process', () => ({
  execFile: vi.fn((...args: any[]) => execFileImpl(...args)),
}));

import {
  parseStripePayload,
  parseEventType,
  parseStripeAccount,
  parseLifecycleSentinel,
  handleStripePayment,
  StripeFulfillmentInFlightError,
  StripePayloadError,
} from './stripe-payment-host.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXTERNAL_WRITE_SAFE_MODE;
  mockResolveSource.mockImplementation(async (input: any) => ({
    stripeAccount: input.stripeAccount,
    paymentIntentId: input.stripeId.startsWith('cs_')
      ? 'pi_from_checkout'
      : input.stripeId,
    sourceObjectId: input.stripeId,
    sourceEventId: input.providerEventId ?? `stripe:${input.eventType}`,
    eventType: input.eventType,
    observedAt: '2026-08-24T03:00:00.000Z',
    aliases: [
      {
        kind: 'payment_intent',
        id: input.stripeId.startsWith('cs_')
          ? 'pi_from_checkout'
          : input.stripeId,
      },
    ],
  }));
  mockBeginFulfillment.mockResolvedValue({
    duplicateComplete: false,
    inFlight: false,
    leaseToken: '00000000-0000-4000-8000-000000000001',
    item: {
      id: '42',
      state: 'processing',
      version: 0,
      attemptCount: 1,
    },
  });
  mockFinalizeFulfillment.mockImplementation(async (input: any) => ({
    id: input.caseId,
    stripeAccount: 'heartbeat',
    paymentIntentId: 'pi_test',
    state: input.state,
    version: input.expectedVersion,
    attemptCount: 1,
    ownerGroup: 'contador',
    lastEventType: 'payment_intent.succeeded',
    lastSourceObjectId: 'pi_test',
    lastSourceEventId: input.sourceEventId,
    lastErrorCode: input.errorCode,
    lastEvidenceSha256: 'a'.repeat(64),
    reviewDeadline: input.state === 'complete' ? null : '2026-08-25T03:00:00Z',
    resolvedAt: input.state === 'complete' ? '2026-08-24T03:00:00Z' : null,
  }));
  // Default: the script succeeds with a private fulfillment receipt.
  execFileImpl = (_file: string, args: string[], _opts: any, cb: any) => {
    const isRefund = args[0].endsWith('mark-refunds.cjs');
    const sourceObjectId = isRefund ? args[args.indexOf('--id') + 1] : args[1];
    const account = args[args.indexOf('--account') + 1];
    const paymentIntentId = sourceObjectId.startsWith('cs_')
      ? 'pi_from_checkout'
      : sourceObjectId;
    const fulfillment = {
      version: 1,
      stripeAccount: account,
      paymentIntentId,
      sourceObjectId,
      state: isRefund ? 'needs_review' : 'complete',
      errorCode: isRefund ? 'refund_fulfillment_review_required' : null,
      aliases: [{ kind: 'payment_intent', id: paymentIntentId }],
      receipts: [
        {
          stage: 'stripe_source',
          outcome: 'verified',
          resultCode: 'stripe_source_resolved',
        },
        {
          stage: 'payment_log',
          outcome: 'verified',
          resultCode: 'payment_log_readback_verified',
        },
        {
          stage: 'postgres_payment',
          outcome: isRefund ? 'not_applicable' : 'verified',
          resultCode: isRefund
            ? 'refund_postgres_receipt_not_implemented'
            : 'postgres_payment_readback_verified',
        },
        {
          stage: isRefund ? 'refund_fulfillment' : 'student_roster',
          outcome: isRefund ? 'exception' : 'verified',
          resultCode: isRefund
            ? 'refund_fulfillment_review_required'
            : 'student_roster_readback_verified',
        },
      ],
    };
    cb(null, {
      stdout:
        '[PAYMENT RECEIVED]\nProduct: MCS - Standard path\n' +
        `__CONTADOR_FULFILLMENT__${Buffer.from(JSON.stringify(fulfillment)).toString('base64url')}\n`,
      stderr: '',
    });
  };
});

describe('Stripe external-write brake', () => {
  it('denies before invoking the payment processor', async () => {
    const invocation = vi.fn();
    execFileImpl = (...args: any[]) => invocation(...args);
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    try {
      await expect(
        handleStripePayment({
          stripe_id: 'pi_abc123',
          event_type: 'payment_intent.succeeded',
          account: 'heartbeat',
        }),
      ).rejects.toMatchObject({
        name: 'ExternalWriteDeniedError',
        code: 'global_safe_mode',
      });
      expect(invocation).not.toHaveBeenCalled();
      expect(mockBeginFulfillment).not.toHaveBeenCalled();
      expect(mockFinalizeFulfillment).not.toHaveBeenCalled();
    } finally {
      delete process.env.EXTERNAL_WRITE_SAFE_MODE;
    }
  });
});

describe('parseStripePayload', () => {
  it('accepts a payment intent id', () => {
    expect(
      parseStripePayload({ stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7' }),
    ).toBe('pi_3TYdEFRnZI4gH1uA1dVO93l7');
  });
  it('accepts a checkout session id', () => {
    expect(parseStripePayload({ stripe_id: 'cs_test_abc123XYZ' })).toBe(
      'cs_test_abc123XYZ',
    );
  });
  it('trims surrounding whitespace', () => {
    expect(parseStripePayload({ stripe_id: '  pi_abc123  ' })).toBe(
      'pi_abc123',
    );
  });
  it('rejects a non-pi/cs id (e.g. an event id)', () => {
    expect(() => parseStripePayload({ stripe_id: 'evt_123abc' })).toThrow(
      StripePayloadError,
    );
  });
  it('rejects a missing stripe_id', () => {
    expect(() =>
      parseStripePayload({ event_type: 'payment_intent.succeeded' }),
    ).toThrow(StripePayloadError);
  });
  it('rejects a non-object payload', () => {
    expect(() => parseStripePayload(null)).toThrow(StripePayloadError);
  });
});

describe('parseEventType', () => {
  it('reads the event_type', () => {
    expect(parseEventType({ event_type: 'charge.refunded' })).toBe(
      'charge.refunded',
    );
  });
  it('returns empty string when absent or non-object', () => {
    expect(parseEventType({ stripe_id: 'pi_x' })).toBe('');
    expect(parseEventType(null)).toBe('');
  });
});

describe('parseStripeAccount', () => {
  it('accepts the two perimeter-derived account labels', () => {
    expect(parseStripeAccount({ account: 'heartbeat' })).toBe('heartbeat');
    expect(parseStripeAccount({ account: 'tandem' })).toBe('tandem');
  });

  it('keeps legacy envelopes compatible but rejects invented labels', () => {
    expect(parseStripeAccount({})).toBeNull();
    expect(() => parseStripeAccount({ account: 'caller-controlled' })).toThrow(
      StripePayloadError,
    );
  });
});

describe('parseLifecycleSentinel', () => {
  it('strips the private structured line from the Slack summary', () => {
    const fact = {
      eligible: true,
      event_name: 'purchase_completed',
      account: 'heartbeat',
      canonical_transaction_id: 'pi_123',
      occurred_at: '2026-08-12T12:00:00.000Z',
    };
    const encoded = Buffer.from(JSON.stringify(fact)).toString('base64url');
    const parsed = parseLifecycleSentinel(
      `[PAYMENT RECEIVED]\n__CHAOS_LIFECYCLE__${encoded}\n`,
    );
    expect(parsed.summary).toBe('[PAYMENT RECEIVED]');
    expect(parsed.fact).toEqual(fact);
    expect(parsed.fulfillment).toBeNull();
    expect(parsed.summary).not.toContain(encoded);
  });

  it('strips and returns the private fulfillment result', () => {
    const fulfillment = {
      version: 1,
      stripeAccount: 'heartbeat',
      paymentIntentId: 'pi_123',
      sourceObjectId: 'pi_123',
      state: 'needs_product',
      errorCode: 'product_mapping_missing',
      aliases: [{ kind: 'payment_intent', id: 'pi_123' }],
      receipts: [],
    };
    const encoded = Buffer.from(JSON.stringify(fulfillment)).toString(
      'base64url',
    );
    const parsed = parseLifecycleSentinel(
      `[PAYMENT RECEIVED]\n__CONTADOR_FULFILLMENT__${encoded}\n`,
    );
    expect(parsed.summary).toBe('[PAYMENT RECEIVED]');
    expect(parsed.fulfillment).toEqual(fulfillment);
  });
});

describe('handleStripePayment', () => {
  it('runs the script and returns the verbatim summary', async () => {
    const r = await handleStripePayment({
      stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7',
      event_type: 'payment_intent.succeeded',
      account: 'heartbeat',
    });
    expect(r.stripeId).toBe('pi_3TYdEFRnZI4gH1uA1dVO93l7');
    expect(r.summary).toContain('MCS - Standard path');
    expect(r).toMatchObject({
      fulfillmentCaseId: '42',
      fulfillmentState: 'complete',
      fulfillmentVersion: 0,
      duplicateComplete: false,
    });
    expect(mockFinalizeFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: '42',
        expectedVersion: 0,
        state: 'complete',
      }),
    );
  });

  it('acknowledges an owned needs_product exception without pretending complete', async () => {
    execFileImpl = (_file: string, args: string[], _opts: any, cb: any) => {
      const fulfillment = {
        version: 1,
        stripeAccount: 'heartbeat',
        paymentIntentId: args[1],
        sourceObjectId: args[1],
        state: 'needs_product',
        errorCode: 'product_mapping_missing',
        aliases: [{ kind: 'payment_intent', id: args[1] }],
        receipts: [
          {
            stage: 'stripe_source',
            outcome: 'verified',
            resultCode: 'stripe_source_resolved',
          },
          {
            stage: 'payment_log',
            outcome: 'verified',
            resultCode: 'payment_log_readback_verified',
          },
          {
            stage: 'postgres_payment',
            outcome: 'verified',
            resultCode: 'postgres_payment_readback_verified',
          },
          {
            stage: 'student_roster',
            outcome: 'exception',
            resultCode: 'product_mapping_missing',
          },
        ],
      };
      cb(null, {
        stdout: `summary\n__CONTADOR_FULFILLMENT__${Buffer.from(JSON.stringify(fulfillment)).toString('base64url')}\n`,
        stderr: '',
      });
    };
    const result = await handleStripePayment({
      stripe_id: 'pi_unmapped',
      event_type: 'payment_intent.succeeded',
      account: 'heartbeat',
    });
    expect(result.fulfillmentState).toBe('needs_product');
    expect(mockFinalizeFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'needs_product',
        errorCode: 'product_mapping_missing',
      }),
    );
  });

  it('does not rerun external writes for a case already verified complete', async () => {
    mockBeginFulfillment.mockResolvedValueOnce({
      duplicateComplete: true,
      inFlight: false,
      leaseToken: null,
      item: { id: '42', state: 'complete', version: 2, attemptCount: 2 },
    });
    const invocation = vi.fn();
    execFileImpl = (...args: any[]) => invocation(...args);
    const result = await handleStripePayment({
      stripe_id: 'pi_replay',
      event_type: 'payment_intent.succeeded',
      account: 'heartbeat',
    });
    expect(invocation).not.toHaveBeenCalled();
    expect(mockFinalizeFulfillment).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fulfillmentState: 'complete',
      duplicateComplete: true,
    });
  });

  it('keeps a concurrent delivery retryable without starting a second processor', async () => {
    mockBeginFulfillment.mockResolvedValueOnce({
      duplicateComplete: false,
      inFlight: true,
      leaseToken: null,
      item: { id: '42', state: 'processing', version: 0, attemptCount: 1 },
    });
    const invocation = vi.fn();
    execFileImpl = (...args: any[]) => invocation(...args);
    await expect(
      handleStripePayment({
        stripe_id: 'pi_concurrent',
        event_type: 'payment_intent.succeeded',
        account: 'heartbeat',
      }),
    ).rejects.toBeInstanceOf(StripeFulfillmentInFlightError);
    expect(invocation).not.toHaveBeenCalled();
    expect(mockFinalizeFulfillment).not.toHaveBeenCalled();
  });

  it('invokes process-payment.cjs with the stripe id', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'cs_abc123',
      event_type: 'checkout.session.completed',
      account: 'heartbeat',
    });
    const call = vi.mocked(execFile).mock.calls.at(-1)!;
    expect(call[0]).toBe(process.execPath);
    expect((call[1] as string[])[0]).toMatch(/process-payment\.cjs$/);
    expect((call[1] as string[])[1]).toBe('cs_abc123');
  });

  it('pins the processor to the perimeter-derived Stripe account', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_abc123',
      event_type: 'payment_intent.succeeded',
      account: 'tandem',
    });
    const args = vi.mocked(execFile).mock.calls.at(-1)![1] as string[];
    expect(args).toEqual(
      expect.arrayContaining(['pi_abc123', '--account', 'tandem']),
    );
  });

  it('routes a charge.refunded event to mark-refunds.cjs --id --apply', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7',
      event_type: 'charge.refunded',
      account: 'heartbeat',
    });
    const args = vi.mocked(execFile).mock.calls.at(-1)![1] as string[];
    expect(args[0]).toMatch(/mark-refunds\.cjs$/);
    expect(args).toContain('--id');
    expect(args).toContain('pi_3TYdEFRnZI4gH1uA1dVO93l7');
    expect(args).toContain('--apply');
  });

  it('passes the exact refund and provider event ids to the refund path', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7',
      event_type: 'charge.refunded',
      account: 'heartbeat',
      event_id: 'evt_1234567890abc',
      refund_id: 're_1234567890abc',
    });
    const args = vi.mocked(execFile).mock.calls.at(-1)![1] as string[];
    expect(args).toEqual(
      expect.arrayContaining([
        '--account',
        'heartbeat',
        '--refund-id',
        're_1234567890abc',
      ]),
    );
  });

  it('does NOT route a payment_intent.succeeded event to the refund script', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_abc',
      event_type: 'payment_intent.succeeded',
      account: 'tandem',
    });
    const args = vi.mocked(execFile).mock.calls.at(-1)![1] as string[];
    expect(args[0]).toMatch(/process-payment\.cjs$/);
    expect(args).not.toContain('--apply');
  });

  it('rejects an invalid payload before spawning anything', async () => {
    await expect(handleStripePayment({ stripe_id: 'bogus' })).rejects.toThrow(
      StripePayloadError,
    );
  });

  it('rejects typed payment and refund events without an account label', async () => {
    await expect(
      handleStripePayment({
        stripe_id: 'pi_missing_account',
        event_type: 'payment_intent.succeeded',
      }),
    ).rejects.toThrow(StripePayloadError);
    await expect(
      handleStripePayment({
        stripe_id: 'pi_missing_account',
        event_type: 'charge.refunded',
      }),
    ).rejects.toThrow(StripePayloadError);
  });

  it('rejects an untyped legacy envelope before ledger admission', async () => {
    await expect(
      handleStripePayment({ stripe_id: 'pi_untyped' }),
    ).rejects.toThrow(StripePayloadError);
    expect(mockBeginFulfillment).not.toHaveBeenCalled();
  });

  it('persists an exception when processor completion omits a readback stage', async () => {
    execFileImpl = (_file: string, args: string[], _opts: any, cb: any) => {
      const fulfillment = {
        version: 1,
        stripeAccount: 'heartbeat',
        paymentIntentId: args[1],
        sourceObjectId: args[1],
        state: 'complete',
        errorCode: null,
        aliases: [{ kind: 'payment_intent', id: args[1] }],
        receipts: [
          {
            stage: 'stripe_source',
            outcome: 'verified',
            resultCode: 'stripe_source_resolved',
          },
          {
            stage: 'payment_log',
            outcome: 'verified',
            resultCode: 'payment_log_readback_verified',
          },
        ],
      };
      cb(null, {
        stdout: `__CONTADOR_FULFILLMENT__${Buffer.from(JSON.stringify(fulfillment)).toString('base64url')}\n`,
        stderr: '',
      });
    };
    await expect(
      handleStripePayment({
        stripe_id: 'pi_incomplete',
        event_type: 'payment_intent.succeeded',
        account: 'heartbeat',
      }),
    ).rejects.toThrow('incomplete Stripe processor stage receipts');
    expect(mockFinalizeFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'write_failed',
        errorCode: 'processor_failed',
      }),
    );
  });

  it('propagates a script failure', async () => {
    execFileImpl = (_f: string, _a: string[], _o: any, cb: any) =>
      cb(new Error('[EL CONTADOR] ERROR: Stripe 404'), {
        stdout: '',
        stderr: '',
      });
    await expect(
      handleStripePayment({
        stripe_id: 'pi_dead',
        event_type: 'payment_intent.succeeded',
        account: 'heartbeat',
      }),
    ).rejects.toThrow(/EL CONTADOR/);
    expect(mockFinalizeFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'write_failed',
        errorCode: 'processor_failed',
      }),
    );
  });
});
