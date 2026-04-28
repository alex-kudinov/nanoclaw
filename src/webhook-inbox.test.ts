/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import {
  archiveWebhook,
  markDispatched,
  markFailed,
  markHandled,
} from './webhook-inbox.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('archiveWebhook', () => {
  it('inserts a new row when event_id is null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
    const r = await archiveWebhook({
      source: 'trafft',
      raw_headers: { 'content-type': 'application/json' },
      raw_body: { ping: 'pong' },
    });
    expect(r).toEqual({ id: 1, isDuplicate: false });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
  });

  it('strips secret headers before persisting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '2' }] });
    await archiveWebhook({
      source: 'stripe',
      raw_headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'shh',
        authorization: 'Bearer ABC',
        'stripe-signature': 'v1=…',
      },
      raw_body: {},
    });
    const headersJson = mockQuery.mock.calls[0][1][4] as string;
    const parsed = JSON.parse(headersJson);
    expect(parsed['content-type']).toBeDefined();
    expect(parsed['x-webhook-secret']).toBeUndefined();
    expect(parsed['authorization']).toBeUndefined();
    expect(parsed['stripe-signature']).toBeUndefined();
  });

  it('returns isDuplicate=true when (source, event_id) already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '7' }] });
    const r = await archiveWebhook({
      source: 'stripe',
      event_id: 'evt_123',
      raw_headers: {},
      raw_body: { id: 'evt_123' },
    });
    expect(r).toEqual({ id: 7, isDuplicate: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
  });

  it('falls through to insert when (source, event_id) is fresh', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '8' }] });
    const r = await archiveWebhook({
      source: 'stripe',
      event_id: 'evt_new',
      event_type: 'checkout.session.completed',
      raw_headers: {},
      raw_body: {},
    });
    expect(r).toEqual({ id: 8, isDuplicate: false });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO');
  });
});

describe('markDispatched / markFailed / markHandled', () => {
  it('markDispatched updates only received/failed rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markDispatched(42);
    expect(mockQuery.mock.calls[0][0]).toContain("status = 'dispatched'");
    expect(mockQuery.mock.calls[0][0]).toContain(
      "status IN ('received', 'failed')",
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([42]);
  });

  it('markFailed truncates very long error strings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const longErr = 'x'.repeat(10000);
    await markFailed(7, longErr);
    expect(mockQuery.mock.calls[0][1][1].length).toBe(4000);
  });

  it('markHandled records party_id + related_entity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markHandled(11, {
      handled_by: 'booking',
      party_id: 10046,
      related_entity: { kind: 'interaction', id: 183 },
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([
      11,
      'booking',
      10046,
      JSON.stringify({ kind: 'interaction', id: 183 }),
    ]);
  });

  it('markHandled handles missing party_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markHandled(12, { handled_by: 'inbox' });
    expect(mockQuery.mock.calls[0][1]).toEqual([12, 'inbox', null, null]);
  });
});
