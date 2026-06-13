import { describe, it, expect } from 'vitest';
import { detectRateLimit, detectAuthFailure } from './rate-limit.js';

describe('detectRateLimit', () => {
  it('matches the weekly-limit message Claude Code emits to stdout', () => {
    expect(
      detectRateLimit("You've hit your limit · resets May 2, 5am (America/Chicago)"),
    ).toBe(true);
  });

  it('matches the 5-hour-window variant with "at <time>"', () => {
    expect(detectRateLimit("You've hit your usage limit. Resets at 5pm.")).toBe(true);
  });

  it('matches generic SDK-style rate-limit phrasing', () => {
    expect(detectRateLimit('Error: rate limit exceeded')).toBe(true);
    expect(detectRateLimit('429 Too Many Requests')).toBe(true);
    expect(detectRateLimit('overloaded_error')).toBe(true);
    expect(detectRateLimit('HTTP 529 from upstream')).toBe(true);
  });

  it('matches case variants of the apostrophe form Claude emits', () => {
    expect(detectRateLimit("youve hit your limit, please wait")).toBe(true);
    expect(detectRateLimit("YOU'VE HIT YOUR LIMIT")).toBe(true);
  });

  it('does not match agent replies that mention the word "limit" in normal text', () => {
    expect(detectRateLimit('The credit limit on the account is $5,000.')).toBe(false);
    expect(detectRateLimit('There is no time limit on this offer.')).toBe(false);
  });

  it('does not match a benign reply that includes a time but no limit phrasing', () => {
    expect(detectRateLimit('The meeting starts at 3pm.')).toBe(false);
  });

  it('handles null / undefined / empty without throwing', () => {
    expect(detectRateLimit(null)).toBe(false);
    expect(detectRateLimit(undefined)).toBe(false);
    expect(detectRateLimit('')).toBe(false);
  });

  it('matches "resets <Mon> <day>" weekly-window phrasing case-insensitively', () => {
    expect(detectRateLimit('Resets May 2, 5am')).toBe(true);
    expect(detectRateLimit('resets sat 5am')).toBe(true);
  });
});

describe('detectAuthFailure', () => {
  it('matches API auth-rejection error types', () => {
    expect(detectAuthFailure('{"type":"authentication_error"}')).toBe(true);
    expect(detectAuthFailure('401 Unauthorized')).toBe(true);
    expect(detectAuthFailure('Invalid API key provided')).toBe(true);
    expect(detectAuthFailure('Invalid bearer token')).toBe(true);
    expect(detectAuthFailure('Not logged in')).toBe(true);
    expect(detectAuthFailure('OAuth authentication is currently not supported')).toBe(true);
  });

  it('matches credit / billing exhaustion (the post-2026-06-15 signal)', () => {
    expect(detectAuthFailure('{"type":"billing_error"}')).toBe(true);
    expect(detectAuthFailure('402 Payment Required')).toBe(true);
    expect(detectAuthFailure('Your credit balance is insufficient to run this request')).toBe(true);
    expect(detectAuthFailure('The Agent SDK credit pool is exhausted')).toBe(true);
  });

  it('matches permission revocation', () => {
    expect(detectAuthFailure('{"type":"permission_error"}')).toBe(true);
    expect(detectAuthFailure('Your API key does not have permission for this model')).toBe(true);
  });

  it('does not match bare numbers in a normal successful reply', () => {
    expect(detectAuthFailure('The 401(k) contribution limit is $23,000 for 2026.')).toBe(false);
    expect(detectAuthFailure('Invoice #402 was paid; the balance is now zero.')).toBe(false);
    expect(detectAuthFailure('Permission to proceed was granted by the manager.')).toBe(false);
  });

  it('does not match a plain rate-limit message', () => {
    expect(detectAuthFailure("You've hit your usage limit. Resets at 5pm.")).toBe(false);
  });

  it('handles null / undefined / empty without throwing', () => {
    expect(detectAuthFailure(null)).toBe(false);
    expect(detectAuthFailure(undefined)).toBe(false);
    expect(detectAuthFailure('')).toBe(false);
  });
});
