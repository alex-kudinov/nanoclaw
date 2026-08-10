# NC-20260809-003 — Deterministic CaleProcure collector, architecture review, Claude R12

- Round: R12, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R12.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T01:18Z–01:46Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; live commit `ec62c30`
- Change class: C0 architecture review. No production, database, browser,
  network, vault, or secret access; no `.env*`, credential, session,
  browser-profile, log, row, or task-payload content read; nothing implemented,
  committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION` · `UNKNOWN` = cannot be determined from available evidence.

---

# Verdict: GO on the deterministic collector direction

With four corrections to the proposed surface, each of which makes the change
**smaller** than the request assumes:

1. **It is a host job, not new orchestration.** `src/job-runner.ts` already
   provides an atomic already-running guard, a real per-job `timeout_ms`, run
   logs with exit codes, retries, a lockfile, and channel reporting. The
   collector is a script that surface already knows how to run.
2. **It needs no migration and no new adapter.** `ingestCaleProcureRows`
   (`src/procurement-intake.ts:545`) is already the host-owned, tested write
   path. The collector calls it directly instead of through IPC.
3. **It must not use the container-facing CDP bridge.** The host already talks
   to Chrome on loopback; the bridge exists only to reach the *container*. A
   host-side collector lets that bridge — the shared-CDP exposure I have flagged
   in six consecutive rounds — be **deleted** rather than entrenched.
4. **The durable positive control already exists and is free**: the unfiltered
   baseline query. It never expires, adds no rows, and needs no change to the
   release-owned planned units.

The single most important consequence, and the reason I would take this
direction even if the canary had passed: **coverage evidence stops being a
claim.** Today `observed_units`, `resultCount`, and `pagesVisited` are asserted
by the agent and the host can only check their shape (`115:371-390`). When the
process that executes the searches is the same process that writes the receipt,
that entire class of unfalsifiable report disappears. That has been the standing
residual since R8 §5.4, and no prompt edit can close it — which is the honest
reason not to attempt a fifth.

---

## 1. Root cause, and what is unknown without logs

### 1.1 What the evidence establishes

`FACT` — the timeout arithmetic reconciles exactly.
`effectiveContainerTimeoutMs` returns
`Math.max(configTimeout, IDLE_TIMEOUT + 30_000)`
(`src/container-runner.ts:808-811`), and `IDLE_TIMEOUT` defaults to
`1_200_000` ms (`src/config.ts:67`). So the effective ceiling was
`max(900_000, 1_230_000) = 1_230_000` ms. The reported run consumed
**1,235,396 ms** — 5.4 s past that ceiling, consistent with kill-plus-teardown.

`INFERENCE`. The container was terminated at the wall-clock ceiling with
`had_result=false` and zero source-run receipts. It therefore never reached
Step 4 and never called the ingest IPC. The configured 900,000 ms bound the
operator set was never the operative bound; the run got 37% more time than
intended and still did not finish.

`INFERENCE` — the failure mode has moved, which is itself the finding:

| Canary | Failure |
| --- | --- |
| 1 | No receipt; scheduler double-queue |
| 2 | No receipt |
| 3 | Receipt mechanically perfect (9/9), business result false — Search never clicked |
| 4 | No receipt, no result, wall-clock exhausted |

Canaries 1–3 were *correctness* failures that each prompt revision addressed.
Canary 4 is a *capacity* failure. The procedure that failed on time is the most
rigorous one yet: R11 added a **fresh** `agent-browser snapshot -i` per keyword
(`scan-caleprocure.md:48-52`, item 9), on a PeopleSoft page whose unfiltered
state renders 320 rows, plus a business-unit lookup requiring its own filtered
search, count assertion, and a detail-page verification per candidate row.

`INFERENCE` — leading hypothesis, stated as a hypothesis: each rigor increment
raised per-keyword cost, and the nine-keyword loop plus identity verification no
longer fits the budget. Prose hardening and time budget are in direct tension,
and canary 4 is where they crossed. I cannot prove this without logs.

### 1.2 What is unknown

`UNKNOWN`, and exactly what would resolve it:

| Question | Evidence that would answer it |
| --- | --- |
| Where did 20.6 minutes go — browser startup, per-keyword snapshots, the lookup workflow, or model deliberation? | Per-step timestamps in the container log |
| How many of the nine keywords completed before the kill? | Slack milestone posts (Step 1 instructs posting at each milestone) or the container log |
| Did any search execute at all this time? | Same |
| Was the snapshot payload large enough to dominate the turn? | Token/latency accounting for the run |

`INFERENCE`. None of these changes the recommendation. Whether the cost is
snapshot size, model deliberation, or portal latency, the response is the same:
move the deterministic work out of the model turn. Reading the logs would refine
the collector's time budget, not the decision. **I would not gate this round on
obtaining them**, but I would read them before choosing the per-query timeout in
§4.

---

## 2. The timeout-floor contract

`FACT`. `effectiveContainerTimeoutMs` (`src/container-runner.ts:808-811`)
silently raises any configured group timeout below `IDLE_TIMEOUT + 30_000`.
A group configured for 900,000 ms runs for up to 1,230,000 ms, and nothing
records the discrepancy.

`INFERENCE` — the floor's rationale is sound for **message** containers: killing
one before `IDLE_TIMEOUT` can fire would pre-empt the idle-exit path. It is
unsound for **task** containers, which are single-turn and closed 10 s after
their result (`src/task-scheduler.ts:203-212`). A scheduled task never waits out
an idle timer, so it should never inherit an idle-derived floor.

`RECOMMENDATION` — repair, but not first, and not as a blocker:

```ts
export function effectiveContainerTimeoutMs(
  group: RegisteredGroup,
  isScheduledTask = false,
): number {
  const configured = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
  const floor = isScheduledTask ? 60_000 : IDLE_TIMEOUT + 30_000;
  if (configured < floor) {
    logger.warn({ group: group.name, configured, floor },
      'Configured container timeout raised to the effective floor');
  }
  return Math.max(configured, floor);
}
```

Two properties matter more than the numbers: a raised value is **logged**, so no
future timing measurement is silently uninterpretable again; and task containers
honor what the operator configured.

`INFERENCE` — priority. The collector does **not** inherit this floor at all,
because it is not a container: `Job.timeout_ms` (`src/types.ts:164`) is enforced
directly at `src/job-runner.ts:212` with a distinct `'timeout'` status. So this
repair is a correctness item for the remaining container task paths, best
shipped **with** the collector slice rather than ahead of it. Its urgency drops
further under §7's recommendation to pause the agent scan path entirely.

---

## 3. Implementation surface

**Recommended: surface 1, with the CDP correction — a host job driving a
host-local Chrome over loopback CDP via `playwright-core`.**

### 3.1 Why not surface 2 (`agent-browser` wrapper)

`FACT`. `container/skills/agent-browser/SKILL.md` documents the contract:
`snapshot -i` returns an accessibility tree with per-snapshot refs (`@e1`,
`@e2`), and the caller clicks by ref. Its stated workflow is
*"Re-snapshot after navigation or significant DOM changes."*

`INFERENCE`. That is a **model-facing** contract, not a machine one. Refs are
assigned per snapshot; the output is a rendered tree whose format is not a
stability guarantee. Worse, the discrimination that has defeated three canaries
— *"a text locator's first match was hidden while its second match was visible"*
(R10 request, reproduction fact 4) — is precisely what a flattened tree makes
hard. A deterministic wrapper would have to reimplement visibility semantics on
top of a lossy text rendering, which is the hardest part of the problem and the
part most likely to drift when the portal re-renders.

### 3.2 Why not surface 3 (official API)

`FACT`. `docs/reports/NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md` contains
no CaleProcure entry at all. Its eight candidates are SAM.gov, official
notification streams, Chicago/Cook County, Grants.gov, and USASpending, and its
recommendation is *"Implement SAM.gov first. It is the only high-value candidate
in this pass with a documented official opportunity API."*

`INFERENCE`. A prior research pass already looked and found no first-party
CaleProcure opportunity API. I cannot prove a negative without browsing, and
this review does not browse — so surface 3 is **unproven and unprovable in this
round**. It remains the right strategic direction (SAM.gov after closure, per
that report), not this slice.

### 3.3 Why surface 1, and the correction to it

`INFERENCE`. Playwright's locator model provides as first-class primitives
exactly what four prose revisions have been trying to describe to a model:
visibility filtering, "expect this text to change," strict-mode failure when a
selector matches more than one element, and typed waits. Strict mode is
particularly apt — the duplicate-element-ID hazard becomes a thrown error
instead of a silent wrong pick.

`FACT` — dependency footprint. The project has 13 runtime dependencies and no
browser automation library (`package.json`). Use **`playwright-core`**, not
`playwright`: it ships no bundled browsers, and `connectOverCDP` attaches to the
Chrome the host already runs. `build-release.mjs` packages `package.json` and
`package-lock.json`, and `FILES.sha256` covers them, so the dependency is
manifest-covered by construction.

`FACT` — **the CDP correction.** `resolveProcurementCdpUrl`
(`src/container-runner.ts`) fetches `http://127.0.0.1:${port}/json/version` on
host loopback and rewrites the returned URL to the bridge IP *only so the
container can reach it*. A host-side collector needs no rewrite and no bridge.

