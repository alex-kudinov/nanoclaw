# NC-20260809-003 — Deterministic CaleProcure collector, adversarial implementation review, Claude R13

- Round: R13, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R13.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T01:55Z–02:24Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base/live commit
  `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, log, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION` · `UNKNOWN`.

---

# Verdict: CHANGES REQUIRED

Three blockers, all concentrated in two places: the **wait/staleness contract**
in the browser port, and the **timeout path** in the job.

The architecture is right and most of the implementation is good. Identity
resolution is genuinely global (`resolveCaleProcureBusinessUnit` scans the whole
directory, closing R11 `N-2` properly), the baseline control is implemented as
R12 §6 specified, the release-root job path is soundly contained, the loopback
CDP gate is real, and the socat removal closes an exposure I have raised in
seven rounds. Reconciliation, the partial-receipt design, and the strict row
schema all hold up under inspection.

But the single defect that produced canary 3 — **reading a page state that is
not the result of the search you just issued** — is reproduced in deterministic
code, and neither the reconciliation assertion nor any test catches it. And the
single defect that produced canary 4 — **a timeout that leaves no evidence** —
is reproduced by a job that installs no signal handler, so its partial-receipt
path cannot run when the job runner kills it.

Fixing all three is a focused change to two files. §8 has the exact sequence.

---

## 1. Blockers

### B-1 · A stale result state can be read as a search result

`FACT`. `src/procurement-browser-port.ts:49-63`:

```ts
const busy = page.getByRole('heading', { name: /^(Loading|Searching)\.\.\.$/ })
  .filter({ visible: true });
const deadline = Date.now() + timeoutMs;
await page.waitForTimeout(100);
while (Date.now() < deadline) {
  if ((await busy.count()) === 0) return;
  await page.waitForTimeout(100);
}
```

This waits for busy to **clear**. It never waits for busy to **appear**. If the
busy heading has not rendered within ~100 ms of the click, the function returns
immediately — before the search has taken effect.

`FACT`. `waitForResultState` (`:125-141`) then returns as soon as *any* visible
`Showing Results` or no-results marker exists. After `Clear Criteria` the
unfiltered baseline is on screen, so a marker is always present.

`INFERENCE` — the resulting sequence in `search()` (`:304-346`):

1. click Clear → busy check may return early → `input.inputValue() === ''`
   passes if PeopleSoft clears the field synchronously while refreshing the grid
   asynchronously;
2. `fill(keyword)` → echo check passes (the value was set locally, not by the
   server);
3. click Search → busy check returns early → `waitForResultState` sees the
   **pre-search** summary → returns immediately;
4. `readVisibleResultTotal` and `readVisibleRows` read the stale state;
5. collector reconciliation `observed.rows.length !== observed.resultCount`
   (`src/procurement-caleprocure-collector.ts:132`) **passes**, because both
   values come from the same stale render;
6. `observed.echoedQuery !== keyword` (`:121`) **passes**, because `fill` set it.

The unit is then recorded as observed with another keyword's counts and rows.
Every existing guard is satisfied. This is canary 3's defect — a self-consistent
observation of the wrong page state — moved from prose into code.

`INFERENCE` — it compounds. The stale state after `Clear Criteria` is the
unfiltered baseline, which the same file expects to be 320 rows
(`readBaseline`, `:239-256`, asserts `rows.length === resultCount`). So a stale
search yields 320 rows for one keyword, which drives B-3 and then B-2.

`RECOMMENDATION` — replace "wait for busy to clear" with a **transition** proof.
Deterministic options, in order of preference:

1. Capture the result-summary element handle before the click and wait for it to
   become detached before reading (PeopleSoft re-renders the grid, so the old
   node is replaced). This needs no portal timing assumption.
2. `page.waitForResponse()` on the search XHR — most precise, requires knowing
   the endpoint.
3. Bounded wait for busy to **appear** (e.g. 5 s) and then clear; treat
   non-appearance as an error rather than success.

`RECOMMENDATION` — add a cheap in-band second signal the collector can already
compute: after `Clear Criteria`, assert the visible total equals the baseline
total. That makes "the grid never refreshed" observable at the clear step rather
than at the search step.

