import { describe, expect, it } from 'vitest';

import { runAccCapacityReadinessDisposableProof } from '../scripts/verify-acc-capacity-readiness-disposable.mjs';

describe('ACC capacity readiness disposable proof', () => {
  it('applies, reapplies, safely rolls back, and refuses conflicting state', () => {
    expect(runAccCapacityReadinessDisposableProof()).toEqual({
      ok: true,
      counts: '4|4|12',
      rollbackCount: '0',
      conflictRefused: true,
    });
  }, 30_000);
});
