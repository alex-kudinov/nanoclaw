import { describe, expect, it, vi } from 'vitest';

import {
  executeProposalApprovedEmail,
  type ProposalApprovedEmailDeps,
} from './proposal-approved-email.js';
import { hashApprovedEmailContent } from './email-action.js';
import type { EmailSendActionRow } from './db.js';

const draft = {
  id: 7,
  proposalId: 'proposal-1',
  sequence: 2,
  recipientEmail: 'Lead@Example.co',
  subject: 'Re: Your proposal',
  body: 'Exact approved follow-up.',
  partyId: 42,
  threadId: 'gmail-thread',
};

function action(
  overrides: Partial<EmailSendActionRow> = {},
): EmailSendActionRow {
  return {
    actionId: '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd',
    draftTs: 'slack-ts',
    groupFolder: 'sales',
    chatJid: 'slack:SALES',
    threadTs: 'slack-ts',
    gmailThreadId: 'gmail-thread',
    recipient: 'lead@example.co',
    approvedSubject: draft.subject,
    approvedContentSha256: hashApprovedEmailContent(draft.subject, draft.body),
    approvedAt: '2026-08-04T14:00:00.000Z',
    state: 'approved',
    ...overrides,
  };
}

function deps() {
  const claimAction = vi.fn<ProposalApprovedEmailDeps['claimAction']>(() => ({
    status: 'claimed',
    action: action(),
  }));
  return {
    recordAction: vi.fn(() => action()),
    claimAction,
    confirmAction: vi.fn(() => 1),
    failAction: vi.fn(() => 1),
    send: vi.fn(async (_payload, onConfirmed) => {
      await onConfirmed({
        actionId: action().actionId,
        recipient: 'lead@example.co',
        messageId: 'gmail-message',
        threadId: 'gmail-thread',
      });
    }),
    now: () => new Date('2026-08-04T14:00:00.000Z'),
    newActionId: () => action().actionId!,
  };
}

describe('executeProposalApprovedEmail', () => {
  it('claims, sends exact host bytes, and commits one Gmail receipt', async () => {
    const d = deps();
    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).resolves.toEqual({
      messageId: 'gmail-message',
      threadId: 'gmail-thread',
    });
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: action().actionId,
        to: 'lead@example.co',
        approvedRecipient: 'lead@example.co',
        subject: draft.subject,
        body: draft.body,
        emailType: 'follow-up',
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(d.confirmAction).toHaveBeenCalledOnce();
  });

  it('returns the prior receipt without sending on a repeated approval', async () => {
    const d = deps();
    d.claimAction.mockReturnValue({
      status: 'confirmed',
      action: action({
        state: 'confirmed',
        gmailMessageId: 'already-sent',
        gmailResultThreadId: 'already-thread',
      }),
    });
    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).resolves.toEqual({
      messageId: 'already-sent',
      threadId: 'already-thread',
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('marks a pre-receipt Gmail exception uncertain and refuses retry', async () => {
    const d = deps();
    d.send.mockRejectedValue(new Error('boundary lost'));
    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).rejects.toThrow('boundary lost');
    expect(d.failAction).toHaveBeenCalledWith(
      action().actionId,
      'uncertain',
      'proposal_gmail_boundary_error',
      expect.any(String),
    );
  });

  it('blocks before claim or Gmail when global test routing is active', async () => {
    const d = { ...deps(), testRecipient: 'internal-canary@example.co' };

    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).rejects.toThrow('global Gmail test routing is active');
    expect(d.claimAction).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.failAction).toHaveBeenCalledWith(
      action().actionId,
      'blocked',
      'global_test_routing_active',
      expect.any(String),
    );
  });

  it('returns a Gmail receipt even when downstream logging throws', async () => {
    const d = deps();
    d.send.mockImplementation(async (_payload, onConfirmed) => {
      await onConfirmed({
        actionId: action().actionId,
        recipient: 'lead@example.co',
        messageId: 'accepted',
        threadId: 'accepted-thread',
      });
      throw new Error('interaction log failed');
    });
    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).resolves.toEqual({ messageId: 'accepted', threadId: 'accepted-thread' });
  });

  it('marks a receipt-commit failure uncertain but still prevents a resend', async () => {
    const d = deps();
    d.confirmAction.mockReturnValue(0);

    await expect(
      executeProposalApprovedEmail('slack-ts', 'slack:SALES', draft, d),
    ).resolves.toEqual({
      messageId: 'gmail-message',
      threadId: 'gmail-thread',
    });
    expect(d.failAction).toHaveBeenCalledWith(
      action().actionId,
      'uncertain',
      'proposal_gmail_receipt_commit_failed',
      expect.any(String),
    );
  });
});
