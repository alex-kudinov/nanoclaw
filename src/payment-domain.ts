/**
 * Unwired payment contracts. No provider, database, enrollment or messaging I/O.
 * Callers must authenticate/admit evidence and persist decisions atomically.
 * These pure functions are not a concurrency lock or a fulfillment policy.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = integer;
const currency = z.string().regex(/^[A-Z]{3}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema = z
  .object({
    provider: z.enum(['adyen', 'stripe']),
    environment: z.enum(['test', 'live']),
    company: ref,
    merchant: ref,
    store: ref.nullable(),
    endpointRegion: ref,
  })
  .strict();

const quoteSchema = z
  .object({
    schemaVersion: z.literal(1),
    quoteId: z.uuid(),
    authority: ref,
    offerKey: ref,
    catalogVersion: ref,
    bundleVersion: ref,
    deliveryVersion: ref,
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    payerReference: ref.nullable(),
    participantReference: ref.nullable(),
    currency,
    originalAmount: integer,
    discountAmount: integer,
    finalAmount: integer,
    discountPolicyReference: ref.nullable(),
    redemptionReference: ref.nullable(),
    paymentOption: z.literal('one_time'),
    termsVersion: ref,
    consentReceipt: ref,
    acceptedAt: timestamp,
    createdAt: timestamp,
    expiresAt: timestamp,
  })
  .strict();

export type PaymentQuote = Readonly<z.infer<typeof quoteSchema>>;
export type PaymentScope = Readonly<z.infer<typeof scopeSchema>>;

export class PaymentDomainError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PaymentDomainError';
  }
}

function check(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  check(result.success, 'invalid_contract');
  return result.data;
}

// All hashed inputs below are strict, parsed contracts containing only JSON data.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

/** Validates the authority's arithmetic, not coupon eligibility or identity. */
export function validatePaymentQuote(input: unknown): PaymentQuote {
  const quote = parse(quoteSchema, input);
  check(
    quote.discountAmount <= quote.originalAmount &&
      quote.finalAmount === quote.originalAmount - quote.discountAmount,
    'quote_arithmetic_mismatch',
  );
  check(
    quote.createdAt < quote.expiresAt && quote.acceptedAt <= quote.createdAt,
    'quote_time_mismatch',
  );
  check(
    quote.discountAmount === 0 || quote.discountPolicyReference !== null,
    'discount_policy_missing',
  );
  return Object.freeze(quote);
}

export function paymentQuoteFingerprint(input: unknown): string {
  return hash(validatePaymentQuote(input));
}

export function paymentScopeFingerprint(input: unknown): string {
  return hash(parse(scopeSchema, input));
}

const attemptSchema = z
  .object({
    schemaVersion: z.literal(1),
    attemptId: z.uuid(),
    quote: quoteSchema,
    quoteFingerprint: digest,
    scope: scopeSchema,
    createdAt: timestamp,
  })
  .strict();
export type PaymentAttempt = Readonly<
  Omit<z.infer<typeof attemptSchema>, 'quote' | 'scope'> & {
    quote: PaymentQuote;
    scope: PaymentScope;
  }
>;

export function validateAttempt(input: unknown): PaymentAttempt {
  const attempt = parse(attemptSchema, input);
  const quote = validatePaymentQuote(attempt.quote);
  check(hash(quote) === attempt.quoteFingerprint, 'quote_fingerprint_mismatch');
  check(quote.finalAmount > 0, 'free_order_requires_separate_admission');
  check(
    attempt.createdAt >= quote.createdAt && attempt.createdAt < quote.expiresAt,
    'quote_not_current_at_attempt_creation',
  );
  return Object.freeze({
    ...attempt,
    quote,
    scope: Object.freeze(attempt.scope),
  });
}

export function createPaymentAttempt(input: {
  attemptId: string;
  quote: unknown;
  scope: unknown;
  now: number;
}): PaymentAttempt {
  const quote = validatePaymentQuote(input.quote);
  return validateAttempt({
    schemaVersion: 1,
    attemptId: input.attemptId,
    quote,
    quoteFingerprint: hash(quote),
    scope: input.scope,
    createdAt: input.now,
  });
}

/** An existing attempt cannot silently adopt a new coupon, route or provider. */
export function assertPaymentAttemptReuse(
  input: unknown,
  quote: unknown,
  scope: unknown,
): PaymentAttempt {
  const attempt = validateAttempt(input);
  check(
    attempt.quoteFingerprint === paymentQuoteFingerprint(quote),
    'attempt_quote_conflict',
  );
  check(
    hash(attempt.scope) === hash(parse(scopeSchema, scope)),
    'attempt_scope_conflict',
  );
  return attempt;
}

