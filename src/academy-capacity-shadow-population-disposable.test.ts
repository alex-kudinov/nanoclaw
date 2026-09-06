import { describe, expect, it } from 'vitest';

import {
  runAcademyCapacityShadowPopulationDisposableProof,
  syntheticAcademyCapacityShadowManifest,
} from '../scripts/verify-academy-capacity-shadow-population-disposable.mjs';

describe('Academy capacity shadow population disposable proof', () => {
  it('keeps the disposable fixture structurally production-shaped', () => {
    const manifest = syntheticAcademyCapacityShadowManifest() as any;
    expect(manifest.delivery_blocks).toHaveLength(5);
    expect(manifest.participants).toHaveLength(40);
    expect(manifest.exceptions).toHaveLength(3);
  });

  it('applies once, replays with zero inserts, and leaves no non-admin grants', () => {
    const result = runAcademyCapacityShadowPopulationDisposableProof() as any;
    expect(result.ok).toBe(true);
    expect(result.first_created_parties).toBe(3);
    expect(result.replay_inserted).toBe(0);
    expect(result.non_admin_grants).toBe(0);
    expect(result.first_counts).toMatchObject({
      delivery_blocks: 5,
      seat_pools: 5,
      offer_mappings: 7,
      orders: 40,
      enrollments: 40,
      entitlements: 310,
      assignments: 40,
      exceptions: 3,
      pending_projections: 0,
      reservations: 0,
      waitlist_entries: 0,
    });
    expect(result.first_occupancy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivery_block_key: 'acc.module-1:2026-09-07',
          occupied: 21,
          available: 0,
          public_state: 'sold_out',
        }),
        expect.objectContaining({
          delivery_block_key: 'mcs-practicum:2026-09-24',
          occupied: 5,
          available: 7,
          public_state: 'open',
        }),
        expect.objectContaining({
          delivery_block_key: 'mcs-practicum:2026-09-25',
          occupied: 13,
          available: 0,
          public_state: 'sold_out',
        }),
      ]),
    );
  });
});
