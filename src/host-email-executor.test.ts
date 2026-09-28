import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExternalWriteDeniedError } from './action-safety.js';
import type { EmailSendActionRow } from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import type { GmailIpcPayload } from './gmail-ipc-handlers.js';
import {
  armedActionText,
  executeApprovedEmailAction,
  gmailRejectedStatus,
  runHostEmailSendSweep,
  type HostEmailSweepDeps,
} from './host-email-executor.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const ACTION_ID = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
const SUBJECT = 'Re: ICF Level 2 program';
const BODY = 'Hi Dana,\n\nYour seat is confirmed.';
const CARD = [
  '[SALES REVIEW] Lead #1003',
  'Email: lead@example.co',
  '',
  'DRAFT RESPONSE TO LEAD:',
  '---',
  `Subject: ${SUBJECT}`,
  '',
  BODY,
  '---',
].join('\n');

function action(over: Partial<EmailSendActionRow> = {}): EmailSendActionRow {
  return {
    actionId: ACTION_ID,
    draftTs: 'card-ts',
    groupFolder: 'sales',
    chatJid: 'slack:SALES',
    threadTs: 'thread-ts',
    gmailThreadId: 'gmail-thread',
    recipient: 'lead@example.co',
    approvedSubject: SUBJECT,
    approvedContentSha256: hashApprovedEmailContent(SUBJECT, BODY),
    approvedAt: '2026-09-28T10:00:00.000Z',
    state: 'approved',
    ...over,
  };
}

type SendImpl = (
  payload: GmailIpcPayload,
  ok: (r: { messageId: string; threadId: string }) => Promise<void>,
  fail: (f: { code: string }) => Promise<void>,
) => Promise<void>;

