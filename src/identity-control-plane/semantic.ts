import {
  AdapterManifestSchema,
  DesiredProjectionSchema,
  DriftItemSchema,
  EventEnvelopeSchema,
  IdentityCandidateSchema,
  ReconciliationRunSchema,
  ScopedReferenceSchema,
  ShadowCommandSchema,
  SynchronizationScoreboardSchema,
  parseOrThrow,
  type AdapterManifest,
  type DesiredProjection,
  type DriftItem,
  type Environment,
  type EventEnvelope,
  type IdentityCandidate,
  type ReconciliationRun,
  type ScopedReference,
  type ShadowCommand,
  type SynchronizationScoreboard,
} from './contracts.js';
import { canonicalJson, sha256Json, scopedReferenceKey } from './canonical.js';
import { invariant } from './errors.js';

export type EnvironmentClass = 'nonproduction' | 'production';

export function environmentClass(environment: Environment): EnvironmentClass {
  return environment === 'development' || environment === 'test'
    ? 'nonproduction'
    : 'production';
}

export function validateEventAgainstManifest(
  rawEvent: unknown,
  rawManifest: unknown,
): EventEnvelope {
  const event = parseOrThrow(EventEnvelopeSchema, rawEvent);
  const manifest = parseOrThrow(AdapterManifestSchema, rawManifest);
  invariant(manifest.status === 'accepted', 'MANIFEST_NOT_ACCEPTED');
  invariant(
    event.adapterKey === manifest.adapterKey &&
      event.manifestVersion === manifest.manifestVersion &&
      event.sourceRef.provider === manifest.provider &&
      event.sourceRef.environment === manifest.environment &&
      event.sourceRef.scope === manifest.scope,
    'SCOPE_MANIFEST_MISMATCH',
  );
  invariant(
    manifest.entityTypes.includes(event.sourceRef.entityType),
    'ENTITY_TYPE_NOT_MANIFESTED',
  );
  invariant(
    manifest.eventTypes.includes(event.eventType),
    'EVENT_TYPE_NOT_MANIFESTED',
  );

  const primaryClass = environmentClass(event.sourceRef.environment);
  for (const [index, reference] of (event.relatedRefs ?? []).entries()) {
    invariant(
      environmentClass(reference.environment) === primaryClass,
      'SCOPE_ENVIRONMENT_CLASS_COLLISION',
      { relatedRefIndex: index },
    );
  }
  return event;
}

export function validateIdentityCandidate(raw: unknown): IdentityCandidate {
  return parseOrThrow(IdentityCandidateSchema, raw);
}

export function projectionKey(
  targetRef: ScopedReference,
  managedObjectKey: string,
): string {
  return `identity-projection:v1:${sha256Json([
    scopedReferenceKey(targetRef),
    managedObjectKey,
  ])}`;
}

export function commandIdempotencyKey(
  desiredProjectionKey: string,
  desiredVersion: number,
): string {
  return `identity-shadow:v1:${sha256Json([
    desiredProjectionKey,
    desiredVersion,
  ])}`;
}

export function validateDesiredProjection(raw: unknown): DesiredProjection {
  const projection = parseOrThrow(DesiredProjectionSchema, raw);
  invariant(
    projection.projectionKey ===
      projectionKey(projection.targetRef, projection.managedObjectKey),
    'PROJECTION_KEY_MISMATCH',
  );
  return projection;
}

export function validateShadowCommand(
  rawCommand: unknown,
  rawProjection: unknown,
): ShadowCommand {
  const command = parseOrThrow(ShadowCommandSchema, rawCommand);
  const projection = validateDesiredProjection(rawProjection);
  invariant(
    command.projectionKey === projection.projectionKey &&
      command.desiredVersion === projection.desiredVersion &&
      command.idempotencyKey ===
        commandIdempotencyKey(
          projection.projectionKey,
          projection.desiredVersion,
        ),
    'COMMAND_PROJECTION_MISMATCH',
  );
  return command;
}

export interface SnapshotItem {
  reference: ScopedReference;
  factType: string;
  version: string | number;
  valueSha256: string;
}

function snapshotItemKey(item: SnapshotItem): string {
  return canonicalJson([
    scopedReferenceKey(item.reference),
    item.factType,
    item.version,
    item.valueSha256,
  ]);
}

