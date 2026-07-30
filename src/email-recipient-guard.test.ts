import { describe, it, expect } from 'vitest';

import {
  normalizeRecipient,
  isReservedRecipientDomain,
  recipientIsKnown,
  checkRecipient,
} from './email-recipient-guard.js';

describe('normalizeRecipient', () => {
  it('strips display name and lowercases', () => {
    expect(normalizeRecipient('Tina Coach <EQCoach.Tina@Gmail.com>')).toBe(
      'eqcoach.tina@gmail.com',
    );
  });
  it('passes through a bare address', () => {
    expect(normalizeRecipient('  Bob@Example.org ')).toBe('bob@example.org');
  });
});

describe('isReservedRecipientDomain', () => {
  it('flags RFC-2606 reserved second-level domains', () => {
    expect(isReservedRecipientDomain('tina@example.com')).toBe(true);
    expect(isReservedRecipientDomain('x@example.net')).toBe(true);
    expect(isReservedRecipientDomain('x@example.org')).toBe(true);
  });
  it('flags reserved TLDs', () => {
    expect(isReservedRecipientDomain('a@foo.test')).toBe(true);
    expect(isReservedRecipientDomain('a@bar.invalid')).toBe(true);
    expect(isReservedRecipientDomain('a@host.localhost')).toBe(true);
  });
  it('does NOT flag real domains (zero false positives)', () => {
    expect(isReservedRecipientDomain('eqcoach.tina@gmail.com')).toBe(false);
    expect(isReservedRecipientDomain('a@test.com')).toBe(false); // real registered domain
    expect(isReservedRecipientDomain('a@examples.com')).toBe(false);
    expect(isReservedRecipientDomain('a@notexample.com')).toBe(false);
  });
  it('honors display-name wrapping', () => {
    expect(isReservedRecipientDomain('Tina <tina@example.com>')).toBe(true);
  });
});

describe('recipientIsKnown', () => {
  const known = new Set(['eqcoach.tina@gmail.com']);
  it('matches case-insensitively and through a display name', () => {
    expect(recipientIsKnown('EQCoach.Tina@gmail.com', known)).toBe(true);
    expect(recipientIsKnown('Tina <eqcoach.tina@gmail.com>', known)).toBe(true);
  });
  it('rejects an unknown address', () => {
    expect(recipientIsKnown('tina@example.com', known)).toBe(false);
  });
});

describe('checkRecipient', () => {
  it('rejects the exact incident: fabricated placeholder', () => {
    const r = checkRecipient(
      'tina@example.com',
      new Set(['eqcoach.tina@gmail.com']),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reserved|placeholder/);
  });

  it('rejects a real-looking address not in the party set', () => {
    const r = checkRecipient(
      'tina@gmial.com', // typo-squat, deliverable domain, but not the party's
      new Set(['eqcoach.tina@gmail.com']),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not among/);
  });

  it('allows the party-verified recipient', () => {
    const r = checkRecipient(
      'eqcoach.tina@gmail.com',
      new Set(['eqcoach.tina@gmail.com']),
    );
    expect(r.ok).toBe(true);
  });

  it('fails closed when the host cannot establish party context', () => {
    expect(checkRecipient('someone@gmail.com').ok).toBe(false);
    expect(checkRecipient('someone@gmail.com', new Set()).ok).toBe(false);
    expect(checkRecipient('someone@gmail.com').reason).toMatch(
      /host-verified party/,
    );
  });

  it('rejects malformed input', () => {
    expect(checkRecipient('not-an-email').ok).toBe(false);
    expect(checkRecipient('@nodomain.com').ok).toBe(false);
    expect(checkRecipient('').ok).toBe(false);
  });

  it('still blocks a reserved domain even with no party context', () => {
    expect(checkRecipient('x@example.com').ok).toBe(false);
  });
});
