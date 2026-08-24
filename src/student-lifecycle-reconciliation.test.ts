import { describe, expect, it, vi } from 'vitest';

import {
  type LifecycleSnapshotInput,
  reconcileCatalogSnapshot,
  reconcileProgressSnapshot,
  reconcileRegistrySnapshot,
} from './student-lifecycle-reconciliation.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function repository() {
  return {
    recordReconciliationRun: vi.fn(async () => ({
      id: 42,
      duplicate: false,
    })),
  };
}

function base(): LifecycleSnapshotInput {
  return {
    runKey: 'progress:course-a:2026-08-24',
    runType: 'progress' as const,
    scopeKey: 'course-a',
    catalogRevision: 1,
    expectedScopeKeys: ['page:1', 'page:2'],
    observedScopes: [
      { key: 'page:1', sha256: HASH_A, disposition: 'new' as const },
      { key: 'page:2', sha256: HASH_B, disposition: 'unchanged' as const },
    ],
    watermarkBefore: 'old',
    watermarkCandidate: 'new',
    startedAt: '2026-08-24T15:00:00Z',
    completedAt: '2026-08-24T15:01:00Z',
  };
}

describe('fixtures-only lifecycle reconciliation', () => {
  it('records a complete progress run and advances its watermark', async () => {
    const repo = repository();
    const result = await reconcileProgressSnapshot({
      repository: repo,
      snapshot: base(),
    });
    expect(result.status).toBe('completed');
    expect(result.watermarkAfter).toBe('new');
    expect(result.counts).toEqual({
      expected: 2,
      observed: 2,
      new: 1,
      unchanged: 1,
      conflicting: 0,
      quarantined: 0,
    });
    expect(repo.recordReconciliationRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', watermarkAfter: 'new' }),
    );
  });

  it('refuses partial scope and retains the prior watermark', async () => {
    const repo = repository();
    const snapshot = base();
    snapshot.observedScopes = snapshot.observedScopes.slice(0, 1);
    const result = await reconcileRegistrySnapshot({
      repository: repo,
      snapshot,
    });
    expect(result.status).toBe('partial');
    expect(result.errorCode).toBe('scope_incomplete');
    expect(result.watermarkAfter).toBe('old');
  });

  it('retains the watermark when a fact conflicts or is quarantined', async () => {
    const repo = repository();
    const snapshot = base();
    snapshot.observedScopes[1] = {
      ...snapshot.observedScopes[1],
      disposition: 'conflicting',
    };
    const result = await reconcileCatalogSnapshot({
      repository: repo,
      snapshot,
    });
    expect(result.status).toBe('quarantined');
    expect(result.errorCode).toBe('facts_quarantined');
    expect(result.watermarkAfter).toBe('old');
  });

  it('hashes sorted scope identity so input order does not change the receipt', async () => {
    const one = await reconcileProgressSnapshot({
      repository: repository(),
      snapshot: base(),
    });
    const reversed = base();
    reversed.observedScopes.reverse();
    const two = await reconcileProgressSnapshot({
      repository: repository(),
      snapshot: reversed,
    });
    expect(two.sourceSnapshotSha256).toBe(one.sourceSnapshotSha256);
  });

  it('rejects duplicate scope keys instead of hiding pagination defects', async () => {
    const snapshot = base();
    snapshot.observedScopes[1] = {
      ...snapshot.observedScopes[1],
      key: 'page:1',
    };
    await expect(
      reconcileProgressSnapshot({ repository: repository(), snapshot }),
    ).rejects.toThrow('duplicate_observed_scope');
  });
});
