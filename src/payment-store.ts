import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import {
  decidePaymentOperationRecovery,
  PaymentDomainError,
  paymentMethodCapabilitiesForAttempt,
  preparePaymentOperation,
  recordPaymentOperationResult,
  validateAttempt,
  type PaymentAttempt,
  type PaymentOperation,
} from './payment-domain.js';
import {
  PaymentPayloadVault,
  paymentPayloadFingerprint,
} from './payment-payload-vault.js';
import {
  sessionIdSha256,
  type PaymentSessionReturnBinding,
} from './payment-session-return-binding.js';

/** Supply the host's withTransaction; tests supply isolated Postgres transactions. */
export type PaymentTransaction = <T>(
  work: (client: PoolClient) => Promise<T>,
) => Promise<T>;
interface OperationRow {
  operation_id: string;
  attempt_id: string;
  contract: PaymentOperation;
  request_sha256: string;
  encrypted_request: string;
  encrypted_response: string | null;
  state: PaymentOperation['state'];
  session_expires_at: string | null;
  version: number;
  lease_token: string | null;
  lease_until: string | null;
  session_sequence: number;
  predecessor_operation_id: string | null;
  retry_terminal_receipt_sha256: string | null;
}

function uuid(value: string): void {
  if (!z.uuid().safeParse(value).success)
    throw new PaymentDomainError('invalid_store_identity');
}
function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}
function operation(row: OperationRow): PaymentOperation {
  return {
    ...row.contract,
    state: row.state,
    sessionExpiresAt:
      row.session_expires_at === null ? null : Number(row.session_expires_at),
  };
}

export type PaymentDispatch =
  | { decision: 'busy' | 'reconcile' | 'stop' }
  | {
      decision: 'reuse_session';
      response: string;
      operationId: string;
      sessionSequence: number;
    }
  | {
      decision: 'dispatch';
      operation: PaymentOperation;
      request: string;
      leaseToken: string;
      version: number;
      sessionSequence: number;
    };

export type PaymentSessionRetryPreparation =
  | {
      disposition:
        | 'reconfirmation_required'
        | 'limit_reached'
        | 'retry_not_allowed';
    }
  | {
      disposition: 'prepared';
      attempt: PaymentAttempt;
      operationId: string;
      sessionSequence: number;
    };

export type PaymentSessionSubmitCheck =
  | { state: 'session_submit_allowed' }
  | {
      state: 'session_submit_blocked';
      reason:
        | 'stale_session'
        | 'needs_review'
        | 'not_payable'
        | 'expired'
        | 'unavailable';
    };

/**
 * Host-only durable acceptance. No network or provider call occurs inside a
 * transaction. No browser endpoint or production pool is created on import.
 */
