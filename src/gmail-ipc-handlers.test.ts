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
  replyToThread: vi
    .fn()
    .mockResolvedValue({ messageId: 'reply-msg-456', threadId: 'thread-abc' }),
  searchEmails: vi.fn().mockResolvedValue('No results found.'),
  readEmail: vi.fn().mockResolvedValue('Email content here'),
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

import { sendEmail } from './gmail-api.js';
import { storeMessageDirect } from './db.js';
import { logOutboundEmailInteraction } from './email-interaction-log.js';
import { query } from './business-db.js';
import {
  handleGmailReply,
  handleGmailSend,
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

    it('passes html:undefined when not set', async () => {
      const data = makePayload();
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
