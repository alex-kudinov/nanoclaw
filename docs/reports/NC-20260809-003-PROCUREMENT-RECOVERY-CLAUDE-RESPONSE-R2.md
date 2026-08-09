# NC-20260809-003 — Procurement recovery implementation review, Claude R2

- Round: R2, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R2.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T20:27Z–20:42Z
- Worktree: `/private/tmp/nanoclaw-nc-20260809-003`, based on live release
  `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`
- Change class: C0 review. No source, schema, configuration, prompt, test, or
  other report edited. Nothing built for deployment, migrated, deployed,
  enabled, queried against production, committed, or pushed.

Labels: `FACT` = verified in this worktree with a citation · `INFERENCE` ·
`RECOMMENDATION`. All citations are worktree-relative.

---

## 1. Verdict

# CHANGES REQUIRED

Scoped, and the scope is narrow. The pursuit spine is well built: the schema,
the transaction boundary, the authorization contract, and the RLS containment
are correct, and the R1 corrections were implemented faithfully — including the
one that mattered most, the decision to fix email by **data** rather than by
touching shared email code.

Two defects block enabling, and one blocks migrating. All three are small.

| Severity | ID | Defect | Blocks |
| --- | --- | --- | --- |
| **P1** | F-1 | Reconciler alert **delivery** is at-most-once with permanent silent loss | enable |
| **P1** | F-2 | Overdue and near-deadline pursuits alert **exactly once, ever** | enable |
| **P2** | F-3 | No down migration; 115 replaces two 114 functions in place | migrate |
| P2 | F-4 | `fn_transition_procurement_review` creates an **un-advanceable** pursuit | claim 3 accuracy |
| P2 | F-5 | `deadline_near` uses 7 days; the accepted owner decision is 14 | enable |
| P2 | F-6 | `source_run_stale` dedup key can never change across retries | enable |
| P2 | F-7 | Observed coverage remains model-supplied; `coverage_evidence` unverified | documentation |
| P2 | F-8 | Reconciler alerts post into the Procurement group channel — may wake the agent | enable |
| P3 | F-9…F-14 | Six hardening items | none |

`INFERENCE`. F-1 and F-2 matter disproportionately because of *what* they break.
This task exists because Procurement work changed state and nobody was told.
Both defects reproduce that exact failure inside the reconciler built to prevent
it: F-1 loses a batch of alerts permanently on one Slack hiccup — including the
`pursuit_expired` alert for work the reconciler *just silently expired*; F-2
makes an ignored pursuit go quiet forever. Neither is a design error; both are
one-line-class fixes, and the codebase already contains the correct pattern for
each.

**Disposition by gate:** safe to **commit** now; safe to **migrate** after F-3;
safe to **deploy dark** after F-3; **not** safe to enable for the sanitized
canary until F-1, F-2, F-5, F-6, F-8 are fixed; the public non-submission canary
is then gated only on that same set. Details in §7.

---

