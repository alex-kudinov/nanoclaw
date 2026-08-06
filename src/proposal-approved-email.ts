import type { EmailSendActionRow } from './db.js';
import type {
  EmailSendFailure,
  EmailSendReceipt,
  GmailIpcPayload,
} from './gmail-ipc-handlers.js';
import type { PendingDraft } from './proposal-followup.js';
import { hashApprovedEmailContent, newEmailActionId } from './email-action.js';

export interface ProposalApprovedEmailDeps {
  recordAction(row: {
    actionId: string;
    draftTs: string;
    groupFolder: string;
    chatJid: string;
    threadTs: string;
    gmailThreadId?: string;
    recipient: string;
    leadRef: string;
    approvedSubject: string;
    approvedContentSha256: string;
    approvedAt: string;
  }): EmailSendActionRow;
  claimAction(
    actionId: string,
    approvedContentSha256: string,
    recipient: string,
    startedAt: string,
  ):
    | { status: 'claimed'; action: EmailSendActionRow }
    | { status: 'confirmed'; action: EmailSendActionRow }
    | { status: 'held'; action?: EmailSendActionRow; reason: string };
  confirmAction(
    actionId: string,
    recipient: string,
    messageId: string,
    threadId: string,
    completedAt: string,
  ): number;
  failAction(
    actionId: string,
    state: 'blocked' | 'uncertain',
    code: string,
    occurredAt: string,
  ): number;
  send(
    payload: GmailIpcPayload,
    onConfirmed: (receipt: EmailSendReceipt) => void | Promise<void>,
    onFailed: (failure: EmailSendFailure) => void | Promise<void>,
  ): Promise<void>;
  /** Global customer-send test routing. Any non-empty value blocks approval execution. */
  testRecipient?: string;
  now?: () => Date;
  newActionId?: () => string;
}

/**
 * Execute one host-generated proposal follow-up through the same durable,
 * one-time action boundary as Mailman sends. The PostgreSQL draft row is the
 * exact source that rendered the approved Slack card; no model supplies bytes.
 */
export async function executeProposalApprovedEmail(
  slackTs: string,
  chatJid: string,
  draft: PendingDraft,
  deps: ProposalApprovedEmailDeps,
): Promise<{ messageId: string; threadId: string }> {
  const now = deps.now ?? (() => new Date());
  const approvedContentSha256 = hashApprovedEmailContent(
    draft.subject,
    draft.body,
  );
  const stored = deps.recordAction({
    actionId: (deps.newActionId ?? newEmailActionId)(),
    draftTs: slackTs,
    groupFolder: 'sales',
    chatJid,
    threadTs: slackTs,
    ...(draft.threadId ? { gmailThreadId: draft.threadId } : {}),
    recipient: draft.recipientEmail.toLowerCase(),
    leadRef: `Proposal ${draft.proposalId} follow-up #${draft.sequence}`,
    approvedSubject: draft.subject,
    approvedContentSha256,
    approvedAt: now().toISOString(),
  });
  if (!stored.actionId) {
    throw new Error('proposal email action has no durable Action-ID');
  }
  if (deps.testRecipient) {
    deps.failAction(
      stored.actionId,
      'blocked',
      'global_test_routing_active',
      now().toISOString(),
    );
    throw new Error(
      'proposal email blocked because global Gmail test routing is active',
    );
  }

  const claim = deps.claimAction(
    stored.actionId,
    approvedContentSha256,
    draft.recipientEmail,
    now().toISOString(),
  );
  if (claim.status === 'confirmed') {
    if (!claim.action.gmailMessageId || !claim.action.gmailResultThreadId) {
      throw new Error('confirmed proposal email action has no Gmail receipt');
    }
    return {
      messageId: claim.action.gmailMessageId,
      threadId: claim.action.gmailResultThreadId,
    };
  }
  if (claim.status === 'held') {
    throw new Error(`proposal email action held: ${claim.reason}`);
  }

  let receipt: EmailSendReceipt | undefined;
  let terminalFailure: EmailSendFailure | undefined;
  try {
    await deps.send(
      {
        type: 'gmail_send',
        groupFolder: 'sales',
        timestamp: now().toISOString(),
        actionId: stored.actionId,
        to: draft.recipientEmail.toLowerCase(),
        approvedRecipient: draft.recipientEmail.toLowerCase(),
        subject: draft.subject,
        body: draft.body,
        ...(draft.threadId ? { threadId: draft.threadId } : {}),
        markdown: true,
        emailType: 'follow-up',
      },
      (confirmed) => {
        receipt = confirmed;
        const committed = deps.confirmAction(
          stored.actionId!,
          draft.recipientEmail.toLowerCase(),
          confirmed.messageId,
          confirmed.threadId,
          now().toISOString(),
        );
        if (committed !== 1) {
          deps.failAction(
            stored.actionId!,
            'uncertain',
            'proposal_gmail_receipt_commit_failed',
            now().toISOString(),
          );
        }
      },
      (failure) => {
        terminalFailure = failure;
        deps.failAction(
          stored.actionId!,
          'blocked',
          `proposal_${failure.code}`,
          now().toISOString(),
        );
      },
    );
  } catch (err) {
    // A receipt means Gmail accepted the message even if a downstream
    // interaction-log write failed. Return it so the proposal row becomes sent
    // and a human retry cannot duplicate the customer email.
    if (receipt) {
      return { messageId: receipt.messageId, threadId: receipt.threadId };
    }
    if (!terminalFailure) {
      deps.failAction(
        stored.actionId,
        'uncertain',
        'proposal_gmail_boundary_error',
        now().toISOString(),
      );
    }
    throw err;
  }

  if (!receipt) {
    if (!terminalFailure) {
      deps.failAction(
        stored.actionId,
        'uncertain',
        'proposal_gmail_receipt_missing',
        now().toISOString(),
      );
    }
    throw new Error(
      terminalFailure
        ? `proposal email blocked by ${terminalFailure.code}`
        : 'proposal email returned without a Gmail receipt',
    );
  }
  return { messageId: receipt.messageId, threadId: receipt.threadId };
}
