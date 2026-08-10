# NC-20260809-003 — Async response-correlation delta review, Claude R18

- Round: R18, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R18.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T03:35Z–03:58Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base commit
  `a69f0ff1a372`, uncommitted delta in `src/procurement-browser-port.ts` and
  `src/procurement-browser-port.test.ts`
- Change class: C0 bounded review. No production, database, browser, network,
  vault, or secret access; no `.env*`, credential, session, browser-profile,
  log, row, or task-payload content read; nothing implemented, committed, or
  deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: NO-GO as submitted

Not because the correlation logic is wrong — it is strictly stronger than
`a69f0ff` and every rejection path stays fail-closed. NO-GO because of what the
delta is standing on and what it will produce:

1. **Its premise is unverified.** R18 concludes that a racing same-path POST won
   the R17 wait. Nothing in the evidence establishes that, and the shadow's own
   output is structurally incapable of distinguishing it from two other causes
   that produce a byte-identical failure line (§1.2).
2. **It makes the positive path depend on the same unverified body shape.**
   `Promise.all` makes the response wait mandatory, and the predicate now also
   demands HTTP 200, JSON, and *exactly one* `eventName` capture. No evidence
   states the `eventName` cardinality of a results-bearing response, so the
   `facilitation` positive control can now fail on a payload that the R17 code
   tolerated (§4.1).
3. **The next shadow cannot tell you which of those happened.** `runCli` prints
   `error.message` and never `error.cause`, and a shadow-mode collection failure
   emits no `partialSummary` at all (§1.3). Two shadows have now returned the
   same seven-word sentence.

The blocking issue is sequencing, not code. **One bounded read-only diagnostic
decides the whole question** and costs less than the release-plus-shadow cycle
it replaces (R-1). Two of the remaining repairs are one-liners. With R-1 through
R-3 applied I do not need another review round — the evidence decides it.

Answers to the five questions, in order: **(1)** correlation is real but not
sufficient, and payload retention is racy; **(2)** false zero is effectively
unreachable, premature visible-state wait is fully reachable and is the exact
observed failure; **(3)** `response.json()` inside the predicate is safe, with
three properties worth writing down; **(4)** fail-closed on every drift path,
but tighter than before on the positive path; **(5)** three High, two Medium,
two Low, and `search()` has no test coverage at all.

---

## 1. Q1 — does the async body-aware predicate correlate the terminal response?

### 1.1 What the runtime actually does — source-proved

`FACT`. Async predicates are supported and awaited.
`coreBundle.js:61252-61258` —

```js
async waitForResponse(urlOrPredicate, options = {}) {
  const predicate = async (response2) => {
    if (isString(urlOrPredicate) || isRegExp2(urlOrPredicate)) …
    return await urlOrPredicate(response2);
  };
  return await this._waitForEvent(Events.Page.Response, { predicate, … });
}
```

`FACT`. The event listener is async and removes itself **only after** a
predicate resolves true. `:58312-58330` —

```js
listener = async (eventArg) => {
  await savedZone.run(async () => {
    try {
      if (predicate && !await predicate(eventArg)) return;
      emitter.removeListener(event, listener);
      resolve(eventArg);
    } catch (e) { emitter.removeListener(event, listener); reject(e); }
  });
};
```

`FACT`. The emitter does **not** await handlers. `:10727-10758` —

```js
_callHandler(type3, handler, args) {
  const promise = Reflect.apply(handler, this, args);
  if (!(promise instanceof Promise)) return;
  … set.add(promise);
  promise.catch(…).finally(() => set.delete(promise));
}
```

Three consequences, all confirmed rather than assumed:

- **Predicates for successive responses run concurrently.** There is no
  serialization and therefore **no head-of-line blocking** — a predicate stuck
  awaiting a body cannot starve evaluation of a later response. This is the good
  news, and it is the property that makes an async predicate viable at all.
- **A throwing predicate rejects the entire wait.** The port's predicate wraps
  everything — including `new URL()` — in `try/catch` and returns `false`, so it
  cannot throw. Correct, and it is load-bearing.
- **`removeListener` cannot cancel an in-flight predicate.** This is what
  produces M-1.

### 1.2 The premise is not established by the evidence — H-1

