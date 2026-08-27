import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(
    root,
    'data/business/migrations/nanoclaw-v2/139_contador_charge_alias_compatibility.sql',
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(
    root,
    'data/business/migrations/nanoclaw-v2/rollback_139_contador_charge_alias_compatibility.sql',
  ),
  'utf8',
);
const builder = fs.readFileSync(
  path.join(root, 'scripts/build-release.mjs'),
  'utf8',
);

describe('migration 139 Contador charge alias compatibility', () => {
  it('adds only provider-supported py_ charge aliases to the typed constraint', () => {
    expect(migration).toContain(
      "alias_id ~ '^(pi|cs|ch|py|in|re|evt)_[A-Za-z0-9_]+$'",
    );
    expect(migration).toContain(
      'DROP CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check',
    );
    expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('refuses rollback when a py_ alias would violate the prior contract', () => {
    expect(rollback).toContain("alias_id LIKE 'py\\_%' ESCAPE '\\'");
    expect(rollback).toContain(
      'rollback 139 refused: provider-supported py_ charge aliases exist',
    );
    expect(rollback).toContain(
      "alias_id ~ '^(pi|cs|ch|in|re|evt)_[A-Za-z0-9_]+$'",
    );
    expect(rollback).not.toMatch(/\b(DELETE|TRUNCATE)\b/i);
  });

  it('binds both exact migration files into immutable releases', () => {
    expect(builder).toContain(
      "'data/business/migrations/nanoclaw-v2/139_contador_charge_alias_compatibility.sql'",
    );
    expect(builder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_139_contador_charge_alias_compatibility.sql'",
    );
  });
});
