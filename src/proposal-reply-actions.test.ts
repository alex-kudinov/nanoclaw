import { describe, it, expect, vi } from 'vitest';

import {
  handleDeclineApproval,
  handleDeclineDismissal,
  type DeclineActionDeps,
} from './proposal-reply-actions.js';

const action = {
  id: 9,
  proposalId: 'p1',
  proposalNumber: 'tca-001',
  recipientEmail: 'k@x.com',
  partyId: 42,
};

function makeDeps(over: Partial<DeclineActionDeps> = {}): DeclineActionDeps {
  return {
    getActionByTs: vi.fn().mockResolvedValue(action),
    setDeclined: vi.fn().mockResolvedValue(true),
    stopFollowups: vi.fn().mockResolvedValue(undefined),
    markActionDone: vi.fn().mockResolvedValue(undefined),
    markActionDismissed: vi.fn().mockResolvedValue(undefined),
    postThread: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('handleDeclineApproval', () => {
  it('ignores a ts that is not a decline action', async () => {
    const deps = makeDeps({ getActionByTs: vi.fn().mockResolvedValue(null) });
    expect(await handleDeclineApproval('ts-x', 'Alex', deps)).toBe(false);
    expect(deps.setDeclined).not.toHaveBeenCalled();
  });

  it('declines in Plutio, stops follow-ups, marks done, confirms', async () => {
    const deps = makeDeps();
    expect(await handleDeclineApproval('ts-1', 'Alex', deps)).toBe(true);
    expect(deps.setDeclined).toHaveBeenCalledWith('p1');
    expect(deps.stopFollowups).toHaveBeenCalledOnce();
    expect(deps.markActionDone).toHaveBeenCalledWith(9);
    expect(vi.mocked(deps.postThread).mock.calls[0][1]).toContain(
      'declined in Plutio',
    );
  });

  it('warns when Plutio status does not confirm but still stops', async () => {
    const deps = makeDeps({ setDeclined: vi.fn().mockResolvedValue(false) });
    await handleDeclineApproval('ts-1', 'Alex', deps);
    expect(deps.stopFollowups).toHaveBeenCalledOnce();
    expect(vi.mocked(deps.postThread).mock.calls[0][1]).toContain(
      'did not confirm',
    );
  });

  it('claims the message and reports failure when Plutio throws', async () => {
    const deps = makeDeps({
      setDeclined: vi.fn().mockRejectedValue(new Error('plutio 500')),
    });
    expect(await handleDeclineApproval('ts-1', 'Alex', deps)).toBe(true);
    expect(deps.markActionDone).not.toHaveBeenCalled();
    expect(vi.mocked(deps.postThread).mock.calls[0][1]).toContain(
      'Decline failed',
    );
  });
});

describe('handleDeclineDismissal', () => {
  it('ignores a non-action ts', async () => {
    const deps = makeDeps({ getActionByTs: vi.fn().mockResolvedValue(null) });
    expect(await handleDeclineDismissal('ts-x', 'Alex', deps)).toBe(false);
  });

  it('dismisses the action and confirms', async () => {
    const deps = makeDeps();
    expect(await handleDeclineDismissal('ts-1', 'Alex', deps)).toBe(true);
    expect(deps.markActionDismissed).toHaveBeenCalledWith(9);
    expect(vi.mocked(deps.postThread).mock.calls[0][1]).toContain(
      'Dismissed by Alex',
    );
  });
});
