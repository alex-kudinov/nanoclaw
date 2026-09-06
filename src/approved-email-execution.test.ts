import { describe, expect, it } from 'vitest';

import { buildHostApprovedEmailExecution } from './approved-email-execution.js';
import type { EmailSendActionRow } from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import type { GmailIpcPayload } from './gmail-ipc-handlers.js';

const actionId = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
const subject = 'Re: ICF Level 2 + AATC Bridge Program';
const body = 'Keep A & B, smart quotes “exactly,” and  two spaces.';
const card = [
  '[SALES REVIEW] Lead #1003',
  'Email: lead@example.co',
  '',
  'DRAFT RESPONSE TO LEAD:',
  '---',
  `Subject: ${subject}`,
  '',
  body,
  '---',
].join('\n');

function action(
  overrides: Partial<EmailSendActionRow> = {},
): EmailSendActionRow {
  return {
    actionId,
    draftTs: 'approved-card',
    groupFolder: 'sales',
    chatJid: 'slack:SALES',
    threadTs: 'approval-thread',
    gmailThreadId: 'gmail-thread',
    leadRef: 'Lead #1003',
    recipient: 'lead@example.co',
    approvedSubject: subject,
    approvedContentSha256: hashApprovedEmailContent(subject, body),
    approvedAt: '2026-08-04T13:03:19.015Z',
    state: 'mailman_started',
    ...overrides,
  };
}

function request(overrides: Partial<GmailIpcPayload> = {}): GmailIpcPayload {
  return {
    type: 'gmail_send',
    groupFolder: 'mailman',
    source_container: 'nanoclaw-mailman-action',
    timestamp: '2026-08-04T13:04:24.950Z',
    to: 'wrong@example.co',
    subject: 'Changed subject',
    body: 'Keep A &amp; B, smart quotes “exactly,” and two spaces.',
    cc: 'unapproved@example.co',
    html: true,
    leadId: 1003,
    pipelineEntryId: 9999,
    emailType: 'follow-up',
    threadId: 'wrong-thread',
    ...overrides,
  };
}

describe('buildHostApprovedEmailExecution', () => {
  it('rechecks factual consistency at the final Gmail execution boundary', () => {
    const result = buildHostApprovedEmailExecution(action(), card, request(), {
      factConsistencyIssue: () =>
        'the operational schedule contains future cohorts',
    });

    expect(result).toEqual({
      ok: false,
      code: 'approved_card_fact_inconsistent',
      reason: expect.stringContaining('future cohorts'),
    });
  });

  it('replaces every model-controlled customer field with approved host bytes', () => {
    const result = buildHostApprovedEmailExecution(action(), card, request());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        approvedContentSha256: hashApprovedEmailContent(subject, body),
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.payload).toEqual(
      expect.objectContaining({
        type: 'gmail_send',
        actionId,
        to: 'lead@example.co',
        subject,
        body,
        threadId: 'gmail-thread',
        approvedRecipient: 'lead@example.co',
        markdown: true,
        pipelineEntryId: 1003,
      }),
    );
    expect(result.payload).not.toHaveProperty('cc');
    expect(result.payload).not.toHaveProperty('html');
    expect(result.payload).not.toHaveProperty('leadId');
    expect(result.payload.emailType).toBe('initial');
    expect(result.correctedFields).toEqual(
      expect.arrayContaining([
        'action_id',
        'body',
        'recipient',
        'subject',
        'thread_id',
        'cc',
        'html',
        'lead_id',
        'pipeline_entry_id',
        'email_type',
        'markdown',
      ]),
    );
  });

  it('removes untrusted pipeline identity when the durable action has no exact lead binding', () => {
    const result = buildHostApprovedEmailExecution(
      action({ leadRef: undefined }),
      card,
      request({ pipelineEntryId: 9999 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.payload).not.toHaveProperty('pipelineEntryId');
    expect(result.correctedFields).toContain('pipeline_entry_id');
  });

  it('derives follow-up classification from the approved card, not the model', () => {
    const followupCard = card
      .replace(
        '[SALES REVIEW] Lead #1003',
        '[FOLLOW-UP #1] Lead #1003\nThread-ID: gmail-thread',
      )
      .replace('DRAFT RESPONSE TO LEAD:', 'DRAFT FOLLOW-UP:');
    const result = buildHostApprovedEmailExecution(
      action(),
      followupCard,
      request({ emailType: 'initial' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.payload.emailType).toBe('follow-up');
  });

  it('replaces model CC with the ordered operator-approved CC list', () => {
    const cardWithCc = card.replace(
      'Email: lead@example.co',
      'Email: lead@example.co\nCc: info@tandemcoach.co, teammate@external.co',
    );
    const result = buildHostApprovedEmailExecution(
      action({ approvedCc: 'info@tandemcoach.co, teammate@external.co' }),
      cardWithCc,
      request({ cc: 'attacker@evil.co' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.payload).toMatchObject({
      cc: 'info@tandemcoach.co, teammate@external.co',
      approvedCc: 'info@tandemcoach.co, teammate@external.co',
    });
    expect(result.correctedFields).toEqual(
      expect.arrayContaining(['cc', 'approved_cc']),
    );
  });

  it.each([
    ['added', undefined, 'Cc: info@tandemcoach.co'],
    ['removed', 'info@tandemcoach.co', ''],
    [
      'reordered',
      'info@tandemcoach.co, teammate@external.co',
      'Cc: teammate@external.co, info@tandemcoach.co',
    ],
  ])(
    'blocks when approved CC is %s after arming',
    (_label, storedCc, ccLine) => {
      const changedCard = card.replace(
        'Email: lead@example.co',
        `Email: lead@example.co${ccLine ? `\n${ccLine}` : ''}`,
      );
      const result = buildHostApprovedEmailExecution(
        action({ approvedCc: storedCc }),
        changedCard,
        request(),
      );

      expect(result).toEqual({
        ok: false,
        code: 'approved_card_cc_mismatch',
        reason:
          'the stored approved CC recipients do not match the exact Slack card',
      });
    },
  );

  it('uses the durable thread and exact body for a reply with no model Action-ID', () => {
    const result = buildHostApprovedEmailExecution(
      action(),
      card,
      request({
        type: 'gmail_reply',
        actionId: undefined,
        threadId: 'gmail-thread',
        body: body.replace('&', '&amp;'),
        cc: undefined,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.payload.actionId).toBe(actionId);
    expect(result.payload.threadId).toBe('gmail-thread');
    expect(result.payload.body).toBe(body);
    expect(result.payload.subject).toBe(subject);
    expect(result.payload).not.toHaveProperty('to');
  });

  it('fails closed when the durable card no longer matches its approval hash', () => {
    const result = buildHostApprovedEmailExecution(
      action(),
      card.replace('two spaces', 'three spaces'),
      request(),
    );

    expect(result).toEqual({
      ok: false,
      code: 'approved_card_hash_mismatch',
      reason: 'the stored approval hash does not match the exact Slack card',
    });
  });

  it('fails closed when a reply has no durable Gmail thread', () => {
    const result = buildHostApprovedEmailExecution(
      action({ gmailThreadId: undefined }),
      card,
      request({ type: 'gmail_reply' }),
    );

    expect(result).toEqual({
      ok: false,
      code: 'approved_reply_thread_missing',
      reason: 'the approved reply has no durable Gmail thread',
    });
  });
});
