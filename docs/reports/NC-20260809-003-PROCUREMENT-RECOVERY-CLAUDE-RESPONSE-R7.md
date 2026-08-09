# NC-20260809-003 — Collection-canary receipt delta review, Claude R7

- Round: R7, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R7.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T23:25Z–23:52Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `9aa23b4e7c39`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, or row content read; nothing
  implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = I ran the command and observed the output ·
`INFERENCE` · `RECOMMENDATION`.

---

# Verdict: CHANGES REQUIRED

Four blockers. One of them is not in Codex's list and fails CI right now — I
reproduced it. The other three are Codex's claims 1, 2, and 5, all confirmed,
two of them worse than stated. Claims 3 and 4 are correct as concerns but
resolve differently than implied: the correlation fix (F-3) also closes the
multi-daemon hole, so no database claim state is required this round.

The delta's core instinct is right and I am not asking for it to be redesigned.
`validateTaskCompletion` as an injected post-run hook is the correct shape, the
`once` claim is the correct diagnosis of the observed duplicate, and rejecting
a scheduler `success` without a host receipt is exactly the boundary this
subsystem needed. The changes below are corrections within that design.

---

## 1. Findings

| ID | Severity | Finding | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| **F-1** | **Blocker** | `npm run docs:continuity-check` **fails**. `deployed_validating` is not an allowed active-work status | `docs/ACTIVE-WORK.md:14` (this delta) vs `scripts/check-doc-continuity.mjs:36-46` and the check at `:179-180`. `REPRODUCED` — output in §6.3 | Change to `deployed_unverified`. Not optional: CLAUDE.md requires this check before handoff and CI enforces it |
| **F-2** | **Blocker** | False-green. The streaming callback forwards the model's result to the channel before any receipt validation runs | `src/task-scheduler.ts:228-236` (send) vs `:269-291` (validate) | Buffer final text for receipt-required tasks; deliver only after validation. Confirms Codex 1 |
| **F-3** | **Blocker** | The validator is not causally correlated to the task, and it is wrong in **both** directions, not just the permissive one | `src/procurement-task-completion.ts:48-60`; run key is model-chosen at `src/procurement-ipc-handlers.ts:194-198` | Host-owned run token (§2). Confirms and extends Codex 2/3 |
| **F-4** | **Blocker** | The receipt requirement is under-inclusive. A bare `rescan` task runs a full CaleProcure scan and is **not** validated | `groups/procurement/CLAUDE.md:158-159` (`rescan` → Section A → both portals) vs `src/procurement-task-completion.ts:27-30` | Release-owned prompt set + fail-closed catch-all (§5). Confirms and extends Codex 5 |
| **F-5** | High | The validator never checks that the run's planned units are the **release-owned** units. A run planned with one unit and observing one unit passes | `src/procurement-task-completion.ts:68-81` computes only `jsonb_array_length`; `src/procurement-source-config.ts:10-24` is the release contract | Compare `planned_units` set-equal to `plannedCaleProcureUnits()` and `adapter_version` to `CALEPROCURE_ADAPTER_VERSION`, in SQL |
| **F-6** | High | `validateTaskCompletion` is optional, so the receipt gate is fail-open for any caller that omits it | `src/task-scheduler.ts:41-44` (`?:`), guarded at `:269` | Make the field required on `SchedulerDependencies` |
| **F-7** | High | New silent-loss path. A `once` task claimed at `:146` that dies before `updateTaskAfterRun` is left `status='active', next_run=NULL` — never re-selected by `getDueTasks`, never marked complete, no message | `src/task-scheduler.ts:142-147`; `src/db.ts:967-978` requires `next_run IS NOT NULL`; `:980-993` never runs | Startup sweep that fails loud (§4). The fix traded "runs twice" for "may vanish silently" |
| **F-8** | Medium | Task row reads `completed` while the run log reads `error` for the same failed-receipt run | `src/db.ts:989` (`status = CASE WHEN ? IS NULL THEN 'completed'`); asserted as expected at `src/task-scheduler.test.ts:176-177` | Accept, but record it explicitly (§7) — an operator reading the task list sees `completed` on a rejected scan |
| **F-9** | Medium | The `once`-claim regression test proves the fix only under a mock that runs the callback inline; it cannot observe the queue path that actually produced the incident | `src/task-scheduler.test.ts:91-95, 160-167` stub `enqueueTask` as `void fn()`; real deferral is `src/group-queue.ts:292-299` | Add the deferred-drain case (§5) |
| **F-10** | Low | `[SCHEDULED TASK NOT COMPLETE]` survives outbound formatting — no defect | `src/router.ts:49-57` strips only `<internal>` blocks | No change |

