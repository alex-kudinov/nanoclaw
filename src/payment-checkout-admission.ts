import { createHash, createHmac } from 'node:crypto';

import { z } from 'zod';

import { checkoutAttributionHandoffSchema } from './payment-checkout-attribution.js';
import { PaymentDomainError, type PaymentScope } from './payment-domain.js';

const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const documentEvidence = z
  .object({
    version: ref,
    contentSha256: digest,
    receiptReference: ref,
    acceptedAt: time,
  })
  .strict();
const mandateEvidence = documentEvidence
  .extend({
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    frequency: z.literal('one_time'),
    secCode: z.literal('WEB'),
  })
  .strict();
const commandSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: uuid,
    attemptId: uuid,
    quoteId: uuid,
    quoteFingerprint: digest,
    identity: z
      .object({
        preparationId: uuid,
        originOperationId: uuid,
        receiptReference: ref.regex(/^identity-preparation:/),
        payerReference: ref.regex(/^party-ref:/),
        participantReference: ref.regex(/^party-ref:/),
        payerRoleProof: ref.regex(/^party-role-proof:/),
        participantRoleProof: ref.regex(/^party-role-proof:/),
        purchaseRelationship: z.enum(['self', 'other']),
      })
      .strict(),
    consentBundle: z
      .object({
        bundleReceiptReference: ref,
        enrollmentTerms: documentEvidence,
        privacy: documentEvidence,
        achMandate: mandateEvidence.nullable(),
      })
      .strict(),
    attribution: checkoutAttributionHandoffSchema.optional(),
  })
  .strict();

export type PaymentCheckoutAdmissionCommand = z.infer<typeof commandSchema>;

export interface CheckoutAdmissionEvidenceReceipt {
  schemaVersion: 1;
  evidenceReference: string;
  kind: 'checkout_admission_evidence';
  caller: string;
  operationId: string;
  attemptId: string;
  quoteId: string;
  quoteFingerprint: string;
  identityReceiptReference: string;
  consentBundleReceiptReference: string;
  source: PaymentScope;
}

export interface CheckoutDocumentPolicy {
  kind: 'enrollment_terms' | 'privacy' | 'ach_mandate';
  version: string;
  contentSha256: string;
  effectiveFrom: number;
  effectiveTo: number | null;
}

export function parsePaymentCheckoutAdmissionCommand(
  input: unknown,
): PaymentCheckoutAdmissionCommand {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    throw new PaymentDomainError('invalid_checkout_admission_request');
  const value = parsed.data;
  if (
    value.identity.payerRoleProof === value.identity.participantRoleProof ||
    (value.identity.purchaseRelationship === 'self') !==
      (value.identity.payerReference === value.identity.participantReference) ||
    value.consentBundle.enrollmentTerms.acceptedAt !==
      value.consentBundle.privacy.acceptedAt
  )
    throw new PaymentDomainError('invalid_checkout_admission_request');
  return value;
}

export function checkoutAdmissionBodySha256(body: Buffer): string {
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > 65536)
    throw new PaymentDomainError('invalid_checkout_admission_request');
  return createHash('sha256').update(body).digest('hex');
}

export class CheckoutAdmissionEvidenceIssuer {
  #secret: Buffer;
  constructor(secret: Buffer) {
    this.#secret = Buffer.from(secret);
    if (this.#secret.length < 32)
      throw new PaymentDomainError('invalid_checkout_admission_configuration');
  }
  issue(values: readonly string[]): string {
    return `checkout-admission:v1:${createHmac('sha256', this.#secret)
      .update(JSON.stringify(values))
      .digest('hex')}`;
  }
}

export function validateCheckoutDocumentPolicies(
  input: readonly CheckoutDocumentPolicy[],
): readonly CheckoutDocumentPolicy[] {
  const schema = z
    .array(
      z
        .object({
          kind: z.enum(['enrollment_terms', 'privacy', 'ach_mandate']),
          version: ref,
          contentSha256: digest,
          effectiveFrom: time,
          effectiveTo: time.nullable(),
        })
        .strict(),
    )
    .min(2)
    .max(50);
  const parsed = schema.safeParse(input);
  if (
    !parsed.success ||
    new Set(
      parsed.data.map(
        (policy) =>
          `${policy.kind}\0${policy.version}\0${policy.contentSha256}`,
      ),
    ).size !== parsed.data.length ||
    parsed.data.some(
      (policy) =>
        policy.effectiveTo !== null &&
        policy.effectiveTo <= policy.effectiveFrom,
    ) ||
    !parsed.data.some((policy) => policy.kind === 'enrollment_terms') ||
    !parsed.data.some((policy) => policy.kind === 'privacy')
  )
    throw new PaymentDomainError('invalid_checkout_admission_configuration');
  return Object.freeze(parsed.data.map((policy) => Object.freeze(policy)));
}