export function snapshotHash(items: readonly SnapshotItem[]): string {
  const factKeys = items.map((item) => {
    parseOrThrow(ScopedReferenceSchema, item.reference);
    invariant(
      typeof item.factType === 'string' &&
        item.factType.length > 0 &&
        item.factType.length <= 160 &&
        item.factType.trim() === item.factType &&
        !/[\u0000-\u001f\u007f]/.test(item.factType),
      'SNAPSHOT_ITEM_INVALID',
    );
    invariant(
      (typeof item.version === 'number' &&
        Number.isSafeInteger(item.version) &&
        item.version > 0) ||
        (typeof item.version === 'string' &&
          item.version.length > 0 &&
          item.version.length <= 160 &&
          item.version.trim() === item.version),
      'SNAPSHOT_ITEM_INVALID',
    );
    invariant(/^[a-f0-9]{64}$/.test(item.valueSha256), 'SNAPSHOT_ITEM_INVALID');
    return canonicalJson([scopedReferenceKey(item.reference), item.factType]);
  });
  invariant(
    new Set(factKeys).size === factKeys.length,
    'SNAPSHOT_DUPLICATE_ITEM',
  );
  return sha256Json(
    [...items].sort((left, right) => {
      const leftKey = snapshotItemKey(left);
      const rightKey = snapshotItemKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );
}

export function validateCompleteSnapshot(
  rawRun: unknown,
  items: readonly SnapshotItem[],
): ReconciliationRun {
  const run = parseOrThrow(ReconciliationRunSchema, rawRun);
  invariant(run.status === 'complete' && run.complete, 'SNAPSHOT_NOT_COMPLETE');
  invariant(
    run.observedCount === items.length &&
      run.normalizedCount <= run.observedCount &&
      run.snapshotSha256 === snapshotHash(items),
    'SNAPSHOT_INTEGRITY_MISMATCH',
  );
  return run;
}

export function validateAbsenceBasedDrift(
  rawDrift: unknown,
  rawRun: unknown,
  decisionAt: string,
): DriftItem {
  const drift = parseOrThrow(DriftItemSchema, rawDrift);
  const run = parseOrThrow(ReconciliationRunSchema, rawRun);
  if (!drift.absenceBased) return drift;
  invariant(
    drift.reconciliationRunId === run.runId &&
      run.status === 'complete' &&
      run.complete &&
      Boolean(run.freshUntil),
    'ABSENCE_REQUIRES_COMPLETE_FRESH_SNAPSHOT',
  );
  invariant(run.mode === 'full', 'ABSENCE_REQUIRES_FULL_SNAPSHOT');
  invariant(
    run.provider === drift.targetRef.provider &&
      run.environment === drift.targetRef.environment &&
      run.scope === drift.targetRef.scope,
    'ABSENCE_SNAPSHOT_SCOPE_MISMATCH',
  );
  invariant(
    Date.parse(decisionAt) >= Date.parse(run.completedAt!),
    'ABSENCE_DECISION_BEFORE_SNAPSHOT_COMPLETE',
  );
  invariant(
    Date.parse(decisionAt) <= Date.parse(run.freshUntil!),
    'ABSENCE_SNAPSHOT_STALE',
  );
  return drift;
}

export interface ScoreboardScopeInput {
  provider: string;
  environment: Environment;
  scope: string;
  lastCompleteSnapshotAt: string | null;
  freshUntil: string | null;
  openDrift: number;
  oldestOpenDriftSeconds: number;
  uncertainCommands: number;
  blockedCommands: number;
  consequentialDrift: boolean;
}

export function deriveSynchronizationScoreboard(
  generatedAt: string,
  inputs: readonly ScoreboardScopeInput[],
): SynchronizationScoreboard {
  const now = Date.parse(generatedAt);
  invariant(Number.isFinite(now), 'SCOREBOARD_TIME_INVALID');
  const scopes = inputs
    .map((input) => {
      const freshUntil = input.freshUntil
        ? Date.parse(input.freshUntil)
        : Number.NaN;
      const stale =
        !input.lastCompleteSnapshotAt ||
        !Number.isFinite(freshUntil) ||
        freshUntil < now;
      const blocked =
        input.consequentialDrift ||
        input.uncertainCommands > 0 ||
        input.blockedCommands > 0;
      const state = blocked
        ? 'blocked'
        : stale || input.openDrift > 0
          ? 'degraded'
          : 'healthy';
      return { ...input, consequentialDrift: undefined, state };
    })
    .map(({ consequentialDrift: _ignored, ...scope }) => scope);
  const blockingReasons = scopes
    .filter((scope) => scope.state === 'blocked')
    .map(
      (scope) =>
        `${scope.provider}:${scope.environment}:${scope.scope}:blocked`,
    );
  const globalState = scopes.some((scope) => scope.state === 'blocked')
    ? 'blocked'
    : scopes.some((scope) => scope.state === 'degraded')
      ? 'degraded'
      : 'healthy';
  return parseOrThrow(SynchronizationScoreboardSchema, {
    kind: 'synchronization_scoreboard',
    schemaVersion: 1,
    generatedAt,
    globalState,
    blockingReasons,
    scopes,
  });
}

export type UncertainDeliveryPlan =
  | 'readback_first'
  | 'retry_same_idempotency_key'
  | 'retry_after_non_acceptance'
  | 'verified_no_retry'
  | 'blocked_unreadable';

export function planUncertainDelivery(input: {
  readbackSupported: boolean;
  readbackResult: 'accepted' | 'not_accepted' | 'unavailable' | 'not_attempted';
  providerIdempotencySafe: boolean;
}): UncertainDeliveryPlan {
  if (!input.readbackSupported || input.readbackResult === 'unavailable') {
    return 'blocked_unreadable';
  }
  if (input.readbackResult === 'not_attempted') return 'readback_first';
  if (input.readbackResult === 'accepted') return 'verified_no_retry';
  return input.providerIdempotencySafe
    ? 'retry_same_idempotency_key'
    : 'retry_after_non_acceptance';
}
