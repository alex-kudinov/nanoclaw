import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Academy Capacity simple-sync migration contract', () => {
  const migrationPath =
    'data/business/migrations/nanoclaw-v2/145_academy_capacity_simple_sync.sql';
  const rollbackPath =
    'data/business/migrations/nanoclaw-v2/rollback_145_academy_capacity_simple_sync.sql';
  const migration = fs.readFileSync(path.resolve(migrationPath), 'utf8');
  const rollback = fs.readFileSync(path.resolve(rollbackPath), 'utf8');
  const release = fs.readFileSync(
    path.resolve('scripts/build-release.mjs'),
    'utf8',
  );

  it('adds commitment to both reservation constraints', () => {
    expect(migration).toContain(
      "channel IN ('checkout', 'manual', 'waitlist_offer', 'commitment')",
    );
    expect(migration).toContain(
      "channel = 'commitment' AND expires_at <= created_at + interval '3 years'",
    );
    expect(migration).toContain('AS committed');
    expect(migration).toContain("channel = 'commitment'");
    expect(migration).toContain("'commit_seat', 'change_capacity'");
    expect(migration).toContain(
      "'transfer_commitment', 'reconcile_commitment'",
    );
  });

  it('creates an admin-only retryable publication outbox', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.academy_capacity_publications',
    );
    expect(migration).toContain("public_state IN ('available', 'sold_out')");
    expect(migration).toContain("state IN ('pending', 'delivered', 'failed')");
    expect(migration).toContain(
      'ALTER TABLE business_v2.academy_capacity_publications OWNER TO nanoclaw_admin',
    );
    expect(migration).not.toMatch(/\bemail\s+(?:text|citext)\b/i);
  });

  it('refuses populated rollback and ships both files', () => {
    expect(rollback).toContain('rollback 145 refused: commitment rows exist');
    expect(rollback).toContain('rollback 145 refused: publication rows exist');
    expect(release).toContain(`'${migrationPath}'`);
    expect(release).toContain(`'${rollbackPath}'`);
    expect(release).toContain("'scripts/set-academy-capacity-publication.mjs'");
  });
});
