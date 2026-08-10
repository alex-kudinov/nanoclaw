# NC-20260809-003 — R21 implementation review, Claude R22

- Round: R22, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R22.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T04:47Z–04:55Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base commit
  `d583631`, uncommitted delta in `src/procurement-browser-port.ts`,
  `src/procurement-browser-port.test.ts`,
  `src/procurement-caleprocure-collector.ts`,
  `src/procurement-caleprocure-collector.test.ts`
- Change class: C0 bounded review. No production, database, browser, network,
  vault, or secret access; no `.env*`, credential, session, browser-profile,
  log, row, machine-local setting, or task-payload content read; nothing
  implemented, committed, or deployed. All three Procurement gates remain `0`;
  no collection, review, decision, proposal advancement, or submission occurred.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: GO FOR COMMIT AND SUPERSEDING IMMUTABLE SHADOW RELEASE

R21 H-1 and M-1 are implemented exactly, including the parts that were
subtractions rather than additions. Nothing at blocker or high. One **Medium**,
and it is about the tracked record rather than the code: R21 M-2's replacement
gate set does not exist anywhere yet, and the restarted shadow is worthless
without it.

The strongest evidence that this delta does what it claims is that three of its
new tests are **discriminating** — each fails against the code being superseded
(§4). That is not true of most regressions added under time pressure, and it is
what makes this reviewable rather than merely assertable.

---

## 1. Q1 — stale-marker false acceptance or false contradiction

**Neither is reachable.** The marker is no longer read by any decision path.

`FACT`. Three removals, each verified in the final file:

| Site | Before | After |
| --- | --- | --- |
| `waitForCaleProcureResultStateCleared` (`:94-105`) | `summaries === 0 && empty === 0 && grid === 0` | `summaries === 0 && grid === 0` |
| `waitForSearchOutcome` (`:235-250`) | terminated on `summaryCount > 0 \|\| emptyCount > 0` | terminates on `summaryCount > 0` |
| `readVisibleResultTotal` (`:110-116`) | passed a live marker count into a throwing branch | reads summaries only |

`FACT`. `parseCaleProcureResultTotal` (`:118-131`) no longer takes
`noResultsVisible`, and both branches it guarded — the
`shows both results and no-results` throw and the `return 0` — are gone.
This is R21 H-1 implemented as a deletion, which is the form I asked for and the
harder one to get right.

`INFERENCE` — false acceptance is now impossible by construction, not by
argument: `waitForSearchOutcome` holds no marker locator at all, so no ordering,
timing, or staleness condition can make a marker terminate a query.

`INFERENCE` — false contradiction is likewise gone. The guard is
`proved && (summaryCount > 0 || gridCount > 0)` (`:243-248`), and both of those
artifacts are **verified cleared** before every search: `afterClear` reported
`summaryCount: 0, gridCount: 0`, and `waitForCaleProcureResultStateCleared`
proves it each time. The marker was the only artifact Clear does not remove, and
it is the only one no longer consulted. The design and the evidence now line up
exactly.

`INFERENCE` — a robustness property worth recording, because it inverts the
premise this task ran on for eight rounds: if CaleProcure ever *stops* rendering
the marker, nothing breaks. Zeros come from the response tuple either way. The
code is now correct under both the "hidden UI" reading and the "rendered but not
query-bound" reading, which is why it should be stable even if the portal
changes again.

`INFERENCE` — the accepted residual, restated so it is not rediscovered as a
surprise: with the marker inert, **the response tuple is the single evidence
path for every zero**. If it fails to arrive, the unit times out and the run
aborts — fail-closed, but run-ending. R21 §3 designated the fallback if that ever
proves flaky (gate visible-zero acceptance on the marker being absent in the
sample taken immediately before the Search click). No action now.

---

## 2. Q2 — response listener and ordering races

**None introduced.** The listener block is unchanged from the release verified
in R19 §2 and R20: installed before the click, removed in `finally`, guarded by
`acceptingResponses`, writing a monotonic boolean, with `.catch` on the floating
`json()` promise, all `search()`-local.

`FACT`. The only new code near it is the `visibleEmptyMarker` read
(`port:498-502`), and it sits **after** the `try/finally`, so it can neither
observe nor perturb the listener's lifecycle.

`FACT`. The sample points differ by path and it does not matter: for
`'response'` the marker is read immediately after the outcome loop; for
`'visible'` it is read after `readVisibleResultTotal` and `readVisibleRows`, two
extra DOM round-trips later. The field is non-authoritative in both cases.

`INFERENCE`. Expected production values are `true` for a zero and `false` for a
positive — the diagnostic recorded `afterZero.emptyCount: 1` and
`afterPositive.emptyCount: 0`. A `true` on a positive would be new information,
which is exactly what the field is for.

---

## 3. Q3 — validation and public diagnostic consistency

