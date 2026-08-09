# NC-20260809-003 — R7 disposition verification and canary readiness, Claude R8

- Round: R8, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R8.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T23:40Z–00:07Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `9aa23b4e7c39`; diff base `9aa23b4e7c394145487baabb64873beb5d321617`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = I ran the command and observed the output · `INFERENCE` ·
`RECOMMENDATION` · `RESIDUAL` = accepted limitation, not a defect to fix.

---

# Verdict: GO

All ten R7 dispositions are implemented, and every determinate finding I raised
is closed. I re-ran four of Codex's five verification commands myself and they
pass; the fifth is partially blocked by a Node ABI limitation described in §8,
where I independently reproduce **46 tests across 5 files** and verify 40 of
them.

Commit, immutable build, collection-only deployment, and one third natural
CaleProcure canary may proceed with review disabled.

Four items remain open. **None blocks this round**, and I want to be precise
about why rather than burying them: three are safe-direction (they produce a
false *alarm*, never a false *success*), and the fourth is inherent to the
architecture and is exactly what canary evidence item 7 exists to cover. They
are §5 and §7.

The one thing I would ask the operator to do that is not in the plan is in
§4.3: execute the new JSONB predicate once, read-only, against the live schema
before the canary runs. It is a `SELECT` returning zero rows, and it converts
the only unexecuted expression in this delta into a verified one.

---

## 1. R7 disposition verification, F-1 through F-10

| R7 ID | R7 severity | Disposition | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| **F-1** | Blocker | `deployed_unverified` | `docs/ACTIVE-WORK.md` row for `NC-20260809-003`. `REPRODUCED`: `docs:continuity-check` now passes — *"48 active/ready task rows, 44 changelog entries"* | **Closed** |
| **F-2** | Blocker | Final text buffered | `src/task-scheduler.ts:253` gates the streaming send on `!receiptRequired`; validation at `:296-316`; buffered send at `:318-327`. Order asserted in `src/task-scheduler.test.ts` via `invocationCallOrder` | **Closed** |
| **F-3** | Blocker | Host-owned token | `src/procurement-task-run.ts:13-27` (derivation), `:29-42` (begin), `:50-57` (end); override at `src/procurement-ipc-handlers.ts:213-221`; validator queries `run_key = $1` at `src/procurement-task-completion.ts:85` | **Closed** |
| **F-4** | Blocker | Fail-closed prompt classification | `src/procurement-task-completion.ts:33-55`: normalize → `scanPrompts` set including bare `rescan` → exact `rescan bonfire` exemption → `/\b(?:re)?scan\b|caleprocure/` catch-all that warns **and returns true** | **Closed** |
| **F-5** | High | Release-contract assertion | `src/procurement-task-completion.ts:78-82` adds `adapter_matches` and `planned_units_match`; enforced at `:106-107` | **Closed** |
| **F-6** | High | Dependency required | `src/task-scheduler.ts:48-51` — no `?`. Called unconditionally at `:298` | **Closed** |
| **F-7** | High | Loud orphan sweep | `src/db.ts:1001-1028` (`failOrphanedOnceTasks`, transactional, re-checks the predicate inside the `UPDATE`); `src/task-scheduler.ts:373-390` logs and alerts. `src/types.ts:137` widens status to include `'error'` | **Closed**, with §5.1 |
| **F-8** | Medium | Accepted and recorded | `src/db.ts:1039` still sets `'completed'` when `nextRun` is null; asserted at `src/task-scheduler.test.ts` (`status` `'completed'`, `last_result` `'Error: missing host receipt'`) | **Closed as accepted** |
| **F-9** | Medium | Deferred-drain test added | `src/task-scheduler.test.ts` — *"keeps a deferred queue entry singular until its callback claims the task"*: id-deduping stub, 120 s of polling, `accepted === 1`, `runContainerAgent` not called until the callback fires | **Closed**, with §6.1 |
| **F-10** | Low | No change needed | `src/router.ts:49-57` unchanged | **Confirmed** |

`FACT` — no CHECK constraint exists on `scheduled_tasks.status`
(`src/db.ts:44-56`, `status TEXT DEFAULT 'active'`), so writing `'error'`
persists without a migration. I checked this specifically because a status
CHECK would have made F-7 a runtime failure rather than a fix.

