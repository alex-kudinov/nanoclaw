# NC-20260802-009 — Claude C5 review R3 (legacy migration-order correction)

## Reviewer, scope, and limits

- Reviewer: Claude Code, model `claude-opus-5`, session
  `b361d68b-688c-4dd0-bba0-a43188673962` (same session as R1 and R2)
- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Base: `d1bfccef1c5b6e49837ea668bdbfae207c0aec10`
  ("feat: make approved email delivery receipted and fail-closed")
- Delta reviewed: the complete uncommitted delta from that commit — 5 paths,
  `98 insertions(+), 13 deletions(-)`:
  `src/db.ts`, `src/db.test.ts`, `docs/ACTIVE-WORK.md`,
  `docs/ENGINEERING-CHANGELOG.md`,
  `docs/reports/NC-20260802-009-CONVERGENCE-STATE.md`
- Elapsed: request artifact mtime `2026-08-02T23:15:12Z` → this report,
  ≈ 12 minutes wall clock

Read-only limits observed:

- The only file created is this report. No implementation, continuity, prompt,
  or configuration file was edited.
- Nothing staged, committed, packaged, activated, or restarted. No Slack post,
  no email, no production database read or write.
- `.env*`, OAuth/token material, `~/.claude` settings, `store/`, and database
  dumps were not read. `/Users/xbohdpukc/dev/NanoClaw` was not touched.
- Three scratch files outside the worktree (`/tmp/nc009-r3-probe.mjs`,
  `/tmp/nc009-r3-audit.mjs`, `/tmp/nc009-r3-fixture.mjs`). They read tracked
  source only and operate on throwaway in-memory databases.
- Local execution policy still blocks `/opt/homebrew/opt/node@22/bin/node`; the
  runtime here is Node `v26.5.0`, and `better-sqlite3` in this tree is compiled
  for Node 22 (`NODE_MODULE_VERSION 127` vs `147`). I therefore could not run
  `src/db.test.ts` directly. Instead of accepting a green fresh-database suite
  as evidence — which the request correctly rejects — I executed the **real
  `createSchema()` function body**, extracted mechanically from each revision
  of `src/db.ts` by brace matching and evaluated against `node:sqlite`. Every
  claim below is the output of running the actual shipped code path, including
  its `for` loops and `try/catch` migrations.

---

## Verdict

**APPROVE**

The correction is exactly scoped to the defect, the defect reproduces from the
committed code, the corrected code succeeds on the exact production structure,
and — the part that matters most — the new regression fixture is byte-identical
to the live DDL and the **committed code fails against that fixture**. The test
would have caught this before deployment. I found no other statement in the
initial schema block that references a later-migrated column, no weakening of
action-ID uniqueness, and no route for a surviving legacy row to execute.

Two follow-ups are worth recording; neither blocks the retry.

---

## Executable evidence

### 1. The committed failure reproduces, and the correction fixes it

Running the real `createSchema()` from each revision against the exact
pre-NC-009 structure quoted in the request:

```
1) COMMITTED d1bfcce createSchema() on the exact legacy schema
   d1bfcce: THREW -> no such column: action_id
   reproduces production failure: YES

2) CORRECTED worktree createSchema() on the exact legacy schema
   worktree: OK
   NC-009 columns present : true
   indexes                : idx_pending_sends_action, idx_pending_sends_gmail_thread,
                            idx_pending_sends_group, idx_pending_sends_handoff,
                            idx_pending_sends_state
```

The failure order is confirmed by inspection of the committed source:
`d1bfcce:src/db.ts:123-124` places
`CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_sends_action` inside the first
`database.exec()` block, immediately after `idx_pending_sends_group` and before
`CREATE TABLE IF NOT EXISTS email_send_events`, while the `action_id` column is
only added by the `ALTER TABLE` loop at `src/db.ts:374-392`. The correction
removes those two lines, so the initial block now goes straight from
`idx_pending_sends_group` (`src/db.ts:121-122`) to `email_send_events`
(`:123`); the index retains its existing creation at `src/db.ts:393-395`,
after the loop.

A useful side consequence of that exact ordering: because every statement
preceding the failing one in that block is `IF NOT EXISTS` against a table that
already existed in production, and `email_send_events` came *after* the failing
statement, the failed attempt applied nothing. The live database is unchanged,
which matches the continuity record's claim. Convergence from a partial state is
proven independently below regardless.