## 2. Claim-by-claim verification

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | No shared email-routing code changed; 115 conditionally flips only the two labels | **Confirmed** | `git diff 97ca2cc --stat` touches neither `src/host-router.ts`, `src/classify-ipc-handlers.ts`, nor `src/channels/gmail.ts`. The flip is guarded by `to_regclass(...) IS NOT NULL` and scoped by `label IN (...)` — `115_procurement_pursuit.sql:15-26` |
| 2 | Launchd is the sole tracked gate authority; startup logs no UID or epoch | **Confirmed** | Four keys in `setup/launchd/com.nanoclaw.plist:22-29` and `setup/service.ts:131-138`; `.env.example:18-25` block removed; `procurementPolicyDiagnostic` returns only `collectionEnabled`, `reviewEnabled`, `reviewReason`, `operatorCount`, `epochConfigured` — `src/procurement-policy.ts:57-75`. Empty-string epoch resolves to `null` → `missing_epoch` → fail-closed |
| 3 | `process` creates exactly one pursuit in the same transaction; the programmatic path preserves the invariant | **Confirmed for the card path; FALSE for the programmatic path** | Card path sets `source_review_card_id` (`115:453-459`); programmatic path does not (`115:359-364`), and advancement requires it (`115:521-528`). See **F-4** |
| 4 | Versioned, event-ledgered, queue never hides overdue work; only exact `ADVANCE` in the bound thread; future states unreachable | **Confirmed** | View excludes only terminal states, no deadline filter — `115:588`. `ADVANCE` grammar `115:502` and `src/procurement-review.ts:25-26`. Thread/epoch/card binding `115:521-528`. Legal transitions `115:530-537`. `proposal_ready`/`submitted` rejected at `115:502` |
| 5 | Host-owned nine-unit plan; container reports observed units; PostgreSQL derives status | **Literally confirmed; materially incomplete** | Plan in `src/procurement-source-config.ts:10-20`; unknown units rejected at `115:270-275` and `src/procurement-intake.ts:381-386`; status derived `115:282-286`. But *observation* is still a model claim — see **F-7** |
| 6 | Reconciler armed only when review is enabled; PostgreSQL owns the sole automatic transition and exact-once alert claims; email backlog alert-only, never replayed | **Confirmed for arming, transition, and no-replay; NOT confirmed for alert delivery** | Arming `src/index.ts:2201`; sole transition `115:603-622`; no replay path exists (the backlog query only counts — `src/procurement-reconciler.ts:47-53`). Exactly-once holds for the **claim**, not the **delivery** — see **F-1**, **F-2** |
| 7 | Base pursuit/event/alert tables and write functions inaccessible to `nanoclaw_procurement`; only the bounded view | **Confirmed** | RLS enabled with no procurement policy — `115:117-152`; `REVOKE ALL … FROM PUBLIC` `115:670-682`; base-table `GRANT SELECT` only to readonly/admin `115:686-689`; view granted `115:684-685`; both directions proven in `smoke_115_procurement_pursuit.sql:139,143` |

---

## 3. Migration 115 audit

### 3.1 Correct and worth preserving

`FACT`, all verified:

- **Transactionality.** Card consumption, review transition, pursuit insert, and
  the creation event are one transaction (`115:415-467`). The R1 C-4 correction
  is implemented exactly as specified — no two-phase gap.
- **Replay is a database invariant.** `UNIQUE (opportunity_id, decision_version)`
  (`115:81`) plus the optimistic `review_version` predicate (`115:436-437`)
  means a replayed `DECIDE` cannot create a second pursuit; it raises before
  reaching the insert.
- **Terminal enforcement.** `115:516` rejects advancement from `passed` or
  `expired_undecided`; `115:530-537` whitelists legal transitions rather than
  blacklisting illegal ones.
- **Future states genuinely unreachable.** `115:502` rejects `proposal_ready`
  and `submitted` at the entry check, so they are declared-only. This is the R1
  C-3 anti-dead-end guard, correctly implemented.
- **Constraint validated** (`115:30-31`), closing R1 C-9.
- **`SECURITY DEFINER` hygiene.** Every new function pins
  `SET search_path = public, business_v2, pg_catalog`
  (`115:174,250,327,397,495,600`) and is revoked from `PUBLIC` then granted only
  to `nanoclaw_admin` (`115:673-700`). No dynamic SQL takes caller input: the
  only `EXECUTE` is a static literal (`115:18-23`).
- **Coverage JSON shape is constrained at the table** (`115:41-57`), not only in
  functions.
- **Idempotent DDL.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, guarded constraint add, `DROP POLICY IF EXISTS`
  before each `CREATE POLICY`. Re-running 115 is safe.
- **Function replacement compatibility.** Both replaced functions keep their
  exact signature and `RETURNS TABLE` shape (`115:312-324` vs. `114:490-502`;
  `115:379-394` vs. `114:613-628`), so existing callers and grants survive
  `CREATE OR REPLACE`.

### 3.2 F-1 (P1) — alert delivery is at-most-once with permanent silent loss

`FACT`. `fn_reconcile_procurement` inserts alert claims with
`ON CONFLICT DO NOTHING` (`115:624-661`), then returns them with a **time
window**:

```sql
SELECT a.alert_text FROM public.procurement_reconciler_alerts a
 WHERE a.created_at >= p_now - interval '5 seconds'          -- 115:663-666
```

`FACT`. The host then posts them in a bare loop with no per-alert error
handling and no delivery marker:

