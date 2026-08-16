import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/118_company_work_ledger.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_118_company_work_ledger.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('migration 118 dark Company OS work ledger', () => {
  it('creates separate current-state, receipt, and append-only event tables', () => {
    for (const table of [
      'company_work_items',
      'company_work_receipts',
      'company_work_events',
    ]) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
    }
    expect(migration).toContain('company_work_receipts_append_only');
    expect(migration).toContain('company_work_events_append_only');
    expect(migration).toContain('fn_company_work_append_only');
  });

  it('keeps agent roles outside the base tables and transition authority', () => {
    expect(migration).toContain(
      'REVOKE ALL ON business_v2.company_work_items FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT ALL ON business_v2.company_work_items TO nanoclaw_admin',
    );
    expect(migration).not.toMatch(
      /(?:GRANT|TO)\s+nanoclaw_(?:sales|mailman|chief|inbox)/,
    );
    expect(migration).not.toContain('CREATE VIEW');
  });

  it('stores no raw customer, message, approval, or arbitrary payload fields', () => {
    const tableDefinitions = migration
      .split('CREATE OR REPLACE FUNCTION')[0]
      .replace(/^--.*$/gm, '');
    expect(tableDefinitions).not.toMatch(/\b(?:email_address|customer_name)\b/);
    expect(tableDefinitions).not.toMatch(
      /\b(?:subject|body|payload|content)\b/,
    );
    expect(tableDefinitions).not.toContain('jsonb');
    expect(tableDefinitions).toContain('evidence_sha256');
    expect(tableDefinitions).toContain('external_action_id');
  });

  it('binds exact source, idempotency, version, receipt, and exception facts', () => {
    expect(migration).toContain(
      'UNIQUE (workflow_type, source_system, source_key)',
    );
    expect(migration).toContain('UNIQUE (work_item_id, work_item_version)');
    expect(migration).toContain('UNIQUE (source_system, source_event_key)');
    expect(migration).toContain('UNIQUE (idempotency_key)');
    expect(migration).toContain('UNIQUE (receipt_system, receipt_key)');
    expect(migration).toContain('company_work_events_receipt_fk');
    expect(migration).toContain('company_work_events_receipt_required_chk');
    expect(migration).toContain('company_work_receipts_action_binding_chk');
    expect(migration).toContain('company_work_items_completed_stage_chk');
    expect(migration).toContain('company_work_items_block_code_chk');
    expect(migration).toContain('company_work_items_failure_code_chk');
  });

  it('ships a non-auto-discovered rollback that refuses to erase history', () => {
    expect(rollback).toContain(
      'company work ledger contains history (items %, receipts %, events %)',
    );
    expect(rollback).toContain(
      'IF v_items <> 0 OR v_receipts <> 0 OR v_events <> 0',
    );
    expect(rollback).toContain(
      'DROP TABLE IF EXISTS business_v2.company_work_events',
    );
    expect(rollback).not.toContain('TRUNCATE');
  });
});
