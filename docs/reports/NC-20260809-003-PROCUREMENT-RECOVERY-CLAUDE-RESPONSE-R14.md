# NC-20260809-003 — Deterministic CaleProcure collector repair review, Claude R14

- Round: R14, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R14.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T02:19Z–02:47Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base/live commit
  `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, log, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION` · `UNKNOWN`.

---

# Verdict: GO for commit and shadow deployment

All three R13 blockers and all three highs are closed, and I verified each
against the source rather than against the summary. B-1's repair is
structurally stronger than what I asked for: two independent transitions rather
than one, with the busy wait armed concurrently with the click.

One new **High** must be resolved *during* the shadow rather than before commit,
because it is empirically decidable in one run and cannot corrupt data: **the
job process may never exit.** Removing `process.exit()` — the correct fix for
H-3 — exposed a latent open handle. `close()` closes both pages but never
disconnects the CDP client, and R14 records that port 9250 is not running
locally, so **this CLI has never been executed end to end by anyone**. If the
WebSocket keeps the event loop alive, a fully successful run hangs until the
runner's SIGTERM and reports `timeout`.

That is shadow gate 1 in §6. Nothing else changes R13's empirical standard, and
I am not lowering it because 47 unit tests pass: the port's interaction methods
still have no fixture coverage, and `search`, `readDepartmentDirectory`, and
`readDetail` remain unexecuted against anything.

---

## 1. R13 blocker and high dispositions

| ID | Status | Evidence |
| --- | --- | --- |
| **B-1** stale state | **Closed** | `clickAndWaitForBusyCycle` (`port:64-84`) arms `busy.waitFor({state:'visible'})` **inside the same `Promise.all` as the click**, so the wait cannot miss a transition that starts before it is armed; `waitForCaleProcureResultStateCleared` (`:86-111`) then requires summaries, the no-results marker, **and** the grid to all be absent before the keyword is typed (`search:373-374`); the search must therefore create a fresh marker (`:394-395`) |
| **B-2** timeout evidence | **Closed** | `env.NANOCLAW_JOB_TIMEOUT_MS = String(job.timeout_ms)` (`job-runner:146`); internal abort at 80% (`job:170-175`); `SIGTERM` mapped to the same controller (`:176-179`); `abortable()` races every port operation (`collector:100-131`); abort surfaces as `CaleProcureCollectionError` carrying the proven partial (`:245-247`); `finally { port.close() }` (`:280-282`) |
| **B-3** row budget | **Closed** | `remainingRowBudget` checked at `collector:196-208`, **before** the verification loop; over-budget units are diagnosed `row_budget_exceeded` and skipped |
| **H-1** useful progress | **Closed** | Identity failure diagnoses `identity_verification_failed` and continues (`collector:244-258`), with abort explicitly distinguished first |
| **H-2** container browser | **Closed** | `container-runner.ts` no longer reads `BONFIRE_USERNAME`/`BONFIRE_PASSWORD`, no longer resolves a procurement CDP URL, no longer sets `AGENT_BROWSER_CONFIG`, no longer references `192.168.64.1`, and deletes any stale `agent-browser.json` |
| **H-3 / M-5** exit and pool | **Closed** | Awaited `writeLine` (`job:135-142`), `process.exitCode = 1` (`:189`), awaited `resetBusinessPool()` in `finally` (`:193`); no `process.exit()` remains |
| **M-2** row counts | Closed | `port:203`, `port:340` capture `count()` once |
| **M-4** loopback | Closed | `port:224` — exactly `127.0.0.1`; `localhost` rejected and tested |
| **L-1** silent skip | Closed | `port:210-214` throws on a visible row without six cells |
| **L-3** partial pages | Closed | `port:268-276` closes whatever opened before rethrowing |