function makeDeps(row: EmailSendActionRow, send?: SendImpl) {
  const state = { row: { ...row } };
  const posts: string[] = [];
  const payloads: GmailIpcPayload[] = [];
  const defaultSend: SendImpl = async (_payload, ok) =>
    ok({ messageId: 'gmail-msg-1', threadId: 'gmail-thread' });
  const deps: HostEmailSweepDeps = {
    getAction: vi.fn(() => state.row),
    getCardText: vi.fn(() => CARD),
    assertGmailWritable: vi.fn(),
    testRoutingActive: vi.fn(() => false),
    claim: vi.fn(() => {
      state.row = { ...state.row, state: 'executing' };
      return { status: 'claimed' as const, action: state.row };
    }),
    confirm: vi.fn((_id, _to, messageId) => {
      state.row = {
        ...state.row,
        state: 'confirmed',
        gmailMessageId: messageId,
      };
      return 1;
    }),
    fail: vi.fn((_id, s, code) => {
      state.row = { ...state.row, state: s, lastErrorCode: code };
      return 1;
    }),
    hold: vi.fn((_id, code) => {
      state.row = {
        ...state.row,
        state: 'attention_required',
        lastErrorCode: code,
      };
      return 1;
    }),
    send: vi.fn(async (payload, ok, fail) => {
      payloads.push(payload);
      await (send ?? defaultSend)(payload, ok, fail as never);
    }),
    postThread: vi.fn(async (_a, text) => {
      posts.push(text);
    }),
    now: () => new Date('2026-09-28T10:01:00.000Z'),
    listExecutable: vi.fn(() => [state.row]),
    isApprovalCard: vi.fn(() => true),
  };
  return { deps, state, posts, payloads };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('executeApprovedEmailAction', () => {
  it('sends the exact approved card and posts the Gmail receipt', async () => {
    const { deps, state, posts, payloads } = makeDeps(action());
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('sent');
    expect(payloads[0]).toEqual(
      expect.objectContaining({
        to: 'lead@example.co',
        subject: SUBJECT,
        body: BODY,
        actionId: ACTION_ID,
        threadId: 'gmail-thread',
      }),
    );
    expect(state.row.state).toBe('confirmed');
    expect(posts).toEqual([
      `✅ [EMAIL SENT] Action ${ACTION_ID} was accepted by Gmail. Receipt gmail-msg-1.`,
    ]);
  });

  it.each([
    ['confirmed', 'already_sent'],
    ['executing', 'in_progress'],
    ['uncertain', 'uncertain'],
    ['blocked', 'blocked'],
    ['attention_required', 'held'],
  ] as const)('does not call Gmail for a %s action', async (s, outcome) => {
    const { deps, posts } = makeDeps(action({ state: s }));
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe(outcome);
    expect(deps.send).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });

  it('blocks a card whose bytes no longer match the approval hash', async () => {
    const { deps, state, posts } = makeDeps(
      action({ approvedContentSha256: 'not-the-approved-hash' }),
    );
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('blocked');
    expect(deps.send).not.toHaveBeenCalled();
    expect(state.row.state).toBe('blocked');
    expect(posts[0]).toContain('🚫 [EMAIL BLOCKED]');
    expect(posts[0]).toContain('force send: <reason>');
  });

  it('blocks when the approved card text is gone', async () => {
    const { deps, state } = makeDeps(action());
    vi.mocked(deps.getCardText).mockReturnValue(undefined);
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('blocked');
    expect(state.row.lastErrorCode).toBe('approved_card_missing');
  });

  it('holds (keeps the approval) while the external-write safety control is on', async () => {
    const { deps, state, posts } = makeDeps(action());
    vi.mocked(deps.assertGmailWritable).mockImplementation(() => {
      throw new ExternalWriteDeniedError('global_safe_mode', 'gmail');
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('held');
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(state.row).toEqual(
      expect.objectContaining({
        state: 'attention_required',
        lastErrorCode: 'action_safety_global_safe_mode',
      }),
    );
    expect(posts[0]).toContain('⏸️ [EMAIL HELD]');
    expect(posts[0]).toContain('approval is kept');
  });

  it('holds while global test routing is active', async () => {
    const { deps, state } = makeDeps(action());
    vi.mocked(deps.testRoutingActive).mockReturnValue(true);
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('held');
    expect(state.row.lastErrorCode).toBe('global_test_routing_active');
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('does not send when another worker already holds the claim', async () => {
    const { deps } = makeDeps(action());
    vi.mocked(deps.claim).mockReturnValue({
      status: 'held',
      reason: 'already executing',
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe(
      'in_progress',
    );
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('records a host recipient/CC refusal as blocked with its code', async () => {
    const { deps, state, posts } = makeDeps(action(), async (_p, _ok, fail) =>
      fail({ code: 'recipient_guard' }),
    );
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('blocked');
    expect(state.row.lastErrorCode).toBe('recipient_guard');
    expect(posts[0]).toContain('recipient guard check');
  });

  it('marks an unexplained Gmail error uncertain, never blocked', async () => {
    const { deps, state, posts } = makeDeps(action(), async () => {
      throw new Error('socket hang up');
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('uncertain');
    expect(state.row.lastErrorCode).toBe('gmail_dispatch_error');
    expect(posts[0]).toContain('[EMAIL DELIVERY UNCERTAIN]');
    expect(posts[0]).toContain('checks Gmail Sent first');
  });

  it('blocks a request Gmail refused outright', async () => {
    const { deps, state } = makeDeps(action(), async () => {
      throw Object.assign(new Error('Forbidden'), { code: 403 });
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('blocked');
    expect(state.row.lastErrorCode).toBe('gmail_rejected_403');
  });

  it('retries once without the thread id when Gmail rejects the stored thread', async () => {
    let calls = 0;
    const { deps, payloads } = makeDeps(action(), async (_p, ok) => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error('Invalid thread_id value'), {
          code: 400,
        });
      }
      await ok({ messageId: 'gmail-msg-2', threadId: 'new-thread' });
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('sent');
    expect(payloads[0].threadId).toBe('gmail-thread');
    expect(payloads[1].threadId).toBeUndefined();
    expect(payloads[1].subject).toBe(SUBJECT);
  });

  it('never reports a failure after Gmail already confirmed the send', async () => {
    const { deps, posts } = makeDeps(action(), async (_p, ok) => {
      await ok({ messageId: 'gmail-msg-3', threadId: 'gmail-thread' });
      throw new Error('interaction log failed');
    });
    expect(await executeApprovedEmailAction(ACTION_ID, deps)).toBe('sent');
    expect(posts.at(-1)).toContain('FOLLOW-UP FAILED');
    expect(posts.at(-1)).toContain('Do NOT resend');
  });
});

describe('runHostEmailSendSweep', () => {
  it('sends approved cards past the cancel window and skips non-cards', async () => {
    vi.stubEnv('MAILMAN_HOLD_SECONDS', '30');
    const { deps } = makeDeps(action());
    const now = new Date('2026-09-28T10:01:00.000Z');
    expect(await runHostEmailSendSweep(now, deps)).toBe(1);
    expect(deps.listExecutable).toHaveBeenCalledWith(
      '2026-09-28T10:00:30.000Z',
      '2026-09-28T09:46:00.000Z',
    );

    const other = makeDeps(action());
    vi.mocked(other.deps.isApprovalCard).mockReturnValue(false);
    expect(await runHostEmailSendSweep(now, other.deps)).toBe(0);
    expect(other.deps.send).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('treats only definitive 4xx answers as Gmail refusals', () => {
    expect(gmailRejectedStatus({ code: 400 })).toBe(400);
    expect(gmailRejectedStatus({ response: { status: 404 } })).toBe(404);
    expect(gmailRejectedStatus({ code: 429 })).toBeUndefined();
    expect(gmailRejectedStatus({ code: 408 })).toBeUndefined();
    expect(gmailRejectedStatus({ code: 503 })).toBeUndefined();
    expect(gmailRejectedStatus(new Error('ECONNRESET'))).toBeUndefined();
  });

  it('names the Action-ID and the cancel window in the armed notice', () => {
    vi.stubEnv('MAILMAN_HOLD_SECONDS', '45');
    const text = armedActionText(ACTION_ID);
    expect(text).toContain(`Action-ID: ${ACTION_ID}`);
    expect(text).toContain('in 45 seconds');
    expect(text).toContain('`stop` or `cancel`');
  });
});
