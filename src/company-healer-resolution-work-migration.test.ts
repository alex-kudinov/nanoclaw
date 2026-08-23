import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/132_company_healer_resolution_work.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_132_company_healer_resolution_work.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 132 healer resolution Company Work', () => {
  it('adds an opaque healer workflow and append-only minimized observations', () => {
    expect(migration).toContain("'healer_resolution'");
    expect(migration).toContain("'healer_resolution_receipt'");
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_healer_resolution_observations',
    );
    expect(migration).toContain(
      'company_healer_resolution_observations_append_only',
    );
    expect(migration).toContain('decision_actor_sha256');
    expect(migration).toContain('length(observation_key) <= 500');
    expect(migration).toContain("(disposition = 'decided_no_action') =");
    expect(migration).toContain(
      "(disposition = 'pending_decision') = (decision_owner IS NOT NULL)",
    );
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:raw_context|diagnosis|solution_text|command|diff|slack|thread|transcript)\b/,
    );
  });

  it('refuses populated rollback and never deletes history', () => {
    expect(rollback).toContain("workflow_type = 'healer_resolution'");
    expect(rollback).toContain('healer-resolution Company Work history exists');
    expect(rollback).not.toMatch(/DELETE FROM|TRUNCATE/);
  });

  it('binds migration and rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/132_company_healer_resolution_work.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_132_company_healer_resolution_work.sql'",
    );
    expect(releaseBuilder).toContain("'scripts/set-company-healer-work.mjs'");
  });
});
