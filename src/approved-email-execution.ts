import { buildApprovedHandoff } from './approved-send-handoff.js';
import type { EmailSendActionRow } from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import type { GmailIpcPayload } from './gmail-ipc-handlers.js';

export type ApprovedEmailExecutionResult =
  | {
      ok: true;
      payload: GmailIpcPayload;
      approvedContentSha256: string;
      correctedFields: string[];
    }
  | { ok: false; code: string; reason: string };

function changed(a: unknown, b: unknown): boolean {
  return (a ?? undefined) !== (b ?? undefined);
}

/**
 * Rehydrate every customer-facing field from the exact card the operator
 * approved. Mailman's Gmail call is execution intent, not content authority.
 */
export function buildHostApprovedEmailExecution(
  action: EmailSendActionRow,
  cardText: string,
  request: GmailIpcPayload,
): ApprovedEmailExecutionResult {
  if (!action.actionId) {
    return {
      ok: false,
      code: 'approved_action_identity_missing',
      reason: 'the durable approval has no Action-ID',
    };
  }
  if (request.type !== 'gmail_send' && request.type !== 'gmail_reply') {
    return {
      ok: false,
      code: 'approved_action_tool_invalid',
      reason: 'the approved action did not request a Gmail send operation',
    };
  }
  const approved = buildApprovedHandoff(cardText, {
    actionId: action.actionId,
    sourceGroup: action.groupFolder,
  });
  if (!approved) {
    return {
      ok: false,
      code: 'approved_card_unparseable',
      reason: 'the exact approved Slack card cannot be parsed',
    };
  }
  const approvedContentSha256 = hashApprovedEmailContent(
    approved.subject,
    approved.body,
  );
  if (
    !action.approvedContentSha256 ||
    approvedContentSha256 !== action.approvedContentSha256
  ) {
    return {
      ok: false,
      code: 'approved_card_hash_mismatch',
      reason: 'the stored approval hash does not match the exact Slack card',
    };
  }
  if (!action.approvedSubject || approved.subject !== action.approvedSubject) {
    return {
      ok: false,
      code: 'approved_card_subject_mismatch',
      reason: 'the stored approved subject does not match the exact Slack card',
    };
  }
  if (
    !action.recipient ||
    approved.recipient !== action.recipient.toLowerCase()
  ) {
    return {
      ok: false,
      code: 'approved_card_recipient_mismatch',
      reason:
        'the stored approved recipient does not match the exact Slack card',
    };
  }
  if (request.type === 'gmail_reply' && !action.gmailThreadId) {
    return {
      ok: false,
      code: 'approved_reply_thread_missing',
      reason: 'the approved reply has no durable Gmail thread',
    };
  }

  const payload: GmailIpcPayload = {
    ...request,
    actionId: action.actionId,
    body: approved.body,
    approvedRecipient: approved.recipient,
    emailType:
      approved.emailType === 'follow-up'
        ? 'follow-up'
        : request.type === 'gmail_reply'
          ? 'reply'
          : 'initial',
    markdown: true,
  };
  delete payload.cc;
  delete payload.html;
  delete payload.leadId;

  if (request.type === 'gmail_send') {
    payload.to = approved.recipient;
    payload.subject = approved.subject;
    if (action.gmailThreadId) payload.threadId = action.gmailThreadId;
    else delete payload.threadId;
  } else {
    payload.threadId = action.gmailThreadId;
    // gmail_reply derives the wire subject from Gmail, but the content guard
    // still needs to inspect the operator-approved subject.
    payload.subject = approved.subject;
    delete payload.to;
  }

  const correctedFields = [
    changed(request.actionId, payload.actionId) && 'action_id',
    changed(request.body, payload.body) && 'body',
    changed(request.to, payload.to) && 'recipient',
    changed(request.subject, payload.subject) && 'subject',
    changed(request.threadId, payload.threadId) && 'thread_id',
    changed(request.cc, payload.cc) && 'cc',
    changed(request.html, payload.html) && 'html',
    changed(request.leadId, payload.leadId) && 'lead_id',
    changed(request.emailType, payload.emailType) && 'email_type',
    changed(request.markdown, payload.markdown) && 'markdown',
  ].filter((field): field is string => Boolean(field));

  return {
    ok: true,
    payload,
    approvedContentSha256,
    correctedFields,
  };
}
