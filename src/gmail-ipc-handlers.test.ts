import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable config value — tests can change this per-test
let testRecipient = '';
let visibleReplyAllCandidates: string[] = [];
const businessState = vi.hoisted(() => ({
  partyByEmailId: 42 as number | null,
  partyByThreadId: 42 as number | null,
  emails: new Set<string>(),
}));

vi.mock('./config.js', () => ({
  ASSISTANT_NAME: 'Gru',
  DATA_DIR: '/tmp/nanoclaw-test',
  GMAIL_MONITORED_EMAIL: 'info@tandemcoach.co',
  get GMAIL_TEST_RECIPIENT() {
    return testRecipient;
  },
  GMAIL_REPLY_TO: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'Tandem Coaching <info@tandemcoach.co>',
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./db.js', () => ({
  storeMessageDirect: vi.fn(),
  insertTrackingPixel: vi.fn(),
}));

vi.mock('./email-interaction-log.js', () => ({
  logOutboundEmailInteraction: vi.fn().mockResolvedValue(undefined),
}));

// party_id / best_party_by_email are `bigint`, and node-postgres returns bigint
// as a STRING to avoid precision loss. The mock MUST reproduce that: returning a
// JS number here is what let `claimedPartyId !== resolvedPartyId` pass 1,661
// tests while blocking every real send with "claimed party 11119 does not match
// host-resolved party 11119" (Lead #962, 2026-07-30).
const asBigintText = (v: number | null): string | null =>
  v === null ? null : String(v);

vi.mock('./business-db.js', () => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('best_party_by_email')) {
      return { rows: [{ id: asBigintText(businessState.partyByEmailId) }] };
    }
    if (sql.includes("metadata->>'thread_id'")) {
      return {
        rows: [{ party_id: asBigintText(businessState.partyByThreadId) }],
      };
    }
    if (sql.includes('business_v2.party_emails')) {
      return {
        rows: [...businessState.emails].map((email) => ({ email })),
      };
    }
    return { rows: [] };
  }),
}));

vi.mock('./gmail-api.js', () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ messageId: 'sent-msg-123', threadId: 'thread-abc' }),
  replyToThread: vi.fn(
    async (opts: {
      cc?: string;
      prepareSend?: (recipients: {
        to: string;
        cc?: string;
        visibleReplyAllCandidates: readonly string[];
      }) => Promise<{ body: string }>;
    }) => {
      await opts.prepareSend?.({
        to: 'sender@external.com',
        cc: opts.cc,
        visibleReplyAllCandidates,
      });
      return {
        messageId: 'reply-msg-456',
        threadId: 'thread-abc',
        to: testRecipient || 'sender@external.com',
        originalTo: 'sender@external.com',
        subject: 'Re: ACC inquiry',
      };
    },
  ),
  searchEmails: vi.fn().mockResolvedValue('No results found.'),
  readEmail: vi.fn().mockResolvedValue('Email content here'),
  findThreadForReply: vi.fn().mockResolvedValue(null),
}));

