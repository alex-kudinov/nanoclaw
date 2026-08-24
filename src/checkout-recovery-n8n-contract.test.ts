import fs from 'fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../setup/vps/n8n-stripe-lifecycle-extractor.js', import.meta.url),
  'utf8',
);

function run(account: 'heartbeat' | 'tandem', event: Record<string, unknown>) {
  const code = source.replace("'__ACCOUNT__'", `'${account}'`);
  const execute = new Function('$input', code) as (input: {
    first: () => { json: Record<string, unknown> };
  }) => Array<{ json: Record<string, unknown> }>;
  return execute({ first: () => ({ json: event }) });
}

describe('fixed-account Stripe recovery extractor', () => {
  it('admits failure and expiry without trusting caller account', () => {
    const failed = run('tandem', {
      id: 'evt_abc1234567890',
      type: 'payment_intent.payment_failed',
      created: 1787594400,
      account: 'heartbeat',
      data: {
        object: {
          id: 'pi_abc1234567890',
          amount: 399900,
          currency: 'usd',
          metadata: { product: 'acc-full', email: 'buyer@example.com' },
        },
      },
    });
    expect(failed[0].json).toMatchObject({
      account: 'tandem',
      event_type: 'payment_intent.payment_failed',
      stripe_id: 'pi_abc1234567890',
      product_slug: 'acc-full',
    });
    const expired = run('heartbeat', {
      id: 'evt_expired1234567890',
      type: 'checkout.session.expired',
      created: 1787594400,
      data: {
        object: {
          id: 'cs_live_abc1234567890',
          amount_total: 99900,
          currency: 'usd',
          customer_details: { email: 'learner@example.com' },
        },
      },
    });
    expect(expired[0].json).toMatchObject({
      account: 'heartbeat',
      event_type: 'checkout.session.expired',
      checkout_session_id: 'cs_live_abc1234567890',
      consent_state: 'unknown',
    });
  });

  it('preserves the completed payment/refund allowlist and drops unrelated events', () => {
    for (const allowed of [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'checkout.session.completed',
      'checkout.session.expired',
      'charge.refunded',
    ]) {
      expect(source).toContain(`'${allowed}'`);
    }
    expect(
      run('tandem', {
        id: 'evt_abc1234567890',
        type: 'customer.updated',
        data: { object: { id: 'cus_abc1234567890' } },
      }),
    ).toEqual([]);
  });

  it('never forwards provider recovery URLs or raw payloads', () => {
    expect(source).not.toContain('after_expiration.recovery.url');
    expect(source).not.toContain('raw_body');
    expect(source).not.toContain('JSON.stringify(raw)');
  });
});
