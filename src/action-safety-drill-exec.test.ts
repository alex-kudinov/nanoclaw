import os from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { runActionSafetyProductionDrill } from './action-safety-drill-exec.js';

const release = 'a'.repeat(40);
const actionOff = {
  enforcementEnabled: false,
  globalSafeMode: false,
  disabledSystems: [],
  valid: true,
};
const actionOn = { ...actionOff, globalSafeMode: true };
const capabilities = {
  config: {
    enforcementEnabled: true,
    enforcedGroups: ['campanero'],
    valid: true,
  },
  trackedManifestCount: 18,
  validManifestCount: 18,
  invalidManifestCount: 0,
};

function health(globalSafeMode: boolean) {
  return {
    release: {
      verified: true,
      commit: release,
      codeRootMatchesRelease: true,
    },
    channels: {
      slack: {
        connected: true,
        diagnostics: { outgoingQueueDepth: 0 },
      },
      gmail: { connected: true },
    },
    activeContainers: 0,
    queue: { activeCount: 0, waitingGroups: [] },
    actionSafety: { config: globalSafeMode ? actionOn : actionOff },
    capabilityManifests: capabilities,
  };
}

const boundaryResult = {
  config: actionOn,
  denials: [
    { system: 'gmail' as const, code: 'global_safe_mode' as const },
    { system: 'gmail' as const, code: 'global_safe_mode' as const },
    { system: 'slack' as const, code: 'global_safe_mode' as const },
    { system: 'courses_smtp' as const, code: 'global_safe_mode' as const },
    { system: 'plutio' as const, code: 'global_safe_mode' as const },
    { system: 'stripe' as const, code: 'global_safe_mode' as const },
    { system: 'hive_firestore' as const, code: 'global_safe_mode' as const },
  ],
  tripwires: {
    gmailClient: false,
    gmailReplySend: false,
    plutioChild: false,
    stripeChild: false,
    stripeLifecycleEnqueue: false,
    hiveFirestore: false,
  },
  slackOutgoingQueueDepth: 0,
  courses: {
    smtpAllowed: false,
    projectedSecretKeys: [],
    emailToolMounted: false,
  },
};

describe('production action-safety drill executor', () => {
  it('keeps dry-run read-only', async () => {
    const setMode = vi.fn(() => ({
      mode: 'dry-run' as const,
      current: actionOff,
      target: actionOn,
      backupPath: null,
    }));
    const restore = vi.fn();
    const runBoundaryDrill = vi.fn();

    const result = await runActionSafetyProductionDrill(
      {
        envFile: '/tmp/nanoclaw.env',
        expectedRelease: release,
        healthUrl: 'http://127.0.0.1/health',
        timeoutMs: 1_000,
        apply: false,
      },
      {
        getHealth: async () => health(false),
        setMode,
        restore,
        runBoundaryDrill,
      },
    );

    expect(result.mode).toBe('dry-run');
    expect(setMode).toHaveBeenCalledWith(
      expect.objectContaining({ apply: false, mode: 'global' }),
    );
    expect(restore).not.toHaveBeenCalled();
    expect(runBoundaryDrill).not.toHaveBeenCalled();
  });

  it('observes the live brake, runs boundaries, and restores exactly', async () => {
    const states = [health(false), health(true), health(false)];
    const restore = vi.fn(() => ({
      mode: 'restored' as const,
      restored: actionOff,
      backupPath: '/tmp/nanoclaw.env.rollback-action-safety-test',
    }));
    const onArmed = vi.fn();

    const result = await runActionSafetyProductionDrill(
      {
        envFile: '/tmp/nanoclaw.env',
        expectedRelease: release,
        healthUrl: 'http://127.0.0.1/health',
        timeoutMs: 1_000,
        apply: true,
        confirmHost: os.hostname(),
      },
      {
        getHealth: async () => states.shift(),
        setMode: () => ({
          mode: 'applied',
          current: actionOff,
          target: actionOn,
          backupPath: '/tmp/nanoclaw.env.rollback-action-safety-test',
        }),
        restore,
        runBoundaryDrill: async () => boundaryResult,
        delay: async () => {},
        onArmed,
      },
    );

    expect(result).toMatchObject({
      mode: 'applied-restored',
      liveSafeModeObserved: true,
      restored: true,
      boundaryDrill: boundaryResult,
    });
    expect(onArmed).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
  });

  it('restores the exact backup when a boundary drill fails', async () => {
    const states = [health(false), health(true), health(false)];
    const restore = vi.fn(() => ({
      mode: 'restored' as const,
      restored: actionOff,
      backupPath: '/tmp/nanoclaw.env.rollback-action-safety-test',
    }));

    await expect(
      runActionSafetyProductionDrill(
        {
          envFile: '/tmp/nanoclaw.env',
          expectedRelease: release,
          healthUrl: 'http://127.0.0.1/health',
          timeoutMs: 1_000,
          apply: true,
          confirmHost: os.hostname(),
        },
        {
          getHealth: async () => states.shift(),
          setMode: () => ({
            mode: 'applied',
            current: actionOff,
            target: actionOn,
            backupPath: '/tmp/nanoclaw.env.rollback-action-safety-test',
          }),
          restore,
          runBoundaryDrill: async () => {
            throw new Error('synthetic boundary failure');
          },
          delay: async () => {},
        },
      ),
    ).rejects.toThrow(/failed after exact configuration restoration/);
    expect(restore).toHaveBeenCalledOnce();
  });

  it('refuses a busy service before editing configuration', async () => {
    const busy = health(false);
    busy.activeContainers = 1;
    const setMode = vi.fn();

    await expect(
      runActionSafetyProductionDrill(
        {
          envFile: '/tmp/nanoclaw.env',
          expectedRelease: release,
          healthUrl: 'http://127.0.0.1/health',
          timeoutMs: 1_000,
          apply: true,
          confirmHost: os.hostname(),
        },
        { getHealth: async () => busy, setMode },
      ),
    ).rejects.toThrow(/zero active containers/);
    expect(setMode).not.toHaveBeenCalled();
  });
});
