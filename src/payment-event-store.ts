import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  admitAdyenWebhook,
  type AdyenWebhookConfig,
  type AdyenTestWebhookConfig,
} from './adyen-webhook.js';
import {
  ADYEN_TEST_REFERENCE_PREFIX,
  parseAdyenPaymentOperationReference,
} from './adyen-payment-identifiers.js';
import { ADYEN_LIVE_REFERENCE_PREFIX } from './adyen-environment.js';
import {
  paymentScopeFingerprint,
  paymentMethodCapabilitiesForAttempt,
  PaymentDomainError,
  projectPaymentEvidence,
  validateAttempt,
  type PaymentAttempt,
  type PaymentFact,
  type PaymentScope,
} from './payment-domain.js';
import {
  projectCheckoutPaymentEvidence,
  type CheckoutPaymentEvidence,
} from './payment-checkout-evidence.js';
import { paymentPayloadFingerprint } from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';

type EventResult = {
  result: 'recorded' | 'duplicate' | 'needs_review';
  attemptId: string | null;
};
type ExceptionReason =
  | 'unknown_attempt'
  | 'scope_conflict'
  | 'delivery_payload_conflict'
  | 'provider_reference_conflict'
  | 'amount_or_fact_conflict'
  | 'evidence_limit'
  | 'financial_evidence_conflict';
const EVENT_KINDS = {
  PENDING: 'pending',
  AUTHORISATION: 'authorization',
  CAPTURE: 'capture',
  CAPTURE_FAILED: 'capture_failed',
  CANCELLATION: 'cancellation',
  EXPIRE: 'expire',
  REFUND: 'refund',
  REFUND_FAILED: 'refund_failed',
  REFUNDED_REVERSED: 'refund_reversed',
  CHARGEBACK: 'chargeback',
  CHARGEBACK_REVERSED: 'chargeback_reversed',
} as const;
const PAYMENT_EVENT_CODES = new Set(Object.keys(EVENT_KINDS));

