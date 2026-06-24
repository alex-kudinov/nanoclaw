import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const slack = vi.hoisted(() => ({
  postIncidents: vi.fn(),
  getReactions: vi.fn(),
  getReplies: vi.fn(),
}));
const rem = vi.hoisted(() => ({
  recordAction: vi.fn(),
  runShell: vi.fn(),
  setStatus: vi.fn(),
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
  replyVerdict,
  isOperator,
  runApprovals,
} from './approval.js';

const BOT = 'U0AJ7UDBD6D';
const OP = 'U_ALEX';

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  slack.postIncidents.mockReset().mockResolvedValue(true);
  slack.getReactions.mockReset().mockResolvedValue([]);
  slack.getReplies.mockReset().mockResolvedValue([]);
  rem.recordAction.mockReset();
  rem.runShell.mockReset().mockResolvedValue({ ok: true, out: 'ok' });
  rem.setStatus.mockReset();
  rem.postIncidentThread
    .mockReset()
    .mockResolvedValue({ channel: 'C1', ts: '1.3' });
  delete process.env.HEALER_OPERATOR_UID;
});

describe('isOperator', () => {
  it('treats any non-bot user as operator by default', () => {
    expect(isOperator(OP)).toBe(true);
    expect(isOperator(BOT)).toBe(false);
  });
  it('pins to HEALER_OPERATOR_UID when set', () => {
    process.env.HEALER_OPERATOR_UID = OP;
    expect(isOperator(OP)).toBe(true);
    expect(isOperator('U_OTHER')).toBe(false);
  });
});

describe('emojiVerdict (✅ and 👍 substitutable)', () => {
  it('approves on ✅ by the operator', () => {
    expect(emojiVerdict([{ name: 'white_check_mark', users: [OP] }])).toBe(
      'approve',
    );
  });
  it('approves on 👍 by the operator', () => {
    expect(emojiVerdict([{ name: 'thumbsup', users: [OP] }])).toBe('approve');
  });
  it('rejects on ❌', () => {
    expect(emojiVerdict([{ name: 'x', users: [OP] }])).toBe('reject');
  });
  it('ignores a reaction only the bot left', () => {
    expect(
      emojiVerdict([{ name: 'white_check_mark', users: [BOT] }]),
    ).toBeNull();
  });
});

describe('replyVerdict', () => {
  it('approves on "apply"', () => {
    expect(replyVerdict([{ user: OP, text: 'apply please' }])).toBe('approve');
  });
  it('rejects on "dismiss"', () => {
    expect(replyVerdict([{ user: OP, text: 'dismiss this' }])).toBe('reject');
  });
  it('ignores bot replies', () => {
    expect(replyVerdict([{ user: BOT, text: 'apply' }])).toBeNull();
  });
});

describe('runApprovals', () => {
  const pending = {
    id: 5,
    source: 'sweeper:trafft',
    proposal_channel: 'C1',
    proposal_ts: '1.1',
    proposed_fix: { kind: 'command', summary: 's', command: 'echo go' },
  };
  const armPending = () =>
    query.mockImplementation((sql: string) =>
      sql.includes('awaiting_approval') ? { rows: [pending] } : { rows: [] },
    );

  it('applies the proposed command on approval and hands off to verify', async () => {
    armPending();
    slack.getReactions.mockResolvedValue([
      { name: 'white_check_mark', users: [OP] },
    ]);
    expect(await runApprovals()).toBe(1);
    expect(rem.runShell).toHaveBeenCalledWith('echo go');
    expect(rem.setStatus).toHaveBeenCalledWith(5, 'remediating');
  });

  it('closes as wont_fix on rejection', async () => {
    armPending();
    slack.getReactions.mockResolvedValue([{ name: 'x', users: [OP] }]);
    await runApprovals();
    expect(rem.setStatus).toHaveBeenCalledWith(5, 'wont_fix', 'escalated');
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('does nothing without a verdict', async () => {
    armPending();
    expect(await runApprovals()).toBe(0);
    expect(rem.setStatus).not.toHaveBeenCalled();
  });
});
