import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql',
);
const rollbackPath = path.join(
  root,
  'data/business/migrations/nanoclaw-v2/rollback_167_tandem_identity_control_plane.sql',
);

describe('Tandem Identity D1 migration contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const rollback = fs.readFileSync(rollbackPath, 'utf8');

  it('is transactional, admin-only, and has no dispatch or runtime wiring', () => {
    expect(migration).toMatch(/^-- 167_tandem_identity_control_plane\.sql/m);
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(migration).toContain('OWNER TO nanoclaw_admin');
    expect(migration).toContain('REVOKE ALL');
    expect(migration).not.toMatch(/GRANT\s+/i);
    expect(migration).not.toMatch(/https?:\/\//i);
    expect(migration).not.toMatch(/NOTIFY|dblink|http_|curl|webhook/i);
  });

  it('pins every missing Stage D control record', () => {
    for (const table of [
      'identity_event_receipts',
      'identity_resolution_decisions',
      'identity_candidates',
      'auth_accounts',
      'provider_desired_projections',
      'provider_projection_commands',
      'provider_projection_attempts',
      'provider_projection_readbacks',
      'provider_reconciliation_runs',
      'provider_snapshot_items',
      'provider_drift_items',
    ]) {
      expect(migration).toContain(`business_v2.${table}`);
      expect(rollback).toContain(`business_v2.${table}`);
    }
  });

  it('makes the Stage D shadow command boundary structurally unrepresentable', () => {
    expect(migration).toMatch(
      /status IN \('simulated', 'superseded', 'blocked'\)/,
    );
    expect(migration).toMatch(/writes_enabled = false/);
    expect(migration).toMatch(/attempt_count = 0/);
    expect(migration).toMatch(/provider_operation_id IS NULL/);
    expect(migration).toMatch(/next_attempt_at IS NULL/);
    expect(migration).toContain('shadow provider attempts are prohibited');
  });

  it('pins exact decision targets and append-only candidate lifecycle versions', () => {
    expect(migration).toMatch(
      /result IN \('ambiguous', 'not_found', 'conflict'\)[\s\S]{0,160}candidate_id IS NULL/,
    );
    expect(migration).toContain('candidate_version');
    expect(migration).toContain(
      'tandem identity candidate version is not monotonic',
    );
    expect(migration).toContain(
      'tandem identity candidate transition is invalid',
    );
    expect(migration).toMatch(
      /FROM business_v2\.provider_reconciliation_runs[\s\S]{0,100}FOR SHARE/,
    );
  });

  it('guards destructive rollback once any identity evidence exists', () => {
    expect(rollback).toContain(
      'rollback 167 refused: tandem identity evidence exists',
    );
    expect(rollback).toContain('separately reviewed archival migration');
    expect(rollback).not.toMatch(/CASCADE/i);
  });
});
