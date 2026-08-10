# NC-20260809-003 — R18 repair review, Claude R19

- Round: R19, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R19.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T04:00Z–04:20Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base commit
  `a69f0ff1a372`, uncommitted delta in `src/procurement-browser-port.ts`,
  `src/procurement-browser-port.test.ts`,
  `src/procurement-caleprocure-job.ts`,
  `src/procurement-caleprocure-job.test.ts`, plus the two continuity documents
- Change class: C0 bounded review. No production, database, browser, network,
  vault, or secret access; no `.env*`, credential, session, browser-profile,
  log, row, or task-payload content read; nothing implemented, committed, or
  deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: NO-GO — one regression introduced by this delta, five lines to fix

The architecture is now right, and this round did the hard part correctly. The
diagnostic settled R18 H-1 exactly as hoped, the listener-plus-outcome-loop
design closes both races with no lifecycle leak, the positive path is
*structurally* independent of the response rather than merely observed to be,
and the cause chain finally makes a failure legible. Four of the five R19 claims
hold as stated.

The NO-GO is one condition in one `if`:

```ts
if (responseProvesZero() && (summaryCount > 0 || emptyCount > 0 || gridCount > 0))
  throw new Error('CaleProcure response proves no results but the page shows a result state');
```

`emptyCount > 0` means *the page also says there are no results*. That is
**agreement with the response, not contradiction.** A portal that correctly
renders its own no-results marker and correctly returns the terminal zero
payload now throws a hard error and fails the entire run. `a69f0ff` checked
summaries and grid only and deliberately excluded the empty marker; this delta
added it.

This interacts with a second finding in a way that matters more than either
alone: whether it fires today depends on whether the DOM marker string still
matches, and the new diagnostic evidence says it probably does not — so **fixing
H-2 arms H-1**. Both need to land together.

Answers in order: **(1)** yes, R18 H-1 and H-2 are closed, and the diagnostic
isolated my hypothesis (c) precisely; **(2)** yes, both races closed, no leak —
source-verified; **(3)** the positive path is genuinely independent and the
terminal zero is fail-closed under malformed shape, but the delta introduces a
*correct* zero that hard-fails (H-1) and a narrow false-zero window (M-1);
**(4)** yes, and live receipt semantics are provably unchanged; **(5)** two
High, two Medium, two Low below.

---

## 1. Q1 — do the diagnostics and the full-string correction close R18 H-1/H-2?

**Yes, and cleanly.**

`FACT`. R18 §1.2 enumerated three causes that produced an identical failure
line and noted the delta then on the table repaired only the first. The
diagnostic returned exactly one matching fixed-path POST per Search, HTTP 200
JSON, exactly one `eventName` capture equal to the query — refuting (a) and (b)
— and found the terminal message to be
`No event met your search criteria. Please change your search criteria and try
again` against a parser expecting only its first six words. That is R18 §1.2
cause **(c)**: the right response won, passed the gates, and its in-page body did
not match the tuple captured by the standalone diagnostic.

`FACT`. `port:28-29` now holds the full string as `NO_RESULTS_RESPONSE_TEXT`
and `isCaleProcureZeroResultResponse` compares against it (`:212`). The
whitespace normalization is retained, and the regression at
`browser-port.test.ts:222-228` asserts the padded full string.

`FACT`. R18 H-2 — the positive path depending on response body shape — is closed
**structurally**, which is better than the diagnostic's empirical answer. There
is no longer any `Promise.all` requiring a response: `waitForSearchOutcome`
returns `'visible'` on a visible summary or empty marker with no reference to
any response (`:276`), and the listener only ever sets a boolean. Even if a
results-bearing response were malformed, absent, non-JSON, or duplicated, the
positive path is unaffected. The diagnostic's finding that `facilitation`'s
response is well-formed is now a nice-to-have rather than a load-bearing
assumption.

`INFERENCE`. Worth recording as the lesson of this round: the string that
failed was a *prefix* of the true string, which is the failure mode a
substring test would have survived and an equality test could not. The delta
correctly kept equality — a prefix or `includes` test would have let a future
`No event met your search criteria for this business unit` pass as a global
zero. Equality against the full captured string is right. That same reasoning is
why H-2 below is a finding rather than a nit.

---

## 2. Q2 — do the listener and outcome loop close the races without a leak?

**Yes on all three counts.** This is the strongest part of the delta.

