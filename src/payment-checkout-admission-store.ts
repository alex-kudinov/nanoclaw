import type { PoolClient } from 'pg';

import {
  CheckoutAdmissionEvidenceIssuer,
  parsePaymentCheckoutAdmissionCommand,
  validateCheckoutDocumentPolicies,
  type CheckoutAdmissionEvidenceReceipt,
  type CheckoutDocumentPolicy,
  type PaymentCheckoutAdmissionCommand,
} from './payment-checkout-admission.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import { paymentPayloadFingerprint } from './payment-payload-vault.js';
import type { VerifiedPaymentRequest } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

export interface CheckoutAdmissionEvidenceRow {
  scope_sha256: string;
  caller: string;
  operation_id: string;
  attempt_id: string;
  quote_id: string;
  quote_fingerprint: string;
  identity_preparation_id: string;
  identity_origin_operation_id: string;
  identity_receipt_reference: string;
  payer_reference: string;
  participant_reference: string;
  payer_role_proof: string;
  participant_role_proof: string;
  purchase_relationship: 'self' | 'other';
  consent_bundle_receipt: string;
  terms_version: string;
  terms_content_sha256: string;
  terms_receipt_reference: string;
  terms_accepted_at: string;
  privacy_version: string;
  privacy_content_sha256: string;
  privacy_receipt_reference: string;
  privacy_accepted_at: string;
  mandate_version: string | null;
  mandate_content_sha256: string | null;
  mandate_receipt_reference: string | null;
  mandate_accepted_at: string | null;
  mandate_amount_minor: string | null;
  mandate_currency: string | null;
  mandate_frequency: 'one_time' | null;
  mandate_sec_code: 'WEB' | null;
  request_body_sha256: string;
  evidence_sha256: string;
  evidence_reference: string;
  accepted_at: string;
}

type IdentityRow = {
  preparation_id: string;
  caller: string;
  origin_operation_id: string;
  intent_id: string;
  offer_key: string;
  purchase_relationship: 'self' | 'other';
  identity_request_sha256: string;
  source_sha256: string;
  payer_party_id: string;
  participant_party_id: string;
  payer_reference: string;
  participant_reference: string;
  payer_role_proof: string;
  participant_role_proof: string;
  receipt_reference: string;
};

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

export class PaymentCheckoutAdmissionStore {
  readonly scopeHash: string;
  readonly scope: PaymentScope;
  private readonly policies: readonly CheckoutDocumentPolicy[];

  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    scope: PaymentScope,
    private readonly issuer: CheckoutAdmissionEvidenceIssuer,
    policies: readonly CheckoutDocumentPolicy[],
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    this.scope = Object.freeze(structuredClone(scope));
    this.policies = validateCheckoutDocumentPolicies(policies);
    if (
      typeof transaction !== 'function' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      scope.provider !== 'adyen' ||
      !['test', 'live'].includes(scope.environment) ||
      scope.store === null
    )
      throw new PaymentDomainError('invalid_checkout_admission_configuration');
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

  private async assertAdmission(
    client: PoolClient,
    admitted: VerifiedPaymentRequest,
  ): Promise<void> {
    ensure(admitted.caller === this.caller, 'checkout_admission_scope_denied');
    const result = await client.query(
      `SELECT 1 FROM business_v2.payment_request_nonces
       WHERE caller=$1 AND nonce_sha256=$2 AND operation_id=$3
         AND request_sha256=$4 AND received_at=$5 AND retain_until=$6
         AND retain_until>$7`,
      [
        admitted.caller,
        admitted.nonceSha256,
        admitted.operationId,
        admitted.requestSha256,
        admitted.receivedAt,
        admitted.retainNonceUntil,
        await this.now(client),
      ],
    );
    ensure(result.rowCount === 1, 'request_admission_required');
  }

  private policy(
    kind: CheckoutDocumentPolicy['kind'],
    document: { version: string; contentSha256: string; acceptedAt: number },
  ): void {
    ensure(
      this.policies.some(
        (policy) =>
          policy.kind === kind &&
          policy.version === document.version &&
          policy.contentSha256 === document.contentSha256 &&
          document.acceptedAt >= policy.effectiveFrom &&
          (policy.effectiveTo === null ||
            document.acceptedAt < policy.effectiveTo),
      ),
      'checkout_document_policy_denied',
    );
  }

  private receipt(row: CheckoutAdmissionEvidenceRow) {
    return Object.freeze({
      schemaVersion: 1 as const,
      evidenceReference: row.evidence_reference,
      kind: 'checkout_admission_evidence' as const,
      caller: row.caller,
      operationId: row.operation_id,
      attemptId: row.attempt_id,
      quoteId: row.quote_id,
      quoteFingerprint: row.quote_fingerprint,
      identityReceiptReference: row.identity_receipt_reference,
      consentBundleReceiptReference: row.consent_bundle_receipt,
      source: this.scope,
    });
  }