`RECOMMENDATION`. Connect on loopback only. Then, once the collector is the sole
consumer, **retire the container-facing socat bridge**. That is the standing
security item I have raised in six consecutive rounds — a disposable container
outside Procurement reached the unauthenticated gateway — and this is the first
change that lets it be closed by deletion rather than by adding a control.

---

## 4. Smallest end-to-end contract

### 4.1 Module plan

| File | Responsibility | Notes |
| --- | --- | --- |
| `src/procurement-caleprocure-collector.ts` | Query loop, visible-state assertions, pagination bound, row extraction | Pure orchestration over a small port interface; no DB, no Slack |
| `src/procurement-browser-port.ts` | Thin typed interface over `playwright-core` (`open`, `search`, `readSummary`, `readRows`, `lookupBusinessUnit`, `openDetail`) | The seam that makes the collector testable without a browser |
| `src/procurement-identity.ts` | Business-unit lookup + detail verification, name normalization | Extracted so identity rules are unit-testable in isolation |
| `scripts/collect-caleprocure.mjs` | Host-job entry point: build port → run collector → call `ingestCaleProcureRows` → exit code | Registered as a `Job`; `job.script` is a path (`job-runner.ts:85`) |

**No migration. No new IPC. No new adapter.** The collector calls
`ingestCaleProcureRows(rows, runKey, observedAt, executor, coverage)`
(`src/procurement-intake.ts:545`) — the same function
`dispatchProcurementIpc` calls today, with the same coverage shape
`fn_complete_procurement_source_run_v2` already validates.

