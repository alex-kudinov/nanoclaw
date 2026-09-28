import { beforeEach, describe, expect, it } from 'vitest';

import {
  _initTestDatabase,
  cancelPendingEmailActions,
  claimEmailActionExecution,
  failEmailAction,
  getPendingSendByActionId,
  holdEmailAction,
  listEmailSendEvents,
  listHostExecutableActions,
  listThreadEmailActions,
  reconcileUncertainEmailActionAsSent,
  recordPendingSend,
  reopenEmailActionForOwnerForce,
} from './db.js';
import { hashApprovedEmailContent } from './email-action.js';

// Owner overrides and host execution on the email action ledger
// (NC-20260927-001).

const A = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
const B = '5b1e3c9a-8d4f-4a2e-9c7b-1f2e3d4c5b6a';
const HASH = hashApprovedEmailContent('Subject', 'Approved body');

function approve(actionId: string, approvedAt: string, threadTs = 'thread-1') {
  return recordPendingSend({
    actionId,
    draftTs: `card-${actionId}`,
    groupFolder: 'sales',
    chatJid: 'slack:sales',
    threadTs,
    recipient: 'lead@example.com',
    approvedSubject: 'Subject',
    approvedContentSha256: HASH,
    approvedAt,
  });
}

beforeEach(() => {
  _initTestDatabase();
});

describe('reopenEmailActionForOwnerForce', () => {
  it('reopens a blocked action and records who forced it and why', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    failEmailAction(
      A,
      'blocked',
      'recipient_guard',
      '2026-09-28T10:01:00.000Z',
    );

    const reopened = reopenEmailActionForOwnerForce(
      A,
      'U07L0AXNLKE',
      'customer is waiting',
      '2026-09-28T10:05:00.000Z',
    );

    expect(reopened).toMatchObject({ state: 'approved' });
    expect(reopened?.lastErrorCode).toBeUndefined();
    expect(listEmailSendEvents(A).at(-1)).toMatchObject({
      stage: 'approved',
      code: 'owner_force',
      actor: 'U07L0AXNLKE',
      detail: 'customer is waiting',
    });
  });

  it('records the force on a still-approved action without changing it', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    const reopened = reopenEmailActionForOwnerForce(
      A,
      'U1',
      'older than the auto-send window',
      '2026-09-28T11:00:00.000Z',
    );
    expect(reopened?.state).toBe('approved');
    expect(listEmailSendEvents(A).at(-1)?.code).toBe('owner_force');
  });

  it('refuses confirmed and executing actions', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    claimEmailActionExecution(
      A,
      HASH,
      'lead@example.com',
      '2026-09-28T10:01:00.000Z',
    );
    expect(
      reopenEmailActionForOwnerForce(
        A,
        'U1',
        'reason text',
        '2026-09-28T10:02:00.000Z',
      ),
    ).toBeUndefined();
    expect(getPendingSendByActionId(A)?.state).toBe('executing');
  });
});

describe('listHostExecutableActions', () => {
  it('returns approved actions past the cancel window and inside the auto-send window', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    approve(B, '2026-09-28T10:00:50.000Z', 'thread-2');
    const due = listHostExecutableActions(
      '2026-09-28T10:00:30.000Z',
      '2026-09-28T09:45:00.000Z',
    );
    expect(due.map((a) => a.actionId)).toEqual([A]);

    const stale = listHostExecutableActions(
      '2026-09-28T10:30:00.000Z',
      '2026-09-28T10:00:10.000Z',
    );
    expect(stale.map((a) => a.actionId)).toEqual([B]);
  });

  it('never returns held, blocked or confirmed actions', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    holdEmailAction(
      A,
      'global_test_routing_active',
      '2026-09-28T10:00:31.000Z',
    );
    expect(
      listHostExecutableActions(
        '2026-09-28T10:01:00.000Z',
        '2026-09-28T09:45:00.000Z',
      ),
    ).toEqual([]);
  });
});

