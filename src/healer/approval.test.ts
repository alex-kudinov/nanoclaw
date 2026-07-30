import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const slack = vi.hoisted(() => ({
  getReactions: vi.fn(),
  getReplies: vi.fn(),
}));
const rem = vi.hoisted(() => ({
  isActionable: vi.fn(),
  recordAction: vi.fn(),
  runShell: vi.fn(),
  postIncidentThread: vi.fn(),
}));
vi.mock('../business-db.js', () => ({ query }));
vi.mock('./slack.js', () => slack);
vi.mock('./remediation.js', () => rem);
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  emojiVerdict,
  isOperator,
  replyVerdict,
  runApprovals,
} from './approval.js';

const BOT = 'U0AJ7UDBD6D';
const OP = 'U_ALEX';

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  slack.getReactions.mockReset().mockResolvedValue([]);
  slack.getReplies.mockReset().mockResolvedValue([]);
  rem.isActionable.mockReset().mockReturnValue(true);
  rem.recordAction.mockReset();
  rem.runShell.mockReset().mockResolvedValue({ ok: true, out: 'ok' });
  rem.postIncidentThread
    .mockReset()
    .mockResolvedValue({ channel: 'C1', ts: '1.3' });
  process.env.HEALER_ACTIONS_ENABLED = '1';
  process.env.HEALER_ACTION_EPOCH = 'test-epoch';
  process.env.HEALER_OPERATOR_UIDS = OP;
  delete process.env.HEALER_OPERATOR_UID;
  delete process.env.HEALER_QUIET;
  delete process.env.HEALER_APPROVAL_TTL_MS;
});

describe('named operator verdicts', () => {
  it('has no broad non-bot fallback', () => {
    expect(isOperator(OP)).toBe(true);
    expect(isOperator(BOT)).toBe(false);
    expect(isOperator('U_OTHER')).toBe(false);
  });

  it('returns the exact approving or rejecting actor', () => {
    expect(emojiVerdict([{ name: 'white_check_mark', users: [OP] }])).toEqual({
      decision: 'approve',
      user: OP,
    });
    expect(emojiVerdict([{ name: 'x', users: [OP] }])).toEqual({
      decision: 'reject',
      user: OP,
    });
    expect(replyVerdict([{ user: OP, text: 'apply please' }])).toEqual({
      decision: 'approve',
      user: OP,
    });
    expect(replyVerdict([{ user: OP, text: 'dismiss this' }])).toEqual({
      decision: 'reject',
      user: OP,
    });
  });

  it('ignores bot and unnamed-user signals', () => {
    expect(
      emojiVerdict([{ name: 'thumbsup', users: [BOT, 'U_OTHER'] }]),
    ).toBeNull();
    expect(replyVerdict([{ user: 'U_OTHER', text: 'apply' }])).toBeNull();
  });

  it('makes a named rejection win over a conflicting approval reaction', () => {
    expect(
      emojiVerdict([
        { name: 'white_check_mark', users: [OP] },
        { name: 'x', users: [OP] },
      ]),
    ).toEqual({ decision: 'reject', user: OP });
  });
});

