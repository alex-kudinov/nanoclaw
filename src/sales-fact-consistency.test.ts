import { describe, expect, it } from 'vitest';

import {
  checkSalesFactConsistency,
  parseSalesSchedule,
} from './sales-fact-consistency.js';

const NOW = new Date('2026-09-06T21:00:00Z');
const FRESH = NOW.getTime() - 60_000;
const CATALOG = JSON.stringify({
  catalog_id: 'coaching-supervision-mastery',
  current_enrollment: {
    start: '2026-10-07',
    end: '2027-02-10',
    price_cents: 399600,
  },
  regular_tuition: { price_cents: 479600 },
});
const SCHEDULE = `# Tandem Coaching — Upcoming Cohort Schedule
_Auto-generated from the program calendars every day. Last updated: Sunday September 6, 2026 CT._

## Coaching Supervision Mastery (Supervisor Training)
_Single cohort (no modules) — join the next cohort of the weekday/time slot that fits._
- **Upcoming cohort start dates** (weekly, 2 hours per session):
  - **US & Europe:** October 7, 2026 (10:00 AM ET) — Wednesdays, 16 weekly sessions · July 7, 2027 (10:00 AM ET) — Wednesdays, 9 weekly sessions
  - **US & Asia-Pacific:** March 3, 2027 (6:00 PM ET) — Wednesdays, 16 weekly sessions
- **Program page:** https://tandemcoach.co/coaching-supervisor-training/

## ICF Mentor Coaching (Standalone)
- **Upcoming cohort start dates** (weekly, 2 hours per session):
  - **US & Europe:** January 4, 2027 (11:00 AM ET) — Mondays, 4 weekly sessions
`;
const MULTI_SCHEDULE = `${SCHEDULE}
## ACC — Associate Certified Coach (ICF Level 1)
- **Upcoming cohort start dates** (weekly, 2 hours per session):
  - **US & Europe:** May 1, 2028 (11:00 AM ET)
`;

function card(body: string, answerable = 'PARTIAL'): string {
  return `[SALES REVIEW] Lead #1346
Category: enrollment
Email: learner@example.test
Route: TRANSACT

THEIR ASK:
1. [CURRENT MESSAGE] Can I defer to a future cohort?

ANSWERABLE: ${answerable} — March 3 and July 7, 2027 are in SCHEDULE.md.

PROGRAM MATCH: Coaching Supervision Mastery: $3,996 — active PCC

DRAFT RESPONSE TO LEAD:
---
Subject: Coaching Supervision Mastery — Cohort Questions

${body}
---

Waiting for approval.`;
}

function multiProgramCard(body: string): string {
  return card(body)
    .replace(
      'PROGRAM MATCH: Coaching Supervision Mastery: $3,996 — active PCC',
      'PROGRAM MATCH: Coaching Supervision Mastery and ACC Certification',
    )
    .replace(
      'Subject: Coaching Supervision Mastery — Cohort Questions',
      'Subject: Coaching Supervision Mastery and ACC Certification — Cohorts',
    );
}

function check(text: string, overrides = {}) {
  return checkSalesFactConsistency(card(text), {
    now: NOW,
    scheduleMarkdown: SCHEDULE,
    scheduleMtimeMs: FRESH,
    coachingSupervisionCatalogSource: CATALOG,
    ...overrides,
  });
}

describe('parseSalesSchedule', () => {
  it('extracts only generated program sections and canonical dates', () => {
    expect(parseSalesSchedule(SCHEDULE)).toEqual([
      {
        id: 'supervision',
        heading: 'Coaching Supervision Mastery (Supervisor Training)',
        dates: ['2026-10-07', '2027-03-03', '2027-07-07'],
      },
      {
        id: 'mentor',
        heading: 'ICF Mentor Coaching (Standalone)',
        dates: ['2027-01-04'],
      },
    ]);
  });

  it('refuses prose that is not marked as calendar-generated', () => {
    expect(
      parseSalesSchedule(SCHEDULE.replace('Auto-generated', 'Hand-edited')),
    ).toEqual([]);
  });
});

