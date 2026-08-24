import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/135_checkout_recovery_shadow.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_135_checkout_recovery_shadow.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 135 checkout recovery shadow', () => {
  it('creates four separate host authorities', () => {
    for (const table of [
      'checkout_recovery_cases',
      'checkout_recovery_aliases',
      'checkout_recovery_events',
      'checkout_recovery_receipts',
    ]) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
      expect(rollback).toContain(`DROP TABLE IF EXISTS business_v2.${table}`);
    }
  });

  it('keeps account coverage explicit and has no send/outbox authority', () => {
    expect(migration).toContain("stripe_account IN ('tandem', 'heartbeat')");
    expect(migration).not.toMatch(/CREATE TABLE[^;]*outbox/i);
    expect(migration).not.toContain('message_body');
    expect(migration).not.toContain('recipient_email');
    expect(migration).not.toMatch(/GRANT .*nanoclaw_/i);
    expect(migration).toContain('REVOKE ALL ON TABLE');
  });

  it('enforces provider alias uniqueness, terminal purchase, and append-only evidence', () => {
    expect(migration).toContain(
      'UNIQUE (stripe_account, alias_kind, alias_id)',
    );
    expect(migration).toContain('checkout_recovery_case_terminal_chk');
    expect(migration).toContain('checkout_recovery_events_core_immutable');
    expect(migration).toContain('checkout_recovery_events_no_delete');
    expect(migration).toContain('checkout_recovery_receipts_append_only');
  });

  it('refuses destructive rollback after evidence exists', () => {
    expect(rollback).toContain('rollback 135 refused');
    for (const table of [
      'checkout_recovery_cases',
      'checkout_recovery_aliases',
      'checkout_recovery_events',
      'checkout_recovery_receipts',
    ]) {
      expect(rollback).toContain(`SELECT 1 FROM business_v2.${table} LIMIT 1`);
    }
  });

  it('packages migration and guarded rollback in immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/135_checkout_recovery_shadow.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_135_checkout_recovery_shadow.sql'",
    );
  });
});