vi.mock('./markdown-to-email-html.js', () => ({
  convertMarkdownToEmailHtml: vi.fn((md: string) => {
    // Minimal real-ish conversion for tests: wrap **bold** in <strong>
    return md ? md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') : '';
  }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
  };
});

import fs from 'fs';

import { sendEmail, findThreadForReply, replyToThread } from './gmail-api.js';
import { storeMessageDirect } from './db.js';
import { logOutboundEmailInteraction } from './email-interaction-log.js';
import {
  handleGmailReply,
  handleGmailSend,
  handleGmailSearch,
  handleGmailRead,
  dispatchGmailIpc,
  GmailIpcPayload,
} from './gmail-ipc-handlers.js';
import { convertMarkdownToEmailHtml } from './markdown-to-email-html.js';

function makePayload(
  overrides: Partial<GmailIpcPayload> = {},
): GmailIpcPayload {
  return {
    type: 'gmail_send',
    groupFolder: 'mailman',
    timestamp: '2026-03-03T12:00:00Z',
    to: 'prospect@external.com',
    subject: 'Coaching Inquiry Follow-up',
    body: '<p>Hello, here are the coaching program details you requested.</p>',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  testRecipient = '';
  visibleReplyAllCandidates = [];
  businessState.partyByEmailId = 42;
  businessState.partyByThreadId = 42;
  businessState.emails = new Set([
    'prospect@external.com',
    'real-prospect@external.com',
    'real-cc@external.com',
    'colleague@external.com',
    'lead@external.com',
    'found@external.com',
    'vendor@external.com',
    'sender@external.com',
    'eqcoach.tina@gmail.com',
  ]);
});

describe('handleGmailSend', () => {
  describe('test routing', () => {
    it('sends to original recipient when GMAIL_TEST_RECIPIENT is empty', async () => {
      const data = makePayload();
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'prospect@external.com' }),
      );
    });

    it('overrides recipient when GMAIL_TEST_RECIPIENT is set', async () => {
      testRecipient = 'test@tandemcoach.co';

      const data = makePayload();
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@tandemcoach.co' }),
      );
    });

    it('stores original recipient in DB, not the test override', async () => {
      testRecipient = 'test@tandemcoach.co';

      const data = makePayload({ to: 'real-prospect@external.com' });
      await handleGmailSend(data);

      expect(storeMessageDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('To: real-prospect@external.com'),
        }),
      );
    });

    it('clears cc when GMAIL_TEST_RECIPIENT is set', async () => {
      testRecipient = 'test@tandemcoach.co';

      const data = makePayload({ cc: 'real-cc@external.com' });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ cc: undefined }),
      );
    });

    it('preserves cc when GMAIL_TEST_RECIPIENT is not set', async () => {
      const data = makePayload({ cc: 'colleague@external.com' });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ cc: 'colleague@external.com' }),
      );
    });

    it('does not confirm a real-customer send when the email is test-routed', async () => {
      testRecipient = 'test@tandemcoach.co';
      const onSendConfirmed = vi.fn();

      await handleGmailSend(makePayload(), undefined, onSendConfirmed);

      expect(onSendConfirmed).not.toHaveBeenCalled();
    });

    it('confirms the intended recipient after a real Gmail send', async () => {
      const onSendConfirmed = vi.fn();

      await handleGmailSend(makePayload(), undefined, onSendConfirmed);

      expect(onSendConfirmed).toHaveBeenCalledWith({
        actionId: undefined,
        recipient: 'prospect@external.com',
        messageId: 'sent-msg-123',
        threadId: 'thread-abc',
      });
    });
  });

  describe('HTML support', () => {
    it('passes html:true through to sendEmail', async () => {
      const data = makePayload({ html: true });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: true }),
      );
    });

    it('defaults to markdown→HTML conversion when neither html nor markdown is set', async () => {
      // Plain prose body should still be converted (folds soft wraps so the
      // email doesn't render as a column of stuttered lines in Gmail).
      const data = makePayload();
      delete data.html;
      delete data.markdown;
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: true }),
      );
    });

    it('skips conversion when caller explicitly opts out (markdown:false)', async () => {
      const data = makePayload({ markdown: false });
      delete data.html;
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ html: undefined }),
      );
    });
  });

  describe('markdown conversion', () => {
    it('converts markdown body to HTML when markdown:true and html is not set', async () => {
      const data = makePayload({
        body: 'Hello **world**',
        markdown: true,
      });
      delete data.html;
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('<strong>world</strong>'),
          html: true,
        }),
      );
    });

    it('skips conversion when both markdown:true and html:true are set', async () => {
      const rawBody = 'Hello **world**';
      const data = makePayload({ body: rawBody, markdown: true, html: true });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ body: rawBody, html: true }),
      );
    });

    it('leaves body and html unchanged when converter returns empty string', async () => {
      vi.mocked(convertMarkdownToEmailHtml).mockReturnValueOnce('');
      const rawBody = 'some markdown';
      const data = makePayload({ body: rawBody, markdown: true });
      delete data.html;
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ body: rawBody, html: undefined }),
      );
    });
  });

  describe('validation', () => {
    it('rejects payload missing to field', async () => {
      const data = makePayload({ to: undefined });
      await handleGmailSend(data);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('rejects payload missing subject field', async () => {
      const data = makePayload({ subject: undefined });
      await handleGmailSend(data);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('rejects payload missing body field', async () => {
      const data = makePayload({ body: undefined });
      await handleGmailSend(data);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends an exact host-authorized discount and blocks a mismatched value', async () => {
      const allowed = makePayload({ body: 'Use the 5% company discount.' });
      await handleGmailSend(allowed, undefined, undefined, undefined, {
        authorizedDiscountTerms: ['percent:5'],
      });
      expect(sendEmail).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      const blocked = makePayload({ body: 'Use the 15% company discount.' });
      await handleGmailSend(blocked, undefined, undefined, undefined, {
        authorizedDiscountTerms: ['percent:5'],
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  // Regression: Carol Del Priore refund (2026-06-09). A dropped Thread-ID on a
  // Re: subject made gmail_send start a detached thread. The host re-resolves
  // the recipient's thread so the reply re-attaches.
  describe('thread-loss safety net', () => {
    it('re-resolves and threads a Re: send that arrived without a threadId', async () => {
      vi.mocked(findThreadForReply).mockResolvedValueOnce(
        'recovered-thread-xyz',
      );
      const data = makePayload({
        subject: 'Re: Mentor Coach Evaluation Training',
      });
      delete data.threadId;
      await handleGmailSend(data);

      expect(findThreadForReply).toHaveBeenCalledWith({
        to: 'prospect@external.com',
        subject: 'Re: Mentor Coach Evaluation Training',
      });
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'recovered-thread-xyz' }),
      );
    });

    it('falls back to a standalone send when no matching thread is found', async () => {
      vi.mocked(findThreadForReply).mockResolvedValueOnce(null);
      const data = makePayload({ subject: 'Re: Some Old Thread' });
      delete data.threadId;
      await handleGmailSend(data);

      expect(findThreadForReply).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: undefined }),
      );
    });

    it('does not re-resolve a first-contact subject (no Re: prefix)', async () => {
      const data = makePayload({
        subject: 'ACC Certification Path - Tandem Coaching',
      });
      delete data.threadId;
      await handleGmailSend(data);

      expect(findThreadForReply).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: undefined }),
      );
    });

    it('never overrides an explicit threadId already in the payload', async () => {
      const data = makePayload({
        subject: 'Re: Mentor Coach Evaluation Training',
        threadId: 'explicit-thread-123',
      });
      await handleGmailSend(data);

      expect(findThreadForReply).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'explicit-thread-123' }),
      );
    });

    it('uses the original recipient (not the test override) for thread lookup', async () => {
      testRecipient = 'test@tandemcoach.co';
      vi.mocked(findThreadForReply).mockResolvedValueOnce(
        'recovered-thread-xyz',
      );
      const data = makePayload({
        to: 'real-prospect@external.com',
        subject: 'Re: Their Inquiry',
      });
      delete data.threadId;
      await handleGmailSend(data);

      expect(findThreadForReply).toHaveBeenCalledWith({
        to: 'real-prospect@external.com',
        subject: 'Re: Their Inquiry',
      });
    });
  });
});

