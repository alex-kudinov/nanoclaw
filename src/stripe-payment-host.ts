/**
 * Host-side Stripe payment handler — runs the deterministic
 * process-payment.cjs pipeline directly: NO agent container, NO LLM.
 *
 * The `stripe-payment` webhook (n8n) carries only `{stripe_id, event_type}`;
 * process-payment.cjs does the Stripe fetch (following pi.invoice → product
 * for subscription/installment payments), the Google Sheets writes (Payment
 * Log + Student Roster), and the Postgres insert. This handler is a thin,
 * mechanical wrapper — it builds the child env the script needs and relays the
 * script's summary. Mirrors booking-host-write.ts / chaos-activity.ts.
 */

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();
const SCRIPT = path.resolve(PROJECT_ROOT, 'tools/contador/process-payment.cjs');
const REFUND_SCRIPT = path.resolve(
  PROJECT_ROOT,
  'tools/contador/mark-refunds.cjs',
);
const SA_JSON = path.join(
  DATA_DIR,
  'service-accounts',
  'sheets-service-account.json',
);
/** psql is not on the launchd PATH; process-payment.cjs shells `psql -c`. */
const PSQL_DIR = '/opt/homebrew/opt/postgresql@16/bin';

/**
 * Stripe refund event types n8n forwards. For these, the deterministic
 * pipeline must NOT run (it would re-stamp status "succeeded" from pi.status);
 * instead mark-refunds.cjs sets the Payment Log status to "refunded" and
 * records the refund id. n8n sends the underlying pi_/cs_ as stripe_id.
 */
const REFUND_EVENT_TYPES = new Set([
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'charge.refund.updated',
]);

/** Thrown when the webhook envelope carries no usable Stripe id. */
export class StripePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripePayloadError';
  }
}

export interface StripePaymentResult {
  stripeId: string;
  /** Verbatim multi-line summary printed by process-payment.cjs. */
  summary: string;
}

/** Read + validate the Stripe id from the n8n `{stripe_id, event_type}` envelope. */
export function parseStripePayload(payload: unknown): string {
  const p =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const id = typeof p.stripe_id === 'string' ? p.stripe_id.trim() : '';
  // cs_ checkout-session ids carry a cs_test_/cs_live_ prefix — underscores
  // are valid. Mirrors the n8n Stripe validator's character class.
  if (!/^(pi|cs)_[A-Za-z0-9_]+$/.test(id)) {
    throw new StripePayloadError(
      `invalid or missing stripe_id: ${JSON.stringify(p.stripe_id)}`,
    );
  }
  return id;
}

/** Read the (optional) Stripe event_type from the n8n envelope. */
export function parseEventType(payload: unknown): string {
  const p =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  return typeof p.event_type === 'string' ? p.event_type.trim() : '';
}

/** Build the child env process-payment.cjs needs (Stripe keys, Sheets, psql). */
function buildScriptEnv(): NodeJS.ProcessEnv {
  const cfg = readEnvFile([
    'STRIPE_RESTRICTED_KEY',
    'STRIPE_SECRET_KEY_ALT',
    'SHEETS_PAYMENTS_ID',
    'SHEETS_ROSTER_ID',
  ]);
  return {
    ...process.env,
    ...cfg,
    SHEETS_SA_JSON: SA_JSON,
    PGDATABASE: 'nanoclaw_business',
    PATH: `${process.env.PATH ?? ''}:${PSQL_DIR}`,
  };
}

/**
 * Mechanically process a Stripe payment via process-payment.cjs. Zero LLM, no
 * container. Idempotent — the script upserts (Sheets by Stripe ID, Postgres
 * ON CONFLICT), so a replayed webhook re-resolves the same rows.
 */
export async function handleStripePayment(
  payload: unknown,
): Promise<StripePaymentResult> {
  const stripeId = parseStripePayload(payload);
  const isRefund = REFUND_EVENT_TYPES.has(parseEventType(payload));
  // Refund events run mark-refunds.cjs in single-id mode (status → "refunded",
  // records the re_ id). Payment events run the full process-payment pipeline.
  const args = isRefund
    ? [REFUND_SCRIPT, '--id', stripeId, '--apply']
    : [SCRIPT, stripeId];
  const { stdout } = await execFileAsync(process.execPath, args, {
    env: buildScriptEnv(),
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const summary = stdout.trim();
  logger.info(
    { stripeId, isRefund, lines: summary.split('\n').length },
    isRefund
      ? 'Stripe refund recorded (no agent spawn)'
      : 'Stripe payment processed (no agent spawn)',
  );
  return { stripeId, summary };
}
