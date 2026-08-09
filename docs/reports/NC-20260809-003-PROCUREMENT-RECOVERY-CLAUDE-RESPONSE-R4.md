# NC-20260809-003 — Procurement durable-action-receipt review, Claude R4

- Round: R4, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R4.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T21:12Z–21:29Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`, base `97ca2cc`
- Change class: C0 review. No production, database, browser, or network access;
  no secrets or private content read; nothing built for deployment, migrated,
  deployed, enabled, committed, or pushed.

Labels: `FACT` = verified in this worktree with a citation · `INFERENCE` ·
`RECOMMENDATION`. Citations are worktree-relative.

---

# Verdict: CONVERGED

The remedy is correct, and it is a better design than a narrower patch would
have been: the success receipt is now written by the same database transaction
that writes the state, so the receipt cannot exist without the state or the
state without the receipt.

## Correction to my R3 response

**Codex is right, and my R3 §4 was wrong.** I wrote that the receipt was
"truthful under partial failure" and that "the decision is never reported as
rejected." I verified the *pursuit-lookup* failure path — which had its own
inner `try/catch` — and did not verify the *success-post* path, which shared the
outer `try` with the transition. A `postThread` failure after commit would have
fallen into the outer catch and emitted `[PROCUREMENT ACTION NOT RECORDED]`
against committed state. That is a false receipt on a C5 authorization boundary,
and my CONVERGED verdict was issued with it open. The finding is Codex's.

`INFERENCE`. The class of mistake is worth naming so it does not recur: I
checked the error path that had visibly been given special handling and inferred
the sibling path was covered by the same intent. An outer `try` that spans both a
committed write and its notification is the shape to look for, and I will treat
"catch block reachable after commit" as a standing check rather than a
case-by-case one.

---

## 1. Is the success receipt transactionally durable, and can any post-commit branch still claim `NOT RECORDED`?

**Durable: yes. Post-commit `NOT RECORDED`: no — structurally impossible.**

`FACT`. Both decision paths compose the exact receipt text and insert it into
the outbox inside the same function body as the state and event writes:

- `fn_apply_procurement_review_card_decision` —
  `115_procurement_pursuit.sql:577-594`; the `process` variant embeds exact
  versioned `ADVANCE #<id> v0 …` commands built from `v_pursuit_id` created
  moments earlier in the same transaction (`115:582`).
- `fn_apply_procurement_pursuit_advance` — `115:690-703`.

`INFERENCE`. Because the pursuit is created with `pursuit_version DEFAULT 0` in
the same transaction, the hardcoded `v0` in the receipt is provably correct, and
the separate post-commit lookup query that R3 relied on is gone. Fewer moving
parts, and no window in which the receipt could name a version that does not
exist.

`FACT` — the host now separates rejection from delivery. The transition
`try/catch` closes with `return true` (`src/procurement-review.ts:407-413`)
**before** the receipt block begins. Every `postFailure` call site is
pre-commit:

| Line | Site | Reachable after commit? |
| --- | --- | --- |
| `:337` | malformed command | No — before any query |
| `:345` | review policy disabled | No |
| `:349` | unnamed operator | No |
| `:411` | transition rejected by the ledger | No — the transition did not commit |

`FACT`. The receipt block (`:415-472`) has its own `try/catch` whose handler
calls only `logger.error(..., 'procurement action recorded; durable Slack
receipt remains pending')` (`:464-471`). It posts nothing to Slack. A lookup
miss, a Slack failure, or an ack failure therefore leaves the receipt pending
for the reconciler and never contradicts committed state.

`FACT`. Locked by regression test "never reports a committed action as rejected
when Slack delivery fails" (`src/procurement-review.test.ts`).

`INFERENCE`. I searched specifically for a fifth failure branch — a `finally`, a
rethrow, or an outer wrapper in `src/index.ts` that could surface a post-commit
error as a thread message. There is none: `handleProcurementDecisionMessage`
returns `true` and the caller does not post on its behalf.

---

## 2. Do immediate delivery plus reconciler retry give accurate at-least-once semantics?

