import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/136_checkout_recovery_two_reminders.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_136_checkout_recovery_two_reminders.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 136 checkout recovery two reminders', () => {
  it('adds prospective routing context and separate per-touch authorities', () => {
    for (const column of ['checkout_locale', 'return_url', 'product_name']) {
      expect(migration).toContain('ADD COLUMN ' + column);
    }
    expect(migration).toContain(
      'CREATE TABLE business_v2.checkout_recovery_send_intents',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.checkout_recovery_send_receipts',
    );
    expect(migration).toContain('UNIQUE (case_id, touch)');
    expect(migration).toContain('touch IN (1, 2)');
  });

  it('is admin-only, append-only for receipts, and guarded on rollback', () => {
    expect(migration).toContain('checkout_recovery_send_receipts_append_only');
    expect(migration).toContain('REVOKE ALL ON TABLE');
    expect(migration).not.toMatch(/GRANT .*nanoclaw_/i);
    expect(rollback).toContain('rollback 136 refused');
  });

  it('packages both exact files in immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/136_checkout_recovery_two_reminders.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_136_checkout_recovery_two_reminders.sql'",
    );
  });
});