`FACT` — I checked one thing the summary does not claim and that would have
been a real defect: `Promise.all([control.click(), busy.waitFor(...)])`
(`port:72-77`) does **not** leak an unhandled rejection when `click()` rejects
first. `Promise.all` subscribes to every input at call time, so a later
rejection from `busy.waitFor` is consumed by its internal handler. Under Node's
default `--unhandled-rejections=throw` a leak here would have killed the process
and bypassed the partial-receipt path — the pattern is correct as written.

`FACT` — abort does not leak either. In `abortable` (`collector:116-129`) the
underlying operation's rejection is still consumed by the attached handler after
`settled` is set, so a port call that fails *after* the abort has won cannot
become an unhandled rejection.

---

## 2. New High

### H-4 · The process may never exit (unverified end to end)

`FACT`. `close()` (`port:457-465`) closes `searchPage` and `detailPage` and
deliberately does not call `browser.close()`. The `Browser` returned by
`chromium.connectOverCDP` (`:261-263`) holds an open WebSocket to Chrome.

`FACT`. `runCli` (`job:168-195`) no longer force-terminates: it sets
`process.exitCode`, clears the deadline timer, removes the `SIGTERM` listener,
and awaits `resetBusinessPool()`. Every other handle I can trace is released.

`INFERENCE`. The CDP socket is then the only remaining libuv handle, and
Playwright does not `unref` it. If so, `runCli()` resolving does not terminate
the process: a **successful** run writes its summary, hangs, and is killed by
the runner's SIGTERM at `timeout_ms`, producing job status `timeout`. The
previous `process.exit()` masked this; fixing H-3 correctly exposed it.

`FACT`. R14 states port 9250 is not running locally and the full shadow job is
deferred, so no one has executed this CLI end to end. The exit behavior is
asserted by nobody.

`RECOMMENDATION`. Do not guess the fix — measure it. Shadow gate 1 (§6) is a
single run with Chrome up, checking that the process exits on its own. If it
hangs, add `await this.browser.close()` to `close()`: for a `connectOverCDP`
browser this disconnects the client, and the launchd-owned Chrome is a separate
process Playwright does not own. One line, and the gate proves it.

---

## 3. Can continuing after a per-unit failure mislead? — No

`FACT` — traced through the write path rather than reasoned about:

- a failed unit is appended to `diagnostics` with `status:'failed'` but **never**
  to `coverage.observedUnits` or `coverage.evidence`
  (`collector:198-207`, `:248-257`), so
  `fn_complete_procurement_source_run_v2` derives it as missing and the receipt
  is `partial` (`115:396-405`);
- `verifiedRows` is local and pushed only on success (`:260`), so a unit that
  fails midway contributes **no** rows — there is no half-unit;
- `detailCache` is populated only after `assertCaleProcureDetailIdentity`
  succeeds (`:232`), so a later unit reusing a cached key is trusting a
  previously *proven* identity, not a skipped check;
- the row-budget skip discards that unit's count entirely rather than recording
  it, which **understates** coverage and can never overstate it.

`INFERENCE`. Continuing is strictly better than R13's abort: more proven units
survive, and every exclusion is visible in `diagnostics` while being absent from
the receipt's coverage. Item 3 is satisfied.

---

## 4. Remaining Medium and Low

