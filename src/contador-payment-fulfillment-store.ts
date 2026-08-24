/**
 * Host-only durable Contador payment/refund fulfillment ledger.
 *
 * The ledger is intentionally content-minimized. It stores opaque Stripe
 * identities, state/counters/codes, hashes, and timestamps — never customer,
 * student, product, amount, card, raw webhook, or accounting content.
 */

import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';

const ACTOR = 'contador-payment-fulfillment:host';
const SHA256_RE = /^[0-9a-f]{64}$/;
const SOURCE_EVENT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/;
const RESULT_CODE_RE = /^[a-z][a-z0-9_]{0,99}$/;

export type ContadorStripeAccount = 'heartbeat' | 'tandem';
export type ContadorFulfillmentState =
  | 'processing'
  | 'complete'
  | 'needs_student'
  | 'needs_product'
  | 'write_failed'
  | 'needs_review';
export type ContadorFulfillmentStage =
  | 'admission'
  | 'stripe_source'
  | 'payment_log'
  | 'postgres_payment'
  | 'student_roster'
  | 'refund_fulfillment'
  | 'final';
export type ContadorReceiptOutcome =
  | 'verified'
  | 'exception'
  | 'failed'
  | 'not_applicable';
export type ContadorAliasKind =
  | 'payment_intent'
  | 'checkout_session'
  | 'charge'
  | 'invoice'
  | 'refund'
  | 'event';

export interface ContadorProviderAlias {
  kind: ContadorAliasKind;
  id: string;
}

export interface BeginContadorFulfillmentInput {
  stripeAccount: ContadorStripeAccount;
  paymentIntentId: string;
  sourceObjectId: string;
  sourceEventId: string;
  eventType: string;
  observedAt: string;
  leaseToken: string;
  aliases: ContadorProviderAlias[];
}

export interface ContadorStageReceiptInput {
  stage: Exclude<ContadorFulfillmentStage, 'admission' | 'final'>;
  outcome: ContadorReceiptOutcome;
  resultCode: string;
}

export interface FinalizeContadorFulfillmentInput {
  caseId: string;
  expectedVersion: number;
  leaseToken: string;
  sourceEventId: string;
  state: Exclude<ContadorFulfillmentState, 'processing'>;
  errorCode: string | null;
  occurredAt: string;
  aliases: ContadorProviderAlias[];
  receipts: ContadorStageReceiptInput[];
}

export interface DurableContadorFulfillmentCase {
  id: string;
  stripeAccount: ContadorStripeAccount;
  paymentIntentId: string;
  state: ContadorFulfillmentState;
  version: number;
  attemptCount: number;
  leaseExpiresAt: string | null;
  ownerGroup: 'contador';
  lastEventType: string;
  lastSourceObjectId: string;
  lastSourceEventId: string;
  lastErrorCode: string | null;
  lastEvidenceSha256: string;
  reviewDeadline: string | null;
  resolvedAt: string | null;
}

export interface BeginContadorFulfillmentResult {
  item: DurableContadorFulfillmentCase;
  duplicateComplete: boolean;
  inFlight: boolean;
  leaseToken: string | null;
}

export interface ContadorFulfillmentStoreClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

interface CaseRow extends QueryResultRow {
  id: string;
  stripe_account: ContadorStripeAccount;
  payment_intent_id: string;
  state: ContadorFulfillmentState;
  version: number;
  attempt_count: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  lease_active: boolean;
  owner_group: 'contador';
  last_event_type: string;
  last_source_object_id: string;
  last_source_event_id: string;
  last_error_code: string | null;
  last_evidence_sha256: string;
  review_deadline: string | null;
  resolved_at: string | null;
}

