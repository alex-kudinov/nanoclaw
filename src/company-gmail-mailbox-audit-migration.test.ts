import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(
    here,
    '..',
    'data/business/migrations/nanoclaw-v2/124_company_gmail_mailbox_audit.sql',
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(
    here,
    '..',
    'data/business/migrations/nanoclaw-v2/rollback_124_company_gmail_mailbox_audit.sql',
  ),
  'utf8',
);
const release = fs.readFileSync(
  path.join(here, '..', 'scripts/build-release.mjs'),
  'utf8',
);

const tables = [
  'company_gmail_mailbox_audits',
  'company_gmail_mailbox_audit_pages',
  'company_gmail_mailbox_audit_candidates',
];

describe('Company Gmail mailbox audit migration', () => {
  it('adds a separate resumable audit with closed three-way accounting', () => {
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
    }
    expect(migration).toContain(
      'candidate_count = accepted_count + rejected_count + unknown_count',
    );
    expect(migration).toContain("'accepted', 'rejected', 'unknown'");
    expect(migration).toContain(
      'company_gmail_mailbox_audit_one_active_source_idx',
    );
    expect(migration).toContain('pages_read BETWEEN 0 AND 10000');
  });

  it('keeps audit evidence content-free and host-admin-only', () => {
    const tableBodies = tables
      .map(
        (table) =>
          migration.match(
            new RegExp(
              `CREATE TABLE business_v2\\.${table} \\(([\\s\\S]*?)\\n\\);`,
            ),
          )?.[1],
      )
      .join('\n');
    expect(tableBodies).not.toMatch(
      /email_address|sender|recipient|subject|body|header|snippet|payload|prompt|task_id|approval_id|action_envelope/i,
    );
    for (const table of tables) {
      expect(migration).toContain(
        `ALTER TABLE business_v2.${table}\n  OWNER TO nanoclaw_admin`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON business_v2.${table} FROM PUBLIC`,
      );
    }
    expect(migration).not.toMatch(/GRANT\s+[^;]+\s+TO\s+(?!nanoclaw_admin)/i);
  });

  it('makes page/candidate evidence append-only and rollback data-preserving', () => {
    expect(migration).toContain(
      'company_gmail_mailbox_audit_pages_append_only',
    );
    expect(migration).toContain(
      'company_gmail_mailbox_audit_candidates_append_only',
    );
    expect(migration).toContain('fn_company_work_append_only');
    for (const table of tables)
      expect(rollback).toContain(`FROM business_v2.${table}`);
    expect(rollback).toContain(
      'refusing to drop populated Gmail mailbox audit history',
    );
  });

  it('binds migration 124 and its rollback into immutable releases', () => {
    expect(release).toContain('124_company_gmail_mailbox_audit.sql');
    expect(release).toContain('rollback_124_company_gmail_mailbox_audit.sql');
  });
});
