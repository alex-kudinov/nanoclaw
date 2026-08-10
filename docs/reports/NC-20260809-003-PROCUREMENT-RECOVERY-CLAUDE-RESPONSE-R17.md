# NC-20260809-003 — Query-bound zero-result response repair review, Claude R17

- Round: R17, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R17.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role, exact session
  `58fde579-483e-42ca-a516-434971d3ad07`
- Date: 2026-08-10T03:33Z–03:56Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base commit
  `4053bf89867bc09dbd19bb58d48f56a54bf926df`
- Change class: C0 bounded review of the named uncommitted diffs. No production,
  database, browser, network, vault, or secret access; no `.env*`, credential,
  session, browser-profile, log, response body, row, or task-payload content
  read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: GO

The repair is sound, and the reason is subtler than the request states — worth
naming, because it is what makes Q1 safe rather than merely unlikely.

**The response wait is not request-correlated, and it does not need to be.** The
predicate matches origin + path + method, so a same-path POST *can* resolve it.
But the wait is not what proves anything: the **tuple** is. A zero is admitted
only when one response carries the exact current keyword *and* the exact
terminal no-results text. Every way the wrong response can be captured fails at
least one leg of that tuple and degrades to the pre-existing visible-state path.
The one race that would satisfy both legs is a background POST issued while the
page already sits in a no-results state for this keyword — in which case the
conclusion drawn is true anyway.

That is a genuinely correct design choice: it converts an unsolvable
request-identity problem into a content-identity check. Four findings follow,
none blocking.

---

## 1. Q1 — Correlation

`FACT`. `src/procurement-browser-port.ts` arms the wait as the first element of
`Promise.all([...])`:

```ts
const [response] = await Promise.all([
  this.searchPage.waitForResponse((candidate) => { … }, { timeout: this.timeoutMs }),
  clickAndWaitForBusyCycle(this.searchPage, search, this.timeoutMs),
]);
```

`INFERENCE`. Array elements evaluate left to right, so `waitForResponse` attaches
its listener before `clickAndWaitForBusyCycle` is even invoked. There is no
arming race: a response to this click cannot precede the listener.

`INFERENCE` — the three ways a *different* response could be captured, and what
each yields:

| Racing response | Tuple outcome | Result |
| --- | --- | --- |
| The **Clear** POST | Cannot be captured — `clickAndWaitForBusyCycle(clear)` and `waitForCaleProcureResultStateCleared` both complete before arming, and `waitForResponse` only observes responses arriving after it attaches | n/a |
| A **background/keep-alive** POST after the fill | Echoes the current keyword (the field is already filled), but the result panel was just cleared, so `box_error_items` is absent → `capturedProperty` returns `null` → tuple fails | `responseProvesZero = false` → existing `waitForResultState` fail-closed path |
| A **late response from the previous keyword** | Its `eventName` capture carries the *previous* query → `echoedQuery === keyword` fails | Same fail-closed path |

`INFERENCE`. The residual case — a background POST that echoes the current
keyword *and* carries the no-results text — can only occur once the page is
already in the no-results state for that keyword, so "zero results for this
keyword" is a true statement regardless of which response proved it.

**Q1 answered: the wait is not exclusively correlated to the Search click, and
the repair does not depend on it being so.** The correlation that matters is
carried by the payload, and it holds.

---

## 2. Q2 — Is the tuple strong enough?

`FACT`. `isCaleProcureZeroResultResponse` requires, in order: a `CaptureResults`
object; **exactly one** `eventName` capture (`captures.length !== 1` → `null`)
whose `Properties.value` string-equals the current keyword; and **exactly one**
`box_error_items` capture whose whitespace-normalized `Properties.text` equals
`NO_RESULTS_TEXT`. Anything non-string, absent, or multiply-present yields
`null` and therefore `false`.

`INFERENCE` — yes, strong enough, for three reasons that compound:

1. **The live contrast is a real discriminator, not an assumption.** R17's
   reproduced evidence has `facilitation` returning 18,610 bytes that echo the
   query and carry **no** no-results field, against `coaching`'s 15,650 bytes
   carrying both. The two legs are independently present and absent across the
   two known cases.
2. **Exact-one cardinality** on both captures removes the ambiguity class that
   burned canaries 1–3 — a page holding two renderings of the same state cannot
   satisfy it.
3. **The visible contradiction guard** (§3) means a response-proven zero must
   also be consistent with the DOM, so the transport cannot silently overrule a
   visible positive.

