import { describe, expect, it, vi } from 'vitest';

import { StudentLifecycleHealthMonitor } from './student-lifecycle-health.js';

const METRICS = {
  eventCount: 3,
  activeEnrollmentCount: 1,
  openExceptionCount: 0,
  lastEventReceivedAt: '2026-08-24T18:00:00.000Z',
  lastReconciliationCompletedAt: '2026-08-24T17:00:00.000Z',
};

describe('student lifecycle health monitor', () => {
  it('never queries the store while disabled', async () => {
    const read = vi.fn().mockResolvedValue(METRICS);
    const monitor = new StudentLifecycleHealthMonitor(false, read);
    expect(await monitor.refresh()).toEqual({
      state: 'disabled',
      checkedAt: null,
      errorCode: null,
      metrics: null,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('publishes only aggregate healthy metrics', async () => {
    const monitor = new StudentLifecycleHealthMonitor(
      true,
      async () => METRICS,
      () => '2026-08-24T18:20:00.000Z',
    );
    expect(await monitor.refresh()).toEqual({
      state: 'healthy',
      checkedAt: '2026-08-24T18:20:00.000Z',
      errorCode: null,
      metrics: METRICS,
    });
  });

  it('fails closed without exposing database error detail', async () => {
    const monitor = new StudentLifecycleHealthMonitor(
      true,
      async () => {
        throw new Error('password and SQL detail');
      },
      () => '2026-08-24T18:20:00.000Z',
    );
    expect(await monitor.refresh()).toEqual({
      state: 'error',
      checkedAt: '2026-08-24T18:20:00.000Z',
      errorCode: 'store_unavailable',
      metrics: null,
    });
  });
});
