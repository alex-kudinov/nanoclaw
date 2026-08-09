# NC-20260809-003 — Procurement recovery post-fix review, Claude R3

- Round: R3, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R3.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T20:57Z–21:14Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`, base `97ca2cc`
- Change class: C0 review. No production, database, browser, or network access;
  no secrets or private content read; nothing built for deployment, migrated,
  deployed, enabled, committed, or pushed.

Labels: `FACT` = verified in this worktree with a citation · `INFERENCE` ·
`RECOMMENDATION`. Citations are worktree-relative.

---

# Verdict: CONVERGED

All fourteen R2 findings are closed. I traced each fix to source rather than
accepting the disposition summary, and independently reproduced the test gate. I
looked specifically for the four failure classes named in the request — a new
silent-loss path, a false receipt, privilege expansion, a dead end — and for
rollback hazards. **I found none that block.**

Six residual observations are recorded in §9. None is a blocker; all are
operational facts an incident runbook should carry rather than defects.

The two R2 blockers were the ones that mattered, because both reproduced the
original failure inside the remedy. Both are now structurally closed, not
patched: alert delivery is a real acknowledged outbox, and time-driven alerts
re-fire on a daily bucket.

---

## 1. Did each R2 blocker close without introducing another gap?

| R2 | Fix verified at | Verdict |
| --- | --- | --- |
| **F-1** alert loss | `115:682,758-761` (returns `alert_id`, selects `delivered_at IS NULL`), `115:765-778` (`fn_ack_…`), `src/procurement-reconciler.ts:85-123` | **Closed.** Per-alert `try/catch`; a failed post `continue`s with the row left pending; ack only after a receipt-returning post |
| **F-2** one-alert-ever | `115:722-723,734-735,743-744` | **Closed.** Version + America/Chicago date bucket on `deadline_near`, `next_action_overdue`, `source_run_stale`; `pursuit_expired` correctly stays version-only (`115:751`) |
| **F-3** rollback | `rollback_115_procurement_pursuit.sql`, `smoke_rollback_115_procurement_pursuit.sql` | **Closed.** Transactional, dependency-ordered, restores both 114 bodies verbatim and the taxonomy; smoke asserts object absence and restoration |
| **F-4** unusable pursuit | `115:411-413` | **Closed, fail-closed.** `RAISE EXCEPTION 'process decisions require a bound Procurement review card'`. Card path remains the only creator (`115:453-459` equivalent) |
| **F-5** deadline window | `115:731` | **Closed.** `+ 14` |
| **F-6** stale-run key | `115:255-260` (`started_at = p_started_at` on resume) plus the daily bucket | **Closed** |
| **F-7** self-attestation | `src/procurement-intake.ts:408-455,563-564`, `src/procurement-ipc-handlers.ts:202-210`, `115:358-360` | **Closed as far as it can be.** See §5 |
| **F-8** agent wake | `src/index.ts:2213-2221`, `src/channels/slack.ts:1239-1264,1689-1706`, `src/router.ts:42-47` | **Closed and verified end to end.** See §7 |
| **F-9** malformed receipt | `src/procurement-review.ts:143-172,316-338` | **Closed.** Parsers return `null` instead of throwing; a `DECIDE`/`ADVANCE` prefix with bad content yields `[PROCUREMENT ACTION NOT RECORDED]` |
| **F-10** clock authority | `115:688-690` | **Closed.** ±300 s guard before any expiry |
| **F-11** timezone | `115:668-670` (view) and `115:701,723,730-731` (reconciler) | **Closed.** Both use America/Chicago dates |
| **F-12** event conflict | `115:711` — `FROM expired;` with no `ON CONFLICT` | **Closed.** A conflict now aborts the transaction |
| **F-13** counts | `115:40-58` — constraint added `NOT VALID` then validated | **Closed** |
| **F-14** backlog query | `src/procurement-reconciler.ts:76-81` — unchanged | **Not a blocker.** Justified in §8 |

`FACT`. No fix introduced a new unguarded path that I could find. The specific
regressions I probed for and did **not** find: the ack path cannot mark an
undelivered row delivered (`115:776` requires `delivered_at IS NULL`); the daily
bucket cannot suppress a genuine state change (`pursuit_expired` is version-keyed);
the card-only guard cannot be bypassed through the v2 source-run functions
(neither writes `review_state`); and the clock guard cannot be evaded by a caller
because it compares against the database's own `now()`.

---

## 2. Is delivery now at-least-once until acknowledgment?

**Yes, accurately.** `FACT`, traced through every branch:

| Condition | Behavior |
| --- | --- |
| Slack disconnected | `postTracked` returns `undefined` (`src/channels/slack.ts:1244-1247`) → `index.ts:2219-2221` throws → caught at `reconciler.ts:98-105` → row stays pending → re-returned next run (`115:760`) |
| `chat.postMessage` throws | Caught inside `postTracked` (`slack.ts:1259-1262`), returns `undefined` → same path |
| Group not registered | `index.ts:2215-2217` throws → same path |
| Post succeeds, ack fails | Logged (`reconciler.ts:117-122`); row stays pending → **re-delivered** next run |
| Post succeeds, ack succeeds | `delivered_at` set; never returned again |
| One alert fails mid-batch | `continue` (`reconciler.ts:104`) — remaining alerts still attempted |

`INFERENCE`. The guarantee is precisely **at-least-once until acknowledged**,
with duplicates possible only in the post-succeeded/ack-failed window. That is
the correct trade for an operational alert: a repeat is cheap, a loss is what
this task exists to prevent. The claim in the request is accurate as written.

`FACT`. Covered by tests: "keeps a failed delivery pending and continues with the
remaining alerts" and "does not acknowledge a delivered alert when the receipt
write fails" (`src/procurement-reconciler.test.ts`).

---

## 3. Do the daily buckets and 14-day escalation behave as claimed?

`FACT`. `subject_version` is `pursuit_version || ':' || (p_now AT TIME ZONE
'America/Chicago')::date` for the two pursuit conditions (`115:722-723,734-735`)
and `epoch(started_at) || ':' || date` for stale runs (`115:743-744`). The unique
key is `(condition_key, subject_kind, subject_id, subject_version)` (`115:108`),
so one alert per subject per Chicago day, re-firing daily while the condition
holds.

`FACT`. `deadline_near` fires on `close_date BETWEEN today AND today + 14`
(`115:730-731`), matching preflight decision 4. `next_action_due` is
`now() + interval '14 days'` at creation (`115:363`-equivalent) and on each
non-terminal advance (`115:631`), so the action clock and the deadline window now
agree.

`FACT`. `pursuit_expired` deliberately keeps the pure version key (`115:751`) —
correct, because expiry is a one-time state change, not a standing condition.

`FACT`. Both bucket behaviors are asserted in the database smoke test
(`smoke_115_procurement_pursuit.sql:189,194`).

`INFERENCE`. One consequence worth naming: an ignored pursuit now produces up to
three alerts per day (near-deadline, overdue, and — once — expiry). At canary
scale that is right. At scale it argues for a digest, not for reverting the
bucket.

---

## 4. Is the card-only `process` boundary useful and fail-closed, and is the receipt truthful?

**Fail-closed: yes.** `FACT`. `fn_transition_procurement_review` raises on
`process` before touching any row (`115:411-413`), and the TypeScript wrapper is
guarded as well. Only `fn_apply_procurement_review_card_decision` can create a
pursuit, and it does so in the same transaction as card consumption and the
review transition. Verified by smoke assertion "card-less process decision
unexpectedly succeeded" (`smoke_115:132`).

**Useful: yes.** `INFERENCE`. The programmatic path retains `needs_info` and
`drop` — the two decisions that need no human thread — so the repair path stays
available without being able to mint an unusable pursuit. That is a better
resolution than my R2 option (a), which only fixed the symptom.

**Receipt truthfulness under partial failure: yes.** `FACT`. After a committed
`process`, the host queries the created pursuit and appends exact versioned
`ADVANCE` commands (`src/procurement-review.ts:369-393`). If that lookup fails,
the receipt says "The decision is recorded, but the pursuit receipt could not be
rendered. Refresh procurement_pursuit_queue before advancing."
(`src/procurement-review.ts:394-401`). The decision is never reported as
rejected, and the operator is never told to act on an ID the host could not
confirm. The failure is logged at `error`, not `warn` — appropriate, since the
state and the receipt have diverged.

`INFERENCE`. This closes the last usability gap in the loop: previously an
operator had to guess the pursuit ID or query the queue. Now the exact next
commands appear in the same thread.

---

## 5. Are coverage receipts, batch identity, run associations, and counts coherent?

`FACT` — receipts are enforced in **four** independent layers:

1. Runner zod schema (`container/agent-runner/src/ipc-mcp-stdio.ts`);
2. IPC boundary — `observedUnits` and `coverageEvidence` are now explicitly
   required and shape-checked (`src/procurement-ipc-handlers.ts:202-210`),
   closing the R2 F-14 gap where the host inherited the runner's validation;
3. Host normalizer — exactly one receipt per observed unit, no extra keys,
   `resultCount >= 0`, `pagesVisited >= 1`
   (`src/procurement-intake.ts:408-455`);
4. PostgreSQL — independently re-checks a receipt exists per observed unit with
   both fields (`115:358-360`).

`FACT`. **The row-derived fallback is gone.** R2 flagged
`coverage?.observedUnits ?? [...new Set(rowUnits)]`; the code is now
`normalizeCoverageUnits(coverage?.observedUnits)` (`src/procurement-intake.ts:563`),
so a missing declaration is an error rather than a silently inferred — and
false-`partial` — coverage set.

| Case | Behavior | Citation |
| --- | --- | --- |
| Retry, same evidence | Resumes the same row; `started_at` refreshed; coverage reset | `115:246-260` |
| Retry, changed evidence | Rejected — batch hash binds rows, units, receipts, adapter version | `115:247-252`; `src/procurement-intake.ts` batch-hash input |
| Empty result, full coverage | `complete` with receipts | `115:282-286`; smoke `:280` |
| Duplicate observation across runs | `fn_link_procurement_run_opportunity` records the association even when the immutable observation belongs to an earlier run | `115:427-450`; smoke `:271` |
| Malformed IPC | Rejected at layer 2 before any query | `src/procurement-ipc-handlers.ts:202-210` |
| Count invariant | `observations_new <= observations_seen` as a **validated** table constraint plus the per-call check | `115:40-58`; `115:266-269`-equivalent |

`INFERENCE` — the honest residual, unchanged from R2 and now correctly
documented rather than overclaimed: these receipts make a false completeness
claim *deliberate and auditable*, not impossible. A container can still declare
nine units with fabricated counts. `FACT`: the tracked documentation now says
exactly that, which was my R2 F-7 requirement. Independent proof of browser
execution is a migration-116-or-later concern, not a canary blocker.

---

## 6. Is the rollback complete, non-auto-discovered, and incident-safe?

**Yes on all three.** `FACT`:

- **Non-auto-discovered.** `run_migration.sh:14` globs `[0-9][0-9]*_*.sql`;
  `rollback_115_…` and `smoke_…` cannot match. The file header states the intent
  explicitly.
- **Complete and correctly ordered.** Functions → view → tables → columns and
  constraints → taxonomy restore → both 114 bodies verbatim, all inside one
  `BEGIN`/`COMMIT` (`rollback_115:9,13-44,47-58,60,120,222`).
- **Verified.** `smoke_rollback_115_procurement_pursuit.sql` asserts 115 tables,
  columns, and functions are absent and that both 114 decision paths are
  restored.
- **Rehearsed.** Codex ran forward + rollback + both smokes on a disposable
  schema-only database.

`FACT` — one consequence to carry into the runbook, not a defect: rollback drops
`procurement_pursuits`, while `procurement_opportunities.review_state='process'`
and `status='accepted'` persist, and `v_procurement_review_queue` excludes
non-`unreviewed`/`needs_info` rows (114). **A rolled-back decided opportunity
returns to the pre-115 dead end and needs manual reconciliation.** At canary
scale that is one row. It should be stated in the incident procedure so an
operator does not assume rollback is state-neutral.

---

## 7. Are grants, RLS, and the Slack wake boundary still least privilege?

**Yes.** `FACT`:

- RLS enabled on all four new tables with **no** `nanoclaw_procurement` policy,
  and no base-table `GRANT` to that role; only
  `v_procurement_pursuit_queue` is granted (`115:780-799` and the grant block).
  Both directions asserted in smoke (`:295,299`).
- Every new function is `REVOKE ALL … FROM PUBLIC` then granted to
  `nanoclaw_admin` only, including the two added this round
  (`fn_link_procurement_run_opportunity`, `fn_ack_procurement_reconciler_alert`).
- No 114 policy was altered; the migration-contract test asserts preservation.
- Every `SECURITY DEFINER` function pins `search_path`; the only dynamic SQL
  remains a static literal (`115:18-23`).

**Wake boundary — verified through three files, which R2 could not confirm.**
`FACT`: `postTracked` calls `storeOutbound(jid, ts, text, undefined, threadTs)`
(`slack.ts:1257`); `storeOutbound` persists `sender_name: ASSISTANT_NAME`,
`is_bot_message: true`, `from_group: undefined` (`slack.ts:1700-1706`); and
`isUntaggedBotNoise` returns `sender_name === assistantName && !from_group`
(`router.ts:42-47`) → `true` → no spawn (`index.ts:525,536`). **Reconciler alerts
cannot wake the Procurement agent.** A source-contract test pins the
receipt-returning path (`procurement-config.test.ts`, "uses receipt-returning
host Slack posts that remain bot-noise guarded") and the pre-existing
`message-loop-pipe.test.ts` proves the guard.

`INFERENCE`. No privilege expansion in this round. The two new functions are
narrower than the ones already present.

---

## 8. F-14: is the backlog-count failure enable-blocking?

**No.** `RECOMMENDATION`: ship as-is; raise the log level.

Justification, precisely — `FACT` + `INFERENCE`:

1. **Nothing is lost.** The query is a read-only `count(*)` over
   `email_classifications` (`src/procurement-reconciler.ts:53-58`). Its failure
   loses one aggregate *number*, not a state transition, a receipt, or a work
   item. The 348 rows remain queryable and unchanged.
2. **No state depends on it.** The backlog is explicitly held and never replayed
   — there is no code path from this count to any write.
3. **It self-heals.** The alert is date-bucketed
   (`src/procurement-reconciler.ts:70`), so the next successful run re-alerts the
   same day or the next.
4. **It is narrowly reachable.** A general database outage would already have
   thrown at the preceding `fn_reconcile_procurement` call (`:46-49`), which is
   *not* caught. The catch therefore covers only that one query failing — a
   permission or schema fault, which is itself a deploy-time error.
5. **It fails in the safe direction.** Continuing to deliver already-claimed
   alerts is strictly better than aborting the run and leaving genuine
   state-change alerts pending.

Contrast with R2 F-1, which *was* blocking: that lost notifications about
transitions the system had already made. This loses a number about work it has
deliberately not touched.

`RECOMMENDATION`. Promote `logger.warn` to `logger.error` and surface the
condition in `alertsFailed`, so a persistent failure is visible rather than
merely logged.

---

## 9. Residual observations (none blocking)

| ID | Observation | Disposition |
| --- | --- | --- |
| **R-a** | The pending outbox is unbounded: `WHERE delivered_at IS NULL ORDER BY a.id` has no `LIMIT` (`115:758-761`). A multi-day Slack outage with daily buckets accumulates rows, and recovery posts them all in one sequential interval callback | Negligible at canary scale. `RECOMMENDATION`: add `LIMIT` (e.g. 50) before broad use |
| **R-b** | Rollback returns already-decided opportunities to the pre-115 dead end (§6) | Runbook item, not a code change |
| **R-c** | `VALIDATE CONSTRAINT procurement_source_run_counts_check` is unconditional (`115:57-58`). Production has zero source-run rows, so it is safe there; an environment holding legacy v1 rows with `new > seen` would abort the migration | Fail-closed and correct. Worth knowing before running elsewhere |
| **R-d** | Delivery succeeded + ack failed produces a duplicate alert next run | Correct at-least-once trade-off; operators should expect occasional repeats |
| **R-e** | `fn_transition_procurement_review` still carries `CASE WHEN p_decision = 'process'` branches that the new guard makes unreachable (`115:~430`) | Harmless residue; tidy at 116 |
| **R-f** | The reconciler arms only at boot (`src/index.ts:2201`) | Correct fail-closed design; enabling requires a restart — runbook item |

---

## 10. Independent verification

`FACT`, run in this worktree:

```
npx tsc --noEmit                                                  → exit 0
9 focused files (8 Procurement + message-loop-pipe)               → 67 tests, all pass
```

Both reproduce Codex's figures exactly. `FACT` — evidence limit: my run used the
worktree's ambient Node, not the pinned 22.23.2; the sandbox declines the pinned
binary invocation form. Codex's independent 22.23.2 typecheck and gate cover
that, and I rely on it rather than restating it as my own.

`FACT` — R2 test gaps, current status:

| R2 gap | Status |
| --- | --- |
| B-1 delivery-failure isolation | **Closed** — two reconciler tests |
| B-2 daily re-alert | **Closed** — `smoke_115:189,194` |
| B-3 reconciler end to end in SQL | **Closed** — `smoke_115:233,239,244,266` |
| B-4 card-less pursuit | **Closed** — `smoke_115:132` |
| B-5 rollback rehearsal | **Closed** — dedicated rollback smoke |
| B-6 ADVANCE rejection receipts | **Closed** — "advances a pursuit only through the bound thread and named actor" plus the malformed-command receipt test |

`INFERENCE`. Tests are evidence, not proof, per the request. What raises my
confidence beyond the counts is that the two hardest properties — outbox
semantics and expiry/alert behavior — are now proven at the **database** level
under transaction rollback, not only against TypeScript mocks.

---

## 11. Gate table

| Gate | Verdict | Conditions and notes |
| --- | --- | --- |
| **Commit** | **GO** | Typecheck and the 9-file gate pass; no shared Gmail, classifier, or router source changed; the slice is coherent and reviewable |
| **Production migration** | **GO** | Back up the taxonomy rows, service definition, and schema first. Rehearse `rollback_115` once more against the freshly-backed-up shape. R-c applies only outside production |
| **Deploy dark** | **GO** | All four gates stay off; the reconciler does not arm. **Treat the taxonomy flip as its own verification step** — it is the only immediate live effect. Confirm new procurement mail routes and `routed_at` populates before enabling anything |
| **Enable sanitized canary** | **GO** | Enable collection first, then review. Run the denial set (wrong user, stale version, wrong thread, old epoch, replay, malformed command) and confirm each produces a visible `[PROCUREMENT … NOT RECORDED]` receipt. Note R-f: enabling requires a restart |
| **One public non-submission canary** | **GO, bounded** | Terminate at `passed` with typed evidence. `proposal_ready` remains unreachable until 116 — correct. No email, registration, signature, attestation, pricing commitment, or submission |

`RECOMMENDATION` — two sequencing points, neither a gate condition:

1. Keep the 348-row email backlog held until after the public canary closes, per
   R1 §5.2. The reconciler now counts it daily, which is the right amount of
   pressure.
2. The shared-CDP retirement remains a separate security task (R1 C-7) and is
   still outstanding. It is correctly absent from this diff, but it should not
   drift behind the canary — it is the one finding in this whole task that
   affects every container, not just Procurement.

---

## 12. Attestation, commands, elapsed time, cost

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R3.md
```