### 2. The fixture matches production and catches the deployed bug

Extracting the fixture's SQL verbatim from
`_initLegacyPendingSendsTestDatabase` (`src/db.ts:429-455`) rather than
retyping it, and comparing the resulting schema against the DDL quoted in the
request:

```
A) fixture vs the production DDL quoted in the request
   column list+types+notnull identical : true
   column order identical              : true
   index names identical               : true
   index definitions identical         : true
   columns: draft_ts,group_folder,chat_jid,thread_ts,recipient,lead_ref,approved_at,
            gmail_thread_id,handoff_observed_at,handoff_message_id,
            mailman_started_at,handoff_alerted_at

B) does the new fixture catch the OLD bug?
   d1bfcce createSchema on fixture: THREW -> no such column: action_id
   regression catches the deployed failure: YES

C) and the corrected code passes on that same fixture
   worktree createSchema on fixture: OK
   action index present: true
```

This is the specific thing the request asked to be proven, and it holds. Note
the fixture reaches the production column *order* honestly — it declares the
seven original columns and then `ALTER`s in the five that production also
received by migration — rather than declaring all twelve up front. It then
calls the real `createSchema(db)` at `src/db.ts:454`; it does not reimplement
the migration. `beforeEach` (`src/db.test.ts:52-54`) re-initialises a fresh
database per test, so the legacy fixture cannot leak into the other 65 tests.

### 3. No other initial-block statement references a later-migrated column

Mechanical audit of all 12 `CREATE INDEX` statements in the initial `exec`
block against all 25 columns added by later `ALTER TABLE` migrations
(both explicit statements and the two expanded `for` loops):

```
  idx_timestamp                  messages(timestamp)                                   ok
  idx_next_run                   scheduled_tasks(next_run)                             ok
  idx_status                     scheduled_tasks(status)                               ok
  idx_task_run_logs              task_run_logs(task_id,run_at)                         ok
  idx_pending_sends_group        pending_sends(group_folder,approved_at)               ok
  idx_email_send_events_action   email_send_events(action_id,sequence)                 ok
  idx_jobs_next_run              jobs(next_run)                                        ok
  idx_jobs_enabled               jobs(enabled)                                         ok
  idx_job_run_logs_name          job_run_logs(job_name,started_at)                     ok
  idx_job_run_logs_status        job_run_logs(status)                                  ok
  idx_autonomy_events_pending    autonomy_draft_events(outcome,group_folder)           ok
  idx_autonomy_pending_status    autonomy_pending(status,expires_at)                   ok

violations in initial block: 0
```

The migrated-column inventory the audit checked against:
`scheduled_tasks.context_mode`; `slack_thread_anchors.last_activity_at`;
`messages.is_bot_message, thread_ts, from_group`; `registered_groups.is_main`;
`chats.channel, is_group`; `jobs.run_interval_days`; and the sixteen
`pending_sends` columns. Two near-misses are handled correctly by the existing
code and are worth naming as the pattern to keep: `idx_thread` on
`messages(chat_jid, thread_ts, timestamp)` is created inside the same `try`
block as its `ALTER` (`src/db.ts:291-298`), and `idx_pending_sends_gmail_thread`
/ `idx_pending_sends_handoff` are created after their respective migrations
(`src/db.ts:346-349`, `:366-369`). `idx_pending_sends_state` was already in the
post-loop block and is unaffected.

`idx_email_send_events_action` appears in both the initial block and the tail
block. That is harmless duplication — the table is created in the same
statement group in both places, so the column always exists — not a second
instance of the defect.

### 4. Idempotency across fresh, legacy, and partially-migrated databases

```
3) idempotency / repeat startup
   legacy 2nd run: OK
   legacy 3rd run: OK
   fresh 1st run : OK
   fresh 2nd run : OK
   fresh vs migrated index sets identical : true

4) partially-attempted but still pre-NC-009 database
   partial recovery: OK
   converges to full column set: true
   converges to full index set : true

7) fresh vs legacy-migrated column reconciliation
   same set (order-insensitive): true
   fresh-only : []      legacy-only: []
   partial-unique index decl identical: true
   decl: CREATE UNIQUE INDEX idx_pending_sends_action ON pending_sends (action_id)
         WHERE action_id IS NOT NULL
   state NOT NULL/default fresh : {"notnull":1,"dflt_value":"'approved'"}
   state NOT NULL/default legacy: {"notnull":1,"dflt_value":"'approved'"}
```

