import type { PoolClient } from 'pg';

import type { CheckoutAdmissionEvidenceRow } from './payment-checkout-admission-store.js';
import type { PaymentCheckoutAdmissionCommand } from './payment-checkout-admission.js';
import {
  parseCheckoutAttributionHandoff,
  type CheckoutAttributionHandoff,
  type ValidatedCheckoutAttribution,
} from './payment-checkout-attribution.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentAttempt,
  type PaymentScope,
} from './payment-domain.js';
import {
  PaymentPayloadVault,
  paymentPayloadFingerprint,
} from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';

export interface CheckoutAttributionAdmissionRow {
  scope_sha256: string;
  caller: string;
  operation_id: string;
  attempt_id: string;
  checkout_evidence_reference: string;
  snapshot_id: string;
  snapshot_sha256: string;
  binding_reference: string;
  binding_sha256: string;
  intent_id: string;
  attempt_operation_id: string;
  quote_id: string;
  quote_fingerprint: string;
  encrypted_snapshot: string;
  encrypted_binding: string;
  evidence_sha256: string;
  evidence_reference: string;
  accepted_at: string;
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

/** Trusted host-side attribution admission inside checkout evidence transaction. */
export class PaymentCheckoutAttributionStore {
  private readonly scopeHash: string;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    scope: PaymentScope,
    private readonly vault: PaymentPayloadVault,
    private readonly fieldMapPin: { id: string; sha256: string },
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    if (
      typeof transaction !== 'function' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      scope.provider !== 'adyen' ||
      !['test', 'live'].includes(scope.environment) ||
      scope.store === null ||
      !(vault instanceof PaymentPayloadVault) ||
      !/^[A-Za-z0-9_:.\/-]{1,200}$/.test(fieldMapPin.id) ||
      !/^[a-f0-9]{64}$/.test(fieldMapPin.sha256)
    )
      throw new PaymentDomainError(
        'invalid_checkout_attribution_configuration',
      );
  }

  private binding(row: {
    attemptId: string;
    snapshotId: string;
    bindingReference: string;
  }): string {
    return [
      'checkout-attribution-v1',
      this.scopeHash,
      this.caller,
      row.attemptId,
      row.snapshotId,
      row.bindingReference,
    ].join(':');
  }

  private matches(
    row: CheckoutAttributionAdmissionRow,
    snapshotJson: string,
    bindingJson: string,
  ): boolean {
    const aad = this.binding({
      attemptId: row.attempt_id,
      snapshotId: row.snapshot_id,
      bindingReference: row.binding_reference,
    });
    return (
      paymentPayloadFingerprint(snapshotJson) === row.snapshot_sha256 &&
      paymentPayloadFingerprint(bindingJson) === row.binding_sha256 &&
      this.vault.open(row.encrypted_snapshot, `${aad}:snapshot`) ===
        snapshotJson &&
      this.vault.open(row.encrypted_binding, `${aad}:binding`) ===
        bindingJson &&
      row.evidence_reference ===
        `checkout-attribution:v1:${row.evidence_sha256}`
    );
  }

  private exactPrior(
    row: CheckoutAttributionAdmissionRow,
    validated: ValidatedCheckoutAttribution,
    attempt: PaymentAttempt,
    identityIntentId: string,
    operationId: string,
    checkoutEvidenceReference?: string,
  ): boolean {
    return (
      row.scope_sha256 === this.scopeHash &&
      row.caller === this.caller &&
      row.operation_id === operationId &&
      row.attempt_id === attempt.attemptId &&
      (checkoutEvidenceReference === undefined ||
        row.checkout_evidence_reference === checkoutEvidenceReference) &&
      row.snapshot_id === validated.handoff.snapshotId &&
      row.snapshot_sha256 === validated.handoff.snapshotSha256 &&
      row.binding_reference === validated.handoff.bindingReference &&
      row.binding_sha256 === validated.handoff.bindingSha256 &&
      row.intent_id === identityIntentId &&
      row.attempt_operation_id ===
        validated.binding.attemptOperationReference &&
      row.quote_id === validated.binding.quoteId &&
      row.quote_fingerprint === validated.binding.quoteFingerprint &&
      this.matches(row, validated.snapshotJson, validated.bindingJson)
    );
  }