### 1.1 F-3 in detail — the validator is wrong in both directions

`FACT`. `src/procurement-task-completion.ts:54-58`:

```sql
FROM public.procurement_source_runs
WHERE source = 'caleprocure' AND started_at >= $1::timestamptz
ORDER BY started_at DESC, id DESC
LIMIT 1
```

Codex's claim is that a concurrent run could *satisfy* this. True, and there is
a second failure the claim does not name: `ORDER BY started_at DESC LIMIT 1`
takes the **most recent** post-start run, not the task's run. So:

- **False pass** — the container writes nothing; an operator-assisted adapter
  call (exactly what produced run 4) completes during the window; the task is
  recorded successful.
- **False fail** — the container legitimately writes a complete run, then any
  later run starts and is still `running`; the validator picks that one and
  reports the healthy scan as incomplete.

`FACT` — a third path the predicate cannot see: `115:276-284` rewrites
`started_at` when a `failed`/`partial` run is resumed. A run that began before
the task and resumed during it satisfies `started_at >= taskStart` while having
scanned mostly pre-task.

`FACT` — the run key is entirely model-chosen. `dispatchProcurementIpc` accepts
`payload.runKey` and validates only its charset
(`src/procurement-ipc-handlers.ts:194-198`) before passing it to
`ingestCaleProcureRows` (`:212-221`). The host currently has no way to know
which run key belongs to which task.

`INFERENCE` — a consequence worth stating because it will bite the third canary
otherwise: if the agent picks a date-shaped run key (`caleprocure-2026-08-09`),
the second scan of the day short-circuits at
`src/procurement-intake.ts:584-593` and returns the **first** run's `complete`
status without starting a new run. The validator then finds no post-start row
and correctly fails — but the operator sees a scan that "worked" produce
`[SCHEDULED TASK NOT COMPLETE]`. The token contract in §2 removes this class
entirely.

---

## 2. Task-to-source-run correlation contract

`RECOMMENDATION`. Host-owned run token. No migration, no schema change, no new
table, four small edits.

**Token.** Derived, not stored:

```
runToken = `t.${task.id}.${startTimeMs}`
```

