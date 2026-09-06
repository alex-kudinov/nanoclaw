import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Academy Capacity Gate D migration contract', () => {
  const migration = fs.readFileSync(
    path.resolve(
      'data/business/migrations/nanoclaw-v2/144_academy_capacity_operator_pilot.sql',
    ),
    'utf8',
  );
  const rollback = fs.readFileSync(
    path.resolve(
      'data/business/migrations/nanoclaw-v2/rollback_144_academy_capacity_operator_pilot.sql',
    ),
    'utf8',
  );
  const release = fs.readFileSync(
    path.resolve('scripts/build-release.mjs'),
    'utf8',
  );

  it('creates strict privacy-minimized cases, append-only receipts, and a view', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.academy_capacity_operator_cases',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.academy_capacity_operator_receipts',
    );
    expect(migration).toContain(
      'CREATE TRIGGER academy_capacity_operator_receipts_append_only',
    );
    expect(migration).toContain(
      'CREATE VIEW business_v2.v_academy_capacity_operator_cases',
    );
    expect(migration).toContain("source_group = 'capacity'");
    expect(migration).toContain('octet_length(request_summary::text) <= 4096');
    expect(migration).not.toMatch(/\bemail\s+(?:text|citext)\b/i);
    expect(migration).not.toContain('display_name');
    expect(migration).not.toContain('payer');
  });

  it('keeps every object admin-only and rollback refuses populated evidence', () => {
    expect(migration).toContain('OWNER TO nanoclaw_admin');
    expect(migration).toContain('REVOKE ALL ON business_v2.%I FROM PUBLIC');
    expect(migration).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL).*nanoclaw_capacity/i,
    );
    expect(rollback).toContain(
      'refusing to drop populated Academy Capacity operator cases',
    );
    expect(rollback).toContain(
      'refusing to drop populated Academy Capacity operator receipts',
    );
  });

  it('packages migration, rollback, and registration script in immutable releases', () => {
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/144_academy_capacity_operator_pilot.sql'",
    );
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_144_academy_capacity_operator_pilot.sql'",
    );
    expect(release).toContain("'scripts/register-capacity.mjs'");
    const registration = fs.readFileSync(
      path.resolve('scripts/register-capacity.mjs'),
      'utf8',
    );
    expect(registration).toContain("new URL('../dist/db.js'");
    expect(registration).toContain(".backup '");
    expect(registration).toContain('capacity registration readback mismatch');
    expect(registration).not.toContain('../src/db.js');
  });
});
