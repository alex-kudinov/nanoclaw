import { describe, it, expect } from 'vitest';

import { payloadIsForThisContainer } from './ipc-input-filter.js';

describe('payloadIsForThisContainer', () => {
  it('consumes a payload addressed to this container', () => {
    expect(payloadIsForThisContainer('nanoclaw-sales-42', 'nanoclaw-sales-42')).toBe(
      true,
    );
  });

  it('LEAVES a payload addressed to a sibling container (the 2026-07-21 theft)', () => {
    // Root container must NOT drain a message addressed to the thread container.
    expect(
      payloadIsForThisContainer('nanoclaw-sales-thread', 'nanoclaw-sales-root'),
    ).toBe(false);
  });

  it('consumes an untargeted payload (legacy / rolling deploy)', () => {
    expect(payloadIsForThisContainer(undefined, 'nanoclaw-sales-42')).toBe(true);
    expect(payloadIsForThisContainer('', 'nanoclaw-sales-42')).toBe(true);
  });

  it('consumes when this runner has no identity (single-runner fallback)', () => {
    // No CONTAINER_NAME → cannot prove ownership → behave as pre-targeting.
    expect(payloadIsForThisContainer('nanoclaw-sales-42', '')).toBe(true);
  });
});
