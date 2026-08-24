import fs from 'fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/134_student_lifecycle_community_dark.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_134_student_lifecycle_community_dark.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 134 Community student lifecycle dark foundation', () => {
  it('creates all seven distinct lifecycle authorities', () => {
    for (const table of [
      'student_lifecycle_catalog_entries',
      'student_lifecycle_identity_links',
      'student_lifecycle_events',
      'student_lifecycle_enrollments',
      'student_lifecycle_reconciliation_runs',
      'student_lifecycle_state_history',
      'student_lifecycle_exceptions',
    ]) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
      expect(rollback).toContain(`DROP TABLE business_v2.${table}`);
    }
  });

  it('is Community-only and does not grant a minion or agent role', () => {
    expect(migration).toContain("workspace = 'community'");
    expect(migration).not.toMatch(/workspace\s+IN\s*\(/);
    expect(migration).not.toMatch(/TO nanoclaw_(?!admin)/);
    expect(migration).toContain('REVOKE ALL ON business_v2.%I FROM PUBLIC');
  });

  it('keeps every lifecycle state axis independent', () => {
    for (const column of [
      'access_state',
      'activation_state',
      'learning_state',
      'grading_state',
      'feedback_state',
      'certificate_state',
      'finance_state',
      'marketing_consent_state',
      'contact_suppression_state',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('enforces source identity, minimized facts, and immutable source fields', () => {
    expect(migration).toContain(
      'source_event_key           text NOT NULL UNIQUE',
    );
    expect(migration).toContain('octet_length(facts::text) <= 8192');
    expect(migration).toContain('fn_student_lifecycle_event_core_immutable');
    expect(migration).toContain('student_lifecycle_events_no_delete');
    expect(migration).toContain('student_lifecycle_history_append_only');
  });

  it('has no action outbox, recipient, content, email, or certificate URL fields', () => {
    expect(migration).not.toMatch(/CREATE TABLE[^;]*outbox/i);
    for (const forbidden of [
      'recipient_email',
      'message_body',
      'student_name',
      'raw_email',
      'certificate_url',
      'action_code',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it('refuses rollback after any lifecycle evidence exists', () => {
    expect(rollback).toContain('rollback 134 refused');
    for (const table of [
      'student_lifecycle_catalog_entries',
      'student_lifecycle_identity_links',
      'student_lifecycle_events',
      'student_lifecycle_enrollments',
      'student_lifecycle_reconciliation_runs',
      'student_lifecycle_state_history',
      'student_lifecycle_exceptions',
    ]) {
      expect(rollback).toContain(`SELECT 1 FROM business_v2.${table} LIMIT 1`);
    }
  });

  it('packages migration 134 and its guarded rollback in immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/134_student_lifecycle_community_dark.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_134_student_lifecycle_community_dark.sql'",
    );
  });
});
