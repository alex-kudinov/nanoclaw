# NC-20260803-003 Claude response R6 — reclassification route-state repair

Reviewer: Claude (Opus 5), independent read of the post-R5 repair on
`codex/nc-20260803-003-forwarded-email-recovery` (R5 committed as `ec0bf4c`;
working tree modifies only `src/classify-ipc-handlers.ts` and its test).
Date: 2026-08-04T00:56Z (local 2026-08-03 19:56 CDT).
Elapsed: ~4 minutes of review for this round.

## Verdict

`CHANGES REQUIRED` — one blocking finding: the new retry branch is missing the
`rules-runner-v1` exclusion that the normal path carries, so a re-delivered
rules-runner message can now produce two downstream handoffs where it
previously produced one. Everything else in the repair holds; the fix is one
clause.

## Blocking finding

### 1. The retry branch re-routes `rules-runner-v1`, which `gmail.ts` then
routes again — duplicate handoff

The normal path deliberately excludes the rules-runner classifier from host
routing, with the reason stated inline: *"The rules-runner path already calls
routeClassifiedEmail() in gmail.ts, so skip it here to avoid double-routing"*
(`src/classify-ipc-handlers.ts:393-399`). The new retry branch
(`:346-374`) omits that condition — it gates only on `routed_at`,
`retryable`, and `taxonomy.auto_archive` (`:362-364`).

Failure scenario, concretely:

1. A rules-runner match calls `handleClassifyLabelWrite(... 'rules-runner-v1')`
   (`src/channels/gmail.ts:562-572`), which persists the classification row.
2. The process dies (or is restarted) before `storeMessageDirect`
   (`src/channels/gmail.ts:618`) — i.e. inside `recordRuleHit` /
   `isAutoArchiveLabel` (`:574-578`). The classification row exists with
   `routed_at IS NULL`; the Gmail message was never written to `messages`, so
   `processedIds` — seeded from `getMessageIdsForJid` at connect — will not
   suppress a re-delivery.
3. The safety poll or history replay re-delivers the same message more than 30
   seconds later. `handleClassifyLabelWrite` now takes the retry branch
   (same version, unrouted, retryable) and calls `routeAfterClassify` →
   **handoff #1**.
4. Execution returns to `gmail.ts`, which continues to
   `routeClassifiedEmail(...)` (`src/channels/gmail.ts:621`) → **handoff #2**,
   then marks the row routed (`:640`).

Result: two `[HANDOFF: mailman→…]` work items for one email — two Sales drafts
or two Chief escalations. Handoff #1 is also degraded: `routeAfterClassify`
reads the body from `getMessageById`, and in this window the message row does
not exist, so it routes with an empty body (`:196-254` degrade-gracefully path).

A second, restart-free variant of the same defect: `markClassificationRouted`
swallows UPDATE failures by design (`:161-180`, logs and returns). A route that
succeeded but whose audit write failed leaves `routed_at` NULL permanently, so
any later re-delivery takes the retry branch and duplicates.

