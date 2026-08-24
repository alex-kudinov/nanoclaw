import crypto from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  checkoutRecoveryArchiveEnvelope,
  checkoutEligibility,
  nextCheckoutRecoveryState,
  prepareStripeCheckoutRecoveryEnvelope,
  prepareWebsiteCheckoutRecoveryEnvelope,
  verifyCheckoutRecoverySignature,
  type PreparedCheckoutRecoveryEvent,
} from './checkout-recovery.js';

const IDENTITY_SECRET = 'checkout-recovery-test-identity-secret-12345';
const RELAY_SECRET = 'checkout-recovery-test-relay-secret-123456';
const TOKEN = 'A'.repeat(32);

function website(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    source_event_key: `tw:v1:${TOKEN}:captured`,
    event_type: 'checkout.captured',
    observed_at: '2026-08-24T18:00:00.000Z',
    checkout_token: TOKEN,
    email: 'Buyer@Example.com',
    program_slug: 'acc',
    product_slug: 'acc-full',
    amount_cents: 399900,
    currency: 'USD',
    consent_state: false,
    consent_policy_version: 'checkout-reminder-v2',
    locale: 'en',
    return_url: 'https://tandemcoach.co/acc/?source=checkout#pay',
    product_name: 'ACC Level 1 Full Program',
    ...overrides,
  };
}

describe('checkout recovery contract', () => {
  it('normalizes website capture without retaining raw email in the durable envelope', () => {
    const result = prepareWebsiteCheckoutRecoveryEnvelope(
      website(),
      IDENTITY_SECRET,
    );
    expect(result.transient_email).toBe('buyer@example.com');
    expect(result.prepared).toMatchObject({
      source_system: 'tandemweb',
      stripe_account: 'tandem',
      event_type: 'checkout.captured',
      source_case_key: `tandemweb:${TOKEN}`,
      consent_state: 'denied',
      consent_policy_version: 'checkout-reminder-v2',
      checkout_locale: 'en',
      return_url: 'https://tandemcoach.co/acc/',
      product_name: 'ACC Level 1 Full Program',
      currency: 'usd',
    });
    expect(result.prepared.email_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.prepared)).not.toContain('buyer@example.com');
    const archive = checkoutRecoveryArchiveEnvelope(result.prepared);
    expect(archive.eventId).toMatch(/^checkout-recovery:[0-9a-f]{64}$/);
    expect(JSON.stringify(archive)).not.toContain(TOKEN);
    expect(JSON.stringify(archive)).not.toContain(
      result.prepared.source_case_key,
    );
  });

  it('binds payment identity and rejects forged website fields', () => {
    const result = prepareWebsiteCheckoutRecoveryEnvelope(
      website({
        event_type: 'payment.created',
        source_event_key: `tw:v1:${TOKEN}:payment_created:pi_abc1234567890`,
        payment_intent_id: 'pi_abc1234567890',
        consent_state: true,
      }),
      IDENTITY_SECRET,
    );
    expect(result.prepared.aliases).toEqual(
      expect.arrayContaining([
        { kind: 'checkout_token', id: TOKEN },
        { kind: 'payment_intent', id: 'pi_abc1234567890' },
      ]),
    );
    expect(() =>
      prepareWebsiteCheckoutRecoveryEnvelope(
        website({ checkout_token: 'bad' }),
        IDENTITY_SECRET,
      ),
    ).toThrow(/checkout_token/);
    expect(() =>
      prepareWebsiteCheckoutRecoveryEnvelope(
        website({ return_url: 'https://evil.example/acc/' }),
        IDENTITY_SECRET,
      ),
    ).toThrow(/not allowed/);
  });

  it('derives the fixed Stripe account and rejects account mismatch', () => {
    const payload = {
      account: 'heartbeat',
      event_type: 'checkout.session.expired',
      event_id: 'evt_abc1234567890',
      event_created: 1787594400,
      stripe_id: 'cs_live_abc1234567890',
      checkout_session_id: 'cs_live_abc1234567890',
      email: 'learner@example.com',
      amount_cents: 99900,
      currency: 'usd',
      consent_state: 'unknown',
    };
    const result = prepareStripeCheckoutRecoveryEnvelope(
      payload,
      'heartbeat',
      IDENTITY_SECRET,
    );
    expect(result.prepared).toMatchObject({
      source_system: 'stripe',
      stripe_account: 'heartbeat',
      event_type: 'checkout.session_expired',
    });
    expect(() =>
      prepareStripeCheckoutRecoveryEnvelope(payload, 'tandem', IDENTITY_SECRET),
    ).toThrow(/perimeter mismatch/);
  });

  it('accepts exact HMAC and rejects changed body, stale time, and missing secret', () => {
    const rawBody = Buffer.from(JSON.stringify(website()), 'utf8');
    const timestamp = '1787594400';
    const signature = crypto
      .createHmac('sha256', RELAY_SECRET)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    expect(() =>
      verifyCheckoutRecoverySignature({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: `sha256=${signature}`,
        secret: RELAY_SECRET,
        nowMs: Number(timestamp) * 1000,
      }),
    ).not.toThrow();
    expect(() =>
      verifyCheckoutRecoverySignature({
        rawBody: Buffer.from(`${rawBody.toString()} `),
        timestampHeader: timestamp,
        signatureHeader: `sha256=${signature}`,
        secret: RELAY_SECRET,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toThrow(/mismatch/);
    expect(() =>
      verifyCheckoutRecoverySignature({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: `sha256=${signature}`,
        secret: RELAY_SECRET,
        nowMs: (Number(timestamp) + 301) * 1000,
      }),
    ).toThrow(/tolerance/);
  });

  it('makes exact purchase terminal and recognizes recovered sessions', () => {
    const base = prepareStripeCheckoutRecoveryEnvelope(
      {
        account: 'tandem',
        event_type: 'checkout.session.completed',
        event_id: 'evt_abc1234567890',
        event_created: 1787594400,
        stripe_id: 'cs_live_abc1234567890',
        checkout_session_id: 'cs_live_abc1234567890',
        recovered_from: 'cs_live_old1234567890',
      },
      'tandem',
      IDENTITY_SECRET,
    ).prepared;
    expect(nextCheckoutRecoveryState('expired', base)).toEqual({
      state: 'recovered',
      resultCode: 'provider_recovered_purchase',
    });
    const lateFailure = {
      ...base,
      event_type: 'payment.failed',
      recovered_from: null,
    } as PreparedCheckoutRecoveryEvent;
    expect(nextCheckoutRecoveryState('purchased', lateFailure)).toEqual({
      state: 'purchased',
      resultCode: 'terminal_precedence',
    });
  });

  it('keeps shadow readiness separate from send eligibility', () => {
    expect(checkoutEligibility('granted', null)).toBe('eligible');
    expect(checkoutEligibility('unknown', null)).toBe('unknown');
    expect(checkoutEligibility('denied', null)).toBe('ineligible');
    expect(checkoutEligibility('granted', 'reply_received')).toBe('ineligible');
  });
});