  /** Reject poisoned attribution before immutable checkout evidence is written. */
  async preflight(input: {
    attribution: CheckoutAttributionHandoff;
    command: PaymentCheckoutAdmissionCommand;
  }): Promise<void> {
    const validated = parseCheckoutAttributionHandoff(input.attribution);
    return this.transaction(async (client) => {
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1',
        [input.command.attemptId],
      );
      ensure(attempts.rowCount === 1, 'checkout_attribution_binding_conflict');
      const attempt = validateAttempt(attempts.rows[0].contract);
      const identities = await client.query<{ intent_id: string }>(
        `SELECT intent_id FROM business_v2.payment_identity_preparations
         WHERE caller=$1 AND preparation_id=$2 AND origin_operation_id=$3
           AND receipt_reference=$4`,
        [
          this.caller,
          input.command.identity.preparationId,
          input.command.identity.originOperationId,
          input.command.identity.receiptReference,
        ],
      );
      ensure(
        identities.rowCount === 1,
        'checkout_attribution_binding_conflict',
      );
      const binding = validated.binding;
      ensure(
        paymentScopeFingerprint(attempt.scope) === this.scopeHash &&
          binding.attemptReference === attempt.attemptId &&
          binding.intentId === identities.rows[0].intent_id &&
          binding.quoteId === attempt.quote.quoteId &&
          binding.quoteFingerprint === attempt.quoteFingerprint &&
          binding.offerKey === attempt.quote.offerKey &&
          binding.catalogVersion === attempt.quote.catalogVersion &&
          binding.bundleVersion === attempt.quote.bundleVersion &&
          binding.deliveryVersion === attempt.quote.deliveryVersion &&
          binding.locale === attempt.quote.locale &&
          binding.country === attempt.quote.country &&
          binding.currency === attempt.quote.currency &&
          binding.originalAmount === attempt.quote.originalAmount &&
          binding.discountAmount === attempt.quote.discountAmount &&
          binding.finalAmount === attempt.quote.finalAmount &&
          binding.discountPolicyReference ===
            attempt.quote.discountPolicyReference &&
          binding.paymentOption === attempt.quote.paymentOption &&
          binding.payerReference === input.command.identity.payerReference &&
          binding.participantReference ===
            input.command.identity.participantReference &&
          binding.termsVersion ===
            input.command.consentBundle.enrollmentTerms.version &&
          binding.termsAcceptedAt ===
            input.command.consentBundle.enrollmentTerms.acceptedAt &&
          binding.consentBundleReference ===
            input.command.consentBundle.bundleReceiptReference &&
          binding.privacyVersion ===
            input.command.consentBundle.privacy.version &&
          binding.privacyAcknowledgementReference ===
            input.command.consentBundle.privacy.receiptReference &&
          validated.snapshot.capturedAt <= attempt.quote.acceptedAt,
        'checkout_attribution_binding_conflict',
      );
      const operation = await client.query(
        `SELECT 1 FROM business_v2.payment_status_capabilities
         WHERE caller=$1 AND operation_id=$2 AND attempt_id=$3`,
        [this.caller, binding.attemptOperationReference, attempt.attemptId],
      );
      ensure(operation.rowCount === 1, 'checkout_attribution_binding_conflict');
      const prior = await client.query<CheckoutAttributionAdmissionRow>(
        `SELECT * FROM business_v2.payment_checkout_attribution_admissions
         WHERE scope_sha256=$1 AND caller=$2
           AND (operation_id=$3 OR attempt_id=$4 OR snapshot_id=$5
             OR binding_reference=$6)`,
        [
          this.scopeHash,
          this.caller,
          input.command.requestId,
          attempt.attemptId,
          validated.handoff.snapshotId,
          validated.handoff.bindingReference,
        ],
      );
      if (prior.rowCount) {
        ensure(
          prior.rowCount === 1 &&
            this.exactPrior(
              prior.rows[0],
              validated,
              attempt,
              identities.rows[0].intent_id,
              input.command.requestId,
            ),
          'checkout_attribution_evidence_conflict',
        );
        return;
      }
      ensure(
        validated.snapshot.fieldMapId === this.fieldMapPin.id &&
          validated.snapshot.fieldMapSha256 === this.fieldMapPin.sha256,
        'checkout_attribution_binding_conflict',
      );
    });
  }

  async accept(input: {
    attribution: CheckoutAttributionHandoff;
    attemptId: string;
    checkoutEvidenceReference: string;
  }): Promise<CheckoutAttributionAdmissionRow> {
    return this.transaction(async (client) => {
      const checkoutRows = await client.query<CheckoutAdmissionEvidenceRow>(
        `SELECT * FROM business_v2.payment_checkout_admission_evidence
         WHERE scope_sha256=$1 AND caller=$2 AND attempt_id=$3 FOR UPDATE`,
        [this.scopeHash, this.caller, input.attemptId],
      );
      ensure(
        checkoutRows.rowCount === 1 &&
          checkoutRows.rows[0].evidence_reference ===
            input.checkoutEvidenceReference,
        'checkout_attribution_binding_conflict',
      );
      const checkout = checkoutRows.rows[0];
      const attempts = await client.query<{ contract: unknown }>(
        'SELECT contract FROM business_v2.payment_attempts WHERE attempt_id=$1 FOR UPDATE',
        [input.attemptId],
      );
      ensure(attempts.rowCount === 1, 'checkout_attribution_binding_conflict');
      const attempt = validateAttempt(attempts.rows[0].contract);
      const identities = await client.query<{ intent_id: string }>(
        `SELECT intent_id FROM business_v2.payment_identity_preparations
         WHERE caller=$1 AND preparation_id=$2 AND origin_operation_id=$3
           AND receipt_reference=$4 FOR UPDATE`,
        [
          this.caller,
          checkout.identity_preparation_id,
          checkout.identity_origin_operation_id,
          checkout.identity_receipt_reference,
        ],
      );
      ensure(
        identities.rowCount === 1,
        'checkout_attribution_binding_conflict',
      );
      return this.acceptWithClient(client, {
        attribution: input.attribution,
        attempt,
        checkout,
        identityIntentId: identities.rows[0].intent_id,
      });
    });
  }

  private async acceptWithClient(
    client: PoolClient,
    input: {
      attribution: CheckoutAttributionHandoff;
      attempt: PaymentAttempt;
      checkout: CheckoutAdmissionEvidenceRow;
      identityIntentId: string;
    },
  ): Promise<CheckoutAttributionAdmissionRow> {
    const validated = parseCheckoutAttributionHandoff(input.attribution);
    const attempt = validateAttempt(input.attempt);
    const checkout = input.checkout;
    const snapshot = validated.snapshot;
    const binding = validated.binding;
    ensure(
      paymentScopeFingerprint(attempt.scope) === this.scopeHash &&
        checkout.scope_sha256 === this.scopeHash &&
        checkout.caller === this.caller &&
        checkout.attempt_id === attempt.attemptId &&
        binding.attemptReference === attempt.attemptId &&
        binding.intentId === input.identityIntentId &&
        binding.quoteId === attempt.quote.quoteId &&
        binding.quoteFingerprint === attempt.quoteFingerprint &&
        binding.offerKey === attempt.quote.offerKey &&
        binding.catalogVersion === attempt.quote.catalogVersion &&
        binding.bundleVersion === attempt.quote.bundleVersion &&
        binding.deliveryVersion === attempt.quote.deliveryVersion &&
        binding.locale === attempt.quote.locale &&
        binding.country === attempt.quote.country &&
        binding.currency === attempt.quote.currency &&
        binding.originalAmount === attempt.quote.originalAmount &&
        binding.discountAmount === attempt.quote.discountAmount &&
        binding.finalAmount === attempt.quote.finalAmount &&
        binding.discountPolicyReference ===
          attempt.quote.discountPolicyReference &&
        binding.paymentOption === attempt.quote.paymentOption &&
        binding.payerReference === attempt.quote.payerReference &&
        binding.participantReference === attempt.quote.participantReference &&
        binding.termsVersion === attempt.quote.termsVersion &&
        binding.termsAcceptedAt === attempt.quote.acceptedAt &&
        binding.consentBundleReference === attempt.quote.consentReceipt &&
        binding.privacyVersion === checkout.privacy_version &&
        binding.privacyAcknowledgementReference ===
          checkout.privacy_receipt_reference &&
        snapshot.capturedAt <= attempt.quote.acceptedAt,
      'checkout_attribution_binding_conflict',
    );
    const operation = await client.query(
      `SELECT 1 FROM business_v2.payment_status_capabilities
       WHERE caller=$1 AND operation_id=$2 AND attempt_id=$3`,
      [this.caller, binding.attemptOperationReference, attempt.attemptId],
    );
    ensure(operation.rowCount === 1, 'checkout_attribution_binding_conflict');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `payment-checkout-attribution:${this.scopeHash}:${this.caller}:${attempt.attemptId}`,
    ]);
    const prior = await client.query<CheckoutAttributionAdmissionRow>(
      `SELECT * FROM business_v2.payment_checkout_attribution_admissions
       WHERE scope_sha256=$1 AND caller=$2
         AND (operation_id=$3 OR attempt_id=$4 OR snapshot_id=$5
           OR binding_reference=$6) FOR UPDATE`,
      [
        this.scopeHash,
        this.caller,
        checkout.operation_id,
        attempt.attemptId,
        validated.handoff.snapshotId,
        validated.handoff.bindingReference,
      ],
    );
    if (prior.rowCount) {
      const row = prior.rows[0];
      ensure(
        prior.rowCount === 1 &&
          this.exactPrior(
            row,
            validated,
            attempt,
            input.identityIntentId,
            checkout.operation_id,
            checkout.evidence_reference,
          ),
        'checkout_attribution_evidence_conflict',
      );
      return row;
    }
    ensure(
      snapshot.fieldMapId === this.fieldMapPin.id &&
        snapshot.fieldMapSha256 === this.fieldMapPin.sha256,
      'checkout_attribution_binding_conflict',
    );
    const aad = this.binding({
      attemptId: attempt.attemptId,
      snapshotId: validated.handoff.snapshotId,
      bindingReference: validated.handoff.bindingReference,
    });
    const evidenceSha256 = paymentPayloadFingerprint(
      JSON.stringify([
        this.scopeHash,
        this.caller,
        checkout.evidence_reference,
        validated.handoff.snapshotSha256,
        validated.handoff.bindingSha256,
        binding.attemptOperationReference,
      ]),
    );
    const acceptedAt = Number(
      (
        await client.query(
          'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
        )
      ).rows[0].now,
    );
    const inserted = await client.query<CheckoutAttributionAdmissionRow>(
      `INSERT INTO business_v2.payment_checkout_attribution_admissions
       (scope_sha256,caller,operation_id,attempt_id,checkout_evidence_reference,
        snapshot_id,snapshot_sha256,binding_reference,binding_sha256,intent_id,
        attempt_operation_id,quote_id,quote_fingerprint,encrypted_snapshot,
        encrypted_binding,evidence_sha256,evidence_reference,accepted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        this.scopeHash,
        this.caller,
        checkout.operation_id,
        attempt.attemptId,
        checkout.evidence_reference,
        validated.handoff.snapshotId,
        validated.handoff.snapshotSha256,
        validated.handoff.bindingReference,
        validated.handoff.bindingSha256,
        binding.intentId,
        binding.attemptOperationReference,
        binding.quoteId,
        binding.quoteFingerprint,
        this.vault.seal(validated.snapshotJson, `${aad}:snapshot`),
        this.vault.seal(validated.bindingJson, `${aad}:binding`),
        evidenceSha256,
        `checkout-attribution:v1:${evidenceSha256}`,
        acceptedAt,
      ],
    );
    ensure(inserted.rowCount === 1, 'checkout_attribution_write_unknown');
    ensure(
      this.matches(
        inserted.rows[0],
        validated.snapshotJson,
        validated.bindingJson,
      ),
      'checkout_attribution_write_unknown',
    );
    return inserted.rows[0];
  }
}
