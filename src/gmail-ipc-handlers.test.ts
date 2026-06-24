import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable config value — tests can change this per-test
let testRecipient = '';

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

// Default: party lookup returns null (no match). Individual tests override as needed.
vi.mock('./business-db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: null }] }),
}));

vi.mock('./gmail-api.js', () => ({
  sendEmail: vi
    .fn()
    .mockResolvedValue({ messageId: 'sent-msg-123', threadId: 'thread-abc' }),
  replyToThread: vi.fn().mockResolvedValue({
    messageId: 'reply-msg-456',
    threadId: 'thread-abc',
    to: 'sender@external.com',
    subject: 'Re: ACC inquiry',
  }),
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

import { sendEmail, findThreadForReply } from './gmail-api.js';
import { storeMessageDirect } from './db.js';
import { logOutboundEmailInteraction } from './email-interaction-log.js';
import { query } from './business-db.js';
import {
  handleGmailReply,
  handleGmailSend,
  handleGmailSearch,
  handleGmailRead,
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
    to: 'prospect@example.com',
    subject: 'Coaching Inquiry Follow-up',
    body: '<p>Hello, thanks for reaching out!</p>',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  testRecipient = '';
});

describe('handleGmailSend', () => {
  describe('test routing', () => {
    it('sends to original recipient when GMAIL_TEST_RECIPIENT is empty', async () => {
      const data = makePayload();
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'prospect@example.com' }),
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

      const data = makePayload({ to: 'real-prospect@example.com' });
      await handleGmailSend(data);

      expect(storeMessageDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('To: real-prospect@example.com'),
        }),
      );
    });

    it('clears cc when GMAIL_TEST_RECIPIENT is set', async () => {
      testRecipient = 'test@tandemcoach.co';

      const data = makePayload({ cc: 'real-cc@example.com' });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ cc: undefined }),
      );
    });

    it('preserves cc when GMAIL_TEST_RECIPIENT is not set', async () => {
      const data = makePayload({ cc: 'colleague@example.com' });
      await handleGmailSend(data);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ cc: 'colleague@example.com' }),
      );
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
        to: 'prospect@example.com',
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
        to: 'real-prospect@example.com',
        subject: 'Re: Their Inquiry',
      });
      delete data.threadId;
      await handleGmailSend(data);

      expect(findThreadForReply).toHaveBeenCalledWith({
        to: 'real-prospect@example.com',
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
      to: 'prospect@example.com',
      subject: 'ACC Program Details',
      body: '<p>Thanks for reaching out.</p>',
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
      to: 'prospect@example.com',
      subject: 'Re: ACC Program Details',
      body: '<p>Checking back in.</p>',
      leadId: 42,
      emailType: 'follow-up',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 42, emailType: 'follow-up' }),
    );
  });

  it('logs replies through handleGmailReply', async () => {
    await handleGmailReply({
      type: 'gmail_reply',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      threadId: 'thread-abc',
      body: '<p>Great question.</p>',
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

  it('skips logging when leadId is absent and party lookup returns null', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ id: null }] } as any);

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'vendor@example.com',
      subject: 'Invoice',
      body: '<p>Attached.</p>',
    });

    expect(logOutboundEmailInteraction).not.toHaveBeenCalled();
  });

  it('logs when leadId is absent but party lookup resolves by email', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ id: 99 }] } as any);

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-04-16T09:00:00Z',
      to: 'found@example.com',
      subject: 'Hello',
      body: '<p>Hi.</p>',
    });

    expect(logOutboundEmailInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 99 }),
    );
  });

  it('logs reply when leadId is absent but thread history resolves a party', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ party_id: 77 }] } as any);

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

  it('skips reply logging when leadId is absent and thread lookup returns null', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ party_id: null }] } as any);

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
      makePayload({ to: 'lead@example.com', subject: 'Your ACC inquiry' }),
      postToChief,
    );
    expect(postToChief).toHaveBeenCalledTimes(1);
    expect(postToChief.mock.calls[0][0]).toBe(
      '[EMAIL SENT] to=lead@example.com subject=Your ACC inquiry',
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
    });
    const call = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    expect(call).toBeDefined();
    const payload = JSON.parse(call![1] as string);
    expect(payload.type).toBe('message');
    expect(payload.text).toContain('gmail_search results');
  });

  it('handleGmailRead delivers the email as a type:message follow-up', async () => {
    await handleGmailRead({
      type: 'gmail_read',
      groupFolder: 'chief',
      timestamp: '2026-05-18T12:00:00Z',
      messageId: 'msg-789',
    });
    const call = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
    expect(call).toBeDefined();
    const payload = JSON.parse(call![1] as string);
    expect(payload.type).toBe('message');
    expect(payload.text).toContain('msg-789');
  });
});