**Yes, and the claim is stated accurately.** `FACT`, per branch:

| Scenario | Behavior | Citation |
| --- | --- | --- |
| Normal path | Receipt committed → host looks it up → `postTracked` → ack. Never enters the reconciler queue | `procurement-review.ts:415-462` |
| Slack disconnected at post time | `postTracked` returns `undefined` → `!messageTs` throws → caught, logged, row left pending → reconciler retries in its bound thread | `slack.ts:1244-1247`; `procurement-review.ts:449-450` |
| Post succeeds, ack fails | Logged; `delivered_at` stays null → **re-delivered** by the reconciler. Duplicate receipt possible | `procurement-review.ts:456-461`; `reconciler.ts:113-127` |
| Post succeeds, ack succeeds | `delivered_at` set; never returned again | `115:836-839` |
| One alert fails mid-batch | `continue`; remaining alerts still attempted | `reconciler.ts:105-112` |
| Backlog > 50 | `LIMIT 50` per run (`115:823`), hourly, oldest-first by `id` | `115:820-823` |

`INFERENCE`. The guarantee is exactly **at-least-once until acknowledged**, with
duplicates confined to the post-succeeded/ack-failed window. For an operator
receipt that is the correct trade — a repeated `[PROCUREMENT DECISION RECORDED]`
is harmless; a lost one is the failure this whole task exists to prevent.

`INFERENCE` on the >50 case: because the host delivers receipts inline, the
reconciler queue only accumulates during sustained Slack failure. A backlog
larger than 50 drains at 50/hour oldest-first, so a fresh receipt could wait
`ceil(backlog/50)` hours behind older alerts. At canary scale (one opportunity)
this cannot arise. It is worth a line in the runbook rather than a code change;
if it ever does arise, prioritising `condition_key IN
('decision_receipt','pursuit_receipt')` ahead of standing alerts would be the
minimal fix.

`FACT`. The `LIMIT 50` is backed by a matching partial index
`idx_procurement_reconciler_alerts_pending … WHERE delivered_at IS NULL`
(`115:171-173`), so the pending scan stays cheap as the delivered set grows.

---

## 3. Can a routed outbox row escape its bound thread or wake the agent?

**No, on both counts.** `FACT`:

- **Routing is host-derived, never model-supplied.** `channel_jid`/`thread_ts`
  are written from `p_channel_jid`/`p_message_ts`, and the same function has
  already verified those match the bound card
  (`115:649-654`) before any state change. A receipt therefore inherits a
  channel/thread pair that passed the card binding check.
- **Both-or-neither is enforced.**
  `procurement_reconciler_alert_route_check CHECK ((channel_jid IS NULL) =
  (thread_ts IS NULL))`, added `NOT VALID` then validated (`115:138-152`). A
  half-routed row cannot exist.
- **Delivery honours the pair.** `alert(text, channel_jid ?? undefined,
  thread_ts ?? undefined)` (`reconciler.ts:99-103`) →
  `postTracked(channelJid ?? entry![0], text, threadTs)`
  (`src/index.ts`, reconciler block). Routed rows go to their bound thread;
  unrouted alerts go to the Procurement channel with no thread.
- **The non-null assertion is sound.** The guard
  `if (!slack || (!channelJid && !entry)) throw` runs first, and `??`
  short-circuits, so `entry![0]` is evaluated only when `channelJid` is nullish —
  precisely when the guard has proven `entry` exists.
- **No wake.** Unchanged from R3 and re-verified: `postTracked` →
  `storeOutbound(jid, ts, text, undefined, threadTs)` (`slack.ts:1257`) →
  persists `sender_name: ASSISTANT_NAME`, `is_bot_message: true`,
  `from_group: undefined` (`slack.ts:1700-1706`) → `isUntaggedBotNoise` returns
  true (`router.ts:42-47`) → no spawn (`index.ts:525,536`). This holds for
  threaded posts identically, since `storeOutbound` sets `from_group` the same
  way regardless of `threadTs`.

