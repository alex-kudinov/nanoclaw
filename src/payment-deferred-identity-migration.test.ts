import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'data/business/migrations/nanoclaw-v2/165_deferred_checkout_identity.sql',
  'utf8',
);
const rollback = readFileSync(
  'data/business/migrations/nanoclaw-v2/rollback_165_deferred_checkout_identity.sql',
  'utf8',
);
const identity = readFileSync(
  'src/payment-identity-preparation-store.ts',
  'utf8',
);
const service = readFileSync('src/website-checkout-service.ts', 'utf8');

describe('migration165 deferred checkout identity boundary', () => {
  it('keeps pre-payment PII encrypted and deletable while materialization is immutable', () => {
    expect(migration).toContain('payment_checkout_submission_payloads');
    expect(migration).toContain('encrypted_payload text NOT NULL');
    expect(migration).toContain('payment_identity_materializations');
    expect(migration).toContain('payment_identity_materialization_immutable');
    expect(rollback).toContain('rollback 165 refused');
  });

  it('creates purchase-scoped Parties only in the post-confirm materializer', () => {
    expect(identity).toContain('materializeForAttempt');
    expect(identity).toContain("reason: 'confirmed_checkout_purchase'");
    expect(identity).toContain('payment_checkout_submission_payloads');
    expect(identity).toContain(
      'DELETE FROM business_v2.payment_checkout_submission_payloads',
    );
  });

  it('does not purge while any successor Session is still nonterminal', () => {
    expect(service).toContain(
      "e.projection->>'state' IN ('refused','payment_failed')",
    );
    expect(service).toContain('WHERE o.attempt_id=a.attempt_id');
    expect(service).toContain('WHERE t.payment_operation_id=o.operation_id');
  });
});
