import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/126_company_work_outcome_quality.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_126_company_work_outcome_quality.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 126 Company Work outcome quality', () => {
  it('binds assessments to an exact Sales-email delivery event', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_work_outcome_quality_receipts',
    );
    expect(migration).toContain('REFERENCES business_v2.company_work_events');
    expect(migration).toContain("v_workflow_type <> 'sales_email'");
    expect(migration).toContain("v_event_type <> 'external_acknowledged'");
    expect(migration).toContain(
      'outcome-quality evidence and assessment cannot precede delivery',
    );
    expect(migration).toContain('recorded_at >= assessed_at');
  });

  it('supports append-only correction without branching or rewriting history', () => {
    expect(migration).toContain('assessment_revision');
    expect(migration).toContain('supersedes_receipt_id');
    expect(migration).toContain('company_work_outcome_quality_supersedes_uniq');
    expect(migration).toContain('company_work_outcome_quality_append_only');
    expect(migration).toContain(
      'outcome-quality revision must immediately follow its predecessor',
    );
  });

  it('stores only bounded classifications, hashes, roles, and timestamps', () => {
    for (const assessment of [
      'clean',
      'customer_visible_defect',
      'customer_visible_reversal',
      'customer_visible_defect_and_reversal',
    ]) {
      expect(migration).toContain(`'${assessment}'`);
    }
    for (const field of [
      'source_key_sha256',
      'evidence_sha256',
      'assessor_key_sha256',
      'evidence_occurred_at',
      'assessed_at',
    ]) {
      expect(migration).toContain(field);
    }
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:customer_email|recipient|subject|message_body|raw_content|prompt|remediation_action)\b/,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
  });

  it('refuses rollback after any quality receipt', () => {
    expect(rollback).toContain(
      'business_v2.company_work_outcome_quality_receipts',
    );
    expect(rollback).toContain('outcome-quality receipt history exists');
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('binds migration and guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/126_company_work_outcome_quality.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_126_company_work_outcome_quality.sql'",
    );
  });
});
