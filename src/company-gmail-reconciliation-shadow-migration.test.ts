import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(
    here,
    '..',
    'data',
    'business',
    'migrations',
    'nanoclaw-v2',
    '123_company_gmail_reconciliation_shadow.sql',
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(
    here,
    '..',
    'data',
    'business',
    'migrations',
    'nanoclaw-v2',
    'rollback_123_company_gmail_reconciliation_shadow.sql',
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  path.join(here, '..', 'scripts', 'build-release.mjs'),
  'utf8',
);

const tables = [
  'company_gmail_reconciliation_snapshots',
  'company_gmail_reconciliation_pages',
  'company_gmail_reconciliation_candidates',
];

describe('Company OS Gmail reconciliation shadow migration', () => {
  it('adds resumable state plus append-only page and candidate receipts', () => {
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
    }
    expect(migration).toContain(
      'company_gmail_reconciliation_one_active_gap_idx',
    );
    expect(migration).toContain(
      'company_gmail_reconciliation_pages_append_only',
    );
    expect(migration).toContain(
      'company_gmail_reconciliation_candidates_append_only',
    );
    expect(migration).toContain('fn_company_work_append_only');
  });

  it('binds one exact source gap and enforces terminal/accounting shapes', () => {
    expect(migration).toContain('(definition_id, gap_event_id) REFERENCES');
    expect(migration).toContain(
      'candidate_count = accepted_count + rejected_count',
    );
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("status = 'listed'");
    expect(migration).toContain("status = 'complete'");
    expect(migration).toContain("status = 'invalidated'");
    expect(migration).toContain('version = pages_read + 1');
    expect(migration).toContain('final_history_id = initial_history_id');
    expect(migration).toContain('pages_read BETWEEN 0 AND 10000');
  });

  it('stores only content-free reconciliation evidence', () => {
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
      /sender|recipient|email_address|subject|body|header|snippet|payload|content|prompt|task_id|approval|action_envelope/i,
    );
    expect(migration).toContain('gmail_message_id');
    expect(migration).toContain('next_page_token');
    expect(migration).toContain('evidence_sha256');
    expect(migration).toContain('reason_key');
  });

  it('keeps every table host-admin-only with no agent grant', () => {
    for (const table of tables) {
      expect(migration).toContain(
        `ALTER TABLE business_v2.${table}\n  OWNER TO nanoclaw_admin`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON business_v2.${table} FROM PUBLIC`,
      );
      expect(migration).toContain(
        `GRANT ALL ON business_v2.${table}\n  TO nanoclaw_admin`,
      );
    }
    expect(migration).not.toMatch(/GRANT\s+[^;]+\s+TO\s+(?!nanoclaw_admin)/i);
  });

  it('refuses to erase any populated snapshot, page, or candidate history', () => {
    for (const table of tables) {
      expect(rollback).toContain(`FROM business_v2.${table}`);
    }
    expect(rollback).toContain(
      'refusing to drop populated company Gmail reconciliation history',
    );
  });

  it('binds migration 123 and its guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/123_company_gmail_reconciliation_shadow.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_123_company_gmail_reconciliation_shadow.sql'",
    );
  });
});
