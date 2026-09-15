import { z } from 'zod';

import { parseOrThrow, ScopedReferenceSchema } from './contracts.js';
import { sha256Json } from './canonical.js';
import { IdentityControlPlaneError, invariant } from './errors.js';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const instant = z.iso.datetime({ offset: true });
const bounded = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(
      (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
      'IDENTITY_STRING_INVALID',
    );

export const GoogleAccountClaimBodySchema = z
  .object({
    kind: z.literal('google_account_link_claim'),
    schemaVersion: z.literal(1),
    claimId: z.string().uuid(),
    googleSubject: z
      .object({
        issuer: bounded(500),
        projectId: bounded(120),
        environment: z.enum(['development', 'test', 'production']),
        sourceScope: bounded(160),
        uid: bounded(500),
        emailVerified: z.literal(true),
        verifiedEmailSha256: sha256,
        authenticatedAt: instant,
      })
      .strict(),
    heartbeatRef: ScopedReferenceSchema,
    selectedBy: z.literal('explicit_provider_subject'),
    role: z.enum(['participant', 'staff', 'payer']),
    payerLearnerRelationship: z.enum([
      'self',
      'other',
      'not_applicable',
      'unproven',
    ]),
    targetPartyId: z.number().int().positive(),
    issuedAt: instant,
    expiresAt: instant,
    evidenceRefs: z.array(bounded(512)).min(1).max(32),
  })
  .strict();

export type GoogleAccountClaimBody = z.infer<
  typeof GoogleAccountClaimBodySchema
>;

export const GoogleAccountClaimEnvelopeSchema =
  GoogleAccountClaimBodySchema.extend({ payloadSha256: sha256 });

export type GoogleAccountClaimEnvelope = z.infer<
  typeof GoogleAccountClaimEnvelopeSchema
>;

export interface GoogleAccountClaimContext {
  observedAt: string;
  candidatePartyIds: readonly number[];
  sharedIdentifier: boolean;
  openIdentityConflict: boolean;
  explicitSeatRelationship: boolean;
  consumedPayloadSha256?: string | null;
}

const GoogleAccountClaimContextSchema = z
  .object({
    observedAt: instant,
    candidatePartyIds: z.array(z.number().int().positive()).max(100),
    sharedIdentifier: z.boolean(),
    openIdentityConflict: z.boolean(),
    explicitSeatRelationship: z.boolean(),
    consumedPayloadSha256: sha256.nullable().optional(),
  })
  .strict();

export type GoogleAccountClaimResult = {
  kind: 'google_account_claim_result';
  schemaVersion: 1;
  status: 'accepted' | 'held' | 'rejected';
  reasonCode: string;
  claimId: string;
  payloadSha256: string;
  targetPartyId: number | null;
  replay: boolean;
  writesAllowed: false;
};

export function createGoogleAccountClaimEnvelope(
  body: GoogleAccountClaimBody,
): GoogleAccountClaimEnvelope {
  const parsed = parseOrThrow(GoogleAccountClaimBodySchema, body);
  return parseOrThrow(GoogleAccountClaimEnvelopeSchema, {
    ...parsed,
    payloadSha256: sha256Json(parsed),
  });
}

function result(
  claim: GoogleAccountClaimEnvelope,
  status: GoogleAccountClaimResult['status'],
  reasonCode: string,
  targetPartyId: number | null,
  replay = false,
): GoogleAccountClaimResult {
  return {
    kind: 'google_account_claim_result',
    schemaVersion: 1,
    status,
    reasonCode,
    claimId: claim.claimId,
    payloadSha256: claim.payloadSha256,
    targetPartyId,
    replay,
    writesAllowed: false,
  };
}

function exactCandidates(values: readonly number[]): number[] {
  invariant(
    values.every((value) => Number.isSafeInteger(value) && value > 0),
    'GOOGLE_CLAIM_CANDIDATE_PARTY_INVALID',
  );
  return [...new Set(values)].sort((left, right) => left - right);
}

export function evaluateGoogleAccountClaim(
  input: GoogleAccountClaimEnvelope,
  context: GoogleAccountClaimContext,
): GoogleAccountClaimResult {
  const claim = parseOrThrow(GoogleAccountClaimEnvelopeSchema, input);
  const resolvedContext = parseOrThrow(
    GoogleAccountClaimContextSchema,
    context,
  );
  const { payloadSha256: _payloadSha256, ...body } = claim;
  if (
    sha256Json(GoogleAccountClaimBodySchema.parse(body)) !== claim.payloadSha256
  ) {
    throw new IdentityControlPlaneError('GOOGLE_CLAIM_PAYLOAD_HASH_MISMATCH');
  }
  if (resolvedContext.consumedPayloadSha256 != null) {
    if (resolvedContext.consumedPayloadSha256 !== claim.payloadSha256) {
      return result(claim, 'rejected', 'CLAIM_ID_PAYLOAD_CONFLICT', null);
    }
    return result(
      claim,
      'accepted',
      'EXACT_CLAIM_REPLAY_NOOP',
      claim.targetPartyId,
      true,
    );
  }

  const observedAt = Date.parse(resolvedContext.observedAt);
  const authenticatedAt = Date.parse(claim.googleSubject.authenticatedAt);
  const issuedAt = Date.parse(claim.issuedAt);
  const expiresAt = Date.parse(claim.expiresAt);
  invariant(Number.isFinite(observedAt), 'GOOGLE_CLAIM_OBSERVED_AT_INVALID');
  if (
    authenticatedAt > issuedAt ||
    issuedAt - authenticatedAt > 5 * 60 * 1000 ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 10 * 60 * 1000 ||
    observedAt < issuedAt ||
    observedAt > expiresAt
  ) {
    return result(claim, 'rejected', 'CLAIM_TIME_WINDOW_INVALID', null);
  }

  const expectedIssuer = `https://securetoken.google.com/${claim.googleSubject.projectId}`;
  if (
    claim.googleSubject.issuer !== expectedIssuer ||
    claim.googleSubject.sourceScope !== claim.googleSubject.projectId
  ) {
    return result(claim, 'rejected', 'GOOGLE_SUBJECT_SCOPE_INVALID', null);
  }
  if (
    claim.heartbeatRef.provider !== 'heartbeat' ||
    claim.heartbeatRef.entityType !== 'user' ||
    claim.heartbeatRef.environment !== claim.googleSubject.environment
  ) {
    return result(claim, 'rejected', 'PROVIDER_SCOPE_INVALID', null);
  }

  const candidates = exactCandidates(resolvedContext.candidatePartyIds);
  if (
    resolvedContext.sharedIdentifier ||
    resolvedContext.openIdentityConflict ||
    candidates.length !== 1 ||
    candidates[0] !== claim.targetPartyId
  ) {
    return result(claim, 'held', 'IDENTITY_CONFLICT_OR_AMBIGUITY', null);
  }
  if (
    (claim.role === 'staff' &&
      claim.payerLearnerRelationship !== 'not_applicable') ||
    (claim.role === 'participant' &&
      claim.payerLearnerRelationship !== 'self') ||
    (claim.role === 'payer' &&
      (claim.payerLearnerRelationship !== 'self' ||
        !resolvedContext.explicitSeatRelationship))
  ) {
    return result(claim, 'held', 'PAYER_LEARNER_ROLE_UNPROVEN', null);
  }

  return result(
    claim,
    'accepted',
    'EXPLICIT_ACCOUNT_CLAIM_ACCEPTED',
    claim.targetPartyId,
  );
}
