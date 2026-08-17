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
    '121_company_trigger_occurrences.sql',
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
    'rollback_121_company_trigger_occurrences.sql',
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  path.join(here, '..', 'scripts', 'build-release.mjs'),
  'utf8',
);

describe('Company OS normalized trigger migration', () => {
  it('adds one content-free, constrained occurrence table', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_trigger_occurrences',
    );
    expect(migration).toContain('contract_version = 1');
    for (const kind of [
      'time',
      'gmail',
      'webhook',
      'topic',
      'business_condition',
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    expect(migration).toContain("requested_operation IN ('create', 'resume')");
    expect(migration).toContain(
      'UNIQUE (trigger_kind, source_system, source_key, occurrence_key)',
    );
    expect(migration).toContain('company_trigger_occurrences_append_only');
    expect(migration).toContain('fn_company_work_append_only');
  });

  it('keeps the base table admin-only and grants no agent role', () => {
    expect(migration).toContain(
      'ALTER TABLE business_v2.company_trigger_occurrences OWNER TO nanoclaw_admin',
    );
    expect(migration).toContain(
      'REVOKE ALL ON business_v2.company_trigger_occurrences FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT ALL ON business_v2.company_trigger_occurrences TO nanoclaw_admin',
    );
    expect(migration).not.toMatch(/GRANT\s+[^;]+\s+TO\s+(?!nanoclaw_admin)/i);
  });

  it('contains no raw payload, message, prompt, or action-execution column', () => {
    const createTable = migration.match(
      /CREATE TABLE business_v2\.company_trigger_occurrences \(([\s\S]*?)\n\);/,
    )?.[1];
    expect(createTable).toBeDefined();
    expect(createTable).not.toMatch(
      /raw_|payload_json|payload_body|message|subject|content|prompt|args|action_envelope|skill_version/i,
    );
  });

  it('refuses to erase populated occurrence history', () => {
    expect(rollback).toContain(
      'EXISTS (SELECT 1 FROM business_v2.company_trigger_occurrences LIMIT 1)',
    );
    expect(rollback).toContain(
      'refusing to drop populated company_trigger_occurrences history',
    );
    expect(rollback).toContain(
      'DROP TABLE IF EXISTS business_v2.company_trigger_occurrences',
    );
  });

  it('binds migration 121 and its guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/121_company_trigger_occurrences.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_121_company_trigger_occurrences.sql'",
    );
  });
});
