# NC-20260809-003 — Post-R19 repair review, Claude R20

- Round: R20, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R20.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T04:20Z–04:29Z
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

# Verdict: GO for commit, immutable deployment, and the unchanged three-shadow gate

All three R19 findings are closed, and two of them are closed better than I
proposed. One Medium remains — not a defect in the repair but a direct
consequence of it, and one the next shadow will answer unambiguously. Nothing at
blocker or high.

---

## 1. R19 findings — closure

**H-1 · `emptyCount` in the contradiction condition — closed.**
`FACT`, `port:263-277`:

```ts
const proved = responseProvesZero();
const summaryCount = await summaries.count();
const emptyCount = await empty.count();
const gridCount = await grid.count();
if (proved && (summaryCount > 0 || gridCount > 0)) { throw … }
if (summaryCount > 0 || emptyCount > 0) return 'visible';
if (proved) return 'response';
```

The empty marker no longer contradicts a response zero; visible evidence is
preferred when both agree; the flag is sampled before the counts. All three
changes from R19 §3.1 landed exactly.

`INFERENCE`. The ordering now gives `'response'` a precise meaning — *the portal
rendered no result state at all* — rather than "the response answered first."
That makes the R18 §7 gate-8 requirement (one shadow exercising both evidence
values) both satisfiable and informative: `coaching` will report `'response'`
and `executive coaching` will report `'visible'` in the same run, which is
itself the evidence that the CaleProcure rendering defect is real and
keyword-specific rather than universal.

**H-2 · the no-results string — closed, and better than my proposal.**
`FACT`. `port:27-28` now holds one constant carrying the full verified sentence,
used at all four DOM call sites (`:98`, `:119`, `:227`, `:260`) and by
`isCaleProcureZeroResultResponse` (`:212`). `NO_RESULTS_RESPONSE_TEXT` is gone.
`FACT` — `REPRODUCED`: `grep` finds the string in exactly one non-test location.

`INFERENCE`. I recommended two constants and a prefix-anchored DOM matcher. The
diagnostic made that unnecessary and the single-constant form is strictly
better: the DOM diagnostic on `executive coaching` observed the visible
normalized string to *equal* the response string, so one constant now expresses
one fact, and equality is retained on both sides. A prefix matcher would have
accepted a future `No event met your search criteria for this business unit` as
a global zero — the exact failure mode §1 of R19 argued against. Keeping
equality on both sides was the right call.

`INFERENCE`. Playwright's `getByText(text, { exact: true })` normalizes
whitespace before comparing, and `isCaleProcureZeroResultResponse` applies
`replace(/\s+/g, ' ').trim()`. Both sides normalize the same way, including
` `, so the DOM and response comparisons cannot diverge on spacing.

**M-1 · sampling order — closed** (`:264`, above).

**M-2 · missing tests — closed.** `FACT` — `REPRODUCED`: `npx vitest run` over
the three focused files → **22 tests / 3 files pass** (browser-port 12,
collector 8, job 2), matching R20 exactly. All four requested cases exist and
assert the right things:

| R19 gap | Test | Asserts |
| --- | --- | --- |
| visible zero | `prefers an agreeing visible zero over response provenance` | `resultEvidence: 'visible'`, `resultCount: 0`, `rows: []` |
| contradiction | `rejects a response zero that contradicts visible results` | throws, **and** listener removed |
| bounded timeout | `times out fail-closed when neither evidence path appears` | throws, **and** listener removed |
| cross-keyword tuple | `ignores another keyword zero and uses the reconciled visible row` | a full `coaching` terminal tuple arriving during `search('facilitation')` does not set the flag; the visible row reconciles |

`FACT`. The cross-keyword case is the strongest of the four: the fake emits a
*complete, well-formed* terminal zero tuple for a different keyword, so the test
proves the keyword binding — not merely the shape check — is what prevents a
false zero on a keyword with real results.

`FACT`. Two of the three failure-path tests also assert
`responseListenerCount() === 0`, so the `finally` removal is now proven on the
throw paths, not just the success path.

**L-1 · duplicated chain link — closed.** `FACT`. Both branches now pass
`{ cause: error.cause }` (`job:122`, `:138`), and the job test asserts the
de-duplicated chain `CaleProcure search failed for "coaching" <- hidden result
state`. `FACT` — `REPRODUCED`: `grep` over `src/` finds no consumer of
`CaleProcureCollectionError` outside the collector and job, so dropping that
instance from the chain breaks nothing, and `error.partial` still reaches the
operator through `partialSummary`.

---

## 2. Remaining issue at the requested bar

### M-1 · the clearing check's empty-marker branch is now load-bearing for the first time

`FACT`. `waitForCaleProcureResultStateCleared` (`:90-115`) requires the empty
marker's count to reach `0` after Clear Criteria, and it runs at the start of
every `search()`. Until this delta the matcher used the six-word prefix and
therefore — per the R19 evidence and the diagnostic that followed — matched
nothing. That branch has been vacuous for its entire life. It is now real.

