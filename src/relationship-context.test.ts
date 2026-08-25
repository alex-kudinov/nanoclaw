import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRelationshipContextGrantsForTests,
  consumeRelationshipContextGrant,
  issueRelationshipContextGrant,
} from './relationship-context-policy.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import {
  REFERENCE_LMS_FACTS,
  ReferenceLmsAdapter,
} from './relationship-context-reference-adapter.js';
import { InMemoryRelationshipContextRepository } from './relationship-context-store.js';
import {
  getRelationshipContext,
  ingestRelationshipContextBatch,
} from './relationship-context.js';
import { sha256Json } from './relationship-context-contract.js';

function configured(): {
  registry: RelationshipContextRegistry;
  adapter: ReferenceLmsAdapter;
} {
  const registry = new RelationshipContextRegistry();
  for (const factType of REFERENCE_LMS_FACTS) {
    registry.registerFact({
      factType,
      schemaVersion: 1,
      projectionTarget: 'learning',
      privacyClass: 'internal',
      maxAgeSeconds: 93_600,
      cardinality: 'many',
      authorityClass: 'native',
    });
  }
  const adapter = new ReferenceLmsAdapter();
  registry.registerAdapter(adapter);
  registry.markConformance('reference_lms', 'passed');
  return { registry, adapter };
}

function fixture(adapter: ReferenceLmsAdapter, userId = 'u-1') {
  return adapter.normalizeWebhook({
    scope: 'fixture-primary',
    observedAt: '2026-08-25T18:00:00.000Z',
    correlationId: 'fixture',
    payload: {
      user_id: userId,
      course_id: 'c-1',
      enrollment_id: `e-${userId}`,
      status: 'completed',
      progress_percent: 100,
      completed_at: '2026-08-24T18:00:00Z',
    },
  });
}

describe('relationship context service', () => {
  beforeEach(clearRelationshipContextGrantsForTests);

  it('binds a unique verified claim, records idempotent facts, and returns a receipted pack', async () => {
    const { registry, adapter } = configured();
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(42, null);
    const candidateFingerprint = sha256Json({
      scope: 'fixture-primary',
      user_id: 'u-1',
    });
    await repository.addIdentifierClaim({
      partyId: 42,
      kind: 'provider_user_id',
      fingerprint: candidateFingerprint,
      verified: true,
      effectiveAt: '2026-08-25T18:00:00Z',
      evidenceSha256: 'e'.repeat(64),
    });
    const first = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch: fixture(adapter),
      nowMs: Date.parse('2026-08-25T18:00:00Z'),
    });
    expect(first).toEqual({
      observationsNew: 3,
      observationsDuplicate: 0,
      projectionsChanged: 3,
      heldFacts: 0,
    });
    const replay = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch: fixture(adapter),
      nowMs: Date.parse('2026-08-25T18:00:00Z'),
    });
    expect(replay.observationsDuplicate).toBe(3);
    expect(replay.projectionsChanged).toBe(0);

    const env = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
    issueRelationshipContextGrant({
      group: 'grader',
      runId: '00000000-0000-4000-8000-000000000001',
      sourceContainer: 'container-1',
      workItemId: 'work:grading:1',
      purpose: 'grading_prerequisite',
      subject: { kind: 'party', partyId: 42 },
      sections: ['identity', 'learning'],
      env,
      nowMs: 1_000,
    });
    const grant = consumeRelationshipContextGrant({
      group: 'grader',
      runId: '00000000-0000-4000-8000-000000000001',
      sourceContainer: 'container-1',
      request: {
        purpose: 'grading_prerequisite',
        subject: { kind: 'party', partyId: 42 },
        sections: ['identity', 'learning'],
      },
      env,
      nowMs: 1_100,
    });
    const pack = await getRelationshipContext({
      repository,
      grant,
      nowMs: Date.parse('2026-08-25T18:00:00Z'),
    });
    expect(pack.resolution).toBe('resolved');
    expect(pack.workItemId).toBe('work:grading:1');
    expect(pack.sections.learning?.projections).toHaveLength(3);
    expect(pack.sections.identity?.status).toBe('unknown');
    expect(repository.queryReceipts[0]).not.toHaveProperty('response');
    expect(repository.queryReceipts[0].workItemId).toBe('work:grading:1');
  });

  it('holds ambiguous identity and creates no projection', async () => {
    const { registry, adapter } = configured();
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, null);
    repository.parties.set(2, null);
    const fingerprint = sha256Json({
      scope: 'fixture-primary',
      user_id: 'u-2',
    });
    for (const partyId of [1, 2]) {
      await repository.addIdentifierClaim({
        partyId,
        kind: 'provider_user_id',
        fingerprint,
        verified: true,
        effectiveAt: '2026-08-25T18:00:00Z',
        evidenceSha256: 'f'.repeat(64),
      });
    }
    const result = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch: fixture(adapter, 'u-2'),
    });
    expect(result.heldFacts).toBe(3);
    expect(repository.projections.size).toBe(0);
    expect(repository.exceptions.size).toBeGreaterThan(0);
  });

  it('links the original observation when identity becomes uniquely resolvable on replay', async () => {
    const { registry, adapter } = configured();
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(9, null);
    const batch = fixture(adapter, 'u-late');
    const held = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch,
    });
    expect(held.heldFacts).toBe(3);
    expect(
      [...repository.observations.values()].every(
        (row) => row.partyId === null,
      ),
    ).toBe(true);
    await repository.addIdentifierClaim({
      partyId: 9,
      kind: 'provider_user_id',
      fingerprint: sha256Json({
        scope: 'fixture-primary',
        user_id: 'u-late',
      }),
      verified: true,
      effectiveAt: '2026-08-25T18:00:00Z',
      evidenceSha256: '9'.repeat(64),
    });
    const replay = await ingestRelationshipContextBatch({
      repository,
      registry,
      batch,
    });
    expect(replay.observationsDuplicate).toBe(3);
    expect(
      [...repository.observations.values()].every((row) => row.partyId === 9),
    ).toBe(true);
    expect(repository.projections.size).toBe(3);
  });

  it('reports an open external-ref ambiguity instead of collapsing it to not_found', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, null);
    repository.parties.set(2, null);
    const reference = {
      provider: 'reference_lms',
      scope: 'fixture-primary',
      entityType: 'person',
      externalId: 'u-ambiguous-query',
    };
    await repository.ensureIdentityException({
      fingerprint: 'a'.repeat(64),
      partyIds: [1, 2],
      reasonCode: 'identity_ambiguous',
      evidenceRefs: { source_ref_sha256: sha256Json(reference) },
      observedAt: '2026-08-25T18:00:00Z',
    });
    const env = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
    issueRelationshipContextGrant({
      group: 'grader',
      runId: '00000000-0000-4000-8000-000000000002',
      sourceContainer: 'container-query',
      workItemId: 'work:query:ambiguous',
      purpose: 'grading_prerequisite',
      subject: { kind: 'external_ref', reference },
      sections: ['identity'],
      env,
    });
    const grant = consumeRelationshipContextGrant({
      group: 'grader',
      runId: '00000000-0000-4000-8000-000000000002',
      sourceContainer: 'container-query',
      request: {
        purpose: 'grading_prerequisite',
        subject: { kind: 'external_ref', reference },
        sections: ['identity'],
      },
      env,
    });
    const pack = await getRelationshipContext({ repository, grant });
    expect(pack.resolution).toBe('ambiguous');
    expect(pack.missingCodes).toEqual(['identity_ambiguous']);
  });
});