```ts
for (const row of alerts.rows) {
  await deps.alert(row.alert_text);       // src/procurement-reconciler.ts:77-79
}
```

`FACT`. `deps.alert` **throws** when the Slack channel or the registered group
is unavailable (`src/index.ts:2209-2211`).

`INFERENCE` — failure sequence:

1. `fn_reconcile_procurement` commits N alert claims, including
   `pursuit_expired` rows for pursuits it just transitioned.
2. The first `deps.alert` call throws (Slack disconnected, group not yet
   registered at the 2-minute startup kick, transient API error).
3. The loop aborts. Alerts 1..N are never delivered.
4. Next run: the unique key `(condition_key, subject_kind, subject_id,
   subject_version)` (`115:108`) suppresses re-insertion, and the 5-second
   window excludes them from the return set.
5. **The alerts are lost permanently.** A pursuit was silently expired and
   nobody was ever told.

Two secondary hazards from the same construction: two reconciler invocations
within five seconds re-deliver each other's alerts (at-least-once in the other
direction), and clock skew between the host-supplied `p_now` and the
transaction's `now()` shifts the window arbitrarily.

`RECOMMENDATION`. The codebase already contains the correct pattern — the
email-backlog insert uses `RETURNING alert_text`
(`src/procurement-reconciler.ts:56-67`). Apply it to the function, and add
delivery state:

1. add `delivered_at timestamptz` to `procurement_reconciler_alerts`;
2. return rows from a data-modifying CTE
   (`WITH ins AS (INSERT … ON CONFLICT DO NOTHING RETURNING id, alert_text)`)
   **unioned with** any row where `delivered_at IS NULL` — so an undelivered
   alert is retried on the next run;
3. wrap each `deps.alert` call in its own `try/catch` so one failure cannot
   abort the batch;
4. mark `delivered_at` only after a successful post.

That converts the guarantee from "claimed exactly once, delivered at most once"
to "claimed exactly once, delivered at least once until acknowledged" — which is
the property the design intends.

### 3.3 F-2 (P1) — overdue work alerts exactly once, ever

`FACT`. `next_action_overdue` and `deadline_near` both dedup on
`subject_version = p.pursuit_version` (`115:629-646`).

`INFERENCE`. `pursuit_version` changes only when someone advances the pursuit.
A pursuit nobody touches keeps its version forever, so the unique constraint
suppresses every subsequent alert. An overdue pursuit is announced once and then
goes permanently silent — and the more thoroughly it is ignored, the quieter the
system becomes. That is the original "falls through the cracks" failure,
reproduced inside its own remedy.

`FACT`. The TS email-backlog alert already solves this correctly, keying on a
**date bucket**: `now.toISOString().slice(0, 10)`
(`src/procurement-reconciler.ts:59-66`). The two mechanisms in the same feature
disagree about what "exactly once" means.

`RECOMMENDATION`. For time-driven conditions (`deadline_near`,
`next_action_overdue`, `source_run_stale`), make `subject_version` a composite of
the entity version **and** a time bucket — e.g.
`p.pursuit_version || ':' || (p_now AT TIME ZONE 'America/Chicago')::date` — so
the alert re-fires daily while remaining exactly-once per day. Keep the pure
version key for state-change conditions (`pursuit_expired`), where once is
correct.

### 3.4 F-3 (P2) — no down migration

`FACT`. The worktree contains `115_procurement_pursuit.sql` and
`smoke_115_procurement_pursuit.sql`. There is no `115_*_down.sql`.

`FACT`. 115 replaces two migration-114 functions in place:
`fn_transition_procurement_review` (`115:312`) and
`fn_apply_procurement_review_card_decision` (`115:379`).

`INFERENCE`. Rolling back therefore requires reconstructing the 114 bodies.
114 is still present, so recovery is *possible*, but re-running 114 also re-runs
its other DDL and is not a rehearsed path. R1 §3.6 required the verbatim 114
bodies be shipped inside the down script precisely so rollback does not depend
on interpreting another migration under incident pressure.

`RECOMMENDATION`. Add `115_procurement_pursuit_down.sql` containing: the two
verbatim 114 function bodies; `DROP VIEW v_procurement_pursuit_queue`;
`DROP TABLE procurement_pursuit_events, procurement_pursuits,
procurement_reconciler_alerts`; the taxonomy restore to `auto_archive = true`
(prior values are recorded in the preflight); and an explicit note that the
validated constraint is intentionally left validated. Rehearse it on a
disposable database before the forward run, exactly as the smoke test was.

