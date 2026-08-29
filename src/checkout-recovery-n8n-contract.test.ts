import fs from 'fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../setup/vps/n8n-stripe-lifecycle-extractor.js', import.meta.url),
  'utf8',
);
const patch = JSON.parse(
  fs.readFileSync(
    new URL(
      '../setup/n8n/checkout-failure-workflow-patch.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  workflows: Array<{
    id: string;
    nodes: Array<{ name: string; operation: string; value?: string }>;
  }>;
};

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
          customer: 'cus_abc1234567890',
          receipt_email: 'buyer@example.com',
          description: 'ACC Level 1 Full Program',
          metadata: { product: 'acc-full', email: 'buyer@example.com' },
          last_payment_error: {
            code: 'card_declined',
            decline_code: 'do_not_honor',
            advice_code: 'do_not_try_again',
            message: 'The card was declined.',
            payment_method: { card: { brand: 'visa', last4: '3188' } },
          },
        },
      },
    });
    expect(failed[0].json).toMatchObject({
      account: 'tandem',
      event_type: 'payment_intent.payment_failed',
      stripe_id: 'pi_abc1234567890',
      product_slug: 'acc-full',
      customer_id: 'cus_abc1234567890',
      product_name: 'ACC Level 1 Full Program',
      failure_code: 'card_declined',
      decline_code: 'do_not_honor',
      advice_code: 'do_not_try_again',
      payment_method_brand: 'visa',
      payment_method_last4: '3188',
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

  it('forwards the complete normalized extractor output instead of an ID-only body', () => {
    const stripe = patch.workflows.find(
      (workflow) => workflow.id === 'stripe-payment',
    );
    const post = stripe?.nodes.find(
      (node) => node.name === 'POST to El Contador',
    );
    expect(post).toMatchObject({
      operation: 'replace_json_body',
      value: '={{ JSON.stringify($json) }}',
    });
  });
});
