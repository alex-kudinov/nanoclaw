/**
 * Durable Stripe -> Chaos lifecycle delivery.
 *
 * The outbox persists no email or name. The sender resolves the email from the
 * existing private payments ledger only while constructing the authenticated
 * request, and Chaos immediately turns it into its site-scoped person HMAC.
 */

import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { getAllRegisteredGroups } from './db.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { query, withAgentContext } from './business-db.js';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;
const REQUEST_TIMEOUT_MS = 15_000;

export type StripeLifecycleAccount = 'heartbeat' | 'tandem';
export type StripeLifecycleEventName =
  | 'purchase_completed'
  | 'purchase_refunded';

export interface StripeLifecycleFact {
  eligible: boolean;
  event_name: StripeLifecycleEventName;
  account: StripeLifecycleAccount;
  source_event_id?: string;
  canonical_transaction_id: string | null;
  provider_event_id?: string | null;
  provider_object_id?: string | null;
  occurred_at: string;
  amount_cents?: number | null;
  refunded_amount_cents?: number | null;
  original_amount_cents?: number | null;
  currency?: string | null;
  is_partial?: boolean;
  payment_status?: string;
}

interface OutboxRow {
  id: number;
  event_name: StripeLifecycleEventName;
  source_system: string;
  source_event_id: string;
  canonical_transaction_id: string;
  provider_event_ids: string[];
  provider_object_ids: string[];
  occurred_at: string;
  amount_cents: number | null;
  currency: string | null;
  properties: Record<string, unknown>;
  attempts: number;
}

interface PaymentIdentity {
  email: string;
  product_name: string | null;
  product_id: string | null;
}

interface DeadLetterDetail {
  id: number;
  eventName: StripeLifecycleEventName;
  error: string;
}

export interface ChaosLifecycleReaperResult {
  status: 'disabled' | 'success';
  processed: number;
  sent: number;
  retried: number;
  deadLettered: number;
}

function validProviderId(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return /^(evt|pi|cs|ch|re)_[A-Za-z0-9_]+$/.test(v) ? v : null;
}

function sourceSystem(account: StripeLifecycleAccount): string {
  return `stripe-${account}`;
}

function sourceEventId(fact: StripeLifecycleFact): string {
  if (fact.event_name === 'purchase_completed') {
    return fact.canonical_transaction_id ?? '';
  }
  return validProviderId(fact.source_event_id) ?? '';
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function slugify(value: string | null): string | null {
  const slug = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 191);
  return slug || null;
}

function safeProductSlug(value: string | null): string | null {
  const name = (value ?? '').trim();
  if (!name || /invoice|@|\([^)]{3,}\)|#\d/i.test(name)) {
    return 'unmapped-stripe-product';
  }
  return slugify(name);
}

