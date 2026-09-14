import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreTandemIdentityD2Config,
  setTandemIdentityD2Config,
} from './d2-config-file.js';

const directories: string[] = [];

function fixture(contents = 'UNCHANGED=yes\n'): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'identity-d2-config-'),
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

describe('Tandem Identity D2 environment transaction', () => {
  it('produces a value-redacted fixed-boundary dry run', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');
    expect(
      setTandemIdentityD2Config({
        envFile,
        mode: 'on',
        apply: false,
      }),
    ).toMatchObject({
      mode: 'dry-run',
      current: { enabled: false, valid: true },
      target: {
        enabled: true,
        valid: true,
        batchLimit: 500,
        intervalMs: 300_000,
      },
      backupPath: null,
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('requires exact host confirmation, backs up, applies, and restores', () => {
    const envFile = fixture();
    expect(() =>
      setTandemIdentityD2Config({
        envFile,
        mode: 'on',
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow(`--apply requires --confirm-host ${os.hostname()}`);
    const applied = setTandemIdentityD2Config({
      envFile,
      mode: 'on',
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-09-14T02:45:00Z'),
    });
    expect(applied.mode).toBe('applied');
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(envFile, 'utf8')).toContain(
      'TANDEM_IDENTITY_D2_SHADOW_ENABLED=1',
    );
    expect(
      restoreTandemIdentityD2Config({
        envFile,
        backupFile: applied.backupPath!,
        confirmHost: os.hostname(),
      }).mode,
    ).toBe('applied');
    expect(fs.readFileSync(envFile, 'utf8')).toBe('UNCHANGED=yes\n');
  });

  it('rejects duplicate keys and symlinks', () => {
    const duplicate = fixture(
      'TANDEM_IDENTITY_D2_SHADOW_ENABLED=0\nTANDEM_IDENTITY_D2_SHADOW_ENABLED=1\n',
    );
    expect(() =>
      setTandemIdentityD2Config({
        envFile: duplicate,
        mode: 'off',
        apply: false,
      }),
    ).toThrow('appears more than once');
    const target = fixture();
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() =>
      setTandemIdentityD2Config({
        envFile: link,
        mode: 'off',
        apply: false,
      }),
    ).toThrow('must be a regular file');
  });
});
