import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({ query: vi.fn() }));

import { query } from './business-db.js';
import {
  findReplyCandidates,
  hasOpenAction,
  recordDeclineAction,
  getActionByTs,
  markActionDone,
  markActionDismissed,
  stopFollowups,
} from './proposal-reply-store.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => mockQuery.mockReset());

describe('findReplyCandidates', () => {
  it('maps rows and filters by sender (case-insensitive)', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          proposal_plutio_id: 'p1',
          proposal_number: 'tca-001',
          subject: 'Re: Coaching',
          recipient_email: 'K@X.com',
          party_id: 42,
          thread_id: 't1',
        },
      ],
    });
    const out = await findReplyCandidates('k@x.com');
    expect(out[0]).toEqual({
      proposalId: 'p1',
      number: 'tca-001',
      subject: 'Re: Coaching',
      recipientEmail: 'K@X.com',
      partyId: 42,
      threadId: 't1',
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('lower(pf.recipient_email) = lower($1)');
    expect(sql).toContain("status = 'cancelled'"); // excludes closed-out
    expect(params).toEqual(['k@x.com']);
  });
});

describe('hasOpenAction', () => {
  it('is true when a pending/done action exists', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
    expect(await hasOpenAction('p1')).toBe(true);
  });
  it('is false when none', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await hasOpenAction('p1')).toBe(false);
  });
});

describe('recordDeclineAction', () => {
  it('inserts a pending decline action', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await recordDeclineAction(
      {
        proposalId: 'p1',
        number: 'tca-001',
        subject: 's',
        recipientEmail: 'k@x.com',
        partyId: 42,
        threadId: 't1',
      },
      'no thanks',
      'card-ts',
    );
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO business_v2.proposal_actions');
    expect(sql).toContain("'decline'");
    expect(params).toEqual([
      'p1',
      'tca-001',
      'k@x.com',
      42,
      'no thanks',
      'card-ts',
    ]);
  });
});

describe('getActionByTs', () => {
  it('returns null when no pending action matches', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await getActionByTs('ts-x')).toBeNull();
  });
  it('maps a pending action row', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 9,
          proposal_plutio_id: 'p1',
          proposal_number: 'tca-001',
          recipient_email: 'k@x.com',
          party_id: 42,
        },
      ],
    });
    expect(await getActionByTs('ts-1')).toEqual({
      id: 9,
      proposalId: 'p1',
      proposalNumber: 'tca-001',
      recipientEmail: 'k@x.com',
      partyId: 42,
    });
  });
});

describe('mark + stop', () => {
  it('markActionDone sets done only when pending', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await markActionDone(9);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("status = 'done'");
    expect(sql).toContain("status = 'pending'");
    expect(params).toEqual([9]);
  });

  it('markActionDismissed sets dismissed', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await markActionDismissed(9);
    expect(mockQuery.mock.calls[0][0]).toContain("status = 'dismissed'");
  });

  it('stopFollowups writes the cancelled closeout sentinel', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await stopFollowups('p1', 'client declined by email');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO business_v2.proposal_followups');
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain(
      'ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING',
    );
    expect(params).toEqual(['p1', 5, 'client declined by email']);
  });
});