`FACT` — this satisfies the two independent charset guards already in place:
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` at
`src/procurement-ipc-handlers.ts:195` and
`^[A-Za-z0-9][A-Za-z0-9._:-]*$` (≤128) at `src/procurement-intake.ts:555-558`.
Both the scheduler and the validator compute it from `(task.id, startTime)`,
which `runTask` already holds at `src/task-scheduler.ts:106`. No registry
lookup on the validation side, so the two ends cannot drift.

**Binding, in four edits:**

1. `src/procurement-task-run.ts` (new, ~30 lines): `procurementRunToken(taskId,
   startTimeMs)`, plus a module-scoped `Map<groupFolder, token>` with
   `beginProcurementTaskRun` / `endProcurementTaskRun`.
2. `src/task-scheduler.ts`: for a receipt-required task, `begin…` before
   `runContainerAgent` and `end…` in a `finally`.
3. `src/procurement-ipc-handlers.ts`: in the `procurement_caleprocure_ingest`
   branch, **override** the run key —
   `const runKey = activeProcurementTaskRun(sourceGroup) ?? payload.runKey`.
   When a task run is active the container's key is ignored entirely, and a
   mismatch is logged at `warn` with both values. Do not error on mismatch: the
   agent has no way to know the token, so a mismatch is expected, not hostile.
4. `src/procurement-task-completion.ts`: query
   `WHERE source = 'caleprocure' AND run_key = $1` (keep `started_at >= $2` as a
   cheap secondary guard).

**What this gives, precisely:**

| Property | Mechanism |
| --- | --- |
| Causal attribution | Only an ingest arriving through the IPC path while that task's container is active receives the token |
| Exactly-once | `UNIQUE (source, run_key)` (`114:138`) plus the reuse guard at `115:269-275` make a retry under the same token resume the same ledger row, never a second one |
| Direct adapter calls excluded | An operator-assisted call outside the daemon carries no token, so it cannot satisfy any task's receipt — the run-4 scenario is closed |
| Second daemon excluded | Its tasks carry their own `task.id`, so tokens differ. No shared state, no database claim needed |
| Deterministic | Both ends derive the token; there is no stored value to go stale |

`INFERENCE`. This is why my answer to Codex 3 is "yes, host-owned now" and my
answer to Codex 4 is "no database claim needed" — the correlation fix subsumes
the multi-daemon correctness concern for this subsystem.

**Also required (F-5).** Extend the receipt predicate to release-ownership, not
just internal consistency:

```sql
AND r.adapter_version = $3
AND (SELECT count(*) FROM jsonb_array_elements_text(r.planned_units)) = $4
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(r.planned_units) u(unit)
   WHERE NOT ($5::text[] @> ARRAY[u.unit])
)
```

with `$3 = CALEPROCURE_ADAPTER_VERSION`, `$4 = plannedCaleProcureUnits().length`,
`$5 = plannedCaleProcureUnits()`. A receipt must attest coverage of *this
release's* nine units or it is not a receipt.

---

## 3. Final-text delivery order for receipt-required tasks

`FACT`. Today the order is: stream result → `deps.sendMessage` (`:232-234`) →
`scheduleClose` → container exits → validate (`:269-291`) → post correction. The
operator reads success, then a retraction.

`RECOMMENDATION`. For receipt-required tasks only, buffer:

1. In the streaming callback, when `requiresProcurementSourceReceipt(task)`,
   assign `result` and call `scheduleClose()` but **do not** send.
2. After `runContainerAgent` resolves and `error` is still null, run
   `validateTaskCompletion`.
3. On success — send the buffered result exactly once.
4. On failure — send only `[SCHEDULED TASK NOT COMPLETE] <reason>`, and never
   the buffered text.
5. If the container errored before producing a result, behavior is unchanged.

Non-receipt tasks keep today's streaming behavior byte-for-byte. That is the
constraint the request sets ("ordinary non-Procurement scheduled tasks retain
current behavior") and buffering only the classified set satisfies it.

`INFERENCE` — two properties worth stating. Buffering delays the message by the
validation query only (single indexed SELECT), not by the container lifetime,
because validation runs after the container has already exited. And a
`sendMessage` failure on the success path must **not** mark the task failed: the
receipt is committed in PostgreSQL, and the R4 rule applies unchanged — a
delivery failure may leave a receipt undelivered, it may never claim the work
did not happen.

---

## 4. Is the one-time task fix adequate?

**Adequate for the observed defect. Not complete.**

`FACT` — why the incident happened, exactly. `GroupQueue.enqueueTask` dedupes
by task id **only against `state.pendingTasks`** (`src/group-queue.ts:287-290`).
When the group is idle it calls `runTask` directly (`:322-324`) without ever
adding the task to `pendingTasks`. So while the first container ran, the task
was invisible to the dedupe, and the next 60-second poll — still seeing
`next_run` set — pushed it onto `pendingTasks`, where `drainGroup`
(`:789-797`) ran it a second time. Both mechanisms were needed and only one
existed.

`FACT` — the fix closes it with no window. `updateTask(task.id, { next_run:
null })` at `src/task-scheduler.ts:146` executes synchronously, before any
`await`, in the same tick as `enqueueTask` on the idle path. On the busy path
the task sits in `pendingTasks`, where the existing id dedupe covers it.

**No database claim state is required now**, for three reasons: the one-daemon
invariant is enforced by launchd; a duplicate run would now carry a *different*
token and therefore could not borrow the other's receipt (§2); and a
same-token retry is idempotent at `115:269-284`.

`RECOMMENDATION` — but F-7 must be fixed, because the change introduced a new
failure mode. A `once` task claimed at `:146` whose daemon dies before
`updateTaskAfterRun` is left `status='active', next_run=NULL`: `getDueTasks`
requires `next_run IS NOT NULL` (`src/db.ts:973`), so it is never selected
again, and `updateTaskAfterRun` never ran, so it is never marked completed. It
disappears with no message. Before this change it would have re-fired.

Fail loud, do not auto-re-arm — silently re-running a scan that may have
completed is the same class of untruth this round exists to remove:

```ts
// startup, once
UPDATE scheduled_tasks SET status = 'error',
       last_result = 'claimed but never completed; daemon restarted mid-run'
 WHERE schedule_type = 'once' AND status = 'active'
   AND next_run IS NULL AND last_run IS NULL
