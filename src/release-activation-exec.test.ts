import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  installed: {} as Record<string, unknown>,
  calls: [] as Array<{ file: string; args: string[] }>,
  health: [] as unknown[],
  printResults: [] as string[],
  failLsof: false,
}));

vi.mock('child_process', () => ({
  execFileSync: (file: string, args: string[]) => {
    state.calls.push({ file, args });
    if (file === '/usr/bin/plutil' && args[1] === 'json') {
      return JSON.stringify(state.installed);
    }
    if (args[0] === '--version') return 'v22.23.2\n';
    if (file === '/bin/launchctl' && args[0] === 'print') {
      return state.printResults.shift() ?? '';
    }
    if (file === '/usr/sbin/lsof' && state.failLsof) {
      throw Object.assign(new Error('lsof unavailable'), {
        stderr: 'permission denied',
      });
    }
    return '';
  },
}));

import { activateRelease } from './release-activation-exec.js';

const roots: string[] = [];
const oldCommit = 'a'.repeat(40);
const newCommit = 'b'.repeat(40);

function makeFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nanoclaw-activate-test-'),
  );
  roots.push(root);
  const oldRoot = path.join(root, oldCommit);
  const newRoot = path.join(root, newCommit);
  const plistPath = path.join(root, 'com.nanoclaw.plist');
  for (const release of [oldRoot, newRoot]) {
    fs.mkdirSync(path.join(release, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(release, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(release, 'scripts', 'verify-release.mjs'), '');
  }
  fs.writeFileSync(
    path.join(newRoot, 'dist', 'release-manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      commit: newCommit,
      sourceTree: 'c'.repeat(40),
      builtAt: '2026-08-02T00:00:00.000Z',
      nodePin: '22.23.2',
      nodeVersion: '22.23.2',
      artifactHash: 'd'.repeat(64),
      artifactFiles: 1,
    }),
  );
  const installed = {
    Label: 'com.nanoclaw',
    KeepAlive: true,
    WorkingDirectory: '/Users/operator/dev/NanoClaw',
    ProgramArguments: [
      '/Users/operator/.local/node/22.23.2/bin/node',
      path.join(oldRoot, 'dist', 'index.js'),
    ],
    EnvironmentVariables: {
      HOME: '/Users/operator',
      MAX_CONCURRENT_CONTAINERS: '7',
      NANOCLAW_CODE_ROOT: oldRoot,
      NANOCLAW_EXPECTED_RELEASE_COMMIT: oldCommit,
      NODE_ENV: 'production',
    },
  };
  const original = `${JSON.stringify(installed)}\n`;
  fs.writeFileSync(plistPath, original);
  state.installed = installed;
  return {
    oldRoot: fs.realpathSync(oldRoot),
    newRoot: fs.realpathSync(newRoot),
    plistPath: fs.realpathSync(plistPath),
    original,
  };
}

function health(commit: string, codeRoot?: string) {
  return {
    release: {
      verified: true,
      commit,
      ...(codeRoot ? { codeRoot, codeRootMatchesRelease: true } : {}),
    },
  };
}

