import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/130_company_followup_cases.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_130_company_followup_cases.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 130 Company OS follow-up cases', () => {
  it('stores exact current cases and append-only changed-evidence events', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_followup_cases',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_followup_events',
    );
    expect(migration).toContain('UNIQUE (lane, source_system, source_key)');
    expect(migration).toContain('company_followup_events_append_only');
    for (const lane of [
      'sales_conversation',
      'proposal_signature',
      'receivable',
    ]) {
      expect(migration).toContain(`'${lane}'`);
    }
  });

  it('keeps privacy and authority on the host side', () => {
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:display_name|email_address|recipient|subject|message_body|proposal_description|invoice_description|raw_content|payload|jsonb)\b/i,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
  });

  it('refuses to erase any case or event history', () => {
    expect(rollback).toContain('company follow-up history exists');
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('binds migration and guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/130_company_followup_cases.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_130_company_followup_cases.sql'",
    );
  });
});
