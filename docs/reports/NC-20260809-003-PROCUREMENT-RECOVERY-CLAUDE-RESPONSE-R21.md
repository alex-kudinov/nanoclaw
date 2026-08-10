# NC-20260809-003 — Stale no-results marker repair, design review, Claude R21

- Round: R21, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R21.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T04:35Z–04:46Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; clean tree at
  `d583631` (the R20 delta, released as `d5836318ce36`)
- Change class: C0 design review of a proposal. No implementation. No
  production, database, browser, network, vault, or secret access; no `.env*`,
  credential, session, browser-profile, log, row, machine-local setting, or
  task-payload content read; nothing committed or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: GO FOR R21 IMPLEMENTATION

The design is right and it is the narrowest safe repair the new evidence
supports. One **High** is missing from the four-item enumeration and must land
in the same change — it is not a flaw in the design but an omission the design's
own principle requires. Two Mediums follow. Nothing at blocker.

I am returning GO rather than the NO-GO I gave in R18 and R19 for a reason worth
stating, so the difference does not read as drift: those rounds reviewed written
code with defects in it. This round reviews a plan. Amending a plan before
implementation is what design review is for, and H-1 below is an addition to the
plan, not a correction of it.

**My R20 M-1 prediction was wrong in direction.** I predicted Clear Criteria
would remove the marker and recorded the prediction so the shadow would be
interpretable either way. It does not remove it. The record is what mattered;
the guess was not.

---

## 1. What the new evidence actually establishes

`FACT`, from the request's diagnostic: `afterZero.emptyCount: 1`,
`afterClear.emptyCount: 1`, `afterPositive.emptyCount: 0`, with
`afterClear.inputEmpty: true`, `summaryCount: 0`, `gridCount: 0`. Clear Criteria
resets the query, the summary, and the grid. It does not reset the message. A
subsequent **positive** search does.

`INFERENCE` — the more consequential reading, which the request does not draw
and which changes the justification for the whole design: **the "hidden UI"
premise is retired.** Shadow 1 reports `coaching: observed, visible, 0 rows`,
and `afterZero.emptyCount: 1` confirms it. The portal was rendering its
no-results marker for `coaching` all along. R12–R19 proceeded on the belief that
CaleProcure "returns a truthful JSON zero the UI never renders"; that belief was
an artifact of matching the six-word prefix with `exact: true`. The measurement
was broken, not the portal.

`INFERENCE`. The response path is still necessary — but for a different reason
than the one it was built for. It is required because the marker is **not
query-bound**, not because it is invisible. That distinction matters for whoever
reads this in six months: without it, a future reader concludes CaleProcure is
broken when it is behaving normally, and may "simplify" the response path away.

`FACT`. Shadow 1 also gives the first real per-unit timing: `coaching` at
2578 ms. Nine units at that rate plus baseline and directory sits far inside 50%
of `timeout_ms`. The timing gate is now backed by a measurement rather than an
estimate.

---

## 2. Q1 — is the proposal the narrowest safe repair?

**Yes**, once H-1 is included.

`INFERENCE`, item by item:

- **Item 1** reverts the cleared-state definition to summary + grid — exactly
  what it effectively was for the collector's entire life, since the six-word
  matcher never matched. This is a return to proven behavior that drops only the
  one requirement the new evidence proves impossible. The `inputEmpty` check is
  independently retained and independently confirmed (`afterClear.inputEmpty:
  true`), so the clear is still verified, not assumed.
- **Item 2** is the minimum sufficient answer to "the marker is not
  query-bound." No smaller rule works: **any** rule that accepts a bare visible
  marker is unsound, because the marker provably survives Clear into the next
  query. There is no weaker fix.
- **Items 3–4** preserve every existing guard — contradiction, listener
  cleanup, bounded timeout, partial summary, cause chain, tab cleanup.
- Nothing expands scope, touches migration 116, or alters write semantics.

`FACT`. I checked the one place a `resultEvidence` change could leak into the
database and it cannot: `collector:292-295` writes only
`{ resultCount, pagesVisited }` into `coverage.evidence`, and
`normalizeCoverageEvidence` (`procurement-intake.ts:439-449`) rejects any other
key. `resultEvidence` travels only in `diagnostics`, which is public summary,
not receipt. The proposal therefore cannot break live ingest — a path no shadow
gate exercises.

### H-1 · `readVisibleResultTotal` still reads the marker, and the proposal guarantees it will be stale · High

`FACT`. `port:117-129`:

```ts
async function readVisibleResultTotal(page: Page): Promise<number> {
  const noResults = page.getByText(NO_RESULTS_TEXT, { exact: true }).filter({ visible: true });
  const summaryTexts = await page.getByText(/^Showing Results /).filter({ visible: true }).allInnerTexts();
  return parseCaleProcureResultTotal(summaryTexts, (await noResults.count()) > 0);
}
```

`FACT`. `parseCaleProcureResultTotal:141-145`:

```ts
if (noResultsVisible && totals.size > 0) {
  throw new Error('CaleProcure result state shows both results and no-results');
}
```

