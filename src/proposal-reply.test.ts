import { describe, it, expect, vi } from 'vitest';

import {
  parseClassification,
  buildClassifyPrompt,
  pickProposal,
  handleInboundReply,
  type ReplyCandidate,
  type InboundReplyDeps,
} from './proposal-reply.js';

const cand = (over: Partial<ReplyCandidate> = {}): ReplyCandidate => ({
  proposalId: 'p1',
  number: 'tca-001',
  subject: 'Re: Coaching',
  recipientEmail: 'k@x.com',
  partyId: 42,
  threadId: 'thread-1',
  ...over,
});

describe('parseClassification', () => {
  it('parses clean JSON', () => {
    expect(
      parseClassification('{"intent":"declined","proposalId":"p1"}'),
    ).toEqual({ intent: 'declined', proposalId: 'p1' });
  });
  it('handles code-fenced JSON and null proposalId', () => {
    expect(
      parseClassification(
        '```json\n{"intent":"accepted","proposalId":null}\n```',
      ),
    ).toEqual({ intent: 'accepted', proposalId: null });
  });
  it('coerces unknown intent to other', () => {
    expect(parseClassification('{"intent":"maybe"}').intent).toBe('other');
  });
  it('falls back to other on garbage', () => {
    expect(parseClassification('not json')).toEqual({
      intent: 'other',
      proposalId: null,
    });
  });
});

describe('buildClassifyPrompt', () => {
  it('lists candidates, the reply, and the intent labels', () => {
    const p = buildClassifyPrompt('I will not proceed', [cand()]);
    expect(p).toContain('id=p1');
    expect(p).toContain('tca-001');
    expect(p).toContain('I will not proceed');
    expect(p).toContain('declined');
  });
});

describe('pickProposal', () => {
  const a = cand({ proposalId: 'p1', threadId: 't1' });
  const b = cand({ proposalId: 'p2', threadId: 't2' });

  it('prefers a thread-id match', () => {
    expect(
      pickProposal([a, b], 't2', { intent: 'declined', proposalId: 'p1' })
        ?.proposalId,
    ).toBe('p2');
  });
  it('falls back to the model-chosen id', () => {
    expect(
      pickProposal([a, b], undefined, { intent: 'declined', proposalId: 'p2' })
        ?.proposalId,
    ).toBe('p2');
  });
  it('uses the sole candidate when unambiguous', () => {
    expect(
      pickProposal([a], undefined, { intent: 'declined', proposalId: null })
        ?.proposalId,
    ).toBe('p1');
  });
  it('returns null when multiple and no signal', () => {
    expect(
      pickProposal([a, b], undefined, { intent: 'declined', proposalId: null }),
    ).toBeNull();
  });
});

function makeDeps(over: Partial<InboundReplyDeps> = {}): InboundReplyDeps {
  return {
    findCandidates: vi.fn().mockResolvedValue([cand()]),
    classify: vi
      .fn()
      .mockResolvedValue({ intent: 'declined', proposalId: 'p1' }),
    hasOpenAction: vi.fn().mockResolvedValue(false),
    recordDeclineAction: vi.fn().mockResolvedValue(undefined),
    stopFollowups: vi.fn().mockResolvedValue(undefined),
    postCard: vi.fn().mockResolvedValue('card-ts'),
    postNotice: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('handleInboundReply', () => {
  const input = {
    senderEmail: 'k@x.com',
    threadId: 'thread-1',
    body: 'no thanks',
  };

  it('does nothing when the sender has no open proposal', async () => {
    const deps = makeDeps({ findCandidates: vi.fn().mockResolvedValue([]) });
    expect(await handleInboundReply(input, deps)).toBe('none');
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it('passes questions through without acting', async () => {
    const deps = makeDeps({
      classify: vi
        .fn()
        .mockResolvedValue({ intent: 'question', proposalId: null }),
    });
    expect(await handleInboundReply(input, deps)).toBe('none');
    expect(deps.postCard).not.toHaveBeenCalled();
  });

  it('posts a decline card and records the action', async () => {
    const deps = makeDeps();
    expect(await handleInboundReply(input, deps)).toBe('declined-carded');
    expect(deps.postCard).toHaveBeenCalledOnce();
    expect(deps.recordDeclineAction).toHaveBeenCalledOnce();
  });

  it('does not re-card a proposal that already has an action', async () => {
    const deps = makeDeps({ hasOpenAction: vi.fn().mockResolvedValue(true) });
    expect(await handleInboundReply(input, deps)).toBe('already-actioned');
    expect(deps.postCard).not.toHaveBeenCalled();
  });

  it('stops follow-ups and notifies on an acceptance', async () => {
    const deps = makeDeps({
      classify: vi
        .fn()
        .mockResolvedValue({ intent: 'accepted', proposalId: 'p1' }),
    });
    expect(await handleInboundReply(input, deps)).toBe('accepted');
    expect(deps.stopFollowups).toHaveBeenCalledOnce();
    expect(deps.postNotice).toHaveBeenCalledOnce();
    expect(deps.postCard).not.toHaveBeenCalled();
  });

  it('flags ambiguity when multiple proposals and no thread/model match', async () => {
    const deps = makeDeps({
      findCandidates: vi
        .fn()
        .mockResolvedValue([
          cand({ proposalId: 'p1', threadId: 'tA' }),
          cand({ proposalId: 'p2', threadId: 'tB' }),
        ]),
      classify: vi
        .fn()
        .mockResolvedValue({ intent: 'declined', proposalId: null }),
    });
    const r = await handleInboundReply(
      { senderEmail: 'k@x.com', body: 'no' },
      deps,
    );
    expect(r).toBe('ambiguous');
    expect(deps.postNotice).toHaveBeenCalledOnce();
    expect(deps.postCard).not.toHaveBeenCalled();
  });
});
