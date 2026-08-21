import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/129_company_work_exception_dispatch_receipts.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_129_company_work_exception_dispatch_receipts.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 129 Company Work dispatch attempts', () => {
  it('binds exact packet, router pickup, and bounded agent-turn receipts', () => {
    expect(migration).toContain('company_work_exception_dispatches');
    expect(migration).toContain('company_work_exception_dispatch_events');
    expect(migration).toMatch(
      /status IN \(\s*'posted', 'picked_up', 'attempted', 'failed'/,
    );
    expect(migration).toMatch(
      /'posted', 'picked_up',\s*'attempt_succeeded', 'attempt_failed'/,
    );
    expect(migration).toContain(
      'UNIQUE (slack_channel_jid, packet_message_ts)',
    );
    expect(migration).toContain('dispatch_fingerprint');
    expect(migration).toContain(
      'company_work_exception_dispatches_completed_fingerprint_idx',
    );
    expect(migration).toContain(
      'company_work_exception_dispatch_events_append_only',
    );
  });

  it('stores no customer content, agent output, action, or arbitrary payload', () => {
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:email_address|recipient|subject|body|message_text|agent_output|action_payload|payload|jsonb)\b/i,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
    expect(migration).not.toMatch(
      /UPDATE\s+business_v2\.company_work_(?:items|events|receipts)/i,
    );
  });

  it('refuses to destroy packet or attempt history', () => {
    expect(rollback).toContain('dispatch_count > 0');
    expect(rollback).toContain('event_count > 0');
    expect(rollback).not.toContain('DELETE FROM');
  });

  it('binds migration and guarded rollback into the immutable release', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/129_company_work_exception_dispatch_receipts.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_129_company_work_exception_dispatch_receipts.sql'",
    );
  });
});
