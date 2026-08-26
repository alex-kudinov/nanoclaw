import { describe, expect, it } from 'vitest';

import { runRelationshipContextExactReadCanary } from './relationship-context-live-canary.js';
import { InMemoryRelationshipContextRepository } from './relationship-context-store.js';

describe('relationship context exact-read canary', () => {
  it('consumes one exact policy grant and records delivery without returning values', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(42, null);
    const reference = {
      provider: 'trafft',
      scope: 'primary',
      entityType: 'appointment',
      externalId: 'appt-canary',
    };
    await repository.bindExternalRef({
      partyId: 42,
      reference,
      adapterKey: 'trafft_host_ledger',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-26T14:00:00Z',
      verifiedAt: '2026-08-26T14:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });
    await repository.upsertProjection({
      partyId: 42,
      section: 'appointments',
      projectionKey: 'appointments.trafft.lifecycle:canary',
      value: { hidden: 'must-not-return-in-summary' },
      valueSha256: 'b'.repeat(64),
      sourceWatermarks: { 'trafft:primary': 'watermark' },
      status: 'current',
      missingCodes: [],
      conflictCodes: [],
      effectiveAt: '2026-08-26T14:00:00Z',
      observedAt: '2026-08-26T14:00:00Z',
      freshUntil: '2026-08-27T14:00:00Z',
    });
    const summary = await runRelationshipContextExactReadCanary({
      repository,
      reference,
      nowMs: Date.parse('2026-08-26T14:01:00Z'),
    });
    expect(summary).toMatchObject({
      schemaVersion: 1,
      resolution: 'resolved',
      sectionStatus: 'current',
      projectionCount: 1,
      deliveryStatus: 'delivered',
    });
    expect(JSON.stringify(summary)).not.toContain('must-not-return');
    expect(repository.queryReceipts).toHaveLength(1);
    expect(repository.queryDeliveries.get(summary.receiptId)?.status).toBe(
      'delivered',
    );
  });

  it('marks the receipt failed when exact context is not ready', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(43, null);
    const reference = {
      provider: 'trafft',
      scope: 'primary',
      entityType: 'appointment',
      externalId: 'appt-not-ready',
    };
    await repository.bindExternalRef({
      partyId: 43,
      reference,
      adapterKey: 'trafft_host_ledger',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-26T14:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });
    await expect(
      runRelationshipContextExactReadCanary({
        repository,
        reference,
        nowMs: Date.parse('2026-08-26T14:01:00Z'),
      }),
    ).rejects.toThrow('relationship_context_exact_read_canary_not_ready');
    expect([...repository.queryDeliveries.values()][0]).toEqual({
      status: 'failed',
      errorCode: 'exact_read_canary_not_ready',
    });
  });
});
