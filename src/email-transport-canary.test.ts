import { describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  GMAIL_MONITORED_EMAIL: 'info@example.com',
  GMAIL_REPLY_TO: 'info@example.com',
  GMAIL_SEND_AS: 'NanoClaw <info@example.com>',
}));
vi.mock('./gmail-auth.js', () => ({ getGmailClient: vi.fn() }));

import {
  buildTransportCanaryRaw,
  runEmailTransportCanary,
} from './email-transport-canary.js';

describe('email transport canary', () => {
  const commit = 'a'.repeat(40);

  it('builds a fixed internal message with no BCC or customer input', () => {
    const encoded = buildTransportCanaryRaw({
      to: 'internal@example.com',
      from: 'NanoClaw <info@example.com>',
      replyTo: 'info@example.com',
      commit,
      nonce: 'canary-nonce',
      sentAt: '2026-08-02T00:00:00.000Z',
    });
    const raw = Buffer.from(encoded, 'base64url').toString('utf8');

    expect(raw).toContain('To: internal@example.com');
    expect(raw).toContain(`Release: ${commit}`);
    expect(raw).toContain('No customer action');
    expect(raw).not.toContain('Bcc:');
  });

  it('returns only after the exact Gmail receipt is retrievable', async () => {
    const gmail = {
      users: {
        messages: {
          send: vi.fn(async () => ({
            data: { id: 'gmail-message', threadId: 'gmail-thread' },
          })),
          get: vi.fn(async () => ({
            data: { id: 'gmail-message', threadId: 'gmail-thread' },
          })),
        },
      },
    };

    await expect(
      runEmailTransportCanary({
        gmail,
        recipient: 'internal@example.com',
        from: 'NanoClaw <info@example.com>',
        replyTo: 'info@example.com',
        commit,
        nonce: 'canary-nonce',
        sentAt: '2026-08-02T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      messageId: 'gmail-message',
      threadId: 'gmail-thread',
      recipientSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(gmail.users.messages.get).toHaveBeenCalledWith({
      userId: 'me',
      id: 'gmail-message',
      format: 'minimal',
    });
  });

  it('refuses before Gmail when the external-write brake is active', async () => {
    const gmail = {
      users: {
        messages: {
          send: vi.fn(),
          get: vi.fn(),
        },
      },
    };
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    try {
      await expect(
        runEmailTransportCanary({
          gmail,
          recipient: 'internal@example.com',
          from: 'NanoClaw <info@example.com>',
          replyTo: 'info@example.com',
          commit,
          nonce: 'canary-nonce',
          sentAt: '2026-08-02T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: 'global_safe_mode' });
      expect(gmail.users.messages.send).not.toHaveBeenCalled();
    } finally {
      delete process.env.EXTERNAL_WRITE_SAFE_MODE;
    }
  });

  it('fails when Gmail does not return a durable exact receipt', async () => {
    const gmail = {
      users: {
        messages: {
          send: vi.fn(async () => ({
            data: { id: 'gmail-message', threadId: 'gmail-thread' },
          })),
          get: vi.fn(async () => ({
            data: { id: 'other-message', threadId: 'gmail-thread' },
          })),
        },
      },
    };

    await expect(
      runEmailTransportCanary({
        gmail,
        recipient: 'internal@example.com',
        from: 'NanoClaw <info@example.com>',
        replyTo: 'info@example.com',
        commit,
        nonce: 'canary-nonce',
        sentAt: '2026-08-02T00:00:00.000Z',
      }),
    ).rejects.toThrow('do not rerun blindly');
  });
});