`INFERENCE` — three existing mechanisms become unnecessary on this path and
should be retired with it, not carried: the container ingest IPC branch
(`src/procurement-ipc-handlers.ts:189-241`), the host run-token correlation
(`src/procurement-task-run.ts`), and receipt validation of the scan task
(`validateProcurementTaskCompletion`). All three exist to make an *agent's*
claim attributable. When the host is the caller, attribution is structural.

### 4.2 Run contract

Per planned unit `u`, the collector records what it observed itself:

- the query string read **back** from the input element after the search click;
- the visible result-summary text and its parsed total;
- extracted visible rows;
- pages visited (bounded, 2);
- elapsed ms.

Then it **asserts**, and aborts the run as `failed` on any violation:

1. the echoed query equals `u` exactly;
2. `extractedRows(u) === min(parsedTotal(u), pageCap)`;
3. the control query (§6) returned a non-zero total and non-zero rows;
4. every submitted row carries a business unit verified by lookup-plus-detail;
5. total elapsed is inside `job.timeout_ms`.

`INFERENCE`. Assertion 2 is the reconciliation the request asks for in item 5,
and it is only meaningful because one process owns both sides. The same
comparison expressed as a procedure obligation would be another self-report.

### 4.3 Tests

| Test | Covers |
| --- | --- |
| `procurement-caleprocure-collector.test.ts` | Fake port fixtures: 9 zero-result units; one positive unit; a count/row mismatch → `failed`; an echoed-query mismatch → unit omitted; pagination bound respected |
| `procurement-identity.test.ts` | Lookup count ≠ 1 → ambiguous; detail event-ID mismatch → reject; detail department mismatch → reject; normalization accepts trim/whitespace/case and rejects substring, fuzzy, abbreviation |
| `procurement-browser-port.test.ts` | Contract test against saved HTML fixtures of the search page, a zero-result state, the hidden-duplicate state, and the lookup table |
| Existing `procurement-intake.test.ts` | Unchanged — the write path is not modified |