| ID | Finding | Evidence |
| --- | --- | --- |
| **M-6** | A count/row **reconciliation** mismatch still aborts the whole run (`fail()`), while identity and budget failures now skip the unit. The H-1 philosophy was not applied to the third failure class, and pagination is its most likely trigger — so one paginated keyword discards every later unit | `collector:183-194` vs `:196-208`, `:244-258` |
| **M-3** | No pagination: `pagesVisited: 1` is hardcoded, making "the portal renders every row in one view" an undocumented, untested assumption that fails via M-6 | `port:403` |
| **M-7** | The port's **interaction** methods remain untested. Only `waitForCaleProcureResultStateCleared` and the three pure parsers are covered; `search`, `readDepartmentDirectory`, `readDetail`, `readVisibleRows` have no fixture coverage | `src/procurement-browser-port.test.ts` (4 tests) |
| **M-8** | `busy.waitFor({timeout: min(5000, timeoutMs)})` can miss a busy state that renders and clears faster than Playwright observes it, producing a false "did not produce a busy transition". Fail-closed (unit omitted → `partial`), never a false receipt — and exactly what a shadow run surfaces | `port:74-82` |
| **L-2** | Scheduled-task container timeouts now have no floor at all; `0`/undefined falls back to `CONTAINER_TIMEOUT`, but a configured `1` yields a 1 ms bound | `container-runner.ts:808-813` |
| **L-4** | `getByText('Event : ${eventId}')` hard-codes the space-before-colon rendering — a portal-format constant that belongs in a fixture | `port:424` |

`RECOMMENDATION` — M-6 is the one I would fix before **live**, not before
shadow: make a reconciliation mismatch a unit-level `reconciliation_failed`
diagnostic and `continue`, matching the other two classes. A shadow run will
show whether any planned keyword paginates.

---

## 5. Source authority, job semantics, packaging

`FACT` — **job path and interpreter.** `resolveJobScriptPath`
(`job-runner:27-49`) applies the release root only for
`project === 'nanoclaw'`, `script` starting with `dist/`, and an absolute
`codeRoot`, then verifies containment with `path.relative`, rejecting `..` or an
absolute remainder. `.js/.mjs/.cjs` spawn via `process.execPath`
(`:177-185`), so the pinned interpreter is guaranteed. Covered by
`src/job-runner-path.test.ts` (3 tests).

`FACT` — **timeout semantics.** `NANOCLAW_JOB_TIMEOUT_MS` carries the exact
outer bound; `jobTimeoutMs()` (`job:125-133`) rejects anything below 60,000 ms
and defaults to 900,000; the internal deadline is 80% of it.

`FACT` — **loopback-only CDP** is enforced at `port:220-236` and tested against
the retired bridge address.

`FACT` — **gates remain fail-closed**: live writes require
`PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED=1` (`job:150-157`); shadow needs no
gate and performs no write; the job registers `enabled: false`; the container
ingest IPC is unchanged and still gated by `caleProcureIngestEnabled`.

`FACT` — **packaging.** `playwright-core` is in `package.json` and the lock;
both are archived and `FILES.sha256`-covered. `node_modules` is **not** in the
archive, so production must `npm ci` before enabling the job. As verified in
R13, `procurement-browser-port.ts` is imported only by the job and its test, so
a missing dependency degrades to a failing job rather than a crashed daemon.

`FACT` — **container browser retirement is complete** (H-2), which closes the
shared-CDP exposure raised in seven consecutive rounds. `groups/procurement`,
`scan-workflow.md`, and `scrape-workflow.md` are updated so no agent path
expects a browser.

`INFERENCE` — one operational consequence to state plainly: Bonfire acquisition
and attachment scraping are now **paused with no replacement**. That is the
accepted side of OD-5, not a defect, but it should stay visible in the
continuity record until a deterministic adapter exists.

---

## 6. Shadow and live gates

R13 §9 stands unchanged. Three additions, one of them new and first:

**Shadow (no writes):**

1. **NEW — the process exits on its own** after a successful run, with a
   non-hanging exit code and the summary JSON intact. This is the H-4 decision
   point; if it hangs, fix `close()` and re-run before gate 2.
2. Three consecutive shadow runs complete inside 50% of `timeout_ms`.
3. Baseline non-zero with `extractedRows === resultCount`.
4. All nine units report diagnostics; summary JSON arrives untruncated.
5. **Two units with different result totals produce different observations** —
   the B-1 disproof, still the assertion I will not waive.
6. `facilitation` reports event `0000039985`; identity resolves to BU `3820` via
   the full directory plus a detail match.