/** Insert or merge one non-PII lifecycle fact after accounting succeeds. */
export async function enqueueStripeLifecycleFact(
  fact: StripeLifecycleFact,
): Promise<{ enqueued: boolean; id: number | null }> {
  if (!fact.eligible) return { enqueued: false, id: null };
  const canonical = (fact.canonical_transaction_id ?? '').trim();
  const eventId = sourceEventId(fact);
  const occurred = new Date(fact.occurred_at);
  if (!/^pi_[A-Za-z0-9_]+$/.test(canonical)) {
    throw new Error('chaos lifecycle: canonical transaction must be a pi_ id');
  }
  if (!eventId) {
    throw new Error('chaos lifecycle: source event id is missing or invalid');
  }
  if (Number.isNaN(occurred.getTime())) {
    throw new Error('chaos lifecycle: occurred_at is invalid');
  }

  const providerEventId = validProviderId(fact.provider_event_id);
  const providerObjectId = validProviderId(fact.provider_object_id);
  const amount =
    fact.event_name === 'purchase_refunded'
      ? fact.refunded_amount_cents
      : fact.amount_cents;
  const properties: Record<string, unknown> = {
    account: fact.account,
  };
  if (fact.payment_status) properties.payment_status = fact.payment_status;
  if (fact.event_name === 'purchase_refunded') {
    properties.original_transaction_id = canonical;
    properties.refunded_amount_cents = fact.refunded_amount_cents ?? null;
    properties.original_amount_cents = fact.original_amount_cents ?? null;
    properties.is_partial = Boolean(fact.is_partial);
  }

  const result = await query<{ id: string; inserted: boolean }>(
    `INSERT INTO business_v2.chaos_lifecycle_outbox
       (event_name, source_system, source_event_id, canonical_transaction_id,
        provider_event_ids, provider_object_ids, occurred_at, amount_cents,
        currency, properties)
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10::jsonb)
     ON CONFLICT (source_system, source_event_id) DO UPDATE SET
       provider_event_ids = ARRAY(
         SELECT DISTINCT value FROM unnest(
           business_v2.chaos_lifecycle_outbox.provider_event_ids ||
           EXCLUDED.provider_event_ids
         ) value WHERE value <> ''
       ),
       provider_object_ids = ARRAY(
         SELECT DISTINCT value FROM unnest(
           business_v2.chaos_lifecycle_outbox.provider_object_ids ||
           EXCLUDED.provider_object_ids
         ) value WHERE value <> ''
       ),
       updated_at = now()
     RETURNING id::text, (xmax = 0) AS inserted`,
    [
      fact.event_name,
      sourceSystem(fact.account),
      eventId,
      canonical,
      providerEventId ? [providerEventId] : [],
      providerObjectId ? [providerObjectId] : [],
      occurred.toISOString(),
      Number.isFinite(amount) ? amount : null,
      normalizedCurrency(fact.currency),
      JSON.stringify(properties),
    ],
  );
  const row = result.rows[0];
  return { enqueued: Boolean(row?.inserted), id: row ? Number(row.id) : null };
}

async function claimRows(): Promise<OutboxRow[]> {
  return withAgentContext('chaos-lifecycle-reaper', async (client) => {
    const selected = await client.query<OutboxRow>(
      `SELECT id::int, event_name, source_system, source_event_id,
              canonical_transaction_id, provider_event_ids,
              provider_object_ids, occurred_at::text, amount_cents::int,
              currency, properties, attempts
         FROM business_v2.chaos_lifecycle_outbox
        WHERE (
          status IN ('pending', 'failed') AND next_attempt_at <= now()
        ) OR (
          status = 'in_flight' AND last_attempted_at < now() - interval '15 minutes'
        )
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );
    for (const row of selected.rows) {
      await client.query(
        `UPDATE business_v2.chaos_lifecycle_outbox
            SET status='in_flight', last_attempted_at=now(), updated_at=now()
          WHERE id=$1`,
        [row.id],
      );
    }
    return selected.rows;
  });
}

async function paymentIdentity(
  canonicalTransactionId: string,
): Promise<PaymentIdentity> {
  const result = await query<PaymentIdentity>(
    `SELECT email, product_name, product_id
       FROM public.payments
      WHERE stripe_session_id=$1
      ORDER BY paid_at DESC
      LIMIT 1`,
    [canonicalTransactionId],
  );
  const row = result.rows[0];
  if (!row?.email) {
    throw new Error('canonical payment has no resolvable email');
  }
  return row;
}

async function sendRow(
  row: OutboxRow,
  url: string,
  token: string,
): Promise<void> {
  const identity = await paymentIdentity(row.canonical_transaction_id);
  const properties: Record<string, unknown> = {
    ...row.properties,
    amount_cents: row.amount_cents,
    currency: row.currency,
    provider_event_ids: row.provider_event_ids,
    provider_object_ids: row.provider_object_ids,
    stripe_product_id: identity.product_id,
  };
  const body = {
    event_name: row.event_name,
    source_system: row.source_system,
    source_event_id: row.source_event_id,
    occurred_at: row.occurred_at,
    identity: {
      email: identity.email,
      external_id: row.canonical_transaction_id,
    },
    product_slug: safeProductSlug(identity.product_name),
    properties,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chaos-Token': token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `Chaos lifecycle endpoint returned HTTP ${response.status}`,
    );
  }
}

async function markSent(id: number): Promise<void> {
  await query(
    `UPDATE business_v2.chaos_lifecycle_outbox
        SET status='sent', sent_at=now(), last_error=NULL, updated_at=now()
      WHERE id=$1`,
    [id],
  );
}

async function markFailed(row: OutboxRow, error: string): Promise<boolean> {
  const attempts = row.attempts + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(21_600, 60 * 2 ** Math.min(attempts, 8));
  await query(
    `UPDATE business_v2.chaos_lifecycle_outbox
        SET status=$1, attempts=$2, last_error=$3,
            next_attempt_at=now() + ($4::int * interval '1 second'),
            updated_at=now()
      WHERE id=$5`,
    [
      dead ? 'dead_lettered' : 'failed',
      attempts,
      error.slice(0, 1000),
      delaySeconds,
      row.id,
    ],
  );
  return dead;
}

function alertChief(text: string): void {
  let chiefJid: string | null = null;
  try {
    const groups = getAllRegisteredGroups();
    const found = Object.entries(groups).find(
      ([, group]) => group.folder === 'chief',
    );
    chiefJid = found?.[0] ?? null;
  } catch (err) {
    logger.warn(
      { err, text },
      'chaos-lifecycle-reaper: failed to resolve chief jid; alert dropped',
    );
    return;
  }
  if (!chiefJid) {
    logger.warn(
      { text },
      'chaos-lifecycle-reaper: chief group not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `chaos-lifecycle-reaper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: chiefJid, text }, null, 2),
    'utf-8',
  );
}

