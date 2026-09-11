import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'data/business/migrations/nanoclaw-v2/157_payment_webhook_method_evidence.sql',
  'utf8',
);
const rollback = readFileSync(
  'data/business/migrations/nanoclaw-v2/rollback_157_payment_webhook_method_evidence.sql',
  'utf8',
);
const eventStore = readFileSync('src/payment-event-store.ts', 'utf8');

describe('migration157 webhook method evidence contract', () => {
  it('requires exactly one immutable Session-result or payment-event source', () => {
    expect(migration).toContain(
      "source_kind IN ('session_result','card_scope_webhook')",
    );
    expect(migration).toContain('payment_method_binding_exact_source_check');
    expect(migration).toContain('payment_enrollment_method_exact_source_check');
    expect(migration).toContain(
      'REFERENCES business_v2.payment_events(scope_sha256,event_id)',
    );
    expect(rollback).toContain(
      'rollback refused: webhook-derived method evidence exists',
    );
  });

  it('derives card only from the pinned attempt capability and signed authorization fact', () => {
    expect(eventStore).toContain(
      'paymentMethodCapabilitiesForAttempt(attempt)',
    );
    expect(eventStore).toContain(
      "capabilities.length === 1 && capabilities[0] === 'card'",
    );
    expect(eventStore).toContain("fact.kind === 'authorization'");
    expect(eventStore).toContain('fact.success');
    expect(eventStore).not.toContain('entity.paymentMethod');
  });
});