`FACT` — the mutable-payload race (R18 M-1) is gone by construction. There is no
retained payload. `onResponse` (`port:487-501`) reduces each candidate to a
boolean write `responseProvesZero = true`, which is monotonic: concurrent
predicates can no longer overwrite each other into a wrong answer because the
only writable value is `true`, and it is only written when the full terminal
tuple for the current keyword holds.

`FACT` — the losing-promise hazard is gone. R18 §5.2 warned that a naive
`Promise.race` leaves a `waitForResponse` that rejects later with no handler,
and that this process installs no `unhandledRejection` handler. The delta uses
no `waitForResponse` at all. The only floating promise is
`candidate.json().then(…).catch(() => undefined)` (`:489-500`), whose `.catch`
is unconditional.

`FACT` — no lifecycle leak, verified against the pinned bundle:

- The handler returns `undefined` (the `json()` chain is `void`-ed), so
  `EventEmitter2._callHandler` (`coreBundle.js:10745-10758`) does not retain it
  in `_pendingHandlers`.
- `finally` sets `acceptingResponses = false` **and** calls `off`
  (`port:509-512`), so removal cannot be skipped by a throw from the busy cycle
  or the outcome loop.
- In-flight `json()` promises that settle after removal find
  `acceptingResponses === false` and no-op (`:493-497`); rejections — including
  the target-closed and navigated-away rejections catalogued in R18 §3 — land in
  the `.catch`.
- The flag and the listener are both `search()`-locals, so nothing survives into
  the next keyword. One listener at a time, nine times, each removed. No
  accumulation and no `defaultMaxListeners` pressure.

`FACT` — the ordering property the whole design rests on is correct:
`this.searchPage.on('response', onResponse)` at `:502` executes **before**
`clickAndWaitForBusyCycle` at `:505`, so a response arriving during the busy
cycle is captured rather than missed. This is what the previous
`Promise.all` structure bought with concurrency and what the listener now buys
with registration order.

`FACT` — the timeout budget is unchanged, which I checked because the structure
went from concurrent to sequential. Before: `max(waitForResponse 60s, busy cycle
65s)` then `waitForResultState 60s` ≈ 125s. Now: busy cycle 65s then
`waitForSearchOutcome` 60s ≈ 125s. No regression.

`FACT` — the cheap gates still precede body parsing.
`isCaleProcureSearchResponse` (`:234-248`) applies URL, path, method, status,
and content-type before `onResponse` reaches `json()`, and
`browser-port.test.ts` asserts the 500/`text/html` candidate's `json` spy is
never called. That test is worth keeping precisely because it is the property a
future refactor would silently break.

---

## 3. Q3 — visible positive path independent, terminal zero fail-closed?

Independent: **yes** (§1). Fail-closed under malformed or changed shape:
**yes** — a payload that fails `objectValue`, the capture arity, the query echo,
or the exact message simply never sets the flag, and control falls to the
visible state or to the bounded timeout at `:279`.

But the delta introduces two new problems on the *zero* side, and they are the
reason for the verdict.

### 3.1 H-1 · a correctly-rendered zero now throws — regression

`FACT`. `waitForSearchOutcome` (`:263-278`):

```ts
const summaryCount = await summaries.count();
const emptyCount   = await empty.count();
const gridCount    = await grid.count();
if (responseProvesZero() && (summaryCount > 0 || emptyCount > 0 || gridCount > 0)) {
  throw new Error('CaleProcure response proves no results but the page shows a result state');
}
if (responseProvesZero()) return 'response';
if (summaryCount > 0 || emptyCount > 0) return 'visible';
```

`FACT`. `a69f0ff`'s guard tested `visibleSummaries` and `visibleGrid` only. The
empty marker was excluded, correctly. This delta adds `emptyCount > 0` to the
condition.

`INFERENCE`. The response saying "zero" and the page saying "zero" is the
portal behaving **correctly**. It is the state every one of the nine units
should reach whenever it has no matching events, and `coaching` is the anomaly,
not the template. Under this condition the run does not degrade — `search()`
throws, `collector:176-182` calls `fail()`, which is global, and the whole
collection aborts with a receipt of zero observed units.

`INFERENCE` — this is likely, not theoretical. The unit list
(`procurement-source-config.ts:10-20`) is nine keywords, and five of them —
`executive coaching`, `training leadership`, `team coaching`,
`talent development`, `organizational development` — are narrow multi-word
phrases that will frequently return nothing on a state procurement portal. The
first one whose zero the portal renders correctly ends the run.

`RECOMMENDATION` — **R-1**, one function, five lines, and it also closes M-1:

