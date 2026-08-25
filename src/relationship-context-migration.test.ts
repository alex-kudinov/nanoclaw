import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_137_relationship_context_dark.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

const tables = [
  'party_external_refs',
  'party_identifier_claims',
  'party_identity_exceptions',
  'party_context_adapter_registrations',
  'party_context_observations',
  'party_context_projections',
  'party_context_query_receipts',
  'party_context_plutio_projection_receipts',
];

describe('migration 137 relationship context dark foundation', () => {
  it('creates and guardedly rolls back all eight authorities', () => {
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
      expect(rollback).toContain(`DROP TABLE business_v2.${table}`);
    }
    expect(rollback).toContain('rollback 137 refused');
    expect(rollback).toContain("adapter_key <> 'legacy_party_source'");
  });

  it('performs an idempotent and conflict-refusing legacy Party source backfill', () => {
    expect(migration).toContain('fn_relationship_context_backfill_legacy_refs');
    expect(migration).toContain("source_scope = 'legacy-primary'");
    expect(migration).toContain(
      'relationship context legacy source conflicts with existing scoped ref',
    );
    expect(migration).toContain(
      'ON CONFLICT (provider, source_scope, entity_type, external_id) DO NOTHING',
    );
    expect(migration).toContain(
      'SELECT business_v2.fn_relationship_context_backfill_legacy_refs()',
    );
    expect(migration).toContain('sha256(convert_to(');
    expect(migration).not.toContain('digest(');
  });

  it('bounds every persisted JSON surface to 8192 bytes', () => {
    const boundCount = migration.match(
      /octet_length\([^\n]+::text\) <= 8192/g,
    )?.length;
    expect(boundCount).toBeGreaterThanOrEqual(12);
    for (const column of [
      'manifest',
      'config_declaration',
      'value',
      'source_watermarks',
      'missing_codes',
      'conflict_codes',
      'requested_sections',
      'returned_sections',
      'projection_versions',
      'proposed_fields',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('preserves merge lineage across every current/evidence authority', () => {
    expect(migration).toContain('parties_relationship_context_merge');
    for (const table of [
      'party_external_refs',
      'party_identifier_claims',
      'party_identity_exceptions',
      'party_context_observations',
      'party_context_projections',
      'party_context_query_receipts',
      'party_context_plutio_projection_receipts',
    ]) {
      expect(migration).toMatch(
        new RegExp(`(?:UPDATE|DELETE FROM) business_v2\\.${table}`),
      );
    }
    expect(migration).toContain(
      'relationship context projection merge conflict',
    );
  });

  it('is admin-only, append-safe, dark, and has no executable provider path', () => {
    expect(migration).toContain('REVOKE ALL ON business_v2.%I FROM PUBLIC');
    expect(migration).not.toMatch(/TO nanoclaw_(?!admin)/);
    expect(migration).toContain(
      'enabled                    boolean NOT NULL DEFAULT false',
    );
    expect(migration).toContain("mode = 'dry_run'");
    expect(migration).not.toMatch(/CREATE TABLE[^;]*(?:outbox|send)/i);
    expect(migration).not.toContain('recipient_email');
    expect(migration).not.toContain('message_body');
    expect(migration).not.toContain('credential_value');
    expect(migration).toContain('party_context_observations_core_immutable');
    expect(migration).toContain('party_context_query_receipts_core_immutable');
    expect(migration).toContain(
      'party_context_query_receipts_delivery_transition',
    );
    expect(migration).toContain(
      "delivery_status IN ('pending', 'delivered', 'failed')",
    );
  });

  it('packages migration and guarded rollback in immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_137_relationship_context_dark.sql'",
    );
  });
});
