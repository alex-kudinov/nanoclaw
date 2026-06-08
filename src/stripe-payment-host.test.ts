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

describe('handleStripePayment', () => {
  it('runs the script and returns the verbatim summary', async () => {
    const r = await handleStripePayment({
      stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7',
      event_type: 'payment_intent.succeeded',
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

  it('routes a charge.refunded event to mark-refunds.cjs --id --apply', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_3TYdEFRnZI4gH1uA1dVO93l7',
      event_type: 'charge.refunded',
    });
    const args = vi.mocked(execFile).mock.calls.at(-1)![1] as string[];
    expect(args[0]).toMatch(/mark-refunds\.cjs$/);
    expect(args).toContain('--id');
    expect(args).toContain('pi_3TYdEFRnZI4gH1uA1dVO93l7');
    expect(args).toContain('--apply');
  });

  it('does NOT route a payment_intent.succeeded event to the refund script', async () => {
    const { execFile } = await import('child_process');
    await handleStripePayment({
      stripe_id: 'pi_abc',
      event_type: 'payment_intent.succeeded',
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
