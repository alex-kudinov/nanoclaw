import { describe, it, expect } from 'vitest';

import {
  computeVetoExpiry,
  heuristicCategory,
  isApprovalMessage,
  isAutoApprovalMessage,
  isDraftMessage,
  isOperatorApprovalText,
  parseDraftCategory,
  shouldPromote,
  PROMOTE_STREAK,
} from './autonomy-policy.js';

function chicagoHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(d),
    10,
  );
}

describe('draft/approval detection', () => {
  it('detects both draft markers', () => {
    expect(isDraftMessage('…\nDRAFT RESPONSE TO LEAD:\nHi')).toBe(true);
    expect(isDraftMessage('…\nDRAFT FOLLOW-UP:\nHi')).toBe(true);
    expect(isDraftMessage('regular status update')).toBe(false);
  });

  it('parses a valid Category line and rejects unknown slugs', () => {
    expect(parseDraftCategory('Entry ID: 5\nCategory: enrollment\n…')).toBe(
      'enrollment',
    );
    expect(parseDraftCategory('Category: nonsense')).toBeUndefined();
    expect(parseDraftCategory('no category line')).toBeUndefined();
  });

  it('recognizes human and auto approvals', () => {
    expect(isApprovalMessage('✅ Approved by Alex.')).toBe(true);
    expect(isApprovalMessage('✅ Auto-approved (autonomy L2…)')).toBe(true);
    expect(isAutoApprovalMessage('✅ Auto-approved (autonomy L2…)')).toBe(true);
    expect(isAutoApprovalMessage('✅ Approved by Alex.')).toBe(false);
    expect(isApprovalMessage('looks good, send it')).toBe(false);
  });

  it('recognizes whole-message typed approvals, rejects mixed feedback', () => {
    for (const t of [
      'approved',
      'Approved',
      'approve',
      'yes, send it',
      'go ahead',
      'send it',
      'ok to send',
      '👍',
    ]) {
      expect(isOperatorApprovalText(t), t).toBe(true);
    }
    for (const t of [
      "Remove you'll hear from us, otherwise approved",
      'remove the may 22 sentence. the rest is approved',
      'approved but change the subject line',
      'this needs work',
    ]) {
      expect(isOperatorApprovalText(t), t).toBe(false);
    }
  });
});

describe('heuristicCategory (backfill)', () => {
  it('classifies follow-ups, payment issues and pricing', () => {
    expect(heuristicCategory('DRAFT FOLLOW-UP:\nJust checking in')).toBe(
      'followup',
    );
    expect(heuristicCategory('your refund has been processed')).toBe(
      'payment-issue',
    );
    expect(heuristicCategory('the program costs $3,999 total')).toBe('pricing');
    expect(
      heuristicCategory('the next cohort starts in September, enroll'),
    ).toBe('enrollment');
  });
});

describe('computeVetoExpiry', () => {
  it('keeps an in-hours expiry unchanged', () => {
    // 2026-07-06T15:00Z = 10:00 CDT; +120min = 12:00 CDT — in hours
    const now = new Date('2026-07-06T15:00:00.000Z');
    const expiry = computeVetoExpiry(now, 120);
    expect(expiry.toISOString()).toBe('2026-07-06T17:00:00.000Z');
  });

  it('rolls an out-of-hours expiry forward to ~09:00 CT', () => {
    // 21:30 CDT + 120min = 23:30 CDT — after close, rolls to 9am hour
    const now = new Date('2026-07-07T02:30:00.000Z');
    const expiry = computeVetoExpiry(now, 120);
    expect(chicagoHour(expiry)).toBe(9);
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('shouldPromote', () => {
  it('promotes at the streak threshold for unguarded categories', () => {
    expect(shouldPromote(1, PROMOTE_STREAK, 'enrollment')).toBe(true);
    expect(shouldPromote(1, PROMOTE_STREAK - 1, 'enrollment')).toBe(false);
  });

  it('never promotes guarded categories or non-L1 levels', () => {
    expect(shouldPromote(1, PROMOTE_STREAK + 10, 'pricing')).toBe(false);
    expect(shouldPromote(1, PROMOTE_STREAK + 10, 'payment-issue')).toBe(false);
    expect(shouldPromote(2, PROMOTE_STREAK, 'enrollment')).toBe(false);
  });
});
