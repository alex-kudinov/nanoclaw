import { describe, it, expect, vi, beforeEach } from 'vitest';

const rec = vi.hoisted(() => ({
  calls: 0,
  result: {
    status: 'success',
    fetched_count: 0,
    missing_party_count: 0,
    synthesized_inbox_count: 0,
    watermark_action: 'advanced',
    since_iso: '2026-05-16T00:00:00Z',
  },
}));
const logs = vi.hoisted(() => ({ infos: [] as string[] }));

vi.mock('./chaos-reconciler.js', () => ({
  runChaosReconcile: vi.fn(() => {
    rec.calls++;
    return Promise.resolve(rec.result);
  }),
}));
vi.mock('./logger.js', () => ({
  logger: {
    info: (a: unknown, msg?: string) => {
      logs.infos.push(typeof a === 'string' ? a : (msg ?? ''));
    },
    debug: () => {},
    warn: () => {},
    error: () => {},
  },
}));

import { chaosReconcilerTick } from './index.js';

beforeEach(() => {
  rec.calls = 0;
  logs.infos.length = 0;
});

describe('chaos-reconciler daemon wireup', () => {
  it('invokes runChaosReconcile once and logs the end status', async () => {
    await chaosReconcilerTick({ getRegisteredGroups: () => ({}) });
    expect(rec.calls).toBe(1);
    const endLog = logs.infos.find((m) => m.includes('chaos-reconciler end'));
    expect(endLog).toBeDefined();
    expect(endLog).toContain('"success"'); // JSON-encoded ReconcileResult.status
  });
});
