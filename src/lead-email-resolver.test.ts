import { describe, expect, it, vi } from 'vitest';

import { makeLeadEmailResolver } from './lead-email-resolver.js';

describe('makeLeadEmailResolver', () => {
  it('returns the looked-up email', async () => {
    const resolve = makeLeadEmailResolver(async () => 'lead@example.com');
    expect(await resolve(611)).toBe('lead@example.com');
  });

  it('caches a hit so repeated status lines cost one query', async () => {
    const lookup = vi.fn(async () => 'lead@example.com');
    const resolve = makeLeadEmailResolver(lookup);

    await resolve(611);
    await resolve(611);
    await resolve(611);

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  // An entry that no longer exists would otherwise re-query on every repeat.
  it('caches a miss', async () => {
    const lookup = vi.fn(async () => undefined);
    const resolve = makeLeadEmailResolver(lookup);

    expect(await resolve(999)).toBe(undefined);
    expect(await resolve(999)).toBe(undefined);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('keys the cache per entry id', async () => {
    const lookup = vi.fn(async (id: number) => `lead${id}@example.com`);
    const resolve = makeLeadEmailResolver(lookup);

    expect(await resolve(1)).toBe('lead1@example.com');
    expect(await resolve(2)).toBe('lead2@example.com');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  // Threading is presentation; it must never break delivery of the message.
  it('resolves undefined when the lookup throws', async () => {
    const resolve = makeLeadEmailResolver(async () => {
      throw new Error('connection terminated unexpectedly');
    });
    expect(await resolve(611)).toBe(undefined);
  });

  it('retries after a transient failure rather than caching it', async () => {
    const lookup = vi
      .fn<(id: number) => Promise<string | undefined>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('lead@example.com');
    const resolve = makeLeadEmailResolver(lookup);

    expect(await resolve(611)).toBe(undefined);
    expect(await resolve(611)).toBe('lead@example.com');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('lowercases the resolved address so keys match the address-derived ones', async () => {
    const resolve = makeLeadEmailResolver(async () => 'Lead@Example.COM');
    // The resolver passes through; slack.ts lowercases when building the key.
    expect((await resolve(611))?.toLowerCase()).toBe('lead@example.com');
  });
});
