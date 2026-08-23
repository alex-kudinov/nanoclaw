import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreHealerCompanyWorkConfig,
  setHealerCompanyWorkConfig,
} from './company-work-config-file.js';

const directories: string[] = [];
const SOURCE = 'healer:abcdef1234567890';

function fixture(contents = 'UNCHANGED=yes\n'): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'healer-work-config-'),
  );
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

describe('healer Company Work environment transaction', () => {
  it('produces a value-redacted exact-one dry run', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');
    const result = setHealerCompanyWorkConfig({
      envFile,
      mode: 'on',
      sourceKey: SOURCE,
      apply: false,
    });
    expect(result).toMatchObject({
      mode: 'dry-run',
      current: { enabled: false, active: false, valid: true },
      target: {
        enabled: true,
        active: true,
        valid: true,
        sourceCount: 1,
        maxItems: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain(SOURCE);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('requires exact host confirmation, backs up, applies, and restores', () => {
    const envFile = fixture();
    expect(() =>
      setHealerCompanyWorkConfig({
        envFile,
        mode: 'on',
        sourceKey: SOURCE,
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow(`--apply requires --confirm-host ${os.hostname()}`);
    const applied = setHealerCompanyWorkConfig({
      envFile,
      mode: 'on',
      sourceKey: SOURCE,
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-23T15:00:00.000Z'),
    });
    expect(applied.mode).toBe('applied');
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(envFile, 'utf8')).toContain(
      'COMPANY_HEALER_WORK_MAX_ITEMS=1',
    );
    expect(
      restoreHealerCompanyWorkConfig({
        envFile,
        backupFile: applied.backupPath!,
        confirmHost: os.hostname(),
      }).mode,
    ).toBe('applied');
    expect(fs.readFileSync(envFile, 'utf8')).toBe('UNCHANGED=yes\n');
  });

  it('rejects duplicate keys, invalid sources, and symlinks', () => {
    const duplicate = fixture(
      'COMPANY_HEALER_WORK_ENABLED=0\nCOMPANY_HEALER_WORK_ENABLED=1\n',
    );
    expect(() =>
      setHealerCompanyWorkConfig({
        envFile: duplicate,
        mode: 'off',
        apply: false,
      }),
    ).toThrow('appears more than once');
    expect(() =>
      setHealerCompanyWorkConfig({
        envFile: fixture(),
        mode: 'on',
        sourceKey: 'not-a-healer-key',
        apply: false,
      }),
    ).toThrow('invalid_source');
    const target = fixture();
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() =>
      setHealerCompanyWorkConfig({ envFile: link, mode: 'off', apply: false }),
    ).toThrow('must be a regular file');
  });
});
