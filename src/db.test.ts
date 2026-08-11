import { describe, it, expect, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  _initLegacyPendingSendsTestDatabase,
  insertTrackingPixel,
  recordEmailOpen,
  createTask,
  deleteTask,
  getAllChats,
  getAllRegisteredGroups,
  getDueJobs,
  getJob,
  getJobRunLogs,
  getMessagesSince,
  getThreadContext,
  getHumanMessagesInThread,
  getNewMessages,
  storeMessageDirect,
  getRunningJobNames,
  getTaskById,
  insertJobRunLog,
  markStaleRunsAsFailed,
  recordThreadAnchor,
  recordPendingSend,
  claimEmailActionExecution,
  confirmEmailAction,
  findPendingSendAction,
  getPendingSendByActionId,
  getLatestBotMessageInThread,
  listEmailSendEvents,
  listOverdueSends,
  markPendingSendAlerted,
  markEmailActionHandoff,
  markEmailActionMailmanStarted,
  clearPendingSendsByRecipient,
  getPendingSendByGmailThread,
  resolveThreadAnchor,
  rollThreadAnchor,
  touchThreadAnchor,
  setJobEnabled,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessage,
  updateJobNextRun,
  updateJobRunLog,
  updateJobRunState,
  updateTask,
  upsertJobDefinition,
} from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import { resolveHumanAuthorizedDiscountTerms } from './human-commercial-term-authorization.js';

beforeEach(() => {
  _initTestDatabase();
});

describe('human commercial-term authorization', () => {
  it('uses only human statements from the exact thread and honors revocation', () => {
    const chatJid = 'slack:SALES';
    const threadTs = 'thread-tom';
    storeChatMetadata(
      chatJid,
      '2026-08-11T19:00:00.000Z',
      'Sales',
      'slack',
      true,
    );
    const put = (
      id: string,
      content: string,
      timestamp: string,
      isBot: boolean,
      thread = threadTs,
    ) =>
      storeMessageDirect({
        id,
        chat_jid: chatJid,
        sender: isBot ? 'B_APP' : 'U_ALEX',
        sender_name: isBot ? 'Gru' : 'Alex Kudinov',
        content,
        timestamp,
        is_from_me: isBot,
        is_bot_message: isBot,
        thread_ts: thread,
      });

    put(
      'bot-root',
      'Customer mentioned a 15% discount',
      '2026-08-11T19:00:00.000Z',
      true,
    );
    put(
      'human-other',
      'Use the 20% discount',
      '2026-08-11T19:01:00.000Z',
      false,
      'thread-other',
    );
    put(
      'human-allow',
      "pick Kayla's or 5% company discount",
      '2026-08-11T19:02:00.000Z',
      false,
    );

    expect(
      getHumanMessagesInThread(chatJid, threadTs).map((m) => m.id),
    ).toEqual(['human-allow']);
    expect(resolveHumanAuthorizedDiscountTerms(chatJid, threadTs)).toEqual([
      'percent:5',
    ]);

    put(
      'human-revoke',
      'Do not use the 5% discount.',
      '2026-08-11T19:03:00.000Z',
      false,
    );
    expect(resolveHumanAuthorizedDiscountTerms(chatJid, threadTs)).toEqual([]);
  });
});