`FACT` — F-6 has a second-order benefit worth noting: making the dependency
required means the receipt gate cannot be silently omitted by a future caller.
`src/index.ts:2475` is the only production call site.

---

## 2. Token audit

### 2.1 Lifetime

`FACT`. Acquired at `src/task-scheduler.ts:228-234`, immediately inside the
`try` and before `runContainerAgent`. Released at `:291-293` in a `finally`
attached to that same `try/catch`, so it is released on success, on container
error, and on throw.

`FACT`. `endProcurementTaskRun` releases only when the stored value equals the
token it was given (`src/procurement-task-run.ts:54-56`), so a task cannot
release another task's registration.

`FACT`. `beginProcurementTaskRun` throws when a token is already active for the
group (`:34-38`). That throw lands inside the `try`, so `activeRunToken` stays
null and the `finally` does **not** clear the incumbent's token. Correct
ownership under contention.

`INFERENCE`. The registry is in-process only, so a crash cannot leave a stale
token behind — the map dies with the process. This is the right storage tier: a
persisted token would need its own orphan sweep.

### 2.2 Collision and length

`FACT`. Task ids are generated as
`` `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ``
(`src/ipc.ts:1793`). The token is therefore ~40 characters — well inside the
128-character bound — and every character is inside
`[A-Za-z0-9._:-]`.

`FACT`. `RUN_TOKEN_RE` (`src/procurement-task-run.ts:11`) is byte-identical to
the two independent guards it must satisfy: the IPC check at
`src/procurement-ipc-handlers.ts:196` and the adapter check at
`src/procurement-intake.ts:555-558`. A token that passes derivation cannot be
rejected downstream.

`INFERENCE` — collisions are unreachable. Distinct tasks have distinct ids;
distinct runs of one task need distinct millisecond start times, and two
concurrent runs of one task are already prevented by the CAS (§2.5) and the
queue's `pendingTasks` dedupe.

`FACT` — a hostile or malformed task id fails **closed**: `procurementRunToken`
throws (`:21-25`), the throw is caught at `:288-290`, `error` is set, and
validation is skipped at `:296` because `error` is truthy. The task ends in
`error` rather than unvalidated success.

### 2.3 IPC override

`FACT`. `src/procurement-ipc-handlers.ts:213-221`. `hostRunKey ?? payload.runKey`,
with a `warn` carrying both values on mismatch. Not an error — correct, because
the agent has no way to learn the token, so a mismatch is the expected case, not
an attack signal.

`FACT`. The model's `runKey` is still charset-validated at `:194-198` **before**
the override. `INFERENCE`: for a scheduled task this is a rejection that could
not have mattered, since the value is about to be discarded. It is harmless and
keeps the wire contract uniform for manual calls; I would not change it, but it
is worth knowing that a scheduled scan can fail on a key the host was going to
throw away.

`FACT` — the container cannot forge a receipt even with a known token.
`fn_begin_procurement_source_run_v2` is `GRANT EXECUTE … TO nanoclaw_admin`
only (`115:870-872`), `procurement_source_runs` has no
`nanoclaw_procurement` policy, and the container's only path to the ledger is
this IPC. Verified against the accepted 115 grants without reopening them.

### 2.4 Retry

`FACT`. A retry inside the same task run reuses the same token, so
`fn_begin_procurement_source_run_v2` resumes a `failed`/`partial` row
(`115:276-284`) instead of creating a second one.

`FACT` — a genuine narrowing introduced by the override, and I want it on the
record because it can surface during the canary: `115:270-275` raises when a run
key returns with a *different* `batch_hash`. Before the override the agent could
retry a corrected batch under a fresh key; now the key is pinned for the whole
task run, so a retry with changed evidence is rejected and the scan cannot
self-correct in-container.

`FACT` — the procedure already matches this constraint:
`knowledge/agents/procurement/procedures/scan-caleprocure.md` instructs
*"`partial` or `failed` must be reported and retried with the same run key and
exact batch evidence"* and, for a host denial, *"keep the local extraction
artifact for a separately authorized retry."* Contract and code agree.

`INFERENCE`. Net effect: an in-container retry becomes a task-level retry. The
task fails loudly, the operator re-runs it, and the new run gets a new token.
Recoverable and truthful — the correct trade for causal attribution.

### 2.5 Multi-daemon and CAS

`FACT`. `src/db.ts:980-996` — the claim is
`UPDATE scheduled_tasks SET next_run = ? WHERE id = ? AND status = 'active' AND next_run = ?`
returning `changes === 1`. Compare-and-swap against the exact value the poller
read, with the `status` re-check folded in. SQLite serializes writers, so
exactly one claimant wins across processes.

`FACT`. `src/task-scheduler.ts:140-158` computes `claimedNextRun` per schedule
type first (cron → next occurrence, interval → now+ms, once → null) and passes
it as the swap value, so one statement covers all three types. A lost race
returns at `:152-158` before any container work.

`INFERENCE`. This is stronger than my R7 recommendation. I said the CAS was
"worth doing" rather than required, because the token already prevented a
duplicate from borrowing another run's receipt. Implementing both means a
duplicate cannot even start, and the token means that if one somehow did, it
could not produce a false receipt. Defence in depth on the axis that actually
failed in production.

---

## 3. Task-state audit

| Scenario | Path | State reached | Correct |
| --- | --- | --- | --- |
| Invalid group folder | `:118-133` — throws before the CAS | `status='paused'`, run log `error`; `getDueTasks` requires `status='active'` so no churn | ✅ |
| Lost CAS | `:152-158` | returns; no run log, no message, no container | ✅ — the winner owns the outcome; `logger.info` records the loss |
| Group not found | `:169-184` — **after** the CAS | run log `error`, returns without `updateTaskAfterRun` | ⚠️ §5.2 |
| Container error | `:288-290` | `error` set; validation skipped at `:296`; run log `error`; task `completed` with `Error:` summary | ✅ |
| Missing/invalid receipt | `:296-316` | `error` set, `[SCHEDULED TASK NOT COMPLETE]` sent, model text **never** sent, run log `error` | ✅ |
| Valid receipt | `:318-327` | model text sent exactly once, after validation | ✅ |
| Success-message delivery failure | `:320-326` | caught and logged; task stays successful | ✅ — matches the R4/R7 rule that a delivery failure may never claim the work did not happen |
| Daemon restart mid-`once` | `src/db.ts:1001-1028` + `:373-390` | `status='error'`, fixed `last_result`, log, alert, no re-run | ✅, §5.1 |
| Cron | `:143-146` | `next_run` advanced by CAS; receipt rules apply if classified | ✅ |
| Interval | `:147-149` | `next_run` advanced by CAS | ✅ |
| Once | `:150-151` | `next_run` null by CAS | ✅ |
| **Ordinary non-Procurement task** | `:253-257`, `:296-298` | streams exactly as before; `validateProcurementTaskCompletion` returns at `:67` before any query | ✅ **unchanged**, as required |

`FACT` — the startup sweep's alert is deliverable. `main()` awaits
`channel.connect()` for every channel at `src/index.ts:1874-1875` and calls
`startSchedulerLoop` at `:2457`, so channels are live before
`failOrphanedOnceTasks` runs. I checked this specifically because an alert that
fires only at startup would be worthless if it raced channel connection.

---

## 4. PostgreSQL predicate validation

### 4.1 Parameter order

`FACT`. `src/procurement-task-completion.ts:72-89`. Bindings
`[runKey, startedAt, CALEPROCURE_ADAPTER_VERSION, plannedUnits]` map to
`run_key = $1` (`:85`), `started_at >= $2::timestamptz` (`:86`),
`adapter_version = $3` (`:78`), and `$4::text[]` (`:79-81`). Correct and
consistent.

### 4.2 Semantics against the live schema

| Expression | Schema fact | Assessment |
| --- | --- | --- |
| `run_key = $1` with `LIMIT 1` | `UNIQUE (source, run_key)` (`114:138`) | At most one row exists; `LIMIT 1` is belt-and-braces |
| `planned_units @> to_jsonb($4::text[]) AND to_jsonb($4::text[]) @> planned_units` | `planned_units jsonb NOT NULL DEFAULT '[]'` (`115:35`) with `jsonb_typeof(...) = 'array'` (`115:69`) | Mutual containment = set equality on jsonb arrays |
| `AND jsonb_array_length(planned_units) = cardinality($4::text[])` | — | Closes the duplicate-element gap that mutual containment alone leaves open. Correct, and necessary |
| `adapter_version = $3` | `adapter_version text` — **nullable** (`115:34`) | A legacy NULL yields SQL `NULL`, which arrives as JS `null`; `row.adapter_matches !== true` (`:106`) rejects it. **Fails closed** |
| `started_at >= $2` | Set from the host clock at `procurement-ipc-handlers.ts:222` | Same clock as `startTime`; no skew class. Redundant given the exact key, and correctly kept |
| `status`/`observed`/`missing` checks (`:100-105`) | `status='complete'` already implies `missing_units = []` (`115:401-405`) | Redundant, harmless, and independently meaningful if the derivation ever changes |

`FACT`. `plannedUnits` is `[...plannedCaleProcureUnits()]`
(`src/procurement-task-completion.ts:70`) — a real array, not the frozen
readonly reference, so node-postgres serializes it to a `text[]` literal for the
explicit `::text[]` cast.

### 4.3 The one gap, and the cheap close

`FACT`. Every test in `src/procurement-task-completion.test.ts` uses a mocked
executor (`:31-34`) that returns `adapter_matches` and `planned_units_match` as
supplied booleans. **The SQL expression itself is never executed against
PostgreSQL by any test in this repository.**

`INFERENCE`. The failure direction is safe: a malformed predicate raises a query
error, which the `catch` at `:299` converts into a validation failure and a
`[SCHEDULED TASK NOT COMPLETE]` message. A broken predicate cannot produce a
false success — it produces a loud false failure. That is why this is not a
blocker.

`RECOMMENDATION`. Close it anyway, before the canary, at negligible cost. It is
a read-only `SELECT` expected to return zero rows, and it exercises every cast
and operator in the expression:

```sql
-- expect: zero rows, no error
SELECT id, adapter_version = 'caleprocure-browser-v2' AS adapter_matches,
       planned_units @> to_jsonb($1::text[])
         AND to_jsonb($1::text[]) @> planned_units
         AND jsonb_array_length(planned_units) = cardinality($1::text[])
         AS planned_units_match
  FROM public.procurement_source_runs
 WHERE source = 'caleprocure' AND run_key = 'predicate-precheck-no-such-key'
 LIMIT 1;
