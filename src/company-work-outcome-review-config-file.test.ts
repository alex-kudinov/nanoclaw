import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreCompanyWorkOutcomeReviewConfig,
  setCompanyWorkOutcomeReviewConfig,
} from './company-work-outcome-review-config-file.js';

const directories: string[] = [];

function fixture(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-review-env-'));
  directories.push(directory);
  const file = path.join(directory, '.env');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}

function operatorUidFixture(
  envFile: string,
  contents = 'U1234567\n',
  mode = 0o600,
): string {
  const file = path.join(path.dirname(envFile), 'outcome-review-operator.uid');
  fs.writeFileSync(file, contents, { mode });
  return file;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Company Work outcome-review environment transaction', () => {
  it('dry-runs a redacted exact target without changing the file', () => {
    const file = fixture(
      'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=U1234567\nUNCHANGED=yes\n',
    );
    const before = fs.readFileSync(file, 'utf8');
    const result = setCompanyWorkOutcomeReviewConfig({
      envFile: file,
      mode: 'on',
      operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
      intervalMs: 86_400_000,
      windowDays: 30,
      candidateLimit: 25,
      apply: false,
    });
    expect(result).toEqual({
      mode: 'dry-run',
      current: {
        enabled: false,
        active: false,
        valid: true,
        operatorCount: 0,
        intervalMs: 86_400_000,
        windowDays: 30,
        candidateLimit: 25,
        configurationError: null,
      },
      target: {
        enabled: true,
        active: true,
        valid: true,
        operatorCount: 1,
        intervalMs: 86_400_000,
        windowDays: 30,
        candidateLimit: 25,
        configurationError: null,
      },
      backupPath: null,
    });
    expect(JSON.stringify(result)).not.toContain('U1234567');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('accepts only the approved populated operator source', () => {
    const file = fixture('SOME_OPERATOR_UIDS=U1234567\n');
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'SOME_OPERATOR_UIDS',
        apply: false,
      }),
    ).toThrow('approved Company Work operator source key');
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
        apply: false,
      }),
    ).toThrow('absent or empty');

    const multiple = fixture(
      'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=U1234567,U7654321\n',
    );
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: multiple,
        mode: 'on',
        operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
        apply: false,
      }),
    ).toThrow('exactly one valid Slack UID');
  });

  it('accepts one owner-only UID file without exposing its value', () => {
    const file = fixture('UNCHANGED=yes\n');
    const operatorUidFile = operatorUidFixture(file);
    const result = setCompanyWorkOutcomeReviewConfig({
      envFile: file,
      mode: 'on',
      operatorUidFile,
      apply: false,
    });
    expect(result).toMatchObject({
      mode: 'dry-run',
      target: { active: true, operatorCount: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('U1234567');
  });

  it('refuses ambiguous, permissive, linked, or malformed UID files', () => {
    const file = fixture('UNCHANGED=yes\n');
    const secure = operatorUidFixture(file);
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
        operatorUidFile: secure,
        apply: false,
      }),
    ).toThrow('exactly one');

    fs.chmodSync(secure, 0o644);
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorUidFile: secure,
        apply: false,
      }),
    ).toThrow('owner-only');

    fs.chmodSync(secure, 0o600);
    const linked = path.join(path.dirname(file), 'operator-link.uid');
    fs.symlinkSync(secure, linked);
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorUidFile: linked,
        apply: false,
      }),
    ).toThrow('regular file');

    fs.writeFileSync(secure, 'U1234567,U7654321\n', { mode: 0o600 });
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorUidFile: secure,
        apply: false,
      }),
    ).toThrow('exactly one valid Slack UID');
  });

  it('refuses runtime-invalid safety bounds', () => {
    const file = fixture('COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=U1234567\n');
    const base = {
      envFile: file,
      mode: 'on' as const,
      operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
      apply: false,
    };
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({ ...base, intervalMs: 1 }),
    ).toThrow('invalid_interval_ms');
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({ ...base, windowDays: 366 }),
    ).toThrow('invalid_window_days');
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({ ...base, candidateLimit: 101 }),
    ).toThrow('invalid_candidate_limit');
  });

  it('applies atomically with a mode-preserving backup and restores exactly', () => {
    const file = fixture(
      'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=U1234567\nUNCHANGED=yes\n',
    );
    const before = fs.readFileSync(file, 'utf8');
    const applied = setCompanyWorkOutcomeReviewConfig({
      envFile: file,
      mode: 'on',
      operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-21T03:00:00.000Z'),
    });
    expect(applied).toMatchObject({
      mode: 'applied',
      target: { active: true, operatorCount: 1 },
    });
    expect(applied.backupPath).toContain(
      '.rollback-company-work-outcome-review-2026-08-21T03-00-00-000Z',
    );
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
    const changed = fs.readFileSync(file, 'utf8');
    expect(changed).toContain('UNCHANGED=yes');
    expect(changed).toContain('COMPANY_WORK_OUTCOME_REVIEW_ENABLED=1');

    const restored = restoreCompanyWorkOutcomeReviewConfig({
      envFile: file,
      backupFile: applied.backupPath!,
      confirmHost: os.hostname(),
    });
    expect(restored.mode).toBe('applied');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses mismatched hosts, symlink env files, and foreign backups', () => {
    const file = fixture('COMPANY_WORK_EXCEPTION_OPERATOR_UIDS=U1234567\n');
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'COMPANY_WORK_EXCEPTION_OPERATOR_UIDS',
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow('--confirm-host');

    const link = `${file}.link`;
    fs.symlinkSync(file, link);
    expect(() =>
      setCompanyWorkOutcomeReviewConfig({
        envFile: link,
        mode: 'off',
        apply: false,
      }),
    ).toThrow('regular file');

    const foreign = fixture('COMPANY_WORK_OUTCOME_REVIEW_ENABLED=0\n');
    expect(() =>
      restoreCompanyWorkOutcomeReviewConfig({
        envFile: file,
        backupFile: foreign,
        confirmHost: os.hostname(),
      }),
    ).toThrow('not an outcome-review backup');
  });
});
