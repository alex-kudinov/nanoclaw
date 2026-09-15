import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const evaluator = fs.readFileSync(
  new URL('./google-account-claim.ts', import.meta.url),
  'utf8',
);
const store = fs.readFileSync(
  new URL('./google-account-claim-store.ts', import.meta.url),
  'utf8',
);
const index = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('Google account claim dark boundary', () => {
  it('has no network, credential, provider, Party, reference, or attempt writer', () => {
    const combined = `${evaluator}\n${store}`;
    expect(combined).not.toMatch(
      /fetch\(|axios|process\.env|GOOGLE_APPLICATION_CREDENTIALS|API_KEY|BEARER_TOKEN/i,
    );
    expect(combined.match(/https?:\/\//g)).toHaveLength(1);
    expect(evaluator).toContain(
      'https://securetoken.google.com/${claim.googleSubject.projectId}',
    );
    expect(store).not.toMatch(
      /INSERT INTO business_v2\.(parties|party_external_refs|provider_projection_attempts)/i,
    );
    expect(store).toContain('partyWrites: 0');
    expect(store).toContain('referenceWrites: 0');
    expect(store).toContain('providerAttempts: 0');
    expect(store).toContain('current_database()');
    expect(store).toContain('nc_tandem_identity_d2_test_');
  });

  it('is not imported or scheduled by the production runtime', () => {
    expect(index).not.toContain('google-account-claim');
    expect(index).not.toContain('GOOGLE_CLAIM');
  });

  it('uses migration 167 without adding a new migration', () => {
    expect(store).toContain('identity_event_receipts');
    expect(store).toContain('auth_accounts');
    expect(store).toContain('identity_resolution_decisions');
    expect(
      fs.existsSync(
        'data/business/migrations/nanoclaw-v2/168_tandem_identity_account_claim.sql',
      ),
    ).toBe(false);
  });
});