beforeEach(() => {
  state.calls = [];
  state.health = [];
  state.printResults = [];
  state.failLsof = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => state.health.shift(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('release activation executor', () => {
  it('keeps dry-run free of launchctl and installed-plist writes', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];

    const result = await activateRelease({
      releaseDir: fixture.newRoot,
      plistPath: fixture.plistPath,
      healthUrl: 'http://127.0.0.1:8088/health',
      timeoutMs: 1_000,
      apply: false,
    });

    expect(result.mode).toBe('dry-run');
    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    expect(state.calls.some((call) => call.file === '/bin/launchctl')).toBe(
      false,
    );
  });

  it('performs exactly one legacy unload/load and proves target health', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit), health(newCommit, fixture.newRoot)];
    state.printResults = ['pid = 2147483647'];

    const result = await activateRelease({
      releaseDir: fixture.newRoot,
      plistPath: fixture.plistPath,
      healthUrl: 'http://127.0.0.1:8088/health',
      timeoutMs: 1_000,
      apply: true,
      confirmHost: os.hostname(),
    });

    expect(result.mode).toBe('applied');
    const launch = state.calls.filter((call) => call.file === '/bin/launchctl');
    expect(launch.filter((call) => call.args[0] === 'unload')).toHaveLength(1);
    expect(launch.filter((call) => call.args[0] === 'load')).toHaveLength(1);
    const candidate = JSON.parse(fs.readFileSync(fixture.plistPath, 'utf8'));
    expect(candidate.ProgramArguments[1]).toBe(
      path.join(fixture.newRoot, 'dist', 'index.js'),
    );
    expect(candidate.EnvironmentVariables.NANOCLAW_CODE_ROOT).toBe(
      fixture.newRoot,
    );
    expect(
      candidate.EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT,
    ).toBe(newCommit);
  });

  it('requires an explicit recovery flag to activate a stopped service', async () => {
    const fixture = makeFixture();
    state.health = [health(newCommit, fixture.newRoot)];
    state.printResults = [''];

    const result = await activateRelease({
      releaseDir: fixture.newRoot,
      plistPath: fixture.plistPath,
      healthUrl: 'http://127.0.0.1:8088/health',
      timeoutMs: 1_000,
      apply: true,
      recoverFromDown: true,
      confirmHost: os.hostname(),
    });

    expect(result.mode).toBe('applied');
    expect(result.healthVerified).toBe(true);
  });

  it('refuses a second activator while the fixed lock is held', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    state.printResults = ['pid = 2147483647'];
    fs.writeFileSync(
      `${fixture.plistPath}.activation.lock`,
      `${process.pid}\n`,
    );

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow(`lock is held by PID ${process.pid}`);

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    expect(
      state.calls.some(
        (call) => call.file === '/bin/launchctl' && call.args[0] === 'unload',
      ),
    ).toBe(false);
  });

  it('reclaims a stale activation lock before switching', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit), health(newCommit, fixture.newRoot)];
    state.printResults = ['pid = 2147483647'];
    fs.writeFileSync(`${fixture.plistPath}.activation.lock`, '2147483647\n');

    const result = await activateRelease({
      releaseDir: fixture.newRoot,
      plistPath: fixture.plistPath,
      healthUrl: 'http://127.0.0.1:8088/health',
      timeoutMs: 1_000,
      apply: true,
      confirmHost: os.hostname(),
    });

    expect(result.mode).toBe('applied');
    expect(fs.existsSync(`${fixture.plistPath}.activation.lock`)).toBe(false);
  });

  it('fails closed when listener ownership cannot be probed', async () => {
    const fixture = makeFixture();
    state.health = [health(newCommit, fixture.newRoot)];
    state.printResults = [''];
    state.failLsof = true;

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        recoverFromDown: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow('lsof -v failed: permission denied');

    expect(
      state.calls.some(
        (call) => call.file === '/bin/launchctl' && call.args[0] === 'unload',
      ),
    ).toBe(false);
  });

  it('restores the exact plist and attempts one rollback load on failed health', async () => {
    const fixture = makeFixture();
    state.health = [
      health(oldCommit),
      ...Array.from({ length: 10 }, () => health(newCommit, fixture.oldRoot)),
    ];
    state.printResults = ['pid = 2147483647', ''];

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow('timed out waiting for healthy release');

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    const launch = state.calls.filter((call) => call.file === '/bin/launchctl');
    expect(launch.filter((call) => call.args[0] === 'unload')).toHaveLength(2);
    expect(launch.filter((call) => call.args[0] === 'load')).toHaveLength(2);
    expect(
      fs
        .readdirSync(path.dirname(fixture.plistPath))
        .filter((name) => name.includes('.rollback-')),
    ).toHaveLength(1);
  });
});