/** Environment-scoped HMAC ingress. No browser callback, plain-fact ingress or fulfillment. */
export class PaymentEventStore {
  private readonly scope: PaymentScope;
  private readonly scopeHash: string;
  #config: AdyenWebhookConfig;
  constructor(
    private readonly transaction: PaymentTransaction,
    scope: PaymentScope,
    config: AdyenTestWebhookConfig | AdyenWebhookConfig,
    private readonly methodEvidence:
      | 'session_result_only'
      | 'card_scope_webhook' = 'session_result_only',
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    const explicitEnvironment =
      'environment' in config ? config.environment : 'test';
    const expectedReferencePrefix =
      explicitEnvironment === 'test'
        ? ADYEN_TEST_REFERENCE_PREFIX
        : ADYEN_LIVE_REFERENCE_PREFIX;
    if (
      scope.provider !== 'adyen' ||
      scope.environment !== explicitEnvironment ||
      scope.endpointRegion !== 'eu' ||
      scope.merchant !== config.merchantAccount ||
      scope.store !== config.storeReference ||
      config.referencePrefix !== expectedReferencePrefix ||
      !['session_result_only', 'card_scope_webhook'].includes(methodEvidence) ||
      !config.allowedEventCodes.includes('AUTHORISATION') ||
      config.allowedEventCodes.some((code) => !PAYMENT_EVENT_CODES.has(code))
    ) {
      throw new PaymentDomainError('invalid_event_store_scope');
    }
    this.scope = Object.freeze({ ...scope });
    this.#config = {
      ...config,
      environment: explicitEnvironment,
      hmacKeys: [...config.hmacKeys],
      allowedEventCodes: [...config.allowedEventCodes],
    };
  }

  async recordWebhook(payload: unknown): Promise<EventResult[]> {
    // The parser verifies EVERY signature and signed merchant/reference before
    // ANY item is persisted. Reported store is unsigned defense-in-depth only.
    const admitted = admitAdyenWebhook(payload, this.#config);
    const results: EventResult[] = [];
    for (const item of admitted) {
      const entity = item.relatedEntity;
      const operationReference = String(entity.psp_reference);
      const eventCode = String(entity.event_code) as keyof typeof EVENT_KINDS;
      const kind = EVENT_KINDS[eventCode];
      let attemptId: string | null = null;
      let sessionSequence = 1;
      try {
        const correlation = parseAdyenPaymentOperationReference(
          String(entity.merchant_reference),
          {
            referencePrefix: this.#config.referencePrefix,
          },
        );
        attemptId = correlation.attemptId;
        sessionSequence = correlation.sessionSequence;
      } catch {
        results.push(
          await this.recordOwnedIntakeException(
            item.eventId,
            String(entity.event_code),
            'malformed_correlation',
            null,
          ),
        );
        continue;
      }
      if (!kind) {
        results.push(
          await this.recordOwnedIntakeException(
            item.eventId,
            String(entity.event_code),
            'unsupported_event',
            attemptId,
          ),
        );
        continue;
      }
      const child = !['pending', 'authorization'].includes(kind);
      const reference = child
        ? String(entity.original_reference ?? '')
        : operationReference;
      if (
        !kind ||
        !/^[A-Za-z0-9_:.\/-]{1,200}$/.test(reference) ||
        !/^[A-Za-z0-9_:.\/-]{1,200}$/.test(operationReference)
      ) {
        results.push(
          await this.recordOwnedIntakeException(
            item.eventId,
            String(entity.event_code),
            'malformed_correlation',
            attemptId,
          ),
        );
        continue;
      }
      const amount = entity.amount as { value: number; currency: string };
      if (attemptId === null)
        throw new PaymentDomainError('invalid_payment_reference');
      const fact = {
        deliveryId: item.eventId,
        scope: this.scope,
        attemptId,
        paymentReference: reference,
        operationReference,
        kind,
        success: entity.success === true,
        amount: amount.value,
        currency: amount.currency,
      };
      results.push(await this.recordFact(fact, sessionSequence));
    }
    return results;
  }

  private async recordOwnedIntakeException(
    eventId: string,
    eventCode: string,
    reason: 'unsupported_event' | 'malformed_correlation' | 'financial_return',
    attemptHint: string | null,
  ): Promise<EventResult> {
    return this.transaction(async (client) => {
      const eventHash = paymentPayloadFingerprint(eventId);
      await client.query(
        `INSERT INTO business_v2.payment_owned_event_exceptions
        (exception_sha256,scope_sha256,event_id_sha256,attempt_hint,event_code,reason)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(exception_sha256) DO NOTHING`,
        [
          paymentPayloadFingerprint(
            JSON.stringify([this.scopeHash, eventHash, eventCode, reason]),
          ),
          this.scopeHash,
          eventHash,
          attemptHint,
          eventCode,
          reason,
        ],
      );
      return { result: 'needs_review', attemptId: attemptHint };
    });
  }

  private async refresh(
    client: PoolClient,
    attemptId: string,
    triggeringFact?: PaymentFact,
  ): Promise<CheckoutPaymentEvidence | null> {
    const row = await client.query(
      'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
      [attemptId],
    );
    if (!row.rowCount) return null;
    const attempt = validateAttempt(row.rows[0].contract);
    if (paymentScopeFingerprint(attempt.scope) !== this.scopeHash)
      throw new PaymentDomainError('event_scope_mismatch');
    const events = await client.query<{ fact: PaymentFact }>(
      'SELECT fact FROM business_v2.payment_events WHERE attempt_id=$1 AND scope_sha256=$2 LIMIT 101',
      [attemptId, this.scopeHash],
    );
    let projection: CheckoutPaymentEvidence;
    if (events.rows.length > 100)
      projection = {
        state: 'needs_review',
        payments: [],
        exceptions: ['evidence_limit'],
        settlement: 'unproven',
        fulfillment: 'not_evaluated',
      };
    else
      projection = projectCheckoutPaymentEvidence({
        attempt,
        facts: events.rows.map((row) => row.fact),
      });
    if (triggeringFact && projection.state === 'needs_review') {
      await client.query(
        `INSERT INTO business_v2.payment_event_exceptions
        (exception_sha256,scope_sha256,event_id_sha256,candidate_sha256,attempt_hint,attempt_id,payment_reference,reason)
        VALUES($1,$2,$3,$4,$5,$5,$6,'financial_evidence_conflict') ON CONFLICT(exception_sha256) DO NOTHING`,
        [
          paymentPayloadFingerprint(
            JSON.stringify([
              'financial',
              this.scopeHash,
              attemptId,
              projection,
            ]),
          ),
          this.scopeHash,
          paymentPayloadFingerprint(triggeringFact.deliveryId),
          paymentPayloadFingerprint(JSON.stringify(triggeringFact)),
          attemptId,
          triggeringFact.paymentReference,
        ],
      );
    }
    const exceptions = await client.query<{ reason: string }>(
      `SELECT DISTINCT reason FROM business_v2.payment_event_exceptions
       WHERE scope_sha256=$2 AND (attempt_id=$1 OR related_attempt_id=$1)
       UNION SELECT DISTINCT reason FROM business_v2.payment_session_retry_exceptions
       WHERE attempt_id=$1`,
      [attemptId, this.scopeHash],
    );
    if (exceptions.rowCount) {
      projection.state = 'needs_review';
      projection.exceptions = [
        ...new Set([
          ...projection.exceptions,
          ...exceptions.rows.map((row) => row.reason),
        ]),
      ].sort();
    }
    await client.query(
      `INSERT INTO business_v2.payment_checkout_evidence(attempt_id,projection,version)
      VALUES($1,$2::jsonb,1) ON CONFLICT(attempt_id) DO UPDATE
      SET projection=EXCLUDED.projection,version=payment_checkout_evidence.version+1,updated_at=clock_timestamp()`,
      [attemptId, JSON.stringify(projection)],
    );
    return projection;
  }

  private async exception(
    client: PoolClient,
    fact: PaymentFact,
    reason: ExceptionReason,
    attemptId: string | null,
    relatedId: string | null = null,
  ): Promise<EventResult> {
    const candidateHash = paymentPayloadFingerprint(JSON.stringify(fact));
    const inserted = await client.query(
      `INSERT INTO business_v2.payment_event_exceptions
      (exception_sha256,scope_sha256,event_id_sha256,candidate_sha256,attempt_hint,attempt_id,related_attempt_id,payment_reference,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(exception_sha256) DO NOTHING`,
      [
        paymentPayloadFingerprint(
          JSON.stringify([
            this.scopeHash,
            fact.deliveryId,
            candidateHash,
            reason,
          ]),
        ),
        this.scopeHash,
        paymentPayloadFingerprint(fact.deliveryId),
        candidateHash,
        fact.attemptId,
        attemptId,
        relatedId,
        fact.paymentReference,
        reason,
      ],
    );
    if (inserted.rowCount)
      for (const id of new Set(
        [attemptId, relatedId].filter((id): id is string => id !== null),
      ))
        await this.refresh(client, id);
    return { result: 'needs_review', attemptId };
  }

  private async recordFact(
    fact: PaymentFact,
    sessionSequence: number,
  ): Promise<EventResult> {
    return this.transaction(async (client) => {
      // Serialize the provider reference, then lock all involved attempts in UUID
      // order; a cross-checkout reference conflict cannot deadlock two checkouts.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`payment-provider:${this.scopeHash}:${fact.paymentReference}`],
      );
      const binding = await client.query<{ attempt_id: string }>(
        'SELECT attempt_id FROM business_v2.payment_provider_references WHERE scope_sha256=$1 AND payment_reference=$2',
        [this.scopeHash, fact.paymentReference],
      );
      const priorOwner = binding.rows[0]?.attempt_id ?? null;
      const ids = [
        ...new Set(
          [fact.attemptId.toLowerCase(), priorOwner].filter(
            (id): id is string => id !== null,
          ),
        ),
      ].sort();
      const locked = await client.query<{
        attempt_id: string;
        contract: unknown;
      }>(
        'SELECT attempt_id,contract FROM business_v2.payment_attempts WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id FOR UPDATE',
        [ids],
      );
      const attemptRow = locked.rows.find(
        (row) => row.attempt_id === fact.attemptId.toLowerCase(),
      );
      const relatedRow = locked.rows.find(
        (row) => row.attempt_id === priorOwner,
      );
      const scopedPriorOwner =
        relatedRow &&
        paymentScopeFingerprint(validateAttempt(relatedRow.contract).scope) ===
          this.scopeHash
          ? priorOwner
          : null;
      if (!attemptRow)
        return this.exception(
          client,
          fact,
          'unknown_attempt',
          null,
          scopedPriorOwner,
        );
      const attempt = validateAttempt(attemptRow.contract);
      if (paymentScopeFingerprint(attempt.scope) !== this.scopeHash)
        return this.exception(
          client,
          fact,
          'scope_conflict',
          null,
          scopedPriorOwner,
        );
      if (priorOwner && priorOwner !== attemptRow.attempt_id)
        return this.exception(
          client,
          fact,
          'provider_reference_conflict',
          attemptRow.attempt_id,
          scopedPriorOwner,
        );
      const paymentOperation = await client.query<{ operation_id: string }>(
        `SELECT operation_id FROM business_v2.payment_operations
         WHERE attempt_id=$1 AND session_sequence=$2 FOR UPDATE`,
        [attemptRow.attempt_id, sessionSequence],
      );
      if (paymentOperation.rowCount !== 1)
        return this.exception(
          client,
          fact,
          'amount_or_fact_conflict',
          attemptRow.attempt_id,
        );
      const paymentOperationId = paymentOperation.rows[0].operation_id;
      const terminalPredecessor =
        fact.kind === 'authorization' && fact.success
          ? await client.query(
              `SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts
               WHERE payment_operation_id=$1`,
              [paymentOperationId],
            )
          : null;
      const latePositive = Boolean(terminalPredecessor?.rowCount);
      if (!latePositive && fact.kind === 'authorization' && fact.success) {
        const methodBinding = await client.query<{
          attempt_id: string;
          payment_reference: string;
          method: string;
        }>(
          `SELECT attempt_id,payment_reference,method FROM business_v2.payment_method_bindings
          WHERE attempt_id=$1 OR (scope_sha256=$2 AND payment_reference=$3) FOR UPDATE`,
          [attemptRow.attempt_id, this.scopeHash, fact.paymentReference],
        );
        const conflict = methodBinding.rows.find(
          (row) =>
            row.attempt_id !== attemptRow.attempt_id ||
            row.payment_reference !== fact.paymentReference ||
            (this.methodEvidence === 'card_scope_webhook' &&
              row.method !== 'card'),
        );
        if (conflict)
          return this.exception(
            client,
            fact,
            'provider_reference_conflict',
            attemptRow.attempt_id,
            conflict.attempt_id,
          );
      }
      const prior = await client.query<{ payload_sha256: string }>(
        'SELECT payload_sha256 FROM business_v2.payment_events WHERE scope_sha256=$1 AND event_id=$2',
        [this.scopeHash, fact.deliveryId],
      );
      const fingerprint = paymentPayloadFingerprint(JSON.stringify(fact));
      if (prior.rowCount) {
        if (prior.rows[0].payload_sha256 !== fingerprint)
          return this.exception(
            client,
            fact,
            'delivery_payload_conflict',
            attemptRow.attempt_id,
          );
        return { result: 'duplicate', attemptId: attemptRow.attempt_id };
      }
      try {
        projectPaymentEvidence({
          attempt,
          paymentReference: fact.paymentReference,
          facts: [fact],
        });
      } catch (error) {
        if (!(error instanceof PaymentDomainError)) throw error;
        return this.exception(
          client,
          fact,
          'amount_or_fact_conflict',
          attemptRow.attempt_id,
        );
      }
      if (
        Number(
          (
            await client.query(
              'SELECT count(*) FROM business_v2.payment_events WHERE attempt_id=$1',
              [attemptRow.attempt_id],
            )
          ).rows[0].count,
        ) >= 100
      ) {
        return this.exception(
          client,
          fact,
          'evidence_limit',
          attemptRow.attempt_id,
        );
      }
      if (!priorOwner)
        await client.query(
          `INSERT INTO business_v2.payment_provider_references
           (scope_sha256,payment_reference,attempt_id,payment_operation_id,session_sequence)
           VALUES($1,$2,$3,$4,$5)`,
          [
            this.scopeHash,
            fact.paymentReference,
            attemptRow.attempt_id,
            paymentOperationId,
            sessionSequence,
          ],
        );
      if (!['pending', 'authorization'].includes(fact.kind)) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`payment-operation:${this.scopeHash}:${fact.operationReference}`],
        );
        const parent = await client.query<{
          payment_reference: string;
          attempt_id: string;
        }>(
          `SELECT payment_reference,attempt_id FROM business_v2.payment_event_operation_parents
          WHERE scope_sha256=$1 AND operation_reference=$2`,
          [this.scopeHash, fact.operationReference],
        );
        if (parent.rowCount) {
          if (
            parent.rows[0].payment_reference !== fact.paymentReference ||
            parent.rows[0].attempt_id !== attemptRow.attempt_id
          )
            return this.exception(
              client,
              fact,
              'provider_reference_conflict',
              attemptRow.attempt_id,
              parent.rows[0].attempt_id,
            );
        } else
          await client.query(
            `INSERT INTO business_v2.payment_event_operation_parents
            (scope_sha256,operation_reference,payment_reference,attempt_id)
            VALUES($1,$2,$3,$4)`,
            [
              this.scopeHash,
              fact.operationReference,
              fact.paymentReference,
              attemptRow.attempt_id,
            ],
          );
        const operation = await client.query(
          `SELECT 1 FROM business_v2.payment_event_operations
          WHERE scope_sha256=$1 AND operation_reference=$2 AND kind=$3`,
          [this.scopeHash, fact.operationReference, fact.kind],
        );
        if (!operation.rowCount)
          await client.query(
            `INSERT INTO business_v2.payment_event_operations
            (scope_sha256,operation_reference,payment_reference,attempt_id,kind)
            VALUES($1,$2,$3,$4,$5)`,
            [
              this.scopeHash,
              fact.operationReference,
              fact.paymentReference,
              attemptRow.attempt_id,
              fact.kind,
            ],
          );
      }
      await client.query(
        `INSERT INTO business_v2.payment_events
         (scope_sha256,event_id,payload_sha256,attempt_id,payment_reference,fact,
          payment_operation_id,session_sequence)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          this.scopeHash,
          fact.deliveryId,
          fingerprint,
          attemptRow.attempt_id,
          fact.paymentReference,
          JSON.stringify(fact),
          paymentOperationId,
          sessionSequence,
        ],
      );
      if (latePositive) {
        await client.query(
          `INSERT INTO business_v2.payment_session_retry_exceptions
           (exception_sha256,attempt_id,payment_operation_id,session_sequence,
            event_id_sha256,reason)
           VALUES($1,$2,$3,$4,$5,'late_positive_after_terminal')
           ON CONFLICT(exception_sha256) DO NOTHING`,
          [
            paymentPayloadFingerprint(
              JSON.stringify([
                this.scopeHash,
                fact.deliveryId,
                paymentOperationId,
                'late_positive_after_terminal',
              ]),
            ),
            attemptRow.attempt_id,
            paymentOperationId,
            sessionSequence,
            paymentPayloadFingerprint(fact.deliveryId),
          ],
        );
      }
      if (
        !latePositive &&
        this.methodEvidence === 'card_scope_webhook' &&
        fact.kind === 'authorization' &&
        fact.success
      ) {
        const capabilities = paymentMethodCapabilitiesForAttempt(attempt);
        if (capabilities.length === 1 && capabilities[0] === 'card') {
          const evidenceSha256 = paymentPayloadFingerprint(
            JSON.stringify({
              scopeSha256: this.scopeHash,
              attemptId: attempt.attemptId,
              paymentReference: fact.paymentReference,
              sourceEventId: fact.deliveryId,
              sourceKind: 'card_scope_webhook',
              method: 'card',
            }),
          );
          await client.query(
            `INSERT INTO business_v2.payment_method_bindings
             (scope_sha256,payment_reference,attempt_id,method,operation_id,
              evidence_sha256,source_kind,source_event_id)
             VALUES($1,$2,$3,'card',NULL,$4,'card_scope_webhook',$5)
             ON CONFLICT(attempt_id) DO NOTHING`,
            [
              this.scopeHash,
              fact.paymentReference,
              attempt.attemptId,
              evidenceSha256,
              fact.deliveryId,
            ],
          );
        }
      }
      if (fact.kind === 'chargeback' && fact.success) {
        const eventHash = paymentPayloadFingerprint(fact.deliveryId);
        await client.query(
          `INSERT INTO business_v2.payment_owned_event_exceptions
          (exception_sha256,scope_sha256,event_id_sha256,attempt_hint,event_code,reason)
          VALUES($1,$2,$3,$4,'CHARGEBACK','financial_return') ON CONFLICT(exception_sha256) DO NOTHING`,
          [
            paymentPayloadFingerprint(
              JSON.stringify([
                this.scopeHash,
                eventHash,
                'CHARGEBACK',
                'financial_return',
              ]),
            ),
            this.scopeHash,
            eventHash,
            attemptRow.attempt_id,
          ],
        );
      }
      const projection = await this.refresh(
        client,
        attemptRow.attempt_id,
        fact,
      );
      return {
        result:
          latePositive || projection?.state === 'needs_review'
            ? 'needs_review'
            : 'recorded',
        attemptId: attemptRow.attempt_id,
      };
    });
  }

  /** Internal evidence read only. A public handler must validate capability and minimize. */
  async readInternalEvidence(
    attemptId: string,
  ): Promise<CheckoutPaymentEvidence | null> {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    return this.transaction(async (client) => {
      const rows = await client.query<{
        contract: unknown;
        projection: CheckoutPaymentEvidence | null;
      }>(
        `SELECT a.contract,e.projection
        FROM business_v2.payment_attempts a LEFT JOIN business_v2.payment_checkout_evidence e ON e.attempt_id=a.attempt_id WHERE a.attempt_id=$1`,
        [attemptId],
      );
      if (
        !rows.rowCount ||
        paymentScopeFingerprint(
          validateAttempt(rows.rows[0].contract).scope,
        ) !== this.scopeHash
      )
        return null;
      return (
        await client.query(
          'SELECT 1 FROM business_v2.payment_session_retry_exceptions WHERE attempt_id=$1 LIMIT 1',
          [attemptId],
        )
      ).rowCount
        ? {
            ...(rows.rows[0].projection ??
              projectCheckoutPaymentEvidence({
                attempt: rows.rows[0].contract,
                facts: [],
              })),
            state: 'needs_review' as const,
            exceptions: ['payment_session_retry_exception'],
          }
        : (rows.rows[0].projection ??
            projectCheckoutPaymentEvidence({
              attempt: rows.rows[0].contract,
              facts: [],
            }));
    });
  }
}
