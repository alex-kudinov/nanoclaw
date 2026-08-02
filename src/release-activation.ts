import path from 'path';

import type { ReleaseManifest } from './release-integrity.js';

export const ACTIVATION_ENV_KEYS = [
  'NANOCLAW_CODE_ROOT',
  'NANOCLAW_EXPECTED_RELEASE_COMMIT',
] as const;

export const ACTIVATION_CHANGED_PATHS = [
  'EnvironmentVariables.NANOCLAW_CODE_ROOT',
  'EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT',
  'ProgramArguments.1',
] as const;

export interface LaunchdPlist {
  Label: string;
  ProgramArguments: unknown[];
  EnvironmentVariables: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ActivationTarget {
  releaseDir: string;
  commit: string;
  executable: string;
}

export interface ActivationPlan {
  installed: LaunchdPlist;
  candidate: LaunchdPlist;
  current: ActivationTarget;
  target: ActivationTarget;
  changedPaths: string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertAbsolute(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
}

export function assertInstalledPlist(value: unknown): LaunchdPlist {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('installed plist must decode to a dictionary');
  }
  const plist = value as Partial<LaunchdPlist>;
  if (typeof plist.Label !== 'string' || !plist.Label.trim()) {
    throw new Error('installed plist is missing Label');
  }
  if (
    !Array.isArray(plist.ProgramArguments) ||
    plist.ProgramArguments.length < 2
  ) {
    throw new Error(
      'installed plist must provide at least two ProgramArguments',
    );
  }
  assertAbsolute(plist.ProgramArguments[0], 'ProgramArguments[0]');
  assertAbsolute(plist.ProgramArguments[1], 'ProgramArguments[1]');
  if (
    plist.EnvironmentVariables === null ||
    typeof plist.EnvironmentVariables !== 'object' ||
    Array.isArray(plist.EnvironmentVariables)
  ) {
    throw new Error('installed plist is missing EnvironmentVariables');
  }
  for (const key of ACTIVATION_ENV_KEYS) {
    const field = plist.EnvironmentVariables[key];
    if (typeof field !== 'string' || !field.trim()) {
      throw new Error(`installed plist is missing ${key}`);
    }
  }
  assertAbsolute(
    plist.EnvironmentVariables.NANOCLAW_CODE_ROOT,
    'NANOCLAW_CODE_ROOT',
  );
  return plist as LaunchdPlist;
}

function collectDiffs(left: unknown, right: unknown, prefix = ''): string[] {
  if (Object.is(left, right)) return [];
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return [prefix];
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return [prefix];
    const keys = new Set([...left.keys(), ...right.keys()]);
    return [...keys].flatMap((key) =>
      collectDiffs(
        left[key],
        right[key],
        prefix ? `${prefix}.${key}` : String(key),
      ),
    );
  }
  const l = left as Record<string, unknown>;
  const r = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
  return [...keys]
    .sort()
    .flatMap((key) =>
      collectDiffs(l[key], r[key], prefix ? `${prefix}.${key}` : key),
    );
}

export function diffCandidate(
  installed: LaunchdPlist,
  candidate: LaunchdPlist,
): string[] {
  return collectDiffs(installed, candidate).sort();
}

export function assertOnlyActivationChanges(changedPaths: string[]): void {
  const actual = [...changedPaths].sort();
  const allowed = [...ACTIVATION_CHANGED_PATHS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
    throw new Error(
      `release activation must change exactly ${allowed.join(', ')}; got ${actual.join(', ') || 'none'}`,
    );
  }
}

export function renderCandidate(
  installedValue: unknown,
  releaseDirInput: string,
  commit: string,
): LaunchdPlist {
  const installed = assertInstalledPlist(installedValue);
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('target release commit must be a full 40-character SHA');
  }
  assertAbsolute(releaseDirInput, 'target release directory');
  const releaseDir = path.resolve(releaseDirInput);
  const candidate = clone(installed);
  candidate.ProgramArguments[1] = path.join(releaseDir, 'dist', 'index.js');
  candidate.EnvironmentVariables.NANOCLAW_CODE_ROOT = releaseDir;
  candidate.EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT = commit;
  assertOnlyActivationChanges(diffCandidate(installed, candidate));
  return candidate;
}

export function targetFromPlist(plistValue: unknown): ActivationTarget {
  const plist = assertInstalledPlist(plistValue);
  const releaseDir = String(plist.EnvironmentVariables.NANOCLAW_CODE_ROOT);
  const commit = String(
    plist.EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT,
  );
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('installed expected release commit must be a full SHA');
  }
  return {
    releaseDir: path.resolve(releaseDir),
    commit,
    executable: String(plist.ProgramArguments[1]),
  };
}

export function planActivation(
  installedValue: unknown,
  releaseDir: string,
  manifest: ReleaseManifest,
): ActivationPlan {
  const installed = assertInstalledPlist(installedValue);
  const candidate = renderCandidate(installed, releaseDir, manifest.commit);
  return {
    installed: clone(installed),
    candidate,
    current: targetFromPlist(installed),
    target: targetFromPlist(candidate),
    changedPaths: diffCandidate(installed, candidate),
  };
}

export function assertHealthyRelease(
  health: unknown,
  target: ActivationTarget,
): void {
  if (health === null || typeof health !== 'object') {
    throw new Error('health response is not an object');
  }
  const release = (health as { release?: unknown }).release;
  if (release === null || typeof release !== 'object') {
    throw new Error('health response is missing release identity');
  }
  const identity = release as Record<string, unknown>;
  if (
    identity.verified !== true ||
    identity.commit !== target.commit ||
    identity.codeRoot !== target.releaseDir ||
    identity.codeRootMatchesRelease !== true
  ) {
    throw new Error(
      'health response does not match the intended release identity',
    );
  }
}

/**
 * Transitional proof for the rollback source. Releases built before NC-003 do
 * not report codeRoot. Their installed plist plus verified bundle supplies that
 * proof; if the health field exists, however, it must agree.
 */
export function assertHealthyRollbackRelease(
  health: unknown,
  target: ActivationTarget,
): void {
  if (health === null || typeof health !== 'object') {
    throw new Error('health response is not an object');
  }
  const release = (health as { release?: unknown }).release;
  if (release === null || typeof release !== 'object') {
    throw new Error('health response is missing release identity');
  }
  const identity = release as Record<string, unknown>;
  const codeRootAgrees =
    identity.codeRoot === undefined || identity.codeRoot === target.releaseDir;
  const matchAgrees =
    identity.codeRootMatchesRelease === undefined ||
    identity.codeRootMatchesRelease === true;
  if (
    identity.verified !== true ||
    identity.commit !== target.commit ||
    !codeRootAgrees ||
    !matchAgrees
  ) {
    throw new Error(
      'health response does not match the rollback release identity',
    );
  }
}