### 3.5 F-4 (P2) — the programmatic path creates an un-advanceable pursuit

`FACT`. The card path inserts `source_review_card_id` (`115:453-459`). The
programmatic path omits the column, so it defaults to `NULL`
(`115:359-364`).

`FACT`. Advancement resolves the pursuit's card and raises when it is missing:

```sql
SELECT * INTO v_card FROM public.procurement_review_cards c
 WHERE c.id = v_pursuit.source_review_card_id;                 -- 115:521-522
IF NOT FOUND OR … THEN
  RAISE EXCEPTION 'procurement pursuit is not bound to this decision thread';
```

`INFERENCE`. `WHERE c.id = NULL` matches nothing, so any pursuit created through
`fn_transition_procurement_review` can **never** be advanced by a human. It is a
permanent dead end — the exact defect class this migration exists to remove.

`FACT`. Severity is limited today: `transitionProcurementReview`
(`src/procurement-intake.ts:599`) is exported but has **no production caller**
(`grep` over `src/` and `container/` finds only its definition and tests). So
this is latent, not live.

`INFERENCE`. It nonetheless makes implemented-claim 3 inaccurate. The invariant
preserved is "exactly one pursuit," not "exactly one *usable* pursuit." A future
admin-repair or backfill tool would silently mint unusable rows.

`RECOMMENDATION`. Either (a) make the programmatic path raise when it would
create a pursuit with no card binding, or (b) allow advancement of a
card-less pursuit through an explicitly separate host-only function, or (c) drop
the pursuit insert from the programmatic path and document it as
review-state-only. (a) is smallest and fails closed.

### 3.6 F-5 (P2) — deadline lead time contradicts the accepted decision

`FACT`. `deadline_near` fires on `close_date BETWEEN today AND today + 7`
(`115:637-638`).

`FACT`. Preflight decision 4 states: "Default escalation lead time: 14 days,
plus immediate escalation for any closer deadline or overdue stage." The
14-day figure *is* used for `next_action_due` (`115:363`, `115:458`,
`115:547`), so the divergence is specific to the close-date proximity alert.

`INFERENCE`. With a 7-day window and a 14-day action clock, an opportunity
closing in 10 days produces no deadline alert and no overdue alert — a
window in which the system is silent by construction.

`RECOMMENDATION`. Use 14, or record why the close-date window is deliberately
tighter than the action clock.

### 3.7 F-6 (P2) — stale-run alerts cannot repeat

`FACT`. `source_run_stale` keys on
`extract(epoch FROM r.started_at)::bigint::text` (`115:648-653`), and the resume
path updates status, `completed_at`, `error_code`, `terminal_reason`, and the
coverage columns but **not** `started_at` (`115:206-213`).

`INFERENCE`. A run that hangs, is retried under the same key, and hangs again
produces an identical dedup key, so only the first hang is ever reported.

`RECOMMENDATION`. Set `started_at = p_started_at` on resume, or fold a time
bucket into the key per F-2.

### 3.8 F-7 (P2) — observed coverage is still model-supplied

`FACT`. The host now owns the denominator: the planned set is release-bound
(`src/procurement-source-config.ts:10-20`), and units outside it are rejected in
both TypeScript (`src/procurement-intake.ts:381-386`) and SQL
(`115:270-275`). Row keywords must appear in the declared observed set
(`src/procurement-intake.ts:544-551`), which closes the inverse direction.

`FACT`. Nothing verifies that a declared unit was actually searched.
`p_coverage_evidence` is only shape-checked as an object (`115:262-264`) and is
never compared against anything.