`INFERENCE`. The routing change *narrows* rather than widens the boundary: a
receipt can now only reach the exact thread whose card authorized the action,
where previously all reconciler output went to the channel root.

---

## 4. Are the schema change, RLS/grants, reapply, rollback, and ack signature coherent?

**Yes.** `FACT`:

- **Schema.** Columns added with `ADD COLUMN IF NOT EXISTS` (`115:133-136`), the
  route constraint added guarded then validated (`115:138-152`), and the pending
  partial index created `IF NOT EXISTS` (`115:171-173`). The base `CREATE TABLE`
  also declares the columns (`115:126-127`), so a fresh database and an upgrade
  converge on the same shape.
- **Reapply.** Every new object is `IF NOT EXISTS` / `CREATE OR REPLACE`;
  `VALIDATE CONSTRAINT` on an already-validated constraint is a no-op. Codex's
  idempotent reapply on a disposable database is consistent with the source.
- **RLS/grants.** Unchanged and still least privilege: RLS on all four tables
  with no `nanoclaw_procurement` policy, no base-table grant, only the bounded
  views granted; every function `REVOKE ALL … FROM PUBLIC` then granted to
  `nanoclaw_admin` alone (`115:842-862` and the grant block). The routing columns
  live on a table the container cannot read at all.
- **Ack signature.** Now single-argument with database `now()`
  (`115:828-840`), removing the last caller-supplied clock from the ack path and
  matching the `p_now` guard already present on the reconciler (`115:749-751`).
  The host calls it with one argument (`reconciler.ts:116-118`;
  `procurement-review.ts:452-455`).
- **Rollback drops both overloads** — the two-argument R3 form and the
  one-argument R4 form (`rollback_115_procurement_pursuit.sql:13-16`). `FACT`:
  this is the detail I specifically probed, because `CREATE OR REPLACE` of a
  function with a changed signature creates an *overload* rather than replacing
  it; an environment that had applied the R3 version would otherwise be left
  with an orphaned two-argument function after rollback. It is handled.
- **`src/ipc.ts`** carries exactly one change — `postProcurementReviewThread`
  now returns `Promise<string | undefined>` — which is the minimum needed to
  propagate the delivery receipt.

---

## 5. Any remaining blocking defect?

**None.** Residual observations, all non-blocking:

| ID | Observation | Disposition |
| --- | --- | --- |
| **R-1** | Receipts now render the actor as `btrim(p_owner_uid)` (`115:581`) rather than the Slack display name the R3 host used. Receipts show a UID | Cosmetic; arguably better, since the UID is the authorization identity. Note it so nobody reads it as a bug |
| **R-2** | A >50 pending backlog delays fresh receipts behind older alerts (§2) | Runbook line; cannot arise at canary scale |
| **R-3** | Rollback drops `procurement_pursuits` while `review_state='process'` persists, returning a decided opportunity to the pre-115 dead end | Carried from R3 §6. Incident-runbook item: rollback is not state-neutral |
| **R-4** | `VALIDATE CONSTRAINT` calls are unconditional; safe in production (zero rows), would abort elsewhere on violating legacy rows | Fail-closed and correct |
| **R-5** | The reconciler arms only at boot; enabling requires a restart | Runbook item |
| **R-6** | Shared-CDP retirement remains outstanding and outside this slice | Separate security task. It affects every container, not just Procurement, and should not drift behind this canary |

---

## 6. Independent verification

`FACT`, run in this worktree:

```
npx tsc --noEmit                                        → exit 0
8 procurement-named test files                          → 62 tests, all pass
+ src/ipc-procurement-auth.test.ts                      → 9 files, 64 tests, all pass
```

`FACT` — **one evidence discrepancy in the request.** Item 8 states "8 focused
files / 64 tests." The 64-test figure reproduces only across **nine** files; the
eight procurement-named files total **62**. Per-file counts: intake 11, review
13, ipc-handlers 10, migration-contract 13, source-completeness 4, reconciler 4,
policy 4, config 3 (= 62), plus `ipc-procurement-auth` 2 (= 64). Everything
passes either way; the file count in the request text is off by one. Recording it
so the changelog does not inherit an unreproducible figure.

