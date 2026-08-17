import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreCompanyTimeTriggerConfig,
  setCompanyTimeTriggerConfig,
} from './company-time-trigger-config-file.js';

const temporaryDirectories: string[] = [];
const TASK_ID = 'task-followup-daily';
const BOUNDARY = '2026-08-17T14:00:00.000Z';

function fixture(contents = 'UNRELATED_VALUE=preserved\n'): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'time-trigger-test-'),
  );
  temporaryDirectories.push(directory);
  const file = path.join(directory, '.env');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Company scheduled-time trigger environment transaction', () => {
  it('produces a value-redacted dry-run without changing the file', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');

    const result = setCompanyTimeTriggerConfig({
      envFile,
      mode: 'on',
      taskId: TASK_ID,
      scheduledFor: BOUNDARY,
      apply: false,
    });

    expect(result).toEqual({
      mode: 'dry-run',
      current: {
        enabled: false,
        active: false,
        valid: true,
        taskCount: 0,
        scheduledFor: null,
        configurationError: null,
      },
      target: {
        enabled: true,
        active: true,
        valid: true,
        taskCount: 1,
        scheduledFor: BOUNDARY,
        configurationError: null,
      },
      backupPath: null,
    });
    expect(JSON.stringify(result)).not.toContain(TASK_ID);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('requires exact host confirmation, backs up, applies, and restores', () => {
    const envFile = fixture();
    expect(() =>
      setCompanyTimeTriggerConfig({
        envFile,
        mode: 'on',
        taskId: TASK_ID,
        scheduledFor: BOUNDARY,
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow(`--apply requires --confirm-host ${os.hostname()}`);

    const applied = setCompanyTimeTriggerConfig({
      envFile,
      mode: 'on',
      taskId: TASK_ID,
      scheduledFor: BOUNDARY,
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-17T13:00:00.000Z'),
    });
    expect(applied.mode).toBe('applied');
    expect(applied.backupPath).toContain(
      '.rollback-company-time-trigger-2026-08-17T13-00-00-000Z',
    );
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
    const changed = fs.readFileSync(envFile, 'utf8');
    expect(changed).toContain('UNRELATED_VALUE=preserved');
    expect(changed).toContain(`COMPANY_TIME_TRIGGER_TASK_ID=${TASK_ID}`);

    const restored = restoreCompanyTimeTriggerConfig({
      envFile,
      backupFile: applied.backupPath!,
      confirmHost: os.hostname(),
    });
    expect(restored.mode).toBe('applied');
    expect(fs.readFileSync(envFile, 'utf8')).toBe(
      'UNRELATED_VALUE=preserved\n',
    );
  });

  it('rejects duplicate keys, invalid targets, symlinks, and foreign backups', () => {
    const duplicate = fixture(
      'COMPANY_TIME_TRIGGER_ENABLED=0\nCOMPANY_TIME_TRIGGER_ENABLED=1\n',
    );
    expect(() =>
      setCompanyTimeTriggerConfig({
        envFile: duplicate,
        mode: 'off',
        apply: false,
      }),
    ).toThrow('appears more than once');

    const invalid = fixture();
    expect(() =>
      setCompanyTimeTriggerConfig({
        envFile: invalid,
        mode: 'on',
        taskId: 'task with spaces',
        scheduledFor: BOUNDARY,
        apply: false,
      }),
    ).toThrow('target time-trigger configuration is invalid');

    const target = fixture();
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() =>
      setCompanyTimeTriggerConfig({ envFile: link, mode: 'off', apply: false }),
    ).toThrow('must be a regular file');

    const backup = fixture('COMPANY_TIME_TRIGGER_ENABLED=0\n');
    expect(() =>
      restoreCompanyTimeTriggerConfig({
        envFile: target,
        backupFile: backup,
        confirmHost: os.hostname(),
      }),
    ).toThrow('backup is not a time-trigger backup');
  });
});
