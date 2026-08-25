import { describe, expect, it } from 'vitest';

import { planPlutioProjection } from './relationship-context-plutio.js';

describe('relationship context Plutio planner', () => {
  it('produces deterministic dry-run fields without an execute surface', () => {
    const input = {
      partyId: 42,
      plutioRefEntityId: 42,
      projectionVersion: 3,
      desiredFields: {
        company_os_party_id: '42',
        relationship_summary: 'current client',
        context_freshness: 'current',
      },
      providerFields: {
        company_os_party_id: '42',
      },
      lastReceiptedFields: {
        company_os_party_id: '42',
      },
      providerReadCertain: true,
    };
    const a = planPlutioProjection(input);
    const b = planPlutioProjection(input);
    expect(a.mode).toBe('dry_run');
    expect(a.status).toBe('planned');
    expect(a.projectionSha256).toBe(b.projectionSha256);
    expect(a.proposedFields).toEqual({
      relationship_summary: 'current client',
      context_freshness: 'current',
    });
    expect(planPlutioProjection).not.toHaveProperty('execute');
  });

  it('holds uncertain reads and operator/provider drift', () => {
    const uncertain = planPlutioProjection({
      partyId: 42,
      plutioRefEntityId: null,
      projectionVersion: 1,
      desiredFields: { relationship_summary: 'client' },
      providerFields: {},
      lastReceiptedFields: null,
      providerReadCertain: false,
    });
    expect(uncertain.status).toBe('uncertain');
    expect(uncertain.conflictCodes).toContain('provider_read_uncertain');
    expect(uncertain.conflictCodes).toContain('plutio_ref_missing');

    const conflict = planPlutioProjection({
      partyId: 42,
      plutioRefEntityId: 42,
      projectionVersion: 2,
      desiredFields: { relationship_summary: 'client' },
      providerFields: { relationship_summary: 'operator edit' },
      lastReceiptedFields: { relationship_summary: 'prospect' },
      providerReadCertain: true,
    });
    expect(conflict.status).toBe('conflict');
    expect(conflict.conflictCodes).toContain(
      'operator_or_provider_drift:relationship_summary',
    );
  });
});
