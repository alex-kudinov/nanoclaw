import crypto from 'crypto';

import type {
  LifecycleReconciliationRunInput,
  StudentLifecycleRepository,
} from './student-lifecycle-store.js';

export type ReconciliationFactDisposition =
  | 'new'
  | 'unchanged'
  | 'conflicting'
  | 'quarantined';

export interface ReconciliationObservedScope {
  key: string;
  sha256: string;
  disposition: ReconciliationFactDisposition;
}

export interface LifecycleSnapshotInput {
  runKey: string;
  runType: 'registry' | 'catalog' | 'membership' | 'progress';
  scopeKey: string;
  catalogRevision?: number | null;
  expectedScopeKeys: string[];
  observedScopes: ReconciliationObservedScope[];
  watermarkBefore?: string | null;
  watermarkCandidate?: string | null;
  startedAt: string;
  completedAt: string;
}

export interface LifecycleSnapshotResult {
  receiptId: number;
  duplicate: boolean;
  status: 'completed' | 'partial' | 'quarantined';
  sourceSnapshotSha256: string;
  watermarkAfter: string | null;
  counts: {
    expected: number;
    observed: number;
    new: number;
    unchanged: number;
    conflicting: number;
    quarantined: number;
  };
  errorCode: string | null;
}

function stableSnapshotHash(scopes: ReconciliationObservedScope[]): string {
  const canonical = scopes
    .map((scope) => ({
      key: scope.key,
      sha256: scope.sha256,
      disposition: scope.disposition,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
}

function validateSnapshot(input: LifecycleSnapshotInput): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/.test(input.runKey)) {
    throw new Error('student_lifecycle_reconciliation_invalid_run_key');
  }
  if (!input.scopeKey || input.scopeKey.length > 500) {
    throw new Error('student_lifecycle_reconciliation_invalid_scope');
  }
  const expected = new Set(input.expectedScopeKeys);
  const observed = new Set(input.observedScopes.map((scope) => scope.key));
  if (expected.size !== input.expectedScopeKeys.length) {
    throw new Error(
      'student_lifecycle_reconciliation_duplicate_expected_scope',
    );
  }
  if (observed.size !== input.observedScopes.length) {
    throw new Error(
      'student_lifecycle_reconciliation_duplicate_observed_scope',
    );
  }
  for (const scope of input.observedScopes) {
    if (!/^[0-9a-f]{64}$/.test(scope.sha256)) {
      throw new Error('student_lifecycle_reconciliation_invalid_scope_hash');
    }
  }
  if (!Number.isFinite(Date.parse(input.startedAt))) {
    throw new Error('student_lifecycle_reconciliation_invalid_started_at');
  }
  if (!Number.isFinite(Date.parse(input.completedAt))) {
    throw new Error('student_lifecycle_reconciliation_invalid_completed_at');
  }
}

export async function reconcileLifecycleSnapshot(input: {
  repository: Pick<StudentLifecycleRepository, 'recordReconciliationRun'>;
  snapshot: LifecycleSnapshotInput;
}): Promise<LifecycleSnapshotResult> {
  validateSnapshot(input.snapshot);
  const expected = new Set(input.snapshot.expectedScopeKeys);
  const observed = new Set(
    input.snapshot.observedScopes.map((scope) => scope.key),
  );
  const complete =
    expected.size === observed.size &&
    [...expected].every((scope) => observed.has(scope));
  const counts = {
    expected: expected.size,
    observed: observed.size,
    new: input.snapshot.observedScopes.filter(
      (scope) => scope.disposition === 'new',
    ).length,
    unchanged: input.snapshot.observedScopes.filter(
      (scope) => scope.disposition === 'unchanged',
    ).length,
    conflicting: input.snapshot.observedScopes.filter(
      (scope) => scope.disposition === 'conflicting',
    ).length,
    quarantined: input.snapshot.observedScopes.filter(
      (scope) => scope.disposition === 'quarantined',
    ).length,
  };
  const quarantined = counts.conflicting > 0 || counts.quarantined > 0;
  const status: LifecycleSnapshotResult['status'] = !complete
    ? 'partial'
    : quarantined
      ? 'quarantined'
      : 'completed';
  const errorCode =
    status === 'partial'
      ? 'scope_incomplete'
      : status === 'quarantined'
        ? 'facts_quarantined'
        : null;
  const watermarkBefore = input.snapshot.watermarkBefore ?? null;
  const watermarkAfter =
    status === 'completed'
      ? (input.snapshot.watermarkCandidate ?? watermarkBefore)
      : watermarkBefore;
  const sourceSnapshotSha256 = stableSnapshotHash(
    input.snapshot.observedScopes,
  );
  const receipt: LifecycleReconciliationRunInput = {
    runKey: input.snapshot.runKey,
    runType: input.snapshot.runType,
    scopeKey: input.snapshot.scopeKey,
    catalogRevision: input.snapshot.catalogRevision ?? null,
    sourceSnapshotSha256,
    watermarkBefore,
    watermarkAfter,
    scopesExpected: counts.expected,
    scopesObserved: counts.observed,
    factsNew: counts.new,
    factsUnchanged: counts.unchanged,
    factsConflicting: counts.conflicting,
    factsQuarantined: counts.quarantined,
    status,
    errorCode,
    startedAt: new Date(input.snapshot.startedAt).toISOString(),
    completedAt: new Date(input.snapshot.completedAt).toISOString(),
  };
  const recorded = await input.repository.recordReconciliationRun(receipt);
  return {
    receiptId: recorded.id,
    duplicate: recorded.duplicate,
    status,
    sourceSnapshotSha256,
    watermarkAfter,
    counts,
    errorCode,
  };
}

export const reconcileRegistrySnapshot = reconcileLifecycleSnapshot;
export const reconcileCatalogSnapshot = reconcileLifecycleSnapshot;
export const reconcileMembershipSnapshot = reconcileLifecycleSnapshot;
export const reconcileProgressSnapshot = reconcileLifecycleSnapshot;