`FACT`. `visibleEmptyMarker` is required on both
`CaleProcureSearchObservation` (`collector:25`) and
`CaleProcureUnitDiagnostic` (`collector:53`), validated as a boolean at
`collector:201-206`, and threaded into **all four** diagnostic push sites —
`reconciliation_failed` (`:223`), `row_budget_exceeded` (`:239`),
`identity_verification_failed` (`:291`), and `observed` (`:311`). No path emits
a diagnostic without it.

`INFERENCE`. The validation is correctly placed: after the `resultEvidence`
check and before the metadata check, in the global-`fail()` group. A
non-boolean here is a violation of the port's declared type, not an observation
about the portal — the same structure-rejects/content-derives boundary R15 §3
established.

`FACT` — the trap that was avoided, and it is the one that would only have
surfaced in live. `coverage.evidence[keyword]` still writes exactly
`{ resultCount, pagesVisited }` (`collector:303-306`), and
`normalizeCoverageEvidence` (`procurement-intake.ts:439-449`) throws
`CaleProcure coverage receipt is invalid` on **any** other key. Adding
`visibleEmptyMarker` there would have passed every shadow — shadow mode never
calls `ingest` — and failed on the first live run. It is not there.

`FACT`. The field reaches the operator: `publicSummary` carries
`units: collection.diagnostics`, so `visibleEmptyMarker` appears in both the
success summary and the shadow partial summary added in R19.

### Below the requested bar, recorded

`FACT` — **Low.** The `visibleEmptyMarker` read is unguarded. A `count()` that
throws fails an otherwise-complete search, and `collector:176-182` makes that
global. The realistic trigger is a page crash, which fails everything anyway, so
the marginal risk is small — but instrumentation should not be able to fail the
measurement it describes. `.catch(() => false)` is the whole fix, and it is
cheaper now than after it bites.

`FACT` — **Low.** No comment marks the field as non-authoritative. Given that
five rounds of this task were driven by a marker measurement being trusted, one
line at `collector:53` — *diagnostic only; never evidence; the marker is not
query-bound* — is worth more than its length.

`FACT` — **Low.** `waitForResultState` (`:196-210`) still terminates on a bare
marker. It is reached only from `open()`, immediately after a fresh
`goto(SEARCH_URL)`, so no stale state can exist there, and `readBaseline`
checks `inputValue() !== ''` before reading any total — so a session with
restored PeopleSoft criteria fails with `CaleProcure baseline is filtered`,
the correct message. Not a defect; it is now the only place in the file that
still treats a bare marker as terminal, which is worth a comment or an
alignment.

---

## 4. Q4 — do the fakes exercise their stated production paths?

**Yes, and three of them discriminate.** `FACT` — `REPRODUCED`: `npx vitest run`
over the three focused files → **26 tests / 3 files pass** (browser-port 16,
collector 8, job 2), matching R22 exactly. `npm run docs:continuity-check`
passes at 49 rows / 45 entries, and `git diff --check` is clean.

`INFERENCE` — the discrimination check, which is the one that matters. Each of
these fails against `d583631`:

| Test | Against `d583631` |
| --- | --- |
| `treats a persistent empty marker as non-authoritative clear-state residue` | `resultStatePage` returns `empty: 1` forever → the old `empty === 0` requirement never satisfied → throws `prior result state did not clear` |
| `reconciles a positive result while a stale zero marker remains visible` | old `readVisibleResultTotal` passes `noResultsVisible: true` with `Showing Results 1 of 1` → throws `shows both results and no-results` — the exact R21 H-1 failure |
| `search requires response provenance even when a current zero marker is visible` | old loop terminated on `emptyCount > 0` → returned `resultEvidence: 'visible'`; now `'response'` |

`FACT`. `resultStatePage`'s marker count is now driven by `persistentEmpty`
(`test:16-19`) instead of the hard-coded `0` I flagged in R21 §4.1, so the fake
can finally express the state under test.

`FACT`. `zeroResultSearchPage`'s terminal payload is now built from the live
`inputValue` (`test:63-65`) rather than a hard-coded `'coaching'`. That is what
makes the consecutive-zeros test real: the second search's tuple echoes
`leadership development`, so the test proves keyword binding across two searches
on one page rather than re-proving it for one keyword.

`FACT`. The consecutive-zeros test genuinely traverses the sequence that broke
shadow 1 — search 1 sets the marker, Clear leaves it up
(`persistEmptyAfterClear: true`), `waitForCaleProcureResultStateCleared` returns
anyway, and search 2 resolves from its own response tuple with
`visibleEmptyMarker: true`.

### Two fakes that overstate slightly — Low

`FACT`. `does not accept a stale visible zero marker without a query-bound
response` passes `persistEmptyAfterClear: true`, but no prior search has run, so
`emptyMarkerVisible` is `false` at Clear and the option is inert. The marker it
produces is *current*, not stale. `INFERENCE` — the assertion is still correct
and the production path is still covered, because after this delta no code can
distinguish a stale marker from a current one: the locator is gone from the
loop. The genuinely-stale variants are covered by the other two tests. Naming
precision, not a coverage gap.

