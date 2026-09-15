import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  GOOGLE_SERVICE_ACCOUNT_BODY_MAX_BYTES,
  GOOGLE_SERVICE_ACCOUNT_ISSUER,
  verifyGoogleServiceAccountClaimRequest,
} from './google-service-account-transport.js';

const audience = 'https://company-os.identity.test.invalid/v1/account-claims';
const principal =
  'tandem-identity-runtime-dev@tandem-identity-dev-2026.iam.gserviceaccount.com';
const subject = '117037165711000000001';
const proposal = {
  kind: 'google_account_claim_proposal',
  schemaVersion: 1,
  audience: 'tandem-company-os:identity-account-claim',
  claimId: '40000000-0000-4000-8000-000000000002',
  googleSubject: {
    issuer: 'https://securetoken.google.com/tandem-identity-dev-2026',
    projectId: 'tandem-identity-dev-2026',
    environment: 'test',
    sourceScope: 'tandem-identity-dev-2026',
    uid: 'firebase-synthetic-cross-repository-uid',
    emailVerified: true,
    verifiedEmailSha256:
      'a905ebe662b7385d1b3c25adf6f5f252dde2a3b456c93d81f11aac822b2f7083',
    authenticatedAt: '2026-09-15T01:59:00.000Z',
  },
  heartbeatRef: {
    provider: 'heartbeat',
    environment: 'test',
    scope: 'main-community',
    entityType: 'user',
    externalId: '40000000-0000-4000-8000-000000000001',
  },
  selectedBy: 'explicit_heartbeat_user',
  role: 'participant',
  payerLearnerRelationship: 'self',
  issuedAt: '2026-09-15T02:00:00.000Z',
  expiresAt: '2026-09-15T02:10:00.000Z',
};

type TokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  iat: number;
  exp: number;
};

function ephemeralIssuer() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privateKey,
    certificates: {
      'ephemeral-google-fixture': publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string,
    },
  };
}

function signToken(
  privateKey: KeyObject,
  overrides: Partial<TokenClaims> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'ephemeral-google-fixture',
    }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: GOOGLE_SERVICE_ACCOUNT_ISSUER,
      aud: audience,
      sub: subject,
      email: principal,
      email_verified: true,
      iat: now - 5,
      exp: now + 595,
      ...overrides,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey)
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

function request(
  overrides: {
    tokenClaims?: Partial<TokenClaims>;
    body?: Uint8Array;
    idToken?: string;
    expectedAudience?: string;
    expectedPrincipal?: string;
    expectedSubject?: string;
    certificates?: Record<string, string>;
  } = {},
) {
  const issuer = ephemeralIssuer();
  const now = new Date().toISOString();
  return verifyGoogleServiceAccountClaimRequest({
    idToken:
      overrides.idToken ?? signToken(issuer.privateKey, overrides.tokenClaims),
    body: overrides.body ?? Buffer.from(JSON.stringify(proposal)),
    certificates: overrides.certificates ?? issuer.certificates,
    transportPolicy: {
      expectedIssuer: 'https://accounts.google.com' as const,
      expectedAudience: overrides.expectedAudience ?? audience,
      expectedPrincipalEmail: overrides.expectedPrincipal ?? principal,
      expectedSubject: overrides.expectedSubject ?? subject,
      observedAt: now,
    },
    proposalPolicy: {
      expectedProjectId: 'tandem-identity-dev-2026',
      expectedEnvironment: 'test',
      observedAt: '2026-09-15T02:01:00.000Z',
    },
  });
}

describe('Google service-account claim transport', () => {
  it('accepts only the injected issuer, audience, principal and immutable subject', async () => {
    await expect(request()).resolves.toMatchObject({
      status: 'accepted',
      reasonCode: 'SERVICE_IDENTITY_VALID',
      proposal: { claimId: proposal.claimId },
      identity: {
        issuer: GOOGLE_SERVICE_ACCOUNT_ISSUER,
        audience,
        principalEmail: principal,
        subject,
      },
    });
  });

  it.each([
    ['wrong issuer', { tokenClaims: { iss: 'https://issuer.invalid' } }],
    ['wrong audience', { tokenClaims: { aud: 'https://other.invalid' } }],
    ['wrong principal', { tokenClaims: { email: 'other@example.invalid' } }],
    ['unverified principal', { tokenClaims: { email_verified: false } }],
    [
      'wrong immutable subject',
      { tokenClaims: { sub: '117037165711000000099' } },
    ],
  ])('rejects %s', async (_name, overrides) => {
    await expect(request(overrides)).resolves.toMatchObject({
      status: 'rejected',
    });
  });

  it('rejects expired and future tokens outside the stricter application window', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      request({ tokenClaims: { iat: now - 300, exp: now - 61 } }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'SERVICE_TOKEN_TIME_INVALID',
    });
    await expect(
      request({ tokenClaims: { iat: now + 61, exp: now + 600 } }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'SERVICE_TOKEN_TIME_INVALID',
    });
  });

  it('rejects a token whose trusted certificate does not match its signature', async () => {
    const signingIssuer = ephemeralIssuer();
    const otherIssuer = ephemeralIssuer();
    await expect(
      request({
        idToken: signToken(signingIssuer.privateKey),
        certificates: otherIssuer.certificates,
      }),
    ).resolves.toEqual({
      status: 'rejected',
      reasonCode: 'SERVICE_IDENTITY_INVALID',
    });
  });

  it.each([
    ['missing token', { idToken: '' }, 'SERVICE_TOKEN_MISSING'],
    ['malformed body', { body: Buffer.from('{') }, 'SERVICE_BODY_INVALID'],
    [
      'oversized body',
      { body: Buffer.alloc(GOOGLE_SERVICE_ACCOUNT_BODY_MAX_BYTES + 1) },
      'SERVICE_BODY_TOO_LARGE',
    ],
    [
      'authority-bearing body',
      { body: Buffer.from(JSON.stringify({ ...proposal, targetPartyId: 42 })) },
      'SERVICE_PROPOSAL_INVALID',
    ],
  ])(
    'rejects %s before Company OS derivation',
    async (_name, overrides, reasonCode) => {
      await expect(request(overrides)).resolves.toEqual({
        status: 'rejected',
        reasonCode,
      });
    },
  );
});