  private matches(
    row: CheckoutAdmissionEvidenceRow,
    command: PaymentCheckoutAdmissionCommand,
    bodySha256: string,
  ): boolean {
    const mandate = command.consentBundle.achMandate;
    return (
      row.scope_sha256 === this.scopeHash &&
      row.caller === this.caller &&
      row.operation_id === command.requestId &&
      row.attempt_id === command.attemptId &&
      row.quote_id === command.quoteId &&
      row.quote_fingerprint === command.quoteFingerprint &&
      row.identity_preparation_id === command.identity.preparationId &&
      row.identity_origin_operation_id === command.identity.originOperationId &&
      row.identity_receipt_reference === command.identity.receiptReference &&
      row.payer_reference === command.identity.payerReference &&
      row.participant_reference === command.identity.participantReference &&
      row.payer_role_proof === command.identity.payerRoleProof &&
      row.participant_role_proof === command.identity.participantRoleProof &&
      row.purchase_relationship === command.identity.purchaseRelationship &&
      row.consent_bundle_receipt ===
        command.consentBundle.bundleReceiptReference &&
      row.terms_version === command.consentBundle.enrollmentTerms.version &&
      row.terms_content_sha256 ===
        command.consentBundle.enrollmentTerms.contentSha256 &&
      row.terms_receipt_reference ===
        command.consentBundle.enrollmentTerms.receiptReference &&
      Number(row.terms_accepted_at) ===
        command.consentBundle.enrollmentTerms.acceptedAt &&
      row.privacy_version === command.consentBundle.privacy.version &&
      row.privacy_content_sha256 ===
        command.consentBundle.privacy.contentSha256 &&
      row.privacy_receipt_reference ===
        command.consentBundle.privacy.receiptReference &&
      Number(row.privacy_accepted_at) ===
        command.consentBundle.privacy.acceptedAt &&
      row.mandate_version === (mandate?.version ?? null) &&
      row.mandate_content_sha256 === (mandate?.contentSha256 ?? null) &&
      row.mandate_receipt_reference === (mandate?.receiptReference ?? null) &&
      (row.mandate_accepted_at === null
        ? mandate === null
        : Number(row.mandate_accepted_at) === mandate?.acceptedAt) &&
      (row.mandate_amount_minor === null
        ? mandate === null
        : Number(row.mandate_amount_minor) === mandate?.amountMinor) &&
      row.mandate_currency === (mandate?.currency ?? null) &&
      row.mandate_frequency === (mandate?.frequency ?? null) &&
      row.mandate_sec_code === (mandate?.secCode ?? null) &&
      row.request_body_sha256 === bodySha256
    );
  }

