import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const state = vi.hoisted(() => {
  process.env.MAILMAN_HOLD_SECONDS = '0';
  const fsModule = require('fs') as typeof import('fs');
  const osModule = require('os') as typeof import('os');
  const pathModule = require('path') as typeof import('path');
  return {
    root: fsModule.mkdtempSync(
      pathModule.join(osModule.tmpdir(), 'nanoclaw-email-path-'),
    ),
    sendEmail: vi.fn().mockResolvedValue({
      messageId: 'gmail-message-1',
      threadId: 'gmail-thread-1',
    }),
  };
});

vi.mock('./config.js', () => ({
  ASSISTANT_NAME: 'Gru',
  DATA_DIR: state.root,
  STORE_DIR: path.join(state.root, 'store'),
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'America/Chicago',
  GMAIL_MONITORED_EMAIL: 'info@tandemcoach.co',
  GMAIL_TEST_RECIPIENT: '',
  GMAIL_REPLY_TO: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'Tandem Coaching <info@tandemcoach.co>',
}));

vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('./business-db.js', () => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('best_party_by_email')) {
      // PostgreSQL bigint is returned as text by node-postgres.
      return { rows: [{ id: '11119' }] };
    }
    if (sql.includes('business_v2.party_emails')) {
      return { rows: [{ email: 'lead@example.com' }] };
    }
    return { rows: [] };
  }),
}));

vi.mock('./gmail-api.js', () => ({
  sendEmail: (...args: unknown[]) => state.sendEmail(...args),
  replyToThread: vi.fn(),
  searchEmails: vi.fn(),
  readEmail: vi.fn(),
  readThread: vi.fn(),
  applyLabel: vi.fn(),
}));

vi.mock('./email-interaction-log.js', () => ({
  logOutboundEmailInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./email-recipient-guard.js', () => ({
  normalizeRecipient: (value: string) => value.trim().toLowerCase(),
  checkRecipient: () => ({ ok: true }),
}));

vi.mock('./email-content-guard.js', () => ({
  checkContent: () => ({ ok: true, violations: [] }),
}));

vi.mock('./learn-ipc-handler.js', () => ({
  handleLearnLesson: vi.fn(),
  handleRouteLesson: vi.fn(),
  isLearnIpcType: () => false,
  isRouteLessonType: () => false,
}));

vi.mock('./classify-ipc-handlers.js', () => ({
  dispatchClassifyIpc: vi.fn(),
  isClassifyIpcType: () => false,
}));

vi.mock('./procurement-ipc-handlers.js', () => ({
  dispatchProcurementIpc: vi.fn(),
  isProcurementIpcType: () => false,
}));

vi.mock('./classify-backfill.js', () => ({
  handleClassificationLesson: vi.fn(),
  isClassificationLesson: () => false,
}));

import {
  getMessagesSince,
  getNewMessages,
  initDatabase,
  recordPendingSend,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import { handleGmailSend } from './gmail-ipc-handlers.js';

const mailmanJid = 'gmail:info@tandemcoach.co';

describe('approved Sales email delivery path', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    initDatabase();
    recordPendingSend({
      draftTs: 'draft-962',
      groupFolder: 'sales',
      chatJid: 'slack:SALES',
      recipient: 'lead@example.com',
      leadRef: 'Lead #962',
      approvedAt: '2026-07-31T00:00:00.000Z',
    });
  });

  afterAll(() => {
    vi.useRealTimers();
    fs.rmSync(state.root, { recursive: true, force: true });
  });

  it('routes a visible wake row and accepts a bigint-text party resolution', async () => {
    const handoff =
      '[HANDOFF: sales→mailman]\n' +
      'To: lead@example.com\n' +
      'Subject: Executive Coaching\n' +
      'Entry ID: 962\n' +
      'Party ID: 11119\n' +
      'Original-Message:\nNeed coaching\n---END-ORIGINAL---\n' +
      'Body:\nHi there.';
    storeChatMetadata(
      mailmanJid,
      '2026-07-31T00:00:00.000Z',
      'Mailman',
      'gmail',
      true,
    );
    storeMessageDirect({
      id: 'ipc-handoff-962',
      chat_jid: mailmanJid,
      sender: 'sales',
      sender_name: 'sales',
      content: handoff,
      timestamp: '2026-07-31T00:00:01.000Z',
      is_from_me: false,
      is_bot_message: false,
      from_group: 'sales',
    });

    const allStored = getMessagesSince(mailmanJid, '', 'Gru');
    expect(allStored).toHaveLength(1);
    const wake = getNewMessages([mailmanJid], '', 'Gru');
    expect(wake.messages).toHaveLength(1);
    expect(wake.messages[0]).toMatchObject({
      chat_jid: mailmanJid,
      from_group: 'sales',
      content: handoff,
    });

    await handleGmailSend({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-07-31T00:00:02.000Z',
      to: 'lead@example.com',
      subject: 'Executive Coaching',
      body: 'Hi there.',
      leadId: 11119,
    });

    expect(state.sendEmail).toHaveBeenCalledTimes(1);
  });
});