`INFERENCE`. A container can submit `observed_units` = all nine with
`coverage_evidence = {}` and obtain `complete`. Claim 5 is literally accurate —
it says the container *reports* observed units — but RC-2 ("completion is
asserted, never proven") is only half closed. This is a genuine improvement over
`97ca2cc`, and it must not be described as proof of source completeness.

`FACT`, a second-order effect. When the IPC payload omits `observedUnits`, the
host falls back to deriving coverage from the submitted rows:
`coverage?.observedUnits ?? [...new Set(rowUnits)]`
(`src/procurement-intake.ts:490-501`). The MCP schema makes the field required
(`container/agent-runner/src/ipc-mcp-stdio.ts:823-826`), but
`dispatchProcurementIpc` validates `runKey` and `rows` and does not re-validate
`observedUnits` (`src/procurement-ipc-handlers.ts:150-160`). Under that
fallback a fully-covered scan whose keywords mostly returned nothing reports
`partial`, because units with zero results contribute no rows.

`RECOMMENDATION`. Two small changes: require `observedUnits` explicitly at the
IPC boundary rather than inheriting the runner's schema; and require
`coverage_evidence` to carry one entry per declared unit (result count and pages
visited), rejecting any declared unit with no evidence entry. That does not
*prove* the search happened, but it makes fabrication deliberate rather than
free, and it gives the reconciler something to trend.

### 3.9 Remaining P3 items

| ID | Finding | Citation |
| --- | --- | --- |
| **F-9** | Malformed operator commands throw **before** the try block, so no `[PROCUREMENT … NOT RECORDED]` receipt is posted. `ADVANCE #0 v0 passed — x` hits `positiveInteger`, and a >1000-character reason hits `cleanReason` | `src/procurement-review.ts:106-118,149-158,302-303,324` |
| **F-10** | `p_now` is caller-supplied to a `SECURITY DEFINER` function that expires pursuits; a future or skewed value expires more than intended. Admin-only and host-called, so defense-in-depth only | `115:596,612`; `src/procurement-reconciler.ts:39-43` |
| **F-11** | Timezone mismatch: the view computes `days_until_close` from `current_date` (server zone) while expiry uses `(p_now AT TIME ZONE 'America/Chicago')::date` | `115:584-585` vs `115:612` |
| **F-12** | The expiry event insert uses `ON CONFLICT DO NOTHING`; if it ever conflicted the state change would commit with no ledger row — a silent gap in an append-only ledger | `115:616-622` |
| **F-13** | `observations_seen` uses `GREATEST` while `observations_new` accumulates with `+`, and no table CHECK enforces `new ≤ seen` | `115:291-292` |
| **F-14** | Reconciler swallows a failed backlog count with a warning, so the email condition can silently stop reporting | `src/procurement-reconciler.ts:70-75` |

---

## 4. Attempts to break the semantics

`FACT` — each attempted and refuted against source:

| Attack | Result |
| --- | --- |
| Replay `DECIDE` to mint a second pursuit | **Blocked twice.** The card is already `decided` (`115:418`), and the optimistic version predicate fails (`115:436-437`). `UNIQUE (opportunity_id, decision_version)` is a third backstop |
| `ADVANCE` from a thread other than the decision thread | **Blocked** — `115:523-524` compares the card's `channel_jid` and `message_ts` |
| `ADVANCE` under a rotated epoch | **Blocked** — `115:525` |
| `ADVANCE` from an unnamed Slack user | **Blocked** in the host before any query — `src/procurement-review.ts:319-322` |
| `ADVANCE` with a stale version | **Blocked** — `115:515` |
| `ADVANCE` a terminal pursuit | **Blocked** — `115:516` |
| Reach `proposal_ready` or `submitted` | **Blocked** — `115:502` rejects them at entry; no other function writes `pursuit_state` except the reconciler's `expired_undecided` |
| Skip states (`qualifying` → `passed`) | **Allowed by design** (`115:531`) — correct: a fast evidenced no-bid is the accepted canary closure |
| Container reads pursuit base tables | **Blocked twice** — RLS with no procurement policy (`115:117-119`) and no `GRANT` (`115:686-689`); proven at `smoke_115_procurement_pursuit.sql:139` |
| Container writes any pursuit state | **Blocked** — no `GRANT EXECUTE` to procurement on any write function (`115:690-700`) |
| Fabricate a `complete` run by omitting rows | **Blocked** — missing planned units force `partial` (`115:282-286`) |
| Reuse a run key with changed rows or units | **Blocked** — `115:200-205`; the batch hash now covers `observedUnits` and the adapter version (`src/procurement-intake.ts:503-506`) |
| Lose observations across a retry | **Not possible** — `115:206-213` resets only coverage; `observations_new` accumulates and `fn_record_procurement_observation` is idempotent on `(source, source_key, payload_hash)` (`114:437`) |
| Declare a unit outside the plan | **Blocked** in both layers (`src/procurement-intake.ts:381-386`; `115:270-275`) |
| Submit rows for an undeclared unit | **Blocked** — `src/procurement-intake.ts:544-551` |
| **Fabricate `complete` by declaring all nine units with empty evidence** | **Succeeds** — F-7 |
| **Silence an ignored pursuit forever** | **Succeeds** — F-2 |
| **Lose an entire alert batch via one Slack error** | **Succeeds** — F-1 |

---

## 5. IPC, runner, startup, and receipts

`FACT`, verified fail-closed:

- Directory-derived caller identity is unchanged and still rejects non-Procurement
  callers (`src/procurement-ipc-handlers.ts:143-145`), with the runner enforcing
  the same at `container/agent-runner/src/ipc-mcp-stdio.ts:868-873`.
- `procurement_pursuit_queue` is read-only and bounded 1-50
  (`src/procurement-ipc-handlers.ts:260-261`), returning no raw payload and no
  Gmail identifiers.
- The ingest message now reports the **derived** status and the missing units
  rather than asserting completion (`src/procurement-ipc-handlers.ts:213-217`),
  which corrects the previous "Run N is complete" on mere acceptance.
- Startup logs the resolved policy without secrets (`src/index.ts:1549-1552`).
- Reconciler arming is evaluated once at boot (`src/index.ts:2201`) — correct
  fail-closed behavior, and it means enabling the gate requires a restart. That
  belongs in the runbook.
- The decision/advance handler posts a failure receipt on every database
  rejection (`src/procurement-review.ts:400-403`), preserving the
  "silence is never success" property — except for F-9.

`FACT` — **F-8**, needs verification before enabling. Reconciler alerts are sent
with `slack.sendMessage(entry[0], text)` into the Procurement group channel
(`src/index.ts:2203-2213`). Gru group channels run with `requires_trigger=0`, so
a host-authored message in that channel may wake the Procurement agent.

`INFERENCE`. If it does, every alert spawns a container: token burn, and an
agent reacting to alerts it cannot act on. `RECOMMENDATION`: verify the wake
semantics for a direct `SlackChannel.sendMessage` (as opposed to the IPC path,
where `from_group` governs waking), and if it wakes the agent, route reconciler
output to an operator-only channel or suppress the trigger.

---

## 6. Test assessment

`FACT` — independently reproduced in this worktree:

```
npx tsc --noEmit                                        → exit 0
8 procurement test files                                → 51 tests, all passing
+ src/host-router.test.ts, src/ipc-procurement-auth.test.ts
                                                        → 10 files, 100 tests, all passing
```

This reproduces Codex's "eight Procurement test files, 51 tests" exactly.
`FACT` — evidence limit: my run used the worktree's ambient Node, not the pinned
22.23.2 (the sandbox declines the pinned-binary invocation form). Codex's
independent 22.23.2 run covers that gap; I rely on it rather than restating it.

`FACT`. `src/procurement-migration-contract.test.ts` (10 tests) asserts over the
**text** of the migration file. Real database behavior is proven only by
`smoke_115_procurement_pursuit.sql`, which Codex ran under rollback.

### Blocking test gaps

| # | Missing test | Why it blocks |
| --- | --- | --- |
| **B-1** | Reconciler: a failing `deps.alert` must not lose the remaining alerts, and an undelivered alert must be retried next run | Directly covers F-1. `src/procurement-reconciler.test.ts` has only 2 tests, neither exercising an alert failure |
| **B-2** | Reconciler: an untouched overdue pursuit re-alerts on the next day | Covers F-2 |
| **B-3** | Smoke: `fn_reconcile_procurement` end to end — expiry transition, its event row, and alert dedup | The most complex new function has **no** database-level test; the smoke file covers pursuits, coverage, constraint, and grants but never calls the reconciler |
| **B-4** | Smoke: a pursuit created by `fn_transition_procurement_review` can be advanced | Covers F-4; the smoke test exercises only the card path |
| **B-5** | Rollback rehearsal: apply 115, run the down script, verify the 114 function bodies and behavior are restored | Covers F-3 |
| **B-6** | `ADVANCE` rejection receipts: wrong thread, wrong epoch, stale version, terminal pursuit each post `[PROCUREMENT … NOT RECORDED]` | The SQL blocks these; nothing proves the operator is *told* |

### Non-blocking gaps

Malformed-command receipts (F-9); `coverage_evidence` completeness (F-7);
timezone consistency (F-11); the IPC-boundary `observedUnits` guard (F-14).

### Correctly deferred

Artifact manifest, assessment records, proposal packets, submission receipts,
and outcomes — migration 116, per R1 C-3. The declared-but-unreachable states
are tested (`procurement-migration-contract.test.ts`, "keeps future proposal
states declared but unreachable"), which is the right anti-dead-end guard. The
shared-CDP retirement remains a separate security task (R1 C-7) and is correctly
absent from this diff.

---

## 7. Gate disposition

| Gate | Verdict | Condition |
| --- | --- | --- |
| **Commit** | **Yes** | The slice is coherent, typechecks, tests pass, and no shared email or Sales file is touched. Committing also fixes the standing risk that the deployed system exists only in a dirty tree |
| **Migrate** | **After F-3** | Add and rehearse the down script (B-5). 115 is otherwise idempotent and additive, and its forward path was proven on a disposable database |
| **Deploy dark** | **After F-3** | Gates stay off; the reconciler does not arm (`src/index.ts:2201`); the taxonomy flip takes effect immediately, so verify new procurement mail routes and `routed_at` populates before anything else |
| **Enable for the sanitized canary** | **After F-1, F-2, F-5, F-6, F-8** | The canary's whole purpose is proving that nothing is lost silently. Enabling with F-1 and F-2 outstanding would validate a mechanism whose failure mode is invisible |
| **One public non-submission opportunity** | **Same set** | No additional condition; target `passed`, never `proposal_ready` (R1 C-8), and never submit |

`RECOMMENDATION` on sequencing: the taxonomy flip is the one part of this
migration with immediate live effect while every gate stays off. Treat it as its
own verification step — confirm routing and `routed_at` on real inbound mail
before enabling any gate. The 348-row backlog stays held (`R1 §5.2`), and the
reconciler will now count it.

---

## 8. Attestation, commands, elapsed time, cost

### Changed files

Exactly one file created, inside the implementation root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R2.md
```

`FACT`. No source, schema, migration, smoke test, configuration, prompt, test,
continuity file, or other report was edited. The 12 modified and 10 untracked
paths present before this round are unchanged. The dirty operational checkout at
`/Users/xbohdpukc/dev/NanoClaw` was not accessed at all this round.

### Inspected

`115_procurement_pursuit.sql` (full) · `smoke_115_procurement_pursuit.sql`
(assertions) · `114_procurement_control_plane.sql` (replaced-function
comparison) · full diffs vs `97ca2cc` for `src/procurement-intake.ts`,
`src/procurement-review.ts`, `src/procurement-policy.ts`,
`src/procurement-ipc-handlers.ts`, `src/index.ts`, `setup/service.ts`,
`setup/launchd/com.nanoclaw.plist`, `.env.example`,
`container/agent-runner/src/ipc-mcp-stdio.ts` · new files
`src/procurement-reconciler.ts`, `src/procurement-source-config.ts` (full) ·
test inventories for the eight Procurement test files ·
`data/business/CLAUDE.md` · `docs/ACTIVE-WORK.md` (NC-20260809-003 row) ·
the preflight, R1 request, R1 response, and the converged NC-20260809-002 R2
audit.

### Commands run

`git status --porcelain`, `git diff --stat`, `git diff` (read-only); `ls`;
`grep`; `sed`; `npx vitest run` (10 files, then the 8-file subset);
`npx tsc --noEmit`. No database, network, browser, container, build for
deployment, migration, or production access.

### Elapsed time and cost

Approximately 15 minutes wall-clock (2026-08-09T20:27Z–20:42Z). Two test
invocations and one typecheck were the only compute beyond file reads. Token and
monetary cost are not observable from inside the session and are therefore not
estimated; if required they must come from the harness.