7. An induced failure yields a partial with earlier units preserved.
8. **NEW — no unit reports `row_budget_exceeded` or a reconciliation abort**, i.e.
   no planned keyword paginates (M-3/M-6 empirical check).
9. No Chrome tab growth across the three runs.

**Live (collection-only, review off):** unchanged — one `complete` receipt with
nine observed units and zero missing; `0000039985` present as a source-keyed
opportunity with no operator assistance; a `complete` nine-unit zero-row run
while that event is visible remains **forbidden**; review gate still `0`.

**Before review may ever be enabled:** unchanged — two consecutive scheduled
live runs on different days, at least one legitimately returning zero rows while
the baseline control stays non-zero.

`INFERENCE`. Event `0000039985` closes **2026-08-13**, so live gate 2 must be
exercised within three days or re-established against whatever is then open.

---

## 7. Minimal remaining fix sequence

1. **Shadow gate 1** decides H-4. If the process hangs, add
   `await this.browser.close()` to `PlaywrightCaleProcureBrowserPort.close()`.
2. **Before live** — M-6: convert a reconciliation mismatch to a unit-level
   diagnostic + `continue`, matching identity and budget.
3. **Before live** — M-7: fixture tests for `search`, `readDepartmentDirectory`,
   `readDetail`, including a stale-grid fixture and a paginated-result fixture.
4. Optional: M-8 (widen or instrument the busy-appearance window once shadow
   timings are known), M-3, L-2, L-4.

Nothing in 2–4 blocks commit or the shadow.

---

## 8. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 6 focused files | `REPRODUCED` — **47 tests / 6 files pass** (identity 3, collector 8, container-runner 28, job-path 3, browser-port 4, job 1), matching R14's count exactly |
| `git status --porcelain`, `git diff --stat ec62c30`, `git diff ec62c30 -- <path>` | Read-only |
| `grep`, `sed`, `date` | Read-only |

Files read: `src/procurement-browser-port.ts`,
`src/procurement-caleprocure-collector.ts`,
`src/procurement-caleprocure-job.ts`, `src/procurement-identity.ts`, their four
test files, `src/job-runner.ts`, `src/container-runner.ts`,
`src/procurement-intake.ts`, `src/business-db.ts`,
`scripts/register-caleprocure-collector.mjs`, `scripts/build-release.mjs`,
`scripts/start-procurement-browser.sh`, `package.json`, the procurement group
and knowledge instructions, and the R12–R14 chain.

No database, network, browser, container, production, or deployment access; no
`.env*`, credential, session, browser-profile, log, or row content was read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so
`better-sqlite3`-dependent suites cannot run here; I did not run
`npm run typecheck` or the full suite. The six focused files have no native
dependency and ran under ambient Node v26.6.0. Codex's pinned typecheck, the
2,006-test root suite, and the runner suite remain theirs to attest.

`UNKNOWN`. No CDP endpoint was available to this review either, so H-4, M-6, and
M-8 cannot be settled from here — which is precisely why they are shadow gates
rather than assertions.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R14.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Owner decisions

**No new owner decision.** OD-5 is **resolved** — Codex chose the
security/reliability side and implemented it completely; the cost is that
Bonfire acquisition is paused with no replacement, which §5 records.

**OD-4** (build the collector vs. go to SAM.gov first) is now largely answered by
execution rather than decision: the collector is built and unit-verified. It
remains formally open only until the live gates pass.

**OD-1**, **OD-2**, **OD-3** remain open, migration-116-scoped, fail-closed, and
unaffected by this round.

### Elapsed time and cost

Approximately 28 minutes wall-clock, 2026-08-10T02:19Z–02:47Z: reading the
repaired collector, port, job, and identity modules with their tests plus the
runtime and packaging surfaces, one focused test run, and one file write. This
CLI wrapper exposes a cumulative session budget rather than a per-round figure;
it read **$7.64 of $15** immediately before this write, so this round's marginal
cost is not separately observable and is not estimated.
