import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  'data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql',
);
const rollbackPath = path.resolve(
  'data/business/migrations/nanoclaw-v2/rollback_142_student_enrollment_dark_foundation.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const rollback = fs.readFileSync(rollbackPath, 'utf8');

const tables = [
  'student_enrollment_orders',
  'student_enrollment_order_source_refs',
  'student_enrollment_evidence',
  'student_enrollment_seats',
  'student_financial_agreements',
  'student_financial_obligations',
  'student_enrollments_v2',
  'student_component_entitlements',
  'student_class_assignments',
  'student_projection_outbox',
  'student_projection_receipts',
  'student_enrollment_exceptions_v2',
  'student_enrollment_history',
];

describe('student enrollment dark migration', () => {
  it('creates every accepted entity without inserting data', () => {
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
    }
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+business_v2\b/i);
  });

  it('keeps source references unique and append-only', () => {
    expect(migration).toContain(
      'UNIQUE (source_scope, source_object_type, source_object_id)',
    );
    expect(migration).toContain(
      'CREATE TRIGGER student_enrollment_source_refs_append_only',
    );
    expect(migration).toContain(
      'CREATE TRIGGER student_enrollment_evidence_append_only',
    );
  });

  it('allows only one current enrollment per seat while preserving history', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX student_enrollments_v2_current_seat_uniq',
    );
    expect(migration).toContain("WHERE state IN ('pending', 'active', 'held')");
  });

  it('enforces bounded JSON and exact-readback receipt structures', () => {
    expect(migration).toContain('octet_length(payload_json::text) <= 8192');
    expect(migration).toContain('expected_readback_sha256 text NOT NULL');
    expect(migration).toContain(
      'CREATE TABLE business_v2.student_projection_receipts',
    );
    expect(migration).toContain(
      "stage IN ('requested', 'accepted', 'applied', 'readback', 'final')",
    );
  });

  it('owns every object as admin-only with no agent grants', () => {
    expect(migration).toContain('OWNER TO nanoclaw_admin');
    expect(migration).toContain('REVOKE ALL ON business_v2.%I FROM PUBLIC');
    expect(migration).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|EXECUTE).*\bTO\s+(?!nanoclaw_admin)/is,
    );
  });

  it('guards rollback after any evidence and drops only migration objects', () => {
    expect(rollback).toContain(
      'migration 142 rollback refused: student enrollment evidence exists',
    );
    for (const table of tables) {
      expect(rollback).toContain(`DROP TABLE business_v2.${table}`);
    }
    expect(rollback).not.toMatch(/DROP\s+(SCHEMA|DATABASE)/i);
  });

  it('packages migration and rollback in immutable releases', () => {
    const release = fs.readFileSync(
      path.resolve('scripts/build-release.mjs'),
      'utf8',
    );
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql'",
    );
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_142_student_enrollment_dark_foundation.sql'",
    );
  });

  it('remains unwired from the production composition root', () => {
    const index = fs.readFileSync(path.resolve('src/index.ts'), 'utf8');
    expect(index).not.toContain("from './student-enrollment-foundation.js'");
    expect(index).not.toContain('studentEnrollmentFoundation');
  });
});