The partial case seeded a database that already had `email_send_events` and two
of the eleven NC-009 columns — the worst realistic residue of an interrupted
`exec` — and it converged to exactly the fresh-database shape.

Column *order* differs between a fresh and a migrated table (`ALTER` appends),
which is inherent and benign here: I confirmed there is no `SELECT *` and no
positional `INSERT ... VALUES` against `pending_sends` or `email_send_events`
anywhere in `src/db.ts`; every access names its columns, and `EMAIL_ACTION_SELECT`
is an explicit list. Had a positional access existed, it would have been the
same class of defect — passing on fresh test databases, wrong in production.

### 5. Uniqueness and legacy-row containment are unaffected

```
5) action-ID uniqueness survives the legacy path
   duplicate action_id rejected: THREW -> UNIQUE constraint failed: pending_sends.action_id
   two NULL action_ids allowed  : OK

6) a surviving legacy row cannot execute
   migrated legacy row: {"action_id":null,"approved_content_sha256":null,
                         "recipient":"lead@example.com","state":"approved"}
   claim by NULL action_id changes: 0 (0 = unreachable)
   content binding absent (hash NULL): true
```

The partial unique index is byte-identical on both paths, still enforces
uniqueness on real IDs, and still permits many NULLs. A row that survives the
migration lands with `action_id NULL` and `approved_content_sha256 NULL`: the
claim predicate cannot match it, `findPendingSendAction` excludes it from the
content and recipient fallbacks, and `src/ipc.ts:784` denies any Mailman send
that resolves to an action without an `actionId`. Moving the index later does
not touch any of that. Production's `pending_sends` was verified empty before
the failed attempt, so this is defence in depth rather than an active case.

### 6. Gates reproduced

| Check | Result here | Codex claim |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics | typecheck pass |
| `npm run docs:continuity-check` | pass — sanitizer self-test passed; 38 active/ready task rows, 35 changelog entries | pass |
| `git diff --check` | clean | pass |
| `src/db.test.ts` case count | **66** `it(` blocks | 66/66 pass under Node 22.23.2 |
| `src/db.test.ts` execution | not runnable here (better-sqlite3 ABI 127 vs 147) | authority remains Codex's Node 22 run |

The count matches. Execution evidence is supplied above by running the real
`createSchema()` rather than by trusting the suite.

---

## Transactionality and failure cleanup (request item 6)

Not required for this activation, and I would not add it here.

Every step is individually idempotent: `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ADD COLUMN` inside `try/catch`.
Probe 4 demonstrates that an interrupted migration converges to the correct
shape on the next startup rather than requiring cleanup. The NC-009 columns are
purely additive with no data backfill, the table was empty, and
`state TEXT NOT NULL DEFAULT 'approved'` is legal as an added column precisely
because it carries a non-null default — verified identical (`notnull:1`,
`dflt_value:'approved'`) on both the fresh and migrated paths. Wrapping this in
a transaction would convert a self-healing sequence into an all-or-nothing one
without removing any failure mode that currently exists.

One observation found while auditing this, which is **pre-existing and not
introduced by NC-009**: several older migrations pair an `ALTER` with a data
backfill inside one `try` (`src/db.ts:264-275` `messages.is_bot_message`,
`:277-288` `registered_groups.is_main`, `:300-311` `messages.from_group`,
`:312-331` `chats.channel/is_group`). If the `ALTER` succeeds and the backfill
then throws, the `catch` swallows it and the next startup's `ALTER` throws
"column already exists", so the backfill never runs. NC-009's own loop has no
backfill, so this is not a blocker for the retry — but it is the same
"convergence assumed, not proven" reasoning that produced this incident, and it
is worth a task.

---

## Blockers and follow-ups

**Commit blockers: none. Deploy blockers: none.**

