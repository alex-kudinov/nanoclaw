import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  ACTIVATION_CHANGED_PATHS,
  assertHealthyRollbackRelease,
  assertHealthyRelease,
  assertOnlyActivationChanges,
  diffCandidate,
  planActivation,
  renderCandidate,
} from './release-activation.js';
import type { ReleaseManifest } from './release-integrity.js';

const oldRoot = '/opt/nanoclaw/releases/' + 'a'.repeat(40);
const newRoot = '/opt/nanoclaw/releases/' + 'b'.repeat(40);

function installed() {
  return {
    Label: 'com.nanoclaw',
    KeepAlive: true,
    WorkingDirectory: '/Users/operator/dev/NanoClaw',
    ProgramArguments: [
      '/Users/operator/.local/node/22.23.2/bin/node',
      path.join(oldRoot, 'dist/index.js'),
    ],
    EnvironmentVariables: {
      HOME: '/Users/operator',
      MAX_CONCURRENT_CONTAINERS: '7',
      NANOCLAW_CODE_ROOT: oldRoot,
      NANOCLAW_EXPECTED_RELEASE_COMMIT: 'a'.repeat(40),
      NODE_ENV: 'production',
    },
  };
}

const manifest: ReleaseManifest = {
  schemaVersion: 1,
  commit: 'b'.repeat(40),
  sourceTree: 'c'.repeat(40),
  builtAt: '2026-08-02T00:00:00.000Z',
  nodePin: '22.23.2',
  nodeVersion: '22.23.2',
  artifactHash: 'd'.repeat(64),
  artifactFiles: 10,
};

describe('release activation plan', () => {
  it('changes exactly the three release identity fields', () => {
    const original = installed();
    const plan = planActivation(original, newRoot, manifest);
    expect(plan.changedPaths).toEqual([...ACTIVATION_CHANGED_PATHS].sort());
    expect(plan.candidate.ProgramArguments[0]).toBe(
      original.ProgramArguments[0],
    );
    expect(plan.candidate.WorkingDirectory).toBe(original.WorkingDirectory);
    expect(plan.candidate.EnvironmentVariables.MAX_CONCURRENT_CONTAINERS).toBe(
      '7',
    );
  });

  it('rejects a fourth changed field', () => {
    const original = installed();
    const candidate = renderCandidate(original, newRoot, manifest.commit);
    candidate.EnvironmentVariables.MAX_CONCURRENT_CONTAINERS = '10';
    const changes = diffCandidate(original, candidate);
    expect(() => assertOnlyActivationChanges(changes)).toThrow(
      'must change exactly',
    );
  });

  it('rejects relative release paths and abbreviated commits', () => {
    expect(() =>
      renderCandidate(installed(), 'relative', manifest.commit),
    ).toThrow('absolute path');
    expect(() => renderCandidate(installed(), newRoot, 'b'.repeat(12))).toThrow(
      '40-character',
    );
  });

  it('rejects an installed rollback target without a full commit', () => {
    const invalid = installed();
    invalid.EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT =
      'SET_BY_DEPLOYMENT';
    expect(() => planActivation(invalid, newRoot, manifest)).toThrow(
      'full SHA',
    );
  });

  it('requires health to prove both commit and code root', () => {
    const target = planActivation(installed(), newRoot, manifest).target;
    expect(() =>
      assertHealthyRelease(
        {
          release: {
            verified: true,
            commit: target.commit,
            codeRoot: oldRoot,
            codeRootMatchesRelease: true,
          },
        },
        target,
      ),
    ).toThrow('does not match');
    expect(() =>
      assertHealthyRelease(
        {
          release: {
            verified: true,
            commit: target.commit,
            codeRoot: target.releaseDir,
            codeRootMatchesRelease: false,
          },
        },
        target,
      ),
    ).toThrow('does not match');
  });

  it('accepts a fully matching health identity', () => {
    const target = planActivation(installed(), newRoot, manifest).target;
    expect(() =>
      assertHealthyRelease(
        {
          release: {
            verified: true,
            commit: target.commit,
            codeRoot: target.releaseDir,
            codeRootMatchesRelease: true,
          },
        },
        target,
      ),
    ).not.toThrow();
  });

  it('accepts a legacy rollback health identity only when its commit matches', () => {
    const current = planActivation(installed(), newRoot, manifest).current;
    expect(() =>
      assertHealthyRollbackRelease(
        { release: { verified: true, commit: current.commit } },
        current,
      ),
    ).not.toThrow();
    expect(() =>
      assertHealthyRollbackRelease(
        { release: { verified: true, commit: manifest.commit } },
        current,
      ),
    ).toThrow('rollback release identity');
  });
});