  async accept(input: {
    command: PaymentCheckoutAdmissionCommand;
    bodySha256: string;
    admitted: VerifiedPaymentRequest;
  }): Promise<CheckoutAdmissionEvidenceReceipt> {
    const command = parsePaymentCheckoutAdmissionCommand(input.command);
    ensure(
      /^[a-f0-9]{64}$/.test(input.bodySha256) &&
        command.requestId === input.admitted.operationId,
      'invalid_checkout_admission_request',
    );
    return this.transaction(async (client) => {
      await this.assertAdmission(client, input.admitted);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [
          `payment-checkout-admission:${this.scopeHash}:${this.caller}:${command.attemptId}`,
        ],
      );
      const prior = await client.query<CheckoutAdmissionEvidenceRow>(
        `SELECT * FROM business_v2.payment_checkout_admission_evidence
         WHERE scope_sha256=$1 AND caller=$2
           AND (operation_id=$3 OR attempt_id=$4) FOR UPDATE`,
        [this.scopeHash, this.caller, command.requestId, command.attemptId],
      );
      if (prior.rowCount) {
        ensure(
          prior.rowCount === 1 &&
            this.matches(prior.rows[0], command, input.bodySha256),
          'checkout_admission_evidence_conflict',
        );
        return this.receipt(prior.rows[0]);
      }

      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
        [command.attemptId],
      );
      ensure(attempts.rowCount === 1, 'checkout_attempt_not_found');
      const attempt = validateAttempt(attempts.rows[0].contract);
      ensure(
        paymentScopeFingerprint(attempt.scope) === this.scopeHash &&
          attempt.quote.quoteId === command.quoteId &&
          attempt.quoteFingerprint === command.quoteFingerprint &&
          attempt.quote.payerReference === command.identity.payerReference &&
          attempt.quote.participantReference ===
            command.identity.participantReference &&
          attempt.quote.termsVersion ===
            command.consentBundle.enrollmentTerms.version &&
          attempt.quote.consentReceipt ===
            command.consentBundle.bundleReceiptReference &&
          attempt.quote.acceptedAt ===
            command.consentBundle.enrollmentTerms.acceptedAt,
        'checkout_admission_binding_conflict',
      );
      const identities = await client.query<IdentityRow>(
        `SELECT * FROM business_v2.payment_identity_preparations
         WHERE caller=$1 AND preparation_id=$2
           AND origin_operation_id=$3 AND receipt_reference=$4 FOR UPDATE`,
        [
          this.caller,
          command.identity.preparationId,
          command.identity.originOperationId,
          command.identity.receiptReference,
        ],
      );
      ensure(identities.rowCount === 1, 'checkout_identity_evidence_missing');
      const identity = identities.rows[0];
      ensure(
        identity.source_sha256 === this.scopeHash &&
          identity.offer_key === attempt.quote.offerKey &&
          identity.payer_reference === command.identity.payerReference &&
          identity.participant_reference ===
            command.identity.participantReference &&
          identity.payer_role_proof === command.identity.payerRoleProof &&
          identity.participant_role_proof ===
            command.identity.participantRoleProof &&
          identity.purchase_relationship ===
            command.identity.purchaseRelationship,
        'checkout_admission_binding_conflict',
      );
      this.policy('enrollment_terms', command.consentBundle.enrollmentTerms);
      this.policy('privacy', command.consentBundle.privacy);
      const mandate = command.consentBundle.achMandate;
      if (mandate) {
        this.policy('ach_mandate', mandate);
        ensure(
          mandate.amountMinor === attempt.quote.finalAmount &&
            mandate.currency === attempt.quote.currency,
          'checkout_admission_binding_conflict',
        );
      }
      const acceptedAt = await this.now(client);
      const evidenceSha256 = paymentPayloadFingerprint(
        JSON.stringify([
          this.scopeHash,
          this.caller,
          input.bodySha256,
          identity.identity_request_sha256,
        ]),
      );
      const evidenceReference = this.issuer.issue([
        this.scopeHash,
        this.caller,
        command.requestId,
        command.attemptId,
        evidenceSha256,
      ]);
      const inserted = await client.query<CheckoutAdmissionEvidenceRow>(
        `INSERT INTO business_v2.payment_checkout_admission_evidence
         (scope_sha256,caller,operation_id,attempt_id,quote_id,quote_fingerprint,
          identity_preparation_id,identity_origin_operation_id,
          identity_receipt_reference,payer_reference,participant_reference,
          payer_role_proof,participant_role_proof,purchase_relationship,
          consent_bundle_receipt,terms_version,terms_content_sha256,
          terms_receipt_reference,terms_accepted_at,privacy_version,
          privacy_content_sha256,privacy_receipt_reference,privacy_accepted_at,
          mandate_version,mandate_content_sha256,mandate_receipt_reference,
          mandate_accepted_at,mandate_amount_minor,mandate_currency,
          mandate_frequency,mandate_sec_code,request_body_sha256,evidence_sha256,
          evidence_reference,accepted_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
         RETURNING *`,
        [
          this.scopeHash,
          this.caller,
          command.requestId,
          command.attemptId,
          command.quoteId,
          command.quoteFingerprint,
          command.identity.preparationId,
          command.identity.originOperationId,
          command.identity.receiptReference,
          command.identity.payerReference,
          command.identity.participantReference,
          command.identity.payerRoleProof,
          command.identity.participantRoleProof,
          command.identity.purchaseRelationship,
          command.consentBundle.bundleReceiptReference,
          command.consentBundle.enrollmentTerms.version,
          command.consentBundle.enrollmentTerms.contentSha256,
          command.consentBundle.enrollmentTerms.receiptReference,
          command.consentBundle.enrollmentTerms.acceptedAt,
          command.consentBundle.privacy.version,
          command.consentBundle.privacy.contentSha256,
          command.consentBundle.privacy.receiptReference,
          command.consentBundle.privacy.acceptedAt,
          mandate?.version ?? null,
          mandate?.contentSha256 ?? null,
          mandate?.receiptReference ?? null,
          mandate?.acceptedAt ?? null,
          mandate?.amountMinor ?? null,
          mandate?.currency ?? null,
          mandate?.frequency ?? null,
          mandate?.secCode ?? null,
          input.bodySha256,
          evidenceSha256,
          evidenceReference,
          acceptedAt,
        ],
      );
      ensure(inserted.rowCount === 1, 'checkout_admission_write_unknown');
      return this.receipt(inserted.rows[0]);
    });
  }

  async readByAttempt(
    attemptId: string,
  ): Promise<CheckoutAdmissionEvidenceRow | null> {
    return this.transaction(async (client) => {
      const result = await client.query<CheckoutAdmissionEvidenceRow>(
        `SELECT * FROM business_v2.payment_checkout_admission_evidence
         WHERE scope_sha256=$1 AND caller=$2 AND attempt_id=$3`,
        [this.scopeHash, this.caller, attemptId],
      );
      return result.rowCount === 1 ? result.rows[0] : null;
    });
  }

  receiptForRow(row: CheckoutAdmissionEvidenceRow) {
    return this.receipt(row);
  }
}
