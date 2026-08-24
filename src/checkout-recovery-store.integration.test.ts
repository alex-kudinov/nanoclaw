import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  prepareStripeCheckoutRecoveryEnvelope,
  prepareWebsiteCheckoutRecoveryEnvelope,
} from './checkout-recovery.js';
import { claimDueCheckoutRecoverySendIntentsWithClient } from './checkout-recovery-sender.js';
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

function website(
  eventType: 'checkout.captured' | 'payment.created',
  token = TOKEN,
  paymentIntent = 'pi_abc1234567890',
  observedAt = '2026-08-24T18:00:00.000Z',
) {
  return prepareWebsiteCheckoutRecoveryEnvelope(
    {
      schema_version: 1,
      source_event_key:
        eventType === 'checkout.captured'
          ? `tw:v1:${token}:captured`
          : `tw:v1:${token}:payment_created:${paymentIntent}`,
      event_type: eventType,
      observed_at: observedAt,
      checkout_token: token,
      payment_intent_id: eventType === 'payment.created' ? paymentIntent : null,
      email: 'buyer@example.com',
      program_slug: 'acc',
      product_slug: 'acc-full',
      amount_cents: 399900,
      currency: 'usd',
      consent_state: true,
      consent_policy_version: 'checkout-reminder-v2',
      locale: 'en',
      return_url: 'https://tandemcoach.co/acc/',
      product_name: 'ACC Level 1 Full Program',
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
        business_v2.checkout_recovery_send_receipts,
        business_v2.checkout_recovery_send_intents,
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
          sendConfig: {
            mode: 'production',
            activatedAt: new Date('2026-08-24T17:00:00.000Z'),
            pilotEmailSha256: null,
            pilotTouch2DelayMinutes: null,
            enchargeWriteKey: 'integration-test-write-key',
          },
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
        const intents = await client.query(
          `SELECT touch, status, due_at::text
             FROM business_v2.checkout_recovery_send_intents
            ORDER BY touch`,
        );
        expect(intents.rows).toEqual([
          expect.objectContaining({ touch: 1, status: 'pending' }),
          expect.objectContaining({ touch: 2, status: 'pending' }),
        ]);
        const sendReceipts = await client.query(
          `SELECT touch, receipt_type, result_code
             FROM business_v2.checkout_recovery_send_receipts
            ORDER BY touch`,
        );
        expect(sendReceipts.rows).toEqual([
          {
            touch: 1,
            receipt_type: 'scheduled',
            result_code: 'prospective_touch_scheduled',
          },
          {
            touch: 2,
            receipt_type: 'scheduled',
            result_code: 'prospective_touch_scheduled',
          },
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

    it('uses the shortened touch-two delay only for the allowlisted pilot', async () => {
      const captured = await record(website('checkout.captured'));
      await record(website('payment.created'));
      const digest = await pool!.query<{ email_sha256: string }>(
        `SELECT email_sha256 FROM business_v2.checkout_recovery_cases WHERE id = $1`,
        [captured.caseId],
      );
      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        await sweepCheckoutRecoveryShadowWithClient(client, {
          now: new Date('2026-08-24T19:00:00.000Z'),
          sendConfig: {
            mode: 'pilot',
            activatedAt: new Date('2026-08-24T17:00:00.000Z'),
            pilotEmailSha256: digest.rows[0].email_sha256,
            pilotTouch2DelayMinutes: 5,
            enchargeWriteKey: 'integration-test-write-key',
          },
        });
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      const intents = await pool!.query<{
        touch: number;
        due_epoch_ms: string;
      }>(
        `SELECT touch, (extract(epoch FROM due_at) * 1000)::bigint::text AS due_epoch_ms
           FROM business_v2.checkout_recovery_send_intents
          WHERE case_id = $1 ORDER BY touch`,
        [captured.caseId],
      );
      expect(
        intents.rows.map((row) => [row.touch, Number(row.due_epoch_ms)]),
      ).toEqual([
        [1, Date.parse('2026-08-24T19:00:00.000Z')],
        [2, Date.parse('2026-08-24T19:05:00.000Z')],
      ]);

      await pool!.query(
        `UPDATE business_v2.checkout_recovery_cases
            SET shadow_notified_at = '2026-08-24T19:00:01.000Z'
          WHERE id = $1`,
        [captured.caseId],
      );
      const sendConfig = {
        mode: 'pilot' as const,
        activatedAt: new Date('2026-08-24T17:00:00.000Z'),
        pilotEmailSha256: digest.rows[0].email_sha256,
        pilotTouch2DelayMinutes: 5,
        enchargeWriteKey: 'integration-test-write-key',
      };
      const claimClient = await pool!.connect();
      try {
        await claimClient.query('BEGIN');
        const firstClaim = await claimDueCheckoutRecoverySendIntentsWithClient(
          claimClient,
          sendConfig,
          { now: new Date('2026-08-24T19:05:00.000Z') },
        );
        expect(firstClaim.map((item) => item.touch)).toEqual([1]);
        await claimClient.query(
          `UPDATE business_v2.checkout_recovery_send_intents
              SET status = 'accepted', accepted_at = '2026-08-24T19:05:01.000Z',
                  lease_token = NULL, lease_expires_at = NULL
            WHERE case_id = $1 AND touch = 1`,
          [captured.caseId],
        );
        await claimClient.query('COMMIT');
      } finally {
        claimClient.release();
      }
      const secondClaimClient = await pool!.connect();
      try {
        await secondClaimClient.query('BEGIN');
        const secondClaim = await claimDueCheckoutRecoverySendIntentsWithClient(
          secondClaimClient,
          sendConfig,
          { now: new Date('2026-08-24T19:06:00.000Z') },
        );
        await secondClaimClient.query('COMMIT');
        expect(secondClaim.map((item) => item.touch)).toEqual([2]);
      } finally {
        secondClaimClient.release();
      }
    });

    it('holds an expired dispatch lease instead of replaying an ambiguous send', async () => {
      const captured = await record(website('checkout.captured'));
      await record(website('payment.created'));
      const sendConfig = {
        mode: 'production' as const,
        activatedAt: new Date('2026-08-24T17:00:00.000Z'),
        pilotEmailSha256: null,
        pilotTouch2DelayMinutes: null,
        enchargeWriteKey: 'integration-test-write-key',
      };
      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        await sweepCheckoutRecoveryShadowWithClient(client, {
          now: new Date('2026-08-24T19:00:00.000Z'),
          sendConfig,
        });
        await client.query(
          `UPDATE business_v2.checkout_recovery_cases
              SET shadow_notified_at = '2026-08-24T19:00:01.000Z'
            WHERE id = $1`,
          [captured.caseId],
        );
        const firstClaim = await claimDueCheckoutRecoverySendIntentsWithClient(
          client,
          sendConfig,
          { now: new Date('2026-08-24T19:00:02.000Z') },
        );
        await client.query('COMMIT');
        expect(firstClaim.map((item) => item.touch)).toEqual([1]);
      } finally {
        client.release();
      }

      const recoveryClient = await pool!.connect();
      try {
        await recoveryClient.query('BEGIN');
        const replay = await claimDueCheckoutRecoverySendIntentsWithClient(
          recoveryClient,
          sendConfig,
          { now: new Date('2026-08-24T19:06:00.000Z') },
        );
        await recoveryClient.query('COMMIT');
        expect(replay).toEqual([]);
      } finally {
        recoveryClient.release();
      }
      const held = await pool!.query(
        `SELECT status, last_error_code
           FROM business_v2.checkout_recovery_send_intents
          WHERE case_id = $1 AND touch = 1`,
        [captured.caseId],
      );
      expect(held.rows).toEqual([
        {
          status: 'held',
          last_error_code: 'lease_expired_dispatch_ambiguous',
        },
      ]);
      const receipt = await pool!.query(
        `SELECT receipt_type, outcome, result_code
           FROM business_v2.checkout_recovery_send_receipts
          WHERE case_id = $1 AND touch = 1 AND receipt_type = 'held'`,
        [captured.caseId],
      );
      expect(receipt.rows).toEqual([
        {
          receipt_type: 'held',
          outcome: 'held',
          result_code: 'lease_expired_dispatch_ambiguous',
        },
      ]);

      await pool!.query(
        `UPDATE business_v2.checkout_recovery_send_intents
            SET due_at = '2026-08-24T19:07:00.000Z',
                next_attempt_at = '2026-08-24T19:07:00.000Z'
          WHERE case_id = $1 AND touch = 2`,
        [captured.caseId],
      );
      const touchTwoClient = await pool!.connect();
      try {
        await touchTwoClient.query('BEGIN');
        const touchTwo = await claimDueCheckoutRecoverySendIntentsWithClient(
          touchTwoClient,
          sendConfig,
          { now: new Date('2026-08-24T19:07:00.000Z') },
        );
        await touchTwoClient.query('COMMIT');
        expect(touchTwo).toEqual([]);
      } finally {
        touchTwoClient.release();
      }
      const suppressedTouchTwo = await pool!.query(
        `SELECT status, last_error_code
           FROM business_v2.checkout_recovery_send_intents
          WHERE case_id = $1 AND touch = 2`,
        [captured.caseId],
      );
      expect(suppressedTouchTwo.rows).toEqual([
        {
          status: 'suppressed',
          last_error_code: 'touch_one_not_accepted',
        },
      ]);
    });

    it('suppresses a due touch when a sibling checkout purchased the same product', async () => {
      const original = await record(website('checkout.captured'));
      await record(website('payment.created'));
      const client = await pool!.connect();
      const sendConfig = {
        mode: 'production' as const,
        activatedAt: new Date('2026-08-24T17:00:00.000Z'),
        pilotEmailSha256: null,
        pilotTouch2DelayMinutes: null,
        enchargeWriteKey: 'integration-test-write-key',
      };
      try {
        await client.query('BEGIN');
        await sweepCheckoutRecoveryShadowWithClient(client, {
          now: new Date('2026-08-24T19:00:00.000Z'),
          sendConfig,
        });
        await client.query(
          `UPDATE business_v2.checkout_recovery_cases
              SET shadow_notified_at = '2026-08-24T19:00:01.000Z'
            WHERE id = $1`,
          [original.caseId],
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      const siblingToken = 'C'.repeat(32);
      const siblingPi = 'pi_sibling1234567890';
      await record(
        website(
          'checkout.captured',
          siblingToken,
          siblingPi,
          '2026-08-24T19:05:00.000Z',
        ),
      );
      await record(
        website(
          'payment.created',
          siblingToken,
          siblingPi,
          '2026-08-24T19:05:05.000Z',
        ),
      );
      await record(
        prepareStripeCheckoutRecoveryEnvelope(
          {
            account: 'tandem',
            event_type: 'payment_intent.succeeded',
            event_id: 'evt_sibling1234567890',
            observed_at: '2026-08-24T19:06:00.000Z',
            stripe_id: siblingPi,
            payment_intent_id: siblingPi,
            email: 'buyer@example.com',
            product_slug: 'acc-full',
            amount_cents: 399900,
            currency: 'usd',
          },
          'tandem',
          SECRET,
        ),
      );
      const claimClient = await pool!.connect();
      try {
        await claimClient.query('BEGIN');
        const claimed = await claimDueCheckoutRecoverySendIntentsWithClient(
          claimClient,
          sendConfig,
          { now: new Date('2026-08-24T19:10:00.000Z') },
        );
        await claimClient.query('COMMIT');
        expect(claimed).toEqual([]);
      } finally {
        claimClient.release();
      }
      const intents = await pool!.query(
        `SELECT touch, status, last_error_code
           FROM business_v2.checkout_recovery_send_intents
          WHERE case_id = $1 ORDER BY touch`,
        [original.caseId],
      );
      expect(intents.rows[0]).toMatchObject({
        touch: 1,
        status: 'suppressed',
        last_error_code: 'sibling_purchase',
      });
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