```ts
const proved = responseProvesZero();                    // sample the flag FIRST
const summaryCount = await summaries.count();
const emptyCount = await empty.count();
const gridCount = await grid.count();
if (proved && (summaryCount > 0 || gridCount > 0)) {
  throw new Error('CaleProcure response proves no results but the page shows results');
}
if (summaryCount > 0 || emptyCount > 0) return 'visible';   // visible evidence wins
if (proved) return 'response';
```

Three changes, each independently justified:

- **`emptyCount` leaves the contradiction condition.** Agreement is not
  contradiction.
- **`visible` is tested before `response`.** When both agree, the stronger
  provenance is recorded, and `'response'` then means precisely "the portal
  rendered nothing at all" — which isolates the portal bug instead of masking
  it. The downstream reads are already correct for this case:
  `parseCaleProcureResultTotal` returns `0` when `noResultsVisible` (`:144`) and
  `readVisibleRows` returns `[]` when no grid is visible (`:246`), so
  reconciliation passes with `resultCount 0, rows []`. A page showing both a
  summary and an empty marker still throws at `:139-143`.
- **The flag is sampled before the counts** — see M-1.

### 3.2 M-1 · the flag is read after the counts, so the guard can be evaded

`FACT`. `responseProvesZero()` is evaluated at `:268` and `:275`, both **after**
the three counts are sampled at `:264-266`.

`INFERENCE`. If the counts are sampled while the page is still blank and the
flag flips true before `:268`, the loop returns `'response'` even though the
page renders results 50 ms later. The contradiction guard never sees them. The
consequence is not an error but a **silent false zero**: the unit is recorded as
observed with `resultCount 0` and no rows, the receipt is `complete`, and the
run under-collects invisibly. That is the exact class the live gate "a
`complete` nine-unit zero-row run while `0000039985` is visible is **forbidden**"
exists to catch, which is why this is Medium rather than High — the control
exists, downstream of the defect.

`INFERENCE`. Sampling the flag first inverts the bias: the counts are then never
older than the flag, so any result state present at or after the moment the
response proved zero is caught. Perfect detection is not available in a polling
design; removing the systematic bias is, at zero cost. Optional further
hardening, if you want the guard to be strong rather than merely unbiased: on
the first iteration where `proved` becomes true with no visible state, sleep one
poll interval and re-sample before returning `'response'`. That costs 100 ms on
the hidden-zero path only.

### 3.3 H-2 · the visible marker string is now known to be a prefix

`FACT`. Two different strings now describe one portal condition:

- `NO_RESULTS_RESPONSE_TEXT` (`:28-29`) — the full sentence, **verified** from a
  live response body by the R18 diagnostic;
- `NO_RESULTS_TEXT` (`:27`) — the first six words, used as the DOM matcher at
  `:99`, `:120`, `:225`, and `:260`, every one of them with `{ exact: true }`.

`FACT`. Playwright's `getByText(string, { exact: true })` matches an element
whose whole normalized text equals the string. An element rendering the full
sentence does not match the short one.

`INFERENCE`. No one has ever observed a rendered CaleProcure zero. `coaching` —
the only zero examined — renders nothing at all, and the unfiltered baseline and
`facilitation` both go through the summary path. So the DOM matcher has, as far
as the record shows, never matched anything. The new evidence that the portal's
message for this exact condition is the long form makes it materially more
likely that the matcher is wrong. Two readings, and I cannot separate them from
here:

- **The DOM renders the long sentence in one node.** Then `emptyCount` is always
  `0`; the empty branch of `waitForCaleProcureResultStateCleared` (`:99`) is
  vacuous; `readVisibleResultTotal` (`:120`) never sets `noResultsVisible`, so a
  rendered zero throws `ambiguous: 0 distinct visible totals`; and
  `waitForSearchOutcome` polls a rendered zero to timeout. All fail-closed, all
  run-ending.
- **The DOM renders the short text in its own node** (PeopleSoft message
  catalogs routinely pair a short message with a longer explanation, and
  `box_error_items` reads like the long one). Then the matcher is fine — and
  **H-1 fires on the first correctly-rendered zero.**

`RECOMMENDATION` — **R-2**, and the same move that just worked: one bounded
read-only diagnostic. Find any keyword the portal renders a zero for — or read
the DOM for `coaching` at the moment the response arrives — and report only the
normalized `textContent` of the no-results node. Then either confirm
`NO_RESULTS_TEXT` or replace the four call sites with a prefix-anchored matcher:

