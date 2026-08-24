import crypto from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';

const ACTOR = 'checkout-recovery:sender';
export const CHECKOUT_RECOVERY_ENCHARGE_EVENT =
  'checkout_recovery_reminder_ready_v2';

export type CheckoutRecoverySendMode = 'off' | 'pilot' | 'production';

export interface CheckoutRecoverySendConfig {
  mode: CheckoutRecoverySendMode;
  activatedAt: Date | null;
  pilotEmailSha256: string | null;
  pilotTouch2DelayMinutes: number | null;
  enchargeWriteKey: string;
  enchargeIngestUrl?: string;
}

export interface CheckoutRecoverySchedulableCase {
  id: number;
  createdAt: string;
  startedAt: string;
  stripeAccount: 'tandem' | 'heartbeat';
  consentState: 'unknown' | 'denied' | 'granted';
  consentPolicyVersion: string | null;
  checkoutLocale: 'en' | 'es' | 'ja' | 'fr' | null;
  returnUrl: string | null;
  productName: string | null;
  productSlug: string | null;
  emailSha256: string | null;
  contactEmail: string | null;
}

interface IntentRow extends QueryResultRow {
  id: string;
  intent_uuid: string;
  case_id: string;
  touch: number;
  attempt_count: number;
  due_at: string;
}

interface CaseRow extends QueryResultRow {
  id: string;
  case_uuid: string;
  stripe_account: 'tandem' | 'heartbeat';
  state: string;
  started_at: string;
  created_at: string;
  program_slug: string | null;
  product_slug: string | null;
  product_name: string | null;
  amount_cents: string | null;
  currency: string | null;
  contact_email: string | null;
  email_sha256: string | null;
  consent_state: 'unknown' | 'denied' | 'granted';
  consent_policy_version: string | null;
  eligibility_state: string;
  suppression_code: string | null;
  shadow_notified_at: string | null;
  checkout_locale: 'en' | 'es' | 'ja' | 'fr' | null;
  return_url: string | null;
}

export interface CheckoutRecoveryClaimedIntent {
  intentId: number;
  intentUuid: string;
  leaseToken: string;
  caseId: number;
  caseUuid: string;
  touch: 1 | 2;
  attemptNumber: number;
  payload: {
    name: typeof CHECKOUT_RECOVERY_ENCHARGE_EVENT;
    user: { email: string };
    properties: {
      touch: 1 | 2;
      locale: 'en' | 'es' | 'ja' | 'fr';
      program_slug: string;
      product_slug: string;
      product_name: string;
      return_url: string;
      amount_cents: number | null;
      currency: string | null;
      case_ref: string;
      intent_ref: string;
      mode: 'pilot' | 'production';
    };
  };
}

export interface CheckoutRecoverySendHealth {
  pending: number;
  failed: number;
  leased: number;
  accepted: number;
  suppressed: number;
  held: number;
}