`FACT`. The `advisory` payload still hard-codes `eventName: 'coaching'`
(`test:101-106`). In search 1 it is rejected for the intended reason — matching
keyword, `box_error_items` present but no `text`. In the consecutive-zeros
second search it is rejected on the keyword instead, so that search does not
re-exercise the advisory path. Search 1 covers it; making `advisory` dynamic
like `terminal()` would cover both.

---

## 5. Q5 — divergence from R21 H-1 / M-1 / M-2

**H-1 — implemented exactly**, including the deletion of the parameter, both
branches, and the two unit assertions that covered them, replaced by
`parseCaleProcureResultTotal([])` → `ambiguous` (`test:552-556`). `INFERENCE`:
the replacement is correct at both call sites — `search()` reaches
`readVisibleResultTotal` only when `summaryCount > 0`, and `readBaseline`
against a 320-result page, so `totals.size === 1` holds in both. A visible
summary element that does not match `SUMMARY_RE` now throws instead of silently
returning `0`, which is the intended fail-closed direction.

**M-1 — implemented exactly.** `summaryCount > 0` is the sole terminating
condition; the grid appears only in the contradiction guard (`:243-249`).

### M-2 — the replacement gate set is not in the tracked record · Medium

`FACT`. `git status` shows four modified files, all source or test. No
continuity document changed, and `docs:continuity-check` still reports the same
49 rows / 45 entries as at `d583631`.

`INFERENCE`. R22 states that continuity, release, and the restarted shadow all
wait on this review, so this is sequencing rather than omission — but the
sequence matters. R21 M-2 replaced a gate that this very delta invalidates:
`resultEvidence` is now a function of `resultCount === 0`, so R20 gate 5
("one shadow exercises both values") tests nothing. Restarting the three-shadow
gate against the old criteria would spend three runs measuring the wrong thing.
Per `CLAUDE.md`, the tracked record — not this exchange — is authoritative; if
the replacement lives only in R21, the shadow reviewer has no instruction to
check it.

`RECOMMENDATION` — land these in the continuity update **before** the restarted
shadow, not after:

1. Every unit with `resultCount === 0` reports `resultEvidence: 'response'`.
2. Every unit with `resultCount > 0` reports `'visible'` and reconciles
   (`extractedRows === resultCount`).
3. The contradiction guard never fires.
4. At least one positive unit immediately follows a zero unit — the transition
   R21 H-1 lived in. The unit order makes it automatic; assert it, do not
   assume it.
5. **`coaching` reports `resultEvidence: 'response'`, `resultCount: 0`,
   `visibleEmptyMarker: true`.** It reported `'visible'` under `d583631`. This
   is the cheapest proof the delta took effect, and `visibleEmptyMarker` now
   makes it a three-part assertion instead of two.

`INFERENCE`. Shadow 1's first observable checkpoint is unchanged and remains the
one to watch: it must reach unit 2 — `prior result state did not clear before
timeout` must not recur.

---

## 6. Required regressions

**None required for commit.** The seven listed in R22's mechanics all exist and
three discriminate (§4). The two Lows in §4 and the three in §3 are worth
folding in opportunistically; none blocks.

---

## 7. Commands, limitations, response file, owner decisions

`FACT` — `REPRODUCED`:

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | **26 tests / 3 files pass** (browser-port 16, collector 8, job 2) |
| `npm run docs:continuity-check` | pass — 49 active/ready task rows, 45 changelog entries |
| `git diff --check` | clean |
| `git status --porcelain`, `git diff`, `grep`/`sed`/`Read` over the four changed files plus `src/procurement-intake.ts`, `date` | read-only |

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so the
complete suite, typecheck, build, and formatting remain Codex's to attest. The
three focused files and the continuity script have no native dependency and ran
under ambient Node v26.6.0.

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R22.md
```

No source, test, script, migration, prompt, procedure, continuity file, task
state, or other report was edited.

**No new owner decision.** Migration 116, source expansion, review cards,
proposals, and submission remain off and untouched. OD-5 remains resolved; OD-4
remains answered by execution pending the live gates; **OD-1**, **OD-2**,
**OD-3** remain open, migration-116-scoped, and fail-closed.

`INFERENCE`. `0000039985` closes **2026-08-13**. The remaining critical path is
the continuity update carrying §5's gate set, the immutable release, and three
shadows — with shadow 1's first checkpoint being that it reaches unit 2.

Approximately 8 minutes wall-clock, 2026-08-10T04:47Z–04:55Z. This CLI wrapper
exposes a cumulative session budget rather than a per-round figure, so this
round's marginal cost is not separately observable and is not estimated.
