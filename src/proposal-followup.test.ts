import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  runProposalFollowup,
  handleProposalApproval,
  handleProposalRejection,
  buildDraftMessage,
  buildCloseoutMessage,
  dueToRun,
  proposalFollowupTick,
  __resetTickState,
  type FollowupState,
  type FollowupStore,
  type ProposalFollowupDeps,
} from './proposal-followup.js';
import { CADENCE } from './proposal-followup-cadence.js';

const EMPTY_STATE: FollowupState = {
  lastSentSequence: 0,
  firstFollowupAt: null,
  lastSentAt: null,
  hasPendingApproval: false,
  closedOut: false,
  existingSequences: new Set<number>(),
};

function fakeStore(
  state: FollowupState = EMPTY_STATE,
): FollowupStore & { drafts: unknown[]; closeouts: string[] } {
  const drafts: unknown[] = [];
  const closeouts: string[] = [];
  return {
    drafts,
    closeouts,
    async getState() {
      return state;
    },
    async recordDraft(d) {
      drafts.push(d);
    },
    async recordCloseout(id) {
      closeouts.push(id);
    },
    async expireStale() {
      return 3;
    },
  };
}

function makeProposal(over: Record<string, unknown> = {}) {
  return {
    id: 'pid1',
    number: 'tca-001-prop',
    title: 'Coaching',
    pendingAt: new Date(2026, 2, 9), // March backlog → touch 1 due
    clientId: 'client1',
    ...over,
  };
}

function makeDeps(
  over: Partial<ProposalFollowupDeps> = {},
): ProposalFollowupDeps {
  return {
    listOpenProposals: vi.fn().mockResolvedValue([makeProposal()]),
    resolveRecipient: vi
      .fn()
      .mockResolvedValue({
        email: 'k@x.com',
        firstName: 'Katie',
        lastName: 'D',
      }),
    generateEmail: vi
      .fn()
      .mockResolvedValue({ subject: 'Re: proposal', body: 'Hi Katie' }),
    resolvePartyId: vi.fn().mockResolvedValue(42),
    postDraft: vi.fn().mockResolvedValue('ts-1'),
    postNotice: vi.fn().mockResolvedValue(undefined),
    store: fakeStore(),
    maxPerRun: 8,
    expireDays: 7,
    now: () => new Date(2026, 5, 17),
    ...over,
  };
}

describe('runProposalFollowup', () => {
  it('drafts a due touch and records it', async () => {
    const deps = makeDeps();
    const r = await runProposalFollowup(deps);
    expect(r).toMatchObject({
      scanned: 1,
      drafted: 1,
      skipped: 0,
      expired: 3,
      cancelled: 0,
    });
    expect((deps.store as ReturnType<typeof fakeStore>).drafts).toHaveLength(1);
    expect(deps.postDraft).toHaveBeenCalledOnce();
  });

  it('auto-cancels a cold proposal a week after the breakup', async () => {
    const store = fakeStore({
      ...EMPTY_STATE,
      lastSentSequence: 4,
      firstFollowupAt: new Date(2026, 5, 1),
      lastSentAt: new Date(2026, 5, 8), // breakup sent; now is 06-17 (>5 biz days)
    });
    const deps = makeDeps({ store });
    const r = await runProposalFollowup(deps);
    expect(r.cancelled).toBe(1);
    expect(r.drafted).toBe(0);
    expect(store.closeouts).toEqual(['pid1']);
    expect(deps.postNotice).toHaveBeenCalledOnce();
    expect(deps.postDraft).not.toHaveBeenCalled();
  });

  it('does not re-cancel an already closed-out proposal', async () => {
    const store = fakeStore({
      ...EMPTY_STATE,
      lastSentSequence: 4,
      lastSentAt: new Date(2026, 5, 8),
      closedOut: true,
    });
    const deps = makeDeps({ store });
    const r = await runProposalFollowup(deps);
    expect(r.cancelled).toBe(0);
    expect(store.closeouts).toEqual([]);
  });

  it('caps drafts at maxPerRun', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeProposal({ id: `pid${i}`, number: `tca-00${i}` }),
    );
    const deps = makeDeps({
      listOpenProposals: vi.fn().mockResolvedValue(many),
      maxPerRun: 2,
    });
    const r = await runProposalFollowup(deps);
    expect(r.drafted).toBe(2);
  });

  it('skips when the recipient has no email', async () => {
    const deps = makeDeps({
      resolveRecipient: vi.fn().mockResolvedValue(null),
    });
    const r = await runProposalFollowup(deps);
    expect(r.drafted).toBe(0);
    expect(r.skipped).toBe(1);
    expect(deps.generateEmail).not.toHaveBeenCalled();
  });

  it('does not draft when a touch awaits approval', async () => {
    const deps = makeDeps({
      store: fakeStore({ ...EMPTY_STATE, hasPendingApproval: true }),
    });
    const r = await runProposalFollowup(deps);
    expect(r.drafted).toBe(0);
  });

  it('does not re-draft a sequence that already has a row', async () => {
    const deps = makeDeps({
      store: fakeStore({
        ...EMPTY_STATE,
        existingSequences: new Set([1]),
      }),
    });
    const r = await runProposalFollowup(deps);
    expect(r.drafted).toBe(0);
  });

  it('counts a draft as skipped when Slack returns no ts', async () => {
    const deps = makeDeps({ postDraft: vi.fn().mockResolvedValue(undefined) });
    const r = await runProposalFollowup(deps);
    expect(r.drafted).toBe(0);
    expect(r.skipped).toBe(1);
  });
});

