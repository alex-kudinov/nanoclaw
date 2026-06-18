import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runFast, runDigest } = vi.hoisted(() => ({
  runFast: vi.fn(),
  runDigest: vi.fn(),
}));
vi.mock('./collector.js', () => ({ runFast }));
vi.mock('./digest.js', () => ({ runDigest }));
vi.mock('../business-db.js', () => ({ resetBusinessPool: vi.fn() }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { dispatch } from './index.js';

describe('healer dispatch', () => {
  beforeEach(() => {
    runFast.mockReset().mockResolvedValue(undefined);
    runDigest.mockReset().mockResolvedValue(undefined);
  });

  it('routes "fast" to the collector only', async () => {
    expect(await dispatch('fast')).toBe(0);
    expect(runFast).toHaveBeenCalledOnce();
    expect(runDigest).not.toHaveBeenCalled();
  });

  it('routes "digest" to the digest only', async () => {
    expect(await dispatch('digest')).toBe(0);
    expect(runDigest).toHaveBeenCalledOnce();
    expect(runFast).not.toHaveBeenCalled();
  });

  it('exits 1 on an unknown mode and runs nothing', async () => {
    expect(await dispatch('bogus')).toBe(1);
    expect(runFast).not.toHaveBeenCalled();
    expect(runDigest).not.toHaveBeenCalled();
  });
});
