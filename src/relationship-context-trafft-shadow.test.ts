import { beforeEach, describe, expect, it, vi } from 'vitest';

const businessDb = vi.hoisted(() => ({ withAgentContext: vi.fn() }));
vi.mock('./business-db.js', () => ({
  withAgentContext: businessDb.withAgentContext,
}));

import {
  getTrafftRelationshipContextShadowHealth,
  ingestTrafftShadowRows,
  normalizeTrafftShadowRow,
  resetTrafftRelationshipContextShadowHealthForTests,
  runTrafftRelationshipContextShadow,
  trafftShadowCollectionComplete,
  TrafftHostLedgerAdapter,
} from './relationship-context-trafft-shadow.js';
import { InMemoryRelationshipContextRepository } from './relationship-context-store.js';

const row = {
  id: '419',
  appointmentId: 'appt-419',
  eventType: 'booked',
  status: 'approved',
  service: 'Consultation',
  occurredAt: '2026-08-25T20:00:00Z',
  updatedAt: '2026-08-25T20:01:00Z',
};

describe('relationship context Trafft shadow', () => {
  beforeEach(() => {
    businessDb.withAgentContext.mockReset();
    resetTrafftRelationshipContextShadowHealthForTests();
  });

  it('normalizes only minimized candidate appointment context', () => {
    const fact = normalizeTrafftShadowRow(row);
    expect(fact.subject).toEqual({
      provider: 'trafft',
      scope: 'primary',
      entityType: 'appointment',
      externalId: 'appt-419',
    });
    expect(fact.confidence).toBe('provider_asserted');
    expect(fact.conflictState).toBe('held');
    expect(fact.value).toEqual({
      appointment_id: 'appt-419',
      event_type: 'booked',
      status: 'approved',
      service: 'Consultation',
      starts_at: '2026-08-25T20:00:00.000Z',
      identity_state: 'needs_identity',
    });
    expect(JSON.stringify(fact)).not.toContain('raw_payload');
    expect(JSON.stringify(fact)).not.toContain('email');
  });

  it('replays held observations without attaching them to a guessed Party', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    const first = await ingestTrafftShadowRows({ repository, rows: [row] });
    expect(first).toEqual({
      observationsNew: 1,
      observationsDuplicate: 0,
      projectionsChanged: 0,
      heldIdentityFacts: 1,
    });
    const replay = await ingestTrafftShadowRows({ repository, rows: [row] });
    expect(replay.observationsDuplicate).toBe(1);
    expect(replay.projectionsChanged).toBe(0);
    expect(repository.projections.size).toBe(0);
    expect([...repository.observations.values()][0].partyId).toBeNull();
    expect([...repository.exceptions.values()][0].reasonCode).toBe(
      'needs_identity',
    );
  });

  it('projects current context only after an exact appointment reference exists', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(17, null);
    await repository.bindExternalRef({
      partyId: 17,
      reference: {
        provider: 'trafft',
        scope: 'primary',
        entityType: 'appointment',
        externalId: 'appt-419',
      },
      adapterKey: 'trafft_host_ledger',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-25T20:01:00Z',
      verifiedAt: '2026-08-25T20:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });
    const result = await ingestTrafftShadowRows({
      repository,
      rows: [{ ...row, updatedAt: '2026-08-26T19:00:00Z' }],
    });
    expect(result.heldIdentityFacts).toBe(0);
    expect(result.projectionsChanged).toBe(1);
    const projections = await repository.listProjections(17, ['appointments']);
    expect(projections).toHaveLength(1);
    expect(projections[0].status).toBe('current');
    expect(projections[0].value).toMatchObject({
      value: { identity_state: 'exact_reference' },
    });
  });

  it('stays disabled without touching the database unless explicitly enabled', async () => {
    const health = await runTrafftRelationshipContextShadow({
      env: {} as NodeJS.ProcessEnv,
    });
    expect(health.status).toBe('disabled');
    expect(health.complete).toBe(false);
    expect(health.consumerEnabled).toBe(false);
    expect(getTrafftRelationshipContextShadowHealth()).toEqual(health);
    expect(
      new TrafftHostLedgerAdapter().describe().credentialHandle,
    ).toBeNull();
    expect(businessDb.withAgentContext).not.toHaveBeenCalled();
  });

  it('reports an incomplete limit-bound run as degraded', async () => {
    expect(trafftShadowCollectionComplete(999, 1_000)).toBe(true);
    expect(trafftShadowCollectionComplete(1_000, 1_000)).toBe(false);
    businessDb.withAgentContext.mockResolvedValue({
      rows: [row],
      complete: false,
      observationsNew: 1,
      observationsDuplicate: 0,
      projectionsChanged: 0,
      heldIdentityFacts: 1,
      exactCustomerReferences: 0,
      exactAppointmentReferences: 0,
      exactReferenceConflicts: 0,
    });
    const health = await runTrafftRelationshipContextShadow({
      env: {
        RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED: '1',
      } as NodeJS.ProcessEnv,
      limit: 1,
      nowMs: Date.parse('2026-08-25T20:05:00Z'),
    });
    expect(health.status).toBe('degraded');
    expect(health.complete).toBe(false);
    expect(health.errorCode).toBe('trafft_shadow_limit_reached');
  });

  it('records transaction failure truthfully and rejects invalid limits', async () => {
    await expect(
      runTrafftRelationshipContextShadow({
        env: {
          RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED: '1',
        } as NodeJS.ProcessEnv,
        limit: 0,
      }),
    ).rejects.toThrow('relationship_context_trafft_limit_invalid');
    await expect(
      runTrafftRelationshipContextShadow({
        env: {
          RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED: '1',
        } as NodeJS.ProcessEnv,
        limit: 5_001,
      }),
    ).rejects.toThrow('relationship_context_trafft_limit_invalid');

    businessDb.withAgentContext.mockRejectedValue(new Error('offline'));
    await expect(
      runTrafftRelationshipContextShadow({
        env: {
          RELATIONSHIP_CONTEXT_TRAFFT_SHADOW_ENABLED: '1',
        } as NodeJS.ProcessEnv,
        limit: 1,
        nowMs: Date.parse('2026-08-25T20:06:00Z'),
      }),
    ).rejects.toThrow('offline');
    expect(getTrafftRelationshipContextShadowHealth()).toMatchObject({
      status: 'degraded',
      errorCode: 'relationship_context_trafft_shadow_failed',
    });
  });
});
