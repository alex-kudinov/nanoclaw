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
import { randomUUID } from 'crypto';
import path from 'path';
import { promisify } from 'util';

import { assertExternalWriteAllowed } from './action-safety.js';
import { DATA_DIR } from './config.js';
import {
  enqueueStripeLifecycleFact,
  type StripeLifecycleAccount,
  type StripeLifecycleFact,
} from './chaos-lifecycle-outbox.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import {
  beginContadorFulfillment,
  finalizeContadorFulfillment,
  type ContadorFulfillmentState,
  type ContadorProviderAlias,
  type ContadorStageReceiptInput,
  type DurableContadorFulfillmentCase,
} from './contador-payment-fulfillment-store.js';
import {
  resolveStripePaymentSource,
  type ResolvedStripePaymentSource,
} from './stripe-payment-source.js';

const execFileAsync = promisify(execFile);

const CODE_ROOT = process.env.NANOCLAW_CODE_ROOT || process.cwd();
const SCRIPT = path.resolve(CODE_ROOT, 'tools/contador/process-payment.cjs');
const REFUND_SCRIPT = path.resolve(
  CODE_ROOT,
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
const PAYMENT_EVENT_TYPES = new Set([
  'payment_intent.succeeded',
  'checkout.session.completed',
]);

/** Thrown when the webhook envelope carries no usable Stripe id. */
export class StripePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripePayloadError';
  }
}

export class StripeFulfillmentInFlightError extends Error {
  constructor(readonly caseId: string) {
    super(`Stripe fulfillment case ${caseId} already has an active processor`);
    this.name = 'StripeFulfillmentInFlightError';
  }
}

export interface StripePaymentResult {
  stripeId: string;
  /** Verbatim multi-line summary printed by process-payment.cjs. */
  summary: string;
  lifecycleEnqueued: boolean;
  fulfillmentCaseId: string;
  fulfillmentState: ContadorFulfillmentState;
  fulfillmentVersion: number;
  duplicateComplete: boolean;
}