`FACT`. Under `a69f0ff`, every one of the following produces the identical
observable outcome — `responseProvesZero = false`, then `waitForResultState`
runs and times out at 60 s, then the collector reports
`CaleProcure search failed for "coaching"`:

- **(a)** a non-correlated same-path POST won the wait (R18's diagnosis);
- **(b)** the correct terminal response won the wait but failed the
  `status() === 200` or `content-type` gate;
- **(c)** the correct terminal response won the wait and passed those gates, but
  its in-page body did not match the tuple captured by the standalone diagnostic
  — different shape, different cardinality, or a whitespace form that
  `NO_RESULTS_TEXT` normalization does not reach.

`FACT`. `a69f0ff` swallows (b) and (c) silently — the `catch` in the removed
block carried the comment "A malformed or changed response cannot prove a zero
result," and the status/content-type test had no else-branch. So all three
collapse to one line of output.

`INFERENCE`. The 75-second wall clock is consistent with (a), (b), and (c)
equally: ~15 s of open/baseline/directory work plus one 60 s `waitForResultState`
timeout. It discriminates nothing.

`INFERENCE`. R18's delta repairs **(a) only**. If the truth is (b) or (c), the
delta does not merely fail to help — it converts a 60 s visible-state timeout
into a 60 s `waitForResponse` timeout and the operator sees the same seven-word
sentence a third time.

This is the finding I would act on first. The delta may well be right; it is
just not yet *known* to be right, and the cost of finding out the cheap way is
one read-only page interaction.

### 1.3 The instrument cannot resolve it either — H-3

`FACT`. `src/procurement-caleprocure-job.ts:187-188` —

```ts
const message = error instanceof Error ? error.message : String(error);
await writeLine(process.stderr, `CaleProcure collector failed: ${message}`);
```

`error.cause` is never printed. The collector sets it —
`fail('CaleProcure search failed for …', output, error)` at
`collector:176-182` constructs `CaleProcureCollectionError` with
`{ cause: error }` (`:96`) — and the port-level message (`CaleProcure result
state did not appear before timeout`, or a Playwright `TimeoutError`, or
`CaleProcure action did not produce a busy transition`) is discarded at the
process boundary. Node does not print `cause` here because the message is
extracted by hand.

`FACT`. In shadow mode the partial summary is also lost.
`runCaleProcureJob`'s catch only builds a `CaleProcureJobError` when
`!shadow` (`job:107-120`); a shadow-mode `CaleProcureCollectionError` is
rethrown as-is, so `error instanceof CaleProcureJobError` is false at
`job:184` and **no** `partialSummary` line is written. A failed shadow discards
the baseline reconciliation, the department count, and every unit that
succeeded before the failure.

`INFERENCE`. Two shadows have now produced one sentence each. A third will too.
This is the single highest-value fix in this round and it is four lines.

---

## 2. Q2 — can a same-keyword response satisfy the predicate before it is terminal?

Two sub-questions with different answers.

**False zero — effectively unreachable.** `FACT`, a false zero requires
`isCaleProcureZeroResultResponse` to hold, which requires the exact terminal
text `No event met your search criteria` in `box_error_items` alongside the
keyword echo. A payload carrying the portal's terminal no-results message is by
construction a terminal payload. `INFERENCE`, the only way to get a *stale* one
for the current keyword is to have searched that keyword earlier in the same
page session, and the collector searches each keyword once, with
`Clear Criteria` plus `waitForCaleProcureResultStateCleared` in between
(`port:420-426`) — a cleared search echoes an empty `eventName`, not the
keyword. And if one did arrive, the contradiction guard (`port:481-493`) throws
whenever the page simultaneously shows a summary or grid. I do not consider a
false zero a live risk.

**Premature visible-state wait — fully reachable, and it is the observed
failure.** `INFERENCE`. If any non-terminal response echoes exactly one
`eventName === keyword`, the predicate accepts it, `matchedPayload` becomes a
payload with no `box_error_items`, `responseProvesZero` is false, and control
falls to `waitForResultState` — which for a hidden-zero keyword never settles
and times out at 60 s. That is precisely the R16 and R18 shadow symptom,
reproduced by the repair meant to remove it.

`INFERENCE`. PeopleSoft Fluid makes this plausible rather than theoretical: an
`ICAction` POST typically echoes current field state, and `input.fill(keyword)`
at `port:436` sets that state **before** the wait begins. A field-change POST
whose response lands after the wait starts would echo `coaching` and carry no
result payload at all. I cannot confirm this without a live capture — which is
exactly why R-1 exists.

So the answer to Q2 is: the delta cannot manufacture a wrong zero, but it can
reproduce the exact failure it was written to fix, and nothing in the evidence
rules that out.

---

## 3. Q3 — `response.json()` inside the predicate

`FACT`, the full path, verified end to end in the pinned bundle:

client `Response.json()` → `text()` → `body()`
(`:59640-59650`, `_channel.body({}, kNoTimeout)`) → `ResponseDispatcher.body`
(`:54623-54625`) → server `Response.body(progress)`
(`:13470-13472`, `raceWithPageClosure(progress, internalBody())`) →
`internalBody()` (`:13544-13561`).

Four properties follow, and all four are safe:

1. **No body consumption.** `internalBody()` memoizes `_contentPromise` on
   first call. The body is not a stream and is not consumed; a second `json()`
   on the same `Response` is one extra protocol round-trip against an
   already-buffered result, **not** a second CDP `getResponseBody`. This is what
   makes R-2 free.
2. **Bounded only by the wait.** `_contentPromise` chains off
   `_finishedPromise`, so the predicate blocks until the response body is fully
   received — it is not evaluated at header time. The client channel call passes
   `kNoTimeout`, so the body read has **no independent timeout**; the only bound
   is `waitForResponse`'s `{ timeout: this.timeoutMs }`. Acceptable, because
   §1.1 proves a stalled body cannot block other candidates. Worth writing down:
   the effective correlation window is bounded by body completion, not by the
   busy cycle.
3. **Every rejection is caught and degrades to "keep waiting."** Three named
   rejections exist — 3xx (`Response body is unavailable for redirect
   responses`, unreachable behind the `status() !== 200` gate), navigated-away
   (`:13554-13557`, "Read response.body() before triggering any navigation" —
   `search()` performs no navigation, so this is dormant), and target-closed via
   `raceWithPageClosure`. All three land in the port's `catch` → `false` →
   bounded timeout. Fail-closed.
4. **No unhandled rejection.** A predicate that threw would reach
   `_callHandler`'s `.catch` and re-throw outside any await (`:10753-10757`);
   the port's blanket `try/catch` prevents it. And after the wait settles,
   in-flight predicates still resolve into the same `try/catch` with the
   listener already removed — harmless.

No objection to reading the body in the predicate. It is the right mechanism.

---

## 4. Q4 — is the repair still fail-closed?

Yes on drift, races, and contradictions. Tighter than before on the positive
path, and that tightening is the second High.

### 4.1 H-2 · the positive path now depends on an unverified body shape

`FACT`. `port:447-474` still uses `Promise.all`, so the search cannot proceed
until `waitForResponse` resolves. The predicate now requires, in addition to
origin/path/POST: `status() === 200`, a `content-type` starting
`application/json`, and — via `capturedProperty`'s `captures.length !== 1` test
at `port:187` — **exactly one** `eventName` capture equal to the keyword.

`FACT`. The R17 evidence records that `facilitation`'s 18,610-byte response
"echoes the query but has no no-results field." It does **not** record that
`eventName` has exactly one capture, nor the response's content-type.

`INFERENCE`. The arity-1 rule was designed for the zero case, where a duplicate
echo genuinely signals an ambiguous payload. It is now load-bearing on the
positive path, where its behavior is unmeasured. If a results-bearing response
carries two `eventName` captures — a grid re-render echoing the criterion twice
is an ordinary PeopleSoft shape — the predicate never returns true,
`waitForResponse` rejects at 60 s, and `facilitation` fails **while the page is
correctly showing its one row**. Under `a69f0ff` that same response satisfied
the loose predicate and the visible path succeeded.

This is fail-closed — it produces an error, never a bad row — but it fails the
live positive control, and event `0000039985` closes **2026-08-13**. Losing a
cycle here is expensive in a way that losing one on `coaching` is not.

`RECOMMENDATION`. This is answerable from diagnostics Codex has already run: the
`facilitation` capture structure was inspected in R17. Confirm the `eventName`
cardinality and content-type before shipping. If they are 1 and
`application/json`, H-2 closes with no code change.

### 4.2 What remains correctly fail-closed

`FACT`, each traced rather than assumed:

- URL, status, content-type, JSON-parse, shape, cardinality, and query
  mismatches all return `false` and keep waiting → bounded timeout → thrown
  error → `fail()` → non-`complete` receipt in live mode, `process.exitCode = 1`
  in shadow. No path writes rows.
- The contradiction guard (`:481-493`) still throws when a response-proved zero
  coexists with a visible summary or grid.
- Positive results still require `readVisibleResultTotal` +
  `readVisibleRows` + the collector's `rows.length === resultCount`
  reconciliation + per-row identity verification. The response can only ever
  *substitute for a zero*, never for a count.
- `resultEvidence: 'response' | 'visible'` (R17 M-10) survives the delta at
  `:507` and is threaded into every diagnostic and coverage record
  (`collector:191-192, 214, 229, 280, 299`). The live gate "both discrimination
  paths were exercised" remains checkable.
- `Promise.all` subscribes to both inputs, so a `clickAndWaitForBusyCycle`
  rejection does not orphan the response wait's later rejection. Still no
  unhandled-rejection exposure — and this matters for R-4, which introduces one
  if written naively.

---

## 5. Findings and exact repairs

| ID | Severity | Finding |
| --- | --- | --- |
| H-1 | High | The delta's premise — that a racing POST won the R17 wait — is not established; two other causes produce an identical failure line (§1.2) |
| H-2 | High | The positive path now depends on unmeasured `eventName` cardinality and content-type of a results-bearing response (§4.1) |
| H-3 | High | `runCli` drops `error.cause`; shadow-mode collection failures emit no `partialSummary`. The next shadow is uninterpretable (§1.3) |
| M-1 | Medium | `matchedPayload` can be overwritten by an in-flight predicate after the wait resolves (§5.1) |
| M-2 | Medium | `search()` has no test coverage at all — the predicate that failed twice in production is untested (§6) |
| L-1 | Low | `candidate.headers()` is the deprecated accessor (`:59613-59616`), returning provisional headers |
| L-2 | Low | TypeScript narrows `matchedPayload` to `null` at its declaration; assignment inside the callback is invisible to the checker |

### 5.1 M-1 · the analyzed payload is not provably the one that matched

`INFERENCE`, from the source facts in §1.1. Predicate A sets
`matchedPayload = A` and returns true; the listener is removed and the wait
resolves. Predicate B — started before that removal, still awaiting its body —
can later also match and execute `matchedPayload = B`. The read at `:476` is not
a microtask away from resolution: `Promise.all` also awaits
`clickAndWaitForBusyCycle`, whose `waitForBusyToClear` polls at 100 ms
(`:59-62`), so the read typically happens hundreds of milliseconds to seconds
after the response wait settled. The exposure window is every candidate whose
headers arrived before the winner's body completed.

The realistic harm is a false negative — A proved zero, B overwrote it, control
falls to `waitForResultState` and times out. A false positive additionally
requires a stale same-keyword no-results payload, which §2 rules out.

`RECOMMENDATION` — **R-2**, one line, and free per §3.1:

```ts
const [response] = await Promise.all([
  this.searchPage.waitForResponse(/* unchanged predicate, minus the assignment */),
  clickAndWaitForBusyCycle(this.searchPage, search, this.timeoutMs),
]);
let payload: unknown = null;
try {
  payload = await response.json();
} catch {
  // A body that can no longer be read cannot prove a zero; the visible
  // result-state contract below remains the fail-closed path.
}
const responseProvesZero = isCaleProcureZeroResultResponse(payload, keyword);
```

The payload is then provably the one that satisfied the predicate, the mutable
capture disappears, and L-2 resolves with it.

### 5.2 The four repairs, in the order I would do them

**R-1 · required, decisive, no code change.** Before committing anything, run one
bounded read-only diagnostic: perform a single `coaching` search and enumerate
**every** same-path POST it produces, reporting per response only
`(status, content-type, eventName capture count, eventName value,
box_error_items present)`. Counts and booleans only — no bodies, no rows. Then
the same for `facilitation`. This settles H-1 and H-2 together and tells you
whether R-4 is needed. It is strictly cheaper than the release-plus-shadow cycle
it replaces, and unlike a shadow it cannot come back ambiguous.

**R-2 · required, one line.** Bind the analyzed payload to the resolved response
(§5.1).

**R-3 · required, four lines.** Make the next failure legible:

```ts
// job:184-189
if (error instanceof CaleProcureJobError && error.partialSummary) { … }
else if (error instanceof CaleProcureCollectionError) {
  await writeLine(process.stderr, JSON.stringify(publicSummary('partial', error.partial)));
}
const chain: string[] = [];
for (let e: unknown = error; e instanceof Error; e = e.cause) chain.push(e.message);
await writeLine(process.stderr, `CaleProcure collector failed: ${chain.join(' <- ')}`);
```

`INFERENCE`. With this in place the three causes in §1.2 become three distinct
lines — `… <- CaleProcure result state did not appear before timeout` versus
`… <- Timeout 60000ms exceeded while waiting for event "response"` versus
`… <- CaleProcure action did not produce a busy transition` — and a failed
shadow stops discarding the baseline and the units that succeeded.

**R-4 · required only if R-1 shows more than one response echoing the keyword.**
Drop the correlation problem entirely by making the response wait prove the
*terminal zero* and letting the visible state carry the positive path, instead
of making both depend on one predicate:

```ts
const zeroProof = new Promise<'zero'>((resolve) => {
  void this.searchPage
    .waitForResponse(async (candidate) => { /* gates + isCaleProcureZeroResultResponse */ },
      { timeout: this.timeoutMs })
    .then(() => resolve('zero'), () => undefined);   // failure stays pending
});
await clickAndWaitForBusyCycle(this.searchPage, search, this.timeoutMs);
const outcome = await Promise.race([
  zeroProof,
  waitForResultState(this.searchPage, this.timeoutMs)
    .then(() => 'visible' as const, () => 'timeout' as const),
]);
if (outcome === 'timeout') {
  throw new Error('CaleProcure result state did not appear before timeout');
}
const responseProvesZero = outcome === 'zero';
```

`INFERENCE`. This is immune to how many POSTs echo the keyword, because only the
full terminal tuple can resolve the response side, and the positive path no
longer requires any response at all. Two details are not optional: the
`waitForResponse` promise must swallow its own rejection (a bare `Promise.race`
loser rejecting later is an `unhandledRejection`, and this process installs no
handler — Node's default would kill the collector mid-run), and the zero-proof
promise must stay *pending* rather than resolve on failure, or it wins the race
spuriously. One accepted cost: if the visible state wins a race in which a zero
proof also existed, the §4.2 contradiction guard does not fire. That state is
reachable only under portal drift, and the visible path still enforces full
reconciliation and identity verification, so it cannot produce bad rows.

---

## 6. Q5 — missing tests

`FACT` — `REPRODUCED`. `npx vitest run` over the three focused files →
**17 tests / 3 files pass** (browser-port 8, collector 8, job 1), matching R18
exactly.

`FACT`. `search()` has **no test**. The eight browser-port cases cover pure
parsers (`:32, 80, 160, 179`), `close()` (`:105, 131`),
`validatedLoopbackCdpUrl` (`:206`), and
`waitForCaleProcureResultStateCleared` (`:221`). The new R18 case tests
`isCaleProcureQueryResponse` — a pure function — not the predicate that consumes
it. Every production failure in this task has been in the untested part.

`RECOMMENDATION`. The seam already exists: `:109-122` constructs the port with
`Reflect.construct` and fake pages. Three cases, all cheap:

1. **The case under debate.** A fake page whose `waitForResponse` invokes the
   predicate against an ordered list of fake responses — first a keyword echo
   with no `box_error_items`, then the terminal zero tuple — and assert the
   observation is `resultEvidence: 'response'`, `resultCount: 0`. Under the
   current delta this test **fails**, which is the point: it encodes H-1 as an
   executable claim rather than an assumption.
2. **Cheap gates first.** A candidate with `status() !== 200` or a non-JSON
   content-type is rejected without `json()` ever being called — assert the spy
   is untouched, so a future refactor cannot start parsing bodies off arbitrary
   responses.
3. **The positive path.** A results-bearing response drives
   `resultEvidence: 'visible'` with the visible total, proving the response side
   cannot substitute for a count.

Add the H-2 assertion to whichever form survives R-1: a response with two
`eventName` captures must not strand the positive path.

---

## 7. Gates

R16 gate 1 is **closed** — R18 reports the process exited on its own with tabs
`2 -> 2`. R16 M-9 is also closed: `port.close()` is now bounded, proved by the
10-second fake-timer case at `:131-158`.

Before the next immutable release:

1. **R-1's enumeration diagnostic**, replacing the next shadow as the cheapest
   discriminating experiment.
2. R-2 and R-3 applied; R-4 iff R-1 requires it.
3. The §6 tests, including the one that currently fails.

Then, unchanged from R14 §6 / R15 §5 / R17:

4. Three consecutive complete 9/9 shadows, each inside 50% of `timeout_ms`,
   baseline non-zero, `extractedRows === resultCount`.
5. Two units with different result totals produce different observations — the
   B-1 disproof, still non-negotiable.
6. No unit reports `reconciliation_failed`.
7. `facilitation` yields event `0000039985` with BU `3820`; an induced failure
   preserves earlier units; no Chrome tab growth across the three runs.
8. **From R17, still open:** one shadow must exercise *both* `resultEvidence`
   values, so the response and visible discrimination paths are each proven live
   rather than one inferred from the other.

**Live** is unchanged: one `complete` receipt, nine observed units, zero missing;
`0000039985` present with no operator assistance; a `complete` nine-unit
zero-row run while that event is visible remains **forbidden**; review gate
stays `0`.

`INFERENCE`. `0000039985` closes **2026-08-13** — three days. That deadline is
the argument for R-1 over another shadow, not against it: a diagnostic that
cannot come back ambiguous is the only move that reliably spends less than one
day.

---

## 8. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | `REPRODUCED` — **17 tests / 3 files pass** |
| `git log --oneline -3`, `git status --porcelain`, `git diff --stat`, `git diff -- src/…` | Read-only |
| `grep`/`sed` over `node_modules/playwright-core/lib/coreBundle.js` | Read-only; `:10699-10790`, `:13466-13575`, `:54615-54635`, `:58312-58332`, `:59050-59080`, `:59580-59660`, `:61240-61290` |
| `grep -rn resultEvidence src/`, `date` | Read-only |

Files read this round: the R18 request, `src/procurement-browser-port.ts`,
`src/procurement-browser-port.test.ts`,
`src/procurement-caleprocure-collector.ts` (error path and diagnostics),
`src/procurement-caleprocure-job.ts`, and the installed
`playwright-core@1.62.1` bundle. `src/procurement-caleprocure-collector.test.ts`
was consulted only for `resultEvidence` usage. Everything else is carried from
R13–R17 and was not re-read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so I
did not run `npm run typecheck`, `format:check`, the build, continuity, the
root suite, or the runner suite. The three focused files have no native
dependency and ran under ambient Node v26.6.0. Those results remain Codex's to
attest.

`FACT`. Playwright ships here as a single bundle rather than per-module sources,
so citations are line offsets into `lib/coreBundle.js`. They are exact for this
installed version and will not survive an upgrade — which is again the argument
for treating the version pin as the contract.

`FACT`. No CDP endpoint and no network were reachable from this review. H-1 and
H-2 are therefore stated as unresolved rather than resolved against me: I can
prove the evidence does not settle them, and I cannot settle them from here.
That is what R-1 is for.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R18.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Owner decisions

**No new owner decision.** Migration 116 and source expansion are untouched —
this delta creates no conflict with either. OD-5 remains resolved; OD-4 remains
answered by execution pending the live gates; **OD-1**, **OD-2**, **OD-3**
remain open, migration-116-scoped, and fail-closed.

One judgment call is Codex's, not the owner's: whether to spend the next cycle
on R-1's diagnostic or on another shadow. I recommend the diagnostic, and §1.2
is the reason — a shadow cannot return an unambiguous answer, and there are
three days left on the positive control.

### Elapsed time and cost

Approximately 23 minutes wall-clock, 2026-08-10T03:35Z–03:58Z: reading the
request and the delta, tracing the Playwright event and body paths through the
installed bundle, reading the collector and job error paths, one focused test
run, and one file write. This CLI wrapper exposes a cumulative session budget
rather than a per-round figure, so this round's marginal cost is not separately
observable and is not estimated.
