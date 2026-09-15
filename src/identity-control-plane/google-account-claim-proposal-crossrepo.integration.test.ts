import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { sha256 } from './canonical.js';
import { validateGoogleAccountClaimProposal } from './google-account-claim-proposal.js';

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
  },
);
