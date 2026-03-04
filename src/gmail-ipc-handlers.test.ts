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
  GMAIL_SIGNATURE: 'The Tandem Coaching Team',
  GMAIL_SEND_AS: 'hello@tandemcoach.co',
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
}));

vi.mock('./gmail-api.js', () => ({
  sendEmail: vi.fn().mockResolvedValue('sent-msg-123'),
  replyToThread: vi.fn().mockResolvedValue('reply-msg-456'),
  searchEmails: vi.fn().mockResolvedValue('No results found.'),
  readEmail: vi.fn().mockResolvedValue('Email content here'),
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
import { handleGmailSend, GmailIpcPayload } from './gmail-ipc-handlers.js';

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