function sha(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

async function appendReceipt(
  client: PoolClient,
  input: {
    intentId: number;
    caseId: number;
    touch: number;
    attemptNumber: number;
    receiptType:
      | 'scheduled'
      | 'leased'
      | 'provider_event_accepted'
      | 'retry_scheduled'
      | 'suppressed'
      | 'held';
    outcome: 'verified' | 'accepted' | 'retryable' | 'suppressed' | 'held';
    resultCode: string;
    occurredAt: string;
    evidence: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO business_v2.checkout_recovery_send_receipts
       (intent_id, case_id, touch, attempt_number, receipt_type, outcome,
        result_code, evidence_sha256, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
     ON CONFLICT DO NOTHING`,
    [
      input.intentId,
      input.caseId,
      input.touch,
      input.attemptNumber,
      input.receiptType,
      input.outcome,
      input.resultCode,
      sha(input.evidence),
      input.occurredAt,
    ],
  );
}

function prospectiveEligible(
  item: CheckoutRecoverySchedulableCase,
  config: CheckoutRecoverySendConfig,
): boolean {
  if (config.mode === 'off' || config.activatedAt === null) return false;
  if (Date.parse(item.createdAt) < config.activatedAt.getTime()) return false;
  if (
    item.stripeAccount !== 'tandem' ||
    item.consentState !== 'granted' ||
    item.consentPolicyVersion !== 'checkout-reminder-v2' ||
    item.checkoutLocale === null ||
    item.returnUrl === null ||
    item.productName === null ||
    item.productSlug === null ||
    item.emailSha256 === null ||
    item.contactEmail === null
  ) {
    return false;
  }
  return (
    config.mode !== 'pilot' ||
    (config.pilotEmailSha256 !== null &&
      item.emailSha256 === config.pilotEmailSha256)
  );
}

export async function scheduleCheckoutRecoveryTouchesWithClient(
  client: PoolClient,
  item: CheckoutRecoverySchedulableCase,
  config: CheckoutRecoverySendConfig,
  now = new Date(),
): Promise<number> {
  if (!prospectiveEligible(item, config)) return 0;
  const pilotTouch2DueAt =
    config.mode === 'pilot' && config.pilotTouch2DelayMinutes !== null
      ? new Date(now.getTime() + config.pilotTouch2DelayMinutes * 60_000)
      : null;
  const dueTimes = [
    { touch: 1, dueAt: now },
    {
      touch: 2,
      dueAt:
        pilotTouch2DueAt ??
        new Date(
          Math.max(
            Date.parse(item.startedAt) + 24 * 60 * 60_000,
            now.getTime() + 20 * 60 * 60_000,
          ),
        ),
    },
  ];
  let scheduled = 0;
  for (const entry of dueTimes) {
    const inserted = await client.query<{
      id: string;
      intent_uuid: string;
    }>(
      `INSERT INTO business_v2.checkout_recovery_send_intents
         (case_id, touch, due_at, next_attempt_at)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz)
       ON CONFLICT (case_id, touch) DO NOTHING
       RETURNING id::text, intent_uuid::text`,
      [item.id, entry.touch, entry.dueAt.toISOString()],
    );
    if (!inserted.rows[0]) continue;
    scheduled++;
    await appendReceipt(client, {
      intentId: Number(inserted.rows[0].id),
      caseId: item.id,
      touch: entry.touch,
      attemptNumber: 0,
      receiptType: 'scheduled',
      outcome: 'verified',
      resultCode: 'prospective_touch_scheduled',
      occurredAt: now.toISOString(),
      evidence: {
        intent_uuid: inserted.rows[0].intent_uuid,
        due_at: entry.dueAt.toISOString(),
        mode: config.mode,
        timing: pilotTouch2DueAt === null ? 'production' : 'pilot_canary',
      },
    });
  }
  return scheduled;
}

async function suppressIntent(
  client: PoolClient,
  intent: IntentRow,
  code: string,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE business_v2.checkout_recovery_send_intents
        SET status = 'suppressed', suppressed_at = $2::timestamptz,
            lease_token = NULL, lease_expires_at = NULL,
            last_error_code = $3, updated_at = now()
      WHERE id = $1`,
    [intent.id, now.toISOString(), code],
  );
  await appendReceipt(client, {
    intentId: Number(intent.id),
    caseId: Number(intent.case_id),
    touch: intent.touch,
    attemptNumber: intent.attempt_count,
    receiptType: 'suppressed',
    outcome: 'suppressed',
    resultCode: code,
    occurredAt: now.toISOString(),
    evidence: { intent_uuid: intent.intent_uuid, code },
  });
}

export async function claimDueCheckoutRecoverySendIntents(
  config: CheckoutRecoverySendConfig,
  input: { limit?: number; now?: Date } = {},
): Promise<CheckoutRecoveryClaimedIntent[]> {
  return withAgentContext(ACTOR, (client) =>
    claimDueCheckoutRecoverySendIntentsWithClient(client, config, input),
  );
}

export async function claimDueCheckoutRecoverySendIntentsWithClient(
  client: PoolClient,
  config: CheckoutRecoverySendConfig,
  input: { limit?: number; now?: Date } = {},
): Promise<CheckoutRecoveryClaimedIntent[]> {
  if (config.mode === 'off' || config.activatedAt === null) return [];
  const activatedAt = config.activatedAt;
  const sendMode = config.mode;
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const now = input.now ?? new Date();
  const expiredLeases = await client.query<IntentRow>(
    `UPDATE business_v2.checkout_recovery_send_intents
          SET status = 'held', held_at = $1::timestamptz,
              lease_token = NULL, lease_expires_at = NULL,
              last_error_code = 'lease_expired_dispatch_ambiguous',
              updated_at = now()
        WHERE status = 'leased' AND lease_expires_at <= $1::timestamptz
        RETURNING id::text, intent_uuid::text, case_id::text, touch,
                  attempt_count, due_at::text`,
    [now.toISOString()],
  );
  for (const expired of expiredLeases.rows) {
    await appendReceipt(client, {
      intentId: Number(expired.id),
      caseId: Number(expired.case_id),
      touch: expired.touch,
      attemptNumber: expired.attempt_count,
      receiptType: 'held',
      outcome: 'held',
      resultCode: 'lease_expired_dispatch_ambiguous',
      occurredAt: now.toISOString(),
      evidence: {
        intent_uuid: expired.intent_uuid,
        action: 'automatic_replay_refused',
      },
    });
  }
  const due = await client.query<IntentRow>(
    `SELECT id::text, intent_uuid::text, case_id::text, touch,
              attempt_count, due_at::text
         FROM business_v2.checkout_recovery_send_intents
        WHERE status IN ('pending', 'failed')
          AND due_at <= $1::timestamptz
          AND next_attempt_at <= $1::timestamptz
          AND attempt_count < 10
        ORDER BY due_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
    [now.toISOString(), limit],
  );
  const claimed: CheckoutRecoveryClaimedIntent[] = [];
  for (const intent of due.rows) {
    const locked = await client.query<CaseRow>(
      `SELECT id::text, case_uuid::text, stripe_account, state,
                started_at::text, created_at::text, program_slug, product_slug,
                product_name, amount_cents::text, currency,
                contact_email::text, email_sha256, consent_state,
                consent_policy_version, eligibility_state, suppression_code,
                shadow_notified_at::text, checkout_locale, return_url
           FROM business_v2.checkout_recovery_cases
          WHERE id = $1 FOR UPDATE`,
      [intent.case_id],
    );
    const item = locked.rows[0];
    if (!item) {
      await suppressIntent(client, intent, 'case_missing', now);
      continue;
    }
    const siblingPurchase = await client.query(
      `SELECT 1 FROM business_v2.checkout_recovery_cases
          WHERE stripe_account = $1
            AND email_sha256 = $2
            AND product_slug = $3
            AND purchased_at IS NOT NULL
            AND purchased_at >= $4::timestamptz
          LIMIT 1`,
      [
        item.stripe_account,
        item.email_sha256,
        item.product_slug,
        item.started_at,
      ],
    );
    if (item.shadow_notified_at === null) continue;
    if (intent.touch === 2) {
      const touchOne = await client.query<{ status: string }>(
        `SELECT status
           FROM business_v2.checkout_recovery_send_intents
          WHERE case_id = $1 AND touch = 1`,
        [intent.case_id],
      );
      const touchOneStatus = touchOne.rows[0]?.status;
      if (touchOneStatus !== 'accepted') {
        if (
          touchOneStatus === undefined ||
          touchOneStatus === 'held' ||
          touchOneStatus === 'suppressed'
        ) {
          await suppressIntent(client, intent, 'touch_one_not_accepted', now);
        }
        continue;
      }
    }
    const suppression =
      item.state !== 'shadow_ready'
        ? 'case_not_shadow_ready'
        : item.eligibility_state !== 'eligible'
          ? 'case_not_eligible'
          : item.consent_state !== 'granted' ||
              item.consent_policy_version !== 'checkout-reminder-v2'
            ? 'consent_not_v2_granted'
            : Date.parse(item.created_at) < activatedAt.getTime()
              ? 'pre_activation_case'
              : config.mode === 'pilot' &&
                  item.email_sha256 !== config.pilotEmailSha256
                ? 'not_allowlisted'
                : siblingPurchase.rowCount
                  ? 'sibling_purchase'
                  : null;
    if (suppression) {
      await suppressIntent(client, intent, suppression, now);
      continue;
    }
    if (
      !item.contact_email ||
      !item.checkout_locale ||
      !item.return_url ||
      !item.product_name ||
      !item.product_slug ||
      !item.program_slug
    ) {
      await suppressIntent(client, intent, 'routing_context_missing', now);
      continue;
    }
    const leaseToken = crypto.randomUUID();
    const attemptNumber = intent.attempt_count + 1;
    const payload: CheckoutRecoveryClaimedIntent['payload'] = {
      name: CHECKOUT_RECOVERY_ENCHARGE_EVENT,
      user: { email: item.contact_email },
      properties: {
        touch: intent.touch as 1 | 2,
        locale: item.checkout_locale,
        program_slug: item.program_slug,
        product_slug: item.product_slug,
        product_name: item.product_name,
        return_url: item.return_url,
        amount_cents:
          item.amount_cents === null ? null : Number(item.amount_cents),
        currency: item.currency,
        case_ref: item.case_uuid,
        intent_ref: intent.intent_uuid,
        mode: sendMode,
      },
    };
    const payloadSha256 = sha(payload);
    await client.query(
      `UPDATE business_v2.checkout_recovery_send_intents
            SET status = 'leased', attempt_count = $2,
                lease_token = $3::uuid,
                lease_expires_at = $4::timestamptz,
                payload_sha256 = $5, last_error_code = NULL,
                updated_at = now()
          WHERE id = $1`,
      [
        intent.id,
        attemptNumber,
        leaseToken,
        new Date(now.getTime() + 5 * 60_000).toISOString(),
        payloadSha256,
      ],
    );
    await appendReceipt(client, {
      intentId: Number(intent.id),
      caseId: Number(intent.case_id),
      touch: intent.touch,
      attemptNumber,
      receiptType: 'leased',
      outcome: 'verified',
      resultCode: 'provider_handoff_leased',
      occurredAt: now.toISOString(),
      evidence: {
        lease_token_sha256: sha(leaseToken),
        payload_sha256: payloadSha256,
      },
    });
    claimed.push({
      intentId: Number(intent.id),
      intentUuid: intent.intent_uuid,
      leaseToken,
      caseId: Number(intent.case_id),
      caseUuid: item.case_uuid,
      touch: intent.touch as 1 | 2,
      attemptNumber,
      payload,
    });
  }
  return claimed;
}

export async function markCheckoutRecoveryProviderAccepted(
  item: CheckoutRecoveryClaimedIntent,
  occurredAt = new Date(),
): Promise<boolean> {
  return withAgentContext(ACTOR, async (client) => {
    const updated = await client.query(
      `UPDATE business_v2.checkout_recovery_send_intents
          SET status = 'accepted', accepted_at = $4::timestamptz,
              lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2::uuid
          AND attempt_count = $3`,
      [
        item.intentId,
        item.leaseToken,
        item.attemptNumber,
        occurredAt.toISOString(),
      ],
    );
    if (updated.rowCount !== 1) return false;
    await appendReceipt(client, {
      intentId: item.intentId,
      caseId: item.caseId,
      touch: item.touch,
      attemptNumber: item.attemptNumber,
      receiptType: 'provider_event_accepted',
      outcome: 'accepted',
      resultCode: 'encharge_ingest_accepted',
      occurredAt: occurredAt.toISOString(),
      evidence: {
        intent_uuid: item.intentUuid,
        event: CHECKOUT_RECOVERY_ENCHARGE_EVENT,
      },
    });
    return true;
  });
}

export async function markCheckoutRecoveryProviderFailed(
  item: CheckoutRecoveryClaimedIntent,
  code: string,
  occurredAt = new Date(),
): Promise<boolean> {
  return withAgentContext(ACTOR, async (client) => {
    const held = item.attemptNumber >= 10;
    const delay = Math.min(
      6 * 60 * 60_000,
      5 * 60_000 * 2 ** Math.min(item.attemptNumber, 6),
    );
    const updated = await client.query(
      `UPDATE business_v2.checkout_recovery_send_intents
          SET status = $4,
              held_at = CASE WHEN $4 = 'held' THEN $5::timestamptz ELSE NULL END,
              next_attempt_at = $6::timestamptz,
              lease_token = NULL, lease_expires_at = NULL,
              last_error_code = $7, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2::uuid
          AND attempt_count = $3`,
      [
        item.intentId,
        item.leaseToken,
        item.attemptNumber,
        held ? 'held' : 'failed',
        occurredAt.toISOString(),
        new Date(occurredAt.getTime() + delay).toISOString(),
        code,
      ],
    );
    if (updated.rowCount !== 1) return false;
    await appendReceipt(client, {
      intentId: item.intentId,
      caseId: item.caseId,
      touch: item.touch,
      attemptNumber: item.attemptNumber,
      receiptType: held ? 'held' : 'retry_scheduled',
      outcome: held ? 'held' : 'retryable',
      resultCode: code,
      occurredAt: occurredAt.toISOString(),
      evidence: { intent_uuid: item.intentUuid, next_delay_ms: delay },
    });
    return true;
  });
}

export async function dispatchCheckoutRecoveryToEncharge(
  item: CheckoutRecoveryClaimedIntent,
  config: CheckoutRecoverySendConfig,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (config.enchargeWriteKey.length < 20) {
    throw new Error('encharge_write_key_unavailable');
  }
  const response = await fetchFn(
    config.enchargeIngestUrl ?? 'https://ingest.encharge.io/v1',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encharge-Token': config.enchargeWriteKey,
      },
      body: JSON.stringify(item.payload),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`encharge_http_${response.status}`);
}

export async function checkoutRecoverySendHealth(): Promise<CheckoutRecoverySendHealth> {
  return withAgentContext(ACTOR, async (client) => {
    const result = await client.query<{
      status: keyof CheckoutRecoverySendHealth;
      count: string;
    }>(
      `SELECT status, count(*)::text AS count
         FROM business_v2.checkout_recovery_send_intents
        GROUP BY status`,
    );
    const health: CheckoutRecoverySendHealth = {
      pending: 0,
      failed: 0,
      leased: 0,
      accepted: 0,
      suppressed: 0,
      held: 0,
    };
    for (const row of result.rows) health[row.status] = Number(row.count);
    return health;
  });
}