const CASE_COLUMNS = `
  id::text, stripe_account, payment_intent_id, state, version,
  attempt_count, lease_token, lease_expires_at::text,
  (lease_expires_at > now()) AS lease_active,
  owner_group, last_event_type, last_source_object_id,
  last_source_event_id, last_error_code, last_evidence_sha256,
  review_deadline::text, resolved_at::text
`;

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toItem(row: CaseRow): DurableContadorFulfillmentCase {
  return {
    id: row.id,
    stripeAccount: row.stripe_account,
    paymentIntentId: row.payment_intent_id,
    state: row.state,
    version: row.version,
    attemptCount: row.attempt_count,
    leaseExpiresAt: row.lease_expires_at,
    ownerGroup: row.owner_group,
    lastEventType: row.last_event_type,
    lastSourceObjectId: row.last_source_object_id,
    lastSourceEventId: row.last_source_event_id,
    lastErrorCode: row.last_error_code,
    lastEvidenceSha256: row.last_evidence_sha256,
    reviewDeadline: row.review_deadline,
    resolvedAt: row.resolved_at,
  };
}

function assertIso(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`contador-fulfillment: ${label} must be ISO-8601`);
  }
}

function assertAlias(alias: ContadorProviderAlias): void {
  const patterns: Record<ContadorAliasKind, RegExp> = {
    payment_intent: /^pi_[A-Za-z0-9_]+$/,
    checkout_session: /^cs_[A-Za-z0-9_]+$/,
    charge: /^ch_[A-Za-z0-9_]+$/,
    invoice: /^in_[A-Za-z0-9_]+$/,
    refund: /^re_[A-Za-z0-9_]+$/,
    event: /^evt_[A-Za-z0-9_]+$/,
  };
  if (!patterns[alias.kind].test(alias.id)) {
    throw new Error(`contador-fulfillment: invalid ${alias.kind} alias`);
  }
}

function assertBegin(input: BeginContadorFulfillmentInput): void {
  if (!['heartbeat', 'tandem'].includes(input.stripeAccount)) {
    throw new Error('contador-fulfillment: invalid Stripe account');
  }
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) {
    throw new Error('contador-fulfillment: invalid payment intent');
  }
  if (!/^(pi|cs)_[A-Za-z0-9_]+$/.test(input.sourceObjectId)) {
    throw new Error('contador-fulfillment: invalid source object');
  }
  if (!SOURCE_EVENT_RE.test(input.sourceEventId)) {
    throw new Error('contador-fulfillment: invalid source event');
  }
  if (
    ![
      'payment_intent.succeeded',
      'checkout.session.completed',
      'charge.refunded',
      'refund.created',
      'refund.updated',
      'charge.refund.updated',
    ].includes(input.eventType)
  ) {
    throw new Error('contador-fulfillment: unsupported event type');
  }
  assertIso(input.observedAt, 'observedAt');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      input.leaseToken,
    )
  ) {
    throw new Error('contador-fulfillment: invalid lease token');
  }
  input.aliases.forEach(assertAlias);
  if (
    !input.aliases.some(
      (alias) =>
        alias.kind === 'payment_intent' && alias.id === input.paymentIntentId,
    )
  ) {
    throw new Error(
      'contador-fulfillment: canonical payment alias is required',
    );
  }
}

function assertFinalize(input: FinalizeContadorFulfillmentInput): void {
  if (!/^[1-9][0-9]*$/.test(input.caseId)) {
    throw new Error('contador-fulfillment: invalid case id');
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error('contador-fulfillment: invalid expected version');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      input.leaseToken,
    )
  ) {
    throw new Error('contador-fulfillment: invalid lease token');
  }
  if (!SOURCE_EVENT_RE.test(input.sourceEventId)) {
    throw new Error('contador-fulfillment: invalid source event');
  }
  assertIso(input.occurredAt, 'occurredAt');
  input.aliases.forEach(assertAlias);
  if (
    input.state === 'complete' ? input.errorCode !== null : !input.errorCode
  ) {
    throw new Error('contador-fulfillment: final state/error mismatch');
  }
  if (input.errorCode && !RESULT_CODE_RE.test(input.errorCode)) {
    throw new Error('contador-fulfillment: invalid error code');
  }
  const seen = new Set<ContadorFulfillmentStage>();
  for (const receipt of input.receipts) {
    if (seen.has(receipt.stage)) {
      throw new Error('contador-fulfillment: duplicate stage receipt');
    }
    seen.add(receipt.stage);
    if (!RESULT_CODE_RE.test(receipt.resultCode)) {
      throw new Error('contador-fulfillment: invalid result code');
    }
  }
  for (const required of ['stripe_source', 'payment_log'] as const) {
    if (!seen.has(required)) {
      throw new Error(`contador-fulfillment: ${required} receipt is required`);
    }
  }
}