```

with `$1` = the nine release-owned units. If it errors, the canary would have
failed for a reason unrelated to the scan.

---

## 5. Remaining findings — none blocking

### 5.1 Restart-overlap produces a false orphan alert · Medium · safe direction

`FACT`. Daemon A claims a `once` task (`next_run` NULL, `last_run` NULL,
`status` `active`). Daemon B starts and `failOrphanedOnceTasks`
(`src/db.ts:1005-1012`) matches that exact shape, marks it `error`, and sends
*"was claimed but never completed before daemon restart."* Daemon A then
finishes and `updateTaskAfterRun` (`src/db.ts:1039`) rewrites `status` to
`completed`.

Result: a spurious `[SCHEDULED TASK NOT COMPLETE]` for work that succeeded, and
a final row state that contradicts the alert.

`INFERENCE` — bounded and safe. `GroupQueue.shutdown` stops task containers
rather than leaving them for adoption (`src/group-queue.ts:1321-1325`), so on a
graceful restart A usually completes its bookkeeping first and the sweep finds
nothing. The window is a hard restart, and production currently has zero active
containers.

`INFERENCE` — worth naming for what it is: this round's entire purpose is
eliminating false *success*. A false *incompletion* is the mirror image, and it
is the correct direction to err, but it still trains an operator to discount the
alert.

`RECOMMENDATION` — stamp the claim and only sweep claims older than this
process's start: write `last_result = 'claimed:<iso>'` inside `claimTaskRun`,
and add `AND last_result < 'claimed:' || <daemon start iso>` to the sweep. Fold
into the next Procurement change; do not hold this release for it.

### 5.2 `Group not found` leaves a `once` task in the orphan shape · Low

`FACT`. `src/task-scheduler.ts:169-184` returns after the CAS without calling
`updateTaskAfterRun`, leaving `next_run` NULL, `last_run` NULL, `status`
`active` — exactly the shape §5.1's sweep matches. On the next restart the task
is marked `error` with the reason *"claimed but never completed before daemon
restart,"* which is not what happened.

`INFERENCE`. Terminal state is right (an unregistered group should fail); only
the recorded reason is wrong. Fix by calling `updateTaskAfterRun` with the
existing `Group not found` summary on that path.

### 5.3 The lost-CAS branch is untested · Low

`FACT`. `src/task-scheduler.ts:152-158` is only exercised in its success
direction. No test drives two claimants against one row.

`RECOMMENDATION` — one test: invoke the enqueued callback twice for the same
task and assert `runContainerAgent` is called once, no second run log, and no
message. Cheap, and it pins the branch that makes the multi-daemon argument in
§2.5 true.

### 5.4 `RESIDUAL` — coverage evidence is container-reported

This is the most important line in the review and neither R7 nor R8 states it
outright.

`FACT`. `fn_complete_procurement_source_run_v2` validates the *structure* of
coverage evidence — every observed unit is host-planned, every unit has a
receipt, `resultCount` matches `^[0-9]+$`, `pagesVisited` matches `^[1-9][0-9]*$`
(`115:371-390`). The **numbers themselves come from the agent.**

`INFERENCE`. A `complete` receipt therefore proves that the agent *claimed* nine
searches with structurally valid receipts under a host-owned token — not that
nine browser searches happened. Everything in this delta closes the gap between
"the scheduler said success" and "the host ledger recorded a bound complete
run." It does not, and cannot, close the gap between that and "the portal was
actually searched." The host has no view into the browser.

The procedure already says this in the right words — *"an auditable adapter
receipt, not independent proof that the portal search happened"* — and it should
stay that way.

`INFERENCE`. This is precisely why canary evidence item 7 (§7) carries the
weight it does. Eight zero-result keywords cannot distinguish a working adapter
from one silently returning nothing. The single known live row is the only
positive control, and it is what turns a structurally valid receipt into
evidence that the scan really ran.

---

## 6. Test and documentation sufficiency

### 6.1 Tests — sufficient for this release

`FACT` — `REPRODUCED`: 5 files, **46 tests**, matching Codex's count exactly.
40 pass under my runtime; 6 are ABI-blocked (§8).

Coverage confirmed by reading each test: no channel message on a missing
receipt; exactly one message after success with `invocationCallOrder` proving
validation ran first; the host token overriding a deliberately date-shaped model
key (`src/procurement-ipc-handlers.test.ts`, asserting both the substituted
value and the absence of the model key); bare/drifted scan prompts requiring
receipts with Bonfire-only exempt; foreign planned-unit set and stale adapter
rejected; deferred-queue singularity; restart-orphaned `once` work becoming
visible `error` without re-run.

`RECOMMENDATION` — two additions, neither gating: the lost-CAS branch (§5.3),
and one live-schema execution of the predicate (§4.3).

`INFERENCE` — the deferred-queue test's stub dedupes by id without ever
releasing it, so it models `GroupQueue.pendingTasks` (`src/group-queue.ts:287-290`)
rather than the full drain cycle. It proves what it claims — one acceptance, no
container until the callback fires, one run after — and I am not asking for
more.

### 6.2 Documentation — sufficient

`FACT`. `docs/ENGINEERING-CHANGELOG.md` records deployment, live-canary
evidence, follow-up implementation, and follow-up verification as **separate
facts**, explicitly labels the operator-assisted run as adapter-path-only, and
lists full suite / immutable build / R8 / deployment / third canary as pending.
That is the CHANGE-PROTOCOL requirement met properly, including the rule that
one fact never implies another.

`FACT`. `docs/PROJECT-MAP.md` distinguishes live 115 from the uncommitted
correction and records that both natural canaries are rejected as business
successes. `docs/ACTIVE-WORK.md` is `deployed_unverified` and passes the
continuity check.

`FACT`. The procedure documents the host run-key override in the agent's own
terms — *"the host replaces the submitted `run_key` with a task-bound token …
never trusted as scheduled-task identity and cannot make a different task look
complete."* This was R7 item 10 and it is done correctly: the agent is told the
contract it is actually operating under.

---

## 7. Release and canary

**A verified immutable release and one third natural CaleProcure canary may
proceed, with review disabled.**

`FACT`. Review remains gated on `PROCUREMENT_REVIEW_ENABLED === '1'` plus an
epoch plus at least one operator UID (`src/procurement-policy.ts:28-43`), and
nothing in this delta touches that function, `handleProcurementDecisionMessage`,
or any `DECIDE`/`ADVANCE` path. Human-only authority is unchanged and
unexpanded.

Sequence: commit → `npm test` (full, pinned Node) → `npm run release:build` →
`npm run release:verify` → deploy → confirm `/health` shows the intended commit
and `reviewEnabled: false` → §4.3 predicate pre-check → canary.

The nine evidence items from R7 §7 stand unchanged. Three now have sharper
mechanics:

- **Item 2** — the receipt's `run_key` must equal
  `t.<taskId>.<startMs>` for that exact run. Not merely a post-start run.
- **Item 5/6** — with buffering in place, a passing canary shows the model's
  final text **once and only after** validation. If the scan fails, the operator
  sees only `[SCHEDULED TASK NOT COMPLETE]` and never the model's success prose.
  That inversion is the single most visible behavioural change to watch.
- **Item 7** — event `0000039985`, business unit `3820`, reached without
  operator assistance. `INFERENCE`: this closes on **2026-08-13**, four days
  out. Past that date the positive control is gone and item 7 must be
  re-established against whatever is then live — not waived (§5.4).

`INFERENCE` — one behaviour to expect rather than be alarmed by: if the agent
returns no final text on a successful receipted scan, nothing is posted at all
(`:318`, guarded on `result`). Silence with a valid ledger row is a pass, not a
failure; the ledger is the receipt, the prose never was.

---

## 8. Commands, environment, owner decisions, time, cost

### Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | `REPRODUCED` — pass, no output |
| `npm run format:check` | `REPRODUCED` — *"All matched files use Prettier code style!"* |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, *"48 active/ready task rows, 44 changelog entries"* |
| `git diff --check` | `REPRODUCED` — clean |
| `npx vitest run` × 5 focused files | `REPRODUCED` — **46 tests, 5 files**: 40 pass, 6 ABI-blocked |

Also `git status --porcelain`, `git diff --stat 9aa23b4`, `git diff 9aa23b4 -- <path>`,
`grep`, `sed`, `wc -l`, `date`, `node --version`. No database, network, browser,
container, production, or deployment access.

### Environment limitation

`FACT`. `src/task-scheduler.test.ts` (6 tests) fails under my ambient Node
v26.6.0 with
`NODE_MODULE_VERSION 127 … requires 147` from `better-sqlite3` at
`src/db.ts:425`. That is an ABI mismatch — the module is compiled for Node 22 —
not a defect in the delta. The remaining 4 files (40 tests) have no native
dependency and pass.

`FACT`. The sandbox again declined both routes to the pinned Node 22.23.2 binary,
as in R7. I deliberately did **not** run `npm rebuild better-sqlite3`: it would
rebind the native module to Node 26 and break the exact-Node-22 validation and
release path this deployment depends on. Trading a shared build environment for
one reviewer's convenience is the wrong call.

So: Codex's pinned run is the authority for those 6 tests. I reproduce the file
and test counts independently, and I verify 40 of the 46 myself. **This is the
fourth consecutive round with the pinned-Node path unavailable to me** — it has
not yet cost a finding, but it is now a standing gap in independent
verification and deserves a fix before it does.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R8.md
```

