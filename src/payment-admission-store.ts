import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  PaymentDomainError,
  validateAttempt,
  type PaymentAttempt,
} from './payment-domain.js';
import {
  PaymentPayloadVault,
  paymentPayloadFingerprint,
} from './payment-payload-vault.js';
import {
  PaymentRequestAuthenticator,
  type VerifiedPaymentRequest,
} from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

export interface PaymentStatusCapability {
  id: string;
  token: string;
  expiresAt: number;
}
/** Explicit host policy must bind caller -> quote authority and complete TEST/live scope. */
export type PaymentCallerPolicy = (
  caller: string,
  attempt: PaymentAttempt,
) => boolean;

export class PaymentAdmissionStore {
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly auth: PaymentRequestAuthenticator,
    private readonly vault: PaymentPayloadVault,
    private readonly permits: PaymentCallerPolicy,
  ) {}

  private async now(client: PoolClient): Promise<number> {
    return Number(
      (
        await client.query(
          'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
        )
      ).rows[0].now,
    );
  }

  /** Cheap signature check only, NOT admission or permission for effects. */
  preflightSignature(
    envelope: unknown,
    body: Buffer,
    expected: { caller: string; method: string; path: string },
  ): void {
    this.auth.verify(envelope, body, expected);
  }

  /** Signature verification and unique nonce insertion share the DB clock/transaction. */
  async admit(
    envelope: unknown,
    body: Buffer,
    expected: { caller: string; method: string; path: string },
  ): Promise<VerifiedPaymentRequest> {
    return this.transaction(async (client) => {
      const receipt = this.auth.verify(
        envelope,
        body,
        expected,
        await this.now(client),
      );
      const inserted = await client.query(
        `INSERT INTO business_v2.payment_request_nonces
        (caller,nonce_sha256,operation_id,request_sha256,received_at,retain_until)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(caller,nonce_sha256) DO NOTHING RETURNING caller`,
        [
          receipt.caller,
          receipt.nonceSha256,
          receipt.operationId,
          receipt.requestSha256,
          receipt.receivedAt,
          receipt.retainNonceUntil,
        ],
      );
      if (inserted.rowCount !== 1)
        throw new PaymentDomainError('internal_request_replayed');
      return receipt;
    });
  }

  private async verifyReceipt(
    client: PoolClient,
    receipt: VerifiedPaymentRequest,
  ): Promise<void> {
    const row = await client.query(
      `SELECT 1 FROM business_v2.payment_request_nonces
      WHERE caller=$1 AND nonce_sha256=$2 AND operation_id=$3 AND request_sha256=$4
        AND received_at=$5 AND retain_until=$6 AND retain_until>$7`,
      [
        receipt.caller,
        receipt.nonceSha256,
        receipt.operationId,
        receipt.requestSha256,
        receipt.receivedAt,
        receipt.retainNonceUntil,
        await this.now(client),
      ],
    );
    if (row.rowCount !== 1)
      throw new PaymentDomainError('request_admission_required');
  }

  async issueStatusCapability(
    receipt: VerifiedPaymentRequest,
    attemptId: string,
    ttlMs = 1800000,
  ): Promise<PaymentStatusCapability> {
    if (
      !z.uuid().safeParse(attemptId).success ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs < 1 ||
      ttlMs > 86400000
    )
      throw new PaymentDomainError('invalid_capability_request');
    return this.transaction(async (client) => {
      await this.verifyReceipt(client, receipt);
      const attemptRow = await client.query(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [attemptId],
      );
      if (
        attemptRow.rowCount !== 1 ||
        !this.permits(
          receipt.caller,
          validateAttempt(attemptRow.rows[0].contract),
        )
      )
        throw new PaymentDomainError('capability_scope_denied');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`payment-capability:${receipt.caller}:${receipt.operationId}`],
      );
      const prior = await client.query(
        'SELECT * FROM business_v2.payment_status_capabilities WHERE caller=$1 AND operation_id=$2',
        [receipt.caller, receipt.operationId],
      );
      if (prior.rowCount) {
        const row = prior.rows[0];
        if (row.attempt_id !== attemptId)
          throw new PaymentDomainError('capability_operation_conflict');
        const revoked = await client.query(
          'SELECT 1 FROM business_v2.payment_status_revocations WHERE capability_id=$1',
          [row.capability_id],
        );
        if (
          Number(row.expires_at) <= (await this.now(client)) ||
          revoked.rowCount
        )
          throw new PaymentDomainError('capability_unavailable');
        return {
          id: row.capability_id,
          token: this.vault.open(
            row.encrypted_token,
            `${row.capability_id}:status-capability`,
          ),
          expiresAt: Number(row.expires_at),
        };
      }
      const id = randomUUID();
      const token = `pcap_${randomBytes(32).toString('base64url')}`;
      const now = await this.now(client);
      const expiresAt = now + ttlMs;
      await client.query(
        `INSERT INTO business_v2.payment_status_capabilities
        (capability_id,caller,issuer_nonce_sha256,operation_id,attempt_id,token_sha256,encrypted_token,issued_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          receipt.caller,
          receipt.nonceSha256,
          receipt.operationId,
          attemptId,
          paymentPayloadFingerprint(token),
          this.vault.seal(token, `${id}:status-capability`),
          now,
          expiresAt,
        ],
      );
      return { id, token, expiresAt };
    });
  }

  /** Public callers get only a boolean; never disclose existence or another order. */
  async permitsStatus(token: string, attemptId: string): Promise<boolean> {
    if (
      typeof token !== 'string' ||
      !/^pcap_[A-Za-z0-9_-]{43}$/.test(token) ||
      !z.uuid().safeParse(attemptId).success
    )
      return false;
    return this.transaction(async (client) => {
      const result = await client.query(
        `SELECT 1 FROM business_v2.payment_status_capabilities c
        WHERE c.token_sha256=$1 AND c.attempt_id=$2 AND c.expires_at>$3
          AND NOT EXISTS(SELECT 1 FROM business_v2.payment_status_revocations r WHERE r.capability_id=c.capability_id)`,
        [paymentPayloadFingerprint(token), attemptId, await this.now(client)],
      );
      return result.rowCount === 1;
    });
  }

  async revokeStatusCapability(
    receipt: VerifiedPaymentRequest,
    capabilityId: string,
    reason: 'rotation' | 'operator' | 'security',
  ): Promise<void> {
    if (
      !z.uuid().safeParse(capabilityId).success ||
      !['rotation', 'operator', 'security'].includes(reason)
    )
      throw new PaymentDomainError('invalid_capability_request');
    return this.transaction(async (client) => {
      await this.verifyReceipt(client, receipt);
      const owned = await client.query(
        'SELECT 1 FROM business_v2.payment_status_capabilities WHERE capability_id=$1 AND caller=$2',
        [capabilityId, receipt.caller],
      );
      if (owned.rowCount !== 1)
        throw new PaymentDomainError('capability_scope_denied');
      await client.query(
        `INSERT INTO business_v2.payment_status_revocations
        (capability_id,caller,request_nonce_sha256,operation_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(capability_id) DO NOTHING`,
        [
          capabilityId,
          receipt.caller,
          receipt.nonceSha256,
          receipt.operationId,
          reason,
        ],
      );
    });
  }
}