function assertReceiptCompleteness(
  current: CaseRow,
  input: FinalizeContadorFulfillmentInput,
): void {
  const byStage = new Map(
    input.receipts.map((receipt) => [receipt.stage, receipt]),
  );
  const isRefund = [
    'charge.refunded',
    'refund.created',
    'refund.updated',
    'charge.refund.updated',
  ].includes(current.last_event_type);
  const required: ContadorStageReceiptInput['stage'][] = isRefund
    ? ['stripe_source', 'payment_log', 'postgres_payment', 'refund_fulfillment']
    : ['stripe_source', 'payment_log', 'postgres_payment', 'student_roster'];
  for (const stage of required) {
    if (!byStage.has(stage)) {
      throw new Error(`contador-fulfillment: ${stage} receipt is required`);
    }
  }
  if (isRefund && input.state === 'complete') {
    throw new Error(
      'contador-fulfillment: refund cannot complete before fulfillment review',
    );
  }
  if (
    input.state === 'complete' &&
    required.some((stage) => byStage.get(stage)?.outcome !== 'verified')
  ) {
    throw new Error(
      'contador-fulfillment: complete requires verified readback for every stage',
    );
  }
}

async function bindAliases(
  client: ContadorFulfillmentStoreClient,
  caseId: string,
  stripeAccount: ContadorStripeAccount,
  aliases: ContadorProviderAlias[],
): Promise<void> {
  const unique = new Map(
    aliases.map((alias) => [`${alias.kind}:${alias.id}`, alias]),
  );
  for (const alias of unique.values()) {
    const existing = await client.query<{ case_id: string }>(
      `SELECT case_id::text
         FROM business_v2.contador_payment_fulfillment_aliases
        WHERE stripe_account = $1 AND alias_kind = $2 AND alias_id = $3`,
      [stripeAccount, alias.kind, alias.id],
    );
    if (existing.rows[0] && existing.rows[0].case_id !== caseId) {
      throw new Error(
        'contador-fulfillment: provider alias belongs to another case',
      );
    }
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO business_v2.contador_payment_fulfillment_aliases
           (case_id, stripe_account, alias_kind, alias_id)
         VALUES ($1, $2, $3, $4)`,
        [caseId, stripeAccount, alias.kind, alias.id],
      );
    }
  }
}

async function insertReceipt(
  client: ContadorFulfillmentStoreClient,
  input: {
    caseId: string;
    caseVersion: number;
    stage: ContadorFulfillmentStage;
    outcome: ContadorReceiptOutcome;
    resultCode: string;
    evidenceSha256: string;
    sourceEventId: string;
    occurredAt: string;
  },
): Promise<void> {
  if (!SHA256_RE.test(input.evidenceSha256)) {
    throw new Error('contador-fulfillment: invalid evidence hash');
  }
  const suffix = sha([
    input.caseId,
    input.caseVersion,
    input.stage,
    input.sourceEventId,
    input.evidenceSha256,
  ]).slice(0, 24);
  const receiptKey = `contador:${input.caseId}:v${input.caseVersion}:${input.stage}:${suffix}`;
  await client.query(
    `INSERT INTO business_v2.contador_payment_fulfillment_receipts
       (receipt_key, case_id, case_version, stage, outcome, result_code,
        evidence_sha256, source_event_id, actor, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
    [
      receiptKey,
      input.caseId,
      input.caseVersion,
      input.stage,
      input.outcome,
      input.resultCode,
      input.evidenceSha256,
      input.sourceEventId,
      ACTOR,
      input.occurredAt,
    ],
  );
}

export async function beginContadorFulfillmentWithClient(
  client: ContadorFulfillmentStoreClient,
  input: BeginContadorFulfillmentInput,
): Promise<BeginContadorFulfillmentResult> {
  assertBegin(input);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${input.stripeAccount}:${input.paymentIntentId}`,
  ]);
  const prior = await client.query<CaseRow>(
    `SELECT ${CASE_COLUMNS}
       FROM business_v2.contador_payment_fulfillment_cases
      WHERE stripe_account = $1 AND payment_intent_id = $2
      FOR UPDATE`,
    [input.stripeAccount, input.paymentIntentId],
  );
  const evidenceSha256 = sha([
    input.stripeAccount,
    input.paymentIntentId,
    input.sourceObjectId,
    input.sourceEventId,
    input.eventType,
    input.observedAt,
  ]);

  let row: CaseRow;
  let duplicateComplete = false;
  let inFlight = false;
  if (!prior.rows[0]) {
    const inserted = await client.query<CaseRow>(
      `INSERT INTO business_v2.contador_payment_fulfillment_cases
         (stripe_account, payment_intent_id, state, version, attempt_count,
          lease_token, lease_expires_at,
          last_event_type, last_source_object_id, last_source_event_id,
          last_evidence_sha256, first_observed_at, last_observed_at)
       VALUES ($1, $2, 'processing', 0, 1, $3,
               now() + interval '5 minutes', $4, $5, $6, $7,
               $8::timestamptz, $8::timestamptz)
       RETURNING ${CASE_COLUMNS}`,
      [
        input.stripeAccount,
        input.paymentIntentId,
        input.leaseToken,
        input.eventType,
        input.sourceObjectId,
        input.sourceEventId,
        evidenceSha256,
        input.observedAt,
      ],
    );
    row = inserted.rows[0];
  } else if (prior.rows[0].state === 'complete') {
    row = prior.rows[0];
    duplicateComplete = true;
  } else if (
    prior.rows[0].state === 'processing' &&
    prior.rows[0].lease_active
  ) {
    row = prior.rows[0];
    inFlight = true;
  } else {
    const updated = await client.query<CaseRow>(
      `UPDATE business_v2.contador_payment_fulfillment_cases
          SET state = 'processing', version = version + 1,
              attempt_count = attempt_count + 1, lease_token = $2,
              lease_expires_at = now() + interval '5 minutes',
              last_event_type = $3, last_source_object_id = $4,
              last_source_event_id = $5,
              last_error_code = NULL, last_evidence_sha256 = $6,
              review_deadline = NULL, resolved_at = NULL,
              last_observed_at = GREATEST(last_observed_at, $7::timestamptz),
              updated_at = now()
        WHERE id = $1
        RETURNING ${CASE_COLUMNS}`,
      [
        prior.rows[0].id,
        input.leaseToken,
        input.eventType,
        input.sourceObjectId,
        input.sourceEventId,
        evidenceSha256,
        input.observedAt,
      ],
    );
    row = updated.rows[0];
  }

  await bindAliases(client, row.id, input.stripeAccount, input.aliases);
  if (!duplicateComplete && !inFlight) {
    await insertReceipt(client, {
      caseId: row.id,
      caseVersion: row.version,
      stage: 'admission',
      outcome: 'verified',
      resultCode: prior.rows[0] ? 'retry_admitted' : 'source_admitted',
      evidenceSha256,
      sourceEventId: input.sourceEventId,
      occurredAt: input.observedAt,
    });
  }
  return {
    item: toItem(row),
    duplicateComplete,
    inFlight,
    leaseToken: duplicateComplete || inFlight ? null : input.leaseToken,
  };
}

export async function finalizeContadorFulfillmentWithClient(
  client: ContadorFulfillmentStoreClient,
  input: FinalizeContadorFulfillmentInput,
): Promise<DurableContadorFulfillmentCase> {
  assertFinalize(input);
  const locked = await client.query<CaseRow>(
    `SELECT ${CASE_COLUMNS}
       FROM business_v2.contador_payment_fulfillment_cases
      WHERE id = $1
      FOR UPDATE`,
    [input.caseId],
  );
  const current = locked.rows[0];
  if (!current) throw new Error('contador-fulfillment: case not found');
  if (
    current.version !== input.expectedVersion ||
    current.state !== 'processing' ||
    current.lease_token !== input.leaseToken
  ) {
    throw new Error(
      'contador-fulfillment: stale case version, state, or lease',
    );
  }
  assertReceiptCompleteness(current, input);
  await bindAliases(client, current.id, current.stripe_account, input.aliases);

  for (const receipt of input.receipts) {
    await insertReceipt(client, {
      caseId: current.id,
      caseVersion: current.version,
      stage: receipt.stage,
      outcome: receipt.outcome,
      resultCode: receipt.resultCode,
      evidenceSha256: sha([
        current.stripe_account,
        current.payment_intent_id,
        current.version,
        receipt.stage,
        receipt.outcome,
        receipt.resultCode,
      ]),
      sourceEventId: input.sourceEventId,
      occurredAt: input.occurredAt,
    });
  }

  const finalEvidence = sha([
    current.stripe_account,
    current.payment_intent_id,
    current.version,
    input.state,
    input.errorCode,
    input.receipts,
  ]);
  const updated = await client.query<CaseRow>(
    `UPDATE business_v2.contador_payment_fulfillment_cases
        SET state = $2, last_error_code = $3,
            last_evidence_sha256 = $4,
            lease_token = NULL, lease_expires_at = NULL,
            review_deadline = CASE WHEN $2 = 'complete' THEN NULL
                                   ELSE now() + interval '1 day' END,
            resolved_at = CASE WHEN $2 = 'complete' THEN now() ELSE NULL END,
            last_observed_at = GREATEST(last_observed_at, $5::timestamptz),
            updated_at = now()
      WHERE id = $1 AND version = $6 AND state = 'processing'
        AND lease_token = $7
      RETURNING ${CASE_COLUMNS}`,
    [
      current.id,
      input.state,
      input.errorCode,
      finalEvidence,
      input.occurredAt,
      input.expectedVersion,
      input.leaseToken,
    ],
  );
  if (!updated.rows[0]) {
    throw new Error('contador-fulfillment: final transition lost its version');
  }
  await insertReceipt(client, {
    caseId: current.id,
    caseVersion: current.version,
    stage: 'final',
    outcome: input.state === 'complete' ? 'verified' : 'exception',
    resultCode:
      input.state === 'complete'
        ? 'source_readback_complete'
        : input.errorCode!,
    evidenceSha256: finalEvidence,
    sourceEventId: input.sourceEventId,
    occurredAt: input.occurredAt,
  });
  return toItem(updated.rows[0]);
}

export async function beginContadorFulfillment(
  input: BeginContadorFulfillmentInput,
): Promise<BeginContadorFulfillmentResult> {
  return withAgentContext(ACTOR, (client) =>
    beginContadorFulfillmentWithClient(client, input),
  );
}

export async function finalizeContadorFulfillment(
  input: FinalizeContadorFulfillmentInput,
): Promise<DurableContadorFulfillmentCase> {
  return withAgentContext(ACTOR, (client) =>
    finalizeContadorFulfillmentWithClient(client, input),
  );
}
