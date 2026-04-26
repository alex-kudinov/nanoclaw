import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGet = vi.fn();
vi.mock('./db.js', () => ({
  lookupTrackingToken: (...args: unknown[]) => mockGet(...args),
}));

const mockQuery = vi.fn();
vi.mock('./business-db.js', () => ({
  getBusinessPool: () => ({ query: mockQuery }),
}));

import { handleUnsubscribe } from './email-unsubscribe.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleUnsubscribe', () => {
  it('returns ok:false for unknown token', async () => {
    mockGet.mockReturnValue(null);
    const result = await handleUnsubscribe('bad-token');
    expect(result).toEqual({ ok: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('sets DND and returns name on valid token', async () => {
    mockGet.mockReturnValue({ lead_id: 42, email_type: 'follow-up' });
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ display_name: 'Jane Doe' }],
      })
      .mockResolvedValueOnce({}); // interaction log

    const result = await handleUnsubscribe('valid-uuid');
    expect(result).toEqual({ ok: true, name: 'Jane Doe' });
    expect(mockQuery).toHaveBeenCalledTimes(2);

    // First call: UPDATE parties SET dnd_at
    const updateCall = mockQuery.mock.calls[0];
    expect(updateCall[0]).toContain('dnd_at');
    expect(updateCall[1]).toEqual([42]);
  });

  it('returns ok:true when party already DND (idempotent)', async () => {
    mockGet.mockReturnValue({ lead_id: 42, email_type: 'follow-up' });
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // UPDATE matched nothing
      .mockResolvedValueOnce({
        rows: [{ display_name: 'Jane Doe', dnd_at: '2026-04-20' }],
      });

    const result = await handleUnsubscribe('already-dnd-uuid');
    expect(result).toEqual({ ok: true, name: 'Jane Doe' });
  });

  it('returns ok:false when party not found in postgres', async () => {
    mockGet.mockReturnValue({ lead_id: 999, email_type: 'follow-up' });
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // UPDATE matched nothing
      .mockResolvedValueOnce({ rows: [{}] }); // no dnd_at → not already DND

    const result = await handleUnsubscribe('orphan-uuid');
    expect(result).toEqual({ ok: false });
  });

  it('still succeeds if interaction logging fails', async () => {
    mockGet.mockReturnValue({ lead_id: 42, email_type: 'follow-up' });
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ display_name: 'Jane Doe' }],
      })
      .mockRejectedValueOnce(new Error('connection refused'));

    const result = await handleUnsubscribe('valid-uuid');
    expect(result).toEqual({ ok: true, name: 'Jane Doe' });
  });
});