describe('pending send approvals', () => {
  const actionId = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
  const approvedHash = hashApprovedEmailContent('Subject', 'Approved body');

  it('migrates the exact pre-NC-009 pending_sends schema before indexing action columns', () => {
    _initLegacyPendingSendsTestDatabase();

    recordPendingSend({
      actionId,
      draftTs: 'post-migration-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });

    expect(getPendingSendByActionId(actionId)).toMatchObject({
      actionId,
      state: 'approved',
      approvedContentSha256: approvedHash,
    });
    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
    ]);
  });

  it('persists one exact action and an append-only Gmail receipt lifecycle', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      threadTs: 'approval-thread',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });

    expect(
      markEmailActionHandoff(
        actionId,
        'handoff-message',
        '2026-08-02T01:00:01.000Z',
      ),
    ).toBe(1);
    expect(
      markEmailActionMailmanStarted(actionId, '2026-08-02T01:00:02.000Z'),
    ).toBe(1);
    expect(
      claimEmailActionExecution(
        actionId,
        approvedHash,
        'lead@example.com',
        '2026-08-02T01:00:03.000Z',
      ).status,
    ).toBe('claimed');
    expect(
      confirmEmailAction(
        actionId,
        'lead@example.com',
        'gmail-message',
        'gmail-thread',
        '2026-08-02T01:00:04.000Z',
      ),
    ).toBe(1);

    expect(getPendingSendByActionId(actionId)).toMatchObject({
      state: 'confirmed',
      gmailMessageId: 'gmail-message',
      gmailResultThreadId: 'gmail-thread',
    });
    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
      'handoff_routed',
      'mailman_started',
      'executing',
      'confirmed',
    ]);
  });

  it('replays a confirmed action as its receipt without another execution claim', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    expect(
      claimEmailActionExecution(
        actionId,
        approvedHash,
        'lead@example.com',
        '2026-08-02T01:00:01.000Z',
      ).status,
    ).toBe('claimed');
    confirmEmailAction(
      actionId,
      'lead@example.com',
      'gmail-message',
      'gmail-thread',
      '2026-08-02T01:00:02.000Z',
    );

    const replay = claimEmailActionExecution(
      actionId,
      approvedHash,
      'lead@example.com',
      '2026-08-02T01:00:03.000Z',
    );
    expect(replay).toMatchObject({
      status: 'confirmed',
      action: { gmailMessageId: 'gmail-message' },
    });
    expect(
      findPendingSendAction({
        recipient: 'lead@example.com',
        approvedContentSha256: approvedHash,
        includeConfirmed: true,
      }),
    ).toMatchObject({
      ambiguous: false,
      action: { actionId, state: 'confirmed' },
    });
    expect(listEmailSendEvents(actionId)).toHaveLength(3);
  });

  it('holds an executing action after restart instead of risking a duplicate', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    claimEmailActionExecution(
      actionId,
      approvedHash,
      'lead@example.com',
      '2026-08-02T01:00:01.000Z',
    );

    expect(
      claimEmailActionExecution(
        actionId,
        approvedHash,
        'lead@example.com',
        '2026-08-02T01:05:00.000Z',
      ),
    ).toMatchObject({
      status: 'held',
      reason: expect.stringContaining('uncertain prior Gmail attempt'),
    });
  });

  it('turns an overdue executing action uncertain without reopening Gmail', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    expect(
      claimEmailActionExecution(
        actionId,
        approvedHash,
        'lead@example.com',
        '2026-08-02T01:00:01.000Z',
      ).status,
    ).toBe('claimed');
    expect(listOverdueSends('2026-08-02T01:05:00.000Z')).toHaveLength(1);

    markPendingSendAlerted('draft-action');

    expect(getPendingSendByActionId(actionId)).toMatchObject({
      state: 'uncertain',
      lastErrorCode: 'gmail_receipt_reconciliation_required',
    });
    expect(
      claimEmailActionExecution(
        actionId,
        approvedHash,
        'lead@example.com',
        '2026-08-02T01:05:01.000Z',
      ),
    ).toMatchObject({ status: 'held' });
    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
      'executing',
      'uncertain',
    ]);
  });

  it('does not append a false alert event after Gmail already confirmed', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    claimEmailActionExecution(
      actionId,
      approvedHash,
      'lead@example.com',
      '2026-08-02T01:00:01.000Z',
    );
    confirmEmailAction(
      actionId,
      'lead@example.com',
      'gmail-message',
      'gmail-thread',
      '2026-08-02T01:00:02.000Z',
    );

    markPendingSendAlerted('draft-action');

    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
      'executing',
      'confirmed',
    ]);
  });

  it('backfills a host action identity onto a legacy approval conflict', () => {
    recordPendingSend({
      draftTs: 'legacy-draft',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedAt: '2026-08-01T01:00:00.000Z',
    });

    const upgraded = recordPendingSend({
      actionId,
      draftTs: 'legacy-draft',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });

    expect(upgraded).toMatchObject({
      actionId,
      approvedContentSha256: approvedHash,
    });
    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
    ]);
  });

  it('does not claim an action whose subject or body changed after approval', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-action',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject',
      approvedContentSha256: approvedHash,
      approvedAt: '2026-08-02T01:00:00.000Z',
    });

    expect(
      claimEmailActionExecution(
        actionId,
        hashApprovedEmailContent('Subject', 'Mutated body'),
        'lead@example.com',
        '2026-08-02T01:00:01.000Z',
      ),
    ).toMatchObject({
      status: 'held',
      reason: expect.stringContaining('hash does not match'),
    });
    expect(getPendingSendByActionId(actionId)?.state).toBe('approved');
    expect(listEmailSendEvents(actionId).map((event) => event.stage)).toEqual([
      'approved',
    ]);
  });

  it('separates concurrent approvals for the same recipient by content hash', () => {
    const secondActionId = '1a6d9d42-c03e-499d-b255-ad0823676355';
    recordPendingSend({
      actionId,
      draftTs: 'draft-action-a',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      recipient: 'same@example.com',
      approvedSubject: 'Subject A',
      approvedContentSha256: hashApprovedEmailContent('Subject A', 'Body A'),
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    recordPendingSend({
      actionId: secondActionId,
      draftTs: 'draft-action-b',
      groupFolder: 'chief',
      chatJid: 'slack:chief',
      recipient: 'same@example.com',
      approvedSubject: 'Subject B',
      approvedContentSha256: hashApprovedEmailContent('Subject B', 'Body B'),
      approvedAt: '2026-08-02T01:00:01.000Z',
    });

    expect(
      findPendingSendAction({
        recipient: 'same@example.com',
        approvedContentSha256: hashApprovedEmailContent('Subject B', 'Body B'),
      }),
    ).toMatchObject({
      ambiguous: false,
      action: { actionId: secondActionId },
    });
  });

  it('persists a Gmail thread binding and clears one same-recipient row at a time', () => {
    recordPendingSend({
      draftTs: 'draft-1',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      gmailThreadId: 'gmail-thread-1',
      recipient: 'lead@example.com',
      approvedAt: '2026-07-30T01:00:00.000Z',
    });
    recordPendingSend({
      draftTs: 'draft-2',
      groupFolder: 'chief',
      chatJid: 'slack:chief',
      gmailThreadId: 'gmail-thread-2',
      recipient: 'lead@example.com',
      approvedAt: '2026-07-30T01:01:00.000Z',
    });

    expect(getPendingSendByGmailThread('gmail-thread-1')).toMatchObject({
      ambiguous: false,
      action: { recipient: 'lead@example.com' },
    });
    expect(clearPendingSendsByRecipient('LEAD@example.com')).toBe(1);
    expect(getPendingSendByGmailThread('gmail-thread-1')).toEqual({
      ambiguous: false,
      candidates: [],
    });
    expect(getPendingSendByGmailThread('gmail-thread-2')).toMatchObject({
      ambiguous: false,
      action: { recipient: 'lead@example.com' },
    });
  });

  it('supersedes an older pre-Gmail action in the same Slack work thread', () => {
    const newerActionId = '1a6d9d42-c03e-499d-b255-ad0823676355';
    recordPendingSend({
      actionId,
      draftTs: 'draft-v1',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      threadTs: 'lead-thread',
      gmailThreadId: 'gmail-thread',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject v1',
      approvedContentSha256: hashApprovedEmailContent('Subject v1', 'Body v1'),
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    markEmailActionHandoff(actionId, 'handoff-v1', '2026-08-02T01:00:01.000Z');
    recordPendingSend({
      actionId: newerActionId,
      draftTs: 'draft-v2',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      threadTs: 'lead-thread',
      gmailThreadId: 'gmail-thread',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject v2',
      approvedContentSha256: hashApprovedEmailContent('Subject v2', 'Body v2'),
      approvedAt: '2026-08-02T01:01:00.000Z',
    });

    expect(getPendingSendByActionId(actionId)).toMatchObject({
      state: 'blocked',
      lastErrorCode: 'superseded_by_newer_approval',
    });
    expect(listEmailSendEvents(actionId).at(-1)).toMatchObject({
      stage: 'blocked',
      code: 'superseded_by_newer_approval',
    });
    expect(getPendingSendByGmailThread('gmail-thread')).toMatchObject({
      ambiguous: false,
      action: { actionId: newerActionId },
    });
    expect(
      claimEmailActionExecution(
        actionId,
        hashApprovedEmailContent('Subject v1', 'Body v1'),
        'lead@example.com',
        '2026-08-02T01:02:00.000Z',
      ),
    ).toMatchObject({ status: 'held', reason: 'action is blocked' });
  });

  it('reports ambiguity when one Gmail thread belongs to multiple work threads', () => {
    recordPendingSend({
      actionId,
      draftTs: 'draft-a',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      threadTs: 'lead-thread-a',
      gmailThreadId: 'shared-gmail-thread',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject A',
      approvedContentSha256: hashApprovedEmailContent('Subject A', 'Body A'),
      approvedAt: '2026-08-02T01:00:00.000Z',
    });
    recordPendingSend({
      actionId: '1a6d9d42-c03e-499d-b255-ad0823676355',
      draftTs: 'draft-b',
      groupFolder: 'sales',
      chatJid: 'slack:sales',
      threadTs: 'lead-thread-b',
      gmailThreadId: 'shared-gmail-thread',
      recipient: 'lead@example.com',
      approvedSubject: 'Subject B',
      approvedContentSha256: hashApprovedEmailContent('Subject B', 'Body B'),
      approvedAt: '2026-08-02T01:01:00.000Z',
    });

    expect(getPendingSendByGmailThread('shared-gmail-thread')).toMatchObject({
      ambiguous: true,
      candidates: [
        { actionId: '1a6d9d42-c03e-499d-b255-ad0823676355' },
        { actionId },
      ],
    });
  });

  it('does not reauthorize a legacy approval with no approved recipient', () => {
    recordPendingSend({
      draftTs: 'draft-no-recipient',
      groupFolder: 'chief',
      chatJid: 'slack:chief',
      gmailThreadId: 'gmail-thread-no-recipient',
      approvedAt: '2026-07-30T01:00:00.000Z',
    });

    expect(getPendingSendByGmailThread('gmail-thread-no-recipient')).toEqual({
      ambiguous: false,
      candidates: [],
    });
  });
});

// Helper to store a message using the normalized NewMessage interface
function store(overrides: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
}) {
  storeMessage({
    id: overrides.id,
    chat_jid: overrides.chat_jid,
    sender: overrides.sender,
    sender_name: overrides.sender_name,
    content: overrides.content,
    timestamp: overrides.timestamp,
    is_from_me: overrides.is_from_me ?? false,
  });
}

// --- storeMessage (NewMessage format) ---

describe('storeMessage', () => {
  it('stores a message and retrieves it', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-1',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'hello world',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('msg-1');
    expect(messages[0].sender).toBe('123@s.whatsapp.net');
    expect(messages[0].sender_name).toBe('Alice');
    expect(messages[0].content).toBe('hello world');
  });

  it('filters out empty content', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-2',
      chat_jid: 'group@g.us',
      sender: '111@s.whatsapp.net',
      sender_name: 'Dave',
      content: '',
      timestamp: '2024-01-01T00:00:04.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(0);
  });

  it('stores is_from_me flag', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-3',
      chat_jid: 'group@g.us',
      sender: 'me@s.whatsapp.net',
      sender_name: 'Me',
      content: 'my message',
      timestamp: '2024-01-01T00:00:05.000Z',
      is_from_me: true,
    });

    // Message is stored (we can retrieve it — is_from_me doesn't affect retrieval)
    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
  });

  it('upserts on duplicate id+chat_jid', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'msg-dup',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'original',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    store({
      id: 'msg-dup',
      chat_jid: 'group@g.us',
      sender: '123@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'updated',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const messages = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('updated');
  });
});

