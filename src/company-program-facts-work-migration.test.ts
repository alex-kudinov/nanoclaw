import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/125_company_program_facts_work.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_125_company_program_facts_work.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 125 program-facts Company Work pilot', () => {
  it('adds one condition workflow and exact clean completion contract', () => {
    expect(migration).toContain("'program_facts_drift'");
    expect(migration).toContain("'detector_clean_receipt'");
    expect(migration).toContain("'reopened'");
    expect(migration).toContain('company_work_items_workflow_identity_chk');
    expect(migration).toContain('party_id IS NULL');
    expect(migration).toContain('pipeline_entry_id IS NULL');
  });

  it('stores append-only hashes and counts without raw findings or correction authority', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_program_fact_observations',
    );
    expect(migration).toContain(
      'company_program_fact_observations_append_only',
    );
    for (const field of [
      'finding_fingerprint',
      'facts_sha256',
      'sales_kb_sha256',
      'products_sha256',
      'finding_count',
      'checked_programs',
    ]) {
      expect(migration).toContain(field);
    }
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:finding_detail|fact_text|product_data|knowledge_text|prompt|payload|correction)\b/,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
  });

  it('refuses rollback after any condition evidence instead of deleting history', () => {
    expect(rollback).toContain("workflow_type = 'program_facts_drift'");
    expect(rollback).toContain('company_program_fact_observations');
    expect(rollback).toContain("event_type = 'reopened'");
    expect(rollback).toContain('program-facts Company Work history exists');
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('binds the migration and guarded rollback into verified releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/125_company_program_facts_work.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_125_company_program_facts_work.sql'",
    );
  });
});
