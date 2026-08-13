/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  StripePayloadError,
} from './stripe-payment-host.js';

beforeEach(() => {
  // Default: the script succeeds with a summary.
  execFileImpl = (_file: string, _args: string[], _opts: any, cb: any) =>
    cb(null, {
      stdout: '[PAYMENT RECEIVED]\nProduct: MCS - Standard path\n',
      stderr: '',
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
    expect(parsed.summary).not.toContain(encoded);
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
  });

  it('invokes process-payment.cjs with the stripe id', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({ stripe_id: 'cs_abc123' });
    const call = vi.mocked(execFile).mock.calls.at(-1)!;
    expect(call[0]).toBe(process.execPath);
    expect((call[1] as string[])[0]).toMatch(/process-payment\.cjs$/);
    expect((call[1] as string[])[1]).toBe('cs_abc123');
  });

  it('pins the processor to the perimeter-derived Stripe account', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({ stripe_id: 'pi_abc123', account: 'tandem' });
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

  it('propagates a script failure', async () => {
    execFileImpl = (_f: string, _a: string[], _o: any, cb: any) =>
      cb(new Error('[EL CONTADOR] ERROR: Stripe 404'), {
        stdout: '',
        stderr: '',
      });
    await expect(handleStripePayment({ stripe_id: 'pi_dead' })).rejects.toThrow(
      /EL CONTADOR/,
    );
  });
});