export class PaymentStore {
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly vault: PaymentPayloadVault,
  ) {}

  private async now(client: PoolClient): Promise<number> {
    const result = await client.query<{ now: string }>(
      'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
    );
    return Number(result.rows[0].now);
  }

  /** Internal recovery only; public callers require a capability and caller policy. */
  async readAttempt(attemptId: string): Promise<PaymentAttempt | null> {
    uuid(attemptId);
    return this.transaction(async (client) => {
      const result = await client.query(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [attemptId],
      );
      return result.rowCount ? validateAttempt(result.rows[0].contract) : null;
    });
  }

  /** Internal reconciliation only; caller authentication/capability precedes it. */
  async readPersistedSession(
    attemptId: string,
    paymentOperationId?: string,
  ): Promise<{
    attempt: PaymentAttempt;
    session: string;
    paymentOperationId: string;
    sessionSequence: number;
  } | null> {
    uuid(attemptId);
    if (paymentOperationId !== undefined) uuid(paymentOperationId);
    return this.transaction(async (client) => {
      const result = await client.query<{
        contract: unknown;
        operation_id: string;
        encrypted_response: string;
        session_sequence: number;
      }>(
        `SELECT a.contract,o.operation_id,o.encrypted_response,o.session_sequence
        FROM business_v2.payment_attempts a JOIN business_v2.payment_operations o ON o.attempt_id=a.attempt_id
        WHERE a.attempt_id=$1 AND o.state='session_available'
          AND o.encrypted_response IS NOT NULL
          AND ($2::uuid IS NULL OR o.operation_id=$2)
          AND ($2::uuid IS NOT NULL OR (
            o.session_sequence=1
            AND NOT EXISTS (SELECT 1 FROM business_v2.payment_operations x
              WHERE x.attempt_id=a.attempt_id AND x.session_sequence>1)
            AND NOT EXISTS (SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts t
              WHERE t.attempt_id=a.attempt_id)
            AND NOT EXISTS (SELECT 1 FROM business_v2.payment_session_retry_exceptions e
              WHERE e.attempt_id=a.attempt_id)
          ))
        ORDER BY o.session_sequence DESC`,
        [attemptId, paymentOperationId ?? null],
      );
      if (!result.rowCount) return null;
      if (paymentOperationId === undefined && result.rowCount !== 1)
        throw new PaymentDomainError('session_operation_binding_required');
      const row = result.rows[0];
      return {
        attempt: validateAttempt(row.contract),
        session: this.vault.open(
          row.encrypted_response,
          `${row.operation_id}:response`,
        ),
        paymentOperationId: row.operation_id,
        sessionSequence: Number(row.session_sequence),
      };
    });
  }

  async acceptAttempt(input: unknown): Promise<PaymentAttempt> {
    const attempt = validateAttempt(input);
    const scopeHash = paymentPayloadFingerprint(JSON.stringify(attempt.scope));
    return this.transaction(async (client) => {
      // Serializes only this quote scope, including callers with different UUIDs.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`payment-quote:${scopeHash}:${attempt.quote.quoteId}`],
      );
      const existing = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 OR (scope_sha256=$2 AND quote_id=$3)',
        [attempt.attemptId, scopeHash, attempt.quote.quoteId],
      );
      if (existing.rows.length) {
        ensure(existing.rows.length === 1, 'attempt_identity_conflict');
        const prior = validateAttempt(existing.rows[0].contract);
        ensure(
          JSON.stringify(prior) === JSON.stringify(attempt),
          'attempt_identity_conflict',
        );
        return prior;
      }
      const now = await this.now(client);
      ensure(
        now >= attempt.createdAt && now < attempt.quote.expiresAt,
        'quote_not_current_at_acceptance',
      );
      await client.query(
        'INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,quote_id,contract) VALUES($1,$2,$3,$4::jsonb)',
        [
          attempt.attemptId,
          scopeHash,
          attempt.quote.quoteId,
          JSON.stringify(attempt),
        ],
      );
      return attempt;
    });
  }

  /** Exact bytes, key and quote are committed before acquireDispatch can return. */
  async prepareSession(input: {
    attemptId: string;
    operationId: string;
    idempotencyKey: string;
    request: string;
    retryWindowMs: number;
  }): Promise<PaymentOperation> {
    uuid(input.attemptId);
    uuid(input.operationId);
    ensure(
      Number.isSafeInteger(input.retryWindowMs) &&
        input.retryWindowMs > 0 &&
        input.retryWindowMs < 7 * 86400000,
      'invalid_retry_window',
    );
    ensure(
      typeof input.request === 'string' &&
        Buffer.byteLength(input.request) <= 65536,
      'invalid_payload_size',
    );
    const fingerprint = paymentPayloadFingerprint(input.request);
    return this.transaction(async (client) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
        [input.attemptId],
      );
      ensure(attempts.rows.length === 1, 'attempt_not_found');
      const attempt = validateAttempt(attempts.rows[0].contract);
      const existing = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_operations WHERE attempt_id=$1 AND session_sequence=1',
        [input.attemptId],
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        ensure(
          row.operation_id === input.operationId &&
            row.contract.idempotencyKey === input.idempotencyKey &&
            row.request_sha256 === fingerprint,
          'operation_prepare_conflict',
        );
        // Replays never extend deadlines or replace encrypted bytes.
        return operation(row);
      }
      const now = await this.now(client);
      const prepared = preparePaymentOperation({
        attempt,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint,
        now,
        // A fixed-expiry Session cannot be recreated usefully after quote expiry.
        // Clamp against the absolute deadline using DB time, not caller latency.
        retryUntil: Math.min(
          now + input.retryWindowMs,
          attempt.quote.expiresAt,
        ),
      });
      const sealed = this.vault.seal(
        input.request,
        `${input.operationId}:request`,
      );
      await client.query(
        `INSERT INTO business_v2.payment_operations
        (operation_id,attempt_id,idempotency_key,contract,request_sha256,encrypted_request,state)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,'dispatching')`,
        [
          input.operationId,
          input.attemptId,
          input.idempotencyKey,
          JSON.stringify(prepared),
          fingerprint,
          sealed,
        ],
      );
      await client.query(
        "INSERT INTO business_v2.payment_operation_receipts(operation_id,version,kind) VALUES($1,0,'prepared')",
        [input.operationId],
      );
      return prepared;
    });
  }

  async acquireDispatch(
    operationId: string,
    leaseMs = 30000,
    dispatchMode: 'allow' | 'reconcile_only' = 'allow',
  ): Promise<PaymentDispatch> {
    uuid(operationId);
    ensure(
      Number.isSafeInteger(leaseMs) && leaseMs >= 1 && leaseMs <= 60000,
      'invalid_lease_duration',
    );
    ensure(
      dispatchMode === 'allow' || dispatchMode === 'reconcile_only',
      'invalid_dispatch_mode',
    );
    return this.transaction(async (client) => {
      const result = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_operations WHERE operation_id=$1 FOR UPDATE',
        [operationId],
      );
      ensure(result.rows.length === 1, 'operation_not_found');
      const row = result.rows[0];
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [row.attempt_id],
      );
      const now = await this.now(client);
      const current = operation(row);
      const decision = decidePaymentOperationRecovery({
        attempt: attempts.rows[0].contract,
        operation: current,
        requestFingerprint: row.request_sha256,
        now,
      });
      if (decision === 'reuse_session') {
        ensure(row.encrypted_response !== null, 'session_response_missing');
        return {
          decision,
          response: this.vault.open(
            row.encrypted_response,
            `${operationId}:response`,
          ),
          operationId: row.operation_id,
          sessionSequence: row.session_sequence,
        };
      }
      if (decision === 'stop' || decision === 'reconcile') return { decision };
      if (dispatchMode === 'reconcile_only') return { decision: 'reconcile' };
      if (row.lease_until !== null && Number(row.lease_until) > now)
        return { decision: 'busy' };
      // Authentication of stored bytes happens before granting/committing a lease.
      const request = this.vault.open(
        row.encrypted_request,
        `${operationId}:request`,
      );
      ensure(
        paymentPayloadFingerprint(request) === row.request_sha256,
        'stored_request_conflict',
      );
      const leaseToken = randomUUID();
      const version = row.version + 1;
      const updated = await client.query(
        `UPDATE business_v2.payment_operations
        SET lease_token=$1,lease_until=$2,version=$3,state='unknown'
        WHERE operation_id=$4 AND version=$5`,
        [leaseToken, now + leaseMs, version, operationId, row.version],
      );
      ensure(updated.rowCount === 1, 'operation_version_conflict');
      await client.query(
        "INSERT INTO business_v2.payment_operation_receipts(operation_id,version,kind) VALUES($1,$2,'claimed')",
        [operationId, version],
      );
      return {
        decision: 'dispatch',
        operation: { ...current, state: 'unknown' },
        request,
        leaseToken,
        version,
        sessionSequence: row.session_sequence,
      };
    });
  }

  async finishDispatch(input: {
    operationId: string;
    leaseToken: string;
    version: number;
    result: 'unknown' | 'permanent_failure' | 'session_available';
    response?: string;
    sessionExpiresAt?: number;
  }): Promise<void> {
    uuid(input.operationId);
    uuid(input.leaseToken);
    ensure(
      Number.isSafeInteger(input.version) && input.version > 0,
      'invalid_operation_version',
    );
    return this.transaction(async (client) => {
      const result = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_operations WHERE operation_id=$1 FOR UPDATE',
        [input.operationId],
      );
      ensure(result.rows.length === 1, 'operation_not_found');
      const row = result.rows[0];
      const now = await this.now(client);
      ensure(
        row.lease_token === input.leaseToken &&
          row.version === input.version &&
          Number(row.lease_until) > now,
        'operation_lease_lost',
      );
      const next = recordPaymentOperationResult(
        operation(row),
        input.result,
        input.sessionExpiresAt ?? null,
      );
      let encrypted: string | null = null;
      if (input.result === 'session_available') {
        ensure(
          typeof input.response === 'string' && input.response.length > 0,
          'session_response_missing',
        );
        encrypted = this.vault.seal(
          input.response,
          `${input.operationId}:response`,
        );
      } else
        ensure(input.response === undefined, 'unexpected_operation_response');
      const version = row.version + 1;
      await client.query(
        `UPDATE business_v2.payment_operations SET state=$1,session_expires_at=$2,
        encrypted_response=$3,lease_token=NULL,lease_until=NULL,version=$4
        WHERE operation_id=$5 AND version=$6`,
        [
          next.state,
          next.sessionExpiresAt,
          encrypted,
          version,
          input.operationId,
          row.version,
        ],
      );
      await client.query(
        'INSERT INTO business_v2.payment_operation_receipts(operation_id,version,kind) VALUES($1,$2,$3)',
        [input.operationId, version, next.state],
      );
    });
  }

  async currentOperationId(attemptId: string): Promise<string> {
    uuid(attemptId);
    return this.transaction(async (client) => {
      const result = await client.query<{ operation_id: string }>(
        `SELECT operation_id FROM business_v2.payment_operations
         WHERE attempt_id=$1 ORDER BY session_sequence DESC LIMIT 1`,
        [attemptId],
      );
      ensure(result.rowCount === 1, 'operation_not_found');
      return result.rows[0].operation_id;
    });
  }

  async checkSessionSubmit(
    binding: PaymentSessionReturnBinding,
  ): Promise<PaymentSessionSubmitCheck> {
    uuid(binding.attemptId);
    uuid(binding.paymentOperationId);
    return this.transaction(async (client) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
        [binding.attemptId],
      );
      ensure(attempts.rowCount === 1, 'attempt_not_found');
      const attempt = validateAttempt(attempts.rows[0].contract);
      const operations = await client.query<OperationRow>(
        `SELECT * FROM business_v2.payment_operations WHERE attempt_id=$1
         ORDER BY session_sequence FOR UPDATE`,
        [binding.attemptId],
      );
      ensure(operations.rows.length >= 1, 'operation_not_found');
      const bound = operations.rows.find(
        (row) => row.operation_id === binding.paymentOperationId,
      );
      if (!bound || bound !== operations.rows[operations.rows.length - 1])
        return { state: 'session_submit_blocked', reason: 'stale_session' };
      if (
        Number(bound.session_sequence) !== binding.sessionSequence ||
        bound.state !== 'session_available' ||
        bound.encrypted_response === null ||
        bound.session_expires_at === null
      )
        return { state: 'session_submit_blocked', reason: 'unavailable' };
      let session: { id: string; expiresAt: string };
      try {
        const parsed = z
          .object({
            id: z.string().min(1).max(200),
            expiresAt: z.iso.datetime({ offset: true }),
          })
          .passthrough()
          .parse(
            JSON.parse(
              this.vault.open(
                bound.encrypted_response,
                `${bound.operation_id}:response`,
              ),
            ),
          );
        session = parsed;
      } catch {
        return { state: 'session_submit_blocked', reason: 'needs_review' };
      }
      if (
        sessionIdSha256(session.id) !== binding.sessionIdSha256 ||
        Date.parse(session.expiresAt) !== Number(bound.session_expires_at)
      )
        throw new PaymentDomainError('return_binding_conflict');
      const now = await this.now(client);
      if (
        now >= Number(bound.session_expires_at) ||
        now >= attempt.quote.expiresAt
      )
        return { state: 'session_submit_blocked', reason: 'expired' };
      const blockers = await client.query<{
        retry_exception: boolean;
        method_binding: boolean;
        enrollment: boolean;
        terminal_current: boolean;
        positive_result: boolean;
        uncertain_result: boolean;
        positive_event: boolean;
        pending_event: boolean;
        uncertain_projection: boolean;
      }>(
        `SELECT
          EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions
            WHERE attempt_id=$1) retry_exception,
          EXISTS(SELECT 1 FROM business_v2.payment_method_bindings
            WHERE attempt_id=$1) method_binding,
          EXISTS(SELECT 1 FROM business_v2.payment_enrollment_admissions
            WHERE attempt_id=$1) enrollment,
          EXISTS(SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts
            WHERE payment_operation_id=$2) terminal_current,
          EXISTS(SELECT 1 FROM business_v2.payment_session_result_operations
            WHERE payment_operation_id=$2 AND state='verified') positive_result,
          EXISTS(SELECT 1 FROM business_v2.payment_session_result_operations
            WHERE payment_operation_id=$2 AND state IN ('prepared','unknown','conflict')) uncertain_result,
          EXISTS(SELECT 1 FROM business_v2.payment_events
            WHERE attempt_id=$1 AND fact->>'kind'='authorization'
              AND fact->>'success'='true') positive_event,
          EXISTS(SELECT 1 FROM business_v2.payment_events
            WHERE attempt_id=$1 AND fact->>'kind'='pending') pending_event,
          EXISTS(SELECT 1 FROM business_v2.payment_checkout_evidence
            WHERE attempt_id=$1 AND projection->>'state' IN
              ('needs_review','payment_pending','payment_reversed','refund_pending')) uncertain_projection`,
        [binding.attemptId, binding.paymentOperationId],
      );
      const state = blockers.rows[0];
      if (!state)
        return { state: 'session_submit_blocked', reason: 'unavailable' };
      if (state.retry_exception)
        return { state: 'session_submit_blocked', reason: 'needs_review' };
      if (
        state.method_binding ||
        state.enrollment ||
        state.terminal_current ||
        state.positive_result ||
        state.positive_event
      )
        return { state: 'session_submit_blocked', reason: 'not_payable' };
      if (
        state.uncertain_result ||
        state.pending_event ||
        state.uncertain_projection
      )
        return { state: 'session_submit_blocked', reason: 'needs_review' };
      return { state: 'session_submit_allowed' };
    });
  }

  async prepareSuccessorSession(input: {
    attemptId: string;
    operationId: string;
    terminalReceipt: string;
    requestForSequence: (attempt: PaymentAttempt, sequence: number) => string;
    retryWindowMs: number;
  }): Promise<PaymentSessionRetryPreparation> {
    uuid(input.attemptId);
    uuid(input.operationId);
    ensure(
      /^terminal-nonpayment:v1:[a-f0-9]{64}$/.test(input.terminalReceipt) &&
        typeof input.requestForSequence === 'function' &&
        Number.isSafeInteger(input.retryWindowMs) &&
        input.retryWindowMs > 0 &&
        input.retryWindowMs < 7 * 86400000,
      'invalid_terminal_retry_request',
    );
    const receiptSha256 = input.terminalReceipt.slice(
      'terminal-nonpayment:v1:'.length,
    );
    return this.transaction(async (client) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
        [input.attemptId],
      );
      ensure(attempts.rowCount === 1, 'attempt_not_found');
      const attempt = validateAttempt(attempts.rows[0].contract);
      const capabilities = paymentMethodCapabilitiesForAttempt(attempt);
      if (capabilities.length !== 1 || capabilities[0] !== 'card')
        return { disposition: 'retry_not_allowed' };
      const operations = await client.query<OperationRow>(
        `SELECT * FROM business_v2.payment_operations WHERE attempt_id=$1
         ORDER BY session_sequence FOR UPDATE`,
        [input.attemptId],
      );
      ensure(operations.rows.length >= 1, 'operation_not_found');
      const latest = operations.rows[operations.rows.length - 1];
      const terminal = await client.query<{
        receipt_sha256: string;
        payment_operation_id: string;
        session_sequence: number;
      }>(
        `SELECT receipt_sha256,payment_operation_id,session_sequence
         FROM business_v2.payment_session_terminal_nonpayment_receipts
         WHERE receipt_sha256=$1 FOR UPDATE`,
        [receiptSha256],
      );
      if (terminal.rowCount !== 1) return { disposition: 'retry_not_allowed' };
      const existing = operations.rows.find(
        (row) => row.retry_terminal_receipt_sha256 === receiptSha256,
      );
      if (existing) {
        ensure(
          existing.predecessor_operation_id ===
            terminal.rows[0].payment_operation_id &&
            existing.session_sequence ===
              Number(terminal.rows[0].session_sequence) + 1,
          'operation_prepare_conflict',
        );
        return {
          disposition: 'prepared',
          attempt,
          operationId: existing.operation_id,
          sessionSequence: existing.session_sequence,
        };
      }
      const blockers = await client.query(
        `SELECT
          EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions
            WHERE attempt_id=$1) retry_exception,
          EXISTS(SELECT 1 FROM business_v2.payment_method_bindings
            WHERE attempt_id=$1) method_binding,
          EXISTS(SELECT 1 FROM business_v2.payment_enrollment_admissions
            WHERE attempt_id=$1) enrollment,
          -- Generic payment_failed is deliberately absent: it is neither
          -- retry authority nor a contradiction to exact terminal proof.
          EXISTS(SELECT 1 FROM business_v2.payment_checkout_evidence
            WHERE attempt_id=$1 AND projection->>'state' IN (
              'payment_pending','authorization_recorded','payment_reversed',
              'refund_pending','needs_review'
            )) contradictory_evidence`,
        [input.attemptId],
      );
      if (
        blockers.rows[0]?.retry_exception ||
        blockers.rows[0]?.method_binding ||
        blockers.rows[0]?.enrollment ||
        blockers.rows[0]?.contradictory_evidence
      )
        return { disposition: 'retry_not_allowed' };
      if (
        terminal.rows[0].payment_operation_id !== latest.operation_id ||
        Number(terminal.rows[0].session_sequence) !== latest.session_sequence
      )
        return { disposition: 'retry_not_allowed' };
      if (latest.session_sequence >= 3) return { disposition: 'limit_reached' };
      const now = await this.now(client);
      if (now >= attempt.quote.expiresAt)
        return { disposition: 'reconfirmation_required' };
      const sessionSequence = latest.session_sequence + 1;
      const request = input.requestForSequence(attempt, sessionSequence);
      ensure(
        typeof request === 'string' && Buffer.byteLength(request) <= 65536,
        'invalid_payload_size',
      );
      const fingerprint = paymentPayloadFingerprint(request);
      const prepared = preparePaymentOperation({
        attempt,
        operationId: input.operationId,
        idempotencyKey: input.operationId,
        requestFingerprint: fingerprint,
        now,
        retryUntil: Math.min(
          now + input.retryWindowMs,
          attempt.quote.expiresAt,
        ),
      });
      await client.query(
        `INSERT INTO business_v2.payment_operations
         (operation_id,attempt_id,idempotency_key,contract,request_sha256,
          encrypted_request,state,session_sequence,predecessor_operation_id,
          retry_terminal_receipt_sha256)
         VALUES($1,$2,$9,$3::jsonb,$4,$5,'dispatching',$6,$7,$8)`,
        [
          input.operationId,
          input.attemptId,
          JSON.stringify(prepared),
          fingerprint,
          this.vault.seal(request, `${input.operationId}:request`),
          sessionSequence,
          latest.operation_id,
          receiptSha256,
          input.operationId,
        ],
      );
      await client.query(
        "INSERT INTO business_v2.payment_operation_receipts(operation_id,version,kind) VALUES($1,0,'prepared')",
        [input.operationId],
      );
      return {
        disposition: 'prepared',
        attempt,
        operationId: input.operationId,
        sessionSequence,
      };
    });
  }
}