`INFERENCE`. The consequence is a new precondition the shadow has never tested:
after any unit whose zero the portal *renders* — and the diagnostic proved
`executive coaching` is one — the **next** unit's Clear Criteria must remove
that marker within `timeoutMs`, or the run aborts with
`CaleProcure prior result state did not clear before timeout`. Five of the nine
planned units are narrow multi-word phrases, so at least one rendered zero
followed by another unit is close to certain in any run.

`INFERENCE` — I expect this to pass, and I want the prediction on record so the
shadow is interpretable either way. Clear Criteria demonstrably removes the
baseline's 320-row grid and its summary — that path has run in every shadow to
date — and a PeopleSoft page region that resets its grid almost always resets
its message box with it.

`INFERENCE` — and this is why it is not a blocker: the check is **correct to
have**, and activating it closes a real hole. A marker surviving Clear would
otherwise let `waitForSearchOutcome` return `'visible'` on its first iteration
for the *next* keyword, and `readVisibleResultTotal` would report `0` from the
stale marker — a silent false zero for a keyword with real results. The newly
real check makes that state fail loudly instead. Fail-closed, distinct message,
and the R19 cause chain now surfaces it verbatim.

**No repair required before commit.** `RECOMMENDATION`: treat
`prior result state did not clear before timeout` as an expected-and-diagnostic
outcome of shadow 1 rather than a regression, and if it appears, the fix is
local — clear the marker explicitly, or scope the cleared-state check to
summaries and grid while leaving the marker to the per-search outcome loop.

---

## 3. Below the requested bar, recorded for completeness

`FACT` — **Low.** The bounded-timeout test constructs the port with
`timeoutMs: 1`, so three earlier deadlines inside the same `search()` call —
`waitForCaleProcureResultStateCleared`, the busy-visible wait, and
`waitForBusyToClear` — are each one millisecond wide. The test passes here and
is asserting the right message, but under CI load any of those can expire first
and the assertion then fails against a different, also-correct error. A value
around `50` keeps the test fast and removes three races.

`FACT` — **Low.** `isCaleProcureSearchResponse` (`:242`) still uses
`response.headers()`, the deprecated provisional-header accessor
(`coreBundle.js:59613-59616`). Correct today; carried unchanged from R18.

`INFERENCE` — **not a finding, recorded so it is not rediscovered.** The polling
residual noted in R19 §3.2 is now reduced to its irreducible core: a result
state that renders *after* the counts are sampled in the same iteration where
`proved` is true still returns `'response'`. Sampling the flag first removed the
systematic bias; the rest is inherent to polling. The live gate — a `complete`
nine-unit zero-row run while `0000039985` is visible is **forbidden** — remains
the backstop.

---

## 4. Verification and gates

`FACT` — `REPRODUCED`, this round:

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | **22 tests / 3 files pass** |
| `npm run docs:continuity-check` | pass — 49 active/ready task rows, 45 changelog entries |
| `git diff --check` | clean |
| `git status --porcelain`, `git diff`, `grep` over `src/` and `coreBundle.js`, `date` | read-only |

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so
`npm run typecheck`, `format:check`, the build, the root suite, and the runner
suite remain Codex's to attest. The three focused files and the continuity
script have no native dependency and ran under ambient Node v26.6.0.

**The three-shadow gate is unchanged.** Restated for the release:

1. Three consecutive complete 9/9 shadows, each inside 50% of `timeout_ms`,
   baseline non-zero, `extractedRows === resultCount`.
2. Two units with different result totals produce different observations — the
   B-1 disproof, still non-negotiable.
3. No unit reports `reconciliation_failed`.
4. `facilitation` yields event `0000039985` with BU `3820`; an induced failure
   preserves earlier units; no Chrome tab growth across the three runs.
5. One shadow exercises **both** `resultEvidence` values — now expected to be
   satisfied naturally by `coaching` (`response`) and a rendered zero
   (`visible`) in the same run.

**Live** is unchanged: one `complete` receipt, nine observed units, zero missing;
`0000039985` present with no operator assistance; a `complete` nine-unit
zero-row run while that event is visible remains **forbidden**; review gate
stays `0`.

`INFERENCE`. `0000039985` closes **2026-08-13**. The gates above are the only
remaining work in this task's critical path.

---

## 5. Response file and owner decisions

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R20.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

**No new owner decision, and none requested.** Migration 116 and source
expansion are untouched. OD-5 remains resolved; OD-4 remains answered by
execution pending the live gates; **OD-1**, **OD-2**, **OD-3** remain open,
migration-116-scoped, and fail-closed.

Approximately 9 minutes wall-clock, 2026-08-10T04:20Z–04:29Z. This CLI wrapper
exposes a cumulative session budget rather than a per-round figure, so this
round's marginal cost is not separately observable and is not estimated.
