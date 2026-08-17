import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/120_company_work_exception_loop.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_120_company_work_exception_loop.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 120 Company Work exception loop', () => {
  it('separates attention state from workflow state and binds exact briefs', () => {
    expect(migration).toContain('company_work_exception_cases');
    expect(migration).toContain('company_work_exception_briefs');
    expect(migration).toContain('company_work_exception_events');
    expect(migration).toContain(
      "state IN ('open', 'acknowledged', 'resolved')",
    );
    expect(migration).toContain('UNIQUE (slack_channel_jid, slack_message_ts)');
    expect(migration).toContain("event_type = 'acknowledged'");
    expect(migration).not.toMatch(
      /UPDATE\s+business_v2\.company_work_(?:items|events|receipts)/i,
    );
  });

  it('stores no customer, message, job output, approval text, or arbitrary payload', () => {
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:email_address|recipient|subject|body|message_text|job_output|error_text|payload|jsonb)\b/i,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
    expect(migration).toContain('company_work_exception_events_append_only');
  });

  it('refuses to destroy any case, brief, or event history', () => {
    expect(rollback).toContain('case_count > 0');
    expect(rollback).toContain('brief_count > 0');
    expect(rollback).toContain('event_count > 0');
    expect(rollback).not.toContain('DELETE FROM');
  });

  it('binds migration and guarded rollback into the immutable release', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/120_company_work_exception_loop.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_120_company_work_exception_loop.sql'",
    );
    expect(releaseBuilder).toContain(
      "'scripts/set-company-work-exception-loop.mjs'",
    );
  });
});
