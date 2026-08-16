import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runPlutioOutboxReaperCli } from './plutio-outbox-reaper-cli.js';

describe('immutable Plutio reaper CLI', () => {
  it('initializes the operational registry before running the reaper', async () => {
    const calls: string[] = [];
    const result = {
      processed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
      deadLetterDetails: [],
    };
    const runReaper = vi.fn(async () => {
      calls.push('reaper');
      return result;
    });

    await expect(
      runPlutioOutboxReaperCli({
        initDatabase: () => calls.push('database'),
        runReaper,
      }),
    ).resolves.toBe(result);
    expect(calls).toEqual(['database', 'reaper']);
    expect(runReaper).toHaveBeenCalledOnce();
  });

  it('binds the operational launcher to the verified active release', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const launcher = fs.readFileSync(
      path.join(root, 'tools/plutio/run-reaper.sh'),
      'utf8',
    );
    const builder = fs.readFileSync(
      path.join(root, 'scripts/build-release.mjs'),
      'utf8',
    );

    expect(launcher).toContain('/usr/libexec/PlistBuddy');
    expect(launcher).toContain('scripts/verify-release.mjs');
    expect(launcher).toContain('dist/plutio-outbox-reaper-cli.js');
    expect(launcher).not.toContain('npx tsx');
    expect(builder).toContain("'tools/plutio'");
  });
});
