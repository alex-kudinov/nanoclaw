import { describe, expect, it } from 'vitest';

import { isApprovalCardSuccessRecap } from './approval-recap.js';

describe('isApprovalCardSuccessRecap', () => {
  it.each([
    'Draft posted for Marina Minina (Lead #1047) — ACTC matched, awaiting approval in thread.',
    'Revised draft posted in-thread with the booking link — awaiting approval.',
    'Updated draft posted in the thread — awaiting approval.',
    'Review card ready and awaiting approval.',
  ])('recognizes non-authoritative approval recaps: %s', (text) => {
    expect(isApprovalCardSuccessRecap(text)).toBe(true);
  });

  it.each([
    'Still checking the current cohort schedule.',
    'The host rejected the card; correcting it now.',
    'The email was accepted by Gmail. Receipt 123.',
    'Draft is ready. I could not post the review card because gmail_get_thread returned nothing for this lead, so nothing is awaiting approval yet.',
    'Draft ready for Lead #1047, but the cohort schedule is missing the September date — I cannot finish until you confirm it. Holding the draft, awaiting approval to use the August cohort instead.',
    'Error: send_message failed twice. The draft posted earlier is the only one awaiting approval.',
    'Updated draft posted, awaiting approval. Do you want the discovery-call link in there too?',
    'The draft is still being updated and is not ready, though the previous card is awaiting approval.',
  ])('preserves actual progress and outcome text: %s', (text) => {
    expect(isApprovalCardSuccessRecap(text)).toBe(false);
  });
});