export interface StripePaymentHostDeps {
  /** Production defaults to execFileAsync; the installed safety drill injects a no-child tripwire. */
  execFile?: (
    file: string,
    args: readonly string[],
    options: {
      env: NodeJS.ProcessEnv;
      timeout: number;
      maxBuffer: number;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  /** Production defaults to the durable lifecycle outbox writer. */
  enqueueLifecycleFact?: typeof enqueueStripeLifecycleFact;
  resolveSource?: typeof resolveStripePaymentSource;
  beginFulfillment?: typeof beginContadorFulfillment;
  finalizeFulfillment?: typeof finalizeContadorFulfillment;
}

interface ProcessorFulfillmentResult {
  version: 1;
  stripeAccount: 'heartbeat' | 'tandem';
  paymentIntentId: string;
  sourceObjectId: string;
  state: Exclude<ContadorFulfillmentState, 'processing'>;
  errorCode: string | null;
  aliases: ContadorProviderAlias[];
  receipts: ContadorStageReceiptInput[];
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

export function parseStripeAccount(
  payload: unknown,
): StripeLifecycleAccount | null {
  const p =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const account = typeof p.account === 'string' ? p.account.trim() : '';
  if (!account) return null;
  if (account !== 'heartbeat' && account !== 'tandem') {
    throw new StripePayloadError(`invalid Stripe account label: ${account}`);
  }
  return account;
}

function optionalProviderId(
  payload: unknown,
  field: 'event_id' | 'refund_id',
  prefix: 'evt' | 're',
): string | null {
  const p =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const value = typeof p[field] === 'string' ? p[field].trim() : '';
  if (!value) return null;
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value)) {
    throw new StripePayloadError(`invalid ${field}`);
  }
  return value;
}

export function parseLifecycleSentinel(stdout: string): {
  summary: string;
  fact: StripeLifecycleFact | null;
  fulfillment: ProcessorFulfillmentResult | null;
} {
  let fact: StripeLifecycleFact | null = null;
  let fulfillment: ProcessorFulfillmentResult | null = null;
  const summaryLines: string[] = [];
  for (const line of stdout.split('\n')) {
    if (line.startsWith('__CONTADOR_FULFILLMENT__')) {
      const encoded = line.slice('__CONTADOR_FULFILLMENT__'.length).trim();
      try {
        fulfillment = JSON.parse(
          Buffer.from(encoded, 'base64url').toString('utf8'),
        ) as ProcessorFulfillmentResult;
      } catch {
        throw new StripePayloadError(
          'invalid fulfillment result from Stripe processor',
        );
      }
      continue;
    }
    if (!line.startsWith('__CHAOS_LIFECYCLE__')) {
      summaryLines.push(line);
      continue;
    }
    const encoded = line.slice('__CHAOS_LIFECYCLE__'.length).trim();
    try {
      fact = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as StripeLifecycleFact;
    } catch {
      throw new StripePayloadError(
        'invalid lifecycle result from Stripe processor',
      );
    }
  }
  return { summary: summaryLines.join('\n').trim(), fact, fulfillment };
}

function assertProcessorFulfillment(
  result: ProcessorFulfillmentResult | null,
  source: ResolvedStripePaymentSource,
): ProcessorFulfillmentResult {
  if (!result || result.version !== 1) {
    throw new StripePayloadError(
      'missing fulfillment result from Stripe processor',
    );
  }
  if (
    result.stripeAccount !== source.stripeAccount ||
    result.paymentIntentId !== source.paymentIntentId ||
    result.sourceObjectId !== source.sourceObjectId
  ) {
    throw new StripePayloadError(
      'Stripe processor fulfillment identity does not match host admission',
    );
  }
  if (
    ![
      'complete',
      'needs_student',
      'needs_product',
      'write_failed',
      'needs_review',
    ].includes(result.state)
  ) {
    throw new StripePayloadError('invalid Stripe processor fulfillment state');
  }
  if (!Array.isArray(result.aliases) || !Array.isArray(result.receipts)) {
    throw new StripePayloadError(
      'invalid Stripe processor fulfillment receipts',
    );
  }
  const byStage = new Map<string, ContadorStageReceiptInput>(
    result.receipts.map((receipt) => [receipt.stage, receipt]),
  );
  const isRefund = REFUND_EVENT_TYPES.has(source.eventType);
  const required = isRefund
    ? ['stripe_source', 'payment_log', 'postgres_payment', 'refund_fulfillment']
    : ['stripe_source', 'payment_log', 'postgres_payment', 'student_roster'];
  if (required.some((stage) => !byStage.has(stage))) {
    throw new StripePayloadError('incomplete Stripe processor stage receipts');
  }
  if (
    (result.state === 'complete' && isRefund) ||
    (result.state === 'complete' &&
      required.some((stage) => byStage.get(stage)?.outcome !== 'verified'))
  ) {
    throw new StripePayloadError(
      'Stripe processor completion lacks verified stage readback',
    );
  }
  return result;
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
  deps: StripePaymentHostDeps = {},
): Promise<StripePaymentResult> {
  const stripeId = parseStripePayload(payload);
  const eventType = parseEventType(payload);
  const isRefund = REFUND_EVENT_TYPES.has(eventType);
  if (!eventType || (!isRefund && !PAYMENT_EVENT_TYPES.has(eventType))) {
    throw new StripePayloadError(`unsupported Stripe event_type: ${eventType}`);
  }
  const account = parseStripeAccount(payload);
  if (!account) {
    throw new StripePayloadError(
      'Stripe account label is required for typed payment and refund events',
    );
  }
  const providerEventId = optionalProviderId(payload, 'event_id', 'evt');
  const refundId = optionalProviderId(payload, 'refund_id', 're');
  if (refundId && !isRefund) {
    throw new StripePayloadError('refund_id requires a refund event_type');
  }
  const source = await (deps.resolveSource ?? resolveStripePaymentSource)({
    stripeId,
    stripeAccount: account,
    eventType,
    providerEventId,
    refundId,
  });
  assertExternalWriteAllowed({
    system: 'stripe',
    actionClass: isRefund ? 'c4_financial' : 'c2_external_write',
    source: 'host:stripe-payment',
  });
  const admission = await (deps.beginFulfillment ?? beginContadorFulfillment)({
    stripeAccount: source.stripeAccount,
    paymentIntentId: source.paymentIntentId,
    sourceObjectId: source.sourceObjectId,
    sourceEventId: source.sourceEventId,
    eventType: source.eventType,
    observedAt: source.observedAt,
    leaseToken: randomUUID(),
    aliases: source.aliases,
  });
  if (admission.duplicateComplete) {
    return {
      stripeId,
      summary: `[PAYMENT ALREADY VERIFIED]\nFulfillment Case: ${admission.item.id}`,
      lifecycleEnqueued: false,
      fulfillmentCaseId: admission.item.id,
      fulfillmentState: admission.item.state,
      fulfillmentVersion: admission.item.version,
      duplicateComplete: true,
    };
  }
  if (admission.inFlight || !admission.leaseToken) {
    throw new StripeFulfillmentInFlightError(admission.item.id);
  }
  // Refund events run mark-refunds.cjs in single-id mode (status → "refunded",
  // records the re_ id). Payment events run the full process-payment pipeline.
  const args = isRefund
    ? [
        REFUND_SCRIPT,
        '--id',
        stripeId,
        '--apply',
        '--account',
        account,
        ...(refundId ? ['--refund-id', refundId] : []),
      ]
    : [SCRIPT, stripeId, '--account', account];
  let parsed: ReturnType<typeof parseLifecycleSentinel>;
  let fulfillment: ProcessorFulfillmentResult;
  try {
    const { stdout } = await (deps.execFile ?? execFileAsync)(
      process.execPath,
      args,
      {
        env: buildScriptEnv(),
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    parsed = parseLifecycleSentinel(stdout);
    fulfillment = assertProcessorFulfillment(parsed.fulfillment, source);
  } catch (err) {
    try {
      await (deps.finalizeFulfillment ?? finalizeContadorFulfillment)({
        caseId: admission.item.id,
        expectedVersion: admission.item.version,
        leaseToken: admission.leaseToken,
        sourceEventId: source.sourceEventId,
        state: 'write_failed',
        errorCode: 'processor_failed',
        occurredAt: source.observedAt,
        aliases: source.aliases,
        receipts: [
          {
            stage: 'stripe_source',
            outcome: 'verified',
            resultCode: 'stripe_source_resolved',
          },
          {
            stage: 'payment_log',
            outcome: 'failed',
            resultCode: 'processor_failed_before_verified_receipt',
          },
          {
            stage: 'postgres_payment',
            outcome: 'failed',
            resultCode: 'processor_failed_before_verified_receipt',
          },
          {
            stage: isRefund ? 'refund_fulfillment' : 'student_roster',
            outcome: 'failed',
            resultCode: 'processor_failed_before_verified_receipt',
          },
        ],
      });
    } catch (ledgerError) {
      logger.error(
        { stripeId, caseId: admission.item.id, err: ledgerError },
        'Contador fulfillment failure could not be persisted',
      );
      throw new Error(
        'Stripe processor failed and durable fulfillment exception could not be persisted',
        { cause: err },
      );
    }
    throw err;
  }
  const finalCase: DurableContadorFulfillmentCase = await (
    deps.finalizeFulfillment ?? finalizeContadorFulfillment
  )({
    caseId: admission.item.id,
    expectedVersion: admission.item.version,
    leaseToken: admission.leaseToken,
    sourceEventId: source.sourceEventId,
    state: fulfillment.state,
    errorCode: fulfillment.errorCode,
    occurredAt: source.observedAt,
    aliases: [...source.aliases, ...fulfillment.aliases],
    receipts: fulfillment.receipts,
  });
  let lifecycleEnqueued = false;
  if (finalCase.state === 'complete' && parsed.fact?.eligible) {
    if (parsed.fact.account !== account) {
      throw new StripePayloadError(
        `Stripe account mismatch: perimeter=${account}, resolver=${parsed.fact.account}`,
      );
    }
    try {
      const result = await (
        deps.enqueueLifecycleFact ?? enqueueStripeLifecycleFact
      )({
        ...parsed.fact,
        provider_event_id: providerEventId,
        provider_object_id: parsed.fact.provider_object_id ?? stripeId,
        source_event_id: refundId ?? parsed.fact.source_event_id,
      });
      lifecycleEnqueued = result.enqueued;
    } catch (err) {
      logger.warn(
        { stripeId, caseId: finalCase.id, err },
        'Stripe lifecycle fact enqueue failed after fulfillment closure',
      );
    }
  }
  const summary = parsed.summary;
  logger.info(
    {
      stripeId,
      isRefund,
      caseId: finalCase.id,
      fulfillmentState: finalCase.state,
      lines: summary.split('\n').length,
    },
    isRefund
      ? 'Stripe refund recorded (no agent spawn)'
      : 'Stripe payment processed (no agent spawn)',
  );
  return {
    stripeId,
    summary,
    lifecycleEnqueued,
    fulfillmentCaseId: finalCase.id,
    fulfillmentState: finalCase.state,
    fulfillmentVersion: finalCase.version,
    duplicateComplete: false,
  };
}
