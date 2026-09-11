import { createHash, createHmac } from 'node:crypto';

import { z } from 'zod';

import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';

const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const offer = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const boundedName = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const candidate = z
  .object({
    firstName: boundedName,
    lastName: boundedName,
    email: z.string().email().min(3).max(254),
  })
  .strict();
const payer = z.object({ role: z.literal('payer'), candidate }).strict();
const selfParticipant = z
  .object({ role: z.literal('participant'), sameAs: z.literal('payer') })
  .strict();
const otherParticipant = z
  .object({ role: z.literal('participant'), candidate })
  .strict();

const resolveBase = z
  .object({
    schemaVersion: z.literal(1),
    requestId: uuid,
    preparationId: uuid,
    intentId: uuid,
    offerKey: offer,
    payer,
  })
  .strict();
const resolveSchema = z.discriminatedUnion('purchaseRelationship', [
  resolveBase.extend({
    purchaseRelationship: z.literal('self'),
    participant: selfParticipant,
  }),
  resolveBase.extend({
    purchaseRelationship: z.literal('other'),
    participant: otherParticipant,
  }),
]);
const statusSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: uuid,
    preparationId: uuid,
    originOperationId: uuid,
    identityRequestSha256: digest,
  })
  .strict();

export type PaymentIdentityResolveCommand = z.infer<typeof resolveSchema>;
export type PaymentIdentityStatusCommand = z.infer<typeof statusSchema>;

export interface IdentityPreparationReceipt {
  schemaVersion: 1;
  receiptReference: string;
  kind: 'identity_preparation';
  caller: string;
  operationId: string;
  preparationId: string;
  intentId: string;
  offerKey: string;
  purchaseRelationship: 'self' | 'other';
  payerReference: string;
  participantReference: string;
  payerRoleProof: string;
  participantRoleProof: string;
  source: PaymentScope;
}

export type IdentityPreparationResult =
  | {
      schemaVersion: 1;
      status: 'resolved';
      identityPreparationReceipt: IdentityPreparationReceipt;
    }
  | { schemaVersion: 1; status: 'not_found' };

export function parsePaymentIdentityResolveCommand(
  input: unknown,
): PaymentIdentityResolveCommand {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) throw new PaymentDomainError('invalid_identity_request');
  return parsed.data;
}

export function parsePaymentIdentityStatusCommand(
  input: unknown,
): PaymentIdentityStatusCommand {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) throw new PaymentDomainError('invalid_identity_request');
  return parsed.data;
}

export function identityBodySha256(body: Buffer): string {
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > 65536)
    throw new PaymentDomainError('invalid_identity_request');
  return createHash('sha256').update(body).digest('hex');
}

export class PaymentIdentityReferenceIssuer {
  #secret: Buffer;
  readonly source: PaymentScope;
  readonly sourceSha256: string;

  constructor(secret: Buffer, source: PaymentScope) {
    this.#secret = Buffer.from(secret);
    this.sourceSha256 = paymentScopeFingerprint(source);
    this.source = Object.freeze(structuredClone(source));
    if (
      this.#secret.length < 32 ||
      source.provider !== 'adyen' ||
      !['test', 'live'].includes(source.environment) ||
      source.store === null
    )
      throw new PaymentDomainError('invalid_identity_configuration');
  }

  private issue(prefix: string, values: readonly (string | number)[]): string {
    return `${prefix}:v1:${createHmac('sha256', this.#secret)
      .update(JSON.stringify([this.sourceSha256, ...values]))
      .digest('hex')}`;
  }

  party(partyId: number): string {
    if (!Number.isSafeInteger(partyId) || partyId < 1)
      throw new PaymentDomainError('invalid_identity_evidence');
    return this.issue('party-ref', [partyId]);
  }

  role(input: {
    caller: string;
    preparationId: string;
    intentId: string;
    operationId: string;
    offerKey: string;
    relationship: 'self' | 'other';
    role: 'payer' | 'participant';
    partyReference: string;
    interactionId: number;
    requestSha256: string;
  }): string {
    return this.issue('party-role-proof', [
      input.caller,
      input.preparationId,
      input.intentId,
      input.operationId,
      input.offerKey,
      input.relationship,
      input.role,
      input.partyReference,
      input.interactionId,
      input.requestSha256,
    ]);
  }

  receipt(input: {
    caller: string;
    preparationId: string;
    intentId: string;
    operationId: string;
    requestSha256: string;
    payerRoleProof: string;
    participantRoleProof: string;
  }): string {
    return this.issue('identity-preparation', [
      input.caller,
      input.preparationId,
      input.intentId,
      input.operationId,
      input.requestSha256,
      input.payerRoleProof,
      input.participantRoleProof,
    ]);
  }
}
