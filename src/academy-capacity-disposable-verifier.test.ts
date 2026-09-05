import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Academy capacity disposable verifier contract', () => {
  const source = fs.readFileSync(
    path.resolve('scripts/verify-academy-capacity-disposable.mjs'),
    'utf8',
  );
  const base = fs.readFileSync(
    path.resolve('scripts/verify-student-enrollment-disposable.mjs'),
    'utf8',
  );

  it('extends the corrected migration-142 verifier instead of creating another database runner', () => {
    expect(source).toContain('runStudentEnrollmentDisposableProof');
    expect(source).toContain('afterEnrollmentMigration');
    expect(source).toContain('afterSyntheticChain');
    expect(source).toContain('afterEnrollmentReapply');
    expect(source).not.toContain('spawnSync');
    expect(source).not.toContain('createdb');
    expect(source).not.toContain('dropdb');
    expect(base).toContain("const LOCAL_SOCKET = '/tmp'");
    expect(base).not.toContain('env: process.env');
  });

  it('applies only migrations 142 and 143 with reason-matched failures', () => {
    expect(base).toContain('142_student_enrollment_dark_foundation.sql');
    expect(source).toContain('143_academy_capacity_dark.sql');
    expect(source).toContain('rollback_143_academy_capacity_dark.sql');
    expect(source).toContain('expectFailure');
    expect(source).toContain('expectFileFailure');
    expect(source).toContain('migration 143 rollback refused');
  });

  it('checks occupancy, composite integrity, waitlist approval, and rollback ordering', () => {
    expect(source).toContain('assignment plus live reservations projection');
    expect(source).toContain('consumed reservation not double counted');
    expect(source).toContain('Key \\(order_id, seat_id\\)');
    expect(source).toContain('academy_waitlist_offers');
    expect(source).toContain(
      'capacity evidence retained after rollback refusal',
    );
    expect(source).toContain(
      'capacity-coupled class assignment explicitly removed before capacity rollback',
    );
    expect(source).toContain(
      'enrollment order foundation retained after capacity rollback',
    );
    expect(source).not.toContain('TRUNCATE');
    expect(source).toContain(
      'auxiliary mismatch order removed before enrollment proof resumes',
    );
    expect(source).toContain('capacity reapply rollback residue');
  });

  it('checks that its own generated database is absent after cleanup', () => {
    expect(source).toContain('databaseExists');
    expect(source).toContain(
      'disposable database residue detected after cleanup',
    );
  });
});