describe('outbound email interaction logging', () => {
  it('logs initial sends with the party id from leadId', async () => {
    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'prospect@external.com',
      subject: 'ACC Program Details',
      body: '<p>Here are the ACC program details you requested.</p>',
      leadId: 42,
      emailType: 'initial',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith({
      partyId: 42,
      emailType: 'initial',
      subject: 'ACC Program Details',
      threadId: 'thread-abc',
      messageId: 'sent-msg-123',
    });
  });

  it('logs follow-up sends with emailType follow-up', async () => {
    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'prospect@external.com',
      subject: 'Re: ACC Program Details',
      body: '<p>Checking back in.</p>',
      leadId: 42,
      pipelineEntryId: 1003,
      emailType: 'follow-up',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        partyId: 42,
        pipelineEntryId: 1003,
        emailType: 'follow-up',
      }),
    );
  });

  it('logs replies through handleGmailReply', async () => {
    await handleGmailReply({
      type: 'gmail_reply',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      threadId: 'thread-abc',
      body: '<p>The answer depends on your current credential path.</p>',
      leadId: 42,
      emailType: 'reply',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        partyId: 42,
        emailType: 'reply',
        threadId: 'thread-abc',
        messageId: 'reply-msg-456',
      }),
    );
  });

  it('blocks the send when leadId is absent and host party lookup returns null', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = null;

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'vendor@external.com',
      subject: 'Invoice',
      body: '<p>Attached.</p>',
    });

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends when a numeric leadId matches the bigint-as-string resolved party', async () => {
    businessState.partyByEmailId = 11119;
    businessState.emails = new Set(['lead@external.com']);

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-07-30T22:41:00Z',
      to: 'lead@external.com',
      subject: 'Executive Coaching',
      body: '<p>Hi.</p>',
      leadId: 11119,
    });

    expect(sendEmail).toHaveBeenCalled();
    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 11119 }),
    );
  });

  it('uses the host-resolved Party when Mailman puts a pipeline Entry ID in leadId', async () => {
    businessState.partyByEmailId = 11152;
    businessState.emails = new Set(['lead@external.com']);

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-08-03T19:39:12Z',
      to: 'lead@external.com',
      subject: 'Re: Your Mentor Coaching Foundations questions, answered live',
      body: '<p>Hi.</p>',
      leadId: 985,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 11152 }),
    );
  });

  it('replies when Entry 985 is passed as leadId but the host resolves Party 11152', async () => {
    businessState.partyByEmailId = 11152;
    businessState.partyByThreadId = 11152;
    businessState.emails = new Set(['sender@external.com']);

    await handleGmailReply({
      type: 'gmail_reply',
      groupFolder: 'mailman',
      timestamp: '2026-08-03T19:39:12Z',
      threadId: '19fc907d76aa161a',
      body: '<p>Approved reply.</p>',
      leadId: 985,
      emailType: 'reply',
    });

    expect(replyToThread).toHaveBeenCalledTimes(1);
    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        partyId: 11152,
        threadId: 'thread-abc',
        messageId: 'reply-msg-456',
      }),
    );
  });

  it('logs when leadId is absent but party lookup resolves by email', async () => {
    businessState.partyByEmailId = 99;

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'found@external.com',
      subject: 'Hello',
      body: '<p>Hi.</p>',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 99 }),
    );
  });

  it('logs reply when leadId is absent but thread history resolves a party', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = 77;

    await handleGmailReply({
      type: 'gmail_reply',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      threadId: 'thread-xyz',
      body: '<p>Following up.</p>',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 77 }),
    );
  });

  it('blocks a reply when no party can be resolved from recipient or thread', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = null;

    await handleGmailReply({
      type: 'gmail_reply',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      threadId: 'thread-no-history',
      body: '<p>No lead.</p>',
    });

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
  });
});