`FACT` — the query-correlation disproof is already unit-tested: the same
`coaching` response returns `false` when asked about `facilitation`. That is the
single most important assertion in the new suite and it exists.

---

## 3. Q3 — Fail-closed behavior

`FACT` — every non-proving path preserves the prior contract:

| Condition | Handling |
| --- | --- |
| Non-200 | `responseProvesZero` stays `false` → `waitForResultState` |
| Non-`application/json` content type | Same |
| Malformed JSON | `try { await response.json() } catch {}` → same, with a comment stating the intent |
| Shape drift (missing `CaptureResults`, cardinality ≠ 1, non-string values) | Discriminator returns `false` → same |
| Keyword mismatch | Same |
| **Response proves zero but the page shows a summary or grid** | **Throws** — hard contradiction |
| Positive results | Untouched: `waitForResultState`, `readVisibleResultTotal`, `readVisibleRows`, then collector reconciliation and directory/detail identity |

`INFERENCE`. The repair is strictly *additive* on the zero path and cannot
fabricate a positive: `resultCount` and `rows` are only short-circuited to
`0`/`[]` when `responseProvesZero`, and that flag can never be set by a response
that lacks the no-results text.

`FACT`. The contradiction throw propagates out of `search()` → `abortable()` →
`fail()` in the collector, so it aborts the whole run rather than failing one
unit.

`INFERENCE`. That is the right severity and it is consistent with the line I
endorsed in R15: a page/transport disagreement is a *structural* trust failure
in the acquisition layer, like invalid metadata, not a content observation about
one keyword. Continuing would mean trusting eight more observations from a layer
that just contradicted itself.

---

## 4. Findings

### M-10 · The contradiction guard does not check the no-results marker · Medium

`FACT`. When `responseProvesZero` is true, the guard tests only visible
summaries and the visible grid.

`INFERENCE`. Correct as written — the entire premise is that the portal fails to
render the marker — but it means a *third* state goes unrecorded: response says
zero, marker visible, grid absent. That is the healthy case and it is
indistinguishable in the observation from the broken case. Nothing is wrong
today, but the shadow cannot then tell you whether the portal bug is still
present.

`RECOMMENDATION`. Record which path proved the zero — `visible` vs
`response` — in `CaleProcureSearchObservation` and surface it in the unit
diagnostic. It costs one field and it is the only way the live gates in §5 can
assert that both paths still work. This is the finding I would most like
addressed before the three-shadow run, because without it those gates are not
checkable.

### M-11 · `new URL(candidate.url())` inside the predicate is unguarded · Low-Medium

`FACT`. The predicate constructs a `URL` for every candidate response.

`INFERENCE`. A response whose URL the constructor rejects would throw inside the
predicate; Playwright surfaces that as a rejection of `waitForResponse`, failing
the search and aborting the run. Requests carry absolute URLs, so this is
unlikely — but the failure mode is a whole-run abort from an unrelated page
request. Wrap the body in `try { … } catch { return false }`.

### L-5 · `SEARCH_POST_PATH` is an unversioned portal constant · Low

`FACT`. `/nlx3/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL`
is hard-coded.

`INFERENCE`. It encodes a PeopleSoft site/node name (`nlx3`, `psfpd1`) that a
portal upgrade can change. Drift is **fail-closed** — the wait times out, the
search fails, no false zero — so this is a maintenance note, not a risk. It
belongs beside `EVENT_NAME_ID`/`CLEAR_ID`/`SEARCH_ID` in whatever fixture
inventory M-7 eventually produces.

### L-6 · Documentation deltas are accurate and in scope · no action

`FACT`. The `PROCUREMENT-SOURCE-CANDIDATES.md` refresh adds a dated
official-source section that explicitly *"broadens discovery without changing
the activation order or the closure gate"*, treats DGS as forecast intelligence
that *"may not create a pursuit until an authoritative solicitation exists"*,
and keeps registration and responses human-only. It does not activate a source
and does not disturb the SAM.gov-first recommendation. `ACTIVE-WORK.md` and the
changelog record the shadow, the teardown proof, and the deliberate
non-activation.

---

## 5. Q4 — Gates before commit, release, and three 9/9 shadows

**Unit, before commit** — two additions, both cheap:

1. A response carrying the correct keyword but a *different* `box_error_items`
   text returns `false` (drift disproof on the second leg — the first leg is
   already covered by the `facilitation`/`coaching` cross-check).