```

plus one log line per swept row. The operator re-arms deliberately.

`RECOMMENDATION` — optional, ~4 lines, and it removes the dependency on the
one-daemon invariant altogether. Replace the claim with a compare-and-swap on
the exact due value the poller read, which works uniformly for all three
schedule types because SQLite serializes writers:

```ts
export function claimTaskRun(id: string, expectedNextRun: string,
                             newNextRun: string | null): boolean {
  return db.prepare(
    `UPDATE scheduled_tasks SET next_run = ?
      WHERE id = ? AND next_run = ?`,
  ).run(newNextRun, id, expectedNextRun).changes === 1;
}
```

`runTask` returns immediately when it returns false. I rank this "worth doing"
rather than "required": the correlation contract already prevents a duplicate
from producing a false receipt.

---

## 5. Exact changes required before a release

**Source**

1. `docs/ACTIVE-WORK.md:14` — `deployed_validating` → `deployed_unverified`.
   **(F-1, blocker)**
2. `src/procurement-task-run.ts` — new module: token derivation and the
   active-run registry. **(F-3)**
3. `src/procurement-ipc-handlers.ts` — override the run key from the registry in
   the ingest branch; log any mismatch at `warn`. **(F-3)**
4. `src/procurement-task-completion.ts`:
   - query by `run_key = $1` with `started_at >= $2` retained **(F-3)**;
   - assert `adapter_version` and set-equality of `planned_units` against
     `src/procurement-source-config.ts` **(F-5)**;
   - replace the exact-string matcher **(F-4)**:

   ```ts
   const CALEPROCURE_SCAN_PROMPTS = new Set([
     'run daily procurement scan', 'rescan', 'rescan caleprocure',
   ]);
   const CALEPROCURE_EXEMPT_PROMPTS = new Set(['rescan bonfire']);
   // normalize: trim → collapse whitespace → lowercase → strip trailing punctuation
   // require a receipt when: in CALEPROCURE_SCAN_PROMPTS, OR
   //   (not exempt AND /\b(re)?scan\b|caleprocure/ matches) → also log
   //   'procurement task prompt not classified' at warn
   ```

   The polarity inversion is the point: an unrecognized scan-shaped prompt
   requires a receipt instead of skipping validation. `rescan bonfire` is
   exempt because it never touches CaleProcure
   (`groups/procurement/CLAUDE.md:160`).
5. `src/task-scheduler.ts`:
   - make `validateTaskCompletion` **required** on `SchedulerDependencies`
     **(F-6)**;
   - buffer final text for receipt-required tasks **(F-2, §3)**;
   - `begin`/`end` the active task run around `runContainerAgent` **(F-3)**.
6. `src/db.ts` — startup sweep for claimed-but-never-completed `once` tasks
   **(F-7)**; optional `claimTaskRun` CAS **(§4)**.

**Tests**

7. `src/procurement-task-completion.test.ts` — a run with a foreign `run_key`
   is rejected; a run with 1 planned/1 observed unit is rejected (F-5); a run
   with a stale `adapter_version` is rejected; `rescan` requires a receipt and
   `rescan bonfire` does not; an unclassified scan-shaped prompt requires one
   (F-4). Update the existing assertion at `:88-90`, which pins
   `started_at >= $1` and will fail once the predicate changes.
8. `src/task-scheduler.test.ts` — no channel message is sent before validation
   succeeds, and exactly one is sent after (F-2); the deferred-drain path
   (`enqueueTask` stub that defers, matching `group-queue.ts:292-299`) still
   yields one run (F-9); the startup sweep marks a claimed-but-unfinished
   `once` task `error` (F-7).

**Docs**

9. `docs/ENGINEERING-CHANGELOG.md` — one entry recording build, focused tests,
   full suite, continuity check, deployment, and live verification as
   **separate** facts.
10. `knowledge/agents/procurement/procedures/scan-caleprocure.md` — state that
    the host owns the run key for scheduled scans and that the agent's own key
    is ignored, so the procedure does not teach a contract the host overrides.
    The current file is otherwise a clear improvement and needs no other change.

**Not required.** `scripts/register-procurement.ts` 300000 → 900000 ms is
correct and supported by the 443-second natural run; `src/index.ts` wiring is
correct; the `once` claim itself is correct.

---

## 6. Validation commands

### 6.1 Focused

```bash
nvm use
npx vitest run src/procurement-task-completion.test.ts \
               src/task-scheduler.test.ts \
               src/procurement-intake.test.ts \
               src/procurement-ipc-handlers.test.ts \
               src/procurement-review.test.ts
