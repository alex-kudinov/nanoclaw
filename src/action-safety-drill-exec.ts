import os from 'node:os';

import {
  restoreActionSafetyConfig,
  setActionSafetyMode,
  type ActionSafetyConfigFileResult,
  type RestoreActionSafetyConfigResult,
} from './action-safety-config-file.js';
import {
  runInstalledActionSafetyBoundaryDrill,
  type ActionSafetyBoundaryDrillResult,
} from './action-safety-boundary-drill.js';

export interface ActionSafetyDrillOptions {
  envFile: string;
  expectedRelease: string;
  healthUrl: string;
  timeoutMs: number;
  apply: boolean;
  confirmHost?: string;
}

interface ActionSafetyDrillDependencies {
  getHealth?: () => Promise<unknown>;
  setMode?: typeof setActionSafetyMode;
  restore?: typeof restoreActionSafetyConfig;
  runBoundaryDrill?: typeof runInstalledActionSafetyBoundaryDrill;
  delay?: (milliseconds: number) => Promise<void>;
  onArmed?: (event: {
    mode: 'safe-mode-armed';
    backupPath: string;
    target: ActionSafetyConfigFileResult['target'];
  }) => void;
}

interface HealthRecord {
  release: {
    verified?: boolean;
    commit?: string;
    codeRootMatchesRelease?: boolean;
  };
  channels: Record<
    string,
    {
      connected?: boolean;
      diagnostics?: Record<string, string | number | boolean | null>;
    }
  >;
  activeContainers: number;
  queue: {
    activeCount?: number;
    waitingGroups?: unknown[];
  };
  actionSafety: {
    config: {
      enforcementEnabled?: boolean;
      globalSafeMode?: boolean;
      disabledSystems?: unknown[];
      valid?: boolean;
    };
  };
  capabilityManifests: {
    config: {
      enforcementEnabled?: boolean;
      enforcedGroups?: unknown[];
      valid?: boolean;
      errorCode?: string;
    };
    trackedManifestCount?: number;
    validManifestCount?: number;
    invalidManifestCount?: number;
  };
}

