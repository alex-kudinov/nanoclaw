import { describe, expect, it } from 'vitest';

import { sha256Json } from './canonical.js';
import type { ScopedReference } from './contracts.js';
import {
  createGoogleAccountClaimEnvelope,
  evaluateGoogleAccountClaim,
  type GoogleAccountClaimBody,
  type GoogleAccountClaimContext,
} from './google-account-claim.js';
import { proofActionFromDecision, resolveIdentity } from './resolver.js';

const AT = '2026-09-15T00:00:00.000Z';
const heartbeatRef: ScopedReference = {
  provider: 'heartbeat',
  environment: 'test',
  scope: 'main-community',
  entityType: 'user',
  externalId: '00000000-0000-4000-8000-000000000002',
};

function body(
  overrides: Partial<GoogleAccountClaimBody> = {},
): GoogleAccountClaimBody {
  return {
    kind: 'google_account_link_claim',
    schemaVersion: 1,
    claimId: '10000000-0000-4000-8000-000000000001',
    googleSubject: {
      issuer: 'https://securetoken.google.com/tandem-identity-dev-2026',
      projectId: 'tandem-identity-dev-2026',
      environment: 'test',
      sourceScope: 'tandem-identity-dev-2026',
      uid: 'firebase-fixture-uid',
      emailVerified: true,
      verifiedEmailSha256: 'a'.repeat(64),
      authenticatedAt: '2026-09-14T23:59:00.000Z',
    },
    heartbeatRef,
    selectedBy: 'explicit_provider_subject',
    role: 'participant',
    payerLearnerRelationship: 'self',
    targetPartyId: 42,
    issuedAt: AT,
    expiresAt: '2026-09-15T00:10:00.000Z',
    evidenceRefs: [
      'receipt:google-session',
      'receipt:explicit-heartbeat-selection',
    ],
    ...overrides,
  };
}

function context(
  overrides: Partial<GoogleAccountClaimContext> = {},
): GoogleAccountClaimContext {
  return {
    observedAt: '2026-09-15T00:01:00.000Z',
    candidatePartyIds: [42],
    sharedIdentifier: false,
    openIdentityConflict: false,
    explicitSeatRelationship: false,
    ...overrides,
  };
}

describe('Google account claim dark evaluator', () => {
  it('keeps the C02-shaped subject held before a claim and resolves only after acceptance', () => {
    const event = {
      kind: 'identity_event_envelope' as const,
      schemaVersion: 1,
      receiptId: '20000000-0000-4000-8000-000000000001',
      adapterKey: 'heartbeat-main',
      manifestVersion: 1,
      sourceRef: heartbeatRef,
      eventType: 'USER_UPDATE',
      deduplicationKey: 'c02-shaped-fixture',
      receivedAt: AT,
      authenticity: 'verified' as const,
      payloadSha256: 'b'.repeat(64),
    };
    const request = {
      event,
      decisionId: '20000000-0000-4000-8000-000000000002',
      resolverVersion: 'd0-v1',
      createdAt: AT,
      candidatePartyIds: [42],
      stageIfUnresolved: true,
    };
    const before = resolveIdentity(request, {
      externalReferences: [],
      acceptedSubjects: [],
      mergeLineage: {},
    });
    expect(before.status).toBe('ambiguous');
    expect(proofActionFromDecision(before)).toBe('hold_heartbeat_party_link');

    const claim = createGoogleAccountClaimEnvelope(body());
    const accepted = evaluateGoogleAccountClaim(claim, context());
    expect(accepted).toMatchObject({
      status: 'accepted',
      reasonCode: 'EXPLICIT_ACCOUNT_CLAIM_ACCEPTED',
      targetPartyId: 42,
      replay: false,
      writesAllowed: false,
    });
    const after = resolveIdentity(
      { ...request, candidatePartyIds: [] },
      {
        externalReferences: [],
        acceptedSubjects: [
          { reference: heartbeatRef, partyId: 42, kind: 'accepted_claim' },
        ],
        mergeLineage: {},
      },
    );
    expect(after).toMatchObject({
      status: 'resolved_claim_or_operation',
      partyId: 42,
      resolutionBasis: 'accepted_claim',
    });
    expect(proofActionFromDecision(after)).toBe('exact_reference_noop');
  });

  it('makes exact consumed replay a no-op and rejects altered claim-ID reuse', () => {
    const claim = createGoogleAccountClaimEnvelope(body());
    expect(
      evaluateGoogleAccountClaim(
        claim,
        context({ consumedPayloadSha256: claim.payloadSha256 }),
      ),
    ).toMatchObject({
      status: 'accepted',
      reasonCode: 'EXACT_CLAIM_REPLAY_NOOP',
      replay: true,
    });
    const altered = createGoogleAccountClaimEnvelope(
      body({ evidenceRefs: ['receipt:altered'] }),
    );
    expect(
      evaluateGoogleAccountClaim(
        altered,
        context({ consumedPayloadSha256: claim.payloadSha256 }),
      ),
    ).toMatchObject({
      status: 'rejected',
      reasonCode: 'CLAIM_ID_PAYLOAD_CONFLICT',
      targetPartyId: null,
    });
  });

  it.each([
    ['expired', body({ expiresAt: '2026-09-15T00:00:30.000Z' }), context()],
    [
      'wrong issuer',
      body({
        googleSubject: {
          ...body().googleSubject,
          issuer: 'https://securetoken.google.com/other-project',
        },
      }),
      context(),
    ],
    [
      'cross environment',
      body({
        heartbeatRef: { ...heartbeatRef, environment: 'production' },
      }),
      context(),
    ],
    ['shared identifier', body(), context({ sharedIdentifier: true })],
    ['party conflict', body(), context({ candidatePartyIds: [42, 43] })],
    ['open exception', body(), context({ openIdentityConflict: true })],
    [
      'payer learner unknown',
      body({ role: 'payer', payerLearnerRelationship: 'unproven' }),
      context(),
    ],
  ])(
    'holds or rejects %s without a target Party',
    (_name, claimBody, claimContext) => {
      const decision = evaluateGoogleAccountClaim(
        createGoogleAccountClaimEnvelope(claimBody),
        claimContext,
      );
      expect(['held', 'rejected']).toContain(decision.status);
      expect(decision.targetPartyId).toBeNull();
      expect(decision.writesAllowed).toBe(false);
    },
  );

  it('rejects email-only selection at the strict shape boundary', () => {
    const claim = createGoogleAccountClaimEnvelope(body()) as unknown as Record<
      string,
      unknown
    >;
    expect(() =>
      evaluateGoogleAccountClaim(
        { ...claim, selectedBy: 'email_match' } as never,
        context(),
      ),
    ).toThrow();
  });

  it('rejects an incomplete caller conflict context instead of defaulting guards off', () => {
    const claim = createGoogleAccountClaimEnvelope(body());
    const incomplete = {
      observedAt: '2026-09-15T00:01:00.000Z',
      candidatePartyIds: [42],
    };
    expect(() =>
      evaluateGoogleAccountClaim(claim, incomplete as never),
    ).toThrow();
  });

  it('binds the payload hash to every claim field', () => {
    const claim = createGoogleAccountClaimEnvelope(body());
    expect(claim.payloadSha256).toBe(sha256Json(body()));
    expect(() =>
      evaluateGoogleAccountClaim({ ...claim, role: 'staff' }, context()),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_CLAIM_PAYLOAD_HASH_MISMATCH' }),
    );
  });
});
