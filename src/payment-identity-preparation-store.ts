import { createHmac } from 'node:crypto';

import type { PoolClient } from 'pg';
import { z } from 'zod';

import {
  prepareCheckoutCustomerIdentityRequest,
  resolveCheckoutCustomerIdentityWithClient,
  type CheckoutIdentityResolveRequest,
  type CheckoutIdentityResolveResult,
} from './checkout-customer-identity.js';
import {
  PaymentIdentityReferenceIssuer,
  parsePaymentIdentityResolveCommand,
  parsePaymentIdentityStatusCommand,
  type IdentityPreparationReceipt,
  type IdentityPreparationResult,
  type PaymentIdentityResolveCommand,
  type PaymentIdentityStatusCommand,
} from './payment-identity-preparation.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import {
  checkoutBillingProfileSha256,
  parseCheckoutBillingProfile,
  type CheckoutBillingProfile,
} from './payment-checkout-billing.js';
import type { PaymentPayloadVault } from './payment-payload-vault.js';
import type { VerifiedPaymentRequest } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

type IdentityResolver = typeof resolveCheckoutCustomerIdentityWithClient;
type IdentityRow = {
  preparation_id: string;
  caller: string;
  origin_operation_id: string;
  intent_id: string;
  offer_key: string;
  purchase_relationship: 'self' | 'other';
  identity_request_sha256: string;
  source: PaymentScope;
  source_sha256: string;
  payer_party_id: string;
  participant_party_id: string;
  payer_interaction_id: string;
  participant_interaction_id: string;
  payer_reference: string;
  participant_reference: string;
  payer_role_proof: string;
  participant_role_proof: string;
  payer_existing_stripe_customer_id: string | null;
  participant_existing_stripe_customer_id: string | null;
  receipt_reference: string;
  resolved_at: string;
  billing_profile_sha256: string | null;
  encrypted_billing_profile: string | null;
};

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const callerSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

