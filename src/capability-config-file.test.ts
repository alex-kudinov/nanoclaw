import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { setCapabilityEnforcedGroups } from './capability-config-file.js';

const roots: string[] = [];

function fixture(contents = 'SECRET=preserved\n'): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nanoclaw-capability-env-'),
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

describe('capability group configuration', () => {
  it('keeps dry-run read-only and reports normalized groups', () => {
    const envFile = fixture();
    const before = fs.readFileSync(envFile, 'utf8');
    expect(
      setCapabilityEnforcedGroups({
        envFile,
        groups: 'campanero',
        apply: false,
      }),
    ).toEqual({
      mode: 'dry-run',
      currentGroups: [],
      targetGroups: ['campanero'],
      globalEnforcementEnabled: false,
      backupPath: null,
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('backs up and atomically changes only the selected group key', () => {
    const envFile = fixture(
      'SECRET=preserved\nCAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0\n',
    );
    const result = setCapabilityEnforcedGroups({
      envFile,
      groups: 'campanero',
      apply: true,
      confirmHost: os.hostname(),
      now: new Date('2026-08-16T17:00:00.000Z'),
    });
    expect(result.mode).toBe('applied');
    expect(result.backupPath).toContain('.rollback-capabilities-');
    expect(fs.readFileSync(result.backupPath!, 'utf8')).toBe(
      'SECRET=preserved\nCAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0\n',
    );
    expect(fs.readFileSync(envFile, 'utf8')).toBe(
      'SECRET=preserved\nCAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0\nCAPABILITY_MANIFEST_ENFORCED_GROUPS=campanero\n',
    );
  });

  it('refuses invalid groups, duplicate keys, and global activation', () => {
    expect(() =>
      setCapabilityEnforcedGroups({
        envFile: fixture(),
        groups: 'feature-requests',
        apply: false,
      }),
    ).toThrow(/invalid_group_list/);
    expect(() =>
      setCapabilityEnforcedGroups({
        envFile: fixture(
          'CAPABILITY_MANIFEST_ENFORCED_GROUPS=campanero\nCAPABILITY_MANIFEST_ENFORCED_GROUPS=sales\n',
        ),
        groups: 'campanero',
        apply: false,
      }),
    ).toThrow(/appears more than once/);
    expect(() =>
      setCapabilityEnforcedGroups({
        envFile: fixture('CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=1\n'),
        groups: 'campanero',
        apply: false,
      }),
    ).toThrow(/global enforcement is enabled/);
  });
});