describe('Slack thread bot lookup', () => {
  it('returns the latest bot draft inside one thread', () => {
    storeChatMetadata('slack:C1', '2026-08-02T01:00:00.000Z');
    storeMessageDirect({
      id: 'thread-root',
      chat_jid: 'slack:C1',
      sender: 'human',
      sender_name: 'Human',
      content: 'Inbound handoff',
      timestamp: '2026-08-02T01:00:00.000Z',
      is_from_me: false,
      is_bot_message: false,
    });
    storeMessageDirect({
      id: 'draft-1',
      chat_jid: 'slack:C1',
      sender: 'bot',
      sender_name: 'Gru',
      content: '[SALES REVIEW] old',
      timestamp: '2026-08-02T01:00:01.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: 'thread-root',
    });
    storeMessageDirect({
      id: 'draft-2',
      chat_jid: 'slack:C1',
      sender: 'bot',
      sender_name: 'Gru',
      content: '[SALES REVIEW] revised',
      timestamp: '2026-08-02T01:00:02.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: 'thread-root',
    });

    expect(getLatestBotMessageInThread('slack:C1', 'thread-root')?.id).toBe(
      'draft-2',
    );
  });
});

// --- getMessagesSince ---

describe('getMessagesSince', () => {
  beforeEach(() => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'm1',
      chat_jid: 'group@g.us',
      sender: 'Alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'first',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    store({
      id: 'm2',
      chat_jid: 'group@g.us',
      sender: 'Bob@s.whatsapp.net',
      sender_name: 'Bob',
      content: 'second',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeMessage({
      id: 'm3',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'bot reply',
      timestamp: '2024-01-01T00:00:03.000Z',
      is_bot_message: true,
    });
    store({
      id: 'm4',
      chat_jid: 'group@g.us',
      sender: 'Carol@s.whatsapp.net',
      sender_name: 'Carol',
      content: 'third',
      timestamp: '2024-01-01T00:00:04.000Z',
    });
  });

  it('returns messages after the given timestamp', () => {
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:02.000Z',
      'Gru',
    );
    // Should exclude m1, m2 (before/at timestamp), m3 (bot message)
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('third');
  });

  it('excludes bot messages via is_bot_message flag', () => {
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    const botMsgs = msgs.filter((m) => m.content === 'bot reply');
    expect(botMsgs).toHaveLength(0);
  });

  it('returns all non-bot messages when sinceTimestamp is empty', () => {
    const msgs = getMessagesSince('group@g.us', '', 'Gru');
    // 3 user messages (bot message excluded)
    expect(msgs).toHaveLength(3);
  });

  it('filters pre-migration bot messages via content prefix backstop', () => {
    // Simulate a message written before migration: has prefix but is_bot_message = 0
    store({
      id: 'm5',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'Gru: old bot reply',
      timestamp: '2024-01-01T00:00:05.000Z',
    });
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:04.000Z',
      'Gru',
    );
    expect(msgs).toHaveLength(0);
  });

  // Regression: 2026-07-05 noop-swarm incident. conditions/params were built
  // in different orders, so passing excludeGroup bound the folder name to
  // `content NOT LIKE` and the bot prefix to `from_group !=` — the own-group
  // exclusion silently matched nothing and every ack/reply the group posted
  // came back as phantom pending work.
  it('excludes the group own messages when excludeGroup is passed', () => {
    storeMessage({
      id: 'own1',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Gru',
      content: '[PROCESSING] on it',
      timestamp: '2024-01-01T00:00:06.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'grader',
    });
    storeMessage({
      id: 'other1',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Gru',
      content: '[HANDOFF] please grade',
      timestamp: '2024-01-01T00:00:07.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'inbox',
    });
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:05.000Z',
      'Gru',
      'grader',
    );
    // Own row excluded; cross-group handoff (from_group=inbox) retained.
    expect(msgs.map((m) => m.id)).toEqual(['other1']);
  });

  it('keeps the bot-prefix backstop working alongside excludeGroup', () => {
    store({
      id: 'legacy1',
      chat_jid: 'group@g.us',
      sender: 'Bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'Gru: legacy prefixed reply',
      timestamp: '2024-01-01T00:00:06.000Z',
    });
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:05.000Z',
      'Gru',
      'grader',
    );
    expect(msgs).toHaveLength(0);
  });

  it('binds threadTs correctly when excludeGroup is also passed', () => {
    store({
      id: 'root1',
      chat_jid: 'group@g.us',
      sender: 'Alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'a submission',
      timestamp: '2024-01-01T00:00:06.000Z',
    });
    storeMessage({
      id: 'reply1',
      chat_jid: 'group@g.us',
      sender: 'Alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'threaded follow-up',
      timestamp: '2024-01-01T00:00:07.000Z',
      is_from_me: false,
      thread_ts: 'root1',
    });
    const msgs = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:05.000Z',
      'Gru',
      'grader',
      'root1',
    );
    expect(msgs.map((m) => m.id)).toEqual(['reply1']);
  });

  // Regression: root-bucket cross-thread bleed. After minions began threading
  // their own posts (8a0b11b), a root spawn passing threadTs=undefined pulled in
  // every OTHER thread's messages since the (independently-advancing) root
  // cursor, replaying already-handled work into a fresh container (Nitin Goyal's
  // cert re-examined when Namrata Kohli's was requested, 2026-07-16). A root
  // spawn must pass `null` (root only), not `undefined` (no filter).
  it('scopes root fetches to root messages when threadTs is null', () => {
    store({
      id: 'rootcmd',
      chat_jid: 'group@g.us',
      sender: 'Alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'new root command',
      timestamp: '2024-01-01T00:00:08.000Z',
    });
    storeMessage({
      id: 'otherthreadreply',
      chat_jid: 'group@g.us',
      sender: 'Bob@s.whatsapp.net',
      sender_name: 'Bob',
      content: 'send',
      timestamp: '2024-01-01T00:00:09.000Z',
      is_from_me: false,
      thread_ts: 'someoldcert',
    });
    // undefined = no thread filter: the stale thread reply bleeds in.
    const unscoped = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:07.000Z',
      'Gru',
      'grader',
    );
    expect(unscoped.map((m) => m.id).sort()).toEqual([
      'otherthreadreply',
      'rootcmd',
    ]);
    // null = root only: the other thread's reply is excluded.
    const scoped = getMessagesSince(
      'group@g.us',
      '2024-01-01T00:00:07.000Z',
      'Gru',
      'grader',
      null,
    );
    expect(scoped.map((m) => m.id)).toEqual(['rootcmd']);
  });
});

