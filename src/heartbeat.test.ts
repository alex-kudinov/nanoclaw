import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./business-db.js', () => ({ query }));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { writeHeartbeat, getVersion, HEARTBEAT_NAME } from './heartbeat.js';

describe('writeHeartbeat', () => {
  beforeEach(() => query.mockReset());

  it('upserts the heartbeat row with name, pid, and version', async () => {
    query.mockResolvedValue({ rows: [] });
    await writeHeartbeat('1.2.3');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO business_v2.daemon_heartbeat');
    expect(sql).toContain('ON CONFLICT (name) DO UPDATE');
    expect(params).toEqual([HEARTBEAT_NAME, process.pid, '1.2.3']);
  });

  it('swallows a query failure (never crashes the daemon)', async () => {
    query.mockRejectedValueOnce(new Error('PG down'));
    await expect(writeHeartbeat('1.0.0')).resolves.toBeUndefined();
  });
});

describe('getVersion', () => {
  it('returns a non-empty version string', () => {
    expect(getVersion()).toBeTruthy();
  });
});
