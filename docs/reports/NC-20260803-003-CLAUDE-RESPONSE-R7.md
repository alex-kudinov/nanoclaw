# NC-20260803-003 Claude response R7 — final route-retry convergence

Reviewer: Claude (Opus 5), independent read of the R6-blocker repair on
`codex/nc-20260803-003-forwarded-email-recovery` (R5 committed as `ec0bf4c`;
working tree modifies only `src/classify-ipc-handlers.ts` and its test).
Date: 2026-08-04T01:02Z (local 2026-08-03 20:02 CDT).
Elapsed: ~3 minutes of review for this round.

## Verdict

`CONVERGED` — R6's blocking duplicate-route finding is closed, and both R6
non-blocking notes (stored-label authority, recording the retry attempt) are
closed with it. No blocking findings remain. Four non-blocking notes and five
owner decisions are recorded below.

## Blocking findings

None.

## Check 1 — the R6 rules-runner duplicate path is closed

Holds. The retry is now gated inside the claim statement by
`AND $2 <> 'rules-runner-v1'` (`src/classify-ipc-handlers.ts:358`), where `$2`
is `data.classifier_version` (`:362`). A `rules-runner-v1` replay therefore
claims nothing, `storedLabel` is `undefined` (`:364`), and control falls to the
pre-existing idempotent no-op (`:381-389`). The exact R6 scenario — handler
routes, then `gmail.ts:621` routes the same message again — can no longer occur,
because the handler half is unreachable for that version.

Because `$2` is also bound to `classifier_version = $2` (`:357`), Postgres
resolves the parameter as `text`, so the inequality is a plain text comparison
with no cast ambiguity.

Covered by `src/classify-ipc-handlers.test.ts:434-449`, which asserts both the
predicate's presence in the issued SQL and that no `ipc/mailman` directory was
created — i.e. no handoff was written.

## Check 2 — the conditional update is an atomic retry claim

Holds. The `SELECT`-then-decide pattern is replaced by one
`UPDATE … RETURNING label` (`:353-363`) whose `WHERE` carries all four
eligibility predicates: same message (`:356`), same version (`:357`), not
rules-runner (`:358`), `routed_at IS NULL` (`:359`), and
`classified_at < NOW() - INTERVAL '30 seconds'` (`:360`).

The claim is genuinely atomic under the pool's autocommit READ COMMITTED
execution: two concurrent replays contend on the same row; the second blocks on
the row lock, then re-evaluates its `WHERE` against the committed version, finds
`classified_at` freshly advanced, updates zero rows, and no-ops. There is no
read-then-write window left in application code.

It cannot claim completed work (`routed_at IS NULL`), recent work (the 30-second
predicate), or rules-runner work (check 1). `routed_at` is still written only
when routing reports success (`:370-376`), so a failed retry stays eligible —
after a further 30 seconds, which now also functions as a backoff.

## Check 3 — the stored label drives taxonomy and routing

Holds, and this closes R6 non-blocking note 1. The claim returns the persisted
label (`:363`), and both consumers use it: `loadTaxonomyRow(storedLabel)`
(`:369`) and `routeAfterClassify({ ...data, label: storedLabel })`
(`:368`, `:371`), with the comment recording why the stored value is the
authority (`:365-367`).

The regression discriminates properly rather than merely passing: the payload
label is `MrGru/financial/receipt` (`src/classify-ipc-handlers.test.ts:79`)
while the claim returns `MrGru/client/active`, and the test reads the actual IPC
file written to `ipc/mailman/messages` and asserts it contains
`[CONTEXT: MrGru/client/active` (`:411-421`). Routing on the payload label
would have produced a Chief escalation (`financial/receipt` is neither
`financial/bill` nor `financial/refund`, so it reaches the unrecognized-label
fallback), not a `fmtClientResponse` handoff — so the assertion could not pass
under the old behavior.

`label` is `NOT NULL` in the schema (`data/business/classification-schema.sql:35`),
so a claimed row always yields a truthy `storedLabel`; the "claim consumed but
nothing routed" shape cannot arise from a missing label.

## Check 4 — a different classifier version resets stale `routed_at`

Holds, unchanged from R6. `routed_at = NULL` is part of the
`ON CONFLICT … DO UPDATE SET` (`:331`), fenced by
`WHERE email_classifications.classifier_version <> EXCLUDED.classifier_version`
(`:332`), so the reset happens only on a real version change; the normal path
then routes through the existing dedup check (`:406-437`). Asserted at
`src/classify-ipc-handlers.test.ts:451-462`.

The two branches remain mutually exclusive by construction:
`insert.rowCount === 0` can only mean the `ON CONFLICT` `WHERE` was false, i.e.
the versions are equal, which is exactly the precondition the claim assumes.

## Check 5 — no new loss/duplicate path or authority widening

No blocking path found.

- **Authority:** unchanged. The retry calls the same `routeAfterClassify` →
  `routeClassifiedEmail`; grants remain the message-scoped ones reviewed in R5
  (Chief `messageId` only, procurement likewise). No capability, grant, or
  search scope is added.
- **Side effects:** the retry still returns at `:379` before
  `replaceClassLabelsOnThread` (`:393`), `maybeCreateAutoRule` (`:397`),
  INBOX removal (`:441-452`), and Hive sync (`:454-474`) — route-only, as
  stated.
- **Duplicate:** the one residual is unchanged and pre-existing —
  `markClassificationRouted` swallows UPDATE failures (`:161-180`), so a route
  that succeeded with a failed audit write stays claimable and can route again
  after 30 seconds. The claim now bounds this to at most one attempt per
  30-second window instead of one per replay.
