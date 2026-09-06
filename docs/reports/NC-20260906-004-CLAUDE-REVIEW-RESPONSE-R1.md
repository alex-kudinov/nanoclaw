# NC-20260906-004 — bounded implementation review response (R1)

## Verdict: MATERIAL FINDINGS

## Material findings (ordered by consequence)

### Finding 1 — cross-program date-pool bleed lets a hallucinated cohort date pass as "supported" (false negative)

`checkSalesFactConsistency` resolves `programIds` as an array — the request
packet itself states the design "resolves **one or more** known programs from
structured `PROGRAM MATCH` or the subject" (`src/sales-fact-consistency.ts:341`,
`resolveSalesSchedulePrograms` at `src/sales-fact-consistency.ts:185-199`). But
once multiple programs resolve, every date-bearing check is run against one
flat, unattributed pool:

```
src/sales-fact-consistency.ts:387-389
  const publishedDates = new Set(
    matchedSchedules.flatMap((schedule) => schedule.dates),
  );
...
src/sales-fact-consistency.ts:442-449
  for (const date of scheduleClaimDates(assertedFacts)) {
    if (!publishedDates.has(date)) {
      issues.push({ code: 'schedule_date_unsupported', ... });
    }
  }
```

`publishedDates` merges the dates of *every* matched program's schedule
section, and `scheduleClaimDates` (`src/sales-fact-consistency.ts:248-260`)
extracts any date near a cohort/start keyword anywhere in the draft without
attributing it to a specific program. Concretely: if a card resolves to both
`acc` and `supervision` (e.g. a subject or `PROGRAM MATCH` line naming both,
which the design explicitly supports), and ACC's real schedule section has a
cohort on 2027-05-01 while Supervision does not, a draft that hallucinates
*"Your next Coaching Supervision Mastery cohort starts May 1, 2027"* is judged
**supported**, because 2027-05-01 is in the merged pool even though it belongs
only to ACC's section. This is the exact class of factual error the control
exists to catch (a schedule-dependent claim not backed by that program's own
generated section), and it passes silently.

### Finding 2 — same cross-program pooling produces false positives, breaking the "unannounced later year must remain answerable" invariant

`futurePublishedDates` (`src/sales-fact-consistency.ts:390-392`) is the same
unattributed, all-matched-programs pool, and it feeds both contradiction
checks:

```
src/sales-fact-consistency.ts:393-404   (schedule_contradiction)
src/sales-fact-consistency.ts:419-432   (price_contradiction)
```

via `denialContradictsDates` (`src/sales-fact-consistency.ts:234-246`), which
only compares the *year* mentioned in a denial sentence against
`futurePublishedDates` — it never checks that the year belongs to the program
the sentence is actually about. Reusing the two-program example: if `mentor`
is also resolved for the card (plausible — its `explicitContext` is only "ICF
Mentor Coaching" / "Group Mentor Coaching") and Mentor's real schedule section
has a 2028 cohort, then a **correct** draft sentence — *"2028 Coaching
Supervision Mastery cohort dates haven't been announced"* — is rejected with
`schedule_contradiction`, because 2028 is present in the pool via Mentor, not
Supervision. This directly violates the stated protected invariant: "a
genuinely unannounced later year must remain answerable" (request packet,
non-objectives). The same mechanism contaminates `price_contradiction`
(`priceDenialSentences` has no program-name requirement either, so a true
statement about a *different* selected program's pricing can trip Supervision's
`price_contradiction` whenever Supervision is also matched and has any future
date).

**Root cause (both findings):** the schedule/catalog evidence is already
parsed and kept per-program (`ProgramSchedule.id` in `parseSalesSchedule`,
`src/sales-fact-consistency.ts:147-166`), but the comparison stage discards
that attribution and pools everything before checking claims/denials in the
draft. Nothing in the current code or tests scopes a claim or denial sentence
to the specific program it names.

**Test coverage gap:** `src/sales-fact-consistency.test.ts` never exercises a
card that resolves more than one `ScheduleProgramId`. Every fixture (`card()`
helper, `SCHEDULE` constant) drives exactly one program (`supervision`). The
four enforcement-boundary suites (`src/ipc-handoff-echo.test.ts:666-668`,
`src/channels/slack.test.ts:2615-2616`, `src/send-watchdog.test.ts:198-199,
212-213, 889-890`, `src/approved-email-execution.test.ts:65-66`) all stub
`salesFactConsistencyIssue`/`factConsistencyIssue` directly rather than
exercising real multi-program resolution, so the wiring tests cannot surface
this gap either. The "215/215" and "live-shaped check" verification claims in
the request are credible for the single-program shape they were run against,
but they do not cover the multi-program path the implementation explicitly
advertises as supported.