`INFERENCE`. The proposal removes the marker from the terminating conditions but
leaves it as a **throwing input** to the very next call. `search()` invokes
`readVisibleResultTotal` immediately after `waitForSearchOutcome` returns
`'visible'`, which under the proposal happens on the first poll where the
summary exists. If the portal renders the summary before it clears the message
box — even by one poll interval — `readVisibleResultTotal` sees a stale marker
plus `afterPositive.summaryCount: 2` and throws
`CaleProcure result state shows both results and no-results`. That is a
`fail()`, which is global: the whole run aborts with a message that describes a
portal contradiction which does not exist.

`INFERENCE` — this is not a rare path. The unit order is `coaching`,
`leadership development`, `executive coaching`, `organizational development`,
`change management`, `facilitation`, … `facilitation` is a known positive and
`coaching` is a known zero, so **every run contains at least one zero → positive
transition**, and the diagnostic proves the marker is on screen across it. The
only unknown is whether summary-render and message-clear land in the same DOM
update. Twice in this task a "probably atomic" assumption has been wrong.

`RECOMMENDATION` — required, and it is a simplification consistent with item 2's
own principle. Under the proposal a visible marker is **never** evidence of
anything, so `readVisibleResultTotal` must stop consulting it:

```ts
async function readVisibleResultTotal(page: Page): Promise<number> {
  const summaryTexts = await page
    .getByText(/^Showing Results /)
    .filter({ visible: true })
    .allInnerTexts();
  return parseCaleProcureResultTotal(summaryTexts);
}
```

`INFERENCE`. Dropping the `noResultsVisible` parameter and its two branches is
safe at both call sites: `readVisibleResultTotal` runs only when
`resultEvidence === 'visible'` (which under the proposal requires a summary) and
in `readBaseline` (320 results, summary present), so `totals.size === 1` holds
in both. If Codex prefers to keep the parameter for its existing pure-function
tests, it must be passed a literal `false` — what must not survive is a live
marker read feeding a throwing branch. Keeping a production-dead `true` branch
is the weaker option; I would delete it and its test.

---

## 3. Q2 — does mandatory response provenance preserve the two-evidence gate?

**The intent is preserved and made exact. The gate's diagnostic value changes,
and that needs to be acknowledged rather than assumed away.**

`INFERENCE`. The intent — a zero and a positive established by mechanisms that
cannot impersonate each other — is not merely preserved, it becomes structural:

- zero ⟸ query-bound HTTP 200 JSON tuple, keyword-matched, arity-checked;
- positive ⟸ visible summary → count/row reconciliation → per-row identity
  verification against the detail page.

Neither can produce the other's conclusion, and the contradiction guard still
fires when they disagree.

`INFERENCE` — the cost, which R20 gate 5 did not anticipate. `resultEvidence`
becomes a function of `resultCount === 0`, so "one shadow exercises both
`resultEvidence` values" degenerates to "one shadow has at least one zero and at
least one positive." That is automatic given `facilitation` and no longer tests
anything independently. It should be replaced, not merely restated — see M-2.

**Is another query-bound visible-zero mechanism required? No.** One is
*available* and I am explicitly not recommending it now:

`INFERENCE`. Gating visible-zero acceptance on the marker being **absent in the
sample taken immediately before the Search click** would make a marker appearing
during the search query-bound by construction. It covers every zero that follows
a positive or the baseline — including unit 1, `coaching`, which follows the
320-row baseline — and does not cover a zero following a zero. `RECOMMENDATION`:
do not build it. It adds per-search state and a subtle invariant for partial
coverage, and the response tuple is proven on both keywords ever measured.
Record it as the designated fallback if the response path later proves flaky.

`RECOMMENDATION` — take this instead, at negligible cost: record the marker's
visibility as a **non-authoritative diagnostic** on each observation, e.g.
`visibleEmptyMarker: boolean` in `diagnostics` only. Not in `coverage.evidence`
— that object is key-restricted (§2) and would throw on ingest. The collector
never acts on it; an operator reading a failed run can then see whether the
portal rendered a marker at all, which is exactly the information the proposal
otherwise discards and exactly what would have shortened R16 through R20.

### M-1 · "visible summary/grid" is ambiguous as a terminating condition · Medium

`FACT`. Today `waitForSearchOutcome` terminates a positive on `summaryCount > 0`
alone; the grid appears only in the contradiction guard.

`INFERENCE`. Item 2's phrase "a positive is terminal only from a visible
summary/grid" reads as `summary || grid`. If implemented that way, a grid
rendering before its summary terminates the loop, and `readVisibleResultTotal`
immediately throws `ambiguous: 0 distinct visible totals` — fail-closed, but the
error names the wrong problem and the run aborts.

`RECOMMENDATION`. Keep `summaryCount > 0` as the sole terminating condition and
leave the grid in the contradiction guard only. State it that way in the change
so it is not re-litigated.

---

## 4. Q3 — missing regressions and gates

### M-2 · gate 5 degenerates and must be replaced · Medium