`FACT`. No source, test, migration, prompt, procedure, continuity file, or other
report was edited. The 12 modified and 3 new implementation paths are Codex's
delta and I touched none of them. `node_modules` was not rebuilt.

### Remaining owner decisions

**No new owner decision arises from this round.** Every item in §5 is an
engineering correction with a determinate right answer, and none is elevated.

Three decisions remain open from R6, all migration-116-scoped, all fail-closed
configuration, and **none blocks this release or the third canary**:

| ID | Decision | Status |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` / `RECORD-SUBMISSION` — `PROCUREMENT_APPROVER_UIDS`, defaulting empty | Open, 116-scoped |
| **OD-2** | Must the approver differ from the packet assembler | Open, 116-scoped |
| **OD-3** | Outcome follow-up window and maximum evidence age | Open, 116-scoped |

`INFERENCE` — the nearest thing to an owner call in this round is not a decision
but a deadline: the 2026-08-13 close of the only known positive control (§7,
item 7). That is a scheduling constraint on the canary, not a choice about the
system, so I am recording it as a fact rather than manufacturing a decision
around it.

### Elapsed time and cost

Approximately 27 minutes wall-clock, 2026-08-09T23:40Z–00:07Z: reading the full
diff from `9aa23b4` across 15 files, five verification commands, and one file
write. The session's observable budget counter read **$4.42 of $15** at the
start of this round, cumulative across the session rather than per-round. Exact
per-round token accounting is not observable from inside the session and is not
estimated.
