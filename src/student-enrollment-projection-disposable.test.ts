import { describe, expect, it } from 'vitest';
import { runEnrollmentProjectionDisposableProof } from '../scripts/verify-student-enrollment-projection-disposable.mjs';

describe('student enrollment projection disposable PostgreSQL', () => {
  it('proves durable versioned delivery without production or provider access', () => {
    expect(runEnrollmentProjectionDisposableProof()).toMatchObject({
      ok: true,
      dropped: true,
      populatedRollbackRefused: true,
      worker: {
        claimRace: { claimedOnce: true },
        retry: { heartbeatAttempts: 2, verified: true },
        uncertainAcceptance: { heldBeforeRetry: true, durableException: true },
        idempotency: { duplicateQueueNoOp: true },
        supersession: { version1Superseded: true },
        staleVersion: { refused: true },
        exactReadback: { receipt: true },
        rollback: { providerEffectRemoved: true },
        partialFailure: {
          fundedOrderPreserved: true,
          enrollmentPreserved: true,
          assignmentPreserved: true,
        },
      },
    });
  }, 60000);
});
