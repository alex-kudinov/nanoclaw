import { describe, it, expect } from 'vitest';

import {
  businessDaysBetween,
  selectNextTouch,
  shouldCloseOut,
  CADENCE,
  MAX_TOUCHES,
  TOUCH1_TRIGGER_BIZDAYS,
} from './proposal-followup-cadence.js';

// Local-date helper (month is 0-based). Calendar anchors (verified weekdays):
//   2026-06-15 Mon  2026-06-19 Fri  2026-06-22 Mon  2026-06-29 Mon
//   2026-07-06 Mon  2026-07-09 Thu  2026-07-13 Mon  2026-07-20 Mon
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('businessDaysBetween', () => {
  it('counts one calendar week as 5 business days', () => {
    expect(businessDaysBetween(d(2026, 6, 15), d(2026, 6, 22))).toBe(5);
  });

  it('counts weekdays in the half-open interval (from, to]', () => {
    // Mon -> Wed = Tue + Wed
    expect(businessDaysBetween(d(2026, 6, 15), d(2026, 6, 17))).toBe(2);
  });

  it('skips the weekend', () => {
    // Fri -> Mon = Mon only
    expect(businessDaysBetween(d(2026, 6, 19), d(2026, 6, 22))).toBe(1);
  });

  it('returns 0 for same day and for reversed args', () => {
    expect(businessDaysBetween(d(2026, 6, 15), d(2026, 6, 15))).toBe(0);
    expect(businessDaysBetween(d(2026, 6, 17), d(2026, 6, 15))).toBe(0);
  });

  it('ignores time-of-day', () => {
    const morning = new Date(2026, 5, 15, 8, 0);
    const evening = new Date(2026, 5, 22, 23, 0);
    expect(businessDaysBetween(morning, evening)).toBe(5);
  });
});

const base = {
  firstFollowupAt: null,
  lastSentAt: null,
  lastSentSequence: 0,
  hasPendingApproval: false,
};

describe('selectNextTouch — touch 1', () => {
  it('does not fire before TOUCH1_TRIGGER_BIZDAYS', () => {
    // Mon -> Fri = 4 business days (< 5)
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 6, 15),
      now: d(2026, 6, 19),
    });
    expect(t).toBeNull();
  });

  it('fires at exactly 5 business days pending', () => {
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 6, 15),
      now: d(2026, 6, 22),
    });
    expect(t?.sequence).toBe(1);
    expect(TOUCH1_TRIGGER_BIZDAYS).toBe(5);
  });

  it('fires today for a months-old backlog proposal (within max age)', () => {
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 3, 9), // March backlog
      now: d(2026, 6, 17),
    });
    expect(t?.sequence).toBe(1);
  });

  it('skips proposals older than the max age cap', () => {
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 3, 9),
      now: d(2026, 6, 17),
      maxAgeBizDays: 3, // force the cap below the proposal's age
    });
    expect(t).toBeNull();
  });

  it('suppresses any touch while one awaits approval', () => {
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 6, 15),
      now: d(2026, 6, 22),
      hasPendingApproval: true,
    });
    expect(t).toBeNull();
  });
});

