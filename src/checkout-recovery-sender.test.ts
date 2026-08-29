import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_RECOVERY_ENCHARGE_EVENT,
  checkoutReminderPolicyAllows,
  dispatchCheckoutRecoveryToEncharge,
  type CheckoutRecoveryClaimedIntent,
  type CheckoutRecoverySendConfig,
} from './checkout-recovery-sender.js';

const intent: CheckoutRecoveryClaimedIntent = {
  intentId: 1,
  intentUuid: '11111111-1111-4111-8111-111111111111',
  leaseToken: '22222222-2222-4222-8222-222222222222',
  caseId: 2,
  caseUuid: '33333333-3333-4333-8333-333333333333',
  touch: 1,
  attemptNumber: 1,
  payload: {
    name: CHECKOUT_RECOVERY_ENCHARGE_EVENT,
    user: {
      email: 'pilot@example.com',
      checkout_recovery_product_name: 'ACC Level 1 Full Program',
      checkout_recovery_return_url: 'https://tandemcoach.co/acc/',
      checkout_recovery_subject: 'We can help with your checkout',
      checkout_recovery_guidance_title: 'Your checkout is still available',
      checkout_recovery_guidance_body:
        'You started checkout but it was not completed.',
      checkout_recovery_support_url: 'https://tandemcoach.co/contact-us/',
    },
    properties: {
      touch: 1,
      locale: 'en',
      program_slug: 'acc',
      product_slug: 'acc-full',
      product_name: 'ACC Level 1 Full Program',
      return_url: 'https://tandemcoach.co/acc/',
      amount_cents: 399900,
      currency: 'usd',
      case_ref: '33333333-3333-4333-8333-333333333333',
      intent_ref: '11111111-1111-4111-8111-111111111111',
      mode: 'pilot',
      guidance_key: 'checkout_incomplete',
      failure_specific: false,
    },
  },
};

const config: CheckoutRecoverySendConfig = {
  mode: 'pilot',
  activatedAt: new Date('2026-08-24T22:00:00Z'),
  pilotEmailSha256: 'a'.repeat(64),
  pilotTouch2DelayMinutes: 5,
  enchargeWriteKey: 'encharge-write-key-for-test',
};

describe('checkout recovery Encharge handoff', () => {
  it('sends one minimized event and accepts only provider 2xx', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { status: 200 }),
    );
    await dispatchCheckoutRecoveryToEncharge(intent, config, fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(intent.payload);
    expect(body.properties).not.toHaveProperty('payment_intent_id');
    expect(body.properties).not.toHaveProperty('checkout_token');
    expect(init?.headers).toMatchObject({
      'X-Encharge-Token': config.enchargeWriteKey,
    });
  });

  it('fails closed on provider rejection or missing key', async () => {
    await expect(
      dispatchCheckoutRecoveryToEncharge(
        intent,
        config,
        vi.fn(
          async (_input: string | URL | Request, _init?: RequestInit) =>
            new Response('', { status: 503 }),
        ),
      ),
    ).rejects.toThrow('encharge_http_503');
    await expect(
      dispatchCheckoutRecoveryToEncharge(
        intent,
        { ...config, enchargeWriteKey: '' },
        vi.fn(),
      ),
    ).rejects.toThrow('encharge_write_key_unavailable');
  });

  it('accepts only affirmative v2/v3 reminder policies', () => {
    for (const policy of [
      'checkout-reminder-v2',
      'checkout-reminder-v3-explicit',
      'checkout-reminder-v3-legacy-explicit',
      'checkout-reminder-v3-uk-softoptin',
      'checkout-reminder-v3-us-optout',
    ]) {
      expect(checkoutReminderPolicyAllows(policy)).toBe(true);
    }
    for (const policy of [
      null,
      'checkout-reminder-v3-user-optout',
      'checkout-reminder-v3-strict-no-consent',
      'checkout-reminder-v3-unknown-no-consent',
      'checkout-reminder-v3-legacy-denied',
    ]) {
      expect(checkoutReminderPolicyAllows(policy)).toBe(false);
    }
  });

  it('contains cross-case purchase, consent, cutoff, and allowlist guards', () => {
    const source = fs.readFileSync(
      new URL('./checkout-recovery-sender.ts', import.meta.url),
      'utf8',
    );
    for (const guard of [
      'purchased_at >= $4::timestamptz',
      '!checkoutReminderPolicyAllows(item.consentPolicyVersion)',
      "'pre_activation_case'",
      "'not_allowlisted'",
      "'sibling_purchase'",
      "'touch_one_not_accepted'",
      "'lease_expired_dispatch_ambiguous'",
      "interval '10 minutes'",
      'claimedEmailDigests',
      'pg_advisory_xact_lock',
      'checkout-recovery-claim-global',
      "other_intent.status = 'leased'",
    ]) {
      expect(source).toContain(guard);
    }
  });
});
