import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({ query: vi.fn() }));

import { query } from './business-db.js';
import {
  computeState,
  pgFollowupStore,
  getPendingByTs,
  markCancelled,
  markSent,
} from './proposal-followup-store.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockQuery.mockReset());

describe('computeState', () => {
  it('derives last sent sequence, anchor, and pending flag', () => {
    const anchor = new Date('2026-06-15T14:00:00Z');
    const second = new Date('2026-06-22T14:00:00Z');
    const s = computeState([
      { sequence_no: 1, status: 'sent', sent_at: anchor },
      { sequence_no: 2, status: 'sent', sent_at: second },
      { sequence_no: 3, status: 'pending_approval', sent_at: null },
    ]);
    expect(s.lastSentSequence).toBe(2);
    expect(s.firstFollowupAt).toEqual(anchor);
    expect(s.lastSentAt).toEqual(second);
    expect(s.hasPendingApproval).toBe(true);
    expect([...s.existingSequences].sort()).toEqual([1, 2, 3]);
  });

  it('is empty for a proposal with no rows', () => {
    const s = computeState([]);
    expect(s.lastSentSequence).toBe(0);
    expect(s.firstFollowupAt).toBeNull();
    expect(s.hasPendingApproval).toBe(false);
  });

  it('does not treat expired/cancelled rows as sent', () => {
    const s = computeState([
      { sequence_no: 1, status: 'expired', sent_at: null },
      { sequence_no: 2, status: 'cancelled', sent_at: null },
    ]);
    expect(s.lastSentSequence).toBe(0);
    expect(s.existingSequences.has(1)).toBe(true);
    expect(s.existingSequences.has(2)).toBe(true);
  });

  it('flags closedOut when a cancelled row is present', () => {
    expect(computeState([]).closedOut).toBe(false);
    const s = computeState([
      { sequence_no: 5, status: 'cancelled', sent_at: new Date() },
    ]);
    expect(s.closedOut).toBe(true);
  });
});

describe('pgFollowupStore', () => {
  it('getState queries by proposal id and maps rows', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ sequence_no: 1, status: 'sent', sent_at: new Date() }],
    });
    const s = await pgFollowupStore.getState('pid1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['pid1']);
    expect(s.lastSentSequence).toBe(1);
  });

  it('recordDraft inserts pending_approval with ON CONFLICT DO NOTHING', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await pgFollowupStore.recordDraft({
      proposalId: 'pid1',
      proposalNumber: 'tca-001',
      sequence: 1,
      recipientEmail: 'k@x.com',
      recipientName: 'Katie D',
      partyId: 42,
      subject: 'S',
      body: 'B',
      url: 'https://x/p/1',
      slackTs: 'ts-1',
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO business_v2.proposal_followups');
    expect(sql).toContain(
      'ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING',
    );
    expect(params).toContain('pid1');
    expect(params).toContain('ts-1');
  });

  it('expireStale returns the affected row count', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 4 });
    expect(await pgFollowupStore.expireStale(7)).toBe(4);
    expect(mockQuery.mock.calls[0][1]).toEqual([7]);
  });

  it('recordCloseout inserts a cancelled sentinel row', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await pgFollowupStore.recordCloseout('pid1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain(
      'ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING',
    );
    expect(params).toEqual(['pid1', 5]);
  });

  it('recordSuppression upserts the de-dup row keyed by proposal id', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await pgFollowupStore.recordSuppression({
      proposalId: 'pid1',
      partyId: 42,
      email: 'k@x.com',
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain(
      'INSERT INTO business_v2.email_followup_suppressions',
    );
    expect(sql).toContain('ON CONFLICT (proposal_plutio_id) DO UPDATE');
    expect(sql).toContain('last_seen_open_at = NOW()');
    expect(params).toEqual(['pid1', 42, 'k@x.com']);
  });

  it('recordSuppression stores null email when blank', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await pgFollowupStore.recordSuppression({
      proposalId: 'pid2',
      partyId: null,
      email: '',
    });
    expect(mockQuery.mock.calls[0][1]).toEqual(['pid2', null, null]);
  });
});

describe('getPendingByTs / markSent', () => {
  it('returns null when no pending row matches the ts', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await getPendingByTs('ts-x')).toBeNull();
  });

  it('maps a pending row into a PendingDraft', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 7,
          proposal_plutio_id: 'pid1',
          sequence_no: 2,
          recipient_email: 'k@x.com',
          subject: 'S',
          body: 'B',
          party_id: 42,
          thread_id: null,
        },
      ],
    });
    const d = await getPendingByTs('ts-1');
    expect(d).toMatchObject({ id: 7, proposalId: 'pid1', sequence: 2 });
  });

  it('markSent updates status, message id, and thread id', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await markSent(7, 'm1', 't1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("status = 'sent'");
    expect(sql).toContain('thread_id');
    expect(params).toEqual([7, 'm1', 't1']);
  });

  it('markCancelled cancels only a pending draft', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await markCancelled(7);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("status = 'pending_approval'");
    expect(params).toEqual([7]);
  });
});