const operationSchema = z
  .object({
    operationId: z.uuid(),
    attemptId: z.uuid(),
    attemptFingerprint: digest,
    kind: z.literal('create_session'),
    idempotencyKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    requestFingerprint: digest,
    firstDispatchAt: timestamp,
    retryUntil: timestamp,
    sessionExpiresAt: timestamp.nullable(),
    state: z.enum([
      'dispatching',
      'unknown',
      'session_available',
      'permanent_failure',
    ]),
  })
  .strict();
export type PaymentOperation = Readonly<z.infer<typeof operationSchema>>;

function validateOperation(input: unknown): PaymentOperation {
  const operation = parse(operationSchema, input);
  check(
    operation.retryUntil > operation.firstDispatchAt &&
      operation.retryUntil - operation.firstDispatchAt <
        7 * 24 * 60 * 60 * 1000,
    'invalid_retry_window',
  );
  check(
    operation.state === 'session_available'
      ? operation.sessionExpiresAt !== null &&
          operation.sessionExpiresAt > operation.firstDispatchAt
      : operation.sessionExpiresAt === null,
    'invalid_session_expiry',
  );
  return Object.freeze(operation);
}

/** Persist this record under a unique key/CAS BEFORE any network dispatch. */
export function preparePaymentOperation(input: {
  attempt: unknown;
  operationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  now: number;
  retryUntil: number;
}): PaymentOperation {
  const attempt = validateAttempt(input.attempt);
  check(
    input.now >= attempt.createdAt && input.now < attempt.quote.expiresAt,
    'quote_expired_before_dispatch',
  );
  const operation = validateOperation({
    operationId: input.operationId,
    attemptId: attempt.attemptId,
    attemptFingerprint: hash(attempt),
    kind: 'create_session',
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    firstDispatchAt: input.now,
    retryUntil: input.retryUntil,
    sessionExpiresAt: null,
    state: 'dispatching',
  });
  return Object.freeze(operation);
}

/** Apply only a correlated provider result; contradictory results need an exception. */
export function recordPaymentOperationResult(
  input: unknown,
  result: PaymentOperation['state'],
  sessionExpiresAt: number | null = null,
): PaymentOperation {
  const operation = validateOperation(input);
  const next = validateOperation({
    ...operation,
    state: result,
    sessionExpiresAt,
  });
  check(result !== 'dispatching', 'invalid_operation_result');
  check(
    operation.state === 'dispatching' ||
      operation.state === 'unknown' ||
      operation.state === result,
    'operation_result_conflict',
  );
  check(
    operation.state !== 'session_available' ||
      operation.sessionExpiresAt === sessionExpiresAt,
    'session_expiry_conflict',
  );
  return Object.freeze(next);
}

/**
 * Recovery permission only, never dispatch ownership. Lease expiry means UNKNOWN,
 * not failure. A retry must use the exact stored request, key and pinned endpoint.
 */
export function decidePaymentOperationRecovery(input: {
  attempt: unknown;
  operation: unknown;
  requestFingerprint: string;
  now: number;
}): 'reuse_session' | 'retry_same_operation' | 'reconcile' | 'stop' {
  const attempt = validateAttempt(input.attempt);
  const operation = validateOperation(input.operation);
  parse(timestamp, input.now);
  check(
    operation.attemptId === attempt.attemptId &&
      operation.attemptFingerprint === hash(attempt),
    'operation_attempt_conflict',
  );
  check(
    operation.requestFingerprint === input.requestFingerprint,
    'operation_request_conflict',
  );
  check(input.now >= operation.firstDispatchAt, 'clock_before_dispatch');
  check(
    operation.firstDispatchAt >= attempt.createdAt &&
      operation.firstDispatchAt < attempt.quote.expiresAt,
    'operation_dispatch_time_conflict',
  );
  if (operation.state === 'session_available')
    return input.now < operation.sessionExpiresAt!
      ? 'reuse_session'
      : 'reconcile';
  if (operation.state === 'permanent_failure') return 'stop';
  return input.now < operation.retryUntil
    ? 'retry_same_operation'
    : 'reconcile';
}

const factSchema = z
  .object({
    deliveryId: ref,
    scope: scopeSchema,
    attemptId: z.uuid(),
    paymentReference: ref,
    kind: z.enum(['authorization', 'capture', 'refund']),
    operationReference: ref,
    success: z.boolean(),
    amount: integer.refine((value) => value > 0),
    currency,
  })
  .strict();
