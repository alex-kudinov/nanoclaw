import { describe, expect, it } from 'vitest';

import {
  deriveLeadEntryRef,
  deriveLeadThreadKey,
  isInboundSalesHandoff,
  isScheduledSalesWorkItem,
  scheduledSalesWorkMarker,
} from './lead-thread-key.js';

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

describe('isInboundSalesHandoff', () => {
  it('recognizes Unicode and ASCII inbound Sales handoffs', () => {
    expect(isInboundSalesHandoff(HANDOFF)).toBe(true);
    expect(
      isInboundSalesHandoff('[HANDOFF: mailman->sales]\nEntry ID: 938'),
    ).toBe(true);
  });

  it('does not treat a draft or outbound Mailman handoff as a new root', () => {
    expect(isInboundSalesHandoff(CARD)).toBe(false);
    expect(
      isInboundSalesHandoff(
        '[HANDOFF: sales→mailman]\nTo: oana.tue.coach@gmail.com',
      ),
    ).toBe(false);
  });

  it('does not treat a quoted inbound marker as a new handoff', () => {
    expect(
      isInboundSalesHandoff(
        '[SALES REVIEW] Lead #938\nOriginal was [HANDOFF: mailman->sales]',
      ),
    ).toBe(false);
  });
});

describe('isScheduledSalesWorkItem', () => {
  it('recognizes leading follow-up and cold cards', () => {
    expect(isScheduledSalesWorkItem('[FOLLOW-UP #2] Lead #243')).toBe(true);
    expect(isScheduledSalesWorkItem('  [COLD] Lead #243')).toBe(true);
  });

  it('ignores embedded scheduled-card text', () => {
    expect(
      isScheduledSalesWorkItem('[SALES REVIEW]\nPrior: [FOLLOW-UP #2]'),
    ).toBe(false);
  });

  it('normalizes the scheduled cycle marker for revision deduplication', () => {
    expect(scheduledSalesWorkMarker('  [follow-up   #2] Lead #243')).toBe(
      '[FOLLOW-UP #2]',
    );
    expect(scheduledSalesWorkMarker('[COLD] Lead #243')).toBe('[COLD]');
    expect(scheduledSalesWorkMarker('[SALES REVIEW]\n[COLD]')).toBeUndefined();
  });
});

describe('deriveLeadEntryRef', () => {
  // The real mailman→sales handoff for Lead #911 (Monica Dwight,
  // 2026-07-31T18:11Z). It carries no address at all — only ids — so it
  // anchored nothing, opened a fresh channel root, and recorded no anchor.
  const HANDOFF_BY_ID = `[HANDOFF: mailman→sales]
[SOURCE: email-reply]
Entry ID: 911
Party ID: 11054
Lead: Monica (proposal)
Program: ACC Level 1`;

  it('reads a labelled Entry ID field on a lead-bearing handoff', () => {
    expect(deriveLeadEntryRef(HANDOFF_BY_ID)).toBe(911);
  });

  it('does not confuse Party ID with Entry ID', () => {
    expect(deriveLeadEntryRef(HANDOFF_BY_ID)).not.toBe(11054);
  });

  it('anchors that handoff and its sales card on the same lead', () => {
    // The card names the same lead as `Lead #911`; both must resolve to one id.
    expect(
      deriveLeadEntryRef('[SALES REVIEW] Lead #911\nCategory: scheduling'),
    ).toBe(deriveLeadEntryRef(HANDOFF_BY_ID));
  });

  it('ignores a labelled Entry ID on a message that is not lead-bearing', () => {
    expect(deriveLeadEntryRef('Nightly report\nEntry ID: 911')).toBe(undefined);
  });

  it('refuses a lead-bearing message naming two entry ids', () => {
    expect(
      deriveLeadEntryRef(
        '[HANDOFF: inbox→sales]\nEntry ID: 911\nEntry ID: 912',
      ),
    ).toBe(undefined);
  });

  it('reads the entry id from a bare per-lead status line', () => {
    expect(
      deriveLeadEntryRef('Lead #611 — proposal sent, awaiting reply'),
    ).toBe(611);
  });

  it('reads through a leading bracket tag', () => {
    expect(deriveLeadEntryRef('[NO ACTION] Entry #85 — nothing to do')).toBe(
      85,
    );
  });

  it('reads through several leading bracket tags', () => {
    expect(
      deriveLeadEntryRef('[FOLLOW-UP #1] Lead #243\nCategory: followup'),
    ).toBe(243);
  });

  it('treats Lead and Entry as the same id space', () => {
    expect(deriveLeadEntryRef('Entry #243 updated')).toBe(
      deriveLeadEntryRef('Lead #243 updated'),
    );
  });

  // A false merge is worse than no merge: a roundup naming two leads must not
  // drag both into one thread.
  it('refuses a message naming more than one entry', () => {
    expect(
      deriveLeadEntryRef(
        'Entry #101 (Jennifer) updated ✓\nStill pending: Entry #97',
      ),
    ).toBe(undefined);
  });

  it('accepts a message repeating the same entry id', () => {
    expect(
      deriveLeadEntryRef('Lead #611 updated. Lead #611 now qualifying.'),
    ).toBe(611);
  });

  it('ignores an id mentioned mid-sentence rather than as the subject', () => {
    expect(deriveLeadEntryRef('Certificate issued ✓ for Lead #5')).toBe(
      undefined,
    );
  });

  it('ignores a bracket tag that merely contains a number', () => {
    expect(deriveLeadEntryRef('[FOLLOW-UP #1] no lead named here')).toBe(
      undefined,
    );
  });

  it('returns undefined for a message with no entry reference', () => {
    expect(deriveLeadEntryRef('Daily digest — 3 leads processed')).toBe(
      undefined,
    );
  });

  it('rejects a zero id', () => {
    expect(deriveLeadEntryRef('Lead #0 — placeholder')).toBe(undefined);
  });

  it('is stable across repeated calls (no regex lastIndex leak)', () => {
    const text = '[NO ACTION] Entry #85 — nothing to do';
    expect(deriveLeadEntryRef(text)).toBe(deriveLeadEntryRef(text));
  });
});