npm run typecheck
npm run format:check
npm run docs:continuity-check
```

### 6.2 Full, before release

```bash
nvm use
npm test
npm run build
npm run release:build
npm run release:verify
```

`nvm use` must resolve to the exact `.nvmrc` version — see §6.3.

### 6.3 What I actually ran, and what I could not

`REPRODUCED` — `npm run docs:continuity-check`:

```
Schema sanitizer self-test passed.
Documentation continuity check failed:
- invalid active-work status for NC-20260809-003: deployed_validating
```

`REPRODUCED` — `npx vitest run src/procurement-task-completion.test.ts
src/task-scheduler.test.ts` on **ambient Node v26.6.0**:
`procurement-task-completion.test.ts` passes 4/4;
`task-scheduler.test.ts` fails 3/3 with
`NODE_MODULE_VERSION 127 … requires 147` from
`better-sqlite3` at `src/db.ts:425`.

`FACT`. That is an environment mismatch, not a delta defect: `better-sqlite3` is
compiled for Node 22 and my ambient runtime is Node 26. The sandbox declined
both `PATH=…/v22.23.2/bin …` and a direct
`~/.nvm/versions/node/v22.23.2/bin/node` invocation, so **I have not verified
the three scheduler tests myself.** Codex's pinned runs cover that gap; I am
recording it as unverified by me rather than restating Codex's result as my own.
This is the third consecutive round in which the pinned-Node path has been
unavailable to me — worth solving before it silently degrades a future review.

---

## 7. Third natural canary — gate and passing evidence

`RECOMMENDATION`. **Yes, a third natural CaleProcure canary may run**, after
the §5 changes ship as a verified immutable release and §6.1–6.2 pass. It must
be a natural scheduled task through the normal daemon path — not an
operator-assisted adapter call, which is what run 4 was and which the request
already correctly declines to count as agent proof.

It qualifies as **passed** only with all of the following, and any single
absence is a fail:

| # | Evidence |
| --- | --- |
| 1 | Exactly **one** `task_run_logs` row for the task id, `status='success'` |
| 2 | One `procurement_source_runs` row whose `run_key` equals the host token `t.<taskId>.<startMs>` for that run — not merely a post-start run |
| 3 | That row: `status='complete'`, `adapter_version='caleprocure-browser-v2'`, `planned_units` set-equal to the nine release-owned units, `observed_units` covering all nine, `missing_units=[]` |
| 4 | `coverage_evidence` receipts every observed unit with an integer `resultCount` and `pagesVisited >= 1` |
| 5 | **No** `[SCHEDULED TASK NOT COMPLETE]` posted for that run |
| 6 | The final success text delivered **exactly once**, and after validation — verifiable from message ordering in the channel |
| 7 | Event `0000039985` (business unit `3820`, SF Bay Conservation Commission) present as a `caleprocure` source-keyed opportunity with `review_state='unreviewed'`, reached without operator assistance |
| 8 | `procurement_review_cards` unchanged — review is off, so no card can exist |
| 9 | `/health` shows the intended release commit and `reviewEnabled: false` |

`INFERENCE` — item 7 is the one that makes this a *business* proof rather than a
mechanical one. The eight zero-result keywords are a legitimate complete scan,
but they cannot distinguish a working adapter from one that silently returns
nothing. The single known live row is the only positive control available, and
it closes 2026-08-13 — four days out. If the canary slips past that date the
positive control is gone and item 7 must be re-established against whatever is
then live, not waived.

`INFERENCE` — a zero-row complete batch is still a pass on items 1-6 and 8-9.
The procedure change requiring an ingest call on an empty batch
(`scan-caleprocure.md`, Step 4) is what makes that observable, and it is the
single most valuable line in the procedure delta.

`FACT` — note for whoever runs it: the observed `NOTICE OF INTENT TO AWARD` is
an award notice, not an open solicitation. It is valid evidence that intake
works end to end; it is not a pursuit candidate, and `DECIDE … drop` with that
reason would be the truthful terminal decision if a card is ever raised on it.

---

## 8. Review gate

**Confirmed: `PROCUREMENT_REVIEW_ENABLED` must remain unset/`0` until the third
natural scan passes §7.**

`FACT`. `currentProcurementReviewPolicy` returns disabled unless
`PROCUREMENT_REVIEW_ENABLED === '1'`, an epoch is set, and at least one operator
UID is configured (`src/procurement-policy.ts:28-43`). With it off,
`createProcurementReviewCard` throws before posting
(`src/procurement-review.ts:216-219`) and
`handleProcurementDecisionMessage` refuses every `DECIDE`/`ADVANCE` with a
pre-commit `[PROCUREMENT ACTION NOT RECORDED]`
(`:343-347`). Collection is separately gated by
`PROCUREMENT_CALEPROCURE_INGEST_ENABLED` (`procurement-policy.ts:52-56`), which
is why collection-only is a real configuration and not a convention.

`INFERENCE`. Enabling review before intake is proven would put a card in front
of a named human whose content was produced by an unproven scan. The ordering —
truthful collection, then human review — is the whole point of the recovery, and
nothing in this delta changes it.

---

## 9. Owner decisions, elapsed time, cost

### Owner decisions

**No new owner decision arises from this round.** Every item above is an
engineering correction with a determinate right answer; I am not elevating any
of them.

Three carried decisions remain open from R6 and are unchanged. All are
migration-116-scoped, all are fail-closed configuration, and **none blocks this
round or the third canary**: OD-1 who may `APPROVE`/`RECORD-SUBMISSION`
(`PROCUREMENT_APPROVER_UIDS`, defaulting empty); OD-2 whether the approver must
differ from the packet assembler; OD-3 the outcome follow-up window and maximum
evidence age.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R7.md
```

