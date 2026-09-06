# NC-20260906-004 — correction review response (R2)

## Verdict: NO MATERIAL FINDINGS

## Verification of the two R1 findings

Both findings traced closed by independent manual execution of
`checkSalesFactConsistency` against the new `MULTI_SCHEDULE` two-program
fixtures, not just by reading the assertions:

**Finding 1 (cross-program false acceptance).** `scheduleClaims` results are
now resolved through `programsForClaim`, which attributes a claim sentence to
a program only via `claimContext` (falling back to the sole resolved program
only when exactly one program is resolved) and checks the date against
`publishedDatesByProgram.get(id)` — a per-program `Set`, not the old flattened
pool. Traced against
`src/sales-fact-consistency.test.ts:176-194`: for `multiProgramCard('Your next
Coaching Supervision Mastery cohort starts May 1, 2028.')` with
`programIds = ['supervision', 'acc']`, the sentence's `claimContext` match
yields `targets = ['supervision']` only; `publishedDatesByProgram.get('supervision')`
does not contain `2028-05-01` (that date exists only under `acc` in
`MULTI_SCHEDULE`), so `schedule_date_unsupported` fires. The hallucinated
cross-program date no longer validates.

**Finding 2 (cross-program false rejection).** `denialContradictsDates` is
now called per attributed target against `futureDates(id)`, a per-program
future-date derivation, not the old flattened `futurePublishedDates`. Traced
against `src/sales-fact-consistency.test.ts:196-209`: the denial sentence
`"2028 Coaching Supervision Mastery cohort dates haven't been announced"`
attributes to `['supervision']` only; `futureDates('supervision')` has no 2028
entry, so no contradiction. The second sentence, `"ACC Certification starts
May 1, 2028"`, attributes to `['acc']` via its own `claimContext`, and
`2028-05-01` **is** published under `acc` in `MULTI_SCHEDULE`, so it validates
as a claim rather than a denial. Net result `{ ok: true, issues: [] }` as
asserted — the genuinely correct, program-scoped denial is no longer rejected
by another program's dates.

**New fail-closed path.** For `multiProgramCard('2028 cohort dates haven't
been announced.')` (no program name in the sentence, two programs resolved),
`programsForClaim` returns `[]` (no explicit match, and fallback only applies
when exactly one program is resolved), so `schedule_claim_ambiguous` fires and
the card is rejected. Traced and confirmed against
`src/sales-fact-consistency.test.ts:211-224`.

**Price scoping.** `supervisionPriceClaims` and the `price_contradiction`
check are now filtered through `programsForClaim(...).includes('supervision')`
before any catalog comparison runs, so a price statement attributed to
another selected program (e.g., an ACC price claim) cannot reach the
Coaching Supervision Mastery catalog guard.

**Regression check on single-program fixtures.** Traced the pre-existing
`SCHEDULE`-only tests (`src/sales-fact-consistency.test.ts:108-174`) against
the new attribution logic: with exactly one resolved program, unnamed denial
and claim sentences correctly fall back to that sole program, reproducing the
same accept/reject outcomes as before (`schedule_contradiction`,
`price_contradiction`, unsupported-date rejection, and the "unlisted later
year stays answerable" acceptance all traced unchanged).

## No new material false-positive/false-negative path found

- No remaining code path reads or compares against a flattened,
  multi-program date pool — `publishedDatesByProgram` and `futureDates(id)`
  are the only date sources used after the correction, and every call site
  (`scheduleDenialSentences`, `priceDenialSentences`, `scheduleClaims`) passes
  through `programsForClaim` first.
- The conservative "unattributed → `schedule_claim_ambiguous`" behavior is an
  intentional, disclosed fail-closed tradeoff (explicitly called out in the
  request and covered by its own test), not a hidden defect — it converts the
  prior silent false-accept/false-reject failure modes into an explicit hold
  for human review, which is the correct direction for this control.

## Verification note

Per the allowed-paths restriction, this response is based on static tracing
of the four permitted files only; the "218/218 passed" and typecheck claims
in the request were not independently re-run.
