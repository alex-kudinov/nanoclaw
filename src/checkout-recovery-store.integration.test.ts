import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  prepareStripeCheckoutRecoveryEnvelope,
  prepareWebsiteCheckoutRecoveryEnvelope,
} from './checkout-recovery.js';
import {
  recordPreparedCheckoutRecoveryWithClient,
  sweepCheckoutRecoveryShadowWithClient,
} from './checkout-recovery-store.js';

const TEST_DATABASE_URL = process.env.CHECKOUT_RECOVERY_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const SECRET = 'checkout-recovery-integration-identity-secret';
const TOKEN = 'B'.repeat(32);

async function inbox(): Promise<number> {
  if (!pool) throw new Error('disposable pool unavailable');
  const row = await pool.query<{ id: string }>(
    `INSERT INTO business_v2.webhook_inbox (source, raw_body)
     VALUES ('checkout-recovery-test', '{}'::jsonb) RETURNING id::text`,
  );
  return Number(row.rows[0].id);
}

async function record(
  prepared: ReturnType<
    | typeof prepareWebsiteCheckoutRecoveryEnvelope
    | typeof prepareStripeCheckoutRecoveryEnvelope
  >,
) {
  if (!pool) throw new Error('disposable pool unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await recordPreparedCheckoutRecoveryWithClient(client, {
      event: prepared.prepared,
      webhookInboxId: await inbox(),
      transientEmail: prepared.transient_email,
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function website(eventType: 'checkout.captured' | 'payment.created') {
  return prepareWebsiteCheckoutRecoveryEnvelope(
    {
      schema_version: 1,
      source_event_key:
        eventType === 'checkout.captured'
          ? `tw:v1:${TOKEN}:captured`
          : `tw:v1:${TOKEN}:payment_created:pi_abc1234567890`,
      event_type: eventType,
      observed_at: '2026-08-24T18:00:00.000Z',
      checkout_token: TOKEN,
      payment_intent_id:
        eventType === 'payment.created' ? 'pi_abc1234567890' : null,
      email: 'buyer@example.com',
      program_slug: 'acc',
      product_slug: 'acc-full',
      amount_cents: 399900,
      currency: 'usd',
      consent_state: true,
      consent_policy_version: 'checkout-reminder-v1',
    },
    SECRET,
  );
}

describe.skipIf(!TEST_DATABASE_URL)(
  'checkout recovery disposable PostgreSQL',
  () => {
    beforeEach(async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      await pool.query(`
      TRUNCATE
        business_v2.checkout_recovery_receipts,
        business_v2.checkout_recovery_events,
        business_v2.checkout_recovery_aliases,
        business_v2.checkout_recovery_cases,
        business_v2.webhook_inbox
      RESTART IDENTITY CASCADE
    `);
    });

    afterAll(async () => {
      await pool?.end();
    });

    it('binds website token and PaymentIntent to one consent-eligible case', async () => {
      const captured = await record(website('checkout.captured'));
      const payment = await record(website('payment.created'));
      expect(payment.caseId).toBe(captured.caseId);
      expect(payment.state).toBe('payment_created');
      if (!pool) throw new Error('disposable pool unavailable');
      const rows = await pool.query(
        `SELECT state, version, contact_email::text, consent_state,
              eligibility_state, shadow_due_at IS NOT NULL AS has_due
         FROM business_v2.checkout_recovery_cases`,
      );
      expect(rows.rows).toEqual([
        expect.objectContaining({
          state: 'payment_created',
          version: 2,
          contact_email: 'buyer@example.com',
          consent_state: 'granted',
          eligibility_state: 'eligible',
          has_due: true,
        }),
      ]);
      const aliases = await pool.query(
        `SELECT alias_kind FROM business_v2.checkout_recovery_aliases ORDER BY alias_kind`,
      );
      expect(aliases.rows.map((row) => row.alias_kind)).toEqual([
        'checkout_token',
        'payment_intent',
      ]);

      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        const ready = await sweepCheckoutRecoveryShadowWithClient(client, {
          now: new Date('2026-08-24T19:00:00.000Z'),
        });
        await client.query('COMMIT');
        expect(ready).toEqual([
          expect.objectContaining({
            caseId: captured.caseId,
            state: 'shadow_ready',
            eligibilityState: 'eligible',
            customerMessageSent: false,
          }),
        ]);
      } finally {
        client.release();
      }
    });

    it('makes exact purchase terminal under late failed delivery', async () => {
      await record(website('checkout.captured'));
      await record(website('payment.created'));
      const success = prepareStripeCheckoutRecoveryEnvelope(
        {
          account: 'tandem',
          event_type: 'payment_intent.succeeded',
          event_id: 'evt_success1234567890',
          event_created: 1787594700,
          stripe_id: 'pi_abc1234567890',
          payment_intent_id: 'pi_abc1234567890',
          email: 'buyer@example.com',
          product_slug: 'acc-full',
          amount_cents: 399900,
          currency: 'usd',
        },
        'tandem',
        SECRET,
      );
      const purchased = await record(success);
      expect(purchased.state).toBe('purchased');
      const failure = prepareStripeCheckoutRecoveryEnvelope(
        {
          account: 'tandem',
          event_type: 'payment_intent.payment_failed',
          event_id: 'evt_failure1234567890',
          event_created: 1787594800,
          stripe_id: 'pi_abc1234567890',
          payment_intent_id: 'pi_abc1234567890',
          email: 'different@example.com',
          product_slug: 'different-product',
        },
        'tandem',
        SECRET,
      );
      const late = await record(failure);
      expect(late.state).toBe('purchased');
      expect(late.resultCode).toBe('terminal_precedence');
      const events = await pool!.query(
        `SELECT count(*)::int AS count FROM business_v2.checkout_recovery_events`,
      );
      expect(events.rows[0].count).toBe(4);
    });

    it('deduplicates exact event keys and stores no email in event facts', async () => {
      const first = await record(website('checkout.captured'));
      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        const duplicate = await recordPreparedCheckoutRecoveryWithClient(
          client,
          {
            event: website('checkout.captured').prepared,
            webhookInboxId: await inbox(),
            transientEmail: 'buyer@example.com',
          },
        );
        await client.query('COMMIT');
        expect(duplicate).toMatchObject({
          caseId: first.caseId,
          duplicate: true,
          resultCode: 'duplicate_event',
        });
      } finally {
        client.release();
      }
      const facts = await pool!.query(
        `SELECT facts::text FROM business_v2.checkout_recovery_events`,
      );
      expect(facts.rows[0].facts).not.toContain('buyer@example.com');
    });
  },
);
