import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  restoreActionSafetyConfig,
  setActionSafetyMode,
} from './action-safety-config-file.js';

const roots: string[] = [];

function fixture(contents = 'SECRET=preserved\n'): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nanoclaw-action-safety-env-'),
  );
  roots.push(root);
  const envFile = path.join(root, '.env');
  fs.writeFileSync(envFile, contents, { mode: 0o600 });
  return envFile;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('action-safety configuration file', () => {
  it('keeps dry-run read-only and reports a global brake target', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');
    expect(
      setActionSafetyMode({
        envFile,
        mode: 'global',
        apply: false,
      }),
    ).toEqual({
      mode: 'dry-run',
      current: {
        enforcementEnabled: false,
        globalSafeMode: false,
        disabledSystems: [],
        valid: true,
      },
      target: {
        enforcementEnabled: false,
        globalSafeMode: true,
        disabledSystems: [],
        valid: true,
      },
      backupPath: null,
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('backs up, changes only brake keys, and restores exact bytes', () => {
    const original =
      'SECRET=preserved\nACTION_SAFETY_ENFORCEMENT_ENABLED=0\nCAPABILITY_MANIFEST_ENFORCED_GROUPS=campanero\n';
    const envFile = fixture(original);
    const applied = setActionSafetyMode({
      envFile,
      mode: 'global',
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-16T18:00:00.000Z'),
    });
    expect(applied.mode).toBe('applied');
    expect(applied.backupPath).toContain('.rollback-action-safety-');
    expect(fs.readFileSync(applied.backupPath!, 'utf8')).toBe(original);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(
      `${original}EXTERNAL_WRITE_SAFE_MODE=1\nEXTERNAL_WRITE_DISABLED_SYSTEMS=\n`,
    );
    expect(fs.statSync(applied.backupPath!).mode & 0o777).toBe(0o600);

    expect(
      restoreActionSafetyConfig({
        envFile,
        backupFile: applied.backupPath!,
        confirmHost: os.hostname(),
      }),
    ).toMatchObject({
      mode: 'restored',
      restored: {
        enforcementEnabled: false,
        globalSafeMode: false,
        disabledSystems: [],
        valid: true,
      },
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(original);
  });

  it('normalizes an explicit per-system brake', () => {
    const envFile = fixture();
    const result = setActionSafetyMode({
      envFile,
      mode: 'systems',
      systems: 'stripe,things,hive_firestore,gmail',
      apply: false,
    });
    expect(result.target).toMatchObject({
      globalSafeMode: false,
      disabledSystems: ['gmail', 'hive_firestore', 'stripe', 'things'],
      valid: true,
    });
  });

  it('preserves CRLF and unrelated bytes while changing brake lines', () => {
    const original =
      'SECRET = preserved\r\nEXTERNAL_WRITE_SAFE_MODE=0\r\nEXTERNAL_WRITE_DISABLED_SYSTEMS=\r\nTAIL=value\r\n';
    const envFile = fixture(original);
    setActionSafetyMode({
      envFile,
      mode: 'global',
      apply: true,
      confirmHost: os.hostname(),
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(
      'SECRET = preserved\r\nEXTERNAL_WRITE_SAFE_MODE=1\r\nEXTERNAL_WRITE_DISABLED_SYSTEMS=\r\nTAIL=value\r\n',
    );
  });

  it('refuses duplicate keys/systems, unknown systems, and envelope enforcement', () => {
    expect(() =>
      setActionSafetyMode({
        envFile: fixture(
          'EXTERNAL_WRITE_SAFE_MODE=0\nEXTERNAL_WRITE_SAFE_MODE=1\n',
        ),
        mode: 'off',
        apply: false,
      }),
    ).toThrow(/appears more than once/);
    expect(() =>
      setActionSafetyMode({
        envFile: fixture(),
        mode: 'systems',
        systems: 'gmail,gmail',
        apply: false,
      }),
    ).toThrow(/duplicates/);
    expect(() =>
      setActionSafetyMode({
        envFile: fixture(),
        mode: 'systems',
        systems: 'unknown',
        apply: false,
      }),
    ).toThrow(/unknown disabled system/);
    expect(() =>
      setActionSafetyMode({
        envFile: fixture('ACTION_SAFETY_ENFORCEMENT_ENABLED=1\n'),
        mode: 'global',
        apply: false,
      }),
    ).toThrow(/envelope enforcement is enabled/);
  });

  it('requires exact host confirmation and a matching backup path', () => {
    const envFile = fixture();
    expect(() =>
      setActionSafetyMode({
        envFile,
        mode: 'global',
        apply: true,
        confirmHost: 'wrong-host',
      }),
    ).toThrow(/confirm-host/);

    const unrelated = fixture('EXTERNAL_WRITE_SAFE_MODE=0\n');
    expect(() =>
      restoreActionSafetyConfig({
        envFile,
        backupFile: unrelated,
        confirmHost: os.hostname(),
      }),
    ).toThrow(/not an action-safety backup/);
  });
});