describe('cancelPendingEmailActions', () => {
  it('cancels only unsent actions in the named Slack thread', () => {
    approve(A, '2026-09-28T10:00:00.000Z', 'thread-1');
    approve(B, '2026-09-28T10:00:05.000Z', 'thread-2');

    const cancelled = cancelPendingEmailActions(
      { chatJid: 'slack:sales', threadTs: 'thread-1' },
      'U1',
      '2026-09-28T10:00:10.000Z',
    );

    expect(cancelled).toEqual([A]);
    expect(getPendingSendByActionId(A)).toMatchObject({
      state: 'blocked',
      lastErrorCode: 'operator_cancelled',
    });
    expect(getPendingSendByActionId(B)?.state).toBe('approved');
    expect(listEmailSendEvents(A).at(-1)).toMatchObject({
      code: 'operator_cancelled',
      actor: 'U1',
    });
  });

  it('scopes an agent cancel to recent approvals of that group', () => {
    approve(A, '2026-09-28T09:00:00.000Z', 'thread-1');
    approve(B, '2026-09-28T10:00:00.000Z', 'thread-2');
    const cancelled = cancelPendingEmailActions(
      { groupFolder: 'sales', approvedSince: '2026-09-28T09:59:00.000Z' },
      'sales',
      '2026-09-28T10:00:10.000Z',
    );
    expect(cancelled).toEqual([B]);
  });

  it('cannot cancel an action already at the Gmail boundary', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    claimEmailActionExecution(
      A,
      HASH,
      'lead@example.com',
      '2026-09-28T10:00:31.000Z',
    );
    expect(
      cancelPendingEmailActions(
        { chatJid: 'slack:sales', threadTs: 'thread-1' },
        'U1',
        '2026-09-28T10:00:32.000Z',
      ),
    ).toEqual([]);
  });
});

describe('holdEmailAction', () => {
  it('holds without making the action terminal', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    expect(
      holdEmailAction(
        A,
        'action_safety_global_safe_mode',
        '2026-09-28T10:00:31.000Z',
      ),
    ).toBe(1);
    expect(getPendingSendByActionId(A)).toMatchObject({
      state: 'attention_required',
      lastErrorCode: 'action_safety_global_safe_mode',
    });
    expect(
      reopenEmailActionForOwnerForce(
        A,
        'U1',
        'brake is off now',
        '2026-09-28T11:00:00.000Z',
      )?.state,
    ).toBe('approved');
  });
});

describe('claimEmailActionExecution on a held action', () => {
  it('refuses a safety or test-routing hold until an owner reopens it', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    holdEmailAction(
      A,
      'action_safety_global_safe_mode',
      '2026-09-28T10:00:31.000Z',
    );
    expect(
      claimEmailActionExecution(
        A,
        HASH,
        'lead@example.com',
        '2026-09-28T11:00:00.000Z',
      ),
    ).toMatchObject({
      status: 'held',
      reason: 'action is held for an owner decision',
    });

    reopenEmailActionForOwnerForce(
      A,
      'U1',
      'safety control is off now',
      '2026-09-28T11:01:00.000Z',
    );
    expect(
      claimEmailActionExecution(
        A,
        HASH,
        'lead@example.com',
        '2026-09-28T11:01:01.000Z',
      ).status,
    ).toBe('claimed');
  });

  it('still lets a late send complete after a watchdog alert', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    failEmailAction(
      A,
      'attention_required',
      'send_not_confirmed',
      '2026-09-28T10:06:00.000Z',
    );
    expect(
      claimEmailActionExecution(
        A,
        HASH,
        'lead@example.com',
        '2026-09-28T10:07:00.000Z',
      ).status,
    ).toBe('claimed');
  });
});

describe('reconcileUncertainEmailActionAsSent', () => {
  it('confirms an uncertain action from Gmail Sent evidence', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    failEmailAction(
      A,
      'uncertain',
      'gmail_dispatch_error',
      '2026-09-28T10:01:00.000Z',
    );

    expect(
      reconcileUncertainEmailActionAsSent(
        A,
        'gmail-msg',
        'gmail-thread',
        '2026-09-28T10:05:00.000Z',
        'U1',
      ),
    ).toBe(1);
    expect(getPendingSendByActionId(A)).toMatchObject({
      state: 'confirmed',
      gmailMessageId: 'gmail-msg',
    });
    expect(listEmailSendEvents(A).at(-1)).toMatchObject({
      code: 'reconciled_from_gmail_sent',
      actor: 'U1',
    });
  });

  it('leaves a non-uncertain action alone', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    expect(
      reconcileUncertainEmailActionAsSent(
        A,
        'm',
        't',
        '2026-09-28T10:05:00.000Z',
        'U1',
      ),
    ).toBe(0);
    expect(getPendingSendByActionId(A)?.state).toBe('approved');
  });
});

describe('listThreadEmailActions', () => {
  it('lists a thread newest first', () => {
    approve(A, '2026-09-28T10:00:00.000Z');
    approve(B, '2026-09-28T10:05:00.000Z');
    expect(
      listThreadEmailActions('slack:sales', 'thread-1').map((a) => a.actionId),
    ).toEqual([B, A]);
  });
});
