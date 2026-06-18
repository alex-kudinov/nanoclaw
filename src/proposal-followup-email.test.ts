import { describe, it, expect, vi } from 'vitest';

import {
  buildEmailPrompt,
  parseEmailResponse,
  generateFollowupEmail,
} from './proposal-followup-email.js';
import { CADENCE } from './proposal-followup-cadence.js';

const ctx = {
  firstName: 'Katie',
  touch: CADENCE[0],
  proposalTitle: '6-session executive coaching',
  proposalUrl: 'https://business.tandemcoaching.academy/p/proposal/abc123',
  sender: 'Alex',
};

describe('buildEmailPrompt', () => {
  it('includes the name, exact URL, sender, and touch angle', () => {
    const p = buildEmailPrompt(ctx);
    expect(p).toContain('Katie');
    expect(p).toContain(ctx.proposalUrl);
    expect(p).toContain('Alex');
    expect(p).toContain(CADENCE[0].angle);
  });

  it('warns against AI-tell phrases', () => {
    expect(buildEmailPrompt(ctx)).toContain('just circling back');
  });

  it('adds breakup-specific guidance only on touch 4', () => {
    expect(buildEmailPrompt({ ...ctx, touch: CADENCE[3] })).toContain(
      'final email',
    );
    expect(buildEmailPrompt(ctx)).not.toContain('final email');
  });
});

describe('parseEmailResponse', () => {
  it('parses clean JSON', () => {
    const out = parseEmailResponse(
      '{"subject":"Re: Your proposal","body":"Hi Katie,\\nLink here.\\n— Alex"}',
    );
    expect(out.subject).toBe('Re: Your proposal');
    expect(out.body).toContain('Hi Katie');
  });

  it('parses JSON wrapped in prose or a code fence', () => {
    const raw =
      'Here you go:\n```json\n{"subject":"S","body":"B"}\n```\nthanks';
    const out = parseEmailResponse(raw);
    expect(out.subject).toBe('S');
    expect(out.body).toBe('B');
  });

  it('uses the default subject when none is provided', () => {
    const out = parseEmailResponse('{"body":"just a body"}');
    expect(out.subject).toBe('Re: Your Tandem Coaching proposal');
    expect(out.body).toBe('just a body');
  });

  it('falls back to raw text as the body on non-JSON', () => {
    const out = parseEmailResponse('Hi Katie, here is the link.');
    expect(out.body).toBe('Hi Katie, here is the link.');
    expect(out.subject).toBe('Re: Your Tandem Coaching proposal');
  });
});

describe('generateFollowupEmail', () => {
  it('calls the bridge with the sonnet model and parses the result', async () => {
    const print = vi
      .fn()
      .mockResolvedValue('{"subject":"Re: proposal","body":"Hi Katie,\\n..."}');
    const out = await generateFollowupEmail(ctx, print);
    expect(out.subject).toBe('Re: proposal');
    expect(print).toHaveBeenCalledOnce();
    expect(print.mock.calls[0][0].model).toBe('sonnet');
  });
});
