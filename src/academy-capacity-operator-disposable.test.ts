import { describe, expect, it } from 'vitest';

import { runAcademyCapacityOperatorDisposableProof } from '../scripts/verify-academy-capacity-operator-disposable.mjs';

describe('Academy Capacity Gate D disposable proof', () => {
  it('serializes the last seat and proves exact command receipts', () => {
    const result = runAcademyCapacityOperatorDisposableProof() as any;
    expect(result.ok).toBe(true);
    expect(result.worker.race).toEqual({
      applied: 1,
      needsReview: 1,
      release: 'applied',
    });
    expect(result.worker.idempotency).toEqual({
      first: 'applied',
      replayed: true,
      replayState: 'applied',
      conflict: 'idempotency_conflict',
      stale: 'stale_version',
    });
    expect(result.worker.waitlist).toEqual({
      join: 'applied',
      stage: 'applied',
      secondJoin: 'applied',
      secondStage: 'waitlist_offer_active',
      messageSent: false,
      approvalRequired: true,
    });
    expect(result.worker.assignment).toEqual({
      persistenceRefusal: {
        state: 'needs_review',
        code: 'assignment_insert_missing_reference',
        readback: {
          origin_state: 'active',
          enrollment_version: 0,
          destination_count: '0',
          origin_pool_version: 0,
          destination_pool_version: 5,
        },
      },
      transfer: 'applied',
      withdraw: 'applied',
      reconcile: 'applied',
      originState: 'transferred',
      destinationState: 'cancelled',
    });
    expect(result.worker.inventory).toMatchObject({
      capacity: 12,
      occupied: 0,
      reserved: 1,
      available: 11,
      waitlistCount: 2,
      poolVersion: 8,
    });
    expect(result.worker.exceptionReadback).toEqual({
      inventory: [
        { reasonCode: 'mcs_friday_owner_count_variance', severity: 'high' },
      ],
      enrollment: [
        { reasonCode: 'mcs_friday_owner_count_variance', severity: 'high' },
      ],
    });
    expect(result.worker.ledger).toEqual({
      cases: '14',
      receipts: '28',
      review_cases: '4',
      pii_summaries: '0',
    });
    expect(result.non_admin_grants).toBe(0);
    expect(result.owner_count).toBe('11|11');
    expect(result.rollback_refused).toBe(true);
  }, 60_000);
});
