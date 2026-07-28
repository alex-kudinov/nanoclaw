import { describe, expect, it } from 'vitest';

import { deriveLeadThreadKey } from './lead-thread-key.js';

const HANDOFF = `[HANDOFF: inbox→sales]
Party ID: 10088
Name: Oana Tue
Email: oana.tue.coach@gmail.com
Thread-ID: 19fa806a54d22c2d
Message: Hi Cherie, I hope you're doing well!`;

const CARD = `[SALES REVIEW] Lead #938
Category: program-info
Email: Oana.Tue.Coach@gmail.com

PROGRAM MATCH:
- Mentor Coach Training: $2,997`;

describe('deriveLeadThreadKey', () => {
  it('keys an inbox→sales handoff on the lead email', () => {
    expect(deriveLeadThreadKey(HANDOFF)).toBe('lead:oana.tue.coach@gmail.com');
  });

  it('keys the sales review card on the same lead', () => {
    expect(deriveLeadThreadKey(CARD)).toBe('lead:oana.tue.coach@gmail.com');
  });

  it('collapses handoff and card onto one anchor', () => {
    expect(deriveLeadThreadKey(HANDOFF)).toBe(deriveLeadThreadKey(CARD));
  });

  it('accepts the ASCII arrow form', () => {
    expect(deriveLeadThreadKey('[HANDOFF: chief->sales]\nEmail: a@b.com')).toBe(
      'lead:a@b.com',
    );
  });

  it('keys a sales→mailman send on the recipient', () => {
    const send = `[HANDOFF: sales→mailman]
To: oana.tue.coach@gmail.com
Subject: Re: questions`;
    expect(deriveLeadThreadKey(send)).toBe('lead:oana.tue.coach@gmail.com');
  });

  it('skips our own addresses and takes the lead', () => {
    const text = `[SALES REVIEW] Lead #1
From: info@tandemcoach.co
To: lead@example.com`;
    expect(deriveLeadThreadKey(text)).toBe('lead:lead@example.com');
  });

  it('skips subdomains of our own domains', () => {
    const text = '[SALES REVIEW]\nFrom: bot@mail.tandemcoaching.academy';
    expect(deriveLeadThreadKey(text)).toBeUndefined();
  });

  it('ignores messages that are not about a lead', () => {
    expect(
      deriveLeadThreadKey('Daily digest\nTo: someone@example.com'),
    ).toBeUndefined();
  });

  it('ignores an address quoted inside the message body', () => {
    const text = `[SALES REVIEW] Lead #2
Email: real.lead@example.com
THEIR REQUEST:
"Please copy my colleague at other.person@example.com"`;
    expect(deriveLeadThreadKey(text)).toBe('lead:real.lead@example.com');
  });

  it('returns undefined for a lead message with no labelled address', () => {
    expect(deriveLeadThreadKey('[SALES REVIEW] Lead #3\nno address')).toBe(
      undefined,
    );
  });

  it('is stable across repeated calls (no regex lastIndex leak)', () => {
    expect(deriveLeadThreadKey(CARD)).toBe(deriveLeadThreadKey(CARD));
  });
});
