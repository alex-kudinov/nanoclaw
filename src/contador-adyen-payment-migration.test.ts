import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/166_contador_adyen_payments.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_166_contador_adyen_payments.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('migration 166 Adyen Bookkeeper compatibility', () => {
  it('adds one provider-specific, PII-free idempotency table', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.contador_adyen_payments',
    );
    expect(migration).toContain('psp_reference text PRIMARY KEY');
    expect(migration).toContain('UNIQUE (order_id)');
    expect(migration).toContain('UNIQUE (merchant_reference)');
    expect(migration).not.toMatch(/\b(email|first_name|last_name|payer)\b/i);
    expect(migration).not.toContain('contador_payment_fulfillment_cases');
    expect(migration).toContain('TO nanoclaw_contador');
  });

  it('refuses rollback after the first compatibility payment exists', () => {
    expect(rollback).toContain(
      'rollback refused: Adyen compatibility payments exist',
    );
    expect(rollback).toContain(
      'DROP TABLE IF EXISTS business_v2.contador_adyen_payments',
    );
  });
});