2. `eventName` present **twice** returns `false` (the exact-one cardinality rule
   is load-bearing and currently untested).

**Live, added by this repair:**

3. **Both discrimination paths must be exercised in one shadow run** — at least
   one unit proven zero by response, and at least one by visible state. This
   requires M-10's provenance field to be assertable. Without it, a run in which
   the portal silently started rendering markers again would look identical to
   one in which the repair is doing the work.

**Standing gates, unchanged from R14 §6 / R15 §5 / R16 §5:**

4. Gate 1 — process exits on its own, Chrome alive, tabs back to baseline.
   `FACT`: R17 reports this **passed twice** from the verified `4053bf8` bytes.
   It must be re-proven on whatever bytes are finally activated.
5. Three consecutive complete 9/9 shadows inside 50% of `timeout_ms`; baseline
   non-zero with `extractedRows === resultCount`.
6. Two units with different result totals produce different observations — the
   B-1 disproof, still non-negotiable.
7. No unit reports `reconciliation_failed` (the pagination check).
8. `facilitation` yields event `0000039985` with BU `3820`; an induced failure
   preserves earlier units; no Chrome tab growth.

**Live** unchanged: one `complete` receipt, nine observed units, zero missing;
`0000039985` present with no operator assistance; a `complete` nine-unit
zero-row run while that event is visible remains **forbidden**; review stays `0`.

`INFERENCE`. This repair is what makes gate 5 reachable at all — `coaching` was
a permanent blocker, since the portal returns a truthful zero the page never
renders. Note the consequence for gate 7: if the portal-bug path is common, most
units will now be response-proven, which makes M-10's provenance field the only
way to notice if the *visible* path silently stops working.

`INFERENCE`. Event `0000039985` closes **2026-08-13** — three days — so gates
5–8 and the live positive control must land inside that window or be
re-established against whatever is then open.

---

## 6. Owner decisions

**No new owner decision.** M-10, M-11, and L-5 are determinate engineering items
with right answers; none is a business trade.

`INFERENCE` — one prior item is **materially closer to resolution and should not
be re-opened yet.** OD-4 asked whether to fund the collector or go to SAM.gov
first. The `coaching` diagnosis — the portal returning a truthful JSON zero it
never renders — is exactly the class of defect no prompt could have solved and
that a deterministic collector solves permanently. That is evidence for the
choice already made, not a reason to revisit it. It stays open only until the
live gates pass.

Three remain open from R6, all migration-116-scoped, all fail-closed, and
untouched by this round: **OD-1** (`PROCUREMENT_APPROVER_UIDS`), **OD-2**
(approver ≠ assembler), **OD-3** (outcome window and evidence age).
**OD-5** remains resolved.

---

## 7. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | `REPRODUCED` — **16 tests / 3 files pass** (browser-port 7, collector 8, job 1), matching R17's count |
| `git log --oneline -1`, `git diff 4053bf8 -- <path>`, `git diff --stat` | Read-only |
| `date` | Read-only |

Files read this round, exactly the authorized set:
`src/procurement-browser-port.ts` (diff),
`src/procurement-browser-port.test.ts` (diff),
`docs/ACTIVE-WORK.md` (diff), `docs/ENGINEERING-CHANGELOG.md` (diff),
`docs/reports/NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md` (diff), and this
request. `src/procurement-caleprocure-collector.ts` behavior is carried from
R13–R16 and was not re-read.

No production, database, network, browser, container, or deployment access; no
response body, row content, credential, session, or log was read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so I
did not run `npm run typecheck`, `format:check`, `git diff --check`, or the full
root/runner/continuity gates. The three focused files have no native dependency
and ran under ambient Node v26.6.0. R17's pinned results and the pending full
gates remain Codex's to attest.

`FACT`. The reproduced acquisition evidence in §"Reproduced acquisition
evidence" — the 200 JSON response, its byte sizes, and the capture paths — is
Codex's observation. I verified that the discriminator *implements* that shape
correctly and that every deviation from it fails closed; I did not and could not
observe the portal.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R17.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Elapsed time and cost

Approximately 23 minutes wall-clock, 2026-08-10T03:33Z–03:56Z: reading the named
diffs, reasoning through the response-correlation race set, one focused test run,
and one file write. This CLI wrapper exposes a cumulative session budget rather
than a per-round figure; it read **$12.6 of $15** immediately before this write,
so this round's marginal cost is not separately observable and is not estimated.