describe('mechanical [EMAIL SENT] to chief (T06)', () => {
  it('handleGmailSend posts exactly one [EMAIL SENT] line via postToChief', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});
    await handleGmailSend(
      makePayload({ to: 'lead@external.com', subject: 'Your ACC inquiry' }),
      postToChief,
    );
    expect(postToChief).toHaveBeenCalledTimes(1);
    expect(postToChief.mock.calls[0][0]).toBe(
      '[EMAIL SENT] to=lead@external.com subject=Your ACC inquiry',
    );
  });

  it('handleGmailReply lists the resolved recipient + subject (not placeholders)', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});
    // No to/subject on the reply payload — they must come from replyToThread's
    // resolved result, NOT the old useless "to=(thread reply) subject=(re: thread)".
    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thr-9',
        body: '<p>reply</p>',
      }),
      postToChief,
    );
    expect(postToChief).toHaveBeenCalledTimes(1);
    expect(postToChief.mock.calls[0][0]).toBe(
      '[EMAIL SENT] to=sender@external.com subject=Re: ACC inquiry',
    );
  });

  it('returns the sent message + thread ids when postToChief is omitted', async () => {
    await expect(handleGmailSend(makePayload())).resolves.toMatchObject({
      messageId: expect.any(String),
      threadId: expect.any(String),
    });
  });
});