Fix: mirror the normal-path guard —
`if (prior && !prior.routed_at && prior.retryable && data.classifier_version !== 'rules-runner-v1')`
— and add the regression that asserts a `rules-runner-v1` same-version replay
stays a no-op. This also restores the check 5 contract ("rules-runner direct
routing … unchanged"), which the repair currently breaks.

## Check 1 — a different classifier version cannot inherit stale completion

Holds. `routed_at = NULL` is now part of the `ON CONFLICT … DO UPDATE SET`
(`src/classify-ipc-handlers.ts:331`), and the update fires only when the stored
version differs (`:332`). The subsequent dedup `SELECT` therefore reads
`routed_at IS NULL` and routes (`:400-432`). Asserted at
`src/classify-ipc-handlers.test.ts:432-443` (`routed_at = NULL` present in the
issued SQL).

The state logic is internally consistent: `insert.rowCount === 0` can only mean
the `WHERE` was false, i.e. the versions are equal, so the retry branch's
`WHERE gmail_message_id = $1 AND classifier_version = $2` (`:355-359`) is
guaranteed to find the same row it just declined to update.

## Check 2 — a failed route can be retried without relabeling or widening authority

Holds. The retry branch returns at `:373` before
`replaceClassLabelsOnThread` (`:387`), `maybeCreateAutoRule` (`:391`), the
INBOX-removal block (`:436-446`), and the Hive block (`:448-467`) — so a retry
re-attempts only the host handoff. Authority is unchanged: it calls the same
`routeAfterClassify` → `routeClassifiedEmail`, whose grants are the same
message-scoped ones reviewed in R5 (`routeChief` grants `messageId` only;
procurement likewise). No new grant, capability, or search scope is introduced.
`routed_at` is written only when routing reports success (`:365-371`).

## Check 3 — completed same-version work stays idempotent

Holds. A row with `routed_at` set falls past the retry condition (`:362`) to the
existing debug no-op (`:375-382`). Asserted at
`src/classify-ipc-handlers.test.ts:366-376` — two queries total, no relabel.

## Check 4 — the 30-second guard, and remaining duplicate/loss paths

The guard is materially correct for the ordinary concurrent case. Handler A
inserts and routes within milliseconds; handler B's conflicting write sees
`classified_at` less than 30 s old, `retryable = false`, and no-ops
(`:356`, `:362`; asserted at `src/classify-ipc-handlers.test.ts:418-430`). The
push/safety-poll double-delivery race — the realistic concurrency in this
system — lands inside that window and is suppressed.

Remaining paths, in severity order:

1. **Blocking:** the `rules-runner-v1` duplicate above.
2. **Non-blocking, unbounded retries:** `classified_at` is *not* refreshed on a
   same-version replay (the `ON CONFLICT` update is skipped entirely), so
   `retryable` ages from the original classification. Every replay after the
   first 30 seconds re-attempts routing. Combined with the swallowed
   `markClassificationRouted` failure (`:170-179`), a row can route repeatedly
   across replays with no state change to stop it.
3. **Non-blocking, slow-route window:** if a first handler takes longer than
   30 s between the classify INSERT and its `routed_at` write, a replay arriving
   in that window double-routes. Narrow, but it is the guard's only real gap.
4. **No loss path found.** A retry whose route fails leaves `routed_at` NULL and
   returns; the next replay can retry. Nothing in the branch discards work.

## Check 5 — adjacent behavior unchanged

Holds except for the rules-runner interaction in the blocking finding.

- **Auto-archive:** the retry branch explicitly skips routing for auto-archive
  taxonomy (`:363-364`), matching the normal path (`:396-399`). Auto-archive
  rows therefore stay no-ops on replay.
- **Gmail labels:** unchanged — `replaceClassLabelsOnThread` runs only on the
  insert/version-change path (`:387`), so a retry cannot relabel or churn
  `MrGru/*`.
- **Hive sync:** unchanged; the retry does not re-attempt it, which is correct
  because `hive-sync-reaper` owns that retry.
- **Approval-bound sending:** untouched. The retry writes an IPC handoff at
  most; no send path is reachable from this file.
- **Rules-runner direct routing:** *changed* — see the blocking finding.

## Check 6 — test coverage of the state matrix

Four new/updated tests cover: already-routed same-version no-op
(`src/classify-ipc-handlers.test.ts:366-376`), old unrouted retry
(`:378-416`), recent unrouted no-op (`:418-430`), and `routed_at = NULL` on
version change (`:432-443`). The retry test exercises the real
`routeAfterClassify` against a seeded SQLite message row and asserts the
`SET routed_at = NOW` UPDATE is the fourth query — that is a genuine host-route
exercise, not a stub.

Gaps:

- No test asserts a `rules-runner-v1` same-version replay stays a no-op — the
  blocking defect is uncovered, which is why it survived to review.
- No test covers a retry whose `routeAfterClassify` returns `false`
  (`routed_at` must remain NULL and no UPDATE issued).
- No test covers a retry whose payload `label` differs from the stored row's
  label (see non-blocking note 1).

Validation in this session: `npx tsc --noEmit` clean.
`npx vitest run src/classify-ipc-handlers.test.ts`: **20/24 passed, 4 failed** —
all four failures are `better-sqlite3` ABI errors
(`NODE_MODULE_VERSION 127` vs required `147`) at `src/db.ts:425`, because this
sandbox exposes Node v26.5.1 and refuses every route to `.nvmrc`'s 22.23.2. The
four include the new retry test, so that specific assertion is unverified here;
Codex's 24/24 on exact 22.23.2 is consistent with the environmental diagnosis.

## Non-blocking notes

1. **The retry routes on the payload label, not the stored label.** The
   `ON CONFLICT` update is skipped for a same-version replay, so a replay
   carrying a *different* label leaves the row's `label` stale while
   `routeAfterClassify(data)` (`:365`) and `loadTaxonomyRow(data.label)`
   (`:363`) both use the new one. The work item would then be routed to a group
   the persisted classification and the Gmail label do not agree with. Selecting
   `label` alongside `routed_at` and routing on the stored value — or declining
   the retry when the labels differ — removes the divergence.
2. **Nothing records that a retry was attempted.** Adding a
   `route_attempted_at` stamp (or refreshing `classified_at` on the retry) would
   bound note 2 of check 4 and make repeated replays diagnosable from the row
   alone.
3. **Interrupted auto-archive is still not finished by a retry.** If a first
   pass died before `removeLabelsFromThread` (`:438`), the thread stays in INBOX
   and the retry branch returns at `:373` without completing it. Pre-existing
   behavior for the old no-op, but the retry branch is now the natural place to
   converge it.
4. **`prior` absent is safe.** If the row disappears between the conflict and
   the SELECT, `existing.rows[0]` is `undefined` and control falls to the debug
   no-op (`:361-362`, `:375`).

## Unresolved owner decisions

1. **Ship the one-line `rules-runner-v1` guard before deploying this repair, or
   accept the duplicate-handoff window?** My recommendation: fix it now — it is
   one clause plus one test, and the failure mode (two Sales drafts for one
   lead) is one this system has an incident history for.
2. **Should a same-version retry route on the stored label or the payload
   label?** (Non-blocking note 1.) This is a semantics call about whether a
   replay may change the routing target without changing the recorded
   classification.
3. **Should the retry converge interrupted auto-archive/INBOX state**, or stay
   strictly a routing repair? (Note 3.)
4. **How to produce the still-missing Sales draft for the recovered inquiry.**
   The classification row exists, is unrouted, and its `classified_at` is now
   well past 30 seconds, so a re-emitted same-version `classify_label_write`
   would route it through the repaired path once deployed. Whether to do that,
   or to create the Sales work item directly, is the owner's call — either way
   the customer reply remains approval-bound and Gmail-receipt-confirmed.
5. **Pinned-Node validation on the final tree** (typecheck + focused + full
   suite on exact 22.23.2) still has to be run by Codex; it is not reproducible
   in this sandbox.

## Files and commands inspected

Files: `docs/reports/NC-20260803-003-CODEX-REQUEST-R6.md`,
`src/classify-ipc-handlers.ts` (full handler, `markClassificationRouted`,
`routeAfterClassify`), `src/classify-ipc-handlers.test.ts`,
`src/channels/gmail.ts` (rules-runner direct-route sequence).

Commands: `git log --oneline -3`, `git status --short`, `git diff --stat`,
`git diff` per path, targeted `grep -n`/`sed -n`, `npx tsc --noEmit` (clean),
`npx vitest run src/classify-ipc-handlers.test.ts` (20/24; 4 `better-sqlite3`
ABI failures under Node v26.5.1). No email, Slack, deploy, commit, service
restart, production data access, or secret inspection occurred; no
implementation, test, prompt, or authoritative document was edited.