describe('checkSalesFactConsistency', () => {
  it('replays and rejects the exact September 6 same-card contradiction', () => {
    const result = check(
      `On deferring to a future cohort: 2027 dates and pricing haven't been announced, so I can't promise the $3,996 founding rate would carry over — it's tied to this October cohort specifically.`,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['schedule_contradiction', 'price_contradiction']),
    );
  });

  it('rejects the same stale claim in the operator-facing answerability summary', () => {
    const result = checkSalesFactConsistency(
      card('I will confirm the current cohort dates.', 'PARTIAL').replace(
        'ANSWERABLE: PARTIAL — March 3 and July 7, 2027 are in SCHEDULE.md.',
        `ANSWERABLE: PARTIAL — 2027 dates and pricing haven't been announced.`,
      ),
      {
        now: NOW,
        scheduleMarkdown: SCHEDULE,
        scheduleMtimeMs: FRESH,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['schedule_contradiction', 'price_contradiction']),
    );
  });

  it('does not treat the customer question as a Sales factual assertion', () => {
    const result = checkSalesFactConsistency(
      card('The next cohorts are March 3 and July 7, 2027.').replace(
        'Can I defer to a future cohort?',
        `Have 2027 dates and pricing not been announced?`,
      ),
      {
        now: NOW,
        scheduleMarkdown: SCHEDULE,
        scheduleMtimeMs: FRESH,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('accepts the corrected schedule- and catalog-grounded draft', () => {
    const result = check(
      `Deferring to a future cohort: the next ones are March 3, 2027 (US & Asia-Pacific) and July 7, 2027 (US & Europe) — both at the regular $4,796 tuition, not the $3,996 founding rate, which applies only to the October 2026 cohort.`,
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('rejects an unsupported explicit cohort date', () => {
    const result = check('The next cohort starts March 10, 2027 at 6 PM ET.');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'schedule_date_unsupported',
        detail: expect.stringContaining('2027-03-10'),
      }),
    );
  });

  it('does not claim that the schedule establishes an unlisted later year', () => {
    const result = check(
      `The 2028 cohort dates and pricing haven't been announced.`,
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("does not let one matched program validate another program's date", () => {
    const result = checkSalesFactConsistency(
      multiProgramCard(
        'Your next Coaching Supervision Mastery cohort starts May 1, 2028.',
      ),
      {
        now: NOW,
        scheduleMarkdown: MULTI_SCHEDULE,
        scheduleMtimeMs: FRESH,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'schedule_date_unsupported',
        detail: expect.stringContaining('supervision'),
      }),
    );
  });

  it('keeps a program-specific later-year denial independent of another program', () => {
    const result = checkSalesFactConsistency(
      multiProgramCard(
        `2028 Coaching Supervision Mastery cohort dates haven't been announced. ACC Certification starts May 1, 2028.`,
      ),
      {
        now: NOW,
        scheduleMarkdown: MULTI_SCHEDULE,
        scheduleMtimeMs: FRESH,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('fails closed when a multi-program schedule claim is unattributed', () => {
    const result = checkSalesFactConsistency(
      multiProgramCard(`2028 cohort dates haven't been announced.`),
      {
        now: NOW,
        scheduleMarkdown: MULTI_SCHEDULE,
        scheduleMtimeMs: FRESH,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result.issues.map((issue) => issue.code)).toContain(
      'schedule_claim_ambiguous',
    );
  });

  it('fails closed when the schedule is missing, malformed, or stale', () => {
    expect(
      check('The next cohort is in 2027.', { scheduleMarkdown: null }).issues[0]
        .code,
    ).toBe('schedule_unavailable');
    expect(
      check('The next cohort is in 2027.', {
        scheduleMarkdown: 'not generated',
      }).issues.map((issue) => issue.code),
    ).toContain('schedule_program_missing');
    expect(
      check('The next cohort is in 2027.', {
        scheduleMtimeMs: NOW.getTime() - 37 * 60 * 60 * 1000,
      }).issues.map((issue) => issue.code),
    ).toContain('schedule_stale');
  });

  it('fails closed when price is material and the canonical catalog is unavailable', () => {
    const result = check('A future cohort uses the regular tuition rate.', {
      coachingSupervisionCatalogSource: null,
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      'catalog_unavailable',
    );
  });

  it('does not block a non-schedule claim merely because the subject names the program', () => {
    const result = checkSalesFactConsistency(
      card('The AACS accreditation is granted.', 'YES').replace(
        'Can I defer to a future cohort?',
        'Is AACS accreditation granted?',
      ),
      {
        now: NOW,
        scheduleMarkdown: null,
        coachingSupervisionCatalogSource: CATALOG,
      },
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });
});