| ID | Item | Severity | Owner | Suggested disposition |
| --- | --- | --- | --- | --- |
| F1 | The regression is `pending_sends`-specific. The fixture rebuilds only that table; every other table is created fresh, so a future initial-block index over a later-migrated column of `messages`, `jobs`, or `chats` would still ship untested. The audit in §3 shows zero current violations, so this is prevention, not repair. | Medium | Codex | Add to `NC-20260802-010` or a new task: a static check that no statement in the initial `createSchema` block references a column added by a later `ALTER` — the audit in §3 is ~30 lines and can run in CI |
| F2 | Older `ALTER`+backfill pairs share one `try`, so a failed backfill is permanently skipped (see above). Pre-existing, not NC-009. | Low | Codex | New `planned` row |
| F3 | `_initLegacyPendingSendsTestDatabase` is exported from a production module and ships in `dist`; calling it would swap the live `db` handle for an in-memory one. Identical in kind to the existing `_initTestDatabase`, and unreferenced outside `src/db.test.ts`. | Low | Codex | Optional: guard both `@internal` initialisers behind a test-environment check |

R2's residuals N1–N5 remain registered as `NC-20260802-010` and are untouched by
this delta.

---

## Continuity record audit (request item 7)

Accurate, and it says failed-and-rolled-back rather than deployed:

- `docs/ACTIVE-WORK.md` moves NC-009 from `ready_for_review` to **`validating`**
  — not `deployed_unverified` — and rebases the row on `d1bfcce`. The task
  detail states plainly that startup failed on `no such column: action_id`,
  that "fresh databases used in tests already had the column, so they did not
  exercise this order", that the activator restored `aa1c821`, and that "No
  canary or customer email ran."
- `docs/ENGINEERING-CHANGELOG.md` replaces the former "Deployment/external
  state: none" line with a dated first-activation record naming the verified
  archive digest, the failure, the restore of `aa1c821`, the byte-for-byte
  prompt restoration, and explicitly "No canary, customer email, OAuth change,
  or business-row mutation occurred; the database remained on its pre-NC-009
  structure." State moves to `validating`.
- `docs/reports/NC-20260802-009-CONVERGENCE-STATE.md` reopens from `converged`
  to `active`, and its "Open defects" line now names the real defect instead of
  "none".
- No customer rows, email addresses, tokens, or secrets appear anywhere in the
  documentation delta — I scanned the added lines for address, token, bearer,
  key, and password patterns and found none. The archive SHA-256 and the commit
  hashes are build provenance, which `docs/RELEASE-INTEGRITY.md` already
  requires to be recorded.

One wording note, not a correction request: the changelog's top-level `Date:`
field still reads `2026-08-02T21:30Z` while the entry now describes events at
23:08Z. The entry body carries its own timestamps, so nothing is misleading.

---

## Separate decisions

- **Correction commit: proceed.** The defect reproduces from the committed
  code, the fix is minimal and correctly placed, the regression is byte-faithful
  to production and fails against the old code, and no other instance of the
  defect exists in the schema block.
- **Rebuilt release: proceed.** Build under exact Node 22.23.2 from the new
  clean commit. The `release:build` gate runs `test:email-critical`, which
  includes `src/db.test.ts` — so from this commit onward the legacy-schema case
  is release-blocking, which is the right place for it.
- **Production activation retry: proceed**, repeating the full documented
  sequence rather than resuming a partial one: archive digest comparison,
  bundled verification, activation dry-run, the aggregate-only
  `SELECT COUNT(*) FROM pending_sends` zero-row preflight, the exact prompt
  switch (production prompts were restored to their pre-NC-009 state during
  rollback and must be re-applied), atomic activation, and health convergence
  on the new commit. If startup fails again, roll back and stop; do not retry
  a third time without a fresh diagnosis.
- **Single internal transport canary: still authorized, still unused.** Run it
  once, only after activation and health convergence, per
  `docs/RELEASE-INTEGRITY.md`. It remains transport and OAuth evidence for the
  activated release commit — not validation of the Party guard, the approved
  customer path, business logging, or inbox placement.

A green fresh-database suite is not what this approval rests on. It rests on the
committed code throwing `no such column: action_id` against the new fixture, the
corrected code passing against that same fixture, and convergence from fresh,
legacy, repeated, and partially-migrated starting states.
