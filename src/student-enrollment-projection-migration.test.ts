import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(
    'data/business/migrations/nanoclaw-v2/148_student_enrollment_projection_foundation.sql',
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  path.resolve(
    'data/business/migrations/nanoclaw-v2/rollback_148_student_enrollment_projection_foundation.sql',
  ),
  'utf8',
);

describe('student enrollment projection migration', () => {
  it('adds versioned target identity and uncertain-acceptance state without data', () => {
    for (const field of [
      'target_idempotency_key',
      'destination_key',
      'provider_operation_id',
      'last_readback_sha256',
      'uncertain_acceptance',
      'supersedes_outbox_id',
    ])
      expect(migration).toContain(field);
    expect(migration).toContain('student_projection_target_idempotency_uniq');
    expect(migration).toContain("NOT uncertain_acceptance OR state = 'held'");
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });
  it('keeps rollback guarded and narrow', () => {
    expect(rollback).toContain(
      'refusing projection-foundation rollback while delivery evidence exists',
    );
    expect(rollback).not.toMatch(/DROP\s+(SCHEMA|DATABASE)/i);
  });
  it('remains unwired from the composition root', () => {
    const index = fs.readFileSync(path.resolve('src/index.ts'), 'utf8');
    expect(index).not.toContain("from './student-enrollment-projection.js'");
  });
});
