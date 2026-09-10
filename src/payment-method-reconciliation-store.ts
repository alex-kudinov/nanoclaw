import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { z } from 'zod';

import type {
  AdyenTestSessionResultAdapter,
  VerifiedAdyenTestSessionPayment,
} from './adyen-session-result-adapter.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentAttempt,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';
import {
  PaymentPayloadVault,
  paymentPayloadFingerprint,
} from './payment-payload-vault.js';
import type { PaymentStore, PaymentTransaction } from './payment-store.js';

const storedSessionSchema = z
  .object({
    id: z.string().min(1).max(200),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .passthrough();
type SessionReader = Pick<PaymentStore, 'readPersistedSession'>;
export interface PaymentMethodBinding {
  attemptId: string;
  paymentReference: string;
  paymentMethod: PaymentMethodCapability;
  evidenceSha256: string;
}
export type PaymentMethodReconciliation =
  | { state: 'pending' | 'needs_review' }
  | { state: 'verified'; binding: PaymentMethodBinding };
export interface PaymentMethodReconciliationRequest {
  operationId: string;
  attemptId: string;
  sessionResult: string;
}

interface OperationRow {
  operation_id: string;
  attempt_id: string;
  session_id_sha256: string;
  result_sha256: string;
  encrypted_result: string;
  retry_until: string;
  state: 'prepared' | 'unknown' | 'verified' | 'conflict';
  version: number;
  lease_token: string | null;
  lease_until: string | null;
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

/** Durable TEST lookup/retry. No provider call occurs inside a transaction. */
export class PaymentMethodReconciliationStore {
  private readonly scopeHash: string;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly vault: PaymentPayloadVault,
    private readonly sessions: SessionReader,
    private readonly adapter: Pick<AdyenTestSessionResultAdapter, 'verify'>,
    scope: PaymentScope,
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    if (scope.provider !== 'adyen' || scope.environment !== 'test')
      throw new PaymentDomainError('invalid_reconciliation_scope');
  }

  private async now(client: PoolClient): Promise<number> {
    return Number(
      (
        await client.query(
          'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
        )
      ).rows[0].now,
    );
  }

  async verify(
    input: PaymentMethodReconciliationRequest,
  ): Promise<PaymentMethodReconciliation> {
    try {
      return await this.verifyInternal(input);
    } catch (error) {
      if (error instanceof PaymentDomainError) throw error;
      throw new PaymentDomainError('payment_reconciliation_unavailable');
    }
  }

  private async verifyInternal(
    input: PaymentMethodReconciliationRequest,
  ): Promise<PaymentMethodReconciliation> {
    if (
      !z.uuid().safeParse(input.operationId).success ||
      !z.uuid().safeParse(input.attemptId).success ||
      typeof input.sessionResult !== 'string' ||
      input.sessionResult.length < 1 ||
      Buffer.byteLength(input.sessionResult) > 65536 ||
      /[\r\n]/.test(input.sessionResult)
    )
      throw new PaymentDomainError('invalid_session_result_request');
    const persisted = await this.sessions.readPersistedSession(input.attemptId);
    if (!persisted)
      throw new PaymentDomainError('persisted_session_unavailable');
    ensure(
      paymentScopeFingerprint(persisted.attempt.scope) === this.scopeHash,
      'reconciliation_scope_mismatch',
    );
    const session = storedSessionSchema.safeParse(
      JSON.parse(persisted.session),
    );
    ensure(session.success, 'persisted_session_unavailable');
    const sessionId = session.data.id;
    const retryUntil = Date.parse(session.data.expiresAt);
    ensure(
      Number.isSafeInteger(retryUntil) && retryUntil >= 0,
      'persisted_session_unavailable',
    );
    const sessionHash = paymentPayloadFingerprint(sessionId);
    const resultHash = paymentPayloadFingerprint(input.sessionResult);
    await this.prepare({
      ...input,
      sessionId,
      sessionHash,
      resultHash,
      retryUntil,
    });
    const acquired = await this.acquire(input.operationId);
    if (acquired.state === 'verified')
      return { state: 'verified', binding: acquired.binding };
    if (acquired.state === 'needs_review') return acquired;
    if (acquired.state === 'pending') return acquired;

    let verified: VerifiedAdyenTestSessionPayment;
    try {
      verified = await this.adapter.verify({
        attempt: persisted.attempt,
        sessionId,
        sessionResult: acquired.sessionResult,
      });
    } catch (error) {
      const conflict =
        error instanceof PaymentDomainError &&
        error.code === 'provider_session_result_conflict';
      await this.finish(
        input.operationId,
        acquired.leaseToken,
        acquired.version,
        conflict ? 'conflict' : 'unknown',
      );
      return { state: conflict ? 'needs_review' : 'pending' };
    }
    const binding = await this.finish(
      input.operationId,
      acquired.leaseToken,
      acquired.version,
      'verified',
      persisted.attempt,
      verified,
    );
    if (!binding) return { state: 'needs_review' };
    return { state: 'verified', binding };
  }

  private async prepare(input: {
    operationId: string;
    attemptId: string;
    sessionResult: string;
    sessionId: string;
    sessionHash: string;
    resultHash: string;
    retryUntil: number;
  }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`payment-session-result:${input.attemptId}`],
      );
      const prior = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_session_result_operations WHERE attempt_id=$1',
        [input.attemptId],
      );
      if (prior.rowCount) {
        const row = prior.rows[0];
        ensure(
          row.operation_id === input.operationId &&
            row.session_id_sha256 === input.sessionHash &&
            row.result_sha256 === input.resultHash,
          'session_result_operation_conflict',
        );
        return;
      }
      await client.query(
        `INSERT INTO business_v2.payment_session_result_operations
        (operation_id,attempt_id,session_id_sha256,result_sha256,encrypted_result,retry_until,state)
        VALUES($1,$2,$3,$4,$5,$6,'prepared')`,
        [
          input.operationId,
          input.attemptId,
          input.sessionHash,
          input.resultHash,
          this.vault.seal(
            input.sessionResult,
            `${input.operationId}:session-result`,
          ),
          input.retryUntil,
        ],
      );
      await client.query(
        "INSERT INTO business_v2.payment_session_result_receipts(operation_id,version,kind) VALUES($1,0,'prepared')",
        [input.operationId],
      );
    });
  }

  private async acquire(operationId: string): Promise<
    | { state: 'pending' }
    | { state: 'needs_review' }
    | { state: 'verified'; binding: PaymentMethodBinding }
    | {
        state: 'dispatch';
        sessionResult: string;
        leaseToken: string;
        version: number;
      }
  > {
    return this.transaction(async (client) => {
      const rows = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_session_result_operations WHERE operation_id=$1 FOR UPDATE',
        [operationId],
      );
      ensure(rows.rowCount === 1, 'session_result_operation_missing');
      const row = rows.rows[0];
      if (row.state === 'conflict') return { state: 'needs_review' };
      if (row.state === 'verified') {
        const binding = await this.readBindingClient(client, row.attempt_id);
        ensure(binding !== null, 'method_binding_missing');
        return { state: 'verified', binding };
      }
      const now = await this.now(client);
      if (now >= Number(row.retry_until)) {
        const version = row.version + 1;
        await client.query(
          `UPDATE business_v2.payment_session_result_operations
          SET state='conflict',version=$1,lease_token=NULL,lease_until=NULL
          WHERE operation_id=$2 AND version=$3`,
          [version, operationId, row.version],
        );
        await client.query(
          "INSERT INTO business_v2.payment_session_result_receipts(operation_id,version,kind) VALUES($1,$2,'conflict')",
          [operationId, version],
        );
        return { state: 'needs_review' };
      }
      if (row.lease_until !== null && Number(row.lease_until) > now)
        return { state: 'pending' };
      const result = this.vault.open(
        row.encrypted_result,
        `${operationId}:session-result`,
      );
      ensure(
        paymentPayloadFingerprint(result) === row.result_sha256,
        'stored_session_result_conflict',
      );
      const leaseToken = randomUUID();
      const version = row.version + 1;
      await client.query(
        `UPDATE business_v2.payment_session_result_operations
        SET state='unknown',version=$1,lease_token=$2,lease_until=$3
        WHERE operation_id=$4 AND version=$5`,
        [version, leaseToken, now + 30000, operationId, row.version],
      );
      await client.query(
        "INSERT INTO business_v2.payment_session_result_receipts(operation_id,version,kind) VALUES($1,$2,'claimed')",
        [operationId, version],
      );
      return { state: 'dispatch', sessionResult: result, leaseToken, version };
    });
  }

  private async finish(
    operationId: string,
    leaseToken: string,
    expectedVersion: number,
    requestedState: 'unknown' | 'verified' | 'conflict',
    attempt?: PaymentAttempt,
    verified?: VerifiedAdyenTestSessionPayment,
  ): Promise<PaymentMethodBinding | null> {
    return this.transaction(async (client) => {
      const rows = await client.query<OperationRow>(
        'SELECT * FROM business_v2.payment_session_result_operations WHERE operation_id=$1 FOR UPDATE',
        [operationId],
      );
      ensure(rows.rowCount === 1, 'session_result_operation_missing');
      const row = rows.rows[0];
      const now = await this.now(client);
      ensure(
        row.lease_token === leaseToken &&
          row.version === expectedVersion &&
          Number(row.lease_until) > now,
        'session_result_lease_lost',
      );
      let binding: PaymentMethodBinding | null = null;
      let state = requestedState;
      if (state === 'verified') {
        ensure(
          attempt !== undefined && verified !== undefined,
          'method_binding_missing',
        );
        ensure(
          attempt.attemptId === row.attempt_id &&
            verified.attemptId === row.attempt_id &&
            paymentScopeFingerprint(attempt.scope) === this.scopeHash,
          'method_binding_conflict',
        );
        const evidenceSha256 = paymentPayloadFingerprint(
          JSON.stringify(verified),
        );
        // Same global order as PaymentEventStore: provider reference first,
        // then the attempt row. This fences method-vs-webhook ownership races.
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`payment-provider:${this.scopeHash}:${verified.paymentReference}`],
        );
        const lockedAttempt = await client.query(
          'SELECT 1 FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
          [row.attempt_id],
        );
        ensure(lockedAttempt.rowCount === 1, 'attempt_not_found');
        const prior = await client.query<{
          attempt_id: string;
          payment_reference: string;
          method: string;
        }>(
          `SELECT attempt_id,payment_reference,method FROM business_v2.payment_method_bindings
          WHERE (scope_sha256=$1 AND payment_reference=$2) OR attempt_id=$3 FOR UPDATE`,
          [this.scopeHash, verified.paymentReference, row.attempt_id],
        );
        const eventConflict = await client.query(
          `SELECT 1 FROM business_v2.payment_events
          WHERE attempt_id=$1 AND scope_sha256=$2
            AND fact->>'kind'='authorization' AND fact->>'success'='true'
            AND payment_reference<>$3 LIMIT 1`,
          [row.attempt_id, this.scopeHash, verified.paymentReference],
        );
        const providerOwner = await client.query<{ attempt_id: string }>(
          `SELECT attempt_id FROM business_v2.payment_provider_references
          WHERE scope_sha256=$1 AND payment_reference=$2`,
          [this.scopeHash, verified.paymentReference],
        );
        if (
          prior.rowCount ||
          eventConflict.rowCount ||
          (providerOwner.rowCount &&
            providerOwner.rows[0].attempt_id !== row.attempt_id)
        )
          state = 'conflict';
        else {
          await client.query(
            `INSERT INTO business_v2.payment_method_bindings
            (scope_sha256,payment_reference,attempt_id,method,operation_id,evidence_sha256)
            VALUES($1,$2,$3,$4,$5,$6)`,
            [
              this.scopeHash,
              verified.paymentReference,
              row.attempt_id,
              verified.paymentMethod,
              operationId,
              evidenceSha256,
            ],
          );
          binding = {
            attemptId: row.attempt_id,
            paymentReference: verified.paymentReference,
            paymentMethod: verified.paymentMethod,
            evidenceSha256,
          };
        }
      }
      const version = row.version + 1;
      await client.query(
        `UPDATE business_v2.payment_session_result_operations
        SET state=$1,version=$2,lease_token=NULL,lease_until=NULL
        WHERE operation_id=$3 AND version=$4`,
        [state, version, operationId, row.version],
      );
      await client.query(
        'INSERT INTO business_v2.payment_session_result_receipts(operation_id,version,kind) VALUES($1,$2,$3)',
        [operationId, version, state],
      );
      return binding;
    });
  }

  private async readBindingClient(
    client: PoolClient,
    attemptId: string,
  ): Promise<PaymentMethodBinding | null> {
    const result = await client.query<{
      attempt_id: string;
      payment_reference: string;
      method: PaymentMethodCapability;
      evidence_sha256: string;
    }>(
      'SELECT attempt_id,payment_reference,method,evidence_sha256 FROM business_v2.payment_method_bindings WHERE attempt_id=$1 AND scope_sha256=$2',
      [attemptId, this.scopeHash],
    );
    return result.rowCount
      ? {
          attemptId: result.rows[0].attempt_id,
          paymentReference: result.rows[0].payment_reference,
          paymentMethod: result.rows[0].method,
          evidenceSha256: result.rows[0].evidence_sha256,
        }
      : null;
  }

  async readBinding(attemptId: string): Promise<PaymentMethodBinding | null> {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    return this.transaction((client) =>
      this.readBindingClient(client, attemptId),
    );
  }

  async readState(
    attemptId: string,
  ): Promise<'not_started' | 'pending' | 'verified' | 'needs_review'> {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    try {
      return await this.transaction(async (client) => {
        const result = await client.query<{
          contract: unknown;
          state: OperationRow['state'] | null;
        }>(
          `SELECT a.contract,o.state FROM business_v2.payment_attempts a
          LEFT JOIN business_v2.payment_session_result_operations o ON o.attempt_id=a.attempt_id
          WHERE a.attempt_id=$1`,
          [attemptId],
        );
        if (!result.rowCount) return 'not_started';
        ensure(
          paymentScopeFingerprint(
            validateAttempt(result.rows[0].contract).scope,
          ) === this.scopeHash,
          'reconciliation_scope_mismatch',
        );
        const state = result.rows[0].state;
        if (state === 'conflict') return 'needs_review';
        if (state === 'verified') return 'verified';
        if (state === 'prepared' || state === 'unknown') return 'pending';
        return 'not_started';
      });
    } catch (error) {
      if (error instanceof PaymentDomainError) throw error;
      throw new PaymentDomainError('payment_reconciliation_unavailable');
    }
  }
}