## Enforcement boundaries — do they fail closed?

Structurally yes, for the five wired call sites reviewed:

- `src/ipc.ts:800-841` (pre-approval, IPC→Slack) — a truthy `factIssue`
  quarantines the file (`approval-card-facts`) and returns the rejection to
  the source container; nothing is posted for approval.
- `src/channels/slack.ts:1097-1102, 1131-1137` (Slack defense-in-depth) — a
  truthy `factApprovalIssue` substitutes a rejection banner for the outbound
  text; the draft is never posted.
- `src/send-watchdog.ts:200-206` (`recordApproval`, arming) — returns `null`
  before minting a `PendingSend`, and `observeApprovalCard`
  (`src/send-watchdog.ts:274-287`) surfaces the rejection reason.
- `src/send-watchdog.ts:550-568` (pre-rescue) — blocks the rescue send and
  posts an alert instead.
- `src/approved-email-execution.ts:64-76` (final Gmail boundary) — returns
  `ok: false` with `approved_card_fact_inconsistent`, blocking the send.

All five check `sourceGroup`/`groupFolder === 'sales'` before calling the
consistency check and treat any truthy return as a hard stop; none pass
content through on a truthy issue. I found no code path in
`sales-fact-consistency.ts` that throws past its own guards (schedule read,
catalog read, and JSON parse are each wrapped in `try/catch` and degrade to a
fail-closed `schedule_unavailable`/`catalog_unavailable` result), so the
"fails closed on unavailable/stale schedule" behavior is real for the
scenarios tested. However, fail-closed wiring only helps if the underlying
check correctly identifies a problem — Finding 1 shows a scenario where
`checkSalesFactConsistency` itself returns `{ ok: true }` for a bad draft, so
all five boundaries correctly do nothing in that case, i.e., the control is
bypassed at the source, not at the wiring.

## Incident replay and false-positive controls — credible?

Credible for the single-program shape of the actual 2026-09-06 incident: the
replay test (`src/sales-fact-consistency.test.ts:91-99`) reproduces the exact
sentence and both `schedule_contradiction`/`price_contradiction` codes, the
"customer question is not an assertion" test
(`src/sales-fact-consistency.test.ts:119-133`) and the "unlisted later year
stays answerable" test (`src/sales-fact-consistency.test.ts:152-157`) both
pass for a single resolved program. Not credible yet for the documented
multi-program capability (`resolveSalesSchedulePrograms` returning more than
one id) — Findings 1 and 2 show both a false negative and a false positive in
that path, and no test exercises it.

## Required correction and acceptance test

Scope date evidence and denial/claim matching per program instead of pooling
across every resolved `programId`:

- Keep `publishedDates`/`futurePublishedDates` as a `Map<ScheduleProgramId,
  string[]>` (or re-derive per program from `matchedSchedules` at the point of
  use) instead of a single flattened `Set`.
- For `scheduleClaimDates`/`schedule_date_unsupported`, attribute each claimed
  date to the nearest named program in its sentence (falling back to the sole
  resolved program only when exactly one is resolved) and check it only
  against that program's own dates.
- For `scheduleDenialSentences`/`priceDenialSentences` and
  `denialContradictsDates`, do the same: a denial sentence should only be
  judged contradicted by the specific program's own future dates, not by any
  other resolved program's dates.

Focused acceptance test to add to `src/sales-fact-consistency.test.ts`
(two-program schedule fixture, e.g. adding an ACC section with a
2027-05-01/2028 date alongside the existing Supervision section):

1. A card whose `PROGRAM MATCH`/subject resolves both `acc` and `supervision`,
   whose draft claims a Supervision cohort on a date that exists only in the
   ACC section → expect `schedule_date_unsupported` (currently `ok: true`,
   this is Finding 1's regression test).
2. The same two-program card, whose draft correctly denies an unannounced
   *later* year for Supervision specifically, while the ACC section does have
   a cohort in that year → expect `{ ok: true, issues: [] }` (currently
   rejected with `schedule_contradiction`, this is Finding 2's regression
   test).
