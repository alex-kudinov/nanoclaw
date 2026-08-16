import { beforeEach, describe, expect, it } from 'vitest';

import {
  _initTestDatabase,
  claimEmailActionExecution,
  confirmEmailAction,
  findEmailActionOutcomeReceipt,
  listEmailSendActionsForProjection,
  recordPendingSend,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import { hashApprovedEmailContent } from './email-action.js';

const CHAT = 'slack:C_SALES';
const THREAD = '1755300000.000100';
const ACTION_ID = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
const HASH = hashApprovedEmailContent('Private subject', 'Private body');

beforeEach(() => {
  _initTestDatabase();
  storeChatMetadata(CHAT, NOW_FOR_CHAT, 'Sales', 'slack', true);
});

const NOW_FOR_CHAT = '2026-08-14T12:00:00.000Z';

function recordAction(
  actionId = ACTION_ID,
  approvedAt = '2026-08-14T12:00:00.000Z',
  groupFolder = 'sales',
): void {
  recordPendingSend({
    actionId,
    draftTs: `${actionId}:draft`,
    groupFolder,
    chatJid: CHAT,
    threadTs: THREAD,
    recipient: 'private.customer@example.com',
    leadRef: 'Lead #472',
    approvedSubject: 'Private subject',
    approvedContentSha256: HASH,
    approvedAt,
  });
}

describe('Company OS SQLite projection boundary', () => {
  it('returns a bounded, ordered, Sales-only metadata shape without content fields', () => {
    recordAction(ACTION_ID, '2026-08-14T12:00:00.000Z');
    recordAction(
      '3edb6798-905e-4f9e-b30a-a95d4d44ba5c',
      '2026-08-13T12:00:00.000Z',
    );
    recordAction(
      '84db528a-4405-41eb-a0c6-a39dcb1fb15a',
      '2026-08-14T12:01:00.000Z',
      'mailman',
    );

    const rows = listEmailSendActionsForProjection(
      '2026-08-14T00:00:00.000Z',
      999,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actionId: ACTION_ID,
      groupFolder: 'sales',
      leadRef: 'Lead #472',
      approvedContentSha256: HASH,
    });
    expect(rows[0]).not.toHaveProperty('recipient');
    expect(rows[0]).not.toHaveProperty('approvedSubject');
    expect(rows[0]).not.toHaveProperty('approvedCc');
  });

  it('accepts exactly one mechanical close in the original work thread', () => {
    recordAction();
    expect(
      claimEmailActionExecution(
        ACTION_ID,
        HASH,
        'private.customer@example.com',
        '2026-08-14T12:00:01.000Z',
      ).status,
    ).toBe('claimed');
    expect(
      confirmEmailAction(
        ACTION_ID,
        'private.customer@example.com',
        'gmail-message-1',
        'gmail-thread-1',
        '2026-08-14T12:00:02.000Z',
      ),
    ).toBe(1);

    const exact = `✅ [EMAIL SENT] Action ${ACTION_ID} was accepted by Gmail. Receipt gmail-message-1.`;
    storeMessageDirect({
      id: 'wrong-thread',
      chat_jid: CHAT,
      sender: 'B_APP',
      sender_name: 'Gru',
      content: exact,
      timestamp: '2026-08-14T12:00:03.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: 'another-thread',
    });
    expect(findEmailActionOutcomeReceipt(ACTION_ID)).toEqual({
      ambiguous: false,
    });

    storeMessageDirect({
      id: 'exact-close',
      chat_jid: CHAT,
      sender: 'B_APP',
      sender_name: 'Gru',
      content: exact,
      timestamp: '2026-08-14T12:00:04.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: THREAD,
    });
    expect(findEmailActionOutcomeReceipt(ACTION_ID)).toEqual({
      receipt: {
        messageId: 'exact-close',
        occurredAt: '2026-08-14T12:00:04.000Z',
      },
      ambiguous: false,
    });

    storeMessageDirect({
      id: 'duplicate-close',
      chat_jid: CHAT,
      sender: 'B_APP',
      sender_name: 'Gru',
      content: exact,
      timestamp: '2026-08-14T12:00:05.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: THREAD,
    });
    expect(findEmailActionOutcomeReceipt(ACTION_ID)).toEqual({
      receipt: undefined,
      ambiguous: true,
    });
  });
});