`RECOMMENDATION` — replace R20 gate 5 with four assertions over the shadow
summary, each cheap and each falsifiable:

1. Every unit with `resultCount === 0` reports `resultEvidence: 'response'`.
2. Every unit with `resultCount > 0` reports `'visible'` and reconciles
   (`extractedRows === resultCount`).
3. The contradiction guard never fires.
4. **At least one positive unit immediately follows a zero unit** — the
   transition that exercises stale-marker tolerance and the one H-1 lives in.
   The unit order makes this automatic; assert it in the shadow review rather
   than assume it.

`RECOMMENDATION` — and one free, precise prediction that proves the change took
effect: **`coaching` must report `resultEvidence: 'response'`, `resultCount: 0`
in the next shadow.** It reported `'visible'` in shadow 1 under `d583631`. If it
still reports `'visible'`, item 2 did not land.

### Missing regressions

The proposal's four tests are right. Four more are needed, and the first two are
the direct regressions for the two changes being made:

1. **`waitForCaleProcureResultStateCleared` returns while the marker stays
   visible.** `FACT` — the existing fake cannot express this:
   `resultStatePage`'s locator hard-codes `kind === 'empty' ? 0 : 1`
   (`browser-port.test.ts:17`), so the marker count is always `0` and the current
   cleared-state test would pass unchanged whether or not item 1 is implemented.
   Add a persistent-marker mode.
2. **A positive search with the stale marker still visible reconciles.** The
   direct regression for H-1: `emptyCount` 1 throughout, `summaryCount` 2,
   `gridCount` 1, asserting `resultEvidence: 'visible'`, the summary total, and
   `rows.length === resultCount`. This test fails against the proposal as
   written and passes with H-1 applied — which is the point of writing it.
3. **Consecutive zeros.** Unit N zero (marker appears), unit N+1 zero (marker
   already present) → still `'response'`, `resultCount: 0`, `rows: []`. Proves
   the stale marker neither terminates nor blocks the next query.
4. **No production input can reach the "both results and no-results" branch** —
   either by deleting the branch with the parameter, or by asserting
   `readVisibleResultTotal` passes `false`.

### Carried, still open, below the requested bar

`FACT`. The bounded-timeout test still constructs the port with `timeoutMs: 1`,
putting three one-millisecond deadlines in one `search()` call. It passes here
but can fail against a different, also-correct error under load. R20 §3; ~`50`
fixes it.

---

## 5. Acceptance tests for the R21 change

**Unit** — the proposal's four, plus the four in §4. The change is not complete
until §4.2 passes, since it is the only test that distinguishes the proposal
implemented correctly from the proposal implemented literally.

**Shadow, in order:**

1. Shadow 1 reaches unit 2 — i.e. `prior result state did not clear before
   timeout` does not recur. This is the single fact shadow 1 was stopped by.
2. `coaching` reports `resultEvidence: 'response'`, `resultCount: 0`.
3. The zero → positive transition completes without
   `shows both results and no-results`.
4. `facilitation` yields event `0000039985` with BU `3820`, one reconciled row,
   `resultEvidence: 'visible'`.
5. Complete 9/9, three consecutive runs, each inside 50% of `timeout_ms` —
   credible at the measured 2578 ms per unit.
6. Unchanged: baseline non-zero and reconciled; B-1 disproof (two units with
   different totals produce different observations); no unit reports
   `reconciliation_failed`; an induced failure preserves earlier units; no
   Chrome tab growth.

**Live** — unchanged: one `complete` receipt, nine observed units, zero missing;
`0000039985` present with no operator assistance; a `complete` nine-unit
zero-row run while that event is visible remains **forbidden**; review gate
stays `0`.

`INFERENCE`. `0000039985` closes **2026-08-13**. Shadow 1 consumed 74.75 s and
failed at a now-understood cause; there is time, provided H-1 lands in the same
change rather than as a second cycle.

---

## 6. Commands, limitations, response file, owner decisions

`FACT` — `REPRODUCED`: `git log --oneline -3`, `git status --porcelain` (clean
except this round's request), and read-only `grep`/`Read` over
`src/procurement-browser-port.ts`, `src/procurement-browser-port.test.ts`,
`src/procurement-caleprocure-collector.ts`, `src/procurement-intake.ts`, and
`date`. No tests were run this round — the tree is unchanged from the reviewed
release and R20 already recorded 22/22 passing at `d583631`.

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary;
typecheck, formatting, build, and the full suites remain Codex's to attest.

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R21.md
```

No source, test, script, migration, prompt, procedure, continuity file, task
state, or other report was edited.

**No new owner decision.** Migration 116, source expansion, review cards,
proposals, and submission remain off and untouched. OD-5 remains resolved; OD-4
remains answered by execution pending the live gates; **OD-1**, **OD-2**,
**OD-3** remain open, migration-116-scoped, and fail-closed.

Approximately 11 minutes wall-clock, 2026-08-10T04:35Z–04:46Z. This CLI wrapper
exposes a cumulative session budget rather than a per-round figure, so this
round's marginal cost is not separately observable and is not estimated.
