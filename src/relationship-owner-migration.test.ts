import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/138_relationship_owner_authority.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_138_relationship_owner_authority.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);
const decision = JSON.parse(
  fs.readFileSync(
    new URL(
      '../.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  kind: string;
  status: string;
  scope: string[];
  rationale: string;
};

describe('migration 138 relationship-owner authority', () => {
  it('records one no-action Tandem Team principal and exact lane assignments', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.relationship_owner_principals',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.relationship_owner_assignments',
    );
    expect(migration).toContain(
      "('team:tandem', 'organizational_team', 'Tandem Team', 'tandem_os',",
    );
    expect(migration).toContain("action_authority = 'none'");
    for (const lane of [
      'sales_conversation',
      'proposal_signature',
      'receivable',
    ]) {
      expect(migration).toContain(`('${lane}'::text)`);
    }
    expect(migration).not.toContain('createdBy');
    expect(migration).not.toContain('gmail_send');
  });

  it('binds projected cases to the exact principal, assignment, and decision', () => {
    expect(migration).toContain('relationship_owner_principal_key text');
    expect(migration).toContain('relationship_owner_assignment_id bigint');
    expect(migration).toContain('relationship_owner_decision_ref text');
    expect(migration).toContain('company_followup_cases_relationship_owner_fk');
    expect(migration).toContain(
      'company_followup_cases_relationship_owner_required_chk',
    );
    expect(migration).toContain(
      'REFERENCES business_v2.relationship_owner_assignments',
    );
    expect(migration).toContain('relationship_owner_decision_ref,\n      lane');
    expect(migration).toContain('relationship_owner_assignments_append_only');
    expect(migration).toContain('relationship_owner_principals_append_only');
    expect(migration).toContain(
      'relationship owner assignment must supersede the exact current scope assignment',
    );
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('keeps the registry admin-only and rollback guarded', () => {
    expect(migration).toContain(
      'REVOKE ALL ON business_v2.relationship_owner_principals FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON business_v2.relationship_owner_assignments FROM PUBLIC',
    );
    expect(rollback).toContain(
      'rollback 138 refused: follow-up cases reference relationship-owner assignments',
    );
    expect(rollback).toContain(
      'rollback 138 refused: relationship-owner assignment registry has changed',
    );
    expect(rollback).not.toContain('CASCADE');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('packages the migration and its guarded rollback', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/138_relationship_owner_authority.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_138_relationship_owner_authority.sql'",
    );
  });

  it('is backed by the current accepted owner decision', () => {
    expect(decision).toMatchObject({
      kind: 'authorization',
      status: 'accepted',
      scope: ['work:relationship-owner-authority'],
    });
    expect(decision.rationale).toContain('Tandem Team');
    expect(decision.rationale).toContain(
      'grants no individual or minion authority',
    );
  });
});
