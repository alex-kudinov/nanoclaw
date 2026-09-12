import type { Pool, PoolClient } from 'pg';

import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import type { ProjectionDatabaseGuard } from './student-enrollment-projection-store.js';

export interface WebsiteCheckoutLiveFulfillmentResult {
  enrollmentResult: {
    disposition: 'accepted' | 'duplicate' | 'held';
    canonicalEnrollment: 'materialized' | 'not_materialized';
    currentPaymentState: 'eligible' | 'pending' | 'needs_review';
  };
  receiptWelcome: {
    state: 'verified' | 'queued' | 'held';
    receiptReference: string | null;
  };
}

export interface WebsiteCheckoutLiveFulfillmentService {
  fulfillAttempt(
    attemptId: string,
  ): Promise<WebsiteCheckoutLiveFulfillmentResult>;
  cleanupCheckoutSubmissions?(): Promise<number>;
}

/**
 * Restart-safe scanner over durable checkout admission and payment evidence.
 * Webhook ACK never awaits this worker; all downstream actions are idempotent.
 */
export class WebsiteCheckoutLiveFulfillmentWorker {
  private readonly scopeHash: string;
  private timer: NodeJS.Timeout | null = null;
  private activeDrain: Promise<{
    scanned: number;
    materialized: number;
    held: number;
    failed: number;
  }> | null = null;

  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly caller: 'tandem-wordpress-live',
    scope: PaymentScope,
    private readonly service: WebsiteCheckoutLiveFulfillmentService,
    private readonly databaseGuard: ProjectionDatabaseGuard,
    private readonly batchSize: number,
  ) {
    if (
      caller !== 'tandem-wordpress-live' ||
      scope.provider !== 'adyen' ||
      scope.environment !== 'live' ||
      scope.store === null ||
      !pool ||
      !service ||
      typeof databaseGuard !== 'function' ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 100
    )
      throw new PaymentDomainError(
        'invalid_live_fulfillment_worker_configuration',
      );
    this.scopeHash = paymentScopeFingerprint(scope);
  }

  private async candidates(
    client: PoolClient,
    after: { acceptedAt: string; attemptId: string } | null,
  ): Promise<Array<{ attemptId: string; acceptedAt: string }>> {
    const result = await client.query<{
      attempt_id: string;
      accepted_at: string;
    }>(
      `SELECT c.attempt_id::text,c.accepted_at::text
       FROM business_v2.payment_checkout_admission_evidence c
       JOIN business_v2.payment_checkout_attribution_admissions a
         ON a.scope_sha256=c.scope_sha256 AND a.caller=c.caller
           AND a.attempt_id=c.attempt_id
       JOIN business_v2.payment_checkout_evidence e
         ON e.attempt_id=c.attempt_id
       WHERE c.scope_sha256=$1 AND c.caller=$2
         AND ($3::bigint IS NULL OR
           (c.accepted_at,c.attempt_id) > ($3::bigint,$4::uuid))
       ORDER BY c.accepted_at,c.attempt_id
       LIMIT $5`,
      [
        this.scopeHash,
        this.caller,
        after?.acceptedAt ?? null,
        after?.attemptId ?? null,
        this.batchSize,
      ],
    );
    return result.rows.map((row) => ({
      attemptId: row.attempt_id,
      acceptedAt: row.accepted_at,
    }));
  }

  async drainOnce(): Promise<{
    scanned: number;
    materialized: number;
    held: number;
    failed: number;
  }> {
    if (this.activeDrain) return this.activeDrain;
    const drain = async () => {
      await this.service.cleanupCheckoutSubmissions?.();
      let after: { acceptedAt: string; attemptId: string } | null = null;
      let scanned = 0;
      let materialized = 0;
      let held = 0;
      let failed = 0;
      for (;;) {
        const client = await this.pool.connect();
        let page: Array<{ attemptId: string; acceptedAt: string }>;
        try {
          await this.databaseGuard(client);
          page = await this.candidates(client, after);
        } finally {
          client.release();
        }
        if (page.length === 0) break;
        for (const candidate of page) {
          scanned += 1;
          try {
            const result = await this.service.fulfillAttempt(
              candidate.attemptId,
            );
            if (result.enrollmentResult.canonicalEnrollment === 'materialized')
              materialized += 1;
            else held += 1;
          } catch {
            failed += 1;
          }
        }
        const last = page[page.length - 1];
        after = { acceptedAt: last.acceptedAt, attemptId: last.attemptId };
        if (page.length < this.batchSize) break;
      }
      return { scanned, materialized, held, failed };
    };
    this.activeDrain = drain().finally(() => {
      this.activeDrain = null;
    });
    return this.activeDrain;
  }

  start(pollIntervalMs: number): void {
    if (
      this.timer ||
      !Number.isInteger(pollIntervalMs) ||
      pollIntervalMs < 1000 ||
      pollIntervalMs > 60000
    )
      throw new PaymentDomainError(
        'invalid_live_fulfillment_worker_configuration',
      );
    this.timer = setInterval(
      () => void this.drainOnce().catch(() => undefined),
      pollIntervalMs,
    );
    this.timer.unref();
    void this.drainOnce().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.activeDrain;
  }
}
