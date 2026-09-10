import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import {
  decidePaymentOperationRecovery,
  PaymentDomainError,
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
  | { decision: 'reuse_session'; response: string }
  | {
      decision: 'dispatch';
      operation: PaymentOperation;
      request: string;
      leaseToken: string;
      version: number;
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
        'SELECT * FROM business_v2.payment_operations WHERE attempt_id=$1',
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
}
