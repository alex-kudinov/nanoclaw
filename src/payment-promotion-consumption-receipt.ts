import type { PoolClient } from 'pg';

import { bookkeeperContractHash as hash } from './bookkeeper-enrollment-contract.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentTransaction } from './payment-store.js';
import type { WebsiteCheckoutEnrollmentResult } from './website-checkout-enrollment-adapter.js';

export interface PromotionConsumptionReceipt {
  schemaVersion: 1;
  receiptReference: string;
  kind: 'promotion_consumption';
  caller: string;
  operationId: string;
  quoteId: string;
  quoteFingerprint: string;
  source: PaymentScope;
  attemptId: string;
  policyReference: string;
  financialEvidenceClass: 'adyen_card_authorization_v1';
  financialAdmissionReceipt: string;
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

/** Reconstruct a stable verifier for WordPress-owned promotion consumption. */
export class PaymentPromotionConsumptionReceiptReader {
  private readonly scopeHash: string;
  private readonly scope: PaymentScope;
  private readonly promotionPolicies: ReadonlySet<string>;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    scope: PaymentScope,
    promotionPolicyReferences: readonly string[],
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    this.scope = Object.freeze(structuredClone(scope));
    this.promotionPolicies = new Set(promotionPolicyReferences);
    if (
      typeof transaction !== 'function' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      scope.provider !== 'adyen' ||
      !['test', 'live'].includes(scope.environment) ||
      scope.store === null ||
      !Array.isArray(promotionPolicyReferences) ||
      promotionPolicyReferences.length > 100 ||
      this.promotionPolicies.size !== promotionPolicyReferences.length ||
      promotionPolicyReferences.some(
        (value) => !/^[A-Za-z0-9_:.\/-]{1,200}$/.test(value),
      )
    )
      throw new PaymentDomainError('invalid_promotion_receipt_configuration');
  }

  private promotionPolicy(reference: string | null): string | null {
    if (reference === null) return null;
    const components = reference.split('/');
    const promotions = components.filter((component) =>
      component.startsWith('promotion:'),
    );
    ensure(
      components.every((component) => component.length > 0) &&
        promotions.length <= 1,
      'promotion_receipt_unavailable',
    );
    if (promotions.length === 0) return null;
    const policy = promotions[0].slice('promotion:'.length);
    ensure(this.promotionPolicies.has(policy), 'promotion_receipt_unavailable');
    return policy;
  }

  /** Fail closed before canonical enrollment for unknown promotion authority. */
  async preflight(attemptId: string): Promise<void> {
    await this.transaction(async (client: PoolClient) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [attemptId],
      );
      ensure(attempts.rowCount === 1, 'promotion_receipt_unavailable');
      const attempt = validateAttempt(attempts.rows[0].contract);
      ensure(
        paymentScopeFingerprint(attempt.scope) === this.scopeHash,
        'promotion_receipt_unavailable',
      );
      this.promotionPolicy(attempt.quote.discountPolicyReference);
    });
  }

  async read(
    attemptId: string,
    enrollment: WebsiteCheckoutEnrollmentResult,
  ): Promise<PromotionConsumptionReceipt | null> {
    return this.transaction(async (client: PoolClient) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [attemptId],
      );
      ensure(attempts.rowCount === 1, 'promotion_receipt_unavailable');
      const attempt = validateAttempt(attempts.rows[0].contract);
      ensure(
        paymentScopeFingerprint(attempt.scope) === this.scopeHash,
        'promotion_receipt_unavailable',
      );
      const promotionPolicy = this.promotionPolicy(
        attempt.quote.discountPolicyReference,
      );
      if (promotionPolicy === null) return null;
      ensure(
        enrollment.canonicalEnrollment === 'materialized' &&
          enrollment.evidenceReference !== null &&
          ['accepted', 'duplicate'].includes(enrollment.disposition),
        'promotion_receipt_unavailable',
      );
      const rows = await client.query<{
        evidence_reference: string;
        payment_method: string;
        attempt_operation_id: string;
      }>(
        `SELECT e.evidence_reference,e.payment_method,a.attempt_operation_id
         FROM business_v2.payment_enrollment_admissions e
         JOIN business_v2.payment_checkout_attribution_admissions a
           ON a.scope_sha256=e.scope_sha256 AND a.attempt_id=e.attempt_id
             AND a.caller=e.checkout_caller
         WHERE e.scope_sha256=$1 AND e.attempt_id=$2
           AND e.checkout_caller=$3`,
        [this.scopeHash, attemptId, this.caller],
      );
      ensure(
        rows.rowCount === 1 &&
          rows.rows[0].payment_method === 'card' &&
          rows.rows[0].evidence_reference === enrollment.evidenceReference,
        'promotion_receipt_unavailable',
      );
      const body = {
        schemaVersion: 1 as const,
        kind: 'promotion_consumption' as const,
        caller: this.caller,
        operationId: rows.rows[0].attempt_operation_id,
        quoteId: attempt.quote.quoteId,
        quoteFingerprint: attempt.quoteFingerprint,
        source: this.scope,
        attemptId: attempt.attemptId,
        policyReference: promotionPolicy,
        financialEvidenceClass: 'adyen_card_authorization_v1' as const,
        financialAdmissionReceipt: rows.rows[0].evidence_reference,
      };
      return Object.freeze({
        ...body,
        receiptReference: `promotion-consumption:v1:${hash(body)}`,
      });
    });
  }
}