`UNKNOWN`. Which of the three primitives the portal actually supports cannot be
determined without driving it, which this review does not do. That is why §9
requires a shadow-run assertion that two keywords with different totals produce
different observations.

### B-2 · A job timeout writes no receipt, emits no diagnostics, and leaks tabs

`FACT`. `src/job-runner.ts:226-240` — on `timeout_ms` the runner sends
`SIGTERM` to the whole process group, then `SIGKILL` 5 s later.

`FACT`. `src/procurement-caleprocure-job.ts` installs **no** `SIGTERM` handler.
Node's default action terminates the process immediately.

`INFERENCE` — three consequences on the timeout path:

- the `catch` block (`:100-114`) never runs, so **no partial receipt is
  written**;
- the collector's `finally { await port.close() }`
  (`src/procurement-caleprocure-collector.ts:207-209`) never runs, so the two
  pages opened by `connect()` (`port:214-215`) **leak into the shared,
  launchd-owned Chrome** — two tabs per timed-out run, accumulating;
- nothing is flushed to stdout, so the run is undiagnosable.

`FACT`. `register-caleprocure-collector.mjs` sets `timeout_ms: 900_000`, so this
path is one slow portal away.

`INFERENCE`. The resulting evidence — job status `timeout`, zero source runs — is
**exactly canary 4's outcome**, in the component built to prevent it.

`RECOMMENDATION` — an **internal deadline**, not just a signal handler. Give the
collector an `AbortSignal` armed at ~80% of `timeout_ms`; on fire, stop the unit
loop, close pages, write the partial receipt, and exit non-zero. Add a `SIGTERM`
handler that triggers the same orderly shutdown as a backstop. Relying on the
5 s SIGTERM→SIGKILL window alone is too tight for a DB write plus two page
closes.

### B-3 · The 200-row bound is enforced after identity verification

`FACT`. `src/procurement-caleprocure-collector.ts:140-186`. The verification
loop performs one `port.readDetail()` navigation per unique
`(businessUnit, eventId)` for **every** row (`:149`), and only afterwards does
`:181` check `output.rows.length + verifiedRows.length > MAX_COLLECTED_ROWS`.

`INFERENCE`. A keyword returning N rows costs N detail-page navigations before
the bound can reject it. Under B-1 that is 320 navigations for a single keyword;
at even 2 s each, the 900 s job budget is gone, which triggers B-2 and produces
no receipt at all. The bound as written cannot bound cost — only outcome.

`RECOMMENDATION` — check `observed.rows.length` against the remaining budget
**before** the verification loop, and fail the unit (or the run) there. Consider
also a per-unit result-count ceiling, since a keyword returning hundreds of rows
is itself evidence that the search did not filter.

---

## 2. High

### H-1 · One unresolvable agency aborts the entire scan

`FACT`. `resolveCaleProcureBusinessUnit` throws when matches ≠ 1
(`src/procurement-identity.ts:24-28`); the throw is caught at
`collector:173` and converted to `fail()`, ending the run.

`INFERENCE`. R9–R11 established the opposite semantics: an unverifiable identity
makes **that unit** incomplete, not the whole run. As written, a single row from
an agency whose directory name differs beyond trim/whitespace/case discards every
later keyword — and such rows are expected, since the normalization is
deliberately strict. The current behavior also inverts the incentive the strict
rule was meant to create: a stricter identity check now costs more coverage.

`RECOMMENDATION` — on identity failure, omit that **unit** from `observedUnits`,
record the reason in diagnostics, and continue to the remaining keywords.
`fn_complete_procurement_source_run_v2` then derives `partial` with that unit
missing, which is the accepted semantics and preserves more proven coverage.

### H-2 · Removing socat breaks the still-agent-owned Bonfire browser path

`FACT`. `src/container-runner.ts:656-658` still resolves the CDP URL and
rewrites it to the container bridge:

```ts
const CDP_HOST = '192.168.64.1';
const cdpUrl = await resolveProcurementCdpUrl(CDP_HOST, CDP_PORT);
```

and on success writes `agent-browser.json` with that URL and sets
`AGENT_BROWSER_CONFIG` (`:661-677`). The in-code comment at `:651-653` states
this profile is what *"bypasses Cloudflare bot detection on Bonfire agency
subdomains."*

