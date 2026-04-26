/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@slack/web-api', () => {
  class WebClient {
    chat: any;
    constructor(_token: string) {
      this.chat = { postMessage: vi.fn().mockResolvedValue({ ok: true }) };
    }
  }
  return { WebClient };
});

vi.mock('./db.js', () => ({
  setRouterState: vi.fn(),
}));

vi.mock('./env.js', () => {
  const envStub: Record<string, string> = {};
  return {
    readEnvFile: (keys: string[]) => {
      const out: Record<string, string> = {};
      for (const k of keys) if (envStub[k]) out[k] = envStub[k];
      return out;
    },
    __setEnv: (k: string, v: string) => {
      envStub[k] = v;
    },
    __clearEnv: () => {
      for (const k of Object.keys(envStub)) delete envStub[k];
    },
  };
});

vi.mock('./gmail-api.js', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as envMod from './env.js';
import { setRouterState } from './db.js';
import { sendEmail } from './gmail-api.js';
import { sendDigest } from './digest-delivery.js';

const setEnv = (envMod as any).__setEnv as (k: string, v: string) => void;
const clearEnv = (envMod as any).__clearEnv as () => void;

const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const mockSetRouterState = setRouterState as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  clearEnv();
  mockSendEmail.mockReset();
  mockSetRouterState.mockReset();
  setEnv('DIGEST_EMAIL_CHERIE', 'cherie@tandem.co');
  setEnv('DIGEST_EMAIL_ALEX', 'alex@tandem.co');
  setEnv('DIGEST_SLACK_UID_CHERIE', 'U_CHERIE');
  setEnv('DIGEST_SLACK_UID_ALEX', 'U_ALEX');
  setEnv('SLACK_BOT_TOKEN', 'xoxb-test');
});

afterEach(() => {
  clearEnv();
});

describe('sendDigest', () => {
  it('returns early without sending when itemCount is 0', async () => {
    await sendDigest('alex', '<div/>', 0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSetRouterState).not.toHaveBeenCalled();
  });

  it('sends email + slack DM on the happy path and records last_sent', async () => {
    mockSendEmail.mockResolvedValue({ messageId: 'm1', threadId: 't1' });
    await sendDigest('cherie', '<div>digest</div>', 3);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'cherie@tandem.co',
        html: true,
        body: '<div>digest</div>',
      }),
    );
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'digest_last_sent_cherie',
      expect.any(String),
    );
  });

  it('builds subject with date and item count', async () => {
    mockSendEmail.mockResolvedValue({ messageId: 'm1', threadId: 't1' });
    await sendDigest('alex', '<div/>', 7);
    const subject = mockSendEmail.mock.calls[0][0].subject;
    expect(subject).toContain('Important Email Digest');
    expect(subject).toContain('7 items');
  });

  it('retries email once on transient failure', async () => {
    mockSendEmail
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ messageId: 'm1', threadId: 't1' });
    await sendDigest('alex', '<div/>', 1);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'digest_last_sent_alex',
      expect.any(String),
    );
  });

  it('throws and dead-letters when both gmail and slack fail', async () => {
    // Gmail fails on every attempt
    mockSendEmail.mockRejectedValue(new Error('smtp down'));
    // Slack fails because we configure a uid but drop the bot token
    clearEnv();
    setEnv('DIGEST_EMAIL_CHERIE', 'cherie@tandem.co');
    setEnv('DIGEST_SLACK_UID_CHERIE', 'U_CHERIE');
    // SLACK_BOT_TOKEN missing → sendSlackDm returns false
    await expect(sendDigest('cherie', '<div/>', 1)).rejects.toThrow(
      /all channels failed/,
    );
    expect(mockSetRouterState).toHaveBeenCalledWith(
      expect.stringMatching(/^digest_failed_cherie_/),
      expect.stringContaining('html_preview'),
    );
  });

  it('throws when DIGEST_EMAIL_* is not set', async () => {
    clearEnv();
    await expect(sendDigest('alex', '<div/>', 1)).rejects.toThrow(
      /DIGEST_EMAIL_ALEX/,
    );
  });

  it('skips slack DM cleanly when no slack uid configured', async () => {
    clearEnv();
    setEnv('DIGEST_EMAIL_ALEX', 'alex@tandem.co');
    mockSendEmail.mockResolvedValue({ messageId: 'm1', threadId: 't1' });
    await sendDigest('alex', '<div/>', 1);
    expect(mockSetRouterState).toHaveBeenCalledWith(
      'digest_last_sent_alex',
      expect.any(String),
    );
  });
});
