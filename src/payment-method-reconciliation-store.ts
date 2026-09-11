import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';
import { z } from 'zod';

import type {
  AdyenSessionResultAdapter,
  VerifiedAdyenSessionPayment,
  VerifiedAdyenSessionResult,
  VerifiedAdyenSessionTerminalNonpayment,
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
import {
  PaymentSessionReturnBindingIssuer,
  SESSION_RESULT_RECOVERY_WINDOW_MS,
  sessionIdSha256,
} from './payment-session-return-binding.js';

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
  | { state: 'terminal_nonpayment'; terminalReceipt: string }
  | { state: 'verified'; binding: PaymentMethodBinding };
export interface PaymentMethodReconciliationRequest {
  operationId: string;
  attemptId: string;
  sessionResult: string;
  returnBinding?: string;
}

interface OperationRow {
  operation_id: string;
  attempt_id: string;
  payment_operation_id: string;
  session_sequence: number;
  session_id_sha256: string;
  result_sha256: string;
  encrypted_result: string;
  retry_until: string;
  state:
    | 'prepared'
    | 'unknown'
    | 'verified'
    | 'conflict'
    | 'terminal_nonpayment';
  terminal_status: 'refused' | 'canceled' | 'expired' | null;
  version: number;
  lease_token: string | null;
  lease_until: string | null;
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

/** Durable environment-scoped lookup/retry. No provider call occurs in a transaction. */
export class PaymentMethodReconciliationStore {
  private readonly scopeHash: string;
  private readonly returnBindings: PaymentSessionReturnBindingIssuer;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly vault: PaymentPayloadVault,
    private readonly sessions: SessionReader,
    private readonly adapter: Pick<AdyenSessionResultAdapter, 'verify'>,
    scope: PaymentScope,
    returnBindings?: PaymentSessionReturnBindingIssuer,
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    if (
      scope.provider !== 'adyen' ||
      !['test', 'live'].includes(scope.environment) ||
      scope.endpointRegion !== 'eu' ||
      scope.store === null
    )
      throw new PaymentDomainError('invalid_reconciliation_scope');
    if (!returnBindings && scope.environment !== 'test')
      throw new PaymentDomainError('invalid_return_binding_configuration');
    this.returnBindings =
      returnBindings ??
      new PaymentSessionReturnBindingIssuer(Buffer.alloc(32, 0x54));
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
    const returnBinding =
      input.returnBinding === undefined
        ? null
        : this.returnBindings.open(input.returnBinding);
    if (returnBinding && returnBinding.attemptId !== input.attemptId)
      throw new PaymentDomainError('return_binding_conflict');
    const persisted = await this.sessions.readPersistedSession(
      input.attemptId,
      returnBinding?.paymentOperationId,
    );
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
    if (
      returnBinding &&
      (returnBinding.sessionSequence !== persisted.sessionSequence ||
        returnBinding.sessionIdSha256 !== sessionIdSha256(sessionId))
    )
      throw new PaymentDomainError('return_binding_conflict');
    const retryUntil =
      Date.parse(session.data.expiresAt) + SESSION_RESULT_RECOVERY_WINDOW_MS;
    ensure(
      Number.isSafeInteger(retryUntil) && retryUntil >= 0,
      'persisted_session_unavailable',
    );
    const sessionHash = paymentPayloadFingerprint(sessionId);
    const resultHash = paymentPayloadFingerprint(input.sessionResult);
    const resultOperationId = await this.prepare({
      ...input,
      paymentOperationId: persisted.paymentOperationId,
      sessionSequence: persisted.sessionSequence,
      sessionId,
      sessionHash,
      resultHash,
      retryUntil,
    });
    const acquired = await this.acquire(resultOperationId);
    if (acquired.state === 'verified')
      return { state: 'verified', binding: acquired.binding };
    if (acquired.state === 'needs_review') return acquired;
    if (acquired.state === 'pending') return acquired;
    if (acquired.state === 'terminal_nonpayment') return acquired;

    let verified: VerifiedAdyenSessionResult;
    try {
      verified = await this.adapter.verify({
        attempt: persisted.attempt,
        sessionId,
        sessionResult: acquired.sessionResult,
        sessionSequence: persisted.sessionSequence,
      });
    } catch (error) {
      const conflict =
        error instanceof PaymentDomainError &&
        error.code === 'provider_session_result_conflict';
      await this.finish(
        resultOperationId,
        acquired.leaseToken,
        acquired.version,
        conflict ? 'conflict' : 'unknown',
      );
      return { state: conflict ? 'needs_review' : 'pending' };
    }
    const outcome = await this.finish(
      resultOperationId,
      acquired.leaseToken,
      acquired.version,
      'verified',
      persisted.attempt,
      verified,
    );
    if (!outcome) return { state: 'needs_review' };
    if ('terminalReceipt' in outcome)
      return { state: 'terminal_nonpayment', ...outcome };
    return { state: 'verified', binding: outcome };
  }

  private async prepare(input: {
    operationId: string;
    attemptId: string;
    paymentOperationId: string;
    sessionSequence: number;
    sessionResult: string;
    sessionId: string;
    sessionHash: string;
    resultHash: string;
    retryUntil: number;
  }): Promise<string> {
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`payment-session-result:${input.attemptId}`],
      );
      const prior = await client.query<OperationRow>(
        `SELECT * FROM business_v2.payment_session_result_operations
         WHERE operation_id=$1 OR (payment_operation_id=$2 AND result_sha256=$3)
         ORDER BY operation_id=$1 DESC FOR UPDATE`,
        [input.operationId, input.paymentOperationId, input.resultHash],
      );
      if (prior.rowCount) {
        const row = prior.rows[0];
        ensure(
          row.payment_operation_id === input.paymentOperationId &&
            Number(row.session_sequence) === input.sessionSequence &&
            row.session_id_sha256 === input.sessionHash &&
            row.result_sha256 === input.resultHash,
          'session_result_operation_conflict',
        );
        return row.operation_id;
      }
      await client.query(
        `INSERT INTO business_v2.payment_session_result_operations
        (operation_id,attempt_id,payment_operation_id,session_sequence,
         session_id_sha256,result_sha256,encrypted_result,retry_until,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared')`,
        [
          input.operationId,
          input.attemptId,
          input.paymentOperationId,
          input.sessionSequence,
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
      return input.operationId;
    });
  }

  private async acquire(operationId: string): Promise<
    | { state: 'pending' }
    | { state: 'needs_review' }
    | { state: 'terminal_nonpayment'; terminalReceipt: string }
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
      if (row.state === 'terminal_nonpayment') {
        const terminal = await client.query<{ receipt_sha256: string }>(
          `SELECT receipt_sha256 FROM business_v2.payment_session_terminal_nonpayment_receipts
           WHERE payment_operation_id=$1`,
          [row.payment_operation_id],
        );
        ensure(terminal.rowCount === 1, 'terminal_receipt_missing');
        return {
          state: 'terminal_nonpayment',
          terminalReceipt: `terminal-nonpayment:v1:${terminal.rows[0].receipt_sha256}`,
        };
      }
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
    verified?: VerifiedAdyenSessionResult,
  ): Promise<PaymentMethodBinding | { terminalReceipt: string } | null> {
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
      let outcome: PaymentMethodBinding | { terminalReceipt: string } | null =
        null;
      let state: 'unknown' | 'verified' | 'conflict' | 'terminal_nonpayment' =
        requestedState;
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
        if ('status' in verified) {
          outcome = await this.recordTerminalReceipt(client, row, verified);
          state = 'terminal_nonpayment';
        } else {
          const terminal = await client.query(
            `SELECT 1 FROM business_v2.payment_session_terminal_nonpayment_receipts
             WHERE payment_operation_id=$1`,
            [row.payment_operation_id],
          );
          if (terminal.rowCount) {
            await this.recordRetryException(
              client,
              row,
              'late_positive_after_terminal',
            );
            state = 'conflict';
          } else {
            const evidenceSha256 = paymentPayloadFingerprint(
              JSON.stringify(verified),
            );
            // Same global order as PaymentEventStore: provider reference first,
            // then the attempt row. This fences method-vs-webhook ownership races.
            await client.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [
                `payment-provider:${this.scopeHash}:${verified.paymentReference}`,
              ],
            );
            const lockedAttempt = await client.query(
              'SELECT 1 FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
              [row.attempt_id],
            );
            ensure(lockedAttempt.rowCount === 1, 'attempt_not_found');
            const prior = await client.query<{
              scope_sha256: string;
              attempt_id: string;
              payment_reference: string;
              method: string;
              evidence_sha256: string;
              source_kind: 'session_result' | 'card_scope_webhook';
              evidence_payment_operation_id: string | null;
              evidence_session_sequence: number | null;
            }>(
              `SELECT m.scope_sha256,m.attempt_id,m.payment_reference,m.method,
                m.evidence_sha256,m.source_kind,
                COALESCE(r.payment_operation_id,e.payment_operation_id)
                  evidence_payment_operation_id,
                COALESCE(r.session_sequence,e.session_sequence)
                  evidence_session_sequence
               FROM business_v2.payment_method_bindings m
               LEFT JOIN business_v2.payment_session_result_operations r
                 ON m.source_kind='session_result' AND r.operation_id=m.operation_id
               LEFT JOIN business_v2.payment_events e
                 ON m.source_kind='card_scope_webhook'
                AND e.scope_sha256=m.scope_sha256
                AND e.event_id=m.source_event_id
               WHERE (m.scope_sha256=$1 AND m.payment_reference=$2)
                  OR m.attempt_id=$3
               FOR UPDATE OF m`,
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
            const existing = prior.rows[0];
            const compatible =
              prior.rowCount === 1 &&
              existing.scope_sha256 === this.scopeHash &&
              existing.attempt_id === row.attempt_id &&
              existing.payment_reference === verified.paymentReference &&
              existing.method === verified.paymentMethod &&
              existing.evidence_payment_operation_id ===
                row.payment_operation_id &&
              Number(existing.evidence_session_sequence) ===
                Number(row.session_sequence);
            if (
              (prior.rowCount && !compatible) ||
              eventConflict.rowCount ||
              (providerOwner.rowCount &&
                providerOwner.rows[0].attempt_id !== row.attempt_id)
            )
              state = 'conflict';
            else if (compatible)
              outcome = {
                attemptId: existing.attempt_id,
                paymentReference: existing.payment_reference,
                paymentMethod: existing.method as PaymentMethodCapability,
                evidenceSha256: existing.evidence_sha256,
              };
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
              outcome = {
                attemptId: row.attempt_id,
                paymentReference: verified.paymentReference,
                paymentMethod: verified.paymentMethod,
                evidenceSha256,
              };
            }
          }
        }
      }
      const version = row.version + 1;
      await client.query(
        `UPDATE business_v2.payment_session_result_operations
        SET state=$1,version=$2,lease_token=NULL,lease_until=NULL,
          terminal_status=$5
        WHERE operation_id=$3 AND version=$4`,
        [
          state,
          version,
          operationId,
          row.version,
          state === 'terminal_nonpayment' && verified && 'status' in verified
            ? verified.status
            : null,
        ],
      );
      await client.query(
        'INSERT INTO business_v2.payment_session_result_receipts(operation_id,version,kind) VALUES($1,$2,$3)',
        [operationId, version, state],
      );
      return outcome;
    });
  }

  private async recordTerminalReceipt(
    client: PoolClient,
    row: OperationRow,
    terminal: VerifiedAdyenSessionTerminalNonpayment,
  ): Promise<{ terminalReceipt: string }> {
    ensure(
      Number.isSafeInteger(Number(row.session_sequence)) &&
        Number(row.session_sequence) >= 1 &&
        Number(row.session_sequence) <= 3,
      'operation_not_found',
    );
    const observedAt = await this.now(client);
    const responseSha256 = paymentPayloadFingerprint(JSON.stringify(terminal));
    const receiptSha256 = paymentPayloadFingerprint(
      JSON.stringify({
        version: 1,
        source: 'authenticated_session_result',
        scopeSha256: this.scopeHash,
        attemptId: row.attempt_id,
        paymentOperationId: row.payment_operation_id,
        sessionSequence: Number(row.session_sequence),
        sessionIdSha256: row.session_id_sha256,
        resultSha256: row.result_sha256,
        responseSha256,
        terminalStatus: terminal.status,
        observedAt,
      }),
    );
    const existing = await client.query<{
      receipt_sha256: string;
      terminal_status: string;
    }>(
      `SELECT receipt_sha256,terminal_status
       FROM business_v2.payment_session_terminal_nonpayment_receipts
       WHERE payment_operation_id=$1 FOR UPDATE`,
      [row.payment_operation_id],
    );
    if (existing.rowCount) {
      if (
        existing.rows[0].receipt_sha256 !== receiptSha256 ||
        existing.rows[0].terminal_status !== terminal.status
      ) {
        await this.recordRetryException(
          client,
          row,
          'terminal_evidence_conflict',
        );
        throw new PaymentDomainError('provider_session_result_conflict');
      }
    } else {
      await client.query(
        `INSERT INTO business_v2.payment_session_terminal_nonpayment_receipts
         (receipt_sha256,scope_sha256,attempt_id,payment_operation_id,
          session_sequence,session_id_sha256,result_sha256,response_sha256,
          terminal_status,source,observed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,
          'authenticated_session_result',to_timestamp($10/1000.0))`,
        [
          receiptSha256,
          this.scopeHash,
          row.attempt_id,
          row.payment_operation_id,
          Number(row.session_sequence),
          row.session_id_sha256,
          row.result_sha256,
          responseSha256,
          terminal.status,
          observedAt,
        ],
      );
    }
    return { terminalReceipt: `terminal-nonpayment:v1:${receiptSha256}` };
  }

  private async recordRetryException(
    client: PoolClient,
    row: OperationRow,
    reason:
      | 'late_positive_after_terminal'
      | 'terminal_evidence_conflict'
      | 'retry_chain_conflict',
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_v2.payment_session_retry_exceptions
       (exception_sha256,attempt_id,payment_operation_id,session_sequence,reason)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(exception_sha256) DO NOTHING`,
      [
        paymentPayloadFingerprint(
          JSON.stringify([
            row.attempt_id,
            row.payment_operation_id,
            row.result_sha256,
            reason,
          ]),
        ),
        row.attempt_id,
        row.payment_operation_id,
        Number(row.session_sequence),
        reason,
      ],
    );
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
  ): Promise<
    | 'not_started'
    | 'pending'
    | 'verified'
    | 'needs_review'
    | 'terminal_nonpayment'
  > {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    try {
      return await this.transaction(async (client) => {
        const result = await client.query<{ contract: unknown }>(
          `SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1`,
          [attemptId],
        );
        if (!result.rowCount) return 'not_started';
        ensure(
          paymentScopeFingerprint(
            validateAttempt(result.rows[0].contract).scope,
          ) === this.scopeHash,
          'reconciliation_scope_mismatch',
        );
        const states = await client.query<{ state: OperationRow['state'] }>(
          `SELECT state FROM business_v2.payment_session_result_operations
           WHERE attempt_id=$1`,
          [attemptId],
        );
        const exceptions = await client.query(
          'SELECT 1 FROM business_v2.payment_session_retry_exceptions WHERE attempt_id=$1 LIMIT 1',
          [attemptId],
        );
        if (
          exceptions.rowCount ||
          states.rows.some((row) => row.state === 'conflict')
        )
          return 'needs_review';
        if (states.rows.some((row) => row.state === 'verified'))
          return 'verified';
        if (states.rows.some((row) => row.state === 'terminal_nonpayment'))
          return 'terminal_nonpayment';
        if (
          states.rows.some(
            (row) => row.state === 'prepared' || row.state === 'unknown',
          )
        )
          return 'pending';
        return 'not_started';
      });
    } catch (error) {
      if (error instanceof PaymentDomainError) throw error;
      throw new PaymentDomainError('payment_reconciliation_unavailable');
    }
  }

  async readTerminalRetry(attemptId: string): Promise<{
    state: 'terminal_nonpayment';
    terminalReceipt: string;
    disposition: 'eligible' | 'reconfirmation_required' | 'limit_reached';
  } | null> {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('invalid_attempt_identity');
    return this.transaction(async (client) => {
      const result = await client.query<{
        contract: unknown;
        session_sequence: number;
        receipt_sha256: string | null;
      }>(
        `SELECT a.contract,o.session_sequence,t.receipt_sha256
         FROM business_v2.payment_attempts a
         JOIN business_v2.payment_operations o ON o.attempt_id=a.attempt_id
         LEFT JOIN business_v2.payment_session_terminal_nonpayment_receipts t
           ON t.payment_operation_id=o.operation_id
         WHERE a.attempt_id=$1
         ORDER BY o.session_sequence DESC LIMIT 1`,
        [attemptId],
      );
      if (!result.rowCount || result.rows[0].receipt_sha256 === null)
        return null;
      const attempt = validateAttempt(result.rows[0].contract);
      ensure(
        paymentScopeFingerprint(attempt.scope) === this.scopeHash,
        'reconciliation_scope_mismatch',
      );
      const blockers = await client.query(
        `SELECT
          EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions WHERE attempt_id=$1) exception,
          EXISTS(SELECT 1 FROM business_v2.payment_method_bindings WHERE attempt_id=$1) binding,
          EXISTS(SELECT 1 FROM business_v2.payment_enrollment_admissions WHERE attempt_id=$1) enrollment`,
        [attemptId],
      );
      if (
        blockers.rows[0]?.exception ||
        blockers.rows[0]?.binding ||
        blockers.rows[0]?.enrollment
      )
        return null;
      const now = await this.now(client);
      const disposition =
        Number(result.rows[0].session_sequence) >= 3
          ? 'limit_reached'
          : now >= attempt.quote.expiresAt
            ? 'reconfirmation_required'
            : 'eligible';
      return {
        state: 'terminal_nonpayment',
        terminalReceipt: `terminal-nonpayment:v1:${result.rows[0].receipt_sha256}`,
        disposition,
      };
    });
  }
}