describe('buildDraftMessage', () => {
  it('shows recipient, subject, body, link, and the approval hint', () => {
    const msg = buildDraftMessage(
      makeProposal(),
      { email: 'k@x.com', firstName: 'Katie', lastName: 'D' },
      CADENCE[0],
      { subject: 'Re: proposal', body: 'Hi Katie' },
      'https://example.com/p/abc',
    );
    expect(msg).toContain('Katie D <k@x.com>');
    expect(msg).toContain('Re: proposal');
    expect(msg).toContain('https://example.com/p/abc');
    expect(msg).toContain('React ✅ to send');
    expect(msg).toContain('#1 — reminder');
  });
});

describe('buildCloseoutMessage', () => {
  it('names the proposal and links the Plutio edit page', () => {
    const msg = buildCloseoutMessage(makeProposal({ id: 'abc' }));
    expect(msg).toContain('went cold');
    expect(msg).toContain('cancelled');
    expect(msg).toContain(
      'https://business.tandemcoaching.academy/proposals/abc/edit',
    );
  });
});

describe('handleProposalApproval', () => {
  const pending = {
    id: 7,
    proposalId: 'pid1',
    sequence: 1,
    recipientEmail: 'k@x.com',
    subject: 'S',
    body: 'B',
    partyId: 42,
    threadId: null,
  };

  it('ignores a ts that is not a proposal draft', async () => {
    const deps = {
      getPendingByTs: vi.fn().mockResolvedValue(null),
      sendEmail: vi.fn(),
      markSent: vi.fn(),
      postThread: vi.fn(),
    };
    const claimed = await handleProposalApproval('ts-x', 'Alex', deps);
    expect(claimed).toBe(false);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('sends, marks sent, and confirms on success', async () => {
    const deps = {
      getPendingByTs: vi.fn().mockResolvedValue(pending),
      sendEmail: vi.fn().mockResolvedValue({ messageId: 'm1', threadId: 't1' }),
      markSent: vi.fn().mockResolvedValue(undefined),
      postThread: vi.fn().mockResolvedValue(undefined),
    };
    const claimed = await handleProposalApproval('ts-1', 'Alex', deps);
    expect(claimed).toBe(true);
    expect(deps.sendEmail).toHaveBeenCalledWith(pending);
    expect(deps.markSent).toHaveBeenCalledWith(7, 'm1');
    expect(deps.postThread.mock.calls[0][1]).toContain('Sent to k@x.com');
  });

  it('claims the message but reports failure when sending throws', async () => {
    const deps = {
      getPendingByTs: vi.fn().mockResolvedValue(pending),
      sendEmail: vi.fn().mockRejectedValue(new Error('smtp down')),
      markSent: vi.fn(),
      postThread: vi.fn().mockResolvedValue(undefined),
    };
    const claimed = await handleProposalApproval('ts-1', 'Alex', deps);
    expect(claimed).toBe(true);
    expect(deps.markSent).not.toHaveBeenCalled();
    expect(deps.postThread.mock.calls[0][1]).toContain('Send failed');
  });
});

describe('handleProposalRejection', () => {
  const pending = {
    id: 7,
    proposalId: 'pid1',
    sequence: 1,
    recipientEmail: 'k@x.com',
    subject: 'S',
    body: 'B',
    partyId: 42,
    threadId: null,
  };

  it('ignores a ts that is not a proposal draft', async () => {
    const deps = {
      getPendingByTs: vi.fn().mockResolvedValue(null),
      markCancelled: vi.fn(),
      postThread: vi.fn(),
    };
    expect(await handleProposalRejection('ts-x', 'Alex', deps)).toBe(false);
    expect(deps.markCancelled).not.toHaveBeenCalled();
  });

  it('cancels the draft and confirms the skip', async () => {
    const deps = {
      getPendingByTs: vi.fn().mockResolvedValue(pending),
      markCancelled: vi.fn().mockResolvedValue(undefined),
      postThread: vi.fn().mockResolvedValue(undefined),
    };
    expect(await handleProposalRejection('ts-1', 'Alex', deps)).toBe(true);
    expect(deps.markCancelled).toHaveBeenCalledWith(7);
    expect(deps.postThread.mock.calls[0][1]).toContain('Skipped by Alex');
  });
});

describe('dueToRun + tick', () => {
  beforeEach(() => __resetTickState());

  it('is due at/after the target hour, once per day', () => {
    expect(dueToRun(new Date(2026, 5, 17, 8), 9, null)).toBe(false);
    expect(dueToRun(new Date(2026, 5, 17, 9), 9, null)).toBe(true);
    expect(dueToRun(new Date(2026, 5, 17, 14), 9, '2026-6-17')).toBe(false);
  });

  it('runs the pass once and then suppresses same-day repeats', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      listOpenProposals: list,
      now: () => new Date(2026, 5, 17, 9, 30),
    });
    await proposalFollowupTick(deps, 9);
    await proposalFollowupTick(deps, 9);
    expect(list).toHaveBeenCalledOnce();
  });
});