export interface ActionSafetyDrillResult {
  mode: 'dry-run' | 'applied-restored';
  expectedRelease: string;
  backupPath: string | null;
  plan: ActionSafetyConfigFileResult;
  liveSafeModeObserved: boolean;
  restored: boolean;
  boundaryDrill: ActionSafetyBoundaryDrillResult | null;
  before: ReturnType<typeof summarizeHealth>;
  during: ReturnType<typeof summarizeHealth> | null;
  after: ReturnType<typeof summarizeHealth> | null;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing or malformed`);
  }
  return value as Record<string, unknown>;
}

function parseHealth(value: unknown): HealthRecord {
  const health = asRecord(value, 'health');
  return {
    release: asRecord(health.release, 'health.release'),
    channels: asRecord(
      health.channels,
      'health.channels',
    ) as HealthRecord['channels'],
    activeContainers: Number(health.activeContainers),
    queue: asRecord(health.queue, 'health.queue'),
    actionSafety: asRecord(
      health.actionSafety,
      'health.actionSafety',
    ) as unknown as HealthRecord['actionSafety'],
    capabilityManifests: asRecord(
      health.capabilityManifests,
      'health.capabilityManifests',
    ) as unknown as HealthRecord['capabilityManifests'],
  };
}

function capabilitySignature(health: HealthRecord): string {
  return JSON.stringify(health.capabilityManifests);
}

function assertHealth(
  health: HealthRecord,
  expectedRelease: string,
  expectedGlobalSafeMode: boolean,
  expectedCapabilitySignature?: string,
): void {
  if (
    health.release.verified !== true ||
    health.release.commit !== expectedRelease ||
    health.release.codeRootMatchesRelease !== true
  ) {
    throw new Error('health does not prove the exact expected release');
  }
  for (const channel of ['slack', 'gmail']) {
    if (health.channels[channel]?.connected !== true) {
      throw new Error(`${channel} channel is not connected`);
    }
  }
  if (
    !Number.isFinite(health.activeContainers) ||
    health.activeContainers !== 0
  ) {
    throw new Error('action-safety drill requires zero active containers');
  }
  if (
    health.queue.activeCount !== 0 ||
    !Array.isArray(health.queue.waitingGroups) ||
    health.queue.waitingGroups.length !== 0
  ) {
    throw new Error('action-safety drill requires an empty execution queue');
  }
  if (health.channels.slack?.diagnostics?.outgoingQueueDepth !== 0) {
    throw new Error(
      'action-safety drill requires an empty Slack outbound queue',
    );
  }
  const actionConfig = asRecord(
    health.actionSafety.config,
    'health.actionSafety.config',
  );
  if (
    actionConfig.valid !== true ||
    actionConfig.enforcementEnabled !== false ||
    actionConfig.globalSafeMode !== expectedGlobalSafeMode ||
    !Array.isArray(actionConfig.disabledSystems) ||
    actionConfig.disabledSystems.length !== 0
  ) {
    throw new Error(
      `health action-safety state does not match global=${expectedGlobalSafeMode}`,
    );
  }
  const capabilityConfig = asRecord(
    health.capabilityManifests.config,
    'health.capabilityManifests.config',
  );
  if (
    capabilityConfig.valid !== true ||
    health.capabilityManifests.invalidManifestCount !== 0
  ) {
    throw new Error('capability manifest health is invalid');
  }
  if (
    expectedCapabilitySignature !== undefined &&
    capabilitySignature(health) !== expectedCapabilitySignature
  ) {
    throw new Error('capability manifest health changed during the drill');
  }
}

function summarizeHealth(health: HealthRecord) {
  return {
    release: {
      verified: health.release.verified === true,
      commit: health.release.commit ?? null,
      codeRootMatchesRelease: health.release.codeRootMatchesRelease === true,
    },
    channels: {
      slackConnected: health.channels.slack?.connected === true,
      gmailConnected: health.channels.gmail?.connected === true,
      slackOutgoingQueueDepth:
        health.channels.slack?.diagnostics?.outgoingQueueDepth ?? null,
    },
    activeContainers: health.activeContainers,
    queue: {
      activeCount: health.queue.activeCount ?? null,
      waitingCount: Array.isArray(health.queue.waitingGroups)
        ? health.queue.waitingGroups.length
        : null,
    },
    actionSafety: health.actionSafety.config,
    capabilityManifests: health.capabilityManifests,
  };
}

async function getHealthFromUrl(
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
  });
  if (!response.ok) throw new Error(`health returned HTTP ${response.status}`);
  return response.json();
}

async function waitForHealth(
  getHealth: () => Promise<unknown>,
  delay: (milliseconds: number) => Promise<void>,
  timeoutMs: number,
  validate: (health: HealthRecord) => void,
): Promise<HealthRecord> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  do {
    try {
      const health = parseHealth(await getHealth());
      validate(health);
      return health;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(
    `timed out waiting for health: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function runActionSafetyProductionDrill(
  options: ActionSafetyDrillOptions,
  dependencies: ActionSafetyDrillDependencies = {},
): Promise<ActionSafetyDrillResult> {
  if (!/^[a-f0-9]{40}$/.test(options.expectedRelease)) {
    throw new Error('expected release must be a full 40-character Git commit');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error('timeout must be at least 1000ms');
  }

  const getHealth =
    dependencies.getHealth ??
    (() => getHealthFromUrl(options.healthUrl, options.timeoutMs));
  const delay =
    dependencies.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const setMode = dependencies.setMode ?? setActionSafetyMode;
  const restore = dependencies.restore ?? restoreActionSafetyConfig;
  const runBoundaryDrill =
    dependencies.runBoundaryDrill ?? runInstalledActionSafetyBoundaryDrill;

  const before = parseHealth(await getHealth());
  assertHealth(before, options.expectedRelease, false);
  const capabilitiesBefore = capabilitySignature(before);
  const confirmedHost = options.confirmHost ?? '';
  if (options.apply && confirmedHost !== os.hostname()) {
    throw new Error(`--apply requires --confirm-host ${os.hostname()}`);
  }
  const plan = setMode({
    envFile: options.envFile,
    mode: 'global',
    apply: options.apply,
    confirmHost: confirmedHost,
  });
  if (!options.apply) {
    if (plan.mode !== 'dry-run') {
      throw new Error('dry-run expected a configuration change plan');
    }
    return {
      mode: 'dry-run',
      expectedRelease: options.expectedRelease,
      backupPath: null,
      plan,
      liveSafeModeObserved: false,
      restored: false,
      boundaryDrill: null,
      before: summarizeHealth(before),
      during: null,
      after: null,
    };
  }

  if (plan.mode !== 'applied' || !plan.backupPath) {
    throw new Error('apply did not create a restorable action-safety backup');
  }
  const backupPath = plan.backupPath;
  let during: HealthRecord | null = null;
  let after: HealthRecord | null = null;
  let boundaryDrill: ActionSafetyBoundaryDrillResult | null = null;
  let primaryError: unknown;
  try {
    dependencies.onArmed?.({
      mode: 'safe-mode-armed',
      backupPath,
      target: plan.target,
    });
    during = await waitForHealth(
      getHealth,
      delay,
      options.timeoutMs,
      (health) =>
        assertHealth(health, options.expectedRelease, true, capabilitiesBefore),
    );
    boundaryDrill = await runBoundaryDrill();
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      const restored: RestoreActionSafetyConfigResult = restore({
        envFile: options.envFile,
        backupFile: backupPath,
        confirmHost: confirmedHost,
      });
      if (!['restored', 'unchanged'].includes(restored.mode)) {
        throw new Error('restore returned an unexpected result');
      }
      after = await waitForHealth(
        getHealth,
        delay,
        options.timeoutMs,
        (health) =>
          assertHealth(
            health,
            options.expectedRelease,
            false,
            capabilitiesBefore,
          ),
      );
    } catch (restoreError) {
      throw new Error(
        `CRITICAL: action-safety restore failed; recover from ${backupPath}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        { cause: restoreError },
      );
    }
  }

  if (primaryError) {
    throw new Error(
      `action-safety drill failed after exact configuration restoration: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`,
      { cause: primaryError },
    );
  }
  if (!during || !after || !boundaryDrill) {
    throw new Error('action-safety drill ended without complete evidence');
  }
  return {
    mode: 'applied-restored',
    expectedRelease: options.expectedRelease,
    backupPath,
    plan,
    liveSafeModeObserved: true,
    restored: true,
    boundaryDrill,
    before: summarizeHealth(before),
    during: summarizeHealth(during),
    after: summarizeHealth(after),
  };
}