describe('recipient guard (tina@example.com incident)', () => {
  it('blocks a reserved/placeholder recipient: no send, alerts chief, returns undefined', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});
    const onSendFailed = vi.fn();
    const result = await handleGmailSend(
      makePayload({
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        to: 'tina@example.com',
        subject: 'X',
      }),
      postToChief,
      undefined,
      onSendFailed,
    );
    expect(result).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(postToChief).toHaveBeenCalledTimes(1);
    expect(postToChief.mock.calls[0][0]).toMatch(
      /EMAIL BLOCKED.*tina@example\.com/,
    );
    expect(onSendFailed).toHaveBeenCalledWith({
      actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
      code: 'recipient_guard',
    });
  });

  it('blocks a deliverable address that is not among the party’s known emails', async () => {
    businessState.partyByEmailId = null;
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});
    const result = await handleGmailSend(
      makePayload({ to: 'tina@gmial.com', leadId: 10099 }),
      postToChief,
    );
    expect(result).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(/EMAIL BLOCKED.*not among/);
  });

  it('allows the party-verified recipient through', async () => {
    businessState.partyByEmailId = 10099;
    const result = await handleGmailSend(
      makePayload({ to: 'eqcoach.tina@gmail.com', leadId: 10099 }),
    );
    expect(sendEmail).toHaveBeenCalled();
    expect(result).toMatchObject({ messageId: expect.any(String) });
  });

  it('does not let omission of leadId bypass host party verification', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = null;
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailSend(
      makePayload({ to: 'prospect@external.com', leadId: undefined }),
      postToChief,
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(/no host-resolved party/);
  });

  it('blocks an unverified CC on replies before Gmail sends', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
        cc: 'attacker@evil.co',
      }),
      postToChief,
    );

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(/EMAIL BLOCKED.*CC rejected/);
  });

  it('allows an exact approved CC that Gmail shows on the latest external message', async () => {
    businessState.emails = new Set(['sender@external.com']);
    visibleReplyAllCandidates = ['richard-colleague@external.com'];

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        approvedRecipient: 'sender@external.com',
        cc: 'richard-colleague@external.com',
        approvedCc: 'richard-colleague@external.com',
      }),
    );

    expect(replyToThread).toHaveBeenCalledTimes(1);
    expect(logOutboundEmailInteraction).toHaveBeenCalled();
  });

  it('blocks an approved CC that is neither party-related nor visible on the latest message', async () => {
    businessState.emails = new Set(['sender@external.com']);
    visibleReplyAllCandidates = ['actual-colleague@external.com'];
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        approvedRecipient: 'sender@external.com',
        cc: 'invented-colleague@external.com',
        approvedCc: 'invented-colleague@external.com',
      }),
      postToChief,
    );

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(/EMAIL BLOCKED.*CC rejected/);
  });

  it('allows a configured internal CC only when the exact action-bound card approved it', async () => {
    await handleGmailSend(
      makePayload({
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        cc: 'info@tandemcoach.co',
        approvedCc: 'info@tandemcoach.co',
      }),
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        cc: 'info@tandemcoach.co',
        body: expect.not.stringContaining('https://t.tandemcoach.co/t/'),
      }),
    );
  });

  it('blocks a configured internal CC that was not stamped from the approved card', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailSend(
      makePayload({
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        cc: 'info@tandemcoach.co',
      }),
      postToChief,
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(/EMAIL BLOCKED.*CC rejected/);
  });

  it('blocks CC drift even when both addresses are configured internal mailboxes', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailSend(
      makePayload({
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        cc: 'info@tandemcoach.co',
        approvedCc: 'different@tandemcoach.co',
      }),
      postToChief,
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(
      /execution recipients differ from the approved card/,
    );
  });

  it('blocks when the Gmail-derived reply recipient differs from the approved recipient', async () => {
    const postToChief = vi.fn(async (_text: string, _tt?: string) => {});

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
        approvedRecipient: 'different@example.com',
      }),
      postToChief,
    );

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
    expect(postToChief.mock.calls[0][0]).toMatch(
      /EMAIL BLOCKED.*does not match approved recipient/,
    );
  });

  it('allows an exact approved Gmail-thread participant alias for that reply only', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = 11274;
    businessState.emails = new Set(['tolney@velera.com']);
    const actionId = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: '19ff239122ff27cc',
        actionId,
        approvedRecipient: 'sender@external.com',
      }),
    );

    expect(replyToThread).toHaveBeenCalledTimes(1);
    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 11274 }),
    );

    vi.clearAllMocks();
    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: '19ff239122ff27cc',
        actionId: undefined,
        approvedRecipient: undefined,
      }),
    );
    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
  });

  it('does not extend the Gmail-thread alias exception to a standalone send', async () => {
    businessState.partyByEmailId = null;
    businessState.partyByThreadId = 11274;
    businessState.emails = new Set(['tolney@velera.com']);

    await handleGmailSend(
      makePayload({
        to: 'sender@external.com',
        threadId: '19ff239122ff27cc',
        actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
        approvedRecipient: 'sender@external.com',
      }),
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
  });

  it('test-routes replies and removes the original CC', async () => {
    testRecipient = 'test@tandemcoach.co';

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
        cc: 'colleague@external.com',
      }),
    );

    expect(replyToThread).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientOverride: 'test@tandemcoach.co',
        cc: 'colleague@external.com',
      }),
    );
    const prepare = vi.mocked(replyToThread).mock.calls[0][0].prepareSend;
    await expect(
      prepare?.({
        to: 'sender@external.com',
        cc: 'colleague@external.com',
        visibleReplyAllCandidates: [],
      }),
    ).resolves.toEqual(expect.objectContaining({ body: expect.any(String) }));
  });

  it('does not confirm a real-customer reply when the reply is test-routed', async () => {
    testRecipient = 'test@tandemcoach.co';
    const onSendConfirmed = vi.fn();

    await handleGmailReply(
      makePayload({
        type: 'gmail_reply',
        threadId: 'thread-abc',
      }),
      undefined,
      onSendConfirmed,
    );

    expect(onSendConfirmed).not.toHaveBeenCalled();
  });
});

