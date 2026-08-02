import { describe, expect, it } from 'vitest';

import { buildApprovedHandoff } from './approved-send-handoff.js';

// The real Lead #871 card the operator approved on 2026-07-31, which sales then
// failed to hand off.
const CARD = `[SALES REVIEW] Lead #871 — Jordan follow-up (certificate contents, resolved)
Category: enrollment
Email: jmproductionselite@gmail.com

Jordan | proposal | pressing for a real answer on documentation

THEIR ASK: (1) Is AACS accreditation granted? (2) What does the certificate state?

RECOMMENDED NEXT STEP: Send final answer and let her reserve.

DRAFT RESPONSE TO LEAD:
---
Subject: Re: Coaching Supervision Mastery: your founding-cohort seat is open

Hi Jordan,

The AACS accreditation is now granted (as of July 2026, valid through July 2029).

Best,
The Tandem Coaching Team
---

Updated draft ready. Reply "Approved" to send, or reply with more changes.`;

describe('buildApprovedHandoff', () => {
  it('slices the approved body verbatim and builds a canonical handoff', () => {
    const built = buildApprovedHandoff(CARD);
    expect(built).not.toBeNull();
    expect(built!.recipient).toBe('jmproductionselite@gmail.com');
    expect(built!.subject).toBe(
      'Re: Coaching Supervision Mastery: your founding-cohort seat is open',
    );
    expect(built!.body).toBe(
      'Hi Jordan,\n\n' +
        'The AACS accreditation is now granted (as of July 2026, valid through July 2029).\n\n' +
        'Best,\nThe Tandem Coaching Team',
    );
    // Operator-facing scaffolding must never reach the customer.
    expect(built!.body).not.toContain('THEIR ASK');
    expect(built!.body).not.toContain('RECOMMENDED NEXT STEP');
    expect(built!.body).not.toContain('Updated draft ready');
    expect(built!.body).not.toContain('Subject:');
  });

  it('emits the exact field shape mailman parses', () => {
    const { text } = buildApprovedHandoff(CARD)!;
    expect(text.split('\n')[0]).toBe('[HANDOFF: sales→mailman]');
    expect(text).toContain('To: jmproductionselite@gmail.com');
    expect(text).toContain('Entry ID: 871');
    expect(text).toContain('---END-ORIGINAL---');
    expect(text).toContain('\nBody:\n');
    // A grant-free send: the Re: subject re-attaches the thread host-side.
    expect(text).not.toContain('Thread-ID');
  });

  it('carries an operator-supplied original message when available', () => {
    const { text } = buildApprovedHandoff(CARD, {
      originalMessage: 'Jordan asked about the certificate contents.',
    })!;
    expect(text).toContain('Jordan asked about the certificate contents.');
  });

  // Every null here means "leave it to the operator" — the alert path is
  // unchanged and nothing customer-facing is guessed at.
  it.each([
    ['not an approval card', CARD.replace('[SALES REVIEW]', '[NO ACTION]')],
    ['no recipient', CARD.replace(/^Email:.*$/m, '')],
    ['no draft heading', CARD.replace('DRAFT RESPONSE TO LEAD:', 'NOTES:')],
    [
      'no closing fence',
      CARD.replace(/^---$\n\nUpdated draft/m, 'Updated draft'),
    ],
    ['no subject', CARD.replace(/^Subject:.*$/m, '')],
    ['empty body', CARD.replace(/Hi Jordan,[\s\S]*?Coaching Team/, '')],
  ])('returns null when the card has %s', (_label, broken) => {
    expect(buildApprovedHandoff(broken)).toBeNull();
  });
});

// The real approved card for Gaye Montgomery (2026-07-31T22:40:38Z). It was
// approved, then refused because no party existed, and nothing re-drove it.
describe('client support cards', () => {
  const SUPPORT_CARD = `[CLIENT SUPPORT REVIEW] Gaye Montgomery (gayemontgomery@gmail.com)
Category: account-access
Email: gayemontgomery@gmail.com

THEIR MESSAGE: Purchased "Systemic Coaching for Executive Teams" ($499 course), downloaded the app but can't find a link to access it.

DRAFT RESPONSE:
---
Subject: Re: Systemic Coaching for Executive Teams - Coaching the Collision

Hi Gaye,

Your course lives inside the Community — head to community.tandemcoaching.academy.

Best,
The Tandem Coaching Team
---

Updated draft ready. Reply "Approved" to send, or reply with more changes.`;

  it('parses a support card into a sendable handoff', () => {
    const built = buildApprovedHandoff(SUPPORT_CARD);
    expect(built).not.toBeNull();
    expect(built!.recipient).toBe('gayemontgomery@gmail.com');
    expect(built!.subject).toBe(
      'Re: Systemic Coaching for Executive Teams - Coaching the Collision',
    );
  });

  it('slices the approved body verbatim, without the operator-facing summary', () => {
    const built = buildApprovedHandoff(SUPPORT_CARD)!;
    expect(built.body).toContain('Your course lives inside the Community');
    expect(built.body).not.toContain('THEIR MESSAGE');
    expect(built.body).not.toContain('Updated draft ready');
  });

  // Without an Entry ID mailman refuses the send outright, which is exactly how
  // this approval died the first time.
  it('carries a host-resolved Entry ID when the card names no lead', () => {
    const built = buildApprovedHandoff(SUPPORT_CARD, { entryId: 970 })!;
    expect(built.text).toContain('Entry ID: 970');
  });

  it('omits the Entry ID line when none can be resolved', () => {
    const built = buildApprovedHandoff(SUPPORT_CARD)!;
    expect(built.text).not.toContain('Entry ID:');
  });

  it('never lets a resolved id override an id stated on the card', () => {
    const built = buildApprovedHandoff(CARD, { entryId: 999 })!;
    expect(built.text).toContain('Entry ID: 871');
    expect(built.text).not.toContain('Entry ID: 999');
  });
});
