import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRelationshipContextGrantsForTests,
  issueRelationshipContextGrant,
} from './relationship-context-policy.js';
import {
  dispatchRelationshipContextIpc,
  type RelationshipContextGetPayload,
} from './relationship-context-ipc.js';
import { InMemoryRelationshipContextRepository } from './relationship-context-store.js';

const enabled = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
const disabled = {} as NodeJS.ProcessEnv;

describe('relationship context IPC', () => {
  beforeEach(clearRelationshipContextGrantsForTests);

  it('denies before repository or delivery when feature/grant is absent', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, null);
    const deliverSourceInput = vi.fn<
      (group: string, container: string, text: string) => boolean
    >(() => true);
    await expect(
      dispatchRelationshipContextIpc(
        'sales',
        {
          type: 'party_context_get',
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 1 },
          sections: ['identity'],
          groupFolder: 'sales',
          source_container: 'container-1',
          run_id: '00000000-0000-4000-8000-000000000001',
        },
        { repository, deliverSourceInput, env: disabled },
      ),
    ).rejects.toThrow('relationship_context_disabled');
    expect(deliverSourceInput).not.toHaveBeenCalled();
    expect(repository.queryReceipts).toHaveLength(0);
  });

  it('consumes one exact host grant and returns the pack only to its source container', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(42, null);
    const deliverSourceInput = vi.fn<
      (group: string, container: string, text: string) => boolean
    >(() => true);
    issueRelationshipContextGrant({
      group: 'sales',
      runId: '00000000-0000-4000-8000-000000000042',
      sourceContainer: 'container-42',
      workItemId: 'work:sales:42',
      purpose: 'answer_appointment_inquiry',
      subject: { kind: 'party', partyId: 42 },
      sections: ['identity', 'appointments'],
      env: enabled,
      nowMs: 1_000,
    });
    const payload: RelationshipContextGetPayload = {
      type: 'party_context_get',
      purpose: 'answer_appointment_inquiry',
      subject: { kind: 'party', partyId: 42 },
      sections: ['identity', 'appointments'],
      groupFolder: 'sales',
      source_container: 'container-42',
      run_id: '00000000-0000-4000-8000-000000000042',
    };
    await dispatchRelationshipContextIpc('sales', payload, {
      repository,
      deliverSourceInput,
      env: enabled,
      nowMs: 1_100,
    });
    expect(deliverSourceInput).toHaveBeenCalledOnce();
    expect(deliverSourceInput.mock.calls[0][0]).toBe('sales');
    expect(deliverSourceInput.mock.calls[0][1]).toBe('container-42');
    expect(deliverSourceInput.mock.calls[0][2]).toContain(
      '[RELATIONSHIP CONTEXT]',
    );
    expect(deliverSourceInput.mock.calls[0][2]).toContain('work:sales:42');
    expect(repository.queryReceipts[0].workItemId).toBe('work:sales:42');
    expect(repository.queryDeliveries.get(packReceiptId(repository))).toEqual({
      status: 'delivered',
      errorCode: null,
    });
    await expect(
      dispatchRelationshipContextIpc('sales', payload, {
        repository,
        deliverSourceInput,
        env: enabled,
        nowMs: 1_200,
      }),
    ).rejects.toThrow('relationship_context_grant_missing');
  });

  it('records failed transport instead of an immutable false-success receipt', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(55, null);
    const deliverSourceInput = vi.fn<
      (group: string, container: string, text: string) => boolean
    >(() => false);
    issueRelationshipContextGrant({
      group: 'grader',
      runId: '00000000-0000-4000-8000-000000000055',
      sourceContainer: 'container-55',
      workItemId: 'work:grader:55',
      purpose: 'grading_prerequisite',
      subject: { kind: 'party', partyId: 55 },
      sections: ['identity'],
      env: enabled,
    });
    await expect(
      dispatchRelationshipContextIpc(
        'grader',
        {
          type: 'party_context_get',
          purpose: 'grading_prerequisite',
          subject: { kind: 'party', partyId: 55 },
          sections: ['identity'],
          groupFolder: 'grader',
          source_container: 'container-55',
          run_id: '00000000-0000-4000-8000-000000000055',
        },
        { repository, deliverSourceInput, env: enabled },
      ),
    ).rejects.toThrow('relationship_context_source_container_unavailable');
    expect(repository.queryReceipts).toHaveLength(1);
    expect(repository.queryDeliveries.get(packReceiptId(repository))).toEqual({
      status: 'failed',
      errorCode: 'source_container_unavailable',
    });
  });

  it('denies mismatched group, subject, run, container, or unallowed section', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(7, null);
    const deliverSourceInput = vi.fn<
      (group: string, container: string, text: string) => boolean
    >(() => true);
    issueRelationshipContextGrant({
      group: 'booking',
      runId: '00000000-0000-4000-8000-000000000007',
      sourceContainer: 'container-7',
      workItemId: 'work:booking:7',
      purpose: 'answer_appointment_inquiry',
      subject: { kind: 'party', partyId: 7 },
      sections: ['appointments'],
      env: enabled,
    });
    await expect(
      dispatchRelationshipContextIpc(
        'booking',
        {
          type: 'party_context_get',
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 8 },
          sections: ['appointments'],
          groupFolder: 'booking',
          source_container: 'container-7',
          run_id: '00000000-0000-4000-8000-000000000007',
        },
        { repository, deliverSourceInput, env: enabled },
      ),
    ).rejects.toThrow('relationship_context_grant_missing');
    await expect(
      dispatchRelationshipContextIpc(
        'booking',
        {
          type: 'party_context_get',
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 7 },
          sections: ['commercial'],
          groupFolder: 'booking',
          source_container: 'container-7',
          run_id: '00000000-0000-4000-8000-000000000007',
        },
        { repository, deliverSourceInput, env: enabled },
      ),
    ).rejects.toThrow('relationship_context_policy_denied');
  });
});

function packReceiptId(
  repository: InMemoryRelationshipContextRepository,
): number {
  return [...repository.queryDeliveries.keys()][0];
}