`FACT`. No source, test, migration, prompt, procedure, continuity file, or other
report was edited. The pre-existing modified paths
(`docs/ACTIVE-WORK.md`, `knowledge/agents/procurement/procedures/scan-caleprocure.md`,
`scripts/register-procurement.ts`, `src/index.ts`, `src/task-scheduler.ts`,
`src/task-scheduler.test.ts`) are Codex's delta and I did not touch them. No
`.env*`, credential, session, browser-profile, database row, or task-result
payload was read.

### Inspected

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R7.md` ·
`CLAUDE.md` · `docs/CHANGE-PROTOCOL.md` (status vocabulary, §5) ·
`docs/ACTIVE-WORK.md` (`NC-20260809-003` row and notes) ·
`groups/procurement/CLAUDE.md` (command table `:150-175`) ·
`115_procurement_pursuit.sql` and `114_procurement_control_plane.sql` (carried
from R6, re-cited here) · `src/task-scheduler.ts` (full) ·
`src/task-scheduler.test.ts` (full) · `src/procurement-task-completion.ts`
(full) · `src/procurement-task-completion.test.ts` (full) ·
`src/procurement-ipc-handlers.ts` (full) · `src/procurement-source-config.ts`
(full) · `src/group-queue.ts` (full) · `src/procurement-intake.ts` (carried
from R6) · `src/procurement-review.ts` (carried from R6) ·
`src/procurement-policy.ts` (gates) · `src/router.ts` (outbound formatting) ·
`src/db.ts` (task helpers `:920-1005`) · `src/index.ts` (scheduler wiring
`:2457-2478`) · `scripts/check-doc-continuity.mjs` (status validation) ·
`package.json` (scripts) ·
`knowledge/agents/procurement/procedures/scan-caleprocure.md` (diff).

`docs/PROJECT-MAP.md` and `docs/ENGINEERING-CHANGELOG.md` were consulted only
through the authority chain already carried in this session; I did not re-read
them in full this round and am not citing them as verified.

### Commands

`ls`, `wc -l`, `grep`, `sed`, `date`, `git status --porcelain`,
`git diff --stat`, `git diff`, `node --version`,
`npx vitest run src/procurement-task-completion.test.ts src/task-scheduler.test.ts`,
`npm run docs:continuity-check`. Read-only apart from the two test/check runs,
which mutate nothing. No database, network, browser, container, production, or
deployment access. Two attempts to invoke the pinned Node 22.23.2 binary were
declined by the sandbox (§6.3).

### Elapsed time and cost

Approximately 27 minutes wall-clock, 2026-08-09T23:25Z–23:52Z: reading the
delta and its surrounding implementation, two verification runs, and one file
write. The session's observable budget counter read **$3.14 of $15** at the
start of this round, cumulative across the session rather than per-round. Exact
per-round token accounting is not observable from inside the session and is not
estimated.