describe('selectNextTouch — touches 2-4 anchored to first follow-up', () => {
  it('fires touch 2 at anchor + 5 business days', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 6, 15),
      lastSentSequence: 1,
      hasPendingApproval: false,
      now: d(2026, 6, 22), // anchor + 5
    });
    expect(t?.sequence).toBe(2);
  });

  it('holds touch 2 until the anchor offset is reached', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 6, 15),
      lastSentSequence: 1,
      hasPendingApproval: false,
      now: d(2026, 6, 19), // anchor + 4
    });
    expect(t).toBeNull();
  });

  it('fires touch 3 once anchor offset and min-gap are both satisfied', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 6, 22),
      lastSentSequence: 2,
      hasPendingApproval: false,
      now: d(2026, 7, 6), // anchor + 15 biz days, 10 since last
    });
    expect(t?.sequence).toBe(3);
  });

  it('throttles when the min gap since last touch is not met', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 7, 3), // Friday
      lastSentSequence: 2,
      hasPendingApproval: false,
      now: d(2026, 7, 6), // Monday — only 1 business day since last touch
    });
    expect(t).toBeNull();
  });

  it('fires touch 4 (breakup) at anchor + 20 business days', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 7, 6),
      lastSentSequence: 3,
      hasPendingApproval: false,
      now: d(2026, 7, 13), // anchor + 20 biz days
    });
    expect(t?.sequence).toBe(4);
    expect(t?.label).toBe('breakup');
  });

  it('stops after the final touch', () => {
    const t = selectNextTouch({
      pendingAt: d(2026, 6, 8),
      firstFollowupAt: d(2026, 6, 15),
      lastSentAt: d(2026, 7, 13),
      lastSentSequence: MAX_TOUCHES,
      hasPendingApproval: false,
      now: d(2026, 8, 31),
    });
    expect(t).toBeNull();
  });

  it('does not advance past touch 1 without a recorded anchor', () => {
    const t = selectNextTouch({
      ...base,
      pendingAt: d(2026, 6, 8),
      lastSentSequence: 1, // claims a touch sent but no anchor/lastSentAt
      now: d(2026, 8, 31),
    });
    expect(t).toBeNull();
  });
});

describe('cadence reproduces 5/10/18/25-from-sent for a fresh proposal', () => {
  // Touch 1 fires precisely at day 5; anchored touches then land on 10/18/25.
  const sent = d(2026, 6, 15); // Monday

  it('touch 1 at sent + 5 business days', () => {
    expect(
      selectNextTouch({ ...base, pendingAt: sent, now: d(2026, 6, 22) })
        ?.sequence,
    ).toBe(1);
  });

  it('touch 2 at sent + 10, touch 3 at sent + 18, touch 4 at sent + 25', () => {
    const anchor = d(2026, 6, 22); // touch 1 send date
    const shared = { pendingAt: sent, firstFollowupAt: anchor };
    expect(
      selectNextTouch({
        ...shared,
        lastSentAt: anchor,
        lastSentSequence: 1,
        hasPendingApproval: false,
        now: d(2026, 6, 29), // sent + 10
      })?.sequence,
    ).toBe(2);
    expect(
      selectNextTouch({
        ...shared,
        lastSentAt: d(2026, 6, 29),
        lastSentSequence: 2,
        hasPendingApproval: false,
        now: d(2026, 7, 9), // sent + 18
      })?.sequence,
    ).toBe(3);
    expect(
      selectNextTouch({
        ...shared,
        lastSentAt: d(2026, 7, 9),
        lastSentSequence: 3,
        hasPendingApproval: false,
        now: d(2026, 7, 20), // sent + 25
      })?.sequence,
    ).toBe(4);
  });
});

describe('shouldCloseOut', () => {
  const breakup = d(2026, 6, 15); // Monday

  it('is false until the full cadence has run', () => {
    expect(
      shouldCloseOut({
        lastSentSequence: 3,
        lastSentAt: breakup,
        alreadyClosed: false,
        now: d(2026, 8, 1),
      }),
    ).toBe(false);
  });

  it('is false within a week of the breakup', () => {
    expect(
      shouldCloseOut({
        lastSentSequence: MAX_TOUCHES,
        lastSentAt: breakup,
        alreadyClosed: false,
        now: d(2026, 6, 19), // 4 business days later
      }),
    ).toBe(false);
  });

  it('is true a week (5 business days) after the breakup', () => {
    expect(
      shouldCloseOut({
        lastSentSequence: MAX_TOUCHES,
        lastSentAt: breakup,
        alreadyClosed: false,
        now: d(2026, 6, 22), // 5 business days later
      }),
    ).toBe(true);
  });

  it('is false once already closed out', () => {
    expect(
      shouldCloseOut({
        lastSentSequence: MAX_TOUCHES,
        lastSentAt: breakup,
        alreadyClosed: true,
        now: d(2026, 7, 1),
      }),
    ).toBe(false);
  });
});

describe('CADENCE metadata', () => {
  it('defines four ordered touches with angles', () => {
    expect(CADENCE).toHaveLength(4);
    expect(CADENCE.map((t) => t.sequence)).toEqual([1, 2, 3, 4]);
    for (const t of CADENCE) expect(t.angle.length).toBeGreaterThan(10);
  });
});
