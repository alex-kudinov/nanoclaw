import { describe, expect, it } from 'vitest';

import {
  GOOGLE_ACCOUNT_CLAIM_AUDIENCE,
  validateGoogleAccountClaimProposal,
} from './google-account-claim-proposal.js';

const proposal = {
  kind: 'google_account_claim_proposal' as const,
  schemaVersion: 1 as const,
  audience: GOOGLE_ACCOUNT_CLAIM_AUDIENCE,
  claimId: '40000000-0000-4000-8000-000000000002',
  googleSubject: {
    issuer: 'https://securetoken.google.com/tandem-identity-dev-2026',
    projectId: 'tandem-identity-dev-2026',
    environment: 'test' as const,
    sourceScope: 'tandem-identity-dev-2026',
    uid: 'firebase-synthetic-cross-repository-uid',
    emailVerified: true as const,
    verifiedEmailSha256: 'a'.repeat(64),
    authenticatedAt: '2026-09-15T01:59:00.000Z',
  },
  heartbeatRef: {
    provider: 'heartbeat' as const,
    environment: 'test' as const,
    scope: 'main-community',
    entityType: 'user' as const,
    externalId: '40000000-0000-4000-8000-000000000001',
  },
  selectedBy: 'explicit_heartbeat_user' as const,
  role: 'participant' as const,
  payerLearnerRelationship: 'self' as const,
  issuedAt: '2026-09-15T02:00:00.000Z',
  expiresAt: '2026-09-15T02:10:00.000Z',
};

const policy = {
  expectedProjectId: 'tandem-identity-dev-2026',
  expectedEnvironment: 'test' as const,
  observedAt: '2026-09-15T02:01:00.000Z',
};

describe('Google account claim proposal validation', () => {
  it('accepts the exact participant-only BFF proposal', () => {
    expect(validateGoogleAccountClaimProposal(proposal, policy)).toMatchObject({
      status: 'accepted',
      reasonCode: 'PROPOSAL_VALID',
      proposal,
    });
  });

  it.each([
    [
      'wrong Google project',
      {
        ...proposal,
        googleSubject: {
          ...proposal.googleSubject,
          projectId: 'other-project',
        },
      },
      policy,
      'GOOGLE_SUBJECT_SCOPE_INVALID',
    ],
    [
      'wrong environment',
      proposal,
      { ...policy, expectedEnvironment: 'development' as const },
      'PROPOSAL_ENVIRONMENT_INVALID',
    ],
    [
      'expired',
      proposal,
      { ...policy, observedAt: '2026-09-15T02:10:00.001Z' },
      'PROPOSAL_TIME_WINDOW_INVALID',
    ],
  ])('rejects %s', (_name, input, validationPolicy, reasonCode) => {
    expect(
      validateGoogleAccountClaimProposal(input, validationPolicy),
    ).toMatchObject({ status: 'rejected', reasonCode });
  });

  it.each([
    ['Party authority', { ...proposal, targetPartyId: 42 }],
    ['conflict authority', { ...proposal, openIdentityConflict: false }],
    ['staff role', { ...proposal, role: 'staff' }],
    [
      'payer role',
      {
        ...proposal,
        role: 'payer',
        payerLearnerRelationship: 'other',
      },
    ],
    ['wrong audience', { ...proposal, audience: 'another-service' }],
  ])('makes %s unrepresentable', (_name, input) => {
    expect(() => validateGoogleAccountClaimProposal(input, policy)).toThrow();
  });
});
