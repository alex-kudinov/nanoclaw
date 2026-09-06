import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveAcademyCapacityOperatorConfig,
  setAcademyCapacityOperatorConfig,
} from './academy-capacity-operator-config.js';

const directories: string[] = [];

function fixture(contents = 'UNRELATED=preserved\n'): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'academy-capacity-config-'),
  );
  directories.push(directory);
  const file = path.join(directory, '.env');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('Academy Capacity operator runtime gate', () => {
  it('documents and health-reports the active fail-closed switch', () => {
    expect(fs.readFileSync('.env.example', 'utf8')).toContain(
      'ACADEMY_CAPACITY_OPERATOR_ENABLED=0',
    );
    expect(fs.readFileSync('src/index.ts', 'utf8')).toContain(
      'academyCapacityOperator:',
    );
    expect(fs.readFileSync('scripts/build-release.mjs', 'utf8')).toContain(
      "'scripts/set-academy-capacity-operator.mjs'",
    );
  });

  it('is fail-closed for missing, off, or malformed configuration', () => {
    expect(resolveAcademyCapacityOperatorConfig(undefined)).toEqual({
      enabled: false,
      valid: true,
      reason: 'disabled',
    });
    expect(resolveAcademyCapacityOperatorConfig('0').enabled).toBe(false);
    expect(resolveAcademyCapacityOperatorConfig('yes')).toEqual({
      enabled: false,
      valid: false,
      reason: 'invalid_boolean',
    });
  });

  it('dry-runs, host-binds, backs up, applies, and preserves unrelated values', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');
    expect(
      setAcademyCapacityOperatorConfig({
        envFile,
        enabled: true,
        apply: false,
      }),
    ).toMatchObject({ mode: 'dry-run', target: { enabled: true } });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(() =>
      setAcademyCapacityOperatorConfig({
        envFile,
        enabled: true,
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow(`--apply requires --confirm-host ${os.hostname()}`);
    const applied = setAcademyCapacityOperatorConfig({
      envFile,
      enabled: true,
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-09-06T20:00:00.000Z'),
    });
    expect(applied.mode).toBe('applied');
    expect(applied.backupPath).toContain(
      '.rollback-academy-capacity-2026-09-06T20-00-00-000Z',
    );
    expect(fs.readFileSync(envFile, 'utf8')).toBe(
      'UNRELATED=preserved\nACADEMY_CAPACITY_OPERATOR_ENABLED=1\n',
    );
    expect(fs.readFileSync(applied.backupPath!, 'utf8')).toBe(before);
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);
  });

  it('rejects duplicate keys and symlink targets', () => {
    const duplicate = fixture(
      'ACADEMY_CAPACITY_OPERATOR_ENABLED=0\nACADEMY_CAPACITY_OPERATOR_ENABLED=1\n',
    );
    expect(() =>
      setAcademyCapacityOperatorConfig({
        envFile: duplicate,
        enabled: false,
        apply: false,
      }),
    ).toThrow('appears more than once');
    const target = fixture();
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() =>
      setAcademyCapacityOperatorConfig({
        envFile: link,
        enabled: false,
        apply: false,
      }),
    ).toThrow('must be a regular file');
  });
});