`RECOMMENDATION`. The fixtures are the durable asset. Capture them once from the
public page and treat a fixture refresh as an explicit, reviewed change: that is
how a portal re-render becomes a failing test instead of a silent zero-row run.

### 4.4 Rollout gates, rollback, observability

**Gates, in order.** (a) Fixture tests green under pinned Node 22.23.2;
(b) one **shadow** run — collector executes, writes nothing, reports its
assertion table to Slack; (c) one live run writing a source receipt while the
agent scan stays paused; (d) the §6 control passes in both.

**Rollback.** Disable the job (`Job.enabled = false`, `src/types.ts:167`). The
agent path is not deleted in this slice, only paused, so reverting is a
configuration flip. Retire the ingest IPC only after (d) passes.

**Observability.** Already provided by the host-job surface and worth
enumerating because it is why this surface wins: `job_run_logs` carries status,
`exit_code`, `duration_ms`, retry attempt, and `log_file`; `runJob` has an
atomic already-running guard (`src/job-runner.ts:47-70`), per-job `timeout_ms`
with a distinct `'timeout'` status (`:212, :229`), and `alert_level` reporting.
Add one structured line per unit — query, parsed total, extracted rows, pages,
ms — so a future capacity question is answerable without re-running anything.

---

## 5. Proving execution and reconciling counts

Answered in §4.2. The structural point:

`INFERENCE`. Today the host asks the agent "did you search?" and can only
validate the grammar of the answer. Under the collector the host does not ask —
it searched, and it writes down what it saw. `resultCount` changes from a
reported figure to a measured one, and the reconciliation in assertion 2 turns
the "silently drop the inconvenient row" incentive I flagged in R9 §3 into a run
failure.

`INFERENCE`. One honest limit remains: the collector proves *it* executed nine
searches against the portal it reached. It does not prove the portal returned
truthful results, nor does it survive a portal redesign — that surfaces as a
fixture-contract failure, which is the correct and loud outcome.

---

## 6. A durable positive control

`RECOMMENDATION` — **the unfiltered baseline**, available today and permanent.

`FACT`. The R10 reproduction records the initial page state as an unfiltered
`Showing Results 1-320 of 320` table.

The collector runs one control observation per scan — the unfiltered state
before any keyword filter — and asserts `parsedTotal > 0` **and**
`extractedRows > 0`. If the control is empty, the selector or portal contract is
broken and the run fails **even when all nine keyword searches legitimately
return zero**.

Why this is the right control:

- it never expires, unlike event `0000039985` (closes **2026-08-13**);
- it needs no open opportunity matching our keywords;
- its rows are counted, never submitted, so `procurement_opportunities` stays
  clean;
- it requires no change to `CALEPROCURE_PLANNED_UNITS`
  (`src/procurement-source-config.ts:10-20`) and therefore no change to the
  release contract or the validator's set-equality check.

`INFERENCE`. This supersedes my R9 §5 / R10 suggestion of adding a broad control
keyword to the planned units. That would have polluted the opportunity table and
changed the release-owned unit set; the unfiltered baseline achieves the same
liveness proof with neither cost. **I withdraw the earlier suggestion.**

`RECOMMENDATION` — keep the expiring control too, while it lasts. Until
2026-08-13, additionally assert that `facilitation` yields event `0000039985`
with business unit `3820`. It is the only end-to-end check of the identity
workflow against a known answer, and it should be captured as a **fixture**
before it closes so the identity tests keep a real example permanently.

---

## 7. Should collection stay enabled?

`RECOMMENDATION` — **no. Pause the scheduled scan task and set
`PROCUREMENT_CALEPROCURE_INGEST_ENABLED=0` until the collector ships.**

`FACT`. That flag gates exactly one thing: the ingest branch of
`dispatchProcurementIpc` (`src/procurement-ipc-handlers.ts:190-192`,
`caleProcureIngestEnabled` at `src/procurement-policy.ts:52-56`). Setting it to
`0` blocks the **container's** write path and does not block host-side or
operator-assisted adapter calls, which do not pass through that dispatcher.

