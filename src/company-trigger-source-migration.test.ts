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
    '122_company_trigger_source_watermarks.sql',
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
    'rollback_122_company_trigger_source_watermarks.sql',
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  path.join(here, '..', 'scripts', 'build-release.mjs'),
  'utf8',
);

describe('Company OS trigger-source watermark migration', () => {
  it('adds immutable source definitions, append-only events, and CAS state', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_trigger_sources',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_trigger_watermark_events',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_trigger_watermark_state',
    );
    expect(migration).toContain('company_trigger_sources_append_only');
    expect(migration).toContain('company_trigger_watermark_events_append_only');
    expect(migration).toContain('fn_company_work_append_only');
    expect(migration).toContain(
      "status IN ('uninitialized', 'current', 'gap')",
    );
  });

  it('enforces closed accounting, gap shapes, and source-bound event links', () => {
    expect(migration).toContain(
      'observed_count = accepted_count + rejected_count',
    );
    expect(migration).toContain("event_type = 'gap_detected'");
    expect(migration).toContain("event_type = 'gap_reconciled'");
    expect(migration).toContain(
      '(definition_id, open_gap_event_id) REFERENCES',
    );
    expect(migration).toContain('(definition_id, last_event_id) REFERENCES');
  });

  it('contains no raw payload, prompt, message, activation, or execution fields', () => {
    for (const table of [
      'company_trigger_sources',
      'company_trigger_watermark_events',
      'company_trigger_watermark_state',
    ]) {
      const body = migration.match(
        new RegExp(
          `CREATE TABLE business_v2\\.${table} \\(([\\s\\S]*?)\\n\\);`,
        ),
      )?.[1];
      expect(body).toBeDefined();
      expect(body).not.toMatch(
        /raw_|payload|message|subject|content|prompt|args|action_envelope|skill_version|enabled/i,
      );
    }
  });

  it('keeps all three tables admin-only and grants no agent role', () => {
    for (const table of [
      'company_trigger_sources',
      'company_trigger_watermark_events',
      'company_trigger_watermark_state',
    ]) {
      expect(migration).toContain(
        `ALTER TABLE business_v2.${table} OWNER TO nanoclaw_admin`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON business_v2.${table} FROM PUBLIC`,
      );
      expect(migration).toContain(
        `GRANT ALL ON business_v2.${table} TO nanoclaw_admin`,
      );
    }
    expect(migration).not.toMatch(/GRANT\s+[^;]+\s+TO\s+(?!nanoclaw_admin)/i);
  });

  it('refuses to erase any recorded definition, event, or state', () => {
    expect(rollback).toContain(
      'EXISTS (SELECT 1 FROM business_v2.company_trigger_sources LIMIT 1)',
    );
    expect(rollback).toContain(
      'SELECT 1 FROM business_v2.company_trigger_watermark_events LIMIT 1',
    );
    expect(rollback).toContain(
      'SELECT 1 FROM business_v2.company_trigger_watermark_state LIMIT 1',
    );
    expect(rollback).toContain(
      'refusing to drop populated company_trigger source/watermark history',
    );
  });

  it('binds migration 122 and its guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/122_company_trigger_source_watermarks.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_122_company_trigger_source_watermarks.sql'",
    );
  });
});
