import fs from 'node:fs';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { sha256 } from './canonical.js';
import { validateGoogleAccountClaimProposal } from './google-account-claim-proposal.js';
import {
  GOOGLE_SERVICE_ACCOUNT_ISSUER,
  verifyGoogleServiceAccountClaimRequest,
} from './google-service-account-transport.js';

const fixturePath = process.env.TANDEM_IDENTITY_CLAIM_PROPOSAL_FIXTURE;

describe.skipIf(!fixturePath)(
  'Tandem Identity neutral claim-proposal artifact',
  () => {
    it('consumes the exact BFF-produced artifact without a repository copy', () => {
      const bytes = fs.readFileSync(fixturePath!, 'utf8');
      const parsed = JSON.parse(bytes) as unknown;
      expect(
        validateGoogleAccountClaimProposal(parsed, {
          expectedProjectId: 'tandem-identity-dev-2026',
          expectedEnvironment: 'test',
          observedAt: '2026-09-15T02:01:00.000Z',
        }),
      ).toMatchObject({ status: 'accepted', reasonCode: 'PROPOSAL_VALID' });
      expect(sha256(bytes)).toBe(
        '8dc277b4f6bc06e3233329cc64e7bb4708051343686c090d4d259f45ef356c66',
      );
      expect(bytes).not.toContain('@');
      expect(bytes).not.toContain('targetPartyId');
      expect(bytes).not.toContain('candidatePartyIds');
      expect(bytes).not.toContain('openIdentityConflict');
    });

    it('accepts the exact BFF bytes behind a synthetic service identity', async () => {
      const body = fs.readFileSync(fixturePath!);
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const now = Math.floor(Date.now() / 1000);
      const audience =
        'https://company-os.identity.test.invalid/v1/account-claims';
      const principal =
        'tandem-identity-runtime-dev@tandem-identity-dev-2026.iam.gserviceaccount.com';
      const subject = '117037165711000000001';
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
        }),
      ).toString('base64url');
      const unsigned = `${header}.${payload}`;
      const signature = createSign('RSA-SHA256')
        .update(unsigned)
        .sign(privateKey)
        .toString('base64url');

      await expect(
        verifyGoogleServiceAccountClaimRequest({
          idToken: `${unsigned}.${signature}`,
          body,
          certificates: {
            'ephemeral-google-fixture': publicKey.export({
              type: 'spki',
              format: 'pem',
            }) as string,
          },
          transportPolicy: {
            expectedIssuer: GOOGLE_SERVICE_ACCOUNT_ISSUER,
            expectedAudience: audience,
            expectedPrincipalEmail: principal,
            expectedSubject: subject,
            observedAt: new Date().toISOString(),
          },
          proposalPolicy: {
            expectedProjectId: 'tandem-identity-dev-2026',
            expectedEnvironment: 'test',
            observedAt: '2026-09-15T02:01:00.000Z',
          },
        }),
      ).resolves.toMatchObject({
        status: 'accepted',
        proposal: { claimId: '40000000-0000-4000-8000-000000000002' },
      });
    });
  },
);