```ts
page.getByText(/^No event met your search criteria/).filter({ visible: true })
```

`INFERENCE`. Relaxing the DOM matcher is safe in a way that relaxing the
*response* matcher would not be (§1): every DOM call site consumes only
`count() > 0` as a boolean, so matching an ancestor as well as the leaf changes
nothing, and `waitForCaleProcureResultStateCleared` only becomes stricter.

---

## 4. Q4 — does the failure evidence change live receipt semantics?

**No, and the change does what R18 asked for.**

`FACT`. `errorMessageChain` (`job:71-83`) is cycle-safe via a `seen` set and
bounded at eight links. `runCli:207` now emits the chain instead of
`error.message`.

`FACT`. Live receipt semantics are provably unchanged. The new branch is
`if (error instanceof CaleProcureCollectionError && shadow)` (`job:120-126`),
placed **before** the pre-existing live branch, which now reads
`if (error instanceof CaleProcureCollectionError)` — reachable only when
`shadow` is false, exactly the old `!shadow && …` condition. The ingest call,
its arguments, and the resulting `CaleProcureJobError` are untouched. A shadow
run never reached the ingest path before and still cannot.

`FACT`. Shadow failures now carry `publicSummary('partial', error.partial)`, so
`runCli:204-206` writes it — the baseline reconciliation, the department-derived
work, and every unit that succeeded before the failure survive a failed shadow
instead of being discarded. R18 H-3 is closed.

`INFERENCE`. The concrete payoff: the three causes from R18 §1.2 now print as
three distinct chains, and the string mismatch that consumed two rounds would
have surfaced as `… <- CaleProcure result state did not appear before timeout`
on its first occurrence.

### L-1 · the chain's first two links are always identical

`FACT`. The shadow wrapper passes `error.message` as the `CaleProcureJobError`
message and the same error as `cause`, so the chain begins
`CaleProcure search failed for "coaching" <- CaleProcure search failed for
"coaching" <- hidden result state` — as the new job test asserts verbatim
(`job.test.ts:35-37`). Harmless, but it burns one of eight links and adds noise
at the moment the line is being read under pressure. Either give the wrapper a
distinct message or de-duplicate consecutive identical links in
`errorMessageChain`.

---

## 5. Q5 — findings, and what is still missing

| ID | Severity | Finding |
| --- | --- | --- |
| H-1 | High | `emptyCount` in the contradiction condition turns a correctly-rendered zero into a run-ending error; regression against `a69f0ff` (§3.1) |
| H-2 | High | The DOM matcher `NO_RESULTS_TEXT` with `{ exact: true }` is now known to be a strict prefix of the portal's message for the same condition; the visible-zero path is unverified, and fixing it arms H-1 (§3.3) |
| M-1 | Medium | `waitForSearchOutcome` samples the zero flag after the counts, so a result state appearing between the samples yields a silent false zero (§3.2) |
| M-2 | Medium | The contradiction path, the outcome-loop timeout, the visible-zero path, and a cross-keyword terminal payload are all untested (§5.1) |
| L-1 | Low | Cause chain duplicates its first link on the shadow-wrap path (§4) |
| L-2 | Low | `response.headers()` remains the deprecated accessor (`coreBundle.js:59613-59616`); carried from R18, unchanged |

### 5.1 M-2 · missing tests

`FACT` — `REPRODUCED`. `npx vitest run` over the three focused files →
**19 tests / 3 files pass** (browser-port 9, collector 8, job 2), matching R19
exactly. `npm run docs:continuity-check` passes — 49 active/ready task rows, 45
changelog entries.

`FACT`. The two new `search()` cases are the right ones and they earn their
keep: the zero case proves gate short-circuiting, advisory rejection, terminal
acceptance, and listener removal in one assertion set; the positive case proves
response-independence. The `Reflect.construct` seam is reused rather than
reinvented.

`FACT`. Four paths remain uncovered, and they are the ones the findings above
live in:

1. **The contradiction throw** (`:271-273`) — never executed by any test. It is
   the guard protecting against a false zero and the exact line H-1 and M-1
   concern. `zeroResultSearchPage`'s `empty` locator returns `0`
   unconditionally, so no test can currently reach it.
2. **The outcome-loop timeout** (`:279`) — the fail-closed path when neither
   evidence arrives, untested.
3. **The visible-zero path** — a page rendering the empty marker with no
   summary, asserting `resultEvidence: 'visible'`, `resultCount: 0`, `rows: []`.
   **This test fails against the current code**, which is precisely why it
   should exist: it encodes H-1 as an executable claim.
