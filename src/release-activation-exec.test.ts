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
  failShlock: false,
  failKnowledgeCheck: false,
  healthFallback: undefined as unknown,
}));

vi.mock('child_process', () => ({
  execFileSync: (file: string, args: string[]) => {
    state.calls.push({ file, args });
    if (file === '/usr/bin/plutil' && args[1] === 'json') {
      return JSON.stringify(state.installed);
    }
    if (args[0] === '--version') return 'v22.23.2\n';
    if (
      file === '/usr/bin/env' &&
      args[0] === 'python3' &&
      state.failKnowledgeCheck
    ) {
      throw Object.assign(new Error('knowledge check failed'), {
        stderr: 'stale Coaching Supervision Mastery facts',
      });
    }
    if (file === '/bin/launchctl' && args[0] === 'print') {
      return state.printResults.shift() ?? '';
    }
    if (file === '/usr/sbin/lsof' && state.failLsof) {
      throw Object.assign(new Error('lsof unavailable'), {
        stderr: 'permission denied',
      });
    }
    if (file === '/usr/bin/shlock') {
      const lockPath = args[1];
      const requestedPid = args[3];
      if (state.failShlock) throw new Error('shlock failed');
      // Match the macOS binary: its link(2) claim is atomic, but it refuses
      // every extant lock, including one whose recorded PID is dead.
      if (fs.existsSync(lockPath)) throw new Error('lock held');
      fs.writeFileSync(lockPath, `${requestedPid}\n`, { mode: 0o600 });
      return '';
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
  fs.mkdirSync(path.join(newRoot, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(newRoot, 'tools', 'sync-program-facts.py'), '');
  const operationalRoot = path.join(root, 'operational');
  fs.mkdirSync(operationalRoot);
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
    WorkingDirectory: operationalRoot,
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
    operationalRoot,
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
  state.failShlock = false;
  state.failKnowledgeCheck = false;
  state.healthFallback = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => state.health.shift() ?? state.healthFallback,
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
    expect(state.calls).toContainEqual({
      file: '/usr/sbin/lsof',
      args: ['-v'],
    });
    expect(state.calls).toContainEqual({
      file: '/usr/bin/env',
      args: [
        'python3',
        path.join(fixture.newRoot, 'tools', 'sync-program-facts.py'),
        'check',
        '--source',
        path.join(fixture.newRoot, '.no-external-program-facts-source'),
        '--target-root',
        fixture.operationalRoot,
      ],
    });
  });

  it('refuses activation when the effective operational knowledge is stale', async () => {
    const fixture = makeFixture();
    state.failKnowledgeCheck = true;

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: false,
      }),
    ).rejects.toThrow('stale Coaching Supervision Mastery facts');
    expect(state.calls.some((call) => call.file === '/bin/launchctl')).toBe(
      false,
    );
    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
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

  it('refuses a second activator while a live foreign PID holds the lock', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    state.printResults = ['pid = 2147483647'];
    fs.writeFileSync(
      `${fixture.plistPath}.activation.lock`,
      `${process.ppid}\n`,
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
    ).rejects.toThrow(`lock is held by live PID ${process.ppid}`);

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    expect(
      state.calls.some(
        (call) => call.file === '/bin/launchctl' && call.args[0] === 'unload',
      ),
    ).toBe(false);
  });

  it('refuses a stale lock until an operator verifies and removes it', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    state.printResults = ['pid = 2147483647'];
    fs.writeFileSync(`${fixture.plistPath}.activation.lock`, '2147483647\n');

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow('lock is stale from dead PID 2147483647');

    expect(fs.existsSync(`${fixture.plistPath}.activation.lock`)).toBe(true);
    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    expect(state.calls).toContainEqual({
      file: '/usr/bin/shlock',
      args: [
        '-f',
        `${fixture.plistPath}.activation.lock`,
        '-p',
        String(process.pid),
      ],
    });
  });

  it('reports a failed atomic claim with no readable owner', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    state.printResults = ['pid = 2147483647'];
    state.failShlock = true;

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow('lock has an unreadable or missing owner (unknown)');

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
  });

  it('rejects a symlink alias of the already-active release', async () => {
    const fixture = makeFixture();
    const alias = path.join(path.dirname(fixture.oldRoot), 'active-alias');
    fs.symlinkSync(fixture.oldRoot, alias);
    fs.writeFileSync(
      path.join(fixture.oldRoot, 'dist', 'release-manifest.json'),
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
    state.installed = {
      ...state.installed,
      ProgramArguments: [
        '/Users/operator/.local/node/22.23.2/bin/node',
        path.join(alias, 'dist', 'index.js'),
      ],
      EnvironmentVariables: {
        ...(state.installed.EnvironmentVariables as Record<string, string>),
        NANOCLAW_CODE_ROOT: alias,
      },
    };

    await expect(
      activateRelease({
        releaseDir: fixture.oldRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: false,
      }),
    ).rejects.toThrow('target release directory is already active');

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
  });

  it('reports a pruned installed rollback release before any mutation', async () => {
    const fixture = makeFixture();
    fs.rmSync(fixture.oldRoot, { recursive: true });

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: false,
      }),
    ).rejects.toThrow('installed rollback release directory is unavailable');

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
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

  it('fails dry-run when the atomic lock tool is unavailable', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    const access = vi.spyOn(fs, 'accessSync').mockImplementation((target) => {
      if (target === '/usr/bin/shlock') {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
    });

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: false,
      }),
    ).rejects.toThrow('requires executable /usr/bin/shlock');

    expect(fs.readFileSync(fixture.plistPath, 'utf8')).toBe(fixture.original);
    access.mockRestore();
  });

  it('restores the exact plist and attempts one rollback load on failed health', async () => {
    const fixture = makeFixture();
    state.health = [health(oldCommit)];
    state.printResults = ['pid = 2147483647', ''];
    state.healthFallback = health(oldCommit, fixture.oldRoot);

    await expect(
      activateRelease({
        releaseDir: fixture.newRoot,
        plistPath: fixture.plistPath,
        healthUrl: 'http://127.0.0.1:8088/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      }),
    ).rejects.toThrow(
      /timed out waiting for healthy release.*rollback restored and health-verified/,
    );

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
