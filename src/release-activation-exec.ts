import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  assertHealthyRelease,
  assertHealthyRollbackRelease,
  planActivation,
  type ActivationPlan,
  type LaunchdPlist,
} from './release-activation.js';
import type { ReleaseManifest } from './release-integrity.js';

export interface ActivationOptions {
  releaseDir: string;
  plistPath: string;
  healthUrl: string;
  timeoutMs: number;
  apply: boolean;
  confirmHost?: string;
  recoverFromDown?: boolean;
}

export interface ActivationResult {
  mode: 'dry-run' | 'applied';
  label: string;
  fromCommit: string;
  toCommit: string;
  fromCodeRoot: string;
  toCodeRoot: string;
  changedPaths: string[];
  rollbackPath: string | null;
  healthVerified: boolean;
}

function run(
  file: string,
  args: string[],
  options?: { input?: string; allowFailure?: boolean },
): string {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      input: options?.input,
      stdio:
        options?.input === undefined ? ['ignore', 'pipe', 'pipe'] : undefined,
    }).trim();
  } catch (error) {
    if (options?.allowFailure) return '';
    const detail =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: unknown }).stderr ?? '').trim()
        : '';
    throw new Error(
      `${path.basename(file)} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
    );
  }
}

function readPlist(plistPath: string): LaunchdPlist {
  const decoded = run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    plistPath,
  ]);
  return JSON.parse(decoded) as LaunchdPlist;
}

function readManifest(releaseDir: string): ReleaseManifest {
  const manifestPath = path.join(releaseDir, 'dist', 'release-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`target release manifest missing: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
}

export function renderPlistXml(plist: LaunchdPlist, directory: string): Buffer {
  const scratch = fs.mkdtempSync(path.join(directory, '.nanoclaw-activate-'));
  const candidatePath = path.join(scratch, 'candidate.json');
  try {
    fs.writeFileSync(candidatePath, JSON.stringify(plist));
    run('/usr/bin/plutil', ['-convert', 'xml1', candidatePath]);
    run('/usr/bin/plutil', ['-lint', candidatePath]);
    return fs.readFileSync(candidatePath);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function assertInterpreter(nodePath: string, expected: string): void {
  const actual = run(nodePath, ['--version']).replace(/^v/, '');
  if (actual !== expected.replace(/^v/, '')) {
    throw new Error(
      `candidate interpreter reports Node ${actual}; release requires ${expected}`,
    );
  }
}

function verifyBundle(nodePath: string, releaseDir: string): void {
  const verifier = path.join(releaseDir, 'scripts', 'verify-release.mjs');
  if (!fs.existsSync(verifier)) {
    throw new Error(`release verifier missing: ${verifier}`);
  }
  run(nodePath, [verifier, releaseDir, '--runtime']);
}

async function getHealth(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`health endpoint returned HTTP ${response.status}`);
  }
  return response.json();
}

function currentPid(domain: string, label: string): number | null {
  const output = run('/bin/launchctl', ['print', `${domain}/${label}`], {
    allowFailure: true,
  });
  const match = /^\s*pid = (\d+)\s*$/m.exec(output);
  return match ? Number(match[1]) : null;
}