- **Loss:** none. Every ineligible outcome is a no-op that leaves the row
  retryable; every failed route leaves `routed_at` NULL.
- **Slow-route window:** if a first route takes longer than 30 seconds between
  claim and audit write, a concurrent replay can claim and duplicate. Narrow and
  unchanged from R6.

## Check 6 — the 25-test matrix

Adequate for the contracts, with one honest limitation.

Covered: already-routed no-op (`src/classify-ipc-handlers.test.ts:366-373`),
old unrouted retry with stored-label authority and a real IPC-payload assertion
(`:375-421`), recent unrouted no-op (`:423-432`), rules-runner never retried
(`:434-449`), and `routed_at` reset on version change (`:451-462`).

Limitation worth recording: the eligibility logic now lives in SQL, and `query`
is mocked, so the "already routed" and "does not race a recent" tests are
byte-for-byte identical in what they exercise — both mock the claim as
`{ rowCount: 0, rows: [] }` and assert two queries with no relabel. Their names
promise discrimination the mocks cannot provide. The rules-runner test shows the
cheap remedy: assert the issued SQL contains `routed_at IS NULL` and
`INTERVAL '30 seconds'` respectively, so a future edit that drops a predicate
fails the test that claims to cover it.

Two further gaps, both cheap: no test for a retry whose `routeAfterClassify`
returns `false` (`routed_at` must stay unwritten), and none for an auto-archive
retry (claim consumed, no route — see note 2).

Validation in this session: `npx tsc --noEmit` clean.
`npx vitest run src/classify-ipc-handlers.test.ts`: **21/25 passed, 4 failed** —
all four failures are `better-sqlite3` ABI errors
(`NODE_MODULE_VERSION 127` vs required `147`) at `src/db.ts:425`, because this
sandbox exposes Node v26.5.1 and refuses every route to `.nvmrc`'s 22.23.2. The
four include the stored-label retry test, so that assertion is unverified here;
Codex's 25/25 on exact 22.23.2 is consistent with the environmental diagnosis.

## Non-blocking notes

1. **Reusing `classified_at` as the claim stamp has two readers.**
   `digest-generator.ts:68` selects on `ec.classified_at >= $1`, so a retried
   row re-enters a later digest window and can appear in two consecutive digests
   for labels with `hive_share_target` and `digest_priority >= 1`.
   `hive-sync-reaper.ts:50-52` filters and orders on the same column, so a retry
   extends an unsynced row's 7-day reaper eligibility and reshuffles its
   position. Neither is a correctness or safety problem; both are consequences
   of not having a dedicated `route_attempted_at` column, which would require an
   ordered migration.
2. **The claim precedes the auto-archive test.** The row is claimed at `:353`
   and only then is `taxonomy.auto_archive` evaluated (`:369-370`, `:377`). An
   auto-archive classification never sets `routed_at`, so every same-version
   replay of one now performs a write and a taxonomy lookup before returning,
   shifting its `classified_at` each time (compounding note 1). Loading the
   taxonomy before claiming would avoid the write entirely for the label class
   that can never route.
3. **`markClassificationRouted` still swallows failures** (`:161-180`). This is
   the sole remaining source of an unbounded-in-principle duplicate; a warn-log
   is easy to miss. Surfacing it as an error, or returning success so the caller
   can react, would close the loop.
4. **Interrupted auto-archive is still not converged by a retry** — if a first
   pass died before `removeLabelsFromThread` (`:444`), the thread stays in INBOX
   and the retry returns at `:379`. Explicitly out of scope per the request;
   restated so it is not lost.

## Unresolved owner decisions

1. **Deploy this repair now, or fold in the cheap hardening first?** My
   recommendation: deploy as-is. Note 2 is a one-line reorder and notes 1/3 are
   ergonomics, none of which changes the routing contract.
2. **Add a dedicated `route_attempted_at` column** (ordered migration under
   `data/business/migrations/nanoclaw-v2/`) to stop overloading `classified_at`,
   or accept the digest/reaper side effects in note 1?
3. **Tighten the two mock-identical tests** (check 6) before or after
   deployment?
4. **How to produce the still-missing Sales draft for the recovered inquiry.**
   The classification row is unrouted, is well past 30 seconds old, and is a
   Mailman-version row — so once this build is deployed, one re-emitted
   same-version `classify_label_write` will claim and route it through the
   repaired path, using the *stored* label. The alternative is creating the
   Sales work item directly. Either way the customer reply stays approval-bound
   and Gmail-receipt-confirmed.
5. **Pinned Node 22.23.2 validation on the final tree** (typecheck, focused, and
   full suite), plus the immutable release build and `/health` commit
   verification per `docs/RELEASE-INTEGRITY.md`, remain Codex's to run — not
   reproducible in this sandbox.

## Files and commands inspected

Files: `docs/reports/NC-20260803-003-CODEX-REQUEST-R7.md`,
`src/classify-ipc-handlers.ts` (claim statement, `handleClassifyLabelWrite`,
`markClassificationRouted`, `routeAfterClassify`),
`src/classify-ipc-handlers.test.ts`, `src/channels/gmail.ts` (rules-runner
direct-route sequence), `src/digest-generator.ts`, `src/hive-sync-reaper.ts`,
`data/business/classification-schema.sql`.

Commands: `git status --short`, `git diff` per path, targeted `grep -n`/`sed -n`,
`npx tsc --noEmit` (clean), `npx vitest run src/classify-ipc-handlers.test.ts`
(21/25; 4 `better-sqlite3` ABI failures under Node v26.5.1). No email, Slack,
deploy, commit, service restart, production data access, or secret inspection
occurred; no implementation, test, prompt, or authoritative document was edited.
