import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_PREFIX,
  assertDisposableDatabaseName,
  generatedDisposableDatabaseName,
} from '../scripts/verify-student-enrollment-disposable.mjs';

describe('student enrollment disposable verifier safety', () => {
  it('accepts only generated-prefix disposable names', () => {
    expect(generatedDisposableDatabaseName()).toMatch(
      /^nc_student_enrollment_disposable_[a-z0-9_]+$/,
    );
    expect(
      assertDisposableDatabaseName(`${DISPOSABLE_PREFIX}fixture_12345678`),
    ).toBe(`${DISPOSABLE_PREFIX}fixture_12345678`);
    for (const unsafe of [
      'postgres',
      'nanoclaw_business',
      'production',
      'nc_student_enrollment_disposable_prod_12345678',
      `${DISPOSABLE_PREFIX}existing-name`,
    ])
      expect(() => assertDisposableDatabaseName(unsafe)).toThrow();
  });

  it('contains cleanup and refuses cluster-role mutation or production names', () => {
    const source = fs.readFileSync(
      path.resolve('scripts/verify-student-enrollment-disposable.mjs'),
      'utf8',
    );
    expect(source).toContain('finally');
    expect(source).toContain('dropDatabase(database)');
    expect(source).toContain('refusing existing database target');
    expect(source).toContain("const LOCAL_SOCKET = '/tmp'");
    expect(source).toContain("const LOCAL_PORT = '5432'");
    expect(source).toContain('refusing non-local PostgreSQL server');
    expect(source).toContain('childEnvironment()');
    expect(source).not.toContain('env: process.env');
    expect(source).not.toMatch(/CREATE\s+ROLE|ALTER\s+ROLE/i);
    expect(source).not.toContain("-d',\n    'nanoclaw_business'");
  });

  it('uses only migration 142 plus structure-only prerequisites', () => {
    const source = fs.readFileSync(
      path.resolve('scripts/verify-student-enrollment-disposable.mjs'),
      'utf8',
    );
    expect(source).toContain('142_student_enrollment_dark_foundation.sql');
    expect(source).toContain(
      'rollback_142_student_enrollment_dark_foundation.sql',
    );
    expect(source).toContain('CREATE TABLE business_v2.parties');
    expect(source).toContain('fn_company_work_append_only');
    expect(source).not.toContain('143_academy_capacity_dark.sql');
  });

  it('reason-checks expected failures and verifies sequence ownership/grants', () => {
    const source = fs.readFileSync(
      path.resolve('scripts/verify-student-enrollment-disposable.mjs'),
      'utf8',
    );
    expect(source).toContain(
      'expected failures require an expectedMessage regex',
    );
    expect(source).toContain('student_enrollment_seats');
    expect(source).toContain(
      'source_scope, source_object_type, source_object_id',
    );
    expect(source).toContain('append-only fixture relation');
    expect(source).toContain('student sequence count');
    expect(source).toContain('non-admin sequence owners');
    expect(source).toContain('non-admin sequence grants');
  });
});