describe('runApprovals', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: 5,
    source: 'sweeper:trafft',
    severity: 'error',
    occurrences: 2,
    status: 'awaiting_approval',
    raw_context: {},
    remediation_class: 'config',
    diagnosis: 'expired token',
    confidence: 'high',
    cause_or_symptom: 'root_cause',
    evidence: ['e'],
    review: { refuted: false, reason: 'evidence confirmed' },
    thread_ts: '0.9',
    thread_channel: 'C1',
    last_seen: new Date().toISOString(),
    proposal_channel: 'C1',
    proposal_ts: '1.1',
    proposed_fix: {
      kind: 'command',
      summary: 's',
      command: 'echo go',
      action_epoch: 'test-epoch',
      approval_nonce: 'nonce-5',
      approval_created_at: new Date().toISOString(),
    },
    ...over,
  });

  function armPending(
    row = pending(),
    options: { claim?: boolean; reject?: boolean } = {},
  ): void {
    query.mockImplementation((sql: string) => {
      if (sql.trimStart().startsWith('SELECT id, source')) {
        return { rows: [row] };
      }
      if (sql.includes("interval '5 minutes'")) return { rows: [] };
      if (sql.includes("SET status = 'triaging'")) {
        return { rows: options.claim === false ? [] : [{ id: 5 }] };
      }
      if (sql.includes("SET status = 'wont_fix'")) {
        return { rows: options.reject === false ? [] : [{ id: 5 }] };
      }
      return { rows: [] };
    });
  }

  it('claims once, executes, records the operator, and hands off to verify', async () => {
    armPending();
    rem.runShell.mockResolvedValue({
      ok: true,
      out: 'token=supersecretvalue',
    });
    slack.getReactions.mockResolvedValue([
      { name: 'white_check_mark', users: [OP] },
    ]);

    expect(await runApprovals()).toBe(1);
    expect(rem.runShell).toHaveBeenCalledWith('echo go');
    expect(rem.recordAction).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        kind: 'approved_apply',
        approved_by: OP,
        approval_nonce: 'nonce-5',
        out: 'token=<redacted>',
      }),
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'remediating'"),
      ),
    ).toBe(true);
  });

  it('does not execute a replay when the atomic nonce claim loses', async () => {
    armPending(pending(), { claim: false });
    slack.getReactions.mockResolvedValue([
      { name: 'white_check_mark', users: [OP] },
    ]);
    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('defaults off and makes quiet a complete action kill switch', async () => {
    armPending();
    delete process.env.HEALER_ACTIONS_ENABLED;
    expect(await runApprovals()).toBe(0);
    expect(query).not.toHaveBeenCalled();

    process.env.HEALER_ACTIONS_ENABLED = '1';
    process.env.HEALER_QUIET = '1';
    expect(await runApprovals()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed when no named operator is configured', async () => {
    armPending();
    delete process.env.HEALER_OPERATOR_UIDS;
    expect(await runApprovals()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('ignores an approval from an unnamed non-bot user', async () => {
    armPending();
    slack.getReactions.mockResolvedValue([
      { name: 'white_check_mark', users: ['U_OTHER'] },
    ]);
    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('disarms a stale epoch without executing', async () => {
    armPending(
      pending({
        proposed_fix: {
          kind: 'command',
          summary: 's',
          command: 'echo go',
          action_epoch: 'old-epoch',
          approval_nonce: 'nonce-5',
          approval_created_at: new Date().toISOString(),
        },
      }),
    );
    slack.getReplies.mockResolvedValue([{ user: OP, text: 'apply' }]);

    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'needs_human'"),
      ),
    ).toBe(true);
  });

  it('disarms an expired approval without executing', async () => {
    armPending(
      pending({
        proposed_fix: {
          kind: 'command',
          summary: 's',
          command: 'echo go',
          action_epoch: 'test-epoch',
          approval_nonce: 'nonce-5',
          approval_created_at: '2020-01-01T00:00:00Z',
        },
      }),
    );
    slack.getReplies.mockResolvedValue([{ user: OP, text: 'apply' }]);
    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('re-checks current trust, class, and fix kind at the shell boundary', async () => {
    armPending();
    rem.isActionable.mockReturnValue(false);
    slack.getReplies.mockResolvedValue([{ user: OP, text: 'apply' }]);
    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('atomically closes a named-operator rejection', async () => {
    armPending();
    slack.getReactions.mockResolvedValue([{ name: 'x', users: [OP] }]);
    expect(await runApprovals()).toBe(1);
    expect(rem.runShell).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'wont_fix'"),
      ),
    ).toBe(true);
  });

  it('does nothing without a verdict', async () => {
    armPending();
    expect(await runApprovals()).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });
});