describe('gmail_search / gmail_read result delivery', () => {
  // Regression guard: the agent-runner's drainIpcInput() only surfaces input
  // files with type:'message'. A result written under any other type is read,
  // discarded, and deleted — so the agent never sees it.
  it('handleGmailSearch delivers results as a type:message follow-up', async () => {
    await handleGmailSearch({
      type: 'gmail_search',
      groupFolder: 'chief',
      timestamp: '2026-05-18T12:00:00Z',
      query: 'from:susan',
      source_container: 'nanoclaw-chief-search-1',
    });
    const call = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    expect(call).toBeDefined();
    const payload = JSON.parse(call![1] as string);
    expect(payload.type).toBe('message');
    expect(payload.target_container).toBe('nanoclaw-chief-search-1');
    expect(payload.text).toContain('gmail_search results');
  });

  it('handleGmailRead delivers the email as a type:message follow-up', async () => {
    await handleGmailRead({
      type: 'gmail_read',
      groupFolder: 'chief',
      timestamp: '2026-05-18T12:00:00Z',
      messageId: 'msg-789',
      source_container: 'nanoclaw-chief-read-1',
    });
    const call = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    expect(call).toBeDefined();
    const payload = JSON.parse(call![1] as string);
    expect(payload.type).toBe('message');
    expect(payload.target_container).toBe('nanoclaw-chief-read-1');
    expect(payload.text).toContain('msg-789');
  });

  it('does not write a result for a sibling when the originating container has exited', async () => {
    const before = vi.mocked(fs.writeFileSync).mock.calls.length;
    const deliver = vi.fn(() => false);
    const delivered = await handleGmailSearch(
      {
        type: 'gmail_search',
        groupFolder: 'mailman',
        timestamp: '2026-08-03T14:00:00Z',
        query: 'from:justin@example.com',
        source_container: 'nanoclaw-mailman-justin',
      },
      deliver,
    );

    expect(delivered).toBe(false);
    expect(deliver).toHaveBeenCalledWith(
      'mailman',
      'nanoclaw-mailman-justin',
      expect.stringContaining('[gmail_search results'),
    );
    expect(vi.mocked(fs.writeFileSync).mock.calls).toHaveLength(before);
  });

  it('keeps concurrent same-group results bound to their originating containers', async () => {
    const deliver = vi.fn(() => true);
    await Promise.all([
      handleGmailSearch(
        {
          type: 'gmail_search',
          groupFolder: 'mailman',
          timestamp: '2026-08-03T14:00:00Z',
          query: 'from:justin@example.com',
          source_container: 'nanoclaw-mailman-justin',
        },
        deliver,
      ),
      handleGmailRead(
        {
          type: 'gmail_read',
          groupFolder: 'mailman',
          timestamp: '2026-08-03T14:00:01Z',
          messageId: 'judith-message',
          source_container: 'nanoclaw-mailman-judith',
        },
        deliver,
      ),
    ]);

    expect(deliver).toHaveBeenCalledWith(
      'mailman',
      'nanoclaw-mailman-justin',
      expect.stringContaining('justin@example.com'),
    );
    expect(deliver).toHaveBeenCalledWith(
      'mailman',
      'nanoclaw-mailman-judith',
      expect.stringContaining('judith-message'),
    );
  });

  it('reports missing parameters as invalid requests, not exited containers', async () => {
    const postToChief = vi.fn(async () => {});
    await dispatchGmailIpc(
      makePayload({
        type: 'gmail_search',
        groupFolder: 'mailman',
        query: undefined,
      }),
      postToChief,
    );
    expect(postToChief).toHaveBeenCalledWith(
      expect.stringContaining('[GMAIL REQUEST INVALID]'),
    );
    expect(postToChief).not.toHaveBeenCalledWith(
      expect.stringContaining('[GMAIL RESULT HELD]'),
    );
  });
});
