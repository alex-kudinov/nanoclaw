import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/119_company_work_job_runs.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_119_company_work_job_runs.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('migration 119 dark host-job work projection', () => {
  it('adds one non-Party workflow without replacing the email contract', () => {
    expect(migration).toContain(
      "workflow_type IN ('sales_email', 'host_job_run')",
    );
    expect(migration).toContain("'host_job_terminal_receipt'");
    expect(migration).toContain('company_work_items_workflow_identity_chk');
    expect(migration).toContain('party_id IS NULL');
    expect(migration).toContain('pipeline_entry_id IS NULL');
    expect(migration).toContain("workflow_type = 'sales_email'");
    expect(migration).toContain('party_id IS NOT NULL');
  });

  it('adds exact start and terminal-failure facts to the append-only event set', () => {
    expect(migration).toContain("'execution_started'");
    expect(migration).toContain("'execution_failed'");
    expect(migration).toMatch(
      /'execution_failed', 'outcome_validated', 'cancelled'[\s\S]*= \(receipt_id IS NOT NULL\)/,
    );
    expect(migration).toContain(
      "event_type IN ('blocked', 'failed', 'execution_failed')",
    );
  });

  it('adds no agent grant, view, runtime wiring, or raw job-result field', () => {
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
    expect(migration).not.toContain('CREATE VIEW');
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(/\b(?:output|error|log_file|prompt|payload)\b/);
  });

  it('ships a history-preserving, non-auto-discovered rollback', () => {
    expect(rollback).toContain("WHERE workflow_type = 'host_job_run'");
    expect(rollback).toContain(
      'company work ledger contains host-job history (items %)',
    );
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('DROP TABLE');
    expect(rollback).toContain('ALTER COLUMN party_id SET NOT NULL');
  });
});