export async function runChaosLifecycleOutbox(): Promise<ChaosLifecycleReaperResult> {
  const config = readEnvFile([
    'CHAOS_LIFECYCLE_ENABLED',
    'CHAOS_LIFECYCLE_URL',
    'CHAOS_WEBHOOK_SECRET',
  ]);
  if (config.CHAOS_LIFECYCLE_ENABLED !== 'true') {
    return {
      status: 'disabled',
      processed: 0,
      sent: 0,
      retried: 0,
      deadLettered: 0,
    };
  }
  const url = config.CHAOS_LIFECYCLE_URL?.trim();
  const token = config.CHAOS_WEBHOOK_SECRET?.trim();
  if (!url || !token) {
    throw new Error('chaos lifecycle enabled without URL and webhook secret');
  }

  const rows = await claimRows();
  const result: ChaosLifecycleReaperResult = {
    status: 'success',
    processed: rows.length,
    sent: 0,
    retried: 0,
    deadLettered: 0,
  };
  const deadLetterDetails: DeadLetterDetail[] = [];
  for (const row of rows) {
    try {
      await sendRow(row, url, token);
      await markSent(row.id);
      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const dead = await markFailed(row, message);
      if (dead) {
        result.deadLettered++;
        deadLetterDetails.push({
          id: row.id,
          eventName: row.event_name,
          error: message,
        });
      } else result.retried++;
      logger.warn(
        { outboxId: row.id, eventName: row.event_name, dead },
        'chaos-lifecycle-reaper: delivery failed',
      );
    }
  }

  for (const detail of deadLetterDetails) {
    alertChief(
      `[CHAOS-LIFECYCLE-DEAD-LETTER] Outbox #${detail.id} (${detail.eventName}) dead-lettered after ${MAX_ATTEMPTS} attempts: ${detail.error}`,
    );
  }

  logger.info(
    {
      processed: result.processed,
      sent: result.sent,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'chaos-lifecycle-reaper: run complete',
  );
  return result;
}