function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listenerPids(port: number): number[] {
  const output = run(
    '/usr/sbin/lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
    { allowFailure: true },
  );
  return output
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

function assertHostToolProbes(): void {
  run('/usr/sbin/lsof', ['-v']);
  try {
    fs.accessSync('/usr/bin/shlock', fs.constants.X_OK);
  } catch (error) {
    throw new Error('release activation requires executable /usr/bin/shlock', {
      cause: error,
    });
  }
}

function readLockHolder(lockPath: string): string {
  try {
    return fs.readFileSync(lockPath, 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** shlock uses an atomic link(2) claim and refuses every extant lock. */
function acquireActivationLock(lockPath: string): void {
  try {
    run('/usr/bin/shlock', ['-f', lockPath, '-p', String(process.pid)]);
  } catch (error) {
    const holder = readLockHolder(lockPath);
    const holderPid = Number(holder);
    const holderState =
      Number.isSafeInteger(holderPid) && holderPid > 0
        ? pidExists(holderPid)
          ? `is held by live PID ${holder}`
          : `is stale from dead PID ${holder}`
        : `has an unreadable or missing owner (${holder})`;
    throw new Error(`release activation lock ${holderState}: ${lockPath}`, {
      cause: error,
    });
  }
}

function releaseActivationLock(lockPath: string): void {
  if (readLockHolder(lockPath) !== String(process.pid)) return;
  fs.unlinkSync(lockPath);
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for ${description}`);
}

function atomicReplace(plistPath: string, contents: Buffer): void {
  const directory = path.dirname(plistPath);
  const temporary = path.join(
    directory,
    `.${path.basename(plistPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const mode = fs.statSync(plistPath).mode;
  try {
    fs.writeFileSync(temporary, contents, { mode });
    run('/usr/bin/plutil', ['-lint', temporary]);
    fs.renameSync(temporary, plistPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function waitForHealth(
  options: ActivationOptions,
  plan: ActivationPlan,
): Promise<void> {
  let lastError: unknown;
  await waitUntil(
    async () => {
      try {
        assertHealthyRelease(
          await getHealth(options.healthUrl, 2_000),
          plan.target,
        );
        return true;
      } catch (error) {
        lastError = error;
        return false;
      }
    },
    options.timeoutMs,
    `healthy release ${plan.target.commit}: ${String(lastError ?? '')}`,
  );
}

async function waitForRollbackHealth(
  options: ActivationOptions,
  plan: ActivationPlan,
): Promise<void> {
  let lastError: unknown;
  await waitUntil(
    async () => {
      try {
        assertHealthyRollbackRelease(
          await getHealth(options.healthUrl, 2_000),
          plan.current,
        );
        return true;
      } catch (error) {
        lastError = error;
        return false;
      }
    },
    options.timeoutMs,
    `healthy rollback release ${plan.current.commit}: ${String(lastError ?? '')}`,
  );
}

function rollbackName(plistPath: string, commit: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${plistPath}.rollback-${commit.slice(0, 12)}-${stamp}`;
}

export async function activateRelease(
  options: ActivationOptions,
): Promise<ActivationResult> {
  if (
    !path.isAbsolute(options.releaseDir) ||
    !path.isAbsolute(options.plistPath)
  ) {
    throw new Error('release and plist paths must be absolute');
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error('timeout must be an integer of at least 1000ms');
  }
  if (options.recoverFromDown && !options.apply) {
    throw new Error('--recover-from-down requires --apply');
  }
  const releaseDir = fs.realpathSync(options.releaseDir);
  const plistPath = fs.realpathSync(options.plistPath);
  const installed = readPlist(plistPath);
  const manifest = readManifest(releaseDir);
  const plan = planActivation(installed, releaseDir, manifest);
  try {
    plan.current.releaseDir = fs.realpathSync(plan.current.releaseDir);
  } catch (error) {
    throw new Error(
      `installed rollback release directory is unavailable (possibly pruned): ${plan.current.releaseDir}`,
      { cause: error },
    );
  }
  if (releaseDir === plan.current.releaseDir) {
    throw new Error(
      `target release directory is already active: ${plan.current.releaseDir}`,
    );
  }
  const nodePath = String(plan.installed.ProgramArguments[0]);

  run('/usr/bin/plutil', ['-lint', plistPath]);
  assertInterpreter(nodePath, manifest.nodePin);
  verifyBundle(nodePath, releaseDir);
  verifyBundle(nodePath, plan.current.releaseDir);
  if (!options.recoverFromDown) {
    assertHealthyRollbackRelease(
      await getHealth(options.healthUrl, Math.min(options.timeoutMs, 5_000)),
      plan.current,
    );
  }

  if (options.apply && options.confirmHost !== os.hostname()) {
    throw new Error(
      `--apply requires --confirm-host ${os.hostname()} on this machine`,
    );
  }

  // Candidate rendering/linting happens in scratch for dry-run and before any
  // installed-service write for apply.
  const candidateXml = renderPlistXml(
    plan.candidate,
    options.apply ? path.dirname(plistPath) : os.tmpdir(),
  );
  // The dry-run is the production rehearsal. Prove the listener probe there so
  // a missing/denied lsof cannot first surface after --apply is authorized.
  assertHostToolProbes();

  const baseResult = {
    label: plan.installed.Label,
    fromCommit: plan.current.commit,
    toCommit: plan.target.commit,
    fromCodeRoot: plan.current.releaseDir,
    toCodeRoot: plan.target.releaseDir,
    changedPaths: plan.changedPaths,
  };
  if (!options.apply) {
    return {
      mode: 'dry-run',
      ...baseResult,
      rollbackPath: null,
      healthVerified: true,
    };
  }

  const uid = process.getuid?.();
  if (uid === undefined)
    throw new Error('launchd activation requires a Unix UID');
  const domain = `gui/${uid}`;
  const priorPid = currentPid(domain, plan.installed.Label);
  if (priorPid === null && !options.recoverFromDown)
    throw new Error('installed launchd service has no running PID');
  const port = Number(new URL(options.healthUrl).port || 80);
  const rollbackPath = rollbackName(plistPath, plan.current.commit);
  const lockPath = `${plistPath}.activation.lock`;
  acquireActivationLock(lockPath);

  try {
    fs.copyFileSync(plistPath, rollbackPath, fs.constants.COPYFILE_EXCL);
    run('/usr/bin/plutil', ['-lint', rollbackPath]);

    let replaced = false;
    try {
      atomicReplace(plistPath, candidateXml);
      replaced = true;
      run('/bin/launchctl', ['unload', plistPath], {
        allowFailure: options.recoverFromDown,
      });
      await waitUntil(
        () =>
          (priorPid === null || !pidExists(priorPid)) &&
          listenerPids(port).length === 0,
        options.timeoutMs,
        `prior service and listener ${port} to exit`,
      );
      run('/bin/launchctl', ['load', plistPath]);
      await waitForHealth(options, plan);
      return {
        mode: 'applied',
        ...baseResult,
        rollbackPath,
        healthVerified: true,
      };
    } catch (error) {
      if (!replaced) throw error;

      let rollbackHealthy = false;
      let rollbackError: unknown;
      try {
        const rollbackBytes = fs.readFileSync(rollbackPath);
        atomicReplace(plistPath, rollbackBytes);
        const failedPid = currentPid(domain, plan.installed.Label);
        run('/bin/launchctl', ['unload', plistPath], {
          allowFailure: true,
        });
        try {
          await waitUntil(
            () =>
              (failedPid === null || !pidExists(failedPid)) &&
              listenerPids(port).length === 0,
            options.timeoutMs,
            `failed candidate and listener ${port} to exit before rollback`,
          );
        } catch {
          // The rollback load is still attempted exactly once. Its error and
          // health outcome are reported without masking the activation error.
        }
        run('/bin/launchctl', ['load', plistPath]);
        await waitForRollbackHealth(options, plan);
        rollbackHealthy = true;
      } catch (rollbackFailure) {
        rollbackError = rollbackFailure;
      }

      const activationMessage =
        error instanceof Error ? error.message : String(error);
      const rollbackMessage = rollbackHealthy
        ? 'rollback restored and health-verified'
        : `rollback not health-verified: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
      throw new Error(
        `${activationMessage}; ${rollbackMessage}; rollback artifact: ${rollbackPath}`,
        { cause: error },
      );
    }
  } finally {
    try {
      releaseActivationLock(lockPath);
    } catch {
      // Owner-safe lock cleanup must not mask activation or rollback evidence.
    }
  }
}
