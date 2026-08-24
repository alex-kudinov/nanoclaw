import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(
    'data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql',
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  path.resolve(
    'data/business/migrations/nanoclaw-v2/rollback_133_contador_payment_fulfillment_cases.sql',
  ),
  'utf8',
);

describe('migration 133 Contador payment fulfillment cases', () => {
  it('creates one canonical case identity plus append-only aliases and receipts', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.contador_payment_fulfillment_cases',
    );
    expect(migration).toContain('UNIQUE (stripe_account, payment_intent_id)');
    expect(migration).toContain(
      'CREATE TABLE business_v2.contador_payment_fulfillment_aliases',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.contador_payment_fulfillment_receipts',
    );
    expect(migration).toContain('lease_expires_at');
    expect(migration).toContain('contador_payment_fulfillment_cases_lease_chk');
    expect(migration.match(/fn_company_work_append_only/g)).toHaveLength(2);
  });

  it('keeps customer, accounting, and raw webhook content out of the ledger', () => {
    for (const forbidden of [
      'customer_email',
      'customer_name',
      'student_name',
      'product_name',
      'amount_cents',
      'card_',
      'raw_body',
      'quickbooks',
    ]) {
      expect(migration.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('grants only nanoclaw_admin and keeps rollback history-preserving', () => {
    expect(migration).toContain('REVOKE ALL ON');
    expect(migration).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE).*TO\s+nanoclaw_/i,
    );
    expect(rollback).toContain('rollback 133 refused');
    expect(rollback).toContain(
      'business_v2.contador_payment_fulfillment_receipts',
    );
    expect(rollback).not.toMatch(/TRUNCATE|DELETE\s+FROM/i);
  });
});