// --- getThreadContext ---

describe('getThreadContext', () => {
  // Reproduces the Travis Rose sales thread (2026-07-06): the agent's own pending
  // draft (from_group=sales) must survive into the injected context so an operator
  // reply lands with the draft it responds to.
  const CHAT = 'slack:C0AHV1SGT6W';
  const ROOT = '1783366424.764419';

  beforeEach(() => {
    storeChatMetadata(CHAT, '2026-07-06T00:00:00.000Z');
    // Root: the agent's "New Lead" post (own group).
    storeMessageDirect({
      id: ROOT,
      chat_jid: CHAT,
      sender: 'bot',
      sender_name: 'Mr Gru',
      content: 'New Lead | Travis Rose — Entry 705',
      timestamp: '2026-07-06T19:33:44.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
    });
    // The pending draft reply — also the agent's own post.
    storeMessageDirect({
      id: '1783366984.433769',
      chat_jid: CHAT,
      sender: 'bot',
      sender_name: 'Mr Gru',
      content: 'DRAFT (REQUIRE_APPROVAL=1) Thread-ID: 19f38ee3bae4adec',
      timestamp: '2026-07-06T19:43:04.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: ROOT,
    });
    // Host mechanical ack — must be filterable by the caller.
    storeMessageDirect({
      id: '1783366987.072419',
      chat_jid: CHAT,
      sender: 'bot',
      sender_name: 'Mr Gru',
      content: '[PROCESSING] drafting…',
      timestamp: '2026-07-06T19:43:07.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: ROOT,
    });
    // The operator's threaded reply.
    storeMessageDirect({
      id: '1783381432.189439',
      chat_jid: CHAT,
      sender: 'alex',
      sender_name: 'Alex Kudinov',
      content: 'unfortunately alex is not available for new engagements',
      timestamp: '2026-07-06T23:43:52.000Z',
      is_from_me: false,
      from_group: undefined,
      thread_ts: ROOT,
    });
  });

  it('includes the root and the agent OWN draft (not stripped by from_group)', () => {
    const ctx = getThreadContext(CHAT, ROOT, 25);
    const ids = ctx.map((m) => m.id);
    expect(ids).toContain(ROOT);
    expect(ids).toContain('1783366984.433769'); // the pending draft
    expect(ids).toContain('1783381432.189439'); // operator reply
  });

  it('returns oldest→newest so the draft precedes the reply', () => {
    const ctx = getThreadContext(CHAT, ROOT, 25);
    const ids = ctx.map((m) => m.id);
    expect(ids.indexOf('1783366984.433769')).toBeLessThan(
      ids.indexOf('1783381432.189439'),
    );
  });

  it('caps to the most recent `limit` posts', () => {
    const ctx = getThreadContext(CHAT, ROOT, 2);
    expect(ctx).toHaveLength(2);
    // Newest two, still in ascending order.
    expect(ctx[ctx.length - 1].id).toBe('1783381432.189439');
  });
});