4. **A cross-keyword terminal payload** — a well-formed zero tuple for a
   *different* keyword arriving during this search must not set the flag. The
   parser enforces it, but `search()` never asserts it, and this is the shape
   that would produce a false zero on a keyword with real results.

---

## 6. Gates

R18 H-1, H-2, H-3, M-1, and M-2 are all closed by this delta. The blocking work
before commit and immutable release:

1. **R-1** — the five-line `waitForSearchOutcome` repair (§3.1), which closes
   H-1 and M-1 together.
2. **R-2** — one bounded read-only diagnostic reading the DOM text of a rendered
   no-results marker, then either confirming `NO_RESULTS_TEXT` or anchoring the
   four call sites (§3.3).
3. The four tests in §5.1, including the one that currently fails.

Then, unchanged from R14 §6 / R15 §5 / R17 / R18 §7:

4. Three consecutive complete 9/9 shadows, each inside 50% of `timeout_ms`,
   baseline non-zero, `extractedRows === resultCount`.
5. Two units with different result totals produce different observations — the
   B-1 disproof, still non-negotiable.
6. No unit reports `reconciliation_failed`.
7. `facilitation` yields event `0000039985` with BU `3820`; an induced failure
   preserves earlier units; no Chrome tab growth across the three runs.
8. One shadow exercises **both** `resultEvidence` values. `INFERENCE` — after
   R-1 this gate gets sharper, not weaker: `'response'` will then mean only
   "the portal rendered nothing," so seeing it at all is itself the evidence
   that the CaleProcure UI defect is real and that the response path is the only
   thing standing between it and a silent under-collection.

**Live** is unchanged: one `complete` receipt, nine observed units, zero missing;
`0000039985` present with no operator assistance; a `complete` nine-unit
zero-row run while that event is visible remains **forbidden**; review gate
stays `0`.

`INFERENCE`. `0000039985` closes **2026-08-13**. R-1 and the tests are one
sitting; R-2 is the same apparatus that resolved this round in a single run. The
budget is adequate if both go in the same pass rather than sequentially.

---

## 7. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | `REPRODUCED` — **19 tests / 3 files pass** |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, 49 rows / 45 entries |
| `git log --oneline -3`, `git status --porcelain`, `git diff --stat`, `git diff -- src/…` | Read-only |
| `grep` over `src/*.ts` for `NO_RESULTS_TEXT`, `plannedCaleProcureUnits`, `resultEvidence` | Read-only |
| `grep`/`sed` over `node_modules/playwright-core/lib/coreBundle.js` | Read-only; `:10699-10790`, `:59580-59660` |
| `date` | Read-only |

Files read this round: the R19 request, the four named source/test diffs in
full, `src/procurement-caleprocure-collector.ts` (failure path and
`resultEvidence` threading), `src/procurement-source-config.ts` (unit list), the
final `src/procurement-browser-port.ts` regions this delta touches, and the R18
request and response. `docs/ACTIVE-WORK.md` and
`docs/ENGINEERING-CHANGELOG.md` were exercised through the continuity check
rather than read line by line — they are outside the named review scope.
Everything else is carried from R13–R18 and was not re-read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so I
did not run `npm run typecheck`, `format:check`, the build, the root suite, or
the runner suite. The three focused files and the continuity script have no
native dependency and ran under ambient Node v26.6.0. Those results remain
Codex's to attest.

`FACT`. No CDP endpoint and no network were reachable. H-2 is therefore stated
as unresolved in both directions: I can show the two strings now disagree and
that one of them is verified while the other is not, and I cannot determine
which reading is true from here. That is what R-2 is for.

`FACT`. Playwright citations are line offsets into the single bundled
`lib/coreBundle.js`; exact for this installed version, void after an upgrade.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R19.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Owner decisions

**No new owner decision.** Migration 116 and source expansion are untouched and
this delta creates no conflict with either. OD-5 remains resolved; OD-4 remains
answered by execution pending the live gates; **OD-1**, **OD-2**, **OD-3**
remain open, migration-116-scoped, and fail-closed.

### Elapsed time and cost

Approximately 20 minutes wall-clock, 2026-08-10T04:00Z–04:20Z: reading the
request and the four diffs, tracing the listener lifecycle against the installed
bundle, checking the outcome loop's sampling order and the two no-results
strings, two verification runs, and one file write. This CLI wrapper exposes a
cumulative session budget rather than a per-round figure, so this round's
marginal cost is not separately observable and is not estimated.