`INFERENCE`. With the scheduled task paused, nothing legitimate uses the IPC.
Leaving it enabled preserves exactly one capability: a manually typed
`rescan caleprocure` producing a fifth unverifiable receipt. After four failures
the fail-closed default is correct, and it costs nothing — the collector will
not use that gate.

`RECOMMENDATION` — when the collector reaches gate (d), **remove the ingest IPC
branch** rather than re-enabling it. It is the surface through which an agent
asserts coverage, and deleting it is the architectural closure of this recovery:
after that, no model-authored claim can become a source receipt.

---

## 8. Owner decisions, commands, time, cost

### Remaining owner decisions

**One new owner decision arises this round**, and it is genuinely the owner's
because it trades money and scope, not correctness:

| ID | Decision | Why it is the owner's |
| --- | --- | --- |
| **OD-4** | Fund the deterministic collector (a new `playwright-core` dependency, ~4 modules, browser fixtures, ongoing fixture maintenance against a portal that will re-render) **or** stop investing in CaleProcure and go to SAM.gov's official API first, per the source-candidates recommendation | Four model-driven attempts have failed. The collector is the smallest thing that can work for *this* source, but SAM.gov is a documented official API with no browser at all. Which to build first is a business judgment about where the next opportunity actually comes from — the repository cannot answer it |

`INFERENCE`. I am not recommending a fifth prompt revision under either branch.
If the owner chooses SAM.gov first, CaleProcure collection should be **paused**
(§7), not left running in a state that has produced one false receipt and three
empty ones.

Three decisions remain open from R6 — all migration-116-scoped, all fail-closed
configuration, none affected by this round:

| ID | Decision | Status |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` / `RECORD-SUBMISSION` — `PROCUREMENT_APPROVER_UIDS`, defaulting empty | Open, 116-scoped |
| **OD-2** | Must the approver differ from the packet assembler | Open, 116-scoped |
| **OD-3** | Outcome follow-up window and maximum evidence age | Open, 116-scoped |

`INFERENCE` — the contingent decision from R9/R11 is **resolved by §6 and no
longer needs the owner.** The choice was between accepting an unfalsifiable
zero-row `complete` and holding review until a durable positive control existed.
The unfiltered baseline is that control, it is free, and it does not expire — so
the dilemma dissolves rather than being decided.

### Commands run

`git log --oneline`, `git status --porcelain`, `grep`, `sed`, `head`, `find`,
`date`. Read-only inspection of
`src/container-runner.ts` (timeout floor, CDP resolution, mount plan),
`src/config.ts` (`IDLE_TIMEOUT`, `CONTAINER_TIMEOUT`),
`src/job-runner.ts` (execution model, guard, timeout, run logs),
`src/types.ts` (`Job`), `src/procurement-intake.ts`,
`src/procurement-ipc-handlers.ts`, `src/procurement-policy.ts`,
`src/procurement-source-config.ts`, `src/task-scheduler.ts`,
`package.json`, `container/skills/agent-browser/SKILL.md`,
`knowledge/agents/procurement/procedures/scan-caleprocure.md`,
`docs/reports/NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md`, and the
R9–R12 request/response chain.

No test, typecheck, or build was run: this round inspects no code change — the
working tree is unchanged from the R11 review except for the R11/R12 report
files. No database, network, browser, container, production, or deployment
access; no log, `.env*`, credential, session, browser-profile, or row content
was read.

### Environment limitations

`FACT`. The pinned Node 22.23.2 binary remains unavailable to this sandbox, so
`better-sqlite3`-dependent suites cannot run here. Not load-bearing this round —
no code changed.

`UNKNOWN`. Container and browser logs for canary 4 were out of scope by
instruction, so §1.2's timing questions stay open. They would refine the
collector's per-query budget, not the recommendation.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R12.md
```

`FACT`. No source, test, script, migration, prompt, procedure, continuity file,
or other report was edited. The exact Claude session was preserved throughout.

### Elapsed time and cost

Approximately 28 minutes wall-clock, 2026-08-10T01:18Z–01:46Z: reading the
request, the timeout and job-execution surfaces, the browser-skill contract, the
source-candidates report, and the intake/policy write path, then one file write.
The last observable session budget reading was **$5.70 of $15** at the start of
R9; the counter is cumulative across the session rather than per-round, and this
round's exact marginal cost is not observable from inside the session and is not
estimated.
