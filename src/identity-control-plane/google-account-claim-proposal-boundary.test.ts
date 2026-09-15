import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const proposal = fs.readFileSync(
  new URL('./google-account-claim-proposal.ts', import.meta.url),
  'utf8',
);
const store = fs.readFileSync(
  new URL('./google-account-claim-proposal-store.ts', import.meta.url),
  'utf8',
);
const transport = fs.readFileSync(
  new URL('./google-service-account-transport.ts', import.meta.url),
  'utf8',
);
const index = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('Google account claim proposal disposable boundary', () => {
  it('has no custom signing, network, credential, or forbidden writer', () => {
    const combined = `${proposal}\n${store}\n${transport}`;
    expect(combined).not.toMatch(
      /createHmac|timingSafeEqual|fetch\(|axios|process\.env|API_KEY|BEARER_TOKEN|firebase-admin|applicationDefault|getIdTokenClient/i,
    );
    expect(transport).toContain('google-auth-library');
    expect(transport).toContain('verifySignedJwtWithCertsAsync');
    expect(store).not.toMatch(
      /INSERT INTO business_v2\.(parties|party_external_refs|provider_projection_attempts)/i,
    );
    expect(store).toContain('current_database()');
    expect(store).toContain("current_setting('transaction_isolation')");
    expect(store).toContain('pg_current_xact_id()');
    expect(store).toContain('transaction_boundary_lost');
    expect(store).toContain('party_identifier_claims');
    expect(store).toContain('party_identity_exceptions');
  });

  it('does not accept caller Party/conflict authority or non-participant roles', () => {
    expect(proposal).not.toContain('targetPartyId');
    expect(proposal).not.toContain('candidatePartyIds');
    expect(proposal).not.toContain('openIdentityConflict');
    expect(proposal).toContain("role: z.literal('participant')");
    expect(proposal).toContain("payerLearnerRelationship: z.literal('self')");
  });

  it('has no runtime import, endpoint, network client, or migration 168', () => {
    expect(index).not.toContain('google-account-claim-proposal');
    expect(index).not.toContain('google-service-account-transport');
    expect(index).not.toContain('CLAIM_PROPOSAL');
    expect(combinedRuntimeSurface()).not.toMatch(
      /app\.(get|post|put|patch|delete)|http|https|undici/i,
    );
    expect(
      fs.existsSync(
        'data/business/migrations/nanoclaw-v2/168_tandem_identity_account_claim.sql',
      ),
    ).toBe(false);
  });
});

function combinedRuntimeSurface(): string {
  return `${store}\n${transport}`
    .split('\n')
    .filter(
      (line) =>
        !line.includes('securetoken.google.com') &&
        !line.includes('accounts.google.com') &&
        !line.includes('expectedAudience') &&
        !line.includes('audience:'),
    )
    .join('\n');
}
