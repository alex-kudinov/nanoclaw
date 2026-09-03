import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMailmanRunContext,
  inferMailmanTurnKind,
  mailmanClassificationBindingIssue,
  mailmanUnboundSendDisposition,
  registerMailmanRunContext,
  resetMailmanRunContextsForTest,
} from './mailman-run-context.js';
import type { NewMessage } from './types.js';

function message(
  content: string,
  overrides: Partial<NewMessage> = {},
): NewMessage {
  return {
    id: 'msg-1',
    chat_jid: 'gmail:info@example.com',
    sender: 'person@example.com',
    sender_name: 'Person',
    content,
    timestamp: '2026-09-03T00:00:00.000Z',
    is_from_me: false,
    is_bot_message: false,
    thread_ts: 'gmail-thread-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetMailmanRunContextsForTest();
});

describe('Mailman run context', () => {
  it('distinguishes raw inbound classification from approved delivery', () => {
    expect(
      inferMailmanTurnKind('gmail:info@example.com', [message('From: Person')]),
    ).toBe('inbound_classification');
    expect(
      inferMailmanTurnKind('gmail:info@example.com', [
        message('[HANDOFF: sales→mailman]', {
          is_bot_message: true,
          from_group: 'sales',
        }),
      ]),
    ).toBe('approved_delivery');
  });

  it('binds one run to its exact source message set and expires it', () => {
    registerMailmanRunContext({
      runId: 'run-1',
      chatJid: 'gmail:info@example.com',
      threadTs: 'gmail-thread-1',
      messages: [message('From: Person')],
      now: 1_000,
    });
    expect(getMailmanRunContext('run-1', 2_000)?.messageIds).toEqual(['msg-1']);
    expect(getMailmanRunContext('run-1', 3_700_000)).toBeUndefined();
  });

  it('keeps expected inbound send denials out of Chief while preserving real alerts', () => {
    registerMailmanRunContext({
      runId: 'inbound-run',
      chatJid: 'gmail:info@example.com',
      threadTs: 'gmail-thread-1',
      messages: [message('From: Person')],
    });
    expect(mailmanUnboundSendDisposition('inbound-run')).toMatchObject({
      expectedInboundDenial: true,
      alertChief: false,
    });
    expect(
      mailmanUnboundSendDisposition('inbound-run').nextInstruction,
    ).toContain('call classify_email exactly once');
    expect(mailmanUnboundSendDisposition(undefined)).toMatchObject({
      expectedInboundDenial: false,
      alertChief: true,
    });
  });

  it('fails classification binding closed on missing, expired, wrong-message, and wrong-thread proof', () => {
    registerMailmanRunContext({
      runId: 'classification-run',
      chatJid: 'gmail:info@example.com',
      threadTs: 'gmail-thread-1',
      messages: [message('From: Person')],
    });
    expect(
      mailmanClassificationBindingIssue({
        runId: 'classification-run',
        gmailMessageId: 'msg-1',
        sourceContext: {
          chatJid: 'gmail:info@example.com',
          threadTs: 'gmail-thread-1',
        },
      }),
    ).toBeNull();
    expect(
      mailmanClassificationBindingIssue({
        runId: undefined,
        gmailMessageId: 'msg-1',
      }),
    ).toMatch(/missing or expired/);
    expect(
      mailmanClassificationBindingIssue({
        runId: 'classification-run',
        gmailMessageId: 'other-message',
      }),
    ).toMatch(/outside the bound/);
    expect(
      mailmanClassificationBindingIssue({
        runId: 'classification-run',
        gmailMessageId: 'msg-1',
        sourceContext: {
          chatJid: 'gmail:info@example.com',
          threadTs: 'wrong-thread',
        },
      }),
    ).toMatch(/does not match/);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60 * 1000 + 1);
    expect(
      mailmanClassificationBindingIssue({
        runId: 'classification-run',
        gmailMessageId: 'msg-1',
      }),
    ).toMatch(/missing or expired/);
  });
});
