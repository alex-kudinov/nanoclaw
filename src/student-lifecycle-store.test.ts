import { describe, expect, it, vi } from 'vitest';

import {
  type LifecycleCatalogMatch,
  type LifecycleEnrollmentRecord,
  type StudentLifecycleRepository,
  processPreparedCommunityLifecycle,
} from './student-lifecycle-store.js';
import {
  defaultLifecycleProjection,
  prepareCommunityLifecycleEnvelope,
} from './student-lifecycle.js';

const IDS = {
  delivery: '11111111-1111-4111-8111-111111111111',
  community: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333',
  group: '44444444-4444-4444-8444-444444444444',
  course: '55555555-5555-4555-8555-555555555555',
};
const SECRET = 'test-only-secret';

function prepared(
  action: 'USER_JOIN' | 'GROUP_JOIN' | 'COURSE_COMPLETED' | 'DOCUMENT_CREATE',
) {
  const data = {
    USER_JOIN: { id: IDS.user, name: 'Student', email: 'student@example.com' },
    GROUP_JOIN: { userID: IDS.user, groupID: IDS.group },
    COURSE_COMPLETED: {
      userID: IDS.user,
      courseID: IDS.course,
      courseName: 'Course',
    },
    DOCUMENT_CREATE: { id: IDS.course },
  }[action];
  return prepareCommunityLifecycleEnvelope(
    {
      schema_version: 1,
      workspace: 'community',
      community_id: IDS.community,
      delivery_id: IDS.delivery,
      observed_at: '2026-08-24T15:00:00Z',
      action: { name: action },
      data,
    },
    SECRET,
  );
}

function enrollment(id = 20): LifecycleEnrollmentRecord {
  return {
    id,
    version: 0,
    projection: defaultLifecycleProjection(),
    policyVersion: 'policy-v1',
    catalogRevision: 1,
  };
}

function repository(overrides: Partial<StudentLifecycleRepository> = {}) {
  const catalog: LifecycleCatalogMatch = {
    id: 10,
    entryKey: 'course-entry',
    catalogRevision: 1,
    mappingScope: 'exact_offer',
    policyVersion: 'policy-v1',
  };
  const base: StudentLifecycleRepository = {
    findPartyByHeartbeatUser: vi.fn(async () => 100),
    findPartiesByEmail: vi.fn(async () => [100]),
    bindHeartbeatIdentity: vi.fn(async (): Promise<'bound'> => 'bound'),
    findCatalogMatches: vi.fn(async () => [catalog]),
    insertEvent: vi.fn(async () => ({ id: 30, duplicate: false })),
    markEvent: vi.fn(async () => undefined),
    ensureException: vi.fn(async () => undefined),
    listActiveEnrollmentsForUser: vi.fn(async () => [enrollment()]),
    ensureEnrollment: vi.fn(async () => enrollment()),
    applyProjection: vi.fn(async () => 1),
    recordReconciliationRun: vi.fn(async () => ({ id: 1, duplicate: false })),
    health: vi.fn(async () => ({
      eventCount: 0,
      activeEnrollmentCount: 0,
      openExceptionCount: 0,
      lastEventReceivedAt: null,
      lastReconciliationCompletedAt: null,
    })),
  };
  return Object.assign(base, overrides);
}

describe('student lifecycle deterministic store orchestration', () => {
  it('archives/records an unresolved identity as a durable exception', async () => {
    const repo = repository({
      findPartyByHeartbeatUser: vi.fn(async () => null),
      findPartiesByEmail: vi.fn(async () => []),
    });
    const input = prepared('USER_JOIN');
    const result = await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
      transientEmail: input.transient_email,
    });
    expect(result.processingStatus).toBe('quarantined');
    expect(result.exceptionReason).toBe('needs_identity');
    expect(repo.ensureException).toHaveBeenCalledOnce();
    expect(repo.applyProjection).not.toHaveBeenCalled();
  });

  it('binds one exact email match after the inbox receipt exists upstream', async () => {
    const repo = repository({
      findPartyByHeartbeatUser: vi.fn(async () => null),
      findPartiesByEmail: vi.fn(async () => [100]),
    });
    const input = prepared('USER_JOIN');
    const result = await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
      transientEmail: input.transient_email,
    });
    expect(result.processingStatus).toBe('applied');
    expect(repo.bindHeartbeatIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 100, userId: IDS.user }),
    );
    expect(repo.applyProjection).toHaveBeenCalledOnce();
  });

  it('quarantines an ambiguous catalog instead of projecting', async () => {
    const match: LifecycleCatalogMatch = {
      id: 10,
      entryKey: 'course-entry',
      catalogRevision: 1,
      mappingScope: 'exact_offer',
      policyVersion: 'policy-v1',
    };
    const repo = repository({
      findCatalogMatches: vi.fn(async () => [match, { ...match, id: 11 }]),
    });
    const input = prepared('GROUP_JOIN');
    const result = await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
    });
    expect(result.exceptionReason).toBe('ambiguous_catalog');
    expect(repo.ensureEnrollment).not.toHaveBeenCalled();
  });

  it('applies group access without changing other axes', async () => {
    const repo = repository();
    const input = prepared('GROUP_JOIN');
    await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
    });
    expect(repo.applyProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        next: expect.objectContaining({
          access: 'provisioned',
          learning: 'not_started',
          finance: 'unknown',
        }),
        changes: [
          expect.objectContaining({ axis: 'access', next: 'provisioned' }),
        ],
      }),
    );
  });

  it('marks a course-only completion unclassified', async () => {
    const repo = repository({
      findCatalogMatches: vi.fn(async () => [
        {
          id: 10,
          entryKey: 'course-entry',
          catalogRevision: 1,
          mappingScope: 'course_only' as const,
          policyVersion: 'policy-v1',
        },
      ]),
    });
    const input = prepared('COURSE_COMPLETED');
    await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
    });
    expect(repo.applyProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        next: expect.objectContaining({ learning: 'completion_unclassified' }),
      }),
    );
  });

  it('does not require identity or catalog for non-lifecycle facts', async () => {
    const repo = repository({
      findPartyByHeartbeatUser: vi.fn(async () => null),
      findPartiesByEmail: vi.fn(async () => []),
    });
    const input = prepared('DOCUMENT_CREATE');
    const result = await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
    });
    expect(result.processingStatus).toBe('applied');
    expect(repo.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mappingStatus: 'not_applicable' }),
    );
    expect(repo.ensureException).not.toHaveBeenCalled();
    expect(repo.applyProjection).not.toHaveBeenCalled();
  });

  it('returns duplicate without projection or exception side effects', async () => {
    const repo = repository({
      insertEvent: vi.fn(async () => ({ id: 30, duplicate: true })),
    });
    const input = prepared('GROUP_JOIN');
    const result = await processPreparedCommunityLifecycle({
      repository: repo,
      event: input.prepared,
      webhookInboxId: 5,
    });
    expect(result.duplicate).toBe(true);
    expect(repo.ensureEnrollment).not.toHaveBeenCalled();
    expect(repo.ensureException).not.toHaveBeenCalled();
  });
});