export class PaymentIdentityPreparationStore {
  #identitySecret: string;
  #tokenSecret: Buffer;

  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    private readonly issuer: PaymentIdentityReferenceIssuer,
    identitySecret: string,
    tokenSecret: Buffer,
    private readonly resolver: IdentityResolver = resolveCheckoutCustomerIdentityWithClient,
    private readonly vault?: PaymentPayloadVault,
  ) {
    this.#identitySecret = identitySecret;
    this.#tokenSecret = Buffer.from(tokenSecret);
    if (
      typeof transaction !== 'function' ||
      !callerSchema.safeParse(caller).success ||
      identitySecret.length < 32 ||
      this.#tokenSecret.length < 32 ||
      typeof resolver !== 'function'
    )
      throw new PaymentDomainError('invalid_identity_configuration');
  }

  private async now(client: PoolClient): Promise<number> {
    const result = await client.query<{ now: string }>(
      'SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now',
    );
    return Number(result.rows[0].now);
  }

  private async durable<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.transaction(work);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : '';
        if (!['40001', '40P01'].includes(code) || attempt >= 2) throw error;
      }
    }
  }

  private async assertAdmission(
    client: PoolClient,
    admitted: VerifiedPaymentRequest,
  ): Promise<void> {
    ensure(admitted.caller === this.caller, 'identity_scope_denied');
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

  private async fence(
    client: PoolClient,
    caller: string,
    operationId: string,
    preparationId: string,
  ): Promise<void> {
    const locks = [
      `payment-identity-operation:${caller}:${operationId}`,
      `payment-identity-preparation:${caller}:${preparationId}`,
    ].sort();
    for (const lock of locks)
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [lock],
      );
  }

  private checkoutToken(preparationId: string, role: string): string {
    return createHmac('sha256', this.#tokenSecret)
      .update(`${this.caller}\0${preparationId}\0${role}`)
      .digest('hex')
      .slice(0, 32);
  }

  private roleRequest(
    command: PaymentIdentityResolveCommand,
    role: 'payer' | 'participant',
    observedAt: string,
  ): CheckoutIdentityResolveRequest {
    const candidate =
      role === 'payer'
        ? command.payer.candidate
        : command.purchaseRelationship === 'other'
          ? command.participant.candidate
          : command.payer.candidate;
    const prepared = prepareCheckoutCustomerIdentityRequest(
      {
        schema_version: 1,
        request_kind: 'checkout.identity.resolve',
        source_request_key: `identity:${this.caller}:${command.preparationId}:${role}`,
        observed_at: observedAt,
        checkout_token: this.checkoutToken(command.preparationId, role),
        email: candidate.email,
        first_name: candidate.firstName,
        last_name: candidate.lastName,
        product_slug: command.offerKey,
      },
      this.#identitySecret,
    );
    ensure(
      prepared.kind === 'checkout.identity.resolve',
      'invalid_identity_request',
    );
    return prepared;
  }

  private receipt(row: IdentityRow): IdentityPreparationReceipt {
    ensure(
      paymentScopeFingerprint(row.source) === row.source_sha256 &&
        row.source_sha256 === this.issuer.sourceSha256,
      'identity_evidence_corrupt',
    );
    return Object.freeze({
      schemaVersion: 1,
      receiptReference: row.receipt_reference,
      kind: 'identity_preparation',
      caller: row.caller,
      operationId: row.origin_operation_id,
      preparationId: row.preparation_id,
      intentId: row.intent_id,
      offerKey: row.offer_key,
      purchaseRelationship: row.purchase_relationship,
      payerReference: row.payer_reference,
      participantReference: row.participant_reference,
      payerRoleProof: row.payer_role_proof,
      participantRoleProof: row.participant_role_proof,
      source: Object.freeze(structuredClone(row.source)),
    });
  }

  private resolved(row: IdentityRow): IdentityPreparationResult {
    return Object.freeze({
      schemaVersion: 1,
      status: 'resolved',
      identityPreparationReceipt: this.receipt(row),
    });
  }

  async resolve(input: {
    command: PaymentIdentityResolveCommand;
    identityRequestSha256: string;
    admitted: VerifiedPaymentRequest;
  }): Promise<IdentityPreparationResult> {
    const command = parsePaymentIdentityResolveCommand(input.command);
    ensure(
      !command.billingProfile || this.vault !== undefined,
      'invalid_identity_configuration',
    );
    digest.parse(input.identityRequestSha256);
    ensure(
      command.requestId === input.admitted.operationId,
      'identity_operation_conflict',
    );
    return this.durable(async (client) => {
      await this.assertAdmission(client, input.admitted);
      await this.fence(
        client,
        this.caller,
        command.requestId,
        command.preparationId,
      );
      const prior = await client.query<IdentityRow>(
        `SELECT * FROM business_v2.payment_identity_preparations
         WHERE caller=$2 AND (preparation_id=$1 OR origin_operation_id=$3
            OR intent_id=$4)
         FOR UPDATE`,
        [
          command.preparationId,
          this.caller,
          command.requestId,
          command.intentId,
        ],
      );
      if (prior.rowCount) {
        ensure(prior.rowCount === 1, 'identity_operation_conflict');
        const row = prior.rows[0];
        ensure(
          row.caller === this.caller &&
            row.preparation_id === command.preparationId &&
            row.origin_operation_id === command.requestId &&
            row.intent_id === command.intentId &&
            row.offer_key === command.offerKey &&
            row.purchase_relationship === command.purchaseRelationship &&
            row.identity_request_sha256 === input.identityRequestSha256 &&
            row.source_sha256 === this.issuer.sourceSha256,
          'identity_operation_conflict',
        );
        return this.resolved(row);
      }

      const resolvedAt = await this.now(client);
      const observedAt = new Date(resolvedAt).toISOString();
      const payer = await this.resolver({
        client,
        request: this.roleRequest(command, 'payer', observedAt),
        identitySecret: this.#identitySecret,
      });
      const participant: CheckoutIdentityResolveResult =
        command.purchaseRelationship === 'self'
          ? payer
          : await this.resolver({
              client,
              request: this.roleRequest(command, 'participant', observedAt),
              identitySecret: this.#identitySecret,
            });
      ensure(
        (command.purchaseRelationship === 'self') ===
          (payer.partyId === participant.partyId),
        'identity_relationship_conflict',
      );
      const payerReference = this.issuer.party(payer.partyId);
      const participantReference = this.issuer.party(participant.partyId);
      const common = {
        caller: this.caller,
        preparationId: command.preparationId,
        intentId: command.intentId,
        operationId: command.requestId,
        offerKey: command.offerKey,
        relationship: command.purchaseRelationship,
        requestSha256: input.identityRequestSha256,
      } as const;
      const payerRoleProof = this.issuer.role({
        ...common,
        role: 'payer',
        partyReference: payerReference,
        interactionId: payer.interactionId,
      });
      const participantRoleProof = this.issuer.role({
        ...common,
        role: 'participant',
        partyReference: participantReference,
        interactionId: participant.interactionId,
      });
      const receiptReference = this.issuer.receipt({
        caller: this.caller,
        preparationId: command.preparationId,
        intentId: command.intentId,
        operationId: command.requestId,
        requestSha256: input.identityRequestSha256,
        payerRoleProof,
        participantRoleProof,
      });
      const inserted = await client.query<IdentityRow>(
        `INSERT INTO business_v2.payment_identity_preparations
         (preparation_id,caller,origin_operation_id,intent_id,offer_key,
          purchase_relationship,identity_request_sha256,source,source_sha256,
          payer_party_id,participant_party_id,payer_interaction_id,
          participant_interaction_id,payer_reference,participant_reference,
          payer_role_proof,participant_role_proof,
          payer_existing_stripe_customer_id,
          participant_existing_stripe_customer_id,receipt_reference,resolved_at,
          billing_profile_sha256,encrypted_billing_profile)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,
                $16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          command.preparationId,
          this.caller,
          command.requestId,
          command.intentId,
          command.offerKey,
          command.purchaseRelationship,
          input.identityRequestSha256,
          JSON.stringify(this.issuer.source),
          this.issuer.sourceSha256,
          payer.partyId,
          participant.partyId,
          payer.interactionId,
          participant.interactionId,
          payerReference,
          participantReference,
          payerRoleProof,
          participantRoleProof,
          payer.stripeCustomerId,
          participant.stripeCustomerId,
          receiptReference,
          resolvedAt,
          command.billingProfile
            ? checkoutBillingProfileSha256(command.billingProfile)
            : null,
          command.billingProfile && this.vault
            ? this.vault.seal(
                JSON.stringify(command.billingProfile),
                `${command.preparationId}:billing-profile`,
              )
            : null,
        ],
      );
      ensure(inserted.rowCount === 1, 'identity_write_unknown');
      return this.resolved(inserted.rows[0]);
    });
  }

  async status(input: {
    command: PaymentIdentityStatusCommand;
    admitted: VerifiedPaymentRequest;
  }): Promise<IdentityPreparationResult> {
    const command = parsePaymentIdentityStatusCommand(input.command);
    ensure(
      command.requestId === input.admitted.operationId,
      'identity_operation_conflict',
    );
    return this.durable(async (client) => {
      await this.assertAdmission(client, input.admitted);
      await this.fence(
        client,
        this.caller,
        command.originOperationId,
        command.preparationId,
      );
      const result = await client.query<IdentityRow>(
        `SELECT * FROM business_v2.payment_identity_preparations
         WHERE caller=$1 AND preparation_id=$2 AND origin_operation_id=$3
           AND identity_request_sha256=$4 AND source_sha256=$5`,
        [
          this.caller,
          command.preparationId,
          command.originOperationId,
          command.identityRequestSha256,
          this.issuer.sourceSha256,
        ],
      );
      return result.rowCount === 1
        ? this.resolved(result.rows[0])
        : Object.freeze({ schemaVersion: 1, status: 'not_found' });
    });
  }

  /** Host-only seam for later restricted promotion policy. Never expose publicly. */
  async readPrivateBindings(preparationId: string): Promise<{
    payerPartyId: number;
    participantPartyId: number;
    payerExistingStripeCustomerId: string | null;
    participantExistingStripeCustomerId: string | null;
    billingProfile: CheckoutBillingProfile | null;
  } | null> {
    if (!z.uuid().safeParse(preparationId).success)
      throw new PaymentDomainError('invalid_identity_request');
    return this.durable(async (client) => {
      const result = await client.query<IdentityRow>(
        `SELECT * FROM business_v2.payment_identity_preparations
         WHERE caller=$1 AND preparation_id=$2 AND source_sha256=$3`,
        [this.caller, preparationId, this.issuer.sourceSha256],
      );
      if (result.rowCount !== 1) return null;
      const row = result.rows[0];
      if (
        (row.billing_profile_sha256 === null) !==
        (row.encrypted_billing_profile === null)
      )
        throw new PaymentDomainError('identity_evidence_corrupt');
      let billingProfile: CheckoutBillingProfile | null = null;
      if (row.encrypted_billing_profile) {
        ensure(this.vault !== undefined, 'identity_evidence_corrupt');
        billingProfile = parseCheckoutBillingProfile(
          JSON.parse(
            this.vault.open(
              row.encrypted_billing_profile,
              `${preparationId}:billing-profile`,
            ),
          ),
        );
      }
      if (
        billingProfile &&
        checkoutBillingProfileSha256(billingProfile) !==
          row.billing_profile_sha256
      )
        throw new PaymentDomainError('identity_evidence_corrupt');
      return {
        payerPartyId: Number(row.payer_party_id),
        participantPartyId: Number(row.participant_party_id),
        payerExistingStripeCustomerId: row.payer_existing_stripe_customer_id,
        participantExistingStripeCustomerId:
          row.participant_existing_stripe_customer_id,
        billingProfile,
      };
    });
  }
}
