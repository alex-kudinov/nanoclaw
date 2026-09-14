import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalJson, canonicalReplayHash } from './canonical.js';
import { IdentityControlPlaneError } from './errors.js';
import { runD0Replay } from './replay.js';
import {
  FAILURE_EXPECTATIONS,
  FAILURE_FIXTURE_IDS,
  runFailureFixture,
} from './replay-fixtures.js';
import { recoverPositiveSnapshotFacts, reduceFactEvents } from './reducer.js';
import {
  deriveSynchronizationScoreboard,
  projectionKey,
  snapshotHash,
  validateAbsenceBasedDrift,
  validateCompleteSnapshot,
  validateDesiredProjection,
  validateShadowCommand,
} from './semantic.js';

const AT = '2026-09-13T18:00:00.000Z';
const SHA = '0'.repeat(64);
const ref = {
  provider: 'heartbeat',
  environment: 'production' as const,
  scope: 'main-community',
  entityType: 'user',
  externalId: 'user-1',
};

describe('Tandem Identity D0 replay', () => {
  it('reproduces all 12 proof cases and 27 failure fixtures', () => {
    const report = runD0Replay();
    expect(report.proofPassed).toBe(12);
    expect(report.failurePassed).toBe(27);
    expect(report.providerWrites).toBe(0);
    expect(report.partyWrites).toBe(0);
    expect(report.accessMutations).toBe(0);
    expect(report.proofCases.every((result) => result.passed)).toBe(true);
    expect(report.failureFixtures.every((result) => result.passed)).toBe(true);
  });

  it.each(FAILURE_FIXTURE_IDS)(
    '%s returns its exact accepted outcome',
    (fixtureId) => {
      expect(runFailureFixture(fixtureId)).toBe(
        FAILURE_EXPECTATIONS[fixtureId],
      );
    },
  );

  it('canonicalizes object keys and replay order deterministically', () => {
    expect(canonicalJson({ b: 2, a: { z: 1, y: 2 } })).toBe(
      '{"a":{"y":2,"z":1},"b":2}',
    );
    const receipts = [1, 2, 3].map((index) => ({
      receiptId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      sourceRef: { ...ref, externalId: `user-${index}` },
      sourceEffectiveAt: AT,
      providerEventId: `event-${index}`,
      deduplicationKey: `event-${index}`,
      payloadSha256: SHA,
    }));
    expect(canonicalReplayHash(receipts)).toBe(
      canonicalReplayHash([receipts[2]!, receipts[0]!, receipts[1]!]),
    );
    const facts = receipts.map((receipt, index) => ({
      envelope: {
        kind: 'identity_event_envelope' as const,
        schemaVersion: 1,
        ...receipt,
        adapterKey: 'heartbeat-main',
        manifestVersion: 1,
        eventType: 'USER_UPDATE',
        receivedAt: AT,
        authenticity: 'relay_verified_provider_unverified' as const,
      },
      factKey: `fact-${index}`,
      factVersion: 1,
      valueSha256: SHA,
    }));
    expect(reduceFactEvents(facts).replaySha256).toBe(
      reduceFactEvents([facts[2]!, facts[0]!, facts[1]!]).replaySha256,
    );
    const multiFact = reduceFactEvents([
      { ...facts[0]!, factKey: 'profile' },
      { ...facts[0]!, factKey: 'membership' },
    ]);
    expect(multiFact.appliedCount).toBe(2);
    const conflictingDuplicate = reduceFactEvents([
      facts[0]!,
      { ...facts[0]!, valueSha256: '1'.repeat(64) },
    ]);
    expect(
      conflictingDuplicate.receipts.map((receipt) => receipt.outcome),
    ).toContain('conflict');
    expect(() =>
      reduceFactEvents([{ ...facts[0]!, factKey: 'bad\u0000key' }]),
    ).toThrowError(expect.objectContaining({ code: 'FACT_KEY_INVALID' }));
  });

  it('validates projection and command correlation exactly', () => {
    const key = projectionKey(ref, 'membership:group-1');
    const projection = {
      kind: 'provider_desired_projection',
      schemaVersion: 1,
      projectionKey: key,
      targetRef: ref,
      managedObjectKey: 'membership:group-1',
      desiredVersion: 1,
      desiredSha256: SHA,
      authorityVersions: { entitlement: 1 },
      state: 'held',
      createdAt: AT,
      updatedAt: AT,
    };
    expect(validateDesiredProjection(projection).projectionKey).toBe(key);
    expect(() =>
      validateDesiredProjection({ ...projection, projectionKey: 'wrong' }),
    ).toThrowError(
      expect.objectContaining({ code: 'PROJECTION_KEY_MISMATCH' }),
    );
    const command = {
      kind: 'provider_projection_command',
      schemaVersion: 1,
      commandId: '00000000-0000-4000-8000-000000000004',
      projectionKey: key,
      desiredVersion: 1,
      idempotencyKey: `identity-shadow:v1:${SHA}`,
      status: 'simulated',
      writesEnabled: false,
      attemptCount: 0,
      providerOperationId: null,
      nextAttemptAt: null,
      createdAt: AT,
      updatedAt: AT,
    };
    expect(() => validateShadowCommand(command, projection)).toThrowError(
      expect.objectContaining({ code: 'COMMAND_PROJECTION_MISMATCH' }),
    );
  });

  it('requires complete snapshot integrity and derives scoreboard state', () => {
    const items = [
      { reference: ref, factType: 'membership', version: 1, valueSha256: SHA },
    ];
    const run = {
      kind: 'provider_reconciliation_run',
      schemaVersion: 1,
      runId: '00000000-0000-4000-8000-000000000005',
      adapterKey: 'heartbeat-main',
      manifestVersion: 1,
      provider: 'heartbeat',
      environment: 'production',
      scope: 'main-community',
      mode: 'full',
      status: 'complete',
      complete: true,
      observedCount: 1,
      normalizedCount: 1,
      snapshotSha256: snapshotHash(items),
      startedAt: AT,
      completedAt: AT,
      freshUntil: '2026-09-14T18:00:00.000Z',
    };
    expect(validateCompleteSnapshot(run, items).complete).toBe(true);
    expect(() =>
      validateCompleteSnapshot({ ...run, observedCount: 2 }, items),
    ).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_INTEGRITY_MISMATCH' }),
    );
    expect(
      deriveSynchronizationScoreboard(AT, [
        {
          provider: 'heartbeat',
          environment: 'production',
          scope: 'main-community',
          lastCompleteSnapshotAt: AT,
          freshUntil: '2026-09-14T18:00:00.000Z',
          openDrift: 0,
          oldestOpenDriftSeconds: 0,
          uncertainCommands: 1,
          blockedCommands: 0,
          consequentialDrift: false,
        },
      ]).globalState,
    ).toBe('blocked');
    expect(
      deriveSynchronizationScoreboard(AT, [
        {
          provider: 'heartbeat',
          environment: 'production',
          scope: 'main-community',
          lastCompleteSnapshotAt: null,
          freshUntil: '2026-09-14T18:00:00.000Z',
          openDrift: 0,
          oldestOpenDriftSeconds: 0,
          uncertainCommands: 0,
          blockedCommands: 0,
          consequentialDrift: false,
        },
      ]).globalState,
    ).toBe('degraded');
    expect(() => snapshotHash([items[0]!, items[0]!])).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_DUPLICATE_ITEM' }),
    );
    expect(recoverPositiveSnapshotFacts(['b', 'a', 'b'], ['a'])).toEqual(['b']);
  });

  it('binds absence evidence to the same full scope after snapshot completion', () => {
    const run = {
      kind: 'provider_reconciliation_run',
      schemaVersion: 1,
      runId: '00000000-0000-4000-8000-000000000050',
      adapterKey: 'heartbeat-main',
      manifestVersion: 1,
      provider: 'heartbeat',
      environment: 'production',
      scope: 'main-community',
      mode: 'full',
      status: 'complete',
      complete: true,
      observedCount: 0,
      normalizedCount: 0,
      snapshotSha256: snapshotHash([]),
      startedAt: AT,
      completedAt: '2026-09-13T18:01:00.000Z',
      freshUntil: '2026-09-14T18:00:00.000Z',
    };
    const drift = {
      kind: 'provider_drift_item',
      schemaVersion: 1,
      driftId: '00000000-0000-4000-8000-000000000051',
      targetRef: ref,
      classification: 'missing_managed_state',
      severity: 'high',
      status: 'held',
      repairEligibility: 'operator_required',
      absenceBased: true,
      reconciliationRunId: run.runId,
      firstSeenAt: AT,
      lastSeenAt: AT,
      owner: 'identity-ops',
    };
    expect(
      validateAbsenceBasedDrift(drift, run, '2026-09-13T18:02:00.000Z')
        .absenceBased,
    ).toBe(true);
    expect(() =>
      validateAbsenceBasedDrift(
        drift,
        { ...run, mode: 'incremental' },
        '2026-09-13T18:02:00.000Z',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'ABSENCE_REQUIRES_FULL_SNAPSHOT' }),
    );
    expect(() =>
      validateAbsenceBasedDrift(
        drift,
        { ...run, scope: 'other-community' },
        '2026-09-13T18:02:00.000Z',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'ABSENCE_SNAPSHOT_SCOPE_MISMATCH' }),
    );
    expect(() =>
      validateAbsenceBasedDrift(drift, run, '2026-09-13T18:00:30.000Z'),
    ).toThrowError(
      expect.objectContaining({
        code: 'ABSENCE_DECISION_BEFORE_SNAPSHOT_COMPLETE',
      }),
    );
  });

  it('has no runtime network, database, provider, environment, or host registration dependency', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const runtimeFiles = [
      'canonical.ts',
      'contracts.ts',
      'errors.ts',
      'reducer.ts',
      'replay-cli.ts',
      'replay-fixtures.ts',
      'replay.ts',
      'resolver.ts',
      'semantic.ts',
    ];
    const forbidden = [
      /from ['"](?:node:)?(?:http|https|net|tls|dns|dgram|child_process)['"]/,
      /from ['"](?:pg|firebase-admin|googleapis|undici|axios)['"]/,
      /\bfetch\s*\(/,
      /\b(?:require|import)\s*\(\s*['"](?:node:)?(?:http|https|net|tls|dns|dgram|child_process)/,
      /\b(?:WebSocket|EventSource)\s*\(/,
      /process\.env/,
      /business-db|webhook-server|provider-toolbox|registerChannel/,
    ];
    for (const filename of runtimeFiles) {
      const source = fs.readFileSync(path.join(directory, filename), 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${filename} matched ${pattern}`).not.toMatch(pattern);
      }
    }
    const host = fs.readFileSync(
      path.join(directory, '..', 'index.ts'),
      'utf8',
    );
    for (const filename of runtimeFiles) {
      expect(host).not.toContain(
        `./identity-control-plane/${filename.replace(/\.ts$/, '.js')}`,
      );
    }
  });

  it('rejects unsupported canonical values rather than hashing ambiguously', () => {
    expect(() => canonicalJson({ bad: undefined })).toThrowError(
      expect.objectContaining({
        code: 'REPLAY_CANONICAL_VALUE_UNSUPPORTED',
      }) as IdentityControlPlaneError,
    );
  });
});
