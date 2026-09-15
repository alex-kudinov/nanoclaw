import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  GoogleServiceCallerVerifier,
  lookupLoginToolsBindingWithClient,
  type LoginToolsGatewayPolicy,
} from './login-tools-gateway.js';

const policy: LoginToolsGatewayPolicy = {
  projectId: 'tandem-identity-dev-2026',
  environment: 'development',
  pilotPartyId: 10069,
  pilotEmailSha256:
    '929e062a5f6c3a1708d539ddebfaf7b05d4fbceb009de8b8362b748bb3a5cf81',
};

const request = {
  kind: 'tandem_identity_binding_lookup' as const,
  schemaVersion: 1 as const,
  projectId: policy.projectId,
  uid: 'firebase-owner-pilot-uid',
  verifiedEmailSha256: policy.pilotEmailSha256,
};

function clientWith(input: {
  account?: {
    party_id: string | null;
    account_state: string;
    binding_basis: string;
  };
  entitlements?: Array<{
    component_state: string;
    component_version: number;
    enrollment_state: string;
    valid_from: string;
    valid_until: string | null;
  }>;
}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM business_v2.auth_accounts')) {
        return input.account
          ? { rowCount: 1, rows: [input.account] }
          : { rowCount: 0, rows: [] };
      }
      if (sql.includes('student_component_entitlements')) {
        return {
          rowCount: input.entitlements?.length ?? 0,
          rows: input.entitlements ?? [],
        };
      }
      throw new Error('unexpected query');
    }),
  } as unknown as PoolClient;
}

describe('login tools gateway', () => {
  it('returns unbound without an accepted exact auth subject', async () => {
    const client = clientWith({});
    await expect(
      lookupLoginToolsBindingWithClient({
        client,
        request,
        policy,
        observedAt: '2026-09-15T21:45:00.000Z',
      }),
    ).resolves.toEqual({ status: 'unbound' });
  });

  it('returns the owner-approved Party with no invented entitlement', async () => {
    const client = clientWith({
      account: {
        party_id: '10069',
        account_state: 'accepted',
        binding_basis: 'operator_decision',
      },
    });
    await expect(
      lookupLoginToolsBindingWithClient({
        client,
        request,
        policy,
        observedAt: '2026-09-15T21:45:00.000Z',
      }),
    ).resolves.toEqual({
      status: 'bound',
      partyId: '10069',
      entitlements: [],
    });
  });

  it('refuses an accepted subject bound to another Party', async () => {
    const client = clientWith({
      account: {
        party_id: '11646',
        account_state: 'accepted',
        binding_basis: 'operator_decision',
      },
    });
    await expect(
      lookupLoginToolsBindingWithClient({
        client,
        request,
        policy,
        observedAt: '2026-09-15T21:45:00.000Z',
      }),
    ).rejects.toThrow(/pilot_party_conflict/);
  });

  it('maps canonical component state without trusting a caller entitlement', async () => {
    const client = clientWith({
      account: {
        party_id: '10069',
        account_state: 'accepted',
        binding_basis: 'operator_decision',
      },
      entitlements: [
        {
          component_state: 'included',
          component_version: 0,
          enrollment_state: 'active',
          valid_from: '2026-09-01T00:00:00.000Z',
          valid_until: null,
        },
      ],
    });
    await expect(
      lookupLoginToolsBindingWithClient({
        client,
        request: { ...request, verifiedEmailSha256: undefined },
        policy,
        observedAt: '2026-09-15T21:45:00.000Z',
      }),
    ).resolves.toMatchObject({
      status: 'bound',
      entitlements: [
        {
          key: 'coaching_tools.plus',
          state: 'active',
          canonicalVersion: 1,
          verifiedAt: '2026-09-15T21:45:00.000Z',
        },
      ],
    });
  });

  it('pins issuer, audience, principal and immutable subject', async () => {
    const verifyIdToken = vi.fn().mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: 'https://mini-claw.example.ts.net/identity',
        email:
          'tandem-identity-runtime-dev@tandem-identity-dev-2026.iam.gserviceaccount.com',
        email_verified: true,
        sub: '114536406241819905948',
      }),
    });
    const verifier = new GoogleServiceCallerVerifier(
      {
        audience: 'https://mini-claw.example.ts.net/identity',
        principalEmail:
          'tandem-identity-runtime-dev@tandem-identity-dev-2026.iam.gserviceaccount.com',
        subject: '114536406241819905948',
      },
      { verifyIdToken } as never,
    );
    await expect(verifier.verify('x'.repeat(200))).resolves.toBeUndefined();
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'https://mini-claw.example.ts.net/identity',
      }),
    );
  });
});
