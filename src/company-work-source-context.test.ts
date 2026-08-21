import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _initTestDatabase,
  getPendingSendByActionId,
  recordPendingSend,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import { resolveCompanyWorkSourceContext } from './company-work-source-context.js';
import type { CompanyWorkExceptionItem } from './company-work-report.js';

function item(
  overrides: Partial<CompanyWorkExceptionItem> = {},
): CompanyWorkExceptionItem {
  return {
    workItemId: '4',
    workflowType: 'sales_email',
    sourceSystem: 'sqlite_email_action',
    sourceKey: 'action-1',
    partyId: '10',
    pipelineEntryId: '20',
    stage: 'approved',
    disposition: 'failed',
    version: 3,
    deadlineAt: null,
    lastTransitionAt: '2026-08-20T10:00:00.000Z',
    ageMinutes: 30,
    severity: 'critical',
    reasons: [{ kind: 'failed', code: 'delivery_missing' }],
    ...overrides,
  };
}

function storeAction(sourceGmailMessageId?: string): void {
  recordPendingSend({
    actionId: 'action-1',
    draftTs: '1800000000.000010',
    groupFolder: 'sales',
    chatJid: 'slack:C_SALES',
    threadTs: '1800000000.000001',
    gmailThreadId: 'gmail-thread-1',
    sourceGmailMessageId,
    recipient: 'lead@example.com',
    approvedSubject: 'Re: Question',
    approvedContentSha256: 'a'.repeat(64),
    approvedAt: '2026-08-20T10:00:00.000Z',
  });
}

function storeSource(messageId = 'gmail-message-1'): void {
  storeChatMetadata(
    'slack:C_SALES',
    '2026-08-20T10:00:00.000Z',
    'Sales',
    'slack',
    true,
  );
  storeMessageDirect({
    id: '1800000000.000001',
    chat_jid: 'slack:C_SALES',
    sender: 'bot',
    sender_name: 'Mr Gru',
    content:
      '[HANDOFF: mailman→sales]\nThread-ID: gmail-thread-1\n' +
      `Message-ID: ${messageId}\nFrom: lead@example.com\n` +
      'Subject: Question\nBody:\nFirst half',
    timestamp: '2026-08-20T10:00:00.000Z',
    is_from_me: true,
    is_bot_message: true,
    from_group: 'mailman',
  });
  storeMessageDirect({
    id: '1800000000.000002',
    chat_jid: 'slack:C_SALES',
    sender: 'bot',
    sender_name: 'Mr Gru',
    content: 'Second half',
    timestamp: '2026-08-20T10:00:01.000Z',
    is_from_me: true,
    is_bot_message: true,
    from_group: 'mailman',
    thread_ts: '1800000000.000001',
  });
  storeMessageDirect({
    id: '1800000000.000010',
    chat_jid: 'slack:C_SALES',
    sender: 'bot',
    sender_name: 'Mr Gru',
    content: '[SALES REVIEW] Lead #20',
    timestamp: '2026-08-20T10:01:00.000Z',
    is_from_me: true,
    is_bot_message: true,
    from_group: 'sales',
    thread_ts: '1800000000.000001',
  });
}

describe('Company Work exact source context', () => {
  beforeEach(() => {
    _initTestDatabase();
    vi.clearAllMocks();
  });

  it('hydrates the exact host-bound Sales root and persists its Gmail identity', () => {
    storeAction();
    storeSource();

    expect(resolveCompanyWorkSourceContext(item())).toMatchObject({
      status: 'attached',
      code: 'exact_source_attached',
      gmailMessageId: 'gmail-message-1',
      gmailThreadId: 'gmail-thread-1',
      bodyComplete: true,
      sourceText: expect.stringContaining('First half\nSecond half'),
    });
    expect(getPendingSendByActionId('action-1')?.sourceGmailMessageId).toBe(
      'gmail-message-1',
    );
  });

  it('supports a read-only full-evidence lookup without repairing SQLite', () => {
    storeAction();
    storeSource();

    expect(
      resolveCompanyWorkSourceContext(item(), {
        bindMissingSourceMessage: false,
        maxSourceChars: 12_000,
      }),
    ).toMatchObject({
      status: 'attached',
      code: 'exact_source_attached',
      gmailMessageId: 'gmail-message-1',
      bodyComplete: true,
      sourceText: expect.stringContaining('First half\nSecond half'),
    });
    expect(
      getPendingSendByActionId('action-1')?.sourceGmailMessageId,
    ).toBeUndefined();
  });

  it('fails closed when the durable action and routed root disagree', () => {
    storeAction('gmail-message-a');
    storeSource('gmail-message-b');

    expect(resolveCompanyWorkSourceContext(item())).toMatchObject({
      status: 'unavailable',
      code: 'source_message_identity_conflict',
    });
  });

  it('fails closed when the durable action and routed root name different threads', () => {
    storeAction();
    storeSource();
    const existing = getPendingSendByActionId('action-1');
    expect(existing?.gmailThreadId).toBe('gmail-thread-1');

    storeMessageDirect({
      id: '1800000000.000001',
      chat_jid: 'slack:C_SALES',
      sender: 'bot',
      sender_name: 'Mr Gru',
      content:
        '[HANDOFF: mailman→sales]\nThread-ID: other-thread\n' +
        'Message-ID: gmail-message-1\nBody:\nOriginal request',
      timestamp: '2026-08-20T10:00:00.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'mailman',
    });

    expect(resolveCompanyWorkSourceContext(item())).toMatchObject({
      status: 'unavailable',
      code: 'source_thread_identity_conflict',
    });
    expect(
      getPendingSendByActionId('action-1')?.sourceGmailMessageId,
    ).toBeUndefined();
  });

  it('does not invent Gmail context for non-email work', () => {
    expect(
      resolveCompanyWorkSourceContext(
        item({
          workflowType: 'program_facts_drift',
          sourceSystem: 'program_facts_guard',
        }),
      ),
    ).toMatchObject({
      status: 'not_applicable',
      code: 'workflow_has_no_email_source',
    });
  });
});