// --- getNewMessages ---

describe('getNewMessages', () => {
  beforeEach(() => {
    storeChatMetadata('group1@g.us', '2024-01-01T00:00:00.000Z');
    storeChatMetadata('group2@g.us', '2024-01-01T00:00:00.000Z');

    store({
      id: 'a1',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g1 msg1',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    store({
      id: 'a2',
      chat_jid: 'group2@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g2 msg1',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeMessage({
      id: 'a3',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'bot reply',
      timestamp: '2024-01-01T00:00:03.000Z',
      is_bot_message: true,
    });
    store({
      id: 'a4',
      chat_jid: 'group1@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'g1 msg2',
      timestamp: '2024-01-01T00:00:04.000Z',
    });
  });

  it('returns new messages across multiple groups', () => {
    const { messages, newTimestamp } = getNewMessages(
      ['group1@g.us', 'group2@g.us'],
      '2024-01-01T00:00:00.000Z',
      'Gru',
    );
    // Excludes bot message, returns 3 user messages
    expect(messages).toHaveLength(3);
    expect(newTimestamp).toBe('2024-01-01T00:00:04.000Z');
  });

  it('filters by timestamp', () => {
    const { messages } = getNewMessages(
      ['group1@g.us', 'group2@g.us'],
      '2024-01-01T00:00:02.000Z',
      'Gru',
    );
    // Only g1 msg2 (after ts, not bot)
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('g1 msg2');
  });

  it('returns empty for no registered groups', () => {
    const { messages, newTimestamp } = getNewMessages([], '', 'Gru');
    expect(messages).toHaveLength(0);
    expect(newTimestamp).toBe('');
  });

  // A cross-group handoff is host-authored, so it is a bot row — but it is the
  // only thing that can start the target group. Suppressing it stalled every
  // approved send until something else happened to wake the target
  // (Lead #962 via the Gmail jid, Entry #871 via Slack).
  describe('cross-group handoff wake rule', () => {
    beforeEach(() => {
      storeMessage({
        id: 'h1',
        chat_jid: 'group1@g.us',
        sender: 'mailman',
        sender_name: 'mailman',
        content: '[HANDOFF: mailman→sales]\nEntry ID: 871',
        timestamp: '2024-01-01T00:00:05.000Z',
        is_bot_message: true,
        from_group: 'mailman',
      });
      storeMessage({
        id: 'h2',
        chat_jid: 'group1@g.us',
        sender: 'sales',
        sender_name: 'sales',
        content: '[SALES REVIEW] Lead #871 — own echo',
        timestamp: '2024-01-01T00:00:06.000Z',
        is_bot_message: true,
        from_group: 'sales',
      });
      storeMessage({
        id: 'h3',
        chat_jid: 'group1@g.us',
        sender: 'host',
        sender_name: 'host',
        content: 'untagged host status line',
        timestamp: '2024-01-01T00:00:07.000Z',
        is_bot_message: true,
      });
    });

    it('wakes the target group on another group’s handoff', () => {
      const { messages } = getNewMessages(
        ['group1@g.us'],
        '2024-01-01T00:00:04.000Z',
        'Gru',
        { 'group1@g.us': 'sales' },
      );
      expect(messages.map((m) => m.id)).toEqual(['h1']);
    });

    it('never wakes a group on its own echo or on untagged host noise', () => {
      const { messages } = getNewMessages(
        ['group1@g.us'],
        '2024-01-01T00:00:05.000Z',
        'Gru',
        { 'group1@g.us': 'sales' },
      );
      expect(messages).toHaveLength(0);
    });

    it('advances the cursor past suppressed rows so they are not rescanned', () => {
      const { newTimestamp } = getNewMessages(
        ['group1@g.us'],
        '2024-01-01T00:00:05.000Z',
        'Gru',
        { 'group1@g.us': 'sales' },
      );
      expect(newTimestamp).toBe('2024-01-01T00:00:07.000Z');
    });

    it('stays conservative when the chat has no known owner', () => {
      const { messages } = getNewMessages(
        ['group1@g.us'],
        '2024-01-01T00:00:04.000Z',
        'Gru',
      );
      expect(messages).toHaveLength(0);
    });
  });
});

// --- storeChatMetadata ---

describe('storeChatMetadata', () => {
  it('stores chat with JID as default name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    const chats = getAllChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].jid).toBe('group@g.us');
    expect(chats[0].name).toBe('group@g.us');
  });

  it('stores chat with explicit name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z', 'My Group');
    const chats = getAllChats();
    expect(chats[0].name).toBe('My Group');
  });

  it('updates name on subsequent call with name', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:01.000Z', 'Updated Name');
    const chats = getAllChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].name).toBe('Updated Name');
  });

  it('preserves newer timestamp on conflict', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:05.000Z');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:01.000Z');
    const chats = getAllChats();
    expect(chats[0].last_message_time).toBe('2024-01-01T00:00:05.000Z');
  });
});

