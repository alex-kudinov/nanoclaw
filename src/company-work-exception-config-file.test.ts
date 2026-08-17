import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreCompanyWorkExceptionConfig,
  setCompanyWorkExceptionConfig,
} from './company-work-exception-config-file.js';

const directories: string[] = [];

function fixture(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-exception-env-'));
  directories.push(directory);
  const file = path.join(directory, '.env');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Company Work exception-loop environment transaction', () => {
  it('is dry-run by default and never exposes operator UID values', () => {
    const file = fixture('PROCUREMENT_OPERATOR_UIDS=U1234567,U7654321\n');
    const before = fs.readFileSync(file, 'utf8');
    const result = setCompanyWorkExceptionConfig({
      envFile: file,
      mode: 'on',
      operatorSourceKey: 'PROCUREMENT_OPERATOR_UIDS',
      apply: false,
    });
    expect(result).toMatchObject({
      mode: 'dry-run',
      target: { active: true, operatorCount: 2 },
      backupPath: null,
    });
    expect(JSON.stringify(result)).not.toContain('U1234567');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('requires an allowed, populated named-operator source', () => {
    const file = fixture('SOME_SECRET=U1234567\n');
    expect(() =>
      setCompanyWorkExceptionConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'SOME_SECRET',
        apply: false,
      }),
    ).toThrow('allowed named-operator source key');
    expect(() =>
      setCompanyWorkExceptionConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'HEALER_OPERATOR_UIDS',
        apply: false,
      }),
    ).toThrow('absent or empty');
  });

  it('refuses values outside the runtime safety bounds', () => {
    const file = fixture('HEALER_OPERATOR_UID=U1234567\n');
    expect(() =>
      setCompanyWorkExceptionConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'HEALER_OPERATOR_UID',
        intervalMs: 1,
        apply: false,
      }),
    ).toThrow('invalid_interval_ms');
    expect(() =>
      setCompanyWorkExceptionConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'HEALER_OPERATOR_UID',
        reportLimit: 501,
        apply: false,
      }),
    ).toThrow('invalid_report_limit');
  });

  it('applies atomically with a mode-preserving backup and restores exactly', () => {
    const file = fixture('HEALER_OPERATOR_UID=U1234567\nUNCHANGED=yes\n');
    const before = fs.readFileSync(file, 'utf8');
    const applied = setCompanyWorkExceptionConfig({
      envFile: file,
      mode: 'on',
      operatorSourceKey: 'HEALER_OPERATOR_UID',
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-17T02:30:00.000Z'),
    });
    expect(applied).toMatchObject({
      mode: 'applied',
      target: { active: true, operatorCount: 1 },
    });
    expect(applied.backupPath).not.toBeNull();
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, 'utf8')).toContain(
      'COMPANY_WORK_EXCEPTION_BRIEF_ENABLED=1',
    );
    const restored = restoreCompanyWorkExceptionConfig({
      envFile: file,
      backupFile: applied.backupPath!,
      confirmHost: os.hostname(),
    });
    expect(restored.mode).toBe('applied');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses apply on a mismatched hostname', () => {
    const file = fixture('HEALER_OPERATOR_UID=U1234567\n');
    expect(() =>
      setCompanyWorkExceptionConfig({
        envFile: file,
        mode: 'on',
        operatorSourceKey: 'HEALER_OPERATOR_UID',
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow('--confirm-host');
  });
});