`FACT`. `scripts/start-procurement-browser.sh` now removes socat entirely and
adds `--remote-debugging-address=127.0.0.1`, so nothing listens on
`192.168.64.1:9250`.

`FACT`. The Bonfire path remains agent-owned and browser-driven:
`groups/procurement/CLAUDE.md:154` (`rescan` → *"Run the explicitly enabled
legacy Bonfire workflow only"*), `:184` (*"Only an explicitly enabled legacy
Bonfire scan remains agent-owned"*), and
`knowledge/agents/procurement/procedures/scan-workflow.md:14-26` drives
`agent-browser open/fill/click` against that config.

`INFERENCE` — and this is the part that makes it a High rather than a note: the
host's honest-failure branch is bypassed. `resolveProcurementCdpUrl` fetches
`http://127.0.0.1:9250/json/version` **from the host**, which still succeeds, so
`cdpUrl` is non-empty and the `else` branch (which deletes the config precisely
because *"a leftover config holds a dead browser UUID"*) never runs. The
container therefore receives a config pointing at an address that no longer
answers.

`RECOMMENDATION` — decide explicitly, in this change, and record it:

- **If Bonfire browsing is retired**, stop writing `agent-browser.json` and
  `AGENT_BROWSER_CONFIG` for the procurement container. That completes the
  security closure — no container holds any CDP reference — and makes a Bonfire
  attempt fail loudly at the browser step.
- **If Bonfire browsing must survive**, the bridge cannot be removed in this
  slice, and that is an owner-visible trade between closing the exposure and
  keeping the legacy scanner.

Either is defensible. Leaving the code paths contradicting each other is not.

### H-3 · `process.exit()` can truncate the job's only output

`FACT`. `src/procurement-caleprocure-job.ts:117-123` calls `process.exit(0)` /
`process.exit(1)` immediately after `process.stdout.write(...)`.

`FACT`. The runner spawns with `stdio: ['ignore', 'pipe', 'pipe']`
(`src/job-runner.ts:190`). Writes to a pipe are asynchronous in Node, and
`process.exit()` does not flush them.

`INFERENCE`. The summary JSON is the entire observable product of a shadow run.
Truncating it defeats the purpose of shadow mode.

`FACT`. The clean fix is available: `resetBusinessPool()` is exported
(`src/business-db.ts:103`). Set `process.exitCode`, await
`resetBusinessPool()`, and let the event loop drain naturally.

---

## 3. Medium

| ID | Finding | Evidence |
| --- | --- | --- |
| **M-1** | The port's **interaction** logic is untested — only its pure parsers are. `search`, `waitForBusyToClear`, `waitForResultState`, `readVisibleRows`, `readDepartmentDirectory`, `readDetail` have zero coverage, and that is the code that failed four times. R12 §4.3 specified fixture-based contract tests | `src/procurement-browser-port.test.ts` covers `parseCaleProcureResultTotal`, `parseCaleProcureResultCells`, `validatedLoopbackCdpUrl` only |
| **M-2** | `rows.count()` is re-evaluated in the loop condition, so each iteration costs an extra CDP round-trip and the bound shifts if the DOM mutates mid-loop. ~1,000 round-trips for the 320-row baseline, on a path recovering from a capacity failure | `port:155`, `port:279` |
| **M-3** | No pagination: `pagesVisited: 1` is hardcoded, so any paginated result fails reconciliation and kills the run. Fail-closed, but it is an undocumented, untested assumption that the portal renders every row in one view | `port:342` |
| **M-4** | `localhost` is accepted as a loopback host. It can resolve to `::1` or be redefined in `/etc/hosts`; since loopback enforcement is the security control, prefer `127.0.0.1` only | `port:170` |
| **M-5** | The pg pool is never drained; combined with H-3, the process is killed with open connections after every run | `job:117-123`, `business-db.ts:103` |

---

## 4. Low

| ID | Finding | Evidence |
| --- | --- | --- |
| **L-1** | A result row whose visible cell count ≠ 6 is silently dropped, so a reconciliation failure reports "reported N, extracted M" without saying a row was skipped | `port:107`, `port:161` |
| **L-2** | Scheduled-task timeouts now have no floor at all. `0`/undefined falls back to `CONTAINER_TIMEOUT`, but a configured `1` yields a 1 ms bound | `src/container-runner.ts:808-813` |
| **L-3** | If the second `context.newPage()` throws, the first page leaks — `connect()` has no cleanup on partial failure | `port:214-215` |
| **L-4** | `getByText('Event : ${eventId}', {exact:true})` hard-codes the space-before-colon rendering. Fail-closed, but it is a portal-format constant that belongs in a fixture | `port:363` |

---

## 5. Can a collection failure create a misleading or lossy receipt?

**Misleading: no. Missing or wrong-content: yes — see B-1 and B-2.**

`FACT` — the partial-receipt design is sound. A unit is appended to
`coverage.observedUnits` only *after* echo and reconciliation pass
(`collector:188-193`), so `partial` never claims a unit that failed its checks.

`FACT` — I traced the empty-partial path against the adapter rather than
assuming it: `observedUnits: []` and `evidence: {}` pass
`normalizeCoverageUnits` and `normalizeCoverageEvidence`
(`src/procurement-intake.ts:378-459`), `fn_begin_procurement_source_run_v2`
receives the full nine planned units, and
`fn_complete_procurement_source_run_v2` derives `partial` with all nine missing
(`115:396-405`). A total failure therefore still writes a truthful receipt.

`FACT` — no double-write. When the live receipt is not `complete`, `job:92-96`
throws a plain `Error`, and the catch only re-ingests for
`CaleProcureCollectionError` (`:101`).

`FACT` — proven rows are not lost on failure: `output.rows` accumulates per
completed unit and rides along on `error.partial`.

`INFERENCE` — the two real risks are therefore **B-1**, which writes a receipt
whose unit list is right and whose counts and rows belong to a different search,
and **B-2**, which writes no receipt at all. H-1 additionally discards proven
coverage that the design intends to keep.

---

## 6. Process lifecycle

| Concern | Assessment |
| --- | --- |
| CDP shutdown | ✅ `close()` closes only the two pages and deliberately never calls `browser.close()` on the shared launchd Chrome (`port:396-404`) |
| Process-group kill | ✅ Chrome is launchd-owned and outside the job's process group, so SIGTERM to `-pid` cannot kill it |
| Pages left behind | ❌ **B-2** — two per timed-out run |
| PostgreSQL pool lifetime | ⚠️ **M-5** — never drained; `resetBusinessPool()` unused |
| Concurrent jobs | ✅ `getRunningJobNames()` guard (`job-runner.ts:47-70`) plus `retries: 0` in the registration |
| Immutable-release dependency resolution | ⚠️ see §7 — `node_modules` is not in the archive |

---

## 7. Security and release/operational readiness

### 7.1 Security

`FACT` — **loopback enforcement is real.** `validatedLoopbackCdpUrl`
(`port:166-182`) rejects non-`http:`, non-loopback hosts, credentials, paths,
queries, and fragments, and is tested against the old bridge address. Nit M-4
aside, this is the right control in the right place.

`FACT` — **the release-root job path is soundly contained.**
`resolveJobScriptPath` (`src/job-runner.ts:27-49`) applies the release root only
when `project === 'nanoclaw'`, `script` starts with `dist/`, and `codeRoot` is
absolute, then verifies containment with `path.relative` and rejects `..` or an
absolute remainder. Spawning `.js/.mjs/.cjs` via `process.execPath`
(`:176-184`) guarantees the pinned interpreter.

`FACT` — **gates are fail-closed.** Live writes require
`PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED=1` (`job:60-67`); shadow mode needs
no gate but performs no write; the job registers `enabled: false`.

`FACT` — **the container ingest IPC remains gated** by
`caleProcureIngestEnabled` (`src/procurement-policy.ts:52-56`) and unchanged in
code. Keeping it at `0` during cutover, per R12 §7, is correct.

`FACT` — **socat removal closes the exposure**, subject to H-2.

### 7.2 Release and operations

`FACT` — `playwright-core@^1.62.1` is added to `package.json` and
`package-lock.json`; both are packaged and `FILES.sha256`-covered. Both new
scripts are appended to the builder's tracked list
(`scripts/build-release.mjs:112-117`), and the builder refuses any untracked
file, so both must be committed before a build.

`FACT` — **`node_modules` is not in the archive**, so production must install
`playwright-core` before the job can run.

`FACT` — I checked the blast radius rather than assuming it:
`procurement-browser-port.ts` is imported **only** by
`procurement-caleprocure-job.ts` and its own test. `src/index.ts` and the
scheduler do not reach `playwright-core`.

`INFERENCE`. Activating the release before refreshing `node_modules` therefore
degrades to a failing collector job (exit 1, `alert_level: 'warn'`), **not** a
crashed daemon. That is a safe ordering property and worth recording, but the
rollout must still sequence `npm ci` before enabling the job.

`RECOMMENDATION` — rollout order: commit → build/verify → activate → `npm ci` on
the shared production `node_modules` → confirm `/health` and
`codeRootMatchesRelease` → register the job with `--disable` → shadow runs →
`--enable` with `PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED=1`. Pause the legacy
scan task and set `PROCUREMENT_CALEPROCURE_INGEST_ENABLED=0` before the first
shadow run. **Rollback** = `register-caleprocure-collector.mjs --disable` (no
code revert needed) and, if required, reactivate the prior release plist.

---

## 8. Minimal exact fix sequence

1. **B-1** — `src/procurement-browser-port.ts`: replace `waitForBusyToClear`
   with a transition proof (detached pre-click summary handle, or
   `waitForResponse`, or require busy to appear then clear). Add the post-Clear
   baseline-total assertion in `search()`.
2. **B-3** — `src/procurement-caleprocure-collector.ts`: move the
   `MAX_COLLECTED_ROWS` check above the verification loop, testing
   `observed.rows.length` against the remaining budget.
3. **B-2** — `src/procurement-caleprocure-job.ts`: arm an internal deadline at
   ~80% of `timeout_ms` and a `SIGTERM` handler; both must close the port, write
   the partial receipt, and exit non-zero.
4. **H-3 / M-5** — same file: `process.exitCode` plus `await resetBusinessPool()`
   instead of `process.exit()`.
5. **H-1** — `src/procurement-caleprocure-collector.ts`: on identity failure,
   omit the unit and continue instead of aborting the run.
6. **H-2** — decide and implement: either stop writing `agent-browser.json` for
   the procurement container, or retain the bridge; record the decision in the
   changelog.
7. **M-1** — add fixture-based port tests (§9), including a stale-state fixture
   that must fail.
8. Optional in this slice: M-2, M-3, M-4, L-1..L-4.

**Required new tests**, each failing before its fix:

- stale-state fixture: a search whose grid does not refresh must **not** produce
  an observation (B-1);
- a keyword returning 201 rows must fail **before** any `readDetail` call —
  assert the port's `readDetail` call count is 0 (B-3);
- an aborted collection writes a partial receipt and closes the port (B-2);
- an unresolvable agency omits its unit and later units still complete (H-1);
- `resolveJobScriptPath` already covered by `src/job-runner-path.test.ts` ✅.

---

## 9. Shadow and live acceptance gates

**Shadow (no writes), all required:**

1. Three consecutive shadow runs complete inside 50% of `timeout_ms`.
2. The baseline reports a non-zero total with `extractedRows === resultCount`.
3. All nine units report per-unit diagnostics; the summary JSON arrives
   **untruncated** (proves H-3 fixed).
4. Two units with **different** result totals produce **different** observations
   — the B-1 disproof, and the assertion I would not waive.
5. `facilitation` reports event `0000039985`, and identity resolves to BU `3820`
   via the full directory plus a detail match.
6. A deliberately induced failure (e.g. an unreachable detail page) produces a
   partial with earlier units preserved.
7. No Chrome tab growth across the three runs.

**Live (writes, collection-only, review off):**

8. One `complete` receipt with nine observed units, zero missing, and
   `adapter_version = caleprocure-browser-v2`.
9. Event `0000039985` present as a source-keyed opportunity with
   `review_state='unreviewed'`, reached with **no operator assistance**.
10. **Forbidden:** a `complete` nine-unit zero-row run while `0000039985` is
    visible.
11. `procurement_review_cards` unchanged; review gate still `0`.

**Before review may ever be enabled**, additionally: 12. two consecutive
scheduled live runs pass gates 8–11 on different days, at least one of which
legitimately returns zero rows while the baseline control remains non-zero —
proving a truthful empty scan is distinguishable from a broken one.

`INFERENCE` — gate 12 is what finally retires the residual carried since R8
§5.4. Event `0000039985` closes **2026-08-13**, so gate 9 must be exercised
before then; after that the unfiltered baseline (gate 2) is the only liveness
proof, which is precisely why it is a gate and not a diagnostic.

---

## 10. Owner decisions, commands, limitations, time, cost

### Remaining owner decisions

**One new, and it is a genuine trade rather than a correctness question:**

| ID | Decision | Why it is the owner's |
| --- | --- | --- |
| **OD-5** | Retire agent-owned Bonfire browsing along with the socat bridge, or keep the bridge so the legacy scanner keeps its Cloudflare-bypassing profile (H-2) | Closing the container CDP exposure and keeping the legacy Bonfire scanner are in direct conflict. Whether Bonfire still produces business value is a judgment the repository cannot make |

**OD-4** (R12) is unchanged and now partially answered by evidence: the collector
exists and works in unit tests, so the cost of finishing it is smaller than when
OD-4 was raised — but the SAM.gov alternative is untouched.

Three remain open from R6, all migration-116-scoped, all fail-closed, none
affected: **OD-1**, **OD-2**, **OD-3**.

### Commands run

| Command | Result |
| --- | --- |
| `npx vitest run` × 5 focused files | `REPRODUCED` — **42 tests / 5 files pass** (identity 3, collector 5, container-runner 28, job-path 3, browser-port 3) |
| `git status --porcelain`, `git diff --stat ec62c30`, `git diff ec62c30 -- <path>` | Read-only |
| `grep`, `sed`, `wc -l`, `date` | Read-only |

Files read: `src/procurement-browser-port.ts`,
`src/procurement-identity.ts`, `src/procurement-caleprocure-collector.ts`,
`src/procurement-caleprocure-job.ts`, their four test files,
`src/job-runner.ts`, `src/container-runner.ts`, `src/procurement-intake.ts`,
`src/procurement-ipc-handlers.ts`, `src/procurement-policy.ts`,
`src/business-db.ts`, `scripts/register-caleprocure-collector.mjs`,
`scripts/build-release.mjs`, `scripts/start-procurement-browser.sh`,
`package.json`, `groups/procurement/CLAUDE.md`,
`knowledge/agents/procurement/procedures/scan-caleprocure.md` and
`scan-workflow.md`, the continuity documents, and the R12–R13 chain.

No database, network, browser, container, production, or deployment access; no
`.env*`, credential, session, browser-profile, log, or row content was read.

### Limitations

`FACT`. I did **not** run `npm run typecheck` or the full suite this round: the
sandbox continues to decline the pinned Node 22.23.2 binary, and
`better-sqlite3`-dependent suites fail under my ambient Node v26.6.0
(`NODE_MODULE_VERSION 127` vs `147`). The five focused files have no native
dependency and ran here. Codex's pinned typecheck and full-suite results remain
theirs to confirm — note their own report says typecheck passed *before* the
latest path-hardening edit, so it should be re-run.

`UNKNOWN`. Nothing in this review drove the live portal, so B-1's three
candidate fixes cannot be chosen from here; gate 4 in §9 is the empirical
decision point. Canary-4 container logs remain out of scope, so the original
20.6-minute breakdown is still unmeasured — it does not change any finding.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R13.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Elapsed time and cost

Approximately 29 minutes wall-clock, 2026-08-10T01:55Z–02:24Z: reading ~1,180
lines of new implementation and tests plus the related runtime, release, and
instruction surfaces, one focused test run, and one file write. The last
observable session budget reading was **$5.70 of $15** at the start of R9; the
counter is cumulative across the session rather than per-round, and this CLI
wrapper does not expose an exact per-round cost, so none is estimated.