`FACT` — evidence limit unchanged: my run used the worktree's ambient Node, not
the pinned 22.23.2, because the sandbox declines the pinned-binary invocation
form. Codex's independent 22.23.2 typecheck and gate cover that.

`FACT` — new regression coverage for this round:
`procurement-review.test.ts` — "never reports a committed action as rejected when
Slack delivery fails"; `procurement-migration-contract.test.ts` — "records
successful human-action receipts transactionally and bounds retries", "keeps
alerts pending until an explicit delivery acknowledgment", "ships a
non-auto-discovered rollback with the migration-114 bodies". `INFERENCE`: these
pin the three properties the remedy asserts, and the first is a direct test of
the defect that R3 missed.

---

## 7. Gate table

| Gate | Verdict | Conditions and notes |
| --- | --- | --- |
| **Commit** | **GO** | Typecheck clean; 64/64 focused tests pass; no shared Gmail, classifier, or router source changed; `src/ipc.ts` carries a single return-type widening |
| **Production migration** | **GO** | Back up taxonomy rows, service definition, and schema first. Rollback and its smoke are rehearsed. R-4 applies only outside production |
| **Deploy dark** | **GO** | All four gates off; the reconciler does not arm. **The taxonomy flip remains the only immediate live effect** — verify that new procurement mail routes and `routed_at` populates as its own step before enabling anything |
| **Sanitized denial canary** | **GO** | Run the full denial set — wrong user, stale version, wrong thread, old epoch, replay, malformed command — and confirm each produces a visible `[PROCUREMENT ACTION NOT RECORDED]`. Then force one Slack failure on a *successful* action and confirm the receipt stays pending and is delivered on the next reconciler pass, with no `NOT RECORDED`. R-5: enabling requires a restart |
| **One public non-submission canary** | **GO, bounded to `passed`** | `proposal_ready` correctly unreachable until 116. No email, registration, signature, attestation, pricing commitment, or submission |

`RECOMMENDATION` — two standing items, neither a gate condition: keep the
348-row email backlog held until after the public canary closes (the reconciler
now counts it daily), and do not let the shared-CDP retirement (R-6) drift behind
this work.

---

## 8. Attestation, commands, elapsed time, cost

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R4.md
```

`FACT`. No source, schema, migration, rollback, smoke, configuration, prompt,
test, continuity file, or other report was edited. The 21 modified and 16 other
untracked paths present before this round are unchanged. The dirty operational
checkout at `/Users/xbohdpukc/dev/NanoClaw` was not accessed.

### Inspected

`115_procurement_pursuit.sql` (outbox schema `:120-173`, both decision functions
`:487-600` and `:603-707`, reconciler `:735-825`, ack `:828-840`, grants
`:842-862`) · `rollback_115_procurement_pursuit.sql` (drop set and both restored
114 bodies) · both 115 smoke files · `src/procurement-review.ts` (full handler
`:307-492`) and its test inventory · `src/procurement-reconciler.ts` (full) and
its test inventory · `src/index.ts` reconciler and IPC wiring diff ·
`src/ipc.ts` diff · `src/procurement-ipc-handlers.ts` diff ·
`src/channels/slack.ts:1239-1264,1689-1706` · `src/router.ts:42-47` ·
`src/procurement-migration-contract.test.ts` inventory ·
`run_migration.sh` discovery glob · the R3 response and the R4 request.

### Commands

`git status --porcelain`, `git diff --stat`, `git diff`; `ls`; `grep`; `sed`;
`npx vitest run` (8-file and 9-file sets); `npx tsc --noEmit`. All read-only with
respect to the repository. No database, network, browser, container, production,
or deployment access.

### Elapsed time and cost

Approximately 17 minutes wall-clock (2026-08-09T21:12Z–21:29Z). One typecheck and
two test runs were the only compute beyond file reads. Token and monetary cost
are not observable from inside this session and are therefore not estimated.
