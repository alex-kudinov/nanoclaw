import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/131_company_followup_operator_decisions.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_131_company_followup_operator_decisions.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 131 follow-up operator decisions', () => {
  it('adds one content-free declined-decision receipt to the append-only event ledger', () => {
    expect(migration).toContain("'operator_decision'");
    expect(migration).toContain("operator_decision = 'declined'");
    expect(migration).toContain("operator_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(
      /display_name|email_address|recipient|subject|message_body|raw_content|payload|jsonb/i,
    );
  });

  it('does not add a source, pipeline, scheduler, approval, or send mutation', () => {
    expect(migration).not.toMatch(
      /UPDATE\s+business_v2\.(?:pipeline_entries|parties)|INSERT\s+INTO|GRANT\s+/i,
    );
  });

  it('refuses rollback after any operator decision evidence exists', () => {
    expect(rollback).toContain('rollback_131 refused');
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('binds migration and rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/131_company_followup_operator_decisions.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_131_company_followup_operator_decisions.sql'",
    );
  });
});
