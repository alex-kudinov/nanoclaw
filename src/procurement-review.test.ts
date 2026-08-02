import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProcurementReviewCard,
  handleProcurementDecisionMessage,
  parseProcurementDecisionCommand,
  type ProcurementReviewDeps,
} from './procurement-review.js';

const enabledEnv = {
  PROCUREMENT_REVIEW_ENABLED: '1',
  PROCUREMENT_REVIEW_EPOCH: 'epoch-1',
  PROCUREMENT_OPERATOR_UIDS: 'U_ALEX,U_BACKUP',
};

function deps(): ProcurementReviewDeps {
  return {
    query: vi.fn(),
    postCard: vi.fn(),
    postThread: vi.fn(),
  };
}

describe('Procurement decision command', () => {
  it('accepts only an exact versioned decision with a reason', () => {
    expect(
      parseProcurementDecisionCommand(
        'DECIDE #42 v0 process — Matches leadership coaching scope',
      ),
    ).toEqual({
      opportunityId: 42,
      expectedVersion: 0,
      decision: 'process',
      reason: 'Matches leadership coaching scope',
    });
    expect(parseProcurementDecisionCommand('process 42')).toBeNull();
    expect(parseProcurementDecisionCommand('DECIDE #42 v0 process')).toBeNull();
    expect(
      parseProcurementDecisionCommand('DECIDE #42 v0 submit — do it'),
    ).toBeNull();
  });
});

describe('host-generated Procurement review card', () => {
  let d: ProcurementReviewDeps;

  beforeEach(() => {
    d = deps();
  });

  it('fails closed before querying or posting when review is disabled', async () => {
    await expect(
      createProcurementReviewCard(
        {
          opportunityId: 42,
          expectedVersion: 0,
          recommendation: 'process',
          reason: 'Good fit',
        },
        d,
        {},
      ),
    ).rejects.toThrow('disabled');
    expect(d.query).not.toHaveBeenCalled();
    expect(d.postCard).not.toHaveBeenCalled();
  });

  it('renders current DB truth, anchors the card, and records the binding', async () => {
    vi.mocked(d.query)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: 42,
            source: 'caleprocure',
            source_key: '3900/0000042001',
            title: 'Leadership coaching',
            agency: 'Example Department',
            close_date: '2026-08-21',
            category: 'RFP',
            review_state: 'unreviewed',
            review_version: 0,
            days_until_close: 22,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ card_id: 9 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    vi.mocked(d.postCard).mockResolvedValue({
      channelJid: 'slack:C_PROC',
      messageTs: '123.45',
    });

    await expect(
      createProcurementReviewCard(
        {
          opportunityId: 42,
          expectedVersion: 0,
          recommendation: 'process',
          reason: 'Matches the public scope',
        },
        d,
        enabledEnv,
      ),
    ).resolves.toEqual({
      opportunityId: 42,
      reviewVersion: 0,
      channelJid: 'slack:C_PROC',
      messageTs: '123.45',
      reused: false,
    });

    expect(d.postCard).toHaveBeenCalledWith(
      expect.stringContaining('DECIDE #42 v0 needs_info'),
      'procurement:opp:42',
    );
    expect(vi.mocked(d.query).mock.calls.at(-1)?.[1]).toEqual([
      42,
      0,
      'slack:C_PROC',
      '123.45',
      'epoch-1',
      'process',
      'Matches the public scope',
    ]);
  });

  it('reuses an open card for the same version and epoch', async () => {
    vi.mocked(d.query).mockResolvedValueOnce({
      rows: [{ channel_jid: 'slack:C_PROC', message_ts: '123.45' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await createProcurementReviewCard(
      {
        opportunityId: 42,
        expectedVersion: 0,
        recommendation: 'process',
        reason: 'Good fit',
      },
      d,
      enabledEnv,
    );
    expect(result.reused).toBe(true);
    expect(d.postCard).not.toHaveBeenCalled();
  });

  it('disarms an orphan card when the DB binding fails', async () => {
    vi.mocked(d.query)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: 42,
            source: 'email',
            source_key: 'gmail-1',
            title: 'Coaching RFP',
            agency: null,
            close_date: null,
            category: null,
            review_state: 'unreviewed',
            review_version: 0,
            days_until_close: null,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockRejectedValueOnce(new Error('db offline'));
    vi.mocked(d.postCard).mockResolvedValue({
      channelJid: 'slack:C_PROC',
      messageTs: '123.45',
    });

    await expect(
      createProcurementReviewCard(
        {
          opportunityId: 42,
          expectedVersion: 0,
          recommendation: 'needs_info',
          reason: 'Deadline missing',
        },
        d,
        enabledEnv,
      ),
    ).rejects.toThrow('db offline');
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_PROC',
      '123.45',
      expect.stringContaining('CARD DISARMED'),
    );
  });
});

describe('named-human Procurement decision', () => {
  let d: Pick<ProcurementReviewDeps, 'query' | 'postThread'>;

  beforeEach(() => {
    d = {
      query: vi.fn(),
      postThread: vi.fn(),
    };
  });

  const message = {
    channelJid: 'slack:C_PROC',
    threadTs: '123.45',
    text: 'DECIDE #42 v0 process — Matches the leadership coaching scope',
    actorUid: 'U_ALEX',
    actorName: 'Alex',
  };

  it('ignores ordinary conversation', async () => {
    expect(
      await handleProcurementDecisionMessage(
        { ...message, text: 'looks good to me' },
        d,
        enabledEnv,
      ),
    ).toBe(false);
    expect(d.query).not.toHaveBeenCalled();
  });

  it('rejects missing thread, disabled policy, and unnamed users without writing', async () => {
    expect(
      await handleProcurementDecisionMessage(
        { ...message, threadTs: undefined },
        d,
        enabledEnv,
      ),
    ).toBe(true);
    expect(await handleProcurementDecisionMessage(message, d, {})).toBe(true);
    expect(
      await handleProcurementDecisionMessage(
        { ...message, actorUid: 'U_OTHER' },
        d,
        enabledEnv,
      ),
    ).toBe(true);
    expect(d.query).not.toHaveBeenCalled();
  });

  it('passes only the exact card, version, epoch, decision, and Slack UID', async () => {
    vi.mocked(d.query).mockResolvedValueOnce({
      rows: [
        {
          opportunity_id: 42,
          review_state: 'process',
          review_version: 1,
          status: 'accepted',
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    expect(await handleProcurementDecisionMessage(message, d, enabledEnv)).toBe(
      true,
    );
    expect(vi.mocked(d.query).mock.calls[0][1]).toEqual([
      'slack:C_PROC',
      '123.45',
      42,
      0,
      'process',
      'Matches the leadership coaching scope',
      'U_ALEX',
      'epoch-1',
    ]);
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_PROC',
      '123.45',
      expect.stringContaining('DECISION RECORDED'),
    );
  });

  it('reports stale, replayed, or unbound cards without claiming a transition', async () => {
    vi.mocked(d.query).mockRejectedValueOnce(new Error('review card conflict'));
    expect(await handleProcurementDecisionMessage(message, d, enabledEnv)).toBe(
      true,
    );
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_PROC',
      '123.45',
      expect.stringContaining('NOT RECORDED'),
    );
  });
});