// --- Task CRUD ---

describe('task CRUD', () => {
  it('creates and retrieves a task', () => {
    createTask({
      id: 'task-1',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'do something',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2024-06-01T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const task = getTaskById('task-1');
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('do something');
    expect(task!.status).toBe('active');
  });

  it('updates task status', () => {
    createTask({
      id: 'task-2',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'test',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    updateTask('task-2', { status: 'paused' });
    expect(getTaskById('task-2')!.status).toBe('paused');
  });

  it('deletes a task and its run logs', () => {
    createTask({
      id: 'task-3',
      group_folder: 'main',
      chat_jid: 'group@g.us',
      prompt: 'delete me',
      schedule_type: 'once',
      schedule_value: '2024-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    deleteTask('task-3');
    expect(getTaskById('task-3')).toBeUndefined();
  });
});

// --- Host Job Scheduling CRUD ---

describe('upsertJobDefinition / getJob', () => {
  it('creates a job and retrieves it', () => {
    upsertJobDefinition({
      name: 'daily-sync',
      description: 'Syncs data every day',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/sync.sh',
      args: ['--full'],
      cron: '0 9 * * *',
      timezone: 'America/Chicago',
      retries: 1,
      retry_delay_ms: 30000,
      alert_level: 'alert',
      timeout_ms: 300000,
      lockfile: null,
      enabled: true,
    });

    const job = getJob('daily-sync');
    expect(job).toBeDefined();
    expect(job!.name).toBe('daily-sync');
    expect(job!.description).toBe('Syncs data every day');
    expect(job!.script).toBe('tools/sync.sh');
    expect(job!.args).toEqual(['--full']);
    expect(job!.enabled).toBe(true);
  });

  it('updates definition fields on re-upsert but NOT runtime fields', () => {
    upsertJobDefinition({
      name: 'batch-job',
      description: 'Original description',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/batch.sh',
      args: [],
      cron: '0 8 * * *',
      timezone: 'America/Chicago',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'warn',
      timeout_ms: 5400000,
      lockfile: null,
      enabled: true,
    });

    // Set some runtime state
    updateJobRunState('batch-job', {
      last_run: '2024-06-01T08:00:00.000Z',
      last_result: 'ok',
      last_duration_ms: 4200,
      last_output: 'done',
      next_run: '2024-06-02T08:00:00.000Z',
    });

    // Re-upsert with updated description
    upsertJobDefinition({
      name: 'batch-job',
      description: 'Updated description',
      project: 'tandemweb',
      project_root: '/projects/tandemweb',
      script: 'tools/batch.sh',
      args: [],
      cron: '0 8 * * *',
      timezone: 'America/Chicago',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'warn',
      timeout_ms: 5400000,
      lockfile: null,
      enabled: true,
    });

    const job = getJob('batch-job');
    expect(job!.description).toBe('Updated description');
    // Runtime fields must be preserved
    expect(job!.last_run).toBe('2024-06-01T08:00:00.000Z');
    expect(job!.last_result).toBe('ok');
    expect(job!.last_duration_ms).toBe(4200);
  });
});

describe('updateJobRunState', () => {
  it('updates all runtime fields', () => {
    upsertJobDefinition({
      name: 'state-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    updateJobRunState('state-job', {
      last_run: '2024-07-01T10:00:00.000Z',
      last_result: 'fail',
      last_duration_ms: 1200,
      last_output: 'error output',
      next_run: '2024-07-01T11:00:00.000Z',
    });

    const job = getJob('state-job');
    expect(job!.last_run).toBe('2024-07-01T10:00:00.000Z');
    expect(job!.last_result).toBe('fail');
    expect(job!.last_duration_ms).toBe(1200);
    expect(job!.last_output).toBe('error output');
    expect(job!.next_run).toBe('2024-07-01T11:00:00.000Z');
  });
});

describe('getDueJobs', () => {
  function insertJob(name: string, nextRun: string, enabled = true) {
    upsertJobDefinition({
      name,
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled,
    });
    updateJobNextRun(name, nextRun);
  }

  it('returns only enabled jobs with next_run <= now', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();
    const future = new Date(now.getTime() + 60000).toISOString();

    insertJob('due-job', past, true);
    insertJob('future-job', future, true);

    const due = getDueJobs(now.toISOString());
    expect(due.map((j: { name: string }) => j.name)).toContain('due-job');
    expect(due.map((j: { name: string }) => j.name)).not.toContain(
      'future-job',
    );
  });

  it('does not return disabled jobs even when next_run is overdue', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();

    insertJob('disabled-overdue', past, false);

    const due = getDueJobs(now.toISOString());
    expect(due.map((j: { name: string }) => j.name)).not.toContain(
      'disabled-overdue',
    );
  });
});

describe('setJobEnabled', () => {
  it('disables an enabled job', () => {
    upsertJobDefinition({
      name: 'toggle-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    setJobEnabled('toggle-job', false);
    expect(getJob('toggle-job')!.enabled).toBe(false);
  });

  it('re-enables a disabled job', () => {
    upsertJobDefinition({
      name: 'reenable-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: false,
    });

    setJobEnabled('reenable-job', true);
    expect(getJob('reenable-job')!.enabled).toBe(true);
  });
});

describe('insertJobRunLog / getJobRunLogs', () => {
  it('stores a log and retrieves it ordered by started_at desc', () => {
    upsertJobDefinition({
      name: 'log-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-aaa',
      job_name: 'log-job',
      triggered_by: 'cron',
      started_at: '2024-08-01T10:00:00.000Z',
      status: 'ok',
      pid: null,
      retry_attempt: 0,
    });

    insertJobRunLog({
      id: 'run-bbb',
      job_name: 'log-job',
      triggered_by: 'cron',
      started_at: '2024-08-02T10:00:00.000Z',
      status: 'fail',
      pid: null,
      retry_attempt: 0,
    });

    const logs = getJobRunLogs('log-job');
    expect(logs).toHaveLength(2);
    // Most recent first
    expect(logs[0].id).toBe('run-bbb');
    expect(logs[1].id).toBe('run-aaa');
  });

  it('respects the limit parameter', () => {
    upsertJobDefinition({
      name: 'limit-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    for (let i = 0; i < 5; i++) {
      insertJobRunLog({
        id: `run-limit-${i}`,
        job_name: 'limit-job',
        triggered_by: 'cron',
        started_at: `2024-08-0${i + 1}T10:00:00.000Z`,
        status: 'ok',
        pid: null,
        retry_attempt: 0,
      });
    }

    const logs = getJobRunLogs('limit-job', 3);
    expect(logs).toHaveLength(3);
  });
});

describe('getRunningJobNames', () => {
  it('returns names of jobs with status=running', () => {
    upsertJobDefinition({
      name: 'running-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-active',
      job_name: 'running-job',
      triggered_by: 'cron',
      started_at: new Date().toISOString(),
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    const names = getRunningJobNames();
    expect(names).toContain('running-job');
  });

  it('does not return completed jobs', () => {
    upsertJobDefinition({
      name: 'done-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    insertJobRunLog({
      id: 'run-done',
      job_name: 'done-job',
      triggered_by: 'cron',
      started_at: new Date().toISOString(),
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    updateJobRunLog('run-done', {
      status: 'ok',
      finished_at: new Date().toISOString(),
      duration_ms: 500,
      exit_code: 0,
    });

    const names = getRunningJobNames();
    expect(names).not.toContain('done-job');
  });

  it('ignores orphan running rows older than timeout + grace', () => {
    upsertJobDefinition({
      name: 'orphan-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    // A 'running' row from 1h ago — far beyond timeout_ms (60s) + 5m grace.
    // Its process is long dead; treating it as live would skip the job forever.
    insertJobRunLog({
      id: 'run-orphan',
      job_name: 'orphan-job',
      triggered_by: 'cron',
      started_at: new Date(Date.now() - 3_600_000).toISOString(),
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    const names = getRunningJobNames();
    expect(names).not.toContain('orphan-job');
  });
});

describe('markStaleRunsAsFailed', () => {
  it('marks old running rows as failed', () => {
    upsertJobDefinition({
      name: 'stale-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    // Insert a run that started 2 hours ago (stale)
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    insertJobRunLog({
      id: 'run-stale',
      job_name: 'stale-job',
      triggered_by: 'cron',
      started_at: staleTime,
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    // Grace period of 1 hour means 2-hour-old runs are stale
    const affected = markStaleRunsAsFailed(3600);
    expect(affected.map((r: { job_name: string }) => r.job_name)).toContain(
      'stale-job',
    );

    const logs = getJobRunLogs('stale-job');
    expect(logs[0].status).toBe('fail');
    expect(logs[0].error).toBe('Interrupted by restart');
  });

  it('does not touch recently-started runs within grace period', () => {
    upsertJobDefinition({
      name: 'fresh-job',
      description: '',
      project: 'proj',
      project_root: '/proj',
      script: 'run.sh',
      args: [],
      cron: '0 * * * *',
      timezone: 'UTC',
      retries: 0,
      retry_delay_ms: 60000,
      alert_level: 'alert',
      timeout_ms: 60000,
      lockfile: null,
      enabled: true,
    });

    // Insert a run started 10 seconds ago (fresh)
    const recentTime = new Date(Date.now() - 10000).toISOString();
    insertJobRunLog({
      id: 'run-fresh',
      job_name: 'fresh-job',
      triggered_by: 'cron',
      started_at: recentTime,
      status: 'running',
      pid: null,
      retry_attempt: 0,
    });

    // Grace period of 1 hour - fresh run should NOT be marked stale
    markStaleRunsAsFailed(3600);

    const logs = getJobRunLogs('fresh-job');
    expect(logs[0].status).toBe('running');
  });
});

// --- RegisteredGroup isMain round-trip ---

describe('registered group isMain', () => {
  it('persists isMain=true through set/get round-trip', () => {
    setRegisteredGroup('main@s.whatsapp.net', {
      name: 'Main Chat',
      folder: 'whatsapp_main',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
      isMain: true,
    });

    const groups = getAllRegisteredGroups();
    const group = groups['main@s.whatsapp.net'];
    expect(group).toBeDefined();
    expect(group.isMain).toBe(true);
    expect(group.folder).toBe('whatsapp_main');
  });

  it('omits isMain for non-main groups', () => {
    setRegisteredGroup('group@g.us', {
      name: 'Family Chat',
      folder: 'whatsapp_family-chat',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
    });

    const groups = getAllRegisteredGroups();
    const group = groups['group@g.us'];
    expect(group).toBeDefined();
    expect(group.isMain).toBeUndefined();
  });
});

describe('recordEmailOpen (T04)', () => {
  it('returns null for an unknown tracking token', () => {
    expect(recordEmailOpen('no-such-token', 'UA')).toBeNull();
  });

  it('records an open and returns the result for a known token', () => {
    insertTrackingPixel('trk-1', 42, 'follow-up');
    const r = recordEmailOpen('trk-1', 'Mozilla/5.0');
    expect(r).not.toBeNull();
    expect(r?.leadId).toBe(42);
    expect(r?.emailType).toBe('follow-up');
    expect(r?.openCount).toBe(1);
  });
});

describe('slack thread anchors', () => {
  it('returns undefined for an unknown key', () => {
    expect(resolveThreadAnchor('C123', 'sales:entry:42')).toBeUndefined();
  });

  it('records then resolves the root ts with a last-activity stamp', () => {
    recordThreadAnchor('C123', 'sales:entry:42', '1700.0001');
    const a = resolveThreadAnchor('C123', 'sales:entry:42');
    expect(a?.threadTs).toBe('1700.0001');
    expect(a?.lastActivityAt).toBeTruthy();
  });

  it('scopes anchors per channel — same key in two channels is independent', () => {
    recordThreadAnchor('C123', 'booking:appt:7', '1700.0001');
    recordThreadAnchor('C999', 'booking:appt:7', '1800.0002');
    expect(resolveThreadAnchor('C123', 'booking:appt:7')?.threadTs).toBe(
      '1700.0001',
    );
    expect(resolveThreadAnchor('C999', 'booking:appt:7')?.threadTs).toBe(
      '1800.0002',
    );
  });

  it('keeps the first root on conflict — a race never splits a work-unit', () => {
    recordThreadAnchor('C123', 'cert:jane|pcc', '1700.0001');
    recordThreadAnchor('C123', 'cert:jane|pcc', '1700.9999');
    expect(resolveThreadAnchor('C123', 'cert:jane|pcc')?.threadTs).toBe(
      '1700.0001',
    );
  });

  it('rollThreadAnchor repoints a dormant anchor at a fresh root', () => {
    recordThreadAnchor('C123', 'sales:entry:9', '1700.0001');
    rollThreadAnchor('C123', 'sales:entry:9', '1900.5555');
    expect(resolveThreadAnchor('C123', 'sales:entry:9')?.threadTs).toBe(
      '1900.5555',
    );
  });

  it('rollThreadAnchor creates the anchor when none exists', () => {
    rollThreadAnchor('C123', 'sales:entry:new', '2000.0001');
    expect(resolveThreadAnchor('C123', 'sales:entry:new')?.threadTs).toBe(
      '2000.0001',
    );
  });

  it('touchThreadAnchor advances last_activity_at without moving the root', () => {
    recordThreadAnchor('C123', 'sales:entry:11', '1700.0001');
    const before = resolveThreadAnchor('C123', 'sales:entry:11');
    touchThreadAnchor('C123', 'sales:entry:11');
    const after = resolveThreadAnchor('C123', 'sales:entry:11');
    expect(after?.threadTs).toBe('1700.0001');
    expect(
      Date.parse(after!.lastActivityAt) >= Date.parse(before!.lastActivityAt),
    ).toBe(true);
  });
});
