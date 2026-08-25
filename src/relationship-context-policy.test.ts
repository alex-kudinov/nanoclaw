import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRelationshipContextGrantsForTests,
  consumeRelationshipContextGrant,
  issueRelationshipContextGrant,
  relationshipContextPolicyDiagnostic,
} from './relationship-context-policy.js';

const enabled = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
const disabled = {} as NodeJS.ProcessEnv;

describe('relationship context policy', () => {
  beforeEach(clearRelationshipContextGrantsForTests);

  it('is default-off and requires an exact one-shot host grant', () => {
    expect(relationshipContextPolicyDiagnostic(disabled).enabled).toBe(false);
    expect(() =>
      issueRelationshipContextGrant({
        group: 'sales',
        runId: 'run-1',
        sourceContainer: 'container-1',
        workItemId: 'work:sales:1',
        purpose: 'answer_appointment_inquiry',
        subject: { kind: 'party', partyId: 42 },
        sections: ['identity', 'appointments'],
        env: disabled,
      }),
    ).toThrow('relationship_context_disabled');

    const grant = issueRelationshipContextGrant({
      group: 'sales',
      runId: 'run-1',
      sourceContainer: 'container-1',
      workItemId: 'work:sales:1',
      purpose: 'answer_appointment_inquiry',
      subject: { kind: 'party', partyId: 42 },
      sections: ['identity', 'appointments'],
      maxAgeSeconds: { appointments: 900 },
      env: enabled,
      nowMs: 1_000,
    });
    const consumed = consumeRelationshipContextGrant({
      group: 'sales',
      runId: 'run-1',
      sourceContainer: 'container-1',
      request: {
        purpose: 'answer_appointment_inquiry',
        subject: { kind: 'party', partyId: 42 },
        sections: ['identity', 'appointments'],
        maxAgeSeconds: { appointments: 900 },
      },
      env: enabled,
      nowMs: 2_000,
    });
    expect(consumed.workItemId).toBe('work:sales:1');
    expect(consumed.grantId).toBe(grant.grantId);
    expect(() =>
      consumeRelationshipContextGrant({
        group: 'sales',
        runId: 'run-1',
        sourceContainer: 'container-1',
        request: {
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 42 },
          sections: ['identity', 'appointments'],
          maxAgeSeconds: { appointments: 900 },
        },
        env: enabled,
        nowMs: 3_000,
      }),
    ).toThrow('relationship_context_grant_missing');
  });

  it('denies wrong group, purpose, section, subject, run, and expired grants', () => {
    const base = {
      group: 'sales',
      runId: 'run-2',
      sourceContainer: 'container-2',
      workItemId: 'work:sales:2',
      purpose: 'answer_appointment_inquiry' as const,
      subject: { kind: 'party' as const, partyId: 7 },
      sections: ['identity' as const],
      env: enabled,
      nowMs: 1_000,
      ttlSeconds: 1,
    };
    issueRelationshipContextGrant(base);
    expect(() =>
      consumeRelationshipContextGrant({
        group: 'booking',
        runId: 'run-2',
        sourceContainer: 'container-2',
        request: {
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 7 },
          sections: ['identity'],
        },
        env: enabled,
        nowMs: 1_100,
      }),
    ).toThrow('relationship_context_grant_missing');
    expect(() =>
      consumeRelationshipContextGrant({
        group: 'sales',
        runId: 'run-2',
        sourceContainer: 'container-2',
        request: {
          purpose: 'answer_appointment_inquiry',
          subject: { kind: 'party', partyId: 7 },
          sections: ['identity'],
        },
        env: enabled,
        nowMs: 3_000,
      }),
    ).toThrow('relationship_context_grant_expired');
  });
});
