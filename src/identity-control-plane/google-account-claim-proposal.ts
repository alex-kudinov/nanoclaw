import { z } from 'zod';

import { parseOrThrow, ScopedReferenceSchema } from './contracts.js';

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

export const GOOGLE_ACCOUNT_CLAIM_AUDIENCE =
  'tandem-company-os:identity-account-claim';

export const GoogleAccountClaimProposalSchema = z
  .object({
    kind: z.literal('google_account_claim_proposal'),
    schemaVersion: z.literal(1),
    audience: z.literal(GOOGLE_ACCOUNT_CLAIM_AUDIENCE),
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
    heartbeatRef: ScopedReferenceSchema.extend({
      provider: z.literal('heartbeat'),
      environment: z.enum(['development', 'test', 'production']),
      entityType: z.literal('user'),
      externalId: z.string().uuid(),
    }).strict(),
    selectedBy: z.literal('explicit_heartbeat_user'),
    role: z.literal('participant'),
    payerLearnerRelationship: z.literal('self'),
    issuedAt: instant,
    expiresAt: instant,
  })
  .strict();

export type GoogleAccountClaimProposal = z.infer<
  typeof GoogleAccountClaimProposalSchema
>;

export type GoogleAccountClaimProposalPolicy = {
  expectedProjectId: string;
  expectedEnvironment: 'development' | 'test' | 'production';
  observedAt: string;
};

export type GoogleAccountClaimProposalValidation =
  | {
      status: 'accepted';
      reasonCode: 'PROPOSAL_VALID';
      proposal: GoogleAccountClaimProposal;
    }
  | {
      status: 'rejected';
      reasonCode:
        | 'GOOGLE_SUBJECT_SCOPE_INVALID'
        | 'PROPOSAL_ENVIRONMENT_INVALID'
        | 'PROPOSAL_TIME_WINDOW_INVALID';
      proposal: GoogleAccountClaimProposal;
    };

export function validateGoogleAccountClaimProposal(
  input: unknown,
  policy: GoogleAccountClaimProposalPolicy,
): GoogleAccountClaimProposalValidation {
  const proposal = parseOrThrow(GoogleAccountClaimProposalSchema, input);
  const policyObservedAt = Date.parse(policy.observedAt);
  const authenticatedAt = Date.parse(proposal.googleSubject.authenticatedAt);
  const issuedAt = Date.parse(proposal.issuedAt);
  const expiresAt = Date.parse(proposal.expiresAt);
  if (
    proposal.googleSubject.projectId !== policy.expectedProjectId ||
    proposal.googleSubject.sourceScope !== policy.expectedProjectId ||
    proposal.googleSubject.issuer !==
      `https://securetoken.google.com/${policy.expectedProjectId}`
  ) {
    return {
      status: 'rejected',
      reasonCode: 'GOOGLE_SUBJECT_SCOPE_INVALID',
      proposal,
    };
  }
  if (
    proposal.googleSubject.environment !== policy.expectedEnvironment ||
    proposal.heartbeatRef.environment !== policy.expectedEnvironment
  ) {
    return {
      status: 'rejected',
      reasonCode: 'PROPOSAL_ENVIRONMENT_INVALID',
      proposal,
    };
  }
  if (
    !Number.isFinite(policyObservedAt) ||
    authenticatedAt > issuedAt + 60_000 ||
    issuedAt - authenticatedAt > 5 * 60_000 ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 10 * 60_000 ||
    policyObservedAt < issuedAt ||
    policyObservedAt > expiresAt
  ) {
    return {
      status: 'rejected',
      reasonCode: 'PROPOSAL_TIME_WINDOW_INVALID',
      proposal,
    };
  }
  return { status: 'accepted', reasonCode: 'PROPOSAL_VALID', proposal };
}