`FACT`. No source, schema, migration, rollback, smoke, configuration, prompt,
test, continuity file, or other report was edited. The 20 modified and 15 other
untracked paths present before this round are unchanged. The dirty operational
checkout at `/Users/xbohdpukc/dev/NanoClaw` was not accessed.

### Inspected

`115_procurement_pursuit.sql` (full) · `rollback_115_procurement_pursuit.sql` ·
`smoke_115_procurement_pursuit.sql` · `smoke_rollback_115_procurement_pursuit.sql` ·
`run_migration.sh` (discovery glob) · full diffs vs `97ca2cc` for
`src/procurement-{intake,review,policy,ipc-handlers}.ts` and `src/index.ts` ·
`src/procurement-reconciler.ts` and `src/procurement-source-config.ts` (full) ·
`src/channels/slack.ts:1239-1264,1689-1706` · `src/router.ts:42-47` ·
`container/agent-runner/src/ipc-mcp-stdio.ts` (procurement tools) ·
`setup/service.ts`, `setup/launchd/com.nanoclaw.plist`, `.env.example` ·
`data/business/CLAUDE.md` · `docs/ACTIVE-WORK.md` (NC-20260809-003) · test
inventories for all nine gate files · the R2 response and the R3 request.

### Commands

`git status --porcelain`, `git diff --stat`, `git diff`; `ls`; `grep`; `sed`;
`head`; `npx vitest run` (9 files); `npx tsc --noEmit`. All read-only with
respect to the repository. No database, network, browser, container, production,
or deployment access.

### Elapsed time and cost

Approximately 17 minutes wall-clock (2026-08-09T20:57Z–21:14Z). One typecheck
and one test run were the only compute beyond file reads. Token and monetary
cost are not observable from inside this session and are therefore not
estimated.