export type PaymentFact = z.infer<typeof factSchema>;
export interface PaymentEvidenceProjection {
  authorization: 'unknown' | 'authorized' | 'refused' | 'conflict';
  capturedAmount: number;
  refundedAmount: number;
  evidenceState: 'consistent' | 'awaiting_prior_evidence' | 'conflict';
  exceptions: string[];
  // Provider authorization/capture is never represented as settlement or access.
  settlement: 'unproven';
  fulfillment: 'not_evaluated';
}

/**
 * Rebuild from ALL admitted facts, not a mutable last-event-wins accumulator.
 * No HMAC/authentication here: the ingress adapter owns signature verification,
 * stable delivery/operation identities and persisted payment-reference correlation.
 * Unknown event kinds (returns/disputes/cancellations) fail closed until modeled.
 */
export function projectPaymentEvidence(input: {
  attempt: unknown;
  paymentReference: string;
  facts: unknown[];
}): PaymentEvidenceProjection {
  const attempt = validateAttempt(input.attempt);
  parse(ref, input.paymentReference);
  const deliveries = new Map<string, string>();
  const operations = new Map<string, PaymentFact>();
  const exceptions = new Set<string>();
  for (const raw of input.facts) {
    const fact = parse(factSchema, raw);
    check(hash(fact.scope) === hash(attempt.scope), 'fact_scope_mismatch');
    check(
      fact.attemptId === attempt.attemptId &&
        fact.paymentReference === input.paymentReference,
      'fact_payment_mismatch',
    );
    check(fact.currency === attempt.quote.currency, 'fact_currency_mismatch');
    check(
      fact.amount <= attempt.quote.finalAmount,
      'fact_amount_exceeds_payment',
    );
    check(
      fact.kind !== 'authorization' ||
        fact.amount === attempt.quote.finalAmount,
      'authorization_amount_mismatch',
    );
    const fingerprint = hash(fact);
    const priorDelivery = deliveries.get(fact.deliveryId);
    if (priorDelivery && priorDelivery !== fingerprint)
      exceptions.add('delivery_payload_conflict');
    deliveries.set(fact.deliveryId, fingerprint);
    // One authorization for this one-time attempt; partial captures/refunds are
    // distinct child operations, deduplicated even under a different delivery ID.
    const key =
      fact.kind === 'authorization'
        ? 'authorization'
        : `${fact.kind}:${fact.operationReference}`;
    const priorOperation = operations.get(key);
    const { deliveryId: _, ...semantic } = fact;
    if (priorOperation) {
      const { deliveryId: __, ...priorSemantic } = priorOperation;
      if (hash(semantic) !== hash(priorSemantic))
        exceptions.add('operation_payload_conflict');
    } else operations.set(key, fact);
  }
  const authorizationFact = operations.get('authorization');
  const conflictProjection = (): PaymentEvidenceProjection => ({
    authorization: 'conflict',
    capturedAmount: 0,
    refundedAmount: 0,
    evidenceState: 'conflict',
    exceptions: [...exceptions].sort(),
    settlement: 'unproven',
    fulfillment: 'not_evaluated',
  });
  if (exceptions.size > 0) return conflictProjection();
  let captured = 0n;
  let refunded = 0n;
  for (const fact of operations.values()) {
    if (fact.kind === 'capture' && fact.success)
      captured += BigInt(fact.amount);
    if (fact.kind === 'refund' && fact.success) refunded += BigInt(fact.amount);
  }
  if (captured > BigInt(attempt.quote.finalAmount))
    exceptions.add('capture_exceeds_payment');
  if (refunded > BigInt(attempt.quote.finalAmount))
    exceptions.add('refund_exceeds_payment');
  if (authorizationFact?.success === false && captured > 0n)
    exceptions.add('capture_after_refusal');
  if (authorizationFact?.success === false && refunded > 0n)
    exceptions.add('refund_after_refusal');
  const conflict = exceptions.size > 0;
  if (conflict) return conflictProjection();
  // Suppress ambiguous totals, so processing order cannot affect a usable result.
  return {
    authorization: conflict
      ? 'conflict'
      : !authorizationFact
        ? 'unknown'
        : authorizationFact.success
          ? 'authorized'
          : 'refused',
    capturedAmount: conflict ? 0 : Number(captured),
    refundedAmount: conflict ? 0 : Number(refunded),
    evidenceState: conflict
      ? 'conflict'
      : (captured > 0n && !authorizationFact) || refunded > captured
        ? 'awaiting_prior_evidence'
        : 'consistent',
    exceptions: [...exceptions].sort(),
    settlement: 'unproven',
    fulfillment: 'not_evaluated',
  };
}
