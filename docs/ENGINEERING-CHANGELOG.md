# NanoClaw engineering changelog

This is the shared, append-only engineering and operations record for Claude
Code, Codex, and human collaborators. It records change evidence, not product
marketing.

Protocol: `docs/CHANGE-PROTOCOL.md`

## Unreleased

### NC-20260815-006 — Refuse to run a release from inside the release, and say which knowledge tree agents read

- Date: 2026-08-15T20:35Z
- Owner/client: Claude Code
- State: ready_for_review — typecheck clean; 2290 of 2291 tests pass under the
  pinned Node 22.23.2. The one failure (`cnpc-prompt-contract`) and two
  playwright-core collection errors are pre-existing on that branch and fail
  identically with these changes stashed. Not built, not deployed, not
  live-verified.
- Commit/PR: `d1d9cf7` on `codex/chaos-lifecycle-release`, the branch production
  release `84607fd` was cut from and the only branch that tracks
  `src/release-integrity.ts`. `codex/continuity-reconciliation` carries this
  register entry only.
- Change class: C2 — a startup refusal plus documentation; no schema, migration,
  or external effect.
- Affected systems: `src/release-integrity.ts`, `src/index.ts` (startup log),
  `src/release-integrity.test.ts`, `src/webhook-server.test.ts` and
  `src/cnpc-webhook.test.ts` (health fixtures), `docs/RELEASE-INTEGRITY.md`,
  `docs/MINION-FRAMEWORK.md`.
- Trigger: a 2026-08-15 session spent hours on a Sales agent that kept quoting
  pre-approval ICF accreditation copy, and concluded — wrongly — that agents read
  knowledge from the pinned release snapshot, because the daemon runs
  `~/.local/share/nanoclaw-releases/<commit>/dist/index.js` and that directory
  contains a `knowledge/` tree frozen at build time. It then rsynced the
  repository's knowledge into the release directory, which changed nothing any
  agent reads.
- What is actually true: `PROJECT_ROOT = process.cwd()` (`src/config.ts:24`), the
  launchd `WorkingDirectory` is the operational checkout per Activation step 7,
  and `expandPath()` resolves a relative mount `hostPath` with `path.resolve` —
  so `store/`, `groups/`, `data/`, every relative mount, and both `learn_lesson`
  and `route_lesson` writes all land on the checkout. Four groups (chief,
  mailman, inbox, sales) declare the knowledge mount absolutely as
  `~/dev/NanoClaw/knowledge/agents/{group}` and were never ambiguous. The real
  cause of the stale answers was the one already fixed the same day: the
  `set -e` abort in `tools/validate-knowledge.sh` had been skipping the
  copy-to-agents step since 2026-08-12, so the per-agent `KNOWLEDGE.md` copies
  had not been refreshed.
- The release's `knowledge/` tree is transport payload — the archive carries the
  tracked runtime inputs — and nothing reads it. It is, however, a convincing
  decoy: it has plausible content and a frozen mtime, and it is what a debugger
  finds first when the daemon's argv points into the release directory.
- Applied: `verifyRuntimeRelease()` already asserted `codeRootMatchesRelease` —
  the code root must BE the verified release. This adds the mirror: it now also
  returns `stateRoot` (the working directory) and calls the new
  `assertStateRootSeparation()`, which throws when the working directory is the
  release directory or nested inside it — the misconfiguration that would make
  the wrong diagnosis correct, and which otherwise fails silently by serving a
  frozen database and a frozen knowledge tree. Both roots are on `/health` and
  named in the startup log line.
- The separation check is gated on `requireManifest`, matching the sibling
  code-root check. A development run has its `dist/` inside the checkout, so the
  two roots coincide legitimately; a release whose two roots coincide is either
  an in-place build on the production checkout or a `WorkingDirectory` pointed
  at the snapshot, and `docs/RELEASE-INTEGRITY.md` already forbids both.
- One existing test moved from an in-place topology to a deployed one (separate
  checkout and release directories), because the fixture has to model the
  deployment the guard enforces. Four cases added: both roots reported, refusal
  when the working directory is the release, refusal when nested inside it, and
  a sibling path (`<release>-operational`) that a naive string-prefix check
  would have rejected.
- Docs: `RELEASE-INTEGRITY.md` gains a "Working directory boundary" section and
  its code-root paragraph now states both directions; `MINION-FRAMEWORK.md`
  states that editing the repository is what changes what an agent reads.
- Not done: the release directories on mini-claw still hold their inert
  `knowledge/` copies, including the `knowledge.bak-20260815-1435` backup from
  the rsync. Left in place deliberately — deleting files inside an activated
  release is a deployment action, and the guard plus the docs remove the reason
  anyone would read them.

### NC-20260815-005 — Rename the roster tabs and reorder the tab strip

- Date: 2026-08-15T21:25Z
- Owner/client: Claude Code
- State: complete — applied and verified against the live spreadsheet, including
  a live pipeline run writing to the renamed tabs. Deployment not applicable:
  the change is sheet data and titles, read at runtime.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; began at `b66bc80`.
- Change class: C4 — the tab title is the payment-routing key.
- Affected systems: seven tab titles and 133 `Product Map` rows in the Student
  Roster; new `tools/contador/rename-roster-tabs.cjs`.
- Trigger: the owner asked to retire the MCQ name, drop the `" Roster"` suffix
  ("they are all kinda rosters"), and move rosters to the head of the tab strip
  with services and reference tabs at the end. This was blocked until
  NC-20260815-002 removed the `endsWith(' Roster')` dependency in exam routing.
- Applied: `ACC Roster`→`ACC`, `PCC Roster`→`PCC`, `ACTC Roster`→`ACTC`,
  `Mentor Coaching Roster`→`Mentor Coaching`, `MCQ Roster`→`MCS`,
  `CSS Roster`→`CSS`, `Practitioner Series Roster`→`Practitioner Series`.
  Strip order is now ACC, PCC, ACTC, Mentor Coaching, MCS, CSS, Practitioner
  Series, Prep Exam, Attendance, Feedback, Sales, Name Map, Product Map.
- `Prep Exam`, `Sales` and `Product Map` keep their names: those three are
  hardcoded in `process-payment.cjs` and cannot be renamed without a code change.
- The retitle and the 133-row `Product Map` rewrite are issued as **one Sheets
  batchUpdate**, which is atomic — there is no window in which the map points at
  a name no tab has. Reordering follows as a second batch because moving a sheet
  shifts the others. The script refuses to start if a rename target already
  exists or if the rewritten map would name a non-existent tab; that guard fired
  on the first run against the `(not a student)` sentinel, which occupies the
  tab column but names no tab, and is now exempted explicitly.
- Verification at 2026-08-15T21:20Z: all **132 distinct mapped products** were
  resolved through the deployed `resolveRosterTargets` against the renamed
  sheet — 0 targets pointing at a missing tab, 0 at a missing column. Exam
  routing still pairs a program tab with `Prep Exam` (`ACC Exam Prep` →
  `ACC → Exam Prep, Prep Exam → ACC Exam Prep`), which is precisely what the
  old suffix test would have broken. Row counts survived intact across all 13
  tabs (MCS 149, ACC 44, Prep Exam 56, Product Map 152). Three real payments
  were then replayed end to end and wrote successfully to `Mentor Coaching`,
  `CSS`, and — for the supervision session — nowhere. Pre-change `Product Map`
  snapshot kept in the session scratchpad.

### NC-20260815-004 — Stop the double-recording and the shell-mangled product names at source

- Date: 2026-08-15T21:05Z
- Owner/client: Claude Code
- State: deployed_unverified — live on the Mini, exercised against real payments
  by replay, but no genuinely new Checkout purchase has run through it yet.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; began at `b66bc80`.
- Change class: C4 — the live payment pipeline and the revenue record.
- Affected systems: `tools/contador/process-payment.cjs`,
  `tools/contador/process-payment.test.ts`, three `payments` rows, three `Sales`
  rows, and three untracked Syncthing conflict files.
- **Fix 1 — a purchase is now one row.** Checkout raises
  `checkout.session.completed` (cs_…) and `payment_intent.succeeded` (pi_…);
  keyed on their own ids they read as two payments, which produced $4,986 of
  double-counted revenue. Both halves know the payment-intent id — the session
  carries it as `payment_intent` — so that is now the identity a payment is
  stored under, and whichever event arrives second updates the first one's row.
  Lookup also accepts the event's own id, so a row written before this change is
  adopted in place rather than duplicated.
- **Fix 2 — the shell no longer eats product names.** The Postgres write built a
  single shell command with the values inline, so the SHELL expanded them before
  psql ever saw them: `($999/mo ×4)` became `(99/mo ×4)`, `($500/mo)` became
  `(00/mo)`, `$9` and `$5` being read as positional parameters. The same
  interpolation would have *executed* a product name containing backticks or
  `$(…)`. Values now pass as psql variables referenced by `:'name'`, and
  `execFileSync` removes the shell. Two details worth recording: psql does
  **not** interpolate variables for `-c` (it returns a syntax error), so the
  script is fed on stdin via `-f -`; and `sqlEscape` was deleted rather than
  left lying around to invite the next concatenated query.
- **Fix 3 — found only by running it, not by testing it.** Two further defects
  surfaced once both halves shared a row:
  - The poorer event degraded the row. The payment-intent half carries "Unknown"
    and no product id, and would overwrite what the checkout event recorded.
    Both stores now refuse: a `CASE` guard on the Postgres upsert and a
    read-before-write guard on the sheet.
  - Even so, a live replay showed the intent half still landing on the `Sales`
    catch-all — "Unknown" matches no Product Map row, so it missed the
    not-a-student sentinel. The intent branch now resolves its product from the
    originating checkout session. That needed two calls, not one: Stripe caps
    `expand` at four levels and `data.line_items.data.price.product` on the list
    endpoint is five, so it silently returns nothing.
- Data repaired: `payments` ids 239, 259, 293 replayed through the fixed
  pipeline, restoring `($999/mo ×4)` and `($500/mo)`. Ids 267 and 284 match the
  same pattern but were **deliberately left alone** — `MCS Advanced
  Accreditation Mentor Coaching — Installment (/mo)` genuinely carries no price
  in its Stripe name, confirmed against the Payment Log, which is written before
  the shell step and was therefore never affected. Three stale `Sales` rows were
  removed: the PaymentIntent halves for Wahida Saeedi, Thamer M Alessa and Dora
  Vanourek, all three already correctly on `Mentor Coaching Roster`. `Sales` is
  now 7 rows, every one a genuine Plutio invoice.
- Also removed: three untracked Syncthing conflict copies of `src/index.ts`
  (identical to each other, dated 2026-07-28) on both machines. **A claim in
  NC-20260815-003 that these reached the build and test globs was wrong** —
  `tsconfig.json` excludes `src/**/*.sync-conflict-*`, `.gitignore` and
  `.stignore` cover them, and `src/index.ts:1231` skips them at runtime. They
  were stale cruft, not a hazard; one copy is archived in the session scratchpad.
- Verification at 2026-08-15T21:00Z: 27 focused tests (up from 17), full suite
  **2,063/2,063** on the Mini under pinned Node 22.23.2, the same two suites
  failing to load only for Codex's absent migrations 114/115. The upsert was
  rehearsed against a temp table inside a rolled-back transaction for all three
  arrival orders — checkout-then-intent, intent-then-checkout, and adoption of a
  legacy cs_-keyed row — each yielding one row with the product preserved.
  psql's `:'var'` quoting was separately proved to store `$999`, `O'Brien`,
  `$(whoami)` and backticks as literal text. Then exercised live against real
  payments: a checkout event and its payment-intent twin both resolved to the
  same single row, the intent half reported "kept richer product name" and
  "skipped (not a student)", and three `$`-bearing replays restored the correct
  names with `payments` unchanged at 247 rows.
- Open: every proof so far is a replay of an existing payment. The next
  genuinely new Checkout purchase is the live confirmation.

### NC-20260815-003 — Remove the four double-recorded Stripe payments from both stores

- Date: 2026-08-15T20:45Z
- Owner/client: Claude Code
- State: complete — applied and read-back-verified in both stores. Deployment is
  not applicable: this is a data repair, executed once against production.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task began at
  `b66bc80`.
- Change class: C4 — deletes rows from the revenue record.
- Affected systems: the Payment Log sheet, `nanoclaw_business.payments`, and a
  new `tools/contador/dedupe-checkout-payments.cjs`.
- Cause: a Stripe Checkout purchase raises two events —
  `checkout.session.completed`, carrying the real product name and its `prod_`
  id, and `payment_intent.succeeded`, carrying only a generic description. Both
  were ingested. The upsert dedup is keyed on Stripe id, and the halves carry
  different ids, so it cannot see that they are one payment. Every affected row
  follows that shape exactly: the `cs_live_` row has product and `product_id`
  populated, the `pi_` row has neither.
- The two stores had diverged, so each needed a different repair — and the
  earlier claim in NC-20260815-001 that both carried all four duplicates was
  wrong. Corrected by direct row lookup before acting:
  - `payments` held **both** halves of all four: $4,986 over-counted. The four
    `payment_intent.succeeded` rows (ids 269, 231, 71, 114) were deleted and the
    checkout halves kept.
  - The Payment Log held both halves for only **two**: Thamer M Alessa (rows
    196/197) and Denise Cole (rows 18/19), so $1,688 over-counted. Those two
    duplicate rows were deleted.
  - For Wahida Saeedi (row 156) and Dora Vanourek (row 56) the Payment Log had a
    **single** row, and it was the PaymentIntent half — the only record of a real
    payment. Deleting those would have erased revenue. They were kept and their
    degraded product names corrected in place: "Individual Mentor Coaching" →
    "ACC Renewal Mentoring", "Unknown" → "PCC Credential Mentoring".
- Safety properties of the script: dry-run by default; the Postgres `DELETE`
  carries both `event_type = 'payment_intent.succeeded'` and an `EXISTS` check
  for the surviving checkout twin, so a re-run after the twin is gone deletes
  nothing rather than removing the last record of a payment; sheet edits are
  applied before deletions and deletions run bottom-up, because a deletion
  shifts every row beneath it and would invalidate pending row numbers.
- Rollback captured before any write: the eight Postgres rows at
  `/tmp/payments-dedupe-rollback-20260815.txt` on the Mini, and the six Payment
  Log rows in the session scratchpad.
- Verification at 2026-08-15T20:40Z: Postgres reports 0 PaymentIntent halves
  remaining, 4 checkout halves kept, **0 cs/pi duplicate pairs anywhere in the
  table**, 247 rows total. The Payment Log reports both duplicates absent, both
  renames in place, 395 rows, gross $272,701.40. The dry run's predicted actions
  matched the applied actions line for line.
- No unit test accompanies this script, unlike NC-20260815-002. It is a
  once-executed data repair over four enumerated payments whose evidence is the
  production read-back above; a test over its hardcoded pair list would assert
  the fixture, not the behaviour.
- **This will recur and was not fixed here.** Nothing suppresses
  `payment_intent.succeeded` when the same purchase already arrived as
  `checkout.session.completed`, so the next Checkout purchase duplicates again.
  A durable fix means recording the underlying payment-intent id when handling
  the checkout event and upserting on it, so the later PaymentIntent event
  updates that row instead of inserting a second one. That is a payment-pipeline
  change and needs its own task.
- Noted in passing, not addressed: `src/` contains three Syncthing conflict
  copies of `index.ts` (`index.sync-conflict-20260728-*.ts`). They predate this
  work, but they are the same active-sync mechanism documented under
  NC-20260815-002, and they sit in a directory the test globs and build reach.

### NC-20260815-002 — Roster tabs become renameable, and non-enrolment products stop reaching the Student Roster

- Date: 2026-08-15T20:15Z
- Owner/client: Claude Code
- State: deployed_unverified — the changed script is live on the Mini and both
  changes are verified against the live Product Map by exercising the exported
  function directly, but no real Stripe payment has flowed through it yet. The
  first supervision or exam-prep payment is the live verification.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task began at
  `b66bc80`.
- Change class: C4 — edits the live payment pipeline that writes the roster and
  the Payment Log.
- Affected systems: `tools/contador/process-payment.cjs`, new
  `tools/contador/process-payment.test.ts`, `vitest.config.ts` (adds
  `tools/**/*.test.ts`), and seven sentinel rows in the Product Map.
- Trigger: NC-20260815-001 could not perform the owner's requested tab renames,
  and its removal of supervision rows from the `Sales` catch-all would have been
  undone by the next payment.
- Change 1 — exam routing no longer depends on tab names. `:602` classified a
  program roster as `m.tab !== 'Prep Exam' && m.tab.endsWith(' Roster')`. The
  suffix test made exam routing depend on a naming convention: renaming any tab
  emptied `programTabs`, which disables `resolveExamRouting` entirely and writes
  every exam-prep buyer to **both** the program roster and `Prep Exam` instead
  of one of them — silently, with no error. Twelve `Prep Exam` map rows pair
  with a program roster, so it would have fired immediately. Now classified as
  `m.tab !== 'Prep Exam'`, which is what the check always meant.
- Change 2 — a data-driven not-a-student rule. A Product Map row whose tab
  column is the sentinel `(not a student)` marks a delivered service:
  supervision sessions, coaching sessions, anything nobody becomes a student by
  buying. Such a payment is still written to the Payment Log and Postgres, but
  reaches neither a credential tab nor the `Sales` catch-all. Declaring it in
  the sheet rather than in code means adding a product later needs one row, not
  a code change and a deploy.
- Testability: the routing decision was extracted into a pure exported
  `resolveRosterTargets()` plus `rosterTargetSummary()`. The script previously
  ran `main()` at import and exited on a missing argv/keys at module scope, so
  importing it fired the whole Stripe → Sheets → Postgres pipeline as a side
  effect; those three now run only under `require.main === module`. CLI
  behaviour is unchanged and was re-checked both ways.
- Applied to the Product Map: `Individual Supervision - Single Session`,
  `Group Supervision - Single Session`, `Public Group Supervision`,
  `Public Group Coaching Supervision`, `Group Supervision Subscription`,
  `Bronze Supervision Subscription`, `Gold Supervision Subscription`.
  **`5x Sessions` was deliberately excluded**: its Stripe name says nothing
  about what the sessions are and it carries only Heartbeat offer metadata, so
  suppressing it could hide a real student. It has never sold, and leaving it
  off means it lands on `Sales` for manual triage — the safe default.
- Verification at 2026-08-15T20:10Z: 17 new focused tests, including a
  parametrised regression that asserts program-tab classification survives the
  renames `ACC`, `MCS`, `Mentor Coaching`, and `Practitioner Series`. On the
  Mini under the pinned Node 22.23.2 the focused suites pass 31/31 and the full
  suite passes **2,053/2,053 tests**; two suites fail to load only because
  Codex's uncommitted migrations 114/115 are absent from that clone, which
  predates and is unrelated to this change. On the Studio the full suite cannot
  run — `better-sqlite3` is built for Node 22 (ABI 127) and Homebrew Node there
  is 26 (ABI 147). End-to-end routing was then simulated against the live
  Product Map through the deployed function: supervision services resolve to
  "nowhere", Coaching Supervision Mastery still resolves to `CSS Roster`,
  `ACC Exam Prep` still resolves to both targets for exam routing, and
  `5x Sessions` still falls to `Sales`.
- **Deploy topology correction, discovered during this task.** `~/dev` is
  *not* paused for Syncthing as the operating notes claimed. The changed script
  was already byte-identical on the Mini **before** the `scp`, and a marker file
  written on the Studio appeared on the Mini in ~15 seconds. Consequences: a
  `tools/**/*.cjs` edit on the Studio is in production within seconds, with no
  build and no scp; and a rollback copy taken on the Mini *after* editing
  locally captures the already-changed file. The genuine rollback for this
  change is `git show HEAD:tools/contador/process-payment.cjs`, saved on the
  Mini at `/tmp/process-payment.cjs.rollback`
  (`b1165079fd5895faf2282445339d5f4b5532ea6e080028b3a3326ede56a4b1d0`, identical
  in both clones). `src/**` still requires a Mini build because production runs
  `dist/`.
- Not done: the tab renames themselves and the tab-strip reorder, which are the
  owner's next call now that they are safe; and `Prep Exam`, `Sales`, and
  `Product Map` remain hardcoded by name in this file, so those three tabs still
  cannot be renamed without a further code change.

### NC-20260815-001 — Student Roster: merge the duplicate mentor-coaching tab, add the coaching-supervision roster

- Date: 2026-08-15T17:55Z
- Owner/client: Claude Code
- State: blocked — every roster and Product Map change described here is applied
  to and read-back-verified against the live Student Roster spreadsheet, and
  deployment is not applicable to those: the change is data in a Google Sheet
  that `process-payment.cjs` reads at runtime, so it took effect on write. The
  task is blocked only on the owner's later request to drop the `" Roster"`
  suffix from tab names, which requires a code change and a Mini deploy first
  (see the blocker at the end of this entry). No NanoClaw code path changed, no build or restart is required,
  `process-payment.cjs` was not edited, and neither the Payment Log sheet nor the
  `payments` table was touched. The new `roster-cleanup.cjs` is an operator-run
  one-off, not wired into any cron or host path.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task began at
  `b66bc80`.
- Change class: C4 — the Student Roster is the shared financial/enrollment
  record trainers read, and this deletes a tab and rewrites the Product Map.
- Affected systems: Google Sheet `1bX0hvMgXyoVQXuHRjYfwmVrv9mN5W08jF4iB8LiZI70`
  (`Product Map`, `Mentor Coaching Roster`, `ICF Mentor Coaching`, `Sales`, new
  `CSS Roster`); new `tools/contador/roster-cleanup.cjs` and
  `tools/contador/lib/sheets-client.cjs`; toolbox `shared/stripe`
  `list-products` / `get-product` gain a read-only `--account` argument.
- Trigger: the owner reported that `Mentor Coaching Roster` and
  `ICF Mentor Coaching` hold the same set of products and must be merged, and
  that coaching-supervision training has no roster at all even though Stripe
  sells Coaching Supervision Mastery.
- Three defects were behind that, all of which hide paying students:
  1. `Product Map` had no header row, but `process-payment.cjs` discards row 1
     unconditionally (`filter((r, i) => i > 0 …)`), so the first mapping was
     dead. Row 1 was `ICF Mentor Coaching — ACC Renewal (Installment $500/mo)`,
     which is why that product also had to be repeated at the bottom to work.
  2. `ICF Mentor Coaching` was a second tab for the same three products as
     `Mentor Coaching Roster`, and its columns began at `ACC` rather than
     `Email`/`Name`. `process-payment.cjs` writes `newRow[0]=email`,
     `newRow[1]=name`, then `newRow[colIndex]=date`; with `colIndex` 0 the date
     overwrote the email. Laura Smith's row had lost `laura.smith@calabr.com`.
  3. Coaching Supervision Mastery had no Product Map row, so both buyers fell
     through to the unmapped-product `Sales` catch-all.
- Applied: inserted a real `Product Map` header; repointed and de-duplicated the
  `ICF Mentor Coaching` rows onto `Mentor Coaching Roster`; added the two
  unsold-so-far mentor-coaching permutations (`Earn PCC`, `Earn MCC`) and both
  Coaching Supervision Mastery permutations (`Inaugural`, `Regular`); created
  `CSS Roster` (`Email | Name | Coaching Supervision Mastery | Refunded |
  Joined`); recovered Laura Smith's email from the `Sales` row that recorded the
  same payment intact and merged her onto `Mentor Coaching Roster`; deleted the
  `ICF Mentor Coaching` tab; replayed the three now-mapped `Sales` rows onto
  their roster tabs and removed them from the catch-all.
- Product names in the map are byte-exact Stripe product names, confirmed
  against both Stripe accounts. The em dash, the `×`, and the thousands comma
  are significant: `process-payment.cjs` compares the whole string.
- Verification at 2026-08-15T17:50Z: pre-change snapshot of all four affected
  tabs captured before any write. After `--apply`, every mutated range was read
  back: `Mentor Coaching Roster` carries Laura Smith with her real address and
  `ACC Renewal=8/4/2026`; `CSS Roster` carries Chisato Nomoto (7/28/2026) and
  Jordan Mercedes (8/15/2026); `Product Map` is 141 data rows under a header,
  with no row targeting a non-existent tab and no blank tail; the tab list no
  longer contains `ICF Mentor Coaching`; `Sales` retains exactly the rows whose
  products are still unmapped. The script is dry-run by default and idempotent —
  the merge upsert and the `Sales` replay both target Laura Smith, and the
  second reported `ACC Renewal=8/4/2026 already set` rather than rewriting it.
- Follow-up at 2026-08-15T18:20Z, after the owner stated the governing rule:
  **mentor coaching and mentor coach training (MCS) are distinct products for
  distinct people.** `Mentor Coaching Roster` holds coaches *buying* mentor
  coaching toward their own credential; the MCS roster holds coaches *training*
  to become mentor coaches. A product name containing "Mentor Coaching" is
  therefore not evidence of which roster it belongs to.
  - That resolves the tab question left open above.
    `MCS Advanced Accreditation Mentor Coaching — Installment (/mo)` is
    training: 3 × $999 is the installment plan for the $2,997 / 71-hour MCS
    Standard Path (`knowledge/shared/KNOWLEDGE.md` line 190), and AAMC is that
    program's accreditation. Confirmed independently — both buyers' Stripe
    customer metadata carries `product=mcs-cohort-sept-thursday` /
    `mcs-cohort-sept-friday`, the same September cohort the two existing
    `Mentor Coach Training - September … Cohort` rows already map to
    `MCQ Roster` → `MCS Practicum`.
  - Applied and read back: the product now maps to `MCQ Roster` →
    `MCS Practicum`; Katy Stone (8/5/2026) and Jeremy Sieurac (8/10/2026) were
    replayed there off `Sales`. `Mentor Coaching Roster` still holds only the
    four mentor-coaching clients and no trainee; `MCQ Roster` holds no
    mentor-coaching client. The split is clean in both directions.
- Not done, and deliberately left for separate work:
  - `payments.product_name` is corrupted for any product whose name contains a
    `$`. `process-payment.cjs:730` interpolates `productName` into a
    double-quoted shell string passed to `execSync`, so the shell expands the
    amount: `($999/mo ×4)` is stored as `(99/mo ×4)` and `($500/mo)` as
    `(00/mo)`. The Sheets writes happen before that line and are unaffected, so
    the Payment Log is correct and the database is not.
  - Still unmapped and left on `Sales`: `Individual Supervision - Single
    Session`, and the eight Plutio invoice descriptions, which are sales-closed
    deals and belong on the catch-all by design.
- Second follow-up at 2026-08-15T18:45Z, after the owner's rule for the ACC
  case: a mentoring purchase belongs on a credential-program roster only if the
  buyer is in that program, not if they are an outside coach buying mentor
  coaching. The evidence showed the mapping was **inverted** in both directions:
  - Wahida Saeedi and Thamer M Alessa held `ACC Roster` → `Group Mentoring` +
    `Individual Mentoring` dates with **no** `Full Program`/`M1`–`M4` anywhere on
    the row, and their product is `ACC Renewal` — by definition a coach who
    already holds the credential. Not Level 1 students.
  - Meanwhile the *real* Level 1 and Level 2 program mentoring products
    (`Level 1: Group Mentoring`, `Level 1: Individual Mentor Coaching and
    Coaching Assessments`, `ICF Level 1: Group Mentoring`, and both Level 2
    equivalents) were **unmapped entirely** and fell to `Sales`. Edward Utz —
    who holds M1 through M4 — had his 8/3/2026 Group Mentoring sitting on the
    catch-all.
  - Applied: dropped the two `ACC Renewal Mentoring` → `ACC Roster` rows; added
    the five real program-mentoring mappings; moved Wahida and Thamer to
    `Mentor Coaching Roster` → `ACC Renewal` (Thamer was on no mentor-coaching
    roster at all) and cleared their `ACC Roster` mentoring cells; replayed
    Edward Utz onto `ACC Roster` → `Group Mentoring`.
  - The demotion is a move, not a delete: the destination is written and read
    back before the source cells are cleared, and it is refused outright if the
    student holds any coursework column — so the owner's rule is enforced by the
    script rather than by the accuracy of a hand-written list.
  - Verified: both demoted rows now show no dates on `ACC Roster`; Edward Utz
    retains M1–M4 plus his Group Mentoring; `Mentor Coaching Roster` holds five
    clients; `Sales` is down to 13 rows.
- **Bookkeeping defect found while resolving the above — not a roster problem
  and not fixed here.** Four payments were ingested twice, once as the Checkout
  Session and once as its own PaymentIntent. The upsert dedup is keyed on Stripe
  ID and the two halves carry different ids, so it cannot catch this.
  - The two stores are affected differently, and an earlier statement in this
    entry that both carried all four duplicates was wrong. Corrected by direct
    row lookup on 2026-08-15T20:25Z: **Postgres `payments` holds all eight rows
    ($4,986 over-counted). The Payment Log sheet holds only two of the four
    pairs — Thamer M Alessa (rows 196/197, $1,499) and Denise Cole (rows 18/19,
    $189), so $1,688 over-counted there.** For Wahida Saeedi (row 156) and Dora
    Vanourek (row 56) the sheet has a single row, and it is the PaymentIntent
    half — so those two are not a revenue error at all, but they carry the
    degraded product name ("Individual Mentor Coaching", "Unknown") instead of
    the real one from the checkout session.
  - `talessa@gmail.com` 2026-05-20 $1,499 — `cs_live_a1Y9FM…` "ACC Renewal
    Mentoring" + `pi_3TZCAC…` "Individual Mentor Coaching"
  - `wahida.saeedi@roche.com` 2026-06-10 $1,499 — `cs_live_a1YuRV…` + `pi_3Tgk0Q…`
  - `doravanourek@gmail.com` 2026-07-24 $1,799 — `cs_live_b1AA5G…` + `pi_3TwaKU…`
  - `denise@clarionpointpartners.com` 2026-08-05 $189 — `cs_live_b126Rq…` + `pi_3U1Auo…`
  - Confirmed against Stripe's ledger: `list-balance-transactions` for
    2026-06-10 returns exactly **one** $1,499 charge
    (`txn_3Tgk0QRnZI4gH1uA0W8xRcIY`), not two. So this is duplicated recording,
    not duplicated money — $4,986 of phantom revenue across the four.
  - This also explains every remaining oddity on `Sales`: the two `Individual
    Mentor Coaching` rows and the two `Unknown` rows are the PaymentIntent
    halves of purchases already recorded. They were left in place rather than
    deleted, because removing them would hide the double-count while the Payment
    Log and `payments` still carry it.
  - Owner confirmed each of the four at 2026-08-15T18:55Z: Thamer M Alessa and
    Wahida Saeedi are ACC mentor coaching, Dora Vanourek is PCC mentor coaching,
    and Denise Cole is a supervision *session* — explicitly **not** Coaching
    Supervision Mastery. Read back against the live sheet: the first three are
    already on `Mentor Coaching Roster` under `ACC Renewal` / `ACC Renewal` /
    `PCC Credential`, and `CSS Roster` holds only Chisato Nomoto and Jordan
    Mercedes. No correction was required.
- Third supervision category identified, and ruled out of this spreadsheet
  entirely. Denise Cole's purchase is `Individual Supervision - Single Session`
  — *receiving* supervision. It is distinct from both categories already
  modelled: program-embedded supervision (`ACC`/`PCC`/`ACTC Group Supervision`,
  correctly filed on the credential rosters) and supervisor *training*
  (Coaching Supervision Mastery → `CSS Roster`).
  - Owner's rule at 2026-08-15T19:05Z: supervision sessions are delivered
    services, like coaching sessions — buying one does not make anyone a
    student, so they do not belong anywhere in the Student Roster. Their revenue
    still belongs in the Payment Log; only the roster spreadsheet excludes them.
  - Applied: both of Denise Cole's `Sales` rows removed (the
    `Individual Supervision - Single Session` checkout and its duplicate
    PaymentIntent half). `Sales` is now 11 rows: eight Plutio invoice
    descriptions plus the three remaining double-ingestion halves. Deletion is
    matched on Stripe id with the email asserted first, so a shifted row cannot
    be removed by mistake.
  - Eight standalone supervision-service products exist in Stripe and all are
    **deliberately** unmapped — this is the correct end state, not a gap to
    close later: `Individual Supervision - Single Session`, `Group Supervision -
    Single Session`, `Public Group Supervision`, `Public Group Coaching
    Supervision`, `Group Supervision Subscription`, `Bronze Supervision
    Subscription`, `Gold Supervision Subscription`, `5x Sessions`.
  - The removal does not stay done on its own. `process-payment.cjs` writes
    every unmapped product to the `Sales` catch-all, so the next supervision
    sale re-adds a row. Making it durable needs a not-an-enrolment list in that
    file so such products reach the Payment Log but never the roster
    spreadsheet — the same file, build, and Mini deploy as the `endsWith('
    Roster')` blocker below, so both belong to one follow-up task.
  - Latent hazard noted, not changed: the Product Map carries a bare
    `Group Supervision` → `PCC Roster` / `Group Supervision` row. No Stripe
    product has that exact name today, but `process-payment.cjs` falls back to
    the PaymentIntent *description* for the product name, so a manually created
    supervision payment described "Group Supervision" would be filed on the PCC
    credential roster as though the buyer were a Level 2 student — the same
    error class as the `ACC Renewal Mentoring` inversion fixed above.
- Fourth pass at 2026-08-15T19:25Z, on the owner's instruction to read the paid
  Plutio invoices behind the `Sales` rows and match them to products. A Plutio
  payment reaches Stripe with a per-deal description (`Invoice #tca-371-pl
  from …`), so it can never match a Product Map row and always lands on the
  catch-all. The product is on the invoice — and so is the student, who is
  **frequently not the payer**. The parenthetical in each `Sales` product string
  is the Plutio invoice `_id`, which is what makes these resolvable at all.
  - `tca-371-pl` — "MCS Practicum - Holly Coneway (Payment 2 of 2)". Holly
    Coneway was on no roster. **Added** → `MCQ Roster` / `MCS Practicum`.
  - `tca-387-pl` — "Oana Tue (Business Intervention Practices SRL) — AAMC
    Friday Cohort", $2,997 split 3 × $999. Oana Tue was on no roster.
    **Added** → `MCQ Roster` / `MCS Practicum`.
  - `tca-384-pl` — "Mentor Coaching Specialization - Foundations - U.S.
    Department of Justice". Billed to `tina.m.ashley@usdoj.gov`; the invoice
    reference names the actual participant, **Yoneko Riley-Barrow**
    (`yoneko.riley-barrow@usdoj.gov`), who was on no roster. **Added** →
    `MCQ Roster` / `MC Foundation` under her own address, not the payer's.
  - `tca-358-pl` — "MCS Practicum - Cohort A (Fridays AM) - Michelle Ambrose",
    billed to `justin.m.speaks.mil@socom.mil`. Michelle Ambrose is already on
    `MCQ Roster` / `MCS Practicum` (6/4/2026). No change needed; recorded here
    because the `Sales` row names the payer, not the student.
  - `tca-345-pl` — the Plutio invoice is literally named "test invoice": $1,
    billed to internal staff (`cherie@tandemcoaching.academy`), and still
    `status: overdue` in Plutio despite Stripe taking the $1. **Removed** from
    `Sales`; not a student.
  - Three could not be completed and are listed as open items below:
    `tca-347-pl` (Kristin Strunk), `tca-381-pl` (Jessica Velez), and
    `tca-386-pl` (eight unnamed seats).
  - `Sales` is now 10 rows. The remaining Plutio rows were deliberately left in
    place rather than cleared: they are this sheet's only record of which payer
    funded which student, and three of them are still unresolved.
- The three invoices that needed owner input were resolved at
  2026-08-15T19:40Z and applied:
  - `tca-347-pl` "Mentor Coaching - Kristin Strunk", line item "ICF Mentor
    Coaching Program - May 2026 Cohort (10 hours)" $1,499 in three parts. The
    **same contamination** already fixed for Wahida Saeedi and Thamer M Alessa:
    Kristin held `ACC Roster` `Group Mentoring` + `Individual Mentoring` dated
    4/24/2026 with no coursework column. The invoice names no credential; the
    owner confirmed **ACC Renewal**. Moved to `Mentor Coaching Roster` /
    `ACC Renewal` = 4/24/2026 and her `ACC Roster` mentoring cells cleared.
  - `tca-381-pl` "Level 1 Certification Program - Jessica Velez" $3,201, billed
    to MAPping Change LLC. Owner confirmed it sets `Full Program` = 7/24/2026;
    her existing `M1`/`M2` dates are untouched (the upsert only fills blanks).
  - `tca-386-pl` "Mentor Coaching Foundations - Group Enrollment (8 Seats)",
    ALLENATI PER L'ECCELLENZA SLU, $2,152.80 = 8 × $299 less a 10% group
    discount. The line item says "Individual enrollment invitations issued per
    participant upon payment" and names nobody, so the eight came from the
    owner. All eight added to `MCQ Roster` / `MC Foundation` = 8/6/2026:
    Silvia Tormen, Francesca Di Gioia, Barbara Muzzolon, Elisabetta Bartocci,
    Mauro Cavosi, Micaela Del Fabbro Arcopinto, Laura Virtuoso, Grazia Barone.
    The payer, `marco@allenatiperleccellenza.com`, is **not** among them and was
    correctly not added.
  - Verified by exact-email read-back: 8/8 seats present, `MCQ Roster` now 149
    students; Jessica Velez shows `Full Program` alongside her `M1`/`M2`;
    Kristin Strunk holds no dates on `ACC Roster` and appears on
    `Mentor Coaching Roster` under `ACC Renewal`.
  - Sponsor-paid enrolments are now a confirmed, recurring pattern rather than a
    one-off: four of the eight invoices (`tca-358-pl`, `tca-384-pl`,
    `tca-381-pl`, `tca-386-pl`) were paid by someone other than the student, and
    one covered eight students at once. Nothing in the Stripe payload carries the
    student identity, so no automated path can place these — they require reading
    the Plutio invoice, and for group enrolments an external participant list.
- Also still open: the training roster's tab is named `MCQ Roster`; MCQ is the
  retired name for MCS. The owner asked to rename it and to drop the `" Roster"`
  suffix from every roster tab, then reorder the tab strip. The rename is
  blocked on a code change — see below.
- **Blocker recorded for the requested rename.** `process-payment.cjs:602`
  classifies a matched tab as a program roster with
  `m.tab.endsWith(' Roster')`. Dropping the suffix makes `programTabs` empty,
  which disables `resolveExamRouting` entirely: every exam-prep buyer would then
  be written to *both* the program roster and `Prep Exam` instead of one of
  them, silently and with no error. Twelve `Prep Exam` map rows are paired with
  a program roster, so this is not hypothetical. The fix is one line — classify
  as `m.tab !== 'Prep Exam'`, which is what the check means — but it is an edit
  to the live payment pipeline and needs its own task, build, and Mini deploy
  before any tab is renamed. `Product Map`, `Sales`, and `Prep Exam` are
  likewise hardcoded by name in that file. `backfill-names.cjs` is rename-proof:
  it discovers tabs from live metadata and filters on the `Email`/`Name` header
  shape.
  - `process-payment.cjs` still hardcodes "skip row 1" instead of matching the
    header by name; the inserted header makes that correct today but does not
    make it safe.
  - Five contador scripts still carry their own copy of the Sheets JWT client
    that `tools/contador/lib/sheets-client.cjs` now provides. They are live
    payment paths and are not migrated as a side effect of a data cleanup.

### NC-20260810-002 — CNPC intake and bounded coach-matching control plane

- Date: 2026-08-11T00:40Z
- Owner/client: Codex
- State: validating — local and uncommitted; not migrated, registered, built,
  deployed, or live-verified. No dummy or real submission has been sent.
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task began at
  `0a39380`, and the shared branch advanced independently to `2e6fb70` during
  implementation for NC-20260810-001.
- Change class: C5 — public webhook, customer identity data, new agent behavior,
  and future email/contract/payment boundaries. Highest currently enabled
  operational class is C2 because this slice stores intake/match state and posts
  internal review only; all external actions are disabled.
- Affected systems: webhook archive/reaper/extractors, host CNPC intake and match
  result handlers, ordered PostgreSQL migration 115, CNPC group prompt and
  knowledge, runtime registration script, environment reference, project map,
  and CNPC runbook.
- Trigger: CNPC's EA manually transfers website applications to a Sheet, ranks
  coaches against a Word bench, cross-checks a separate availability form,
  drafts client/coach messages, coordinates chemistry calls, creates
  contract/payment work, and adjusts capacity. The owner wants Gravity Forms to
  flow through n8n to a CNPC minion with minimal intervention.
- Root cause: the manual process has no canonical operational roster or
  capacity ledger. The Word bench, public site, Plutio onboarding responses, and
  Plutio availability responses disagree. Intake, matching, pending chemistry
  load, signed/paid commitment, reporting, and external actions are also mixed
  across prose, forms, email, and a spreadsheet without durable idempotency or
  receipts.
- Outcome implemented locally:
  - public Gravity Forms-to-n8n route at
    `POST https://webhooks.tandemcoach.co/webhook/cnpc-coaching-intake`, with a
    dedicated ingress secret, a tracked one-way secret digest, and a
    capture-only first-dummy workflow that has no downstream connection;
  - exact private n8n-to-NanoClaw endpoint contract at
    `POST http://mini-claw:8088/hook/cnpc-coaching-intake`;
  - stable Gravity Forms form/entry identity and perimeter deduplication;
  - typed, length-bounded intake validation before archive/ack;
  - host-owned identity resolution, deterministic eligibility/pricing, and
    canonical intake persistence;
  - schema for coach roster, capacity snapshots, match versions/candidates,
    expiring chemistry soft holds, signed-and-paid engagement gating, and a
    hash/idempotency/receipt action outbox;
  - host-only active/capacity-bearing match pool; the model cannot add coaches;
  - strict model-result validation against intake ID, roster version, coach IDs,
    ranks, roles, scores, and reasons before match persistence;
  - CNPC minion behavior, privacy rails, and blocked external-action response;
  - registration script that stores the webhook secret only in ignored runtime
    state with mode `0600` and never prints it.
- Capture ingress deployment at 2026-08-11T01:56Z:
  - n8n 2.9.4 workflow ID `cnpc-coaching-intake` imported from the tracked
    capture-only configuration, published, and activated after the required
    container restart;
  - n8n `/healthz` returned `ok` and the CLI listed the exact workflow ID/name;
  - public no-secret preflight returned `401 unauthorized`;
  - public authenticated sanitized preflight returned `202`, `capture_only:
    true`, and the exact three submitted field names;
  - no NanoClaw, Slack, email, Plutio, coach-capacity, or client side effect was
    possible because the live workflow contains no downstream node.
- Gravity Forms mapping and normalized-ingress update at 2026-08-11T02:10Z:
  - sanitized form 1 entry 583 was received successfully and used only to map
    public field IDs; submitted values were not copied into source or docs;
  - the live `/apply/` form labels/options were reconciled to the captured IDs;
  - the workflow now allowlists the applicant, organization, coaching request,
    consent, and stable entry-identity fields and maps organization type,
    expense band, and coaching type through closed enums;
  - local executable contract validation passed authentication, required-field,
    consent, identity, and enum cases;
  - the updated workflow was imported in place, published, and restarted;
    `/healthz` returned `ok`, the workflow name was exact, a no-secret live
    request returned `401`, and a complete authenticated synthetic request
    returned `202`, `normalized: true`, and `mapping_version: gf-form-1-v1`;
  - normalized delivery remains disabled because the workflow still has no
    downstream node.
- Security: CNPC Plutio uses a separate future host-only credential namespace.
  The existing single-workspace reaper is not used. The credential disclosed in
  chat must be rotated before production. No credential, coach certificate,
  coach email, private client list, or raw form response was copied into source,
  prompts, tests, or continuity docs.
- Verification under Node 22.23.2:
  - `npm run typecheck` passes;
  - CNPC/extractor focused suite passes 5 files / 51 tests;
  - focused HTTP webhook suite passes 1 file / 37 tests with local ephemeral
    listener permission;
  - full root suite passes 155 files / 2,046 tests;
  - `npm run docs:continuity-check` and `git diff --check` pass.
- Deployment/migration: not performed. Migration 115 is unapplied; the CNPC
  Slack group/webhook are unregistered; no release artifact exists; production
  health and side effects are unverified.
- Required next step: obtain/create the dedicated `#gru-cnpc` Slack channel ID,
  rotate and set a new CNPC intake webhook secret, review/apply migration 115,
  register the group/webhook, build and deploy an immutable artifact, verify
  health/registration, then accept one sanitized dummy submission. Mailbox,
  named approvers, Plutio template discovery, and receipt-bound executors remain
  separately gated before any real client/coach communication.
- Rollback: before deployment, discard only the NC-20260810-002 source files and
  hunks. After migration, the additive tables/views can remain dormant; remove
  the runtime webhook/group registration to stop intake. Never drop tables after
  accepting a submission without first exporting/reconciling their rows.
- Documentation: `docs/CNPC-AUTOMATION.md`, `docs/PROJECT-MAP.md`,
  `docs/ACTIVE-WORK.md`, this entry, group prompt, and CNPC knowledge files.

### NC-20260810-001 — Practitioner Series CCE accreditation status is per course

- Date: 2026-08-10T20:40Z
- Owner/client: Claude Code
- State: deployed_unverified — the tandemweb half is deployed and confirmed live
  by fetch; the NanoClaw half is committed, pushed, and present on the Mac Mini
  production checkout through the existing `knowledge/` sync. What remains
  unverified is agent behavior: no container has been respawned against the
  corrected knowledge, so no Sales draft quoting the three approved courses has
  been observed. Artifact verification is not behavior verification.
- Commit/PR: NanoClaw `996ca14` on `codex/continuity-reconciliation` (14 files:
  the eleven agent copies, the shared master, sales `LEARNED.md`, and
  `facts/programs.yaml`), pushed to `origin`, never to the `qwibitai` upstream.
  tandemweb `eba3ec23c` merged to `main` as `2fcc2f829`, pushed, and deployed.
  The two continuity documents are committed separately and necessarily carry the
  concurrent procurement session's doc rows, which were already staged in those
  same files; that session's 31 non-documentation staged files were left alone.
  The NanoClaw knowledge commit does
  carry earlier uncommitted knowledge work that shared the same files and could
  not be split by path — the MCS Practicum corrections and the NC-20260729-002
  Coaching Supervision Mastery rewrite, both unmodified.
- Change class: C2 — knowledge/instruction writes that affect C3 agent email output
- Affected systems: all eleven agent knowledge copies, the shared knowledge
  master, and the sales learned-lesson override file. No code, schema, build, or
  runtime change.
- Outcome: agents state ICF CCE accreditation per Practitioner Series course.
  Running a Coaching Business, Coaching Tools Mastery, and AI for Coaches are
  quoted as approved; the remaining three are quoted as pending; Setting Up Your
  Coaching Practice is quoted with no CCE claim.
- Trigger: operator reported that Sales still treated every Practitioner Series
  course as accreditation-pending after ICF had granted three of them.
- Root cause: two independent defects.
  1. `knowledge/agents/*/KNOWLEDGE.md` carried a single blanket callout,
     "ACCREDITATION IS PENDING — ICF CCE accreditation is pending per course
     (not yet granted)", written before any approval landed. Tandemweb commit
     `56a57437a` ("ICF granted CCE for tools, business, and AI courses") never
     propagated into the knowledge base.
  2. `knowledge/shared/KNOWLEDGE.md`, regenerated 2026-08-08, had lost the entire
     `## Practitioner Series` section, because `generate-llms-full.py` emits no
     `practitioner-series*` piece into `llms-pieces/`. Propagation is a blind
     `cp shared → agents/*` in `validate-knowledge.sh --update`, so the next
     propagation would have deleted the section from every agent.
- Source of truth used: `~/dev/tandemweb/pages/practitioner-series/05-section-catalog.html`
  (2026-08-09) plus each course's hero, format, enroll, and FAQ sections.
- Files:
  - `knowledge/agents/{archivarista,booking,campanero,chief,contador,courses,inbox,mailman,procurement,sales,social}/KNOWLEDGE.md`
    — course table gains an explicit per-course `ICF CCE status` column; the
    blanket pending callout is replaced by an approved/pending/no-claim
    breakdown. Two accredited splits corrected against the live pages: Running a
    Coaching Business `14 CC + 26 RD` → `9 CC + 31 RD`, Coaching Tools Mastery
    `14 CC + 6 RD` → `13 CC + 7 RD`. Adds the per-course URLs, the differing
    guarantees (30-day money-back once approved, void on certificate issue,
    versus full refund if a pending course fails to earn its designation), and
    the ICF 16-hour Resource Development renewal cap.
  - `knowledge/shared/KNOWLEDGE.md` — the corrected `## Practitioner Series`
    section reinserted before `## Coaching Tools Library`, so the next
    propagation no longer erases it.
  - `knowledge/agents/sales/LEARNED.md` — Lesson 67 records the per-course rule;
    learned lessons override KNOWLEDGE.md on conflict.
- Verification: `npm run docs:continuity-check` passed. Every one of the eleven
  agent copies carries three approved rows and one per-course callout, and no
  blanket-pending statement remains in `knowledge/` or the group prompts. Ground
  truth was read from the tandemweb page sections, not from memory. No build,
  test suite, migration, deployment, or agent canary was run.
- Deployment/migration: not applicable — no artifact and no schema change. The
  knowledge files are read at container launch, so agents pick the change up on
  their next spawn.
- Rollback/recovery: revert these thirteen knowledge files.
- Documentation: this entry.
- Second increment, same date, on operator instruction:
  - Upstream generator fixed. `~/dev/tandemweb/tools/generate-llms-full.py`
    `PART_A_PAGES` gained a "Continuing Coach Education (CCE) Courses" divider
    and all eight practitioner-series pages (hub plus seven courses).
    `./tools/generate-llms-full.sh --no-scrape` regenerated 62 pieces (was 53):
    nine new `llms-pieces/part-a/` files, `llms-full.txt` 1601KB → 1735KB, and
    practitioner-series references in it rose from 5 incidental blog links to 82.
    The regen deletes no existing piece. The Practitioner Series section will
    therefore survive future `generate-knowledge.sh` runs. Local only in the
    tandemweb worktree — not committed and not deployed.
  - Pending CC/RD splits resolved by the operator, so the knowledge base quotes
    them again instead of withholding them: Career & Transition 14 CC + 6 RD,
    ADHD Coaching 15 CC + 5 RD, Systemic Coaching 16 CC + 4 RD, all 20.0 hours,
    all labelled "submitted", never "accredited". Applied to the eleven agent
    copies, the shared master, and Lesson 67.
- Both page-level errors were corrected and published on owner instruction the
  same evening. The hub catalog tile for ADHD Coaching went from
  `20 hrs · 14 CC + 6 RD` to `15 CC + 5 RD`; the visually identical Career &
  Transition tile beside it was already correct and was left alone. The Systemic
  Coaching page went from 30.0 hours / 25 CC + 5 RD to 20.0 hours / 16 CC + 4 RD
  across `01-section-hero.html`, `05-section-syllabus.html`, two FAQ answers, and
  four fields in the `meta.json` JSON-LD; video runtime (~26 h) and lesson counts
  were left untouched, since those describe content rather than claimed CCE
  hours. `pages/practitioner-series/preview-full.html` was deliberately not
  edited: it is a stale snapshot that still shows Coaching Tools Mastery as
  unapproved, and it is read by neither the generator nor the deploy, so a
  partial correction would only make it look current.
- Follow-ups: (1) `facts/programs.yaml` gained a `practitioner-series` entry in
  the same change, so this drift class is now covered — verified 0 findings
  against the current knowledge base and 3 against a deliberately regressed copy.
  (2) `pages/practitioner-series/preview-full.html` is stale and should be
  regenerated by whoever owns previews. (3) The 2026-08-15 regen is the first to
  exercise the new pieces; the model may rewrite the hand-written Practitioner
  Series section from page content, which would keep the facts but could drop the
  operating instructions in the callout. Sales Lesson 67 is the backstop, since
  lessons override KNOWLEDGE.md and the regen does not touch them.

### NC-20260809-004 — Request-first Sales response policy

- Date: 2026-08-10T03:21Z
- Owner/client: Codex implementer + Claude Code owner/reviewer
- State: ready_for_review — local and uncommitted; a local TypeScript build
  passed, but no release artifact was created or deployed and nothing is
  live-verified or outcome-validated
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`
- Change class: C2 — Sales prompt/procedure behavior plus isolated shared
  autonomy-marker recognition
- Evidence basis: the converged 30-day Sales audit (`NC-20260805-001`) found
  289 included work cycles, 105 substantive operator lines, and 81 reviewed
  drafts. Operator-held facts and record corrections were common; unrequested
  content clustered in old follow-ups; active-client cases could be ignored;
  and the deployed path lookup differed from the audited signal.
- Change: Sales now decides relationship, explicit current asks, answerability,
  and one of seven routes before selecting content. Review cards expose route,
  confidence, evidence-bounded relationship, ask provenance, answerability,
  abstentions, and justified additions. Program match and estimated deal require
  `TRANSACT` plus a verbatim at-most-15-word current-message `Route-Basis`.
  `LOW`/`HUMAN` cases use non-trackable `[SALES ESCALATION]` and prohibit a
  customer draft. ORIENT and follow-ups cannot invent commercial material.
- Path boundary: Chaos browsing-path lookup is disabled for customer-facing
  drafting and a supplied path signal must leave the response identical. It can
  return only through a separately authorized, blinded path-on/path-off
  evaluation after runtime/audit signal definitions converge.
- Shared-host boundary: `isDraftMessage` now recognizes anchored,
  case-insensitive, emphasis-tolerant canonical Sales headings, plus the exact
  historical `REVISED DRAFT FOLLOW-UP:` form as a recognition-only alias. It
  excludes quoted/inline echoes and bare support/client labels. Its follow-up
  backfill classifier uses the same grammar. Replay over 2,322 local Sales bot
  rows measured old 568 / final 568 / zero differences, so autonomy-report
  history does not drift from this change.
- Eval boundary: `evals/sales/request-first-cases.json` is tracked outside the
  read-write group mount. Nine synthetic cases cover all routes and key journey
  failures. The tests validate fixture/contract structure only; no response
  quality claim is made.
- Claude convergence: exact Sales-owner session
  `ae6931fb-c0e6-4714-9b81-ac8599a00f4f` returned `ACCEPT WITH CHANGES` in R1
  and R2, then `ACCEPT` in R3 after every in-bound finding was reconciled.
  Claude attested that the excluded dirty approval-rejection and Handling
  Approval blocks remained text-identical, but no pre-edit hash exists; current
  review hashes are `CLAUDE.md` `14f6dab...a662` and `WORKFLOWS.md`
  `089a565...0bec`.
- Verification: pinned Node 22.23.2 focused policy/prompt/ledger/mailman run 5
  files / 34 tests pass; final prompt pair 2 / 17 pass; root run passed 1,963
  tests and its 43 sandbox-permission failures then passed 43/43 in the two
  affected files (150 files / 2,006 tests accounted for). Typecheck, local
  TypeScript build, targeted formatting, schema/continuity check, and diff check
  pass.
- Local/live determination: no local NanoClaw/Gru/company daemon is registered
  with launchctl and enabled LaunchAgents do not point a NanoClaw service at this
  checkout. No production query/write, Mini sync, service restart, Slack post,
  email, release deployment, commit, or push occurred.
- Rollback/recovery: revert the four Sales prompt/support files, the isolated
  marker change/tests, prompt-contract test, and synchronized continuity text
  together. Reverting only the prompts or only marker recognition recreates a
  split policy surface.

### NC-20260809-001 — Host-owned grader output boundary, then live Heartbeat assignment grounding

- Date: 2026-08-09T20:44Z (P0.1/P0.2 A/A2); 2026-08-09T22:05Z (P0.2 R7)
- Owner/client: Claude Code implementer (R4, R7), Codex reviewer
- State: ready_for_review — implemented and uncommitted; NOT built into a
  release artifact, NOT deployed, NOT live-verified. No Slack post, Heartbeat
  write, certificate action, or database mutation occurred.
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`
- Change class: C2 - host message-path behavior for one group, plus a shared
  channel method, a shared config flag, and a group prompt contract
- Problem: the P0.1 gate validated one message at a time but nothing enforced
  it on the way to Slack, and three independent defects made the invariant
  ("a student must never reasonably infer grading was performed by AI")
  unenforceable in the live path. `SlackChannel.sendMessage` prefixes agent
  posts with `[grader]` at display time, AFTER the caller's text is validated,
  so every grade published a system tag directly above student-facing feedback.
  `routeAdoptedOutput` relayed a re-adopted container's raw final text with no
  suppression check at all. `suppressFinalText` requires `!threadTs` and is
  therefore a no-op for every `threadPerMessage` group, the grader included.
- Change: added `src/grader-delivery.ts`, the only path allowed to publish
  grader-authored text into the grader channel. It engages on verified IPC
  source `grader` AND resolved destination `grader`, serializes derive/check/post
  per thread, derives prior delivery structurally, calls `checkGraderOutput`,
  posts through dedicated strict Slack methods, and posts only rule codes on a
  block. Supporting changes: `src/db.ts`
  `hasDeliveredGraderStudentCopy`/`hasGraderOutputInThread` (whole-thread, no
  25-row window, independent of the mutable voice rules);
  `src/channels/slack.ts` `postGraderStudentCopy`/`postGraderOperatorNotice`
  (no prefix, no queue, no split, no lead-anchor derivation, rejects on
  disconnect/API error/missing timestamp, persists `from_group='grader'`);
  `src/ipc.ts` routing that fails closed when the boundary is absent;
  `src/types.ts` `suppressFinalTextInThreads` plus a shared
  `shouldSuppressFinalText` consulted by both final-text relays;
  `src/index.ts` bounded IPC-drain missing-output notice;
  `src/grader-output-gate.ts` shared verdict predicate, a 3,500-character
  absolute cap that clamps expanded mode, and operator-addressed block wording;
  `scripts/register-grader.ts` both suppression flags; and the
  `groups/grader/CLAUDE.md` two-message contract.
- Deliberately not done: `SendMessageOpts` was NOT extended with a strict-send
  flag. An optional flag on the shared `Channel` interface is silently ignored
  by any channel that does not implement it, which fails open. Dedicated
  `SlackChannel` methods leave every non-grader caller unchanged by
  construction rather than by review. Raw final assistant text is never
  host-wrapped or quoted; the missing-output notice is fixed host-authored text.
- Verification (pinned `/opt/homebrew/opt/node@22/bin/node` v22.23.2, matching
  `.nvmrc`): `tsc --noEmit` clean; `prettier --check "src/**/*.ts"` clean;
  focused run 7 files / 245 tests pass; full suite 145 files / 1,872 tests pass
  (baseline before this change was 142 files / 1,808 tests). `npm test` under
  the default Homebrew Node 26.6.0 produces 68 invalid `better-sqlite3`
  NODE_MODULE_VERSION 127-vs-147 failures in `src/db.test.ts`; that is the
  documented environment trap, not a regression.
- Not evidence of deployment: a passing suite and a clean typecheck are not a
  release. The live grader `registered_groups.container_config` row still reads
  `suppressFinalText=0`, so threaded final-text suppression is inert in
  production until that row is updated during deployment.
- Follow-up: Codex review of the composite diff; owner decisions on
  blocked-submission service level and P0.5 retroactivity; corpus-level blind
  human review remains the release gate this deterministic boundary does not
  replace.

#### Addendum 2026-08-09T20:45Z — independent Codex composite review

- P0.1 source acceptance is complete. Codex found one fail-open edge after R4:
  normal/adopted final-text suppression depended on current registration flags.
  Both relays now suppress unconditionally when the authoritative group or
  sidecar source folder is `grader`; config flags remain defense in depth and
  Sales/Inbox behavior is unchanged.
- The grader prompt now states explicitly that the first verdict line is the
  operator's Approve-vs-Retry marker and only the feedback body is pasted into
  Heartbeat. This removes the R4 prompt/report contradiction.
- Independent pinned Node 22.23.2 verification: focused 7 files / 247 tests,
  full 145 files / 1,874 tests, `tsc --noEmit`, Prettier, schema self-test,
  documentation continuity, and `git diff --check` all pass.
- Still not built, deployed, or live-verified. No Slack/Heartbeat/certificate or
  runtime database mutation occurred. Corpus-level blind human review is still
  required before release claims about voice quality.

#### Addendum 2026-08-09T21:08Z — P0.2 A/A2 and Claude R6

- Claude R5 found that P0.1 still accepted `PASS\nfeedback` and that one old
  thread output suppressed every later missing-output notice. The gate now
  requires `VERDICT\n\nfeedback`, counts normalized Unicode code points while
  enforcing the transport's UTF-16 ceiling, never rewrites, and the prompt states
  the same copy contract. Missing-output checks use a per-run timestamp watermark.
- Claude R6 found and Codex fixed a whitespace-only-body fail-open that could
  post a verdict with no feedback and then mark the thread delivered. R6 accepted
  Codex's rejection of name-prefix aliases and the unsynced derivative index.
- Codex did not accept silently optional identity context, artificial timing
  delay, or uncalibrated contrast/reuse thresholds. Those remain design and
  measure-only evaluation work; identity-contract design is next.
- Final local verification under pinned Node 22.23.2: six focused files / 237
  tests, full 145 files / 1,877 tests, typecheck and TypeScript formatting pass.
- No Slack/Heartbeat/certificate/runtime database/build/deployment action.
- R7 (2026-08-09T22:05Z) — second problem, same invariant: the grading pack's
  `assignments/` tree holds SNAPSHOTS taken at course-onboarding time, and a
  read-only Heartbeat inventory proved three of the six Foundation-program
  written assignments have since diverged in grading-relevant ways (M2 changes
  the client profile from two to five years of experience; M4 adds an
  observation-form link and reframes the form as an observation structure rather
  than an ACC scoring exercise; M5 says evaluation-feedback where the snapshot
  says developmental-feedback). Grading a student against an assignment they
  were never given is, from the student's side, indistinguishable from grading
  badly. Separately, nothing prevented feedback from opening by addressing a
  different student by name — the loudest available signal that no person read
  the submission.
- R7 change: the host now resolves and supplies the current assignment before
  each grading run and refuses student-facing output for any run it cannot
  account for. New `src/grader-submission-context.ts` (grading root from the
  registered `additionalMounts` entry, size-capped registry load,
  first-two-nonblank-line header parse, exact normalized label match,
  discriminated no-submission/resolved/blocked result);
  `src/grader-assignment-fetch.ts` (one read-only GET per submission, 15s
  timeout, 512 KB transport cap, 60,000-character content cap, exact lesson-id
  and canonical-title equality, non-blank content, never logs or persists
  content or the credential); `src/grader-run-context.ts` (bounded in-memory
  per-thread proof of a resolved submission, 30-minute TTL, plus the
  heartbeat/snapshot-only/unavailable prompt blocks, XML-escaped including the
  assignment body); `src/grader-salutation.ts` (explicit-greeting and own-line
  vocative arms; exact full-name or exact first-token match; no prefix aliases,
  no nickname inference, no arbitrary capitalized-word scanning).
  `src/grader-output-gate.ts` gains `expectedStudentName` and
  `salutation-name-mismatch`; `src/grader-delivery.ts` gains `submissionContext`
  and `missing-submission-context`, so a run with no host record cannot stage
  student copy while operator-only output is unaffected; `src/ipc.ts` supplies
  the context; `src/index.ts` establishes it before `runAgent`.
  `~/dev/grading/registry.json` carries a `heartbeat` object on the six mapped
  assignments and `validate.py` enforces its shape, id/title uniqueness, and
  global label unambiguity, covered by a new `test_validate.py`.
  `groups/grader/CLAUDE.md` documents the context block, rewrites Step 3 to
  grade from the live assignment and hold on contradiction, and adds Critical
  Rule 8 — compacted to stay at exactly 200 lines with every prior rule intact.
- R7 authority boundary: `HEARTBEAT_API_KEY` injection remains `courses`-only
  (`src/container-runner.ts:551`); the grader container receives no credential,
  no courses repository, and no publishing tool. The credential is read through
  `readEnvFile`, which does not write `process.env`, so it never reaches a child
  process. Assignment content is never persisted or logged; only a 16-character
  SHA-256 prefix leaves the fetch module.
- R7 self-review caught a fail-open in its own first wiring: a thread can be run
  more than once, and a context registered by an earlier run was still live
  inside its TTL when a later run in the same thread failed to establish one, so
  the later run's output would have been authorized by a resolution that was not
  its own. `establishGraderRunContext` now clears the thread's context before
  deciding, so every run either registers its own or leaves the thread with none.
- R7 verification (pinned Node 22.23.2, absolute path): focused 10 files / 342
  tests; full suite 149 files / 1,982 tests, up from 145 / 1,877; `tsc --noEmit`
  clean; `prettier --check` clean; schema sanitizer self-test passed;
  documentation continuity passed; `git diff --check` clean. Grading repository:
  `test_validate.py` 26/26 (run as plain callables — pytest is absent from the
  system python3); `validate.py` reports one pre-existing unrelated
  `calibration/acc-bars-standard.json` error from an untouched code path, proved
  pre-existing by running the two new checks against both the committed and the
  working registry (0 errors on each).
- R7 response-shape gap was unresolved inside that round, then closed by Codex's
  read-only checks against all six registered lessons: each response carried the
  exact requested ID, registered title, and nonblank content. Claude R8 withdrew
  R7 Finding 1. No student/submission data was read and no Heartbeat write occurred.
- R7 evidence:
  `docs/reports/NC-20260809-001-GRADER-RECALIBRATION-CLAUDE-RESPONSE-R7.md`.
  No build, deploy, Slack post, Heartbeat write, certificate action, runtime
  database mutation, commit, push, or live API call occurred, and no student
  data was accessed.

#### Addendum 2026-08-09T22:17Z — live read proof and independent R7 hardening

- Codex used the existing courses repository's read-only Heartbeat tool against
  all six registered Foundation lesson IDs. Every response carried the exact
  requested ID, registered title, and nonblank content. This closes R7's API-
  shape uncertainty. M1/M3/M6 matched the grading snapshots; M2/M4/M5 had the
  documented grading-relevant drift. No student/submission data was read and no
  Heartbeat write occurred.
- Independent review found that malformed present `heartbeat` metadata was
  silently dropped by the runtime loader, which could convert a mapped
  Foundation assignment to stale `snapshot-only` grading after a partial sync.
  The loader now rejects the entire registry in that state. The Python label
  normalizer now mirrors JavaScript lowercase instead of full casefolding, and
  the prompt's discrepancy gate now explicitly requests an operator-only flag.
- Independent pinned Node 22.23.2 verification after correction: focused 10
  files / 343 tests; full 149 files / 1,983 tests; typecheck, TypeScript
  formatting, schema sanitizer, documentation continuity, and diff checks pass.
  Grading validator unit checks pass 27/27; the full validator still reports the
  pre-existing unrelated `calibration/acc-bars-standard.json` error.
- Still uncommitted in NanoClaw, unbuilt, undeployed, and not live-verified in a
  grader thread. No Slack post, Heartbeat write, certificate action, or runtime
  database mutation occurred. Claude R8 closure review is pending.

#### Addendum 2026-08-09T23:03Z — per-turn proof and R11 acceptance

- Claude R8 accepted the live response proof but found that thread-keyed context
  could still let overlapping or adopted warm-container turns borrow another
  run's authority. R9 then verified the exact two-line file-root rejection path;
  R10 withdrew a container-static ID design and required one host-minted ID per
  Claude turn; R11 independently returned `ACCEPT` on the implementation.
- Initial and piped grader turns now carry distinct UUIDs. The runner isolates
  UUID-bearing IPC files one per turn, leaves deferred files on disk unacked,
  rewrites MCP config before each `claude --print`, and preserves the exact
  prompt/UUID through OAuth rotation and API-key fallback. The MCP server stamps
  the ID outside the model tool schema. Host delivery requires exact ID, grader
  destination, and thread; missing, malformed, expired, replayed, restarted, or
  adopted proof therefore supplies no student context and fails closed.
- Warm follow-ups clone the verified assignment synchronously so the global
  Slack loop never awaits Heartbeat. The clone is registered only after a pipe
  write succeeds and is refused after ten minutes from the original live fetch.
  Existing exact-run entries remain through the 30-minute TTL so late output
  from turn N is not invalidated when turn N+1 starts.
- Final local verification under pinned Node 22.23.2: root typecheck clean;
  agent-runner typecheck clean; focused post-hardening 3 files / 51 tests; full
  root suite 149 files / 1,992 tests; full runner 4 / 27; `git diff --check`
  clean; grader prompt exactly 200 lines. Grading repository live-mapping checks
  pass 29/29 and its authority change is committed locally at `f19fa39`.
- Deployment ordering is mandatory: rebuild and activate the runner image first,
  verify `run_id` on a safe grader IPC payload, then activate the host-side
  requirement, with no missing-ID grace period. No release was built or deployed
  in this task and no Slack/Heartbeat/certificate/runtime database write occurred.
- Code acceptance is not a human-voice claim. The blind, submission-in-hand,
  control-seeded corpus review remains unmet and is the release gate: students
  must never reasonably infer or assume AI grading.

#### Addendum 2026-08-10T09:12Z — visible PASS grows and actionable silence diagnostics

- PASS feedback now separates a real developmental point into paragraph two,
  while a PASS with no substantive grow remains one paragraph. The canonical
  voice and all 14 generated packs agree exactly; the grader prompt uses the
  same conditional rule and contains no conflicting shape instruction.
- Silent runs now receive one of four host-derived, content-free reason codes.
  Malformed or unresolved submission roots get the exact two-line-root recovery;
  internal-only results are no longer mislabeled as no agent result.
- Claude R12's five required corrections were implemented and Claude R13 returned
  `ACCEPT`. Regression coverage pins the two-paragraph unit, every reason branch,
  root recovery, prompt wording, and the restored 200-line prompt invariant.
- Pinned Node 22.23.2 verification: 151 files / 2,018 tests pass; typecheck,
  continuity, and diff checks pass; runner remains 4 files / 27 tests; 14 grading
  packs are current and pack-builder tests pass. No Slack, Heartbeat, certificate,
  build, deployment, or runtime mutation occurred in this correction.

### NC-20260805-001 — Sales journey and request-first methodology audit

- Date: 2026-08-10T01:08Z
- Owner/client: Codex + Claude Code/Opus validator
- State: ready_for_review; analysis/design converged on the non-path change
  surface, path-conditioned behavior held pending signal repair and blind eval
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`
- Change class: C1 — read-only behavior, journey, and architecture audit;
  documentation and PII-free coded artifacts only
- Scope: sealed 2026-07-10 through 2026-08-09 Sales Slack snapshot, current
  Sales prompt/workflow/knowledge/lesson/runtime authorities, operator
  corrections, and a read-only Chaos pre-inquiry journey join. No prompt,
  runtime, database, schedule, deployment, Slack/email, commit, or push change.
- Corrected corpus: 1,345 messages; 297 reconstructed work cycles, 289 included;
  327 observed customer-facing drafts (319 in included cases); 105 substantive
  operator lines (94 in included cases, 11 unlinked); 81 hand-reviewed drafts
  for unrequested content; 71 PII-free Chaos identities linking to 145 cases.
- Converged findings: current authorities put program matching before the
  request and force commercial fields onto 66 paid-client/organization-buyer
  cases. Of 71 cases with substantive operator input, 45 required an
  operator-held fact and 18 a record correction; 48/289 cases retrospectively
  needed a fact or system record. Direct drafting is better than the pooled R2
  audit claimed (56/122 reviewed drafts approved unchanged; 6/71 reviewed
  non-follow-ups had unrequested content), while the historical follow-up
  generator was the concentrated expansion defect (8/10 reviewed follow-ups).
- Temporal correction: standard-card Email/To compliance moved 1/88 to 39/48
  to 77/78 and cross-thread splitting moved 51/51 to 12/29 to 0/50 across the
  three implementation eras. Follow-up cards stopped after 2026-07-31. These
  are not all current drafting defects; why follow-ups stopped remains unknown.
- Delivery contract: approval must create `approved_pending_send`, suppressing
  duplicate redrafting while remaining visible until Gmail-confirmed receipt,
  explicit human cancellation, or human-reviewed failure. Approval alone never
  retires work.
- People-path result: Chaos matches 71/141 reconstructed identities and 145/289
  cases, but only 71/289 cases have a journey contemporaneous with that inbound.
  Twenty-two of 71 matched identities visited two or more service families;
  linked reviewed acceptance was 31/74 versus unlinked 25/48 (Fisher exact
  p=0.353), providing no evidence that browsing should widen a response.
- Path blocker: the analyzed signal unions devices, excludes post-inquiry
  events, and groups titles into coarse families. Deployed Pass 0 selects one
  newest visitor row, includes post-inquiry events, emits raw paths, and sorts
  formatted counts lexicographically (`9x` before `11x`). Path context should
  not alter customer-facing tokens until those divergences are repaired and a
  blinded path-on/path-off eval passes.
- Recommended implementation order: deterministic host changes first — closed
  send obligation, host-resolved relationship, draft-marker/ladder alignment,
  broader typed-drop parser, non-approving acknowledgement, implement-or-delete
  the documented approval-card rejection path, and recap suppression — then
  conditional commercial fields, first-class abstention, and typed lesson
  precedence. Pass 0 remains recorded, non-binding eval context.
- Collaboration: exact Claude session
  `ae6931fb-c0e6-4714-9b81-ac8599a00f4f`; R2-R5 cost USD 51.30. R2 and R3 were
  rejected for coding and report/artifact defects; R4 reconciled the Slack and
  operator corpora; R5 reproduced 94 path checks with zero mismatch and issued
  the integrated convergence verdict.
- Verification: independent JSON parsing confirms 289 unique uniform case rows,
  105 unique uniform operator-line rows, 71 unique uniform path rows, zero
  basic state-invariant violations, and no basic email/phone/URL patterns in
  durable JSONL. Raw card-era counts and Fisher exact p=0.352588 were
  independently recomputed. Documentation continuity and whitespace checks are
  required before handoff.
- Artifacts: `docs/reports/NC-20260805-001-SALES-JOURNEY-AUDIT-CLAUDE-RESPONSE-R4.md`,
  `docs/reports/NC-20260805-001-SALES-JOURNEY-AUDIT-CLAUDE-RESPONSE-R5.md`,
  the R4 case/operator JSONLs, the Codex Chaos path report/JSONL, and the
  convergence state.
- Follow-up: owner selects the first implementation slice and resolves the
  watchdog window, lesson authority/contested clusters, conditional card,
  card-validation disposition, follow-up cessation, and Pass 0 disposition.

### NC-20260809-002 — Procurement opportunity-to-outcome audit

- Date: 2026-08-09T20:05Z
- Owner/client: Codex + Claude Code owner review
- State: ready_for_review; two-round Codex/Claude audit converged, production
  state not refreshed, implementation not authorized
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`
- Change class: C1 - read-only architecture, operations, and source-strategy
  audit; documentation artifacts only
- Finding: Procurement is split between a prompt/browser/direct-SQL Bonfire
  lane that can show activity without completeness or closure, and a safer
  migration-114 CaleProcure/email review kernel that was dark-deployed,
  disabled, and ends at a human decision without dispatching acquisition,
  assessment, proposal, submission-receipt, or outcome work.
- Additional converged finding: the exact-resource Procurement email router is
  implemented but both real caller paths skip it when taxonomy
  `auto_archive=true`; tracked Procurement knowledge marks both RFP/RFQ labels
  as auto-archive. The likely behavior is label-and-archive without a minion
  handoff, pending read-only live taxonomy verification. The documented `.env`
  gate keys are also inert for policy code that reads `process.env`, while the
  tracked service definitions configure none of them.
- Evidence: current source, migration, tests, history, group procedures, safe
  local snapshot/framework metadata, and official source authorities were
  reconciled in
  `docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CODEX-INDEPENDENT.md`.
  The focused Node 22.23.2 suite passes 7 files / 81 tests; those tests validate
  the narrow safety boundary, not portal completeness or business outcomes.
- Recommendation: preserve and extend migration 114, pause or shadow the
  legacy scan, prove one CaleProcure opportunity through a named decision and
  proposal-ready/pass outcome without submission, then add SAM.gov's API and
  official state alert feeds based on measured incremental qualified yield.
- Collaboration: after explicit owner authorization, R1 and the defect-focused
  R2 ran in exact Claude Procurement session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`. Claude accepted Codex's caller-level
  email correction and partial-write/schema findings; Codex independently
  verified Claude's post-`process`, scheduler, configuration, and reconciliation
  findings. All 23 material findings converge in
  `docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CLAUDE-RESPONSE-R2.md`.
  Reported Claude cost: USD 12.669568 across both rounds.

### NC-20260805-002 — Lead #1029 exact recovery and host-owned execution regression

- Date: 2026-08-05T18:50Z
- Owner/client: Codex
- State: validating; customer recovery is Gmail-confirmed, permanent source fix
  continues under isolated `NC-20260804-003` and is not deployed
- Commit/PR: pending on `codex/nc-20260804-003-host-owned-email-bytes`
- Change class: C3 — exact approved customer-email recovery and focused
  regression evidence
- Incident: Sales omitted Action
  `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d` from the Mailman handoff; Mailman then
  changed approved literal ampersands to `&amp;` in both subject and body. The
  immutable hash guard held before execution or Gmail.
- Recovery: read-only ledger, approval-card, and Gmail-Sent preflight proved no
  prior attempt. Exact approved-card recovery passed the existing host action,
  hash, recipient, Party, content, Gmail, receipt, and Slack boundaries. Gmail
  confirmed message/thread `19fd3438954b40fe` at
  `2026-08-05T18:50:46.831Z`; the originating Sales thread has the mechanical
  receipt. Do not replay this action.
- Verification: the isolated source fix now includes this exact unthreaded,
  missing-Action-ID, entity-mutated first-response shape. Its pinned Node
  22.23.2 email-critical gate passes 18 files / 492 tests; typecheck,
  documentation continuity, and diff whitespace checks pass. No activation
  occurred during validation.
- Additional recurrence: Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` later repeated the same undeployed
  path. Mailman omitted the Action-ID and entity-escaped one approved body
  ampersand while preserving recipient and subject. Preflight proved no prior
  send; exact-card recovery produced Gmail-confirmed message/thread
  `19fd44fd031fc6f1` at `2026-08-05T23:43:48.546Z`, with the receipt in the
  originating Sales thread. The existing regression covers this narrower
  body-only mutation; do not replay the action.

### NC-20260802-001 — MrGru grader file delivery is host-owned and idempotent

- Date: 2026-08-02T16:28Z
- Owner/client: Codex
- State: ready_for_review
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`
- Change class: C5 — new container-to-host file capability and external Slack
  side-effect boundary
- Affected systems: container MCP, per-group IPC attachments, host IPC watcher,
  Slack root/file persistence, shared toolbox, Heartbeat grading procedure
- Trigger: the enabled Brave file input could not be driven through the browser
  extension bridge, making each Heartbeat attachment require a native picker and
  visual Slack inspection. MrGru already has `files:read` and `files:write`; no
  OAuth change was required.
- Implementation: `send_grader_file`/`slack_file_message` is accepted only from
  the registered main group or `chief`, fixes the target to `grader`, validates
  real path, regular-file type, 25-MB ceiling, size and SHA-256, then snapshots
  the bytes. A request-bound pending receipt precedes Slack; completion records
  the root timestamp. Pending/uncertain and completed duplicates never repost.
- Slack contract: post one clean root, upload the source artifact into its
  thread with `filesUploadV2`, then persist an inline-readable copy so the grader
  wakes only after upload success. Failed upload attempts best-effort delete the
  file-less root and do not wake the grader.
- Operator surface: shared `slack/post-grader-file` stages only from macOS temp
  roots or Downloads over the existing authenticated SSH route to the production
  Mac Mini, fails closed until its compiled runtime advertises support, emits
  official IPC, waits for the receipt, and returns the root timestamp. The
  Heartbeat skill now prefers this path and uses visual Slack/native picker only
  as a fallback.
- Registration drift closed: `scripts/register-grader.ts` now tracks the
  already-documented one-root/one-container behavior, instant mechanical
  processing line, and 30-second grader idle timeout. Re-registration therefore
  preserves five-way batch concurrency and releases one-shot warm capacity
  instead of silently reverting to channel serialization and the 20-minute
  global idle default.
- Verification under the direct Node 22.23.2 executable: root typecheck passes;
  focused suite passes (3 files / 88 tests); full suite passes (141 files /
  1,777 tests); independent agent-runner build and tests pass (3 files / 22
  tests); targeted Prettier and `git diff --check` pass; continuity check passes
  with 29 active/ready rows and changelog entries. Toolbox registry JSON, shell
  syntax, discovery, and an isolated temp-root queue dry run pass. Deployment,
  daemon restart, OAuth mutation, and live Slack canary have not occurred.

### NC-20260731-003 — One real Node 22 release replaces the production hand patches, and per-lead status lines anchor by entry id

- Date: 2026-07-31T18:05Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production now runs a compiled artifact, not hand patches
- Change class: C3 — production runtime, release process, Slack threading
- Affected systems: Mac Mini runtime and launchd, NanoClaw `dist/`, Slack
  outbound threading, `~/dev` source propagation
- Trigger: `rescueUnhandedSends` was built and tested but undeployed; production
  `dist/` was hand-patched; per-lead status lines still posted at channel root.
- Root cause of the deployment blockage: the `~/dev` Syncthing folder is paused
  on the Mac Studio, so the Mini's `src/` had been frozen at `a6e4b13` since
  before NC-004. The Mini's Syncthing reported `idle / needFiles: 0`, which is
  true of a receiver whose sender is paused and therefore proves nothing. Any
  `npm run build` on the Mini would have silently reverted NC-004 — the reason
  the fixes were hand-patched in the first place.
- Second blocker, found in pre-flight rather than in production:
  `verifyRuntimeRelease()` asserts an exact `.nvmrc` Node match on both the
  manifest-present and manifest-absent paths, with no escape hatch. The Mini ran
  Node 25.8.2 against a `22.23.2` pin. The previously deployed `index.js`
  predated the guard, so nothing had failed yet; a fresh build would have
  crash-looped, and launchd throttling would have kept it down.
- Fix: installed Node 22.23.2 at `~/.local/node/22.23.2`, repointed
  `com.nanoclaw.plist` at it, rebuilt `better-sqlite3` for that ABI, reconciled
  the Mini's `src/` with the Studio worktree, and deployed one compiled artifact.
  Verified by rebuilding on the Mini and hash-comparing to the deployed tree —
  identical, so the host can now rebuild without reverting anything. Import
  pre-flight over all 125 modules reported zero unresolved specifiers; restart
  produced `runs = 1` and an empty error log.
- Also shipped by this release: the NC-004 (P1-1, P1-2, P2-1) and NC-002 (P1-1,
  P1-2) remediations, which had been fixed in source on 2026-07-30 but were
  stranded behind the stale `dist/`.
- Threading change: `deriveLeadEntryRef` reads the pipeline entry id out of a
  per-lead status line and `lead-email-resolver.ts` resolves it to the lead's
  address, so "Lead #611 …" and "[NO ACTION] Entry #85 …" join the same
  `lead:{email}` thread as the card and the send. Narrow by construction: the id
  must open the message and the message must name exactly one entry, because a
  false merge is worse than no merge. Resolver failures are logged and drop the
  anchor rather than the message. 140 files / 1,760 tests pass.
- Record correction: the Mac Mini does **not** sleep overnight. 61 days uptime,
  no sleep/wake events, and 1,590 Gmail pushes processed between 00:00 and 08:00
  — 279 during the hour it was reported down. The unreachability is
  `macmini-eth.kudinov.com` → `192.168.1.50` on `en8`, which holds a `/32`
  netmask on a `/24` LAN and answers ICMP but not TCP. Use `192.168.1.171` or
  `100.115.115.206`. `en8` carries the default route and was left alone.

### NC-20260731-002 — The host lead anchor outranks an agent-supplied thread_ts

- Date: 2026-07-31T16:18Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries a hand-patched `dist/channels/slack.js`
- Change class: C2 — operator-facing Slack threading; no external send path
- Affected systems: Slack outbound threading for lead-bearing messages
- Trigger: for Entry #871 sales replied in the lead's thread with
  "[draft updated]" and then posted the updated draft into the channel.
- Root cause: `sendMessage` consulted the host-derived lead anchor only when the
  caller passed no `threadTs`. The agent passed one — `1785510996.909199`, a
  timestamp that does not exist, apparently retyped from the `ts` attributes in
  its prompt (the thread root is `…909209`; the operator's in-thread reply ends
  `.509199`). Slack silently posts an unknown `thread_ts` to the channel. The
  anchor table held the correct root the whole time.
- Fix: a derived `leadKey` now outranks an agent-supplied `threadTs`, extending
  the principle already stated in `lead-thread-key.ts` to the last place the
  agent could override the host. `opts.threadKey` is agent-supplied and keeps its
  old, lower precedence, so non-lead threading is untouched.
- Files: `src/channels/slack.ts`, `src/channels/slack.test.ts`,
  `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,720 tests** passes; format passes. The regression test was proven to fail
  against the old precedence before being accepted; the pre-existing
  "explicit threadTs wins over threadKey" test still passes unmodified.
- Deployment: `dist/channels/slack.js` hand-patched, daemon restarted
  (pid 20788). Backup `/tmp/slack.js.bak-*`. Still not a build from source — the
  Mini's `src`/`dist` divergence (NC-20260730-005) remains the blocking issue.
- Rollback/recovery: restore the backup and restart.
- Follow-up: per-lead status lines with no labelled address field still post at
  channel root, because the anchor can only be derived from an email address.
  Resolving `Lead #<id>` / `Entry #<id>` to the party email host-side would close
  it, at the cost of a business-DB lookup on the Slack send path.

### NC-20260731-001 — One wake rule for cross-group handoffs, at the single consumer

- Date: 2026-07-31T15:33Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries a hand-patched `dist/db.js`
- Change class: C3 — controls whether an approved customer email is ever composed
- Affected systems: host message loop (`getNewMessages`), IPC handoff routing,
  every channel that delivers a cross-group handoff
- Trigger: `[HANDOFF: mailman→sales]` for Entry #871 routed and posted to
  `#gru-sales` at 15:16:36Z; sales never spawned and no draft was produced.
- Root cause: `getNewMessages` — the only query that can start a container —
  excluded every `is_bot_message = 1` row. A cross-group handoff is host-authored
  and therefore a bot row, so it could not wake its target. It only rode along as
  context when something else happened to wake that group.
  `NC-20260730-005` patched this for non-Slack targets by flipping the flag in
  `ipc.ts`; Slack targets self-persist via `channels/slack.ts:1203` and were
  still broken. Every channel has its own persistence path, so a per-producer fix
  cannot hold.
- Fix: the rule now lives once, at the consumer. Human/inbound wakes; a group's
  own echo never wakes it (the 2026-07-05 noop-container swarm guard); a row
  whose `from_group` differs from the channel's owning folder wakes the target.
  Unknown owner keeps the previous conservative behaviour. `src/index.ts` supplies
  the jid→folder map; `src/ipc.ts` reverts to a uniform `is_bot_message: true` so
  the flag stops encoding routing semantics.
- Files: `src/db.ts`, `src/index.ts`, `src/ipc.ts`, `src/db.test.ts`,
  `src/ipc-handoff-echo.test.ts`, `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,719 tests** passes; `npm run format:check` passes. New cases cover
  wake-on-cross-group, no-wake-on-own-echo, no-wake-on-untagged-host-noise,
  cursor advance past suppressed rows, and the unknown-owner path.
- Deployment: `dist/db.js` hand-patched with the rule expressed purely in SQL (a
  correlated `registered_groups.folder` lookup), validated against live rows
  before restart, daemon restarted (pid 2469). Two minutes of observation showed
  one container spawn — no spawn storm. Backup `/tmp/db.js.bak-*`. Still not a
  build from source; the Mini's `src`/`dist` divergence from NC-20260730-005 is
  unresolved.
- Operator-authorized data change: one `store/messages.db` row flipped to wake
  sales for Entry #871 before the fix shipped; the card posted at 15:26:45.
- Coordination: `src/ipc-handoff-echo.test.ts` gained a concurrent Codex
  assertion on the producer flag. It was relaxed, not removed — the behaviour is
  still covered by the consumer rule and the new `db.test.ts` cases.
- Rollback/recovery: restore `/tmp/db.js.bak-*` and restart to return to the
  suppressed-handoff behaviour; revert the five source files to undo the fix.
- Follow-ups:
  1. Per-lead status lines (e.g. "Lead #611 …", "[NO ACTION] Entry #85 …") carry
     no labelled address field, so `deriveLeadThreadKey` yields nothing and they
     post at channel root instead of the lead's thread. The Entry #871 draft card
     itself threaded correctly. Resolving `Lead #<id>` / `Entry #<id>` to the
     party email host-side would close it without trusting the agent.
  2. A routed handoff that produces no target spawn within one poll interval
     should alert on its own — carried over from NC-20260730-005 and now twice
     demonstrated.

### NC-20260730-006 — Observable email handoffs and provenance-bearing releases

- Date: 2026-07-31T01:52Z
- Owner/client: Codex; Claude review pending
- State: validating
- Commit/PR: uncommitted composite worktree on
  `codex/continuity-reconciliation` @ `0a39380`; the previously staged
  `NC-20260730-003/004` slice is preserved in the index
- Change class: C5 — email-send observability plus fail-closed production
  startup, artifact provenance, service runtime, and deployment contract
- Affected systems: Sales/Mailman prompt contract; host IPC and message loop;
  SQLite pending-send schema; watchdog; daemon health; build/release scripts;
  exact Node pin; launchd/setup; container code source; architecture, security,
  project map, schema reference, active work, and release runbook
- Outcome:
  - Sales is instructed and contract-tested to process one approved lead per
    turn, make the typed `send_message` call, emit no final prose after a
    successful handoff, and omit rather than invent a missing Thread-ID;
  - the host records the durable handoff and actual Mailman process start as
    separate stages, alerts once when the latter never occurs, and retains the
    later Gmail-confirmed-send expectation;
  - a PostgreSQL-realistic bigint-string regression exercises the stored
    non-bot handoff, Mailman-visible SQLite read, and real Gmail handler path;
  - the Mailman-start join uses both source group and recipient so concurrent
    workflows to one address cannot satisfy each other;
  - production startup verifies the complete compiled file set, exact build and
    runtime Node `22.23.2`, manifest schema, and operator-pinned full commit
    before initializing external systems;
  - `/health` includes the verified non-secret release identity;
  - a clean-commit builder produces a manifest and checksummed archive; the
    independent verifier rejects compiled tampering, malformed metadata,
    unlisted bundle files, duplicate/escaping inventory paths, release-manifest
    disagreement, wrong Node, and wrong expected commit;
  - container skills and agent-runner source resolve from
    `NANOCLAW_CODE_ROOT`, allowing immutable release code with the established
    operational checkout as working/state directory.
- Declared residual: writable live group workspaces are not yet
  cryptographically bound to the archived prompt copies. Deployment must
  compare/copy reviewed prompt files and record hashes; separating immutable
  instructions from writable group output remains follow-up architecture.
- Verification under Node `22.23.2`:
  - root typecheck passes;
  - focused email/release/setup set passes **11 files / 122 tests**;
  - complete serial suite passes **138 files / 1,715 tests** outside the
    restricted sandbox required by its loopback/IPC tests;
  - independent agent-runner build and **3 files / 22 tests** pass;
  - repository TypeScript format check and both staged/unstaged diff checks
    pass;
  - documentation continuity passes **25 active/ready rows / 25 changelog
    entries** after updating the exact-Node assertion.
  - production TypeScript build passes, and `npm run release:build` was
    deliberately exercised against this dirty review worktree: it refused
    before compilation/packaging with the required clean-commit error.
  - the full-suite webhook test's guessed fixed-port range collided twice with
    macOS listeners (`rapportd` owns `49152`); tests now request a
    kernel-assigned ephemeral port. The webhook suite passes twice
    independently (**35/35**) and the following full suite is clean.
- Deployment/migration: not yet performed. The SQLite columns are additive at
  daemon initialization. No customer email, Procurement gate, healer action,
  production database write, service restart, or external message occurred
  during this implementation/validation boundary.
- Rollback/recovery: restore the prior service pointer and reviewed Sales prompt
  files, then verify the prior full commit and channels. Retain additive SQLite
  columns. Full procedure: `docs/RELEASE-INTEGRITY.md`.
- Next: obtain Claude's adversarial review of the composite dirty-worktree
  boundary; reconcile findings; commit the already staged Procurement slice and
  this email/release slice without unrelated knowledge/copier/renderer changes;
  build the clean artifact; deploy and live-verify the exact commit.

### NC-20260730-005 — Approved sales email reaches the customer again

- Date: 2026-07-30T22:47Z
- Owner/client: Claude Code + Codex reconciliation
- State: validating
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries two hand-patched `dist/` files
- Change class: C3 — customer-email execution path; one email delivered
- Affected systems: Gmail IPC recipient verification, Gmail search
  authorization, host IPC handoff routing, `store/messages.db` (three
  operator-authorized mutations), Mac Mini daemon (two restarts)
- Trigger: an approved draft for Lead #962 produced only `[SEND NOT OBSERVED]`
  with no `[EMAIL BLOCKED]`, no quarantine entry, and no explanation.
- Outcome:
  - `gmail_send` with a `lead_id` works again. Party IDs are `bigint`, returned
    by node-postgres as strings, and were compared with `!==` against the
    agent's JSON number — so `11119 !== '11119'` blocked every send with the
    reason "claimed party 11119 does not match host-resolved party 11119".
    Regression from `NC-20260729-004`; blocked the whole outbound sales path
    because `groups/mailman/OUTBOUND-EMAIL.md` requires `lead_id` on every call.
  - a `sales→mailman` handoff can now wake mailman. The host stored it with
    `is_bot_message: true` while `getNewMessages` — the only loop that starts a
    container — filters bot rows, and the Gmail channel's `sendMessage` is a
    no-op. Handoffs were invisible to the spawn loop and only rode along when an
    unrelated inbound email woke mailman anyway. Pre-existing; masked by inbound
    volume until a quiet mailbox exposed it.
  - a bare-address `gmail_search` is normalized to `from:X OR to:X` instead of
    being quarantined; queries carrying operators or extra terms are still
    refused, and the executed query now equals the authorized one.
- Test-integrity fix: `gmail-ipc-handlers.test.ts` mocked party IDs as JS
  numbers, which is why 1,661 tests passed while production could not send. The
  mock now reproduces bigint-as-string. Against the original code the corrected
  suite fails 6 tests; it previously failed none.
- Files: `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-policy.ts`, `src/ipc.ts`,
  `src/gmail-ipc-handlers.test.ts`, `src/gmail-ipc-policy.test.ts`,
  `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **134 files /
  1,695 tests** pass; `npm run format:check` passes; `git diff --check` passes.
  The regression test was proven to fail against the original code before being
  accepted.
- Deployment: both fixes applied to the Mac Mini's compiled `dist/` by hand and
  the daemon restarted (pids 61600, 65516). **Not** a build from source — see
  the integrity note below. One customer email delivered at 22:42:02Z (message
  `19fb5311a98be747`), body byte-identical to the approved draft and recovered
  from `store/messages.db` rather than regenerated; interaction logged and the
  `pending_sends` expectation cleared by the confirmed send.
- Integrity problem, open: production `dist/` does not correspond to the Mini's
  `src/`. `verifyPartyRecipient` exists only in the compiled artifact, and
  `npm run build` on that host would silently revert the entire
  `NC-20260729-004` Gmail boundary. Both fixes therefore had to be applied to
  `dist/`. Backups at `/tmp/gmail-ipc-handlers.js.bak-*` and `/tmp/ipc.js.bak-*`.
- Rollback/recovery: restore the two `dist/` backups and restart to return to
  the blocked-send state; revert the five source files to undo the fixes.
- Follow-ups:
  1. Reconcile the Mini's `src/` with reviewed source and redeploy from a real
     build. Until then no host rebuild is safe.
  2. Sales emitted the handoff as final assistant text instead of calling
     `mcp__nanoclaw__send_message`, so nothing routed at all — the original
     stall. It made a correct call for a different lead 16 seconds earlier in
     the same run. Prompt hardening (one lead per approval turn; handoff must be
     a tool call, never prose; never a `Thread-ID` placeholder) is unowned.
  3. `[SEND NOT OBSERVED]` remains the only operator-visible signal when the
     failure is upstream of the Gmail handlers. A routed handoff that produces
     no mailman spawn within one poll interval should alert on its own.
- Codex pickup 2026-07-31T01:52Z: all three source fixes are now included in
  the Node-22-green composite worktree. `NC-20260730-006` closes follow-ups
  1-3 with typed-handoff prompt rules, Mailman-start observability, and a
  clean-commit release boundary. The production hand patches remain active
  until that reviewed source is committed and deployed.

### NC-20260730-004 — Default-off CaleProcure collection and named-human review

- Date: 2026-07-30T19:14Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: uncommitted Procurement slice on
  `codex/continuity-reconciliation` @ `bc8a71b`; production was built from the
  isolated release recorded below, not from the shared dirty checkout
- Change class: C5 — Slack identity/authorization boundary plus production
  migration, agent image, host artifact, prompt activation, and service restart
- Affected systems: migration 114, Procurement intake/review policy, host IPC,
  Slack card transport and inbound human messages, container MCP, Procurement
  prompt/procedure/schema, environment example, architecture/security/project
  map, resurrection plan, and continuity records
- Outcome:
  - adds a Procurement-only, maximum-200-row CaleProcure IPC whose host supplies
    observation time and owns strict validation, batch hashing, run-key
    idempotency, deduplication, parameterized writes, and terminal run evidence;
  - keeps that write path off unless
    `PROCUREMENT_CALEPROCURE_INGEST_ENABLED=1`;
  - generates review cards from current database queue truth, anchors them to
    `procurement:opp:{id}`, and durably binds opportunity/version, Slack
    channel/message, action epoch, recommendation, and reason;
  - accepts only an exact, reason-required `DECIDE` command inside the bound
    card thread from a Slack UID in `PROCUREMENT_OPERATOR_UIDS`, with both the
    review enable flag and current epoch present;
  - atomically consumes the open card and optimistic review version, so wrong
    callers, unnamed users, root commands, unrecorded cards, stale versions,
    old epochs, and replays fail closed;
  - keeps reactions advisory-only and preserves manual registration, email,
    proposal commitments, submission, signature, attestation, and terms.
- Files: `.env.example`; migration 114; `src/procurement-{policy,review}*`;
  Procurement intake/IPC plus tests; Procurement IPC watcher authorization
  test; root index/IPC; agent-runner MCP; Procurement prompt, CaleProcure
  procedure, schema/DB references, architecture, security, project map,
  resurrection plan, active work, and this changelog.
- Verification:
  - pinned Node 22.23.2 typecheck passed;
  - 104 focused tests passed across 9 files, covering typed intake, policy,
    card binding, wrong caller/user/thread, disabled gates, stale/replay
    rejection, migration grants, email/Gmail containment, and host routing;
  - pinned Node 22.23.2 complete serial suite passed 134 files / 1,685 tests;
  - independent `container/agent-runner` build and 3 files / 22 tests passed;
  - repository formatting, schema-sanitizer self-test, documentation continuity
    (23 active/ready rows, 22 pre-entry changelog entries), and
    `git diff --check` passed at the full-suite snapshot;
  - after that snapshot, concurrent `NC-20260730-002` edits made the current
    root typecheck fail at `src/healer/approval.ts:63`. Repository-wide
    formatting, the current Procurement-focused 104 tests, schema sanitization,
    final 23/23 continuity check, and diff checks pass. This task does not
    rewrite the Healer fix.
- Deployment/migration: none. Migration 114 is unapplied. The example
  collection/review flags are off, the epoch/operator list is empty, and no
  live configuration was inspected or changed.
- Rollback/recovery: before deployment, discard only NC-20260730-004-owned
  source/docs and restore the prior staged migration 114 version. After an
  authorized migration, disable both gates and roll back host/runner/prompt
  source first; retain additive audit rows unless a separately reviewed
  retention migration is approved.
- Documentation: reconciled the old direct-SQL CaleProcure procedure with the
  typed host path and documented exact authority, default state, deployment
  boundary, and canary sequence.
- Follow-ups: review the combined `NC-20260730-003/004` slice; name primary and
  backup Slack operator IDs; authorize backup/precondition inspection,
  migration 114, gates-off dark deployment, and synthetic denial/success
  canaries separately. Schedule cutover and all Bonfire work remain unapproved.

#### Addendum 2026-07-30T21:53Z — migration-first gates-off production deployment

- Authorization and isolation: the user explicitly authorized migration and
  deployment at 2026-07-30T21:34Z. The release was reconstructed from the
  previously deployed `1689527` host base plus only Procurement-owned
  source/prompt/runner files. The production checkout's 96 pre-existing dirty
  paths and committed `NC-20260730-002` Healer slice were not used as the host
  build source.
- Preflight: one healthy daemon and listener, zero active containers, both
  Procurement gates off, no operator IDs or review epoch, all three expected
  database roles present, 309 legacy opportunity rows, and none of the migration
  114 control-plane relations present.
- Boundary correction before migration: live inspection showed the legacy
  `nanoclaw_procurement` role still had direct `SELECT/INSERT/UPDATE`. Migration
  114 now enables row-level security: admin retains full access, readonly
  retains full read, and Procurement can directly read/insert/update only
  source-keyless `source='bonfire'` rows. New CaleProcure/email rows remain
  host-owned and are exposed only through the bounded queue view.
- Recovery: restricted backup
  `~/.local/share/nanoclaw-deploy-backups/NC-20260730-004-20260730T2146Z`
  contains the prior runtime/prompts, a native PostgreSQL dump, and the current
  agent image retained as
  `nanoclaw-agent:rollback-NC-20260730-004-20260730T2146Z`. The runtime archive
  SHA-256 is `ac0392c6f981618f9664e2ea174daefc2e80907fbf00d700f6b902a623beb36e`;
  the database dump SHA-256 is
  `cd432848c3ad4ce1cefad78f6a9662abfc96a635b19f28aaa627894d35493f5d`.
  An earlier `...T2145Z` directory is an incomplete, unused backup attempt.
- Release evidence: archive
  `~/.local/share/nanoclaw-releases/NC-20260730-004-20260730T2136Z` was copied
  from SHA-256
  `1e4b402aacf953addc01ce532d2adbfffc50ef9591cf3f2fb77e354656a3e18d`.
  Local pinned Node 22.23.2 typecheck/build, 87 focused pre-RLS tests, 26
  focused post-RLS tests, and the independent runner build/tests passed. The
  isolated full run passed 1,661 of 1,662 tests; its only failure was the
  pre-existing `webhook-server.test.ts` ephemeral-port race. On the target's
  unpinned Node 25.8.2, root typecheck/build and 87 focused tests passed. A
  fresh Node 22 agent-image build compiled the runner and a no-credential
  container canary found both Procurement MCP symbols.
- Migration: migration 114 committed successfully in one transaction. The
  three control tables, queue view, and six functions exist; all four new
  queue/control row counts are zero; all 309 legacy opportunities remain.
  Procurement directly sees 298 source-keyless Bonfire rows and zero
  source-keyed/non-Bonfire rows; readonly/admin each see all 309. A direct
  CaleProcure insert under the Procurement role was denied and left zero
  sentinel rows.
- Activation: the byte-exact host `dist/`, Procurement prompt/schema/procedure,
  and schema references were activated; the prior host artifact remains at
  `dist.pre-NC-20260730-004-20260730T2152Z`. The built agent image became
  `nanoclaw-agent:latest` at digest
  `sha256:004e711111abf9fdde65cf26a58b24894c8414ba77d89432e63613eb90e73c7f`.
  Launchd restarted successfully at 2026-07-30T21:52:49Z.
- Live verification: exactly one daemon (PID 42265) owns the single `:8088`
  listener; `/health` reports Slack and Gmail connected. Host `dist/` and the
  three Procurement prompt/procedure files are byte-exact to the release.
  The live artifact resolves collection `false` and review `false` with zero
  operators and no epoch. The existing daily `0 8 * * *` task was not changed.
  Restart resumed two unrelated Sales/Contador containers; they were not
  stopped or inspected.
- State boundary: migration and dark deployment are live, but no Procurement
  batch, observation, review card, decision, schedule change, browser action,
  email/message, proposal, or submission was performed. State remains
  `deployed_unverified` until an explicitly approved gates-on synthetic fixture
  and named-human review canary complete; business outcomes remain unvalidated.

### NC-20260730-002 — Fail-closed healer action boundary and completion plan

- Date: 2026-07-30T18:13Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: `bc8a71b62ca952d7d919144f91609e761d382641` on
  `codex/continuity-reconciliation`; not pushed
- Change class: C5 — host command, restart, and self-modification authorization
- Affected systems: healer action policy, proposal/approval lifecycle,
  automatic reruns, daemon restart, code implementation, diagnosis trust,
  tracked fast-healer configuration, security and self-healing authorities
- Outcome:
  - added one default-off action boundary above model-authored healer commands,
    automatic reruns, and implementation while leaving collection, digest,
    heartbeat observation, and read-only diagnosis available;
  - replaced the any-non-bot approval fallback with an explicit operator
    allowlist and required action epoch;
  - host-bound executable proposals to expiring one-time nonces, rechecked
    policy/trust/class/fix/review at the final boundary, and atomically claimed
    approval, implementation, and automatic-rerun work before execution;
  - made failed, missing, or unparsable adversarial review manual-only; an
    initial refutation requires the independent tie-breaker to issue a passing
    synthesized review before execution;
  - recorded exact approvers, redacted command/output audit data, recovered
    stale claims, and prevented completed draft PRs from entering the shell
    approval queue;
  - separated fixed, capped daemon recovery into default-on
    `HEALER_RESTART_ENABLED`, preserving availability while model-authored
    actions and implementation remain off in the tracked launchd template;
  - reconciled the incomplete system into
    `docs/SELF-HEALING-COMPLETION-PLAN.md`, with typed actions and separated
    diagnosis required before autonomy can be enabled.
- Evidence:
  - pinned Node 22.23.2 typecheck passed;
  - pinned Node 22.23.2 healer suite passed after review remediation: 20 files /
    197 tests;
  - pinned Node 22.23.2 complete serial repository suite passed after review
    remediation: 134 files / 1,689 tests;
  - denial coverage includes disabled/quiet/missing-operator policy, wrong
    user, stale epoch, expired proposal, failed trust review, lost atomic claim,
    replay, implementation gate, automatic-rerun gate, and daemon-restart gate.
- Files: `src/healer/action-policy.ts` and test; healer trust, orchestration,
  proposal, approval, remediation, implement, collector source/tests;
  `setup/launchd/com.nanoclaw.healer.fast.plist`;
  `docs/SELF-HEALING-{DESIGN,PHASE0-SPEC,ORCHESTRATED-DIAGNOSIS,COMPLETION-PLAN}.md`;
  `docs/SECURITY.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`, this entry.
- Deployment/migration: none. The installed healer artifact/unit, production
  incident rows, Slack reactions, operator configuration, action epoch, daemon,
  and services were not changed. The installed implementation-off containment
  from `NC-20260729-004` remains the only live action-related change.
- Rollback/recovery: discard only the NC-20260730-002 task-owned local diffs.
  No production rollback is required because nothing was installed or enabled.
- Documentation: added the current completion authority and reconciled design,
  diagnosis, Phase-0, security, project-map, and continuity surfaces.
- Follow-ups: independent C5 review; separately authorized commit and dark
  deployment with actions off; then Gate B diagnosis separation and Gate C
  typed host actions. Do not enable the existing raw-command or shared-checkout
  implementation paths.

#### Addendum 2026-07-30T19:02Z — independent Claude Opus C5 review

- Reviewer: Claude Code 2.1.220, model `claude-opus-5[1m]` (Opus 5, 1M context)
  at maximum effort, account label `info-tandem`. No token, key, or credential
  value entered any prompt, log, diff, document, or command output.
- Report: `docs/reports/NC-20260730-002-CLAUDE-C5-REVIEW.md`.
- **Verdict: CHANGES REQUIRED.** State remains `ready_for_review`. The change is
  a clear net improvement on a boundary that previously accepted any non-bot
  Slack user and left `runApprovals` entirely ungated; the required changes are
  small.
- Verification independently reproduced under pinned Node 22.23.2 outside the
  restricted sandbox: typecheck passes; the healer suite passes **20 files /
  193 tests**; the full repository suite passes **130 files / 1,661 tests**;
  `npm run docs:continuity-check` passes; `npm run format:check` passes across
  `src/**/*.ts`; `git diff --check` passes. Every recorded figure matched.
- Verified as claimed: the any-non-bot fallback is gone; model-supplied
  `action_epoch`/`approval_nonce`/`approval_created_at` are stripped
  unconditionally before host values are issued; every executing path claims its
  work with one conditional `UPDATE`, each with a lost-claim test; the seven
  pre-existing `awaiting_approval` rows carry no nonce and would be disarmed
  rather than executed if actions were enabled; the `implement.ts:124`
  single-quote escaping is correct and no shell-injection path exists.
- Deployment-blocking, P1: gating `restartDaemon()` behind the default-off
  global switch removes the healer's only live availability function. The
  restart takes no model input — fixed `launchctl kickstart -k` argv, already
  capped and idempotent — and collapsing it with arbitrary model-authored shell
  means a dark deployment leaves a dead daemon unrecovered until a human reads
  Slack. Add a separate default-on `HEALER_RESTART_ENABLED`, or record the
  trade-off with a named owner for daemon-down recovery. Decide before
  authorizing deployment.
- Commit-blocking, P1: the implementation executor never re-evaluates trust at
  the final boundary. `runApprovals` calls `isActionable`;
  `loadImplementable`/`dispatch` check only confidence, cause_or_symptom, and
  the nonce binding, so the adversarial-review requirement is enforced
  indirectly and does not survive a trust change after arming. Two lines in
  `dispatch()` plus one test.
- Recommended in the same commit, P2: redact `command` and `out` in
  `remediate.ts` auto-rerun as `approval.ts` already does; and correct four
  statements — the P1-1 deployment consequence, `HEALER_INVESTIGATE_BASH=1`
  granting Bash under `bypassPermissions` outside the gate (which contradicts
  both `action-policy.ts`'s header and the new `SECURITY.md` paragraph), the
  "refuting review → manual-only" claim that the `synthesize` tie-breaker path
  contradicts, and `implement.ts`'s claimed time-box that `spawnPipeline` does
  not implement.
- Accepted residual, P2/P3: the verify loop can close an implement-dispatched
  incident as `verified_fixed` while its unbounded detached pipeline still runs;
  the trust gate compares `review.reason` against free-text literals produced in
  an untouched file; `applied_action` is one last-write-wins column rather than
  an audit log; `emojiVerdict` lets reaction order decide approve-vs-reject; the
  5-minute stale-claim window depends implicitly on the 120-second shell
  timeout. Raw model-authored `bash -lc` remains the design's core exposure and
  is correctly deferred to Gate C.
- Record correction for `NC-20260730-003`: its verification notes cite this task
  as blocking continuity and repository-wide formatting. Both now pass.
- Validator state boundary: repository reads plus the report and two continuity
  edits. No implementation code was edited; nothing was staged or committed; no
  deployment, service, launchd, migration, incident mutation, Slack reaction,
  operator/epoch configuration, credential, schedule, or production write
  occurred. The 65-path dirty worktree, including concurrent NC-20260730-001 and
  NC-20260730-003 work, was preserved unchanged.

#### Addendum 2026-07-30T19:22Z — Claude review remediation

- Resolved P1-1 by moving the fixed, capped, model-independent
  `launchctl kickstart` recovery to a separate default-on
  `HEALER_RESTART_ENABLED` control. The tracked template keeps
  `HEALER_ACTIONS_ENABLED=0` and `HEALER_IMPLEMENT_ENABLED=0`;
  `HEALER_QUIET=1` disables all three execution classes.
- Resolved P1-2 by applying `isTrustworthy` in both the implementation candidate
  filter and the final dispatch boundary before credentials or the atomic claim.
  A regression test changes review trust after arming and proves that no claim
  or process spawn occurs.
- Resolved the audit finding by redacting automatic-rerun command and output
  fields before `recordAction`.
- Closed two accepted review races in the same bounded slice: generic
  recurrence verification skips `implement_dispatched` work so only its
  completion poller decides the outcome, and named rejection wins when Slack
  carries conflicting named-operator approve/reject reactions.
- Corrected blank approval TTL handling to use the 24-hour bounded default and
  documented the stale-claim/shell-timeout dependency.
- Corrected the completion, design, diagnosis, security, project-map, and code
  claims: diagnostic Bash remains an off-by-default
  `bypassPermissions` escape hatch outside the model-authored action gate; an
  initial refutation can be overturned only by the existing independent
  tie-breaker; deterministic restart is independently controlled; and the
  detached implementation pipeline has no enforced timeout.
- Post-remediation verification under pinned Node 22.23.2 passed: focused
  **5 files / 60 tests**; typecheck; healer **20 files / 197 tests**; complete
  serial repository suite **134 files / 1,689 tests**; repository formatting;
  documentation continuity (**23 active/ready rows / 23 changelog entries**);
  and `git diff --check`.
- No deployment, service or launchd reload, incident mutation, Slack action,
  operator/epoch configuration, credential action, or production write
  occurred. The concurrent Procurement, knowledge, copier, and email-renderer
  changes remain outside this task.

#### Addendum 2026-07-30T21:38Z — Mac Mini dark deployment

- User separately authorized deployment after the isolated commit. The stale
  `mini-claw` SSH alias pointed to `.204`; the current Tailscale control-plane
  record identified the authenticated Mac Mini at `.206`. No SSH configuration
  was edited.
- Preflight: production used Node 25.8.2; the operational checkout had 96 dirty
  paths and remained untouched; NanoClaw was healthy on PID 68325 with Slack
  and Gmail connected, zero active containers, and no waiting work. The loaded
  fast healer had 46 successful runs, implementation off, no action-policy
  artifact, and no action/restart variables.
- Release: exact commit
  `bc8a71b62ca952d7d919144f91609e761d382641` was transferred as an immutable
  Git archive with SHA-256
  `77ba774119e9edf48726d3f1e0e26072ba11ba2f33406450304b84154f634437`
  to `~/.local/share/nanoclaw-releases/bc8a71b`.
- Target-runtime verification under Node 25.8.2 passed: typecheck, focused
  healer **5 files / 60 tests**, and build.
- Activation replaced only the compiled `dist/healer/` subtree and installed
  fast-healer plist. The main daemon, all other compiled host files, source,
  prompts, databases, schedules, pending proposals, and concurrent Procurement
  work were not changed.
- Loaded and evaluated policy: `HEALER_ACTIONS_ENABLED=0`,
  `HEALER_RESTART_ENABLED=1`, `HEALER_IMPLEMENT_ENABLED=0`; runtime evaluation
  returned `actions=false`, `restart=true`, `implementation=false`. Deployed
  `dist/healer/action-policy.js` SHA-256:
  `f5624020fe26ee105ef5dc740bf12327e262dff2da4eec8a34ae791fd40e943b`.
- Live fast-cycle canary: one launchd run exited `0`; its aggregate outcome was
  zero collected/reported/diagnosed/acted/closed/approved/implemented,
  `gmailStalled=false`, and `daemonDown=false`. The main daemon remained PID
  68325 with Slack/Gmail connected, zero active containers, and no waiting
  groups.
- Rollback bundle:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260730-002-20260730T213639Z`
  contains the prior compiled healer subtree and installed plist.
- State boundary: `deployed_unverified`. The dark policy and ordinary healthy
  fast cycle are live-verified. A controlled daemon-down recovery canary was
  not induced against the healthy production daemon, so actual restart
  execution and longer-term outcomes remain unverified.

### NC-20260730-003 — Procurement host intake and review control plane

- Date: 2026-07-30T18:13Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task started at
  `1689527` and the shared branch advanced to `04292cd` during implementation
- Change class: C2 — additive source and migration; deployed gates-off with
  `NC-20260730-004`
- Affected systems: Procurement PostgreSQL model, CaleProcure normalization,
  classified-email host router, Gmail resource policy, host/container IPC,
  Procurement prompt/schema, architecture/security/continuity documentation
- Outcome:
  - adds tracked migration 114 with source-run completion, immutable
    observations, canonical source keys, a bounded review view, and optimistic
    host-only decision transitions;
  - replaces free-form email-body SQL with a host parameterized intake that
    stores metadata before handoff and fails closed on database errors;
  - grants Procurement `gmail_read` only for the exact host-assigned message;
    mailbox search, thread reads, send, and reply remain denied;
  - provides deterministic CaleProcure row validation, date normalization,
    cross-keyword deduplication, conflict rejection, payload hashing, and
    complete/failed source-run evidence;
  - exposes a Procurement-only, read-only queue IPC that omits raw payload and
    Gmail identifiers.
- Important boundaries:
  - migration 114 and the isolated host/container/prompt artifacts were later
    deployed gates-off under `NC-20260730-004`;
  - the daily scanner, Bonfire/CDP bridge, schedule, 309 legacy rows, and vault
    artifacts are unchanged;
  - CaleProcure browser collection is not yet wired to the adapter;
  - review transitions exist as a host-only optimistic function but are not
    exposed to the model; submission and all outbound actions remain manual.
- Files: migration 114; `src/procurement-intake*`,
  `src/procurement-ipc-handlers*`, sanitized fixture, host router/classifier,
  Gmail policy, root IPC, agent-runner MCP, Procurement authorities, schema
  references, architecture/security/project map, resurrection plan, and shared
  lifecycle records.
- Verification:
  - 87 focused tests pass across Procurement intake/queue, host routing, Gmail
    authorization, classifier routing, and Gmail channel paths;
  - pinned Node 22.23.2 root typecheck passes;
  - pinned Node 22.23.2 complete serial suite passes 130 files / 1,661 tests;
  - independent `container/agent-runner` build passes and its suite passes
    3 files / 22 tests under pinned Node 22.23.2;
  - Procurement-owned TypeScript formatting and `git diff --check` pass;
  - repository continuity is currently blocked only because overlapping
    `NC-20260730-002` has no engineering-changelog entry; the repository-wide
    formatting check is currently blocked only by three `src/healer/*` files
    owned by that task. Neither blocker is rewritten under this task.
- Migration/deployment: pending and separately gated. Apply migration 114
  before the matching host and agent-runner source; back up and inspect live
  constraints first.
- Rollback/recovery: before deployment, revert only NC-20260730-003 source and
  documentation. After migration, keep the additive tables/columns by default
  and roll back host routing first; destructive schema removal requires a
  separately reviewed data-retention decision.
- Follow-ups: host-verified human review action; CaleProcure collection/cutover;
  Bonfire isolate-or-retire/value trial; framework provenance and outcome loop.

### NC-20260730-001 — Procurement Scout investigation and resurrection design

- Date: 2026-07-30T17:43Z
- Owner/client: Codex
- State: ready_for_review
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `1689527`
- Change class: C1 — read-only investigation and internal target design
- Affected systems: Procurement group, scheduled scan, Bonfire/CaleProcure and
  email intake, procurement PostgreSQL state, local proposal framework, browser
  security boundary, Company-OS continuity
- Outcome:
  - reconstructed the original opportunity-to-outcome thesis from the group
    prompt, procedures, local framework, history, schemas, and implementation;
  - verified that production discovery remains live but the qualification,
    decision, proposal, submission, outcome, and calibration loop is mostly
    dormant;
  - documented the smallest credible resurrection: deterministic source
    observations, host-owned transitions and database operations, CaleProcure
    plus exact-resource email first, an isolated-or-retired Bonfire path,
    provenance-aware proposal evidence, manual submission, and required
    outcome closure;
  - left seven leadership decisions as explicit gates before any C2-C5
    implementation or production change.
- Evidence:
  - production read-only audit found one registered group and active daily task,
    70 successful/9 error task-run rows, a running Procurement browser service,
    and healthy loopback plus shared-gateway CDP endpoints;
  - the 309-row opportunity store contains 163 `new`, 138 `expired`, 6
    `rejected`, and 2 `scraped` records; 127 of the `new` records are classified
    as noise, while no record has reached a proposal/submission/outcome status;
  - aggregate vault evidence contains 12 briefs, 6 analyses, 2 proposal drafts,
    2 status files, and zero bid-history rows;
  - local dated scan artifacts use 44 distinct top-level JSON shapes;
  - live email routing and its tests explicitly keep procurement labels at
    `classify_only`, despite the group prompt describing a Mailman handoff;
  - the live status constraint contains proposal states absent from the
    Git-ignored procurement DDL, confirming non-portable schema drift.
- Files: `docs/PROCUREMENT-RESURRECTION-PLAN.md`,
  `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`, this entry.
- Verification: 2026-07-30T17:48Z —
  `npm run docs:continuity-check` passed (20 active/ready rows and 20 changelog
  entries; schema-sanitizer self-test passed), and `git diff --check` passed
  with no output. These documentation-only checks ran under the current
  shell's Node 26.5.0; `.nvmrc` remains Node 22, and no product/runtime suite
  was needed or run.
- Deployment/migration: not applicable. Production was inspected read-only; no
  prompt, browser, schedule, service, database, message, proposal, or portal
  state changed.
- Rollback/recovery: revert only the four NC-20260730-001 documentation edits.
  The production scanner and current dirty worktrees were not changed.
- Documentation: new Procurement current-state/target-design authority plus
  project-map and shared lifecycle records.
- Follow-ups: human resolves the seven design gates; accepted implementation
  phases receive separate C2-C5 task IDs with exact rollback and deployment
  boundaries. Coordinate browser containment with `NC-20260729-004`.

### NC-20260729-004 — Week-1 Company-OS containment: Gmail authority and healer default

- Date: 2026-07-30T03:26Z
- Owner/client: Codex with required Claude Opus validator
- State: deployed_unverified
- Commit/PR: `16895273e4a387eb12e2bfcfb869abb9aba85c32` on
  `codex/continuity-reconciliation`; not pushed
- Change class: C3 — host authorization and customer-email final-send boundary
- Affected systems: Gmail IPC watcher and handlers, inbound Gmail routing,
  classifier correction routing, Mailman/Sales/Contador/Chief/Archivarista
  procedures, approved-send watchdog integration, tracked fast-healer launchd
  template, Company-OS/security/continuity documentation
- Outcome:
  - container-originated Gmail actions are authorized from the
    directory-derived group identity against an explicit operation matrix;
  - thread IDs, message IDs, and exact search addresses require host-issued
    resource grants, with model-authored handoffs limited to propagating
    resources the source already holds;
  - scheduled Sales work can reconstruct only an exact thread/address after a
    restart and only when PostgreSQL proves it belongs to a Party with a
    non-terminal pipeline entry; operator-approved replies can reconstruct the
    exact approved thread/recipient from durable host-held SQLite state;
  - denied Gmail requests are quarantined rather than executed and receive a
    best-effort negative acknowledgement in the caller's input;
  - new sends and Gmail-derived reply recipients fail closed unless the host
    resolves a Party and verifies every To/CC address against that Party;
  - both sends and replies honor `GMAIL_TEST_RECIPIENT`, strip test-routed CC,
    and do not falsely discharge a real customer's approved-send expectation;
  - the tracked fast-healer template now defaults implementation off. No
    installed unit or live service was changed.
- Operation matrix:
  - `mailman`: send, reply, exact search, exact message read, exact thread read;
  - `sales`: assigned/active-pipeline exact search and thread read;
  - `contador`, `archivarista`, `chief`: exact host-routed message reads only;
  - all other groups and operation combinations: denied.
- Important implementation details:
  - caller-supplied `groupFolder` and `leadId` remain candidates, not authority;
    source identity comes from the IPC directory and Party identity from host
    data;
  - search accepts only an exact `from:<address>` / `to:<address>` grammar and
    rejects broader Gmail query operators;
  - business-database errors fail closed;
  - process-local resource grants expire after 24 hours of inactivity and are
    bounded; only narrowly verified Sales pipeline state and an exact durable
    pending human approval can reconstruct a grant after restart;
  - handoff email propagation reads structured headers only, before any body or
    message delimiter;
  - reply recipient validation runs after Gmail resolves the original sender
    but before raw message construction or send, and the Gmail-derived address
    must equal the host-approved recipient for approval-backed replies.
- Regression prevented during validation: the first process-local-only design
  would have blocked scheduled Sales follow-ups after every daemon restart. The
  durable active-pipeline resolver was added before review. The overlapping
  NC-20260729-003 callback also initially cleared a customer's expectation after
  a test-routed delivery; it now fires only for a production recipient.
- Verification:
  - Qodo rule lookup followed the canonical Claude skill; no
    `~/.qodo/config.json` exists, so no Qodo repository rules were available;
  - 2026-07-30T03:22Z — focused authorization/recipient/watchdog set: 51 tests
    pass;
  - 2026-07-30T03:25Z — pinned Node 22.23.2:
    `npm run typecheck` passes and the complete root suite passes **127 files /
    1,625 tests**, including native SQLite coverage;
  - 2026-07-30T03:26Z — independent `container/agent-runner` build passes and
    its suite passes **3 files / 22 tests** under Node 22.23.2;
  - Claude Opus adversarial review completed with `CHANGES REQUIRED`; its report
    and the implemented remediation are recorded below.
- Deployment/migration: deployed 2026-07-30 as recorded in the production
  addendum below. The additive local SQLite
  `pending_sends.gmail_thread_id` migration and index are live.
- Rollback/recovery: revert the NC-004 source/prompt/template changes together.
  The overlapping NC-003 send-watchdog work has separate deployed-unverified
  evidence and must not be represented as rolled back unless the live host is
  separately changed and verified.
- Documentation: `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
  `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, `docs/ACTIVE-WORK.md`, this record, and
  the relevant group procedures.
- Remaining boundaries: the production host still runs Node 25.8.2 rather than
  the pinned Node 22; the dirty operational source/prompt checkout was preserved
  rather than overwritten; a real approved/test-routed success and business
  outcomes remain unverified.

#### Addendum 2026-07-30T04:00Z — independent Claude Opus pre-commit review

- Reviewer: Claude Code 2.1.220, model `claude-opus-5[1m]` (Opus 5, 1M context)
  at maximum effort, account label `info-tandem`. No token, key, or credential
  value entered any prompt, log, diff, document, or command output.
- Report: `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`.
- **Verdict: CHANGES REQUIRED.** State remains `validating`; the change is not
  yet cleared for commit and must not be deployed until P1-1 is resolved rather
  than only documented.
- Verification independently reproduced on the Mac Studio checkout under pinned
  Node 22.23.2, outside the sandbox: `npm run typecheck` passes; the complete
  root suite passes **127 files / 1,625 tests**; the independent
  `container/agent-runner` build passes and its suite passes **3 files / 22
  tests**; `npm run docs:continuity-check` passes (19 active/ready rows, 19
  changelog entries); `git diff --check` passes. Every figure recorded above
  reproduced exactly. Qodo absence re-confirmed — `~/.qodo/` does not exist and
  no config file was created.
- Model disposition: of the fourteen intended security-model items, twelve hold
  as written. Item 7 (grant expiry plus durable Sales reconstruction) partially
  holds. Item 6 (denials quarantined rather than dispatched or discarded) holds
  for the file but not for the calling agent.
- Blocking, P1: `gmail_reply` has no grant-reissue source. The durable fallback
  (`src/gmail-ipc-business-scope.ts:24`) accepts only `sales` with
  `gmail_get_thread`/`gmail_search`, and the only grant origins are
  `src/channels/gmail.ts:454` and `src/classify-ipc-handlers.ts:404`. After a
  daemon restart an operator-approved reply cannot be authorized by any path in
  this change; Sales-side recovery additionally requires an interactions row
  carrying `metadata->>'thread_id'`, which only a prior successful outbound send
  writes, so first replies to new inbound leads and all `chief` support replies
  never recover. Fails loud through the NC-20260729-003 watchdog after roughly
  six minutes, but is a customer-facing outage of the primary outbound path.
- Blocking, P1: a quarantined `gmail_*` request returns no negative
  acknowledgement, while the container tool has already reported the operation
  as queued. This reproduces the stalled-agent/fabricated-cause sequence
  recorded under NC-20260728-003 and defeats the new "stop and escalate"
  instruction in the group prompts.
- Recommended in the same commit, P2: narrow `clearPendingSendsByRecipient`
  (`src/db.ts:960-970`) to the oldest matching row so two concurrent
  expectations for one address are not collapsed; and correct the
  NC-20260729-003 entry below, which now describes the `GMAIL_TEST_RECIPIENT`
  callback suppression introduced by NC-004 and absent from the Mac Mini build
  of 2026-07-30T00:09Z.
- Accepted residual risk, P2: resource grants are group-global and accumulate
  for the process lifetime, so `mailman`'s address set makes "a resource the
  source already holds" a weak constraint and lets an attacker-controlled email
  body propagate a previously-seen third-party address to `sales`. Also, no
  expression index supports `interactions.metadata->>'thread_id'` on the
  authorization hot path; that index needs its own migration and task ID. Seven
  P3 items are listed in the report.
- Pre-deployment observability gap: quarantine has no metric, alert, or
  retention policy, yet quarantine volume is the primary production signal for
  the P1 grant gap.
- Validator state boundary: repository reads plus the report and two continuity
  edits. No implementation code was edited; nothing was staged, committed, or
  pushed; no deployment, service, launchd, migration, credential, schedule,
  message, email, approval, or production-data change occurred; no secret,
  session, log body, database row, or backup content was read or reproduced. The
  51-path dirty worktree, including the unrelated NC-20260728-006,
  NC-20260729-001 and NC-20260729-002 changes, was preserved unchanged.

#### Addendum 2026-07-30T11:31Z — Claude findings remediated

- **P1-1 resolved:** approvals persist the exact Gmail thread and recipient in
  `pending_sends`. The host grants that thread at approval time and can
  reconstruct the same grant from the pending approval after restart. It
  overwrites any container-supplied approved recipient before dispatch; the
  final handler then requires Gmail's resolved recipient to match.
- **P1-2 resolved:** quarantine writes a best-effort `[gmail_* DENIED]` response
  into the caller's input. The watcher excludes both the `errors` and
  `quarantine` administrative directories.
- **P2-1 resolved:** a confirmed send clears only the oldest pending row for a
  recipient. **P2-3 resolved:** the NC-003 entry below describes the deployed
  Mac Mini behavior, with its later NC-004 test-routing change in a separate
  dated addendum.
- **P2-2 narrowed:** handoff propagation extracts addresses only from structured
  `From`/`To`/`CC`/`Email` headers before a body/message delimiter, so a
  previously granted address injected into body text cannot propagate; grant
  sets are capped at 5,000. Full work-item scoping remains deferred.
- Additional review hardening: spoofed `groupFolder` and quarantine reprocessing
  tests, a default-deny Gmail statement in the group template, and explicit
  documentation of the host-direct proposal and digest exceptions.
- Post-remediation verification under pinned Node 22:
  - focused authorization/recipient/watchdog/SQLite set: **6 files / 126 tests
    pass**;
  - `npm run typecheck` passes;
  - two normal parallel root runs each reached **126 files / 1,629 tests** and
    exposed one different ephemeral webhook listener failure (`EADDRINUSE`,
    then `socket hang up`); `src/webhook-server.test.ts` passes alone
    (**35/35**), and the deterministic single-worker root suite passes **127
    files / 1,631 tests**;
  - independent `container/agent-runner` build passes and suite passes **3 files
    / 22 tests**.
- Deferred, not concealed: a PostgreSQL expression index for
  `interactions.metadata->>'thread_id'` needs a separate migration; a
  work-item-scoped grant ledger, quarantine metrics/alerts/retention, and the
  remaining P3 recommendations remain backlog.
- State boundary: Claude-reviewed remediation and all recorded local checks are
  committed. No deployment, production migration, daemon restart,
  service/configuration change, push, email, message, approval, credential
  action, or production-data write was performed.

#### Addendum 2026-07-30T17:50Z — deployed with live safety canaries

- Production preflight: the Mac Mini checkout was dirty, the managed daemon was
  healthy, Node was 25.8.2 rather than pinned Node 22, pending sends and active
  jobs were zero, and the installed fast-healer implementation flag was `1`.
  The target source worktree was preserved.
- Recovery evidence: created restricted backup
  `~/.local/share/nanoclaw-deploy-backups/NC-20260729-004-20260730T172332Z`
  with the prior source/dist artifacts, installed plists, and a native SQLite
  backup. The reviewed archive was staged at
  `~/.local/share/nanoclaw-releases/1689527`; its SHA-256 is
  `5114fe4b9b0e062f4dd822337adac1eddf0932bb81cac43e1744e117265ce703`.
- Pre-activation verification: target-runtime typecheck, focused authorization
  tests, and build passed under the installed Node 25.8.2. The release build
  contains the reviewed Gmail authorization, quarantine, durable grant, and
  recipient-boundary symbols.
- Activation: symlinked release attempts exited cleanly because the direct-run
  guard compares the invoked path with `import.meta.url`; automatic recovery
  restored the prior daemon each time. The final activation copied the
  immutable release `dist/` to the existing runtime path and restarted the
  launchd-managed service. At verification time exactly one daemon, PID 68325,
  was running; Slack and Gmail were connected; PostgreSQL `SELECT 1` passed;
  the copied artifact matched the release; and no actual NanoClaw Apple
  Containers were present.
- Migration/configuration: production SQLite now has
  `pending_sends.gmail_thread_id` and
  `idx_pending_sends_gmail_thread`. The installed fast-healer implementation
  flag was changed from `1` to `0`, reloaded, and verified as `0` in the live
  launchd environment.
- Live safety evidence: a synthetic unauthorized `gmail_send` was quarantined
  and produced `[gmail_send DENIED]` for its caller without dispatch. A separate
  synthetic pending approval reissued only its exact Gmail thread/recipient
  after in-memory grants were cleared. Both canaries were removed; neither sent
  a customer email.
- Residuals/state boundary: one stale adopted-container health record remained
  while the actual container inventory was empty. Production still uses Node
  25.8.2, and the dirty operational source/group-prompt checkout was not
  overwritten; only the reviewed host artifact is exact to `1689527`. State is
  `deployed_unverified` until an explicitly approved genuine or test-routed
  end-to-end send succeeds. No customer message was sent during deployment.

### NC-20260729-003 — Only a confirmed send discharges an approved send

- Date: 2026-07-30T00:12Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C3 — host runtime change on the customer-email send path
- Affected systems: NanoClaw host daemon (IPC watcher, Gmail IPC handlers,
  approved-send watchdog), `store/messages.db` (`pending_sends` lifetime), and
  the root TypeScript build graph
- Outcome: an approved send that is blocked by a guard, fails at the Gmail call,
  or is answered `[ALREADY-HANDLED]` now raises `[SEND NOT OBSERVED]` in the
  draft's own Slack thread. Previously all three were indistinguishable from a
  delivered email.
- Trigger: on 2026-07-29 an approved reply to a lead was blocked by the content
  guard for the banned AI-ism "thank you for reaching out". The block posted one
  line to `#gru-chief` and stopped. `#gru-sales` showed the operator's approval
  followed by silence, and the watchdog added by NC-20260728-003 stayed quiet.
- Root cause: `src/ipc.ts` called `observeOutbound` on the outbound group
  message, i.e. on the `[HANDOFF: sales→mailman]` line, and
  `src/send-watchdog.ts` deleted the `pending_sends` row there. That handoff is
  emitted *before* mailman composes the mail, so every downstream refusal —
  recipient guard, content guard, Gmail error, `[ALREADY-HANDLED]` — happened
  after the expectation had already been discharged. NC-20260728-003 chose the
  handoff deliberately ("the agent got that far"); this narrows it to the only
  signal that actually proves delivery.
- Change:
  - `src/send-watchdog.ts` — `observeOutbound` keeps observing the handoff but
    logs it as progress only and no longer clears. New `observeConfirmedSend`
    clears on a confirmed send, unwrapping a `Name <addr>` form and matching
    case-insensitively. `alertText` reworded: it no longer claims "no handoff has
    been seen" (a handoff usually *has* been seen) and now points the operator at
    the `🚫 [EMAIL BLOCKED]` line in `#gru-chief` that names the violation.
  - `src/db.ts` — new `clearPendingSendsByRecipient`. The recipient is the join
    key because the send executes as `mailman` while the expectation belongs to
    `sales`, so group folder cannot match.
  - `src/gmail-ipc-handlers.ts` — optional `onSendConfirmed` dep on
    `dispatchGmailIpc`/`handleGmailReply`/`handleGmailSend`, fired only after
    `replyToThread`/`sendEmail` returns. The build deployed at 00:09Z passes the
    original recipient even under `GMAIL_TEST_RECIPIENT`; NC-004 later
    supersedes that test-routing behavior in the worktree.
  - `src/ipc.ts`, `src/index.ts` — wiring.
  - `tsconfig.json` — `exclude` now covers `src/**/*.sync-conflict-*`. The 15
    Syncthing conflict copies in `src/` are Git-ignored and `.stignore`-ignored,
    so they are invisible to review and to sync, yet `"include": ["src/**/*"]`
    pulled them into the build graph. Three of the four typecheck errors seen
    while making this change came from stale duplicates of `index.ts`.
- Accepted trade-off: if an approved card carries no `Email:` line the row has no
  recipient, nothing can clear it, and a false `[SEND NOT OBSERVED]` fires ~6
  minutes later. That is fail-loud rather than fail-silent, and the `Email:` line
  was made mandatory by NC-20260728-001.
- Verification:
  - 2026-07-29T19:07Z (local) — `npx tsc --noEmit` clean; 65 tests pass across
    `send-watchdog.test.ts`, `gmail-ipc-handlers.test.ts`,
    `ipc-handoff-echo.test.ts`.
  - Test contract changed deliberately, with evidence: five tests asserting that
    the handoff clears the expectation encoded the defect and were replaced. New
    coverage: handoff-does-not-clear, confirmed-send-clears, case-insensitive
    match, display-name unwrap, wrong-recipient-does-not-clear, undefined
    recipient no-op, and an end-to-end case asserting the alert DOES fire when a
    handoff arrived but the send was blocked.
  - Regression caught and fixed during the change: `ipc-handoff-echo.test.ts`
    mocked `./db.js` with a bare const reference that broke under the renamed
    import; rewritten with the deferred-arrow pattern the same file already uses.
  - `src/db.test.ts` could not run in the authoring shell — `better_sqlite3.node`
    is built for NODE_MODULE_VERSION 127 (Node 22) and that shell runs Node
    26.5.0 (147). Not a product failure and not caused by this change.
  - 2026-07-30T00:08Z — on the Mac Mini: typecheck clean and **115 tests pass**
    across all four files including `db.test.ts`.
  - 2026-07-30T00:09Z — clean rebuild on the Mini after removing
    `tsconfig.tsbuildinfo`; `clearPendingSendsByRecipient` present in
    `dist/db.js`, `dist/ipc.js`, `dist/index.js` and `observeConfirmedSend` in
    `dist/send-watchdog.js` and `dist/ipc.js`. `dist/` contains zero
    sync-conflict artifacts, confirming the tsconfig exclude.
  - 2026-07-30T00:09:36Z — daemon restarted via `launchctl kickstart -k` with no
    containers in flight; running as pid 2480, startup log clean, Slack and Gmail
    both connected.
  - Duplicate-daemon check: exactly one `dist/index.js` process (pid 2480) and it
    owns the `:8088` listener.
  - **Not yet verified live:** an actual `[SEND NOT OBSERVED]` from a blocked
    send. That needs a real block, which cannot be manufactured without
    withholding a customer email.
- Deployment/migration: no schema change — only the lifetime of existing
  `pending_sends` rows changes. Deployed to the Mac Mini only.
- Rollback/recovery: revert the six source files and rebuild. Reverting restores
  the silent-failure behaviour, so it needs explicit review.
- Documentation: this entry and the active-work row.
- Addendum 2026-07-30T03:26Z: NC-20260729-004 changes send and reply
  confirmation so `GMAIL_TEST_RECIPIENT` deliveries do not discharge the
  intended customer's expectation. The Mac Mini build deployed at
  2026-07-30T00:09Z does **not** contain that guard. This addendum separates the
  worktree correction from NC-003's deployed evidence.
- Follow-ups:
  1. Optional instant notice: post the `🚫 [EMAIL BLOCKED]` line into the
     draft's own thread as well as `#gru-chief`, using the `pending_sends` row to
     resolve the channel and thread. Would cut operator notice from ~6 minutes to
     immediate. Not done here to keep the change on one behaviour.
  2. `/health` reports `pid` and `uptime` from the heartbeat file, not live
     process state — during this deploy it showed pid 46358 / 34h uptime while
     the actual daemon was pid 2480 / 28s. Misleading at exactly the moment
     post-deploy verification needs it.
  3. Runtime drift is wider than recorded: `.nvmrc` and CI pin Node 22, the
     authoring shell runs 26.5.0, and **the Mac Mini production host runs
     25.8.2**. No enforced version matches the pin.

### NC-20260729-002 — Coaching Supervision Mastery is quotable in the sales/inbox knowledge base

- Date: 2026-07-29T21:55Z
- Owner/client: Claude Code
- State: ready_for_review
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — knowledge/instruction writes that affect C3 agent email output
- Affected systems: sales and inbox agent knowledge, shared knowledge, and the
  sales learned-lesson override file. No code, schema, or runtime change.
- Outcome: the sales and inbox agents can now quote the real Coaching Supervision
  Mastery offer — dates, hours, format, inaugural and regular price — instead of
  refusing on a "PRE-LAUNCH, no public price" guardrail that had been stale since
  the program went on sale.
- Trigger: Lead #611 (Jennifer Watson, EPA) — two PCC coaches wanting to enrol.
  The draft escalated with "pricing not yet public" while `SCHEDULE.md` showed a
  live October 7 cohort.
- Root cause: `knowledge/agents/sales/SCHEDULE.md` is regenerated daily from the
  program calendars by `tools/refresh-schedule.py` and carries dates only, so the
  October 7 cohort appeared on its own (written 2026-07-28 06:30).
  `knowledge/agents/sales/KNOWLEDGE.md` carries price and policy and was last
  written 2026-07-22 15:52, still holding "Do NOT quote a student price — none is
  public." The agent obeyed its knowledge and surfaced the contradiction; this
  was knowledge drift between two independent update paths, not agent error.
- Files:
  - `knowledge/agents/sales/KNOWLEDGE.md` — CSS/Coaching Supervision Mastery
    section rewritten: AACS granted July 2026 (valid to July 2029, 72-hour
    program); inaugural cohort October 7, 2026 – February 10, 2027, Wednesdays
    09:00 CT / 10:00 ET, 16 weekly 2-hour live classes with a winter-holiday
    break; ~72 contact hours at 64% live (32h live + 14h fieldwork + ~26h
    self-paced); cohort 9–12; instructor of record Cherie Silas; 5 observed
    supervision sessions with written feedback; 6h supervision-on-supervision;
    learning journal + capstone; Techniques Book included; **$3,996 inaugural or
    $999/month × 4, $4,796 regular**; Stripe checkout. Adds an explicit
    "still NOT published — ask, never improvise" block, a warning never to
    compute the end date from the start date (the holiday break is why 16 weekly
    sessions reach February 10), and a note that only the morning-ET track
    exists for this program.
  - `knowledge/agents/inbox/KNOWLEDGE.md` — same facts at qualification depth;
    `Status: PRE-LAUNCH … no public student price` replaced with the live offer.
  - `knowledge/shared/KNOWLEDGE.md` — two stale statements corrected: "Tandem is
    preparing for this transition", and an FAQ answer claiming ICF "has not yet
    released full specifics, timelines, or application process" for CSS.
  - `knowledge/agents/sales/LEARNED.md` and `knowledge/shared/LEARNED-sales.md` —
    Lesson 23 carries a dated PARTLY SUPERSEDED status line. Its CSS half
    asserted ICF had published nothing; because learned lessons override
    KNOWLEDGE.md by design (`groups/sales/CLAUDE.md:31`), leaving it would have
    defeated the whole update. The MCC-exam half of the lesson was preserved.
- Provenance: every price, date, and hour figure was read from
  https://tandemcoach.co/coaching-supervisor-training/ and
  https://tandemcoach.co/coaching-supervisor-specialization-css/ on 2026-07-29.
  Nothing was inferred. Superseded KB figures corrected in the process: 60–70
  hours at ~50% live, AACS applications "open mid-June 2026" written as a future
  event, and a ~5-hour practicum.
- Deliberately not done: no attendance/missed-session policy and no
  refund/cancellation/deferral policy were written, because neither is published
  on either page. Both are now named in the KB as operator-escalation items.
  Lead #611's first question remains unanswerable until the operator supplies
  the attendance rule.
- Verification: 2026-07-29T21:55Z — `npm run docs:continuity-check` and
  `git diff --check` results recorded below. No test suite is applicable to a
  knowledge-content change; the effective check is the next live sales draft on a
  supervision lead.
- Deployment/migration: not applicable. Knowledge files reach the runtime host by
  file sync; not yet confirmed synced to the Mac Mini and not yet live-verified.
- Rollback/recovery: revert the five knowledge files as one provenance unit.
  Reverting restores a guardrail that now blocks a real, purchasable program.
- Documentation: active-work row and detail subsection plus this entry.
#### Addendum 2026-07-29T23:59Z — attendance rules, corrected accreditation floor, MCS price reconciliation, deployed

- State: `ready_for_review` → `deployed_unverified`.
- Attendance rules supplied by the operator and recorded: **Coaching Supervision
  Mastery — at most 2 of 16 live classes missable; Mentor Coach Training (MCS
  Standard Path) — at most 1 of 12.** Both are stated in the KB as **program
  policy** with an explicit instruction not to justify them with hour
  arithmetic. Whether a missed class can be made up remains unspecified and is
  still flagged for escalation.
- Operator confirmed the student-led fieldwork counts toward the synchronous
  total, so Coaching Supervision Mastery is **46 synchronous hours of 72 (64%)**
  — 32 class + 14 fieldwork. The KB now states this explicitly with a warning
  not to recompute 32/72 = 44% and wrongly conclude the ≥50% rule is missed.
- **Correction issued and pushed within the same session:** an intermediate
  version of this change justified the 2-class ceiling arithmetically against a
  "41-hour CSS floor" and asserted that a third absence would break CSS
  eligibility. The operator corrected the premise: **41 hours is the floor for a
  CCE course, not for an ICF-accredited program. The AACS/AAMC standard is 60+
  total hours with 50%+ synchronous.** Under the correct standard the hour
  arithmetic permits far more than 2 absences, so the derivation was wrong and
  the attendance ceilings are program policy only. The fabricated justification
  was live on the Mac Mini for roughly 2 minutes before replacement; no agent
  run consumed it (no sales container was running). Both attendance bullets now
  carry an explicit "do NOT justify with hour arithmetic" instruction so the
  same reasoning cannot be reconstructed by an agent.
- **MCS / Mentor Coach Training price reconciled across the whole knowledge
  base.** Operator confirmed **$2,997, or 3 × $999**. The stale
  `$1,997 founding / $2,497 list` pair was present 7× each in **10 agent
  KNOWLEDGE.md files** (archivarista, booking, campanero, chief, contador,
  courses, inbox, mailman, procurement, social) plus 1× in
  `knowledge/shared/KNOWLEDGE.md`. Only `knowledge/agents/sales/KNOWLEDGE.md`
  had ever been updated, so sales and every other agent were quoting different
  prices for the same program. All 71 occurrences replaced; zero stale figures
  remain in any KNOWLEDGE.md. The identical line numbers across all 11 files
  (180, 279, 281, 294, 334, 362, 453) show these files share a common generated
  base and drift as a set — a single hand-edit to one agent does not propagate.
- **`LEARNED.md` files deliberately NOT price-edited.** Their `$1,997`
  references are historical `Problem:` fields describing past leads and a real
  past invoice (TCA-358-PL). Rewriting them would falsify the record. One
  operative price statement inside a `Rule:` field does exist at
  `knowledge/shared/LEARNED-sales.md:274` and remains stale — carried as a
  follow-up because that file is a divergent lineage (see below).
- **Merge hazard encountered and avoided.** Syncthing is running on both the Mac
  Studio and the Mac Mini but is not propagating this folder in either
  direction: the Mini held a `knowledge/agents/sales/LEARNED.md` written
  2026-07-29 15:40 that had never reached the Studio, while Studio edits from
  18:05 had never reached the Mini. A blind push would have destroyed the Mini's
  **Lesson 52** (self-learned at 15:40: an outbound email to a lead was blocked
  by the content guard for the banned AI-ism "thank you for reaching out"; the
  email was not sent). Resolution: adopted the Mini's 52-lesson file as the
  base, re-applied the Lesson 23 correction to it, pushed that back. Pre-merge
  Studio copy retained in the session scratchpad.
- Deployment: 12 `KNOWLEDGE.md` files and `knowledge/agents/sales/LEARNED.md`
  copied to the Mac Mini by `scp` and verified byte-identical by `md5`. No build
  or daemon restart is required — knowledge reaches agents through a live bind
  mount. No sales container was running at push time, so the next run reads the
  new files with no stale session context. `knowledge/shared/LEARNED-sales.md`
  was deliberately NOT pushed.
- Not verified: no live agent run has yet consumed the new knowledge. The
  effective test is the next supervision or MCS draft.

- Follow-ups, each needing its own `planned` row and owner:
  1. Whether a missed class can be made up, and the refund/cancellation/deferral
     policy — both still unpublished and flagged in the KB for escalation.
  2. `knowledge/agents/sales/LEARNED.md` (51 lessons / 217 lines) and
     `knowledge/shared/LEARNED-sales.md` (73 lessons / 302 lines) have diverged,
     and the agent copy holds a CONTESTED marker the shared copy lacks. The sales
     container reads the agent copy, so 22 lessons present only in the shared
     file are not in force. Needs a provenance review, not a mechanical merge.
  3. `tools/refresh-schedule.py` emits no cohort end date, which is why the Lead
     #611 draft said "through late January" against an actual February 10, 2027
     finish.
  4. Confirm these hand edits survive the next `tools/regen-kb-delta.py` run —
     both edited KNOWLEDGE.md files carry a `manifest-hash` header.

### NC-20260729-001 — Claude validation task for the Company-OS v2 plan

- Date: 2026-07-29T12:23Z
- Owner/client: Claude Code
- State: planned
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C1 documentation and read-only repository validation
- Affected systems: Company-OS roadmap and shared engineering continuity only
- Outcome: created a self-contained, source-checking adversarial validation task
  for the latest available Opus model at maximum effort.
- Files: `docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`
- Verification: task registration passes `npm run docs:continuity-check` (16
  active/ready rows and 16 changelog entries) and `git diff --check`. These
  documentation-only checks ran under the current shell's Node 26 because the
  pinned Node 22 version manager is not installed in this environment; no
  product/runtime suite was needed or run. Claude execution remains pending and
  no validator verdict exists yet.
- Deployment/migration: not applicable; no runtime or external business state
  change is authorized.
- Rollback/recovery: remove only the new task brief and its NC-20260729-001
  lifecycle entries; preserve all pre-existing worktree changes.
- Documentation: task brief plus active-work and changelog registration.
- Follow-ups: Claude writes the report, records its evidence boundary, and runs
  the continuity and diff checks. Codex/human then reconcile accepted findings.

#### Addendum 2026-07-29T13:05Z — validation executed, report delivered

- State: `planned` → `ready_for_review`.
- Validator: Claude Code, model `claude-opus-5[1m]` (Opus 5, 1M context),
  maximum effort, executed from the Mac Studio development checkout on
  `codex/continuity-reconciliation` @ `cd78ad2`.
- Output: `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new file).
- Method: read the twelve documents named in the brief in order, then read the
  implementing source, migrations, CI workflows, launchd templates, and ignore
  rules to check each of the thirteen current-state claims against file/line
  evidence. Two read-only local host observations are recorded and labelled as
  such. No remote system was contacted.
- Claim results: 13 verified, 0 rejected. Two carry material corrections —
  Claim 2 (the healer defect is the enabled tracked template, the live
  operational checkout, and LLM-authored task text under
  `bypassPermissions`; the shell escaping at `src/healer/implement.ts:118` is
  correct, so "non-interpolated execution" mis-names it) and Claim 5 (the
  procurement Chrome already runs a dedicated `NanoClaw-Procurement` profile
  with `--disable-sync`, so that risk is overstated, while the socat bridge on
  the shared container gateway `192.168.64.1:9250` is reachable by every agent
  VM and is missing from the plan).
- Twelve findings absent from the plan were added; four rated critical:
  `gmail_*` IPC has no source-group authorization (`src/ipc.ts:470-497`, versus
  the gates at `:524` and `:569`); the outbound recipient guard is opt-in via
  the agent-supplied `leadId` (`src/gmail-ipc-handlers.ts:382-385`,
  `src/email-recipient-guard.ts:76-80`); `gmail_reply` applies neither the
  recipient guard nor `applyTestRouting` and passes an agent-supplied `cc`
  through (`src/gmail-ipc-handlers.ts:154-282`, `src/gmail-api.ts:405-411`);
  and every container can reach the unauthenticated CDP bridge.
- Four accuracy corrections to the plan's current-state section: test density is
  now 104 test files / 115 non-test source files (not 99/109); seven source
  files exceed 1,000 lines and `webhook-server.ts`/`channels/slack.ts` displace
  `ipc.ts` from the top five; two risk-register severities are miscalibrated;
  and the Wave-0 autonomy suspension cannot be performed by configuration
  because `src/autonomy-policy.ts:39-55` reads `process.env`, which
  `src/env.ts` deliberately never populates and
  `setup/launchd/com.nanoclaw.plist:7-15` does not set.
- Overengineering challenged: the 13-process catalog, the eleven-SLI list, the
  eleven-module decomposition list, the fuller decision-envelope list, the
  privacy/records program, and three overlapping Wave-4 deliverables.
- Nine acceptance criteria corrected, including P0.6's "a malicious skill PR
  cannot execute arbitrary shell through manifest data", which is unachievable
  while `.github/workflows/skill-pr.yml:101,109` run `npm ci` and
  `apply-skill.ts` over PR-controlled content; removing the `eval` at `:124` is
  still correct but is not that control.
- Disposition: **accept with changes**. Architecture, loop designs, authority
  model, change classes, and measurement chain accepted as written; Wave 0
  contents reordered and the six-week slice replaced.
- Verification: 2026-07-29T13:05Z — `npm run docs:continuity-check` passed
  (schema sanitizer self-test passed; 16 active/ready task rows, 16 changelog
  entries) and `git diff --check` passed with no output. As with the original
  NC-20260729-001 registration, both ran under this shell's Node 26.5.0 because
  the pinned Node 22 version manager is not installed in this environment; both
  are documentation-only checks and no product or runtime suite was needed or
  run. `git status --porcelain` after the change shows the two continuity edits
  plus the new report, with all five pre-existing dirty paths
  (`knowledge/agents/sales/LEARNED.md`, `scripts/copiers/copy_chat.py`,
  `scripts/copiers/copy_people.py`, `src/markdown-to-email-html.ts`,
  `src/markdown-to-email-html.test.ts`) untouched.
- Deployment/migration: not applicable. No runtime, database, credential, agent,
  external system, deployment, or machine setting was changed; the pre-existing
  dirty worktree was preserved.
- Rollback/recovery: delete `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`
  and revert the NC-20260729-001 rows in `docs/ACTIVE-WORK.md` and this file.
- Documentation: report plus active-work and changelog lifecycle updates. The
  improvement plan was deliberately not modified, per the brief.
- Follow-ups requiring their own `planned` rows and owners: (1) read-only check
  on the Mac Mini for whether `com.nanoclaw.healer.fast` is loaded and whether
  the procurement CDP bridge is bound; (2) `com.nanoclaw.repo-hygiene` is loaded
  on the Mac Studio and exits 127 daily because
  `tools/clean-sync-conflicts.sh` is absent from the repository, leaving fifteen
  `*.sync-conflict-*.ts` files in `src/` and inside the `tsconfig.json`
  `include` graph; (3) reconciliation of accepted findings into
  `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` by human/Codex under a new task ID.

### NC-20260728-007 — Drop ingestion subsystem stopped pending redesign

- Date: 2026-07-28T23:09Z
- Owner/client: human (redesign); Claude Code (stop + record)
- State: planned
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — reversible; scheduler/job disable, no data deleted
- Affected systems: launchd jobs `com.nanoclaw.copy-calendar`, `copy-chat`,
  `copy-email`, `copy-people`
- Action: all four jobs booted out and their plists renamed to
  `*.plist.disabled` so the stop survives reboot. No copier process is running.
  Nothing was removed from `Drop`.
- Rationale: the upstream Solera export is dead. Last delivery by file mtime —
  Chats 2026-07-15 16:00, People 2026-07-15 17:19, Calendar 2026-07-16 10:17,
  Email 2026-03-28. The copiers had spent roughly twelve days retrying a frozen
  pile, which is what pinned `fileproviderd`.
- Effect: `fileproviderd` fell from 109% to 48.9% CPU. The remaining load is the
  finite OneDrive upsync delete backlog draining on its own.
- Correction to the NC-20260728-006 record: that entry described `Drop/` as a
  live ingest channel. It is not, and has not been since 2026-07-16. The code
  dependency is real; the data flow is not.
- Residual state: 161,887 files in `Drop/Calendar`, 4,782 in `Drop/Chats`, left
  in place deliberately.
- Not done: no investigation of why the upstream export stopped. That is
  off-machine and belongs to the redesign.

### NC-20260728-006 — Chat/people copiers materialize OneDrive placeholders instead of failing every file

- Date: 2026-07-28T23:05Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — reversible internal write; scheduler/job + incident fix
- Affected systems: `scripts/copiers/copy_chat.py`,
  `scripts/copiers/copy_people.py`, launchd job `com.nanoclaw.copy-chat`
- Symptom: `fileproviderd` held 100-110% CPU with visible keyboard and trackpad
  stutter. `sample` attributed the hot serial queue to
  `com.microsoft.OneDrive-mac.FileProvider/…: database`. Of five FileProvider
  domains, only OneDrive was making progress; iCloud (27,542), Synology (17,172),
  and Google Drive (57,743) reconciliation counts were unchanged across a
  six-minute interval and therefore idle, not spinning.
- Root cause: launchd-spawned processes can run with dataless-file
  materialization disabled, making every read of a OneDrive placeholder fail
  with `EDEADLK`, including `shutil.copy2`. `copy_calendar.py` and
  `copy_email.py` opt in via `setiopolicy_np(3, 0, 2)`; `copy_chat.py` and
  `copy_people.py` carried the explanatory comment but never the call. Each
  failure skipped `f.unlink()`, so the file remained in the drop and launchd
  retried all 4,850 chat files every 300s indefinitely.
- Secondary defect: neither script had the 10 MB log-rotation guard present in
  `copy_calendar.py`. `copy_chat.log` had reached 18.6 GB.
- Change: ported the `setiopolicy_np` opt-in and the rotation guard into both
  scripts.
- Evidence:
  - before: `copy_chat.log` contained 1,116 `FAILED` lines in its final 400 KB
    and zero `COPIED`, with the most recent failure at 17:59 local;
  - after a 60s manual run: 23 `COPIED`, 0 `FAILED`; `Drop/Chats` went from
    4,848 to 4,825 files;
  - `fileproviderd` fell from 109% to 74.3% CPU.
- Containment applied before the change: `com.nanoclaw.copy-chat` booted out and
  `copy_chat.log` truncated, reclaiming 17 GB of disk. The job was bootstrapped
  again after the fix.
- Not verified: steady-state drain of the 4,825-file `Drop/Chats` backlog under
  launchd; sustained CPU after the backlog clears.
- Production/external state: OneDrive remains linked, so the copiers' `unlink`
  calls continue to replicate deletions to the Solera tenant. Unchanged by this
  work.
- Known remaining defect, not addressed here: `copy_calendar.py` fails with
  `[Errno 60] Operation timed out` rather than `EDEADLK` — 125,321 `FAILED`
  against 85 `COPIED` in the current log. It has the materialization opt-in, so
  the cause is distinct: 161,887 files in `Drop/Calendar` are rescanned in full
  every 300s with no per-file state, and most materialization fetches time out.
  This is now the dominant remaining `fileproviderd` load and needs its own task.

### NC-20260728-005 — Restore the Node 22 test baseline

- Date: 2026-07-28T12:25Z
- Owner/client: Codex + Claude validator
- State: validating
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — test/implementation reliability; no production state
- Affected systems: SQLite tests, Gmail IPC/content-guard fixtures, container
  runner/runtime tests, group queue tests, and formatting expectations
- Baseline evidence:
  - pinned Node 22 typecheck passes;
  - clean `a6e4b13`: 41 failures, 1,436 passes, 9 unhandled errors;
  - current Claude batch before repair: 49 failures, 1,546 passes, 9 errors;
  - all eight added failures were IPC handoff tests whose database mock omitted
    the new watchdog accessor; adding that mock restored all 12 IPC tests;
  - the repaired pinned suite passes all 124 files and 1,595 tests with zero
    failures or unhandled errors. Webhook and `tsx` migration tests require
    temporary local listeners and therefore ran with local-listener permission;
    their sandbox-only failure mode was `listen EPERM`.
- Product defects repaired:
  - bot-authored SQLite rows no longer re-enter ordinary inbound polling;
  - retry keys remain stable instead of growing `||root` on every attempt;
  - scheduled tasks and root-message containers now share queue state, so task
    priority and the one-container-per-destination boundary hold.
- Test contracts reconciled with intentional behavior: per-message thread
  metadata, outbound email content guards, detached file-backed container logs,
  and bounded container-runtime commands.
- Guardrail: do not alter production behavior merely to satisfy a stale
  assertion. Product changes require an independently valid failure mode and
  focused regression evidence.
- Production/external state: none.
- Follow-ups: complete build/package/document checks and obtain Claude review.
- Validator boundary: Claude Code 2.1.220 was configured for a tool-disabled,
  sessionless Opus review of an email/path-redacted staged patch. The sandboxed
  attempt failed with `ENOTFOUND`; the network retry was blocked by the privacy
  gate pending explicit user approval for private repository egress. No review
  result was produced.

### NC-20260728-004 — Company-OS continuity reconciliation

- Date: 2026-07-28T12:03Z
- Owner/client: Codex + Claude validator
- State: validating
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation` from `a6e4b13`;
  push pending
- Change class: C2 repository writes; reconciliation includes source for a C5
  least-privilege database boundary but performs no identity or production write
- Affected systems: Git tracking policy, continuity records/checker, CI Node
  selection, group/business source authority, generated schema documentation,
  and the full July 23-28 uncommitted batch
- Findings:
  - four Claude tasks were registered after implementation began;
  - five additional post-protocol change clusters had no task/changelog record;
  - migration 113, the entire ordered migration history, the business database
    guide, and required Sales support procedures were Git-ignored;
  - NC-20260728-001 was marked `complete` while uncommitted;
  - the SQLite schema snapshot embedded live sample rows;
  - the continuity checker validated document shape but not tracking,
    authoritative artifacts, unsafe schema samples, or misleading completion;
  - the active shell runs Node 26 while `.nvmrc` requires Node 22.
- Remediation in progress:
  - promote named group operating support, the business guide, and ordered
    `business_v2` migrations to Git while retaining runtime/auth/conversation
    exclusions;
  - register retrospective work with explicit evidence limits;
  - normalize lifecycle state and update the project/data authority maps;
  - make tracked schema snapshots structure-only and make sanitization part of
    every refresh;
  - strengthen continuity checks and CI; validate under Node 22; obtain an
    inspectable Claude review before handoff.
- Verification so far:
  - pinned Node 22 typecheck and formatting pass;
  - the root suite passes all 124 files / 1,595 tests;
  - the independent container runner builds and passes all 22 tests;
  - schedule and knowledge-regeneration test scripts passed;
  - schema-sanitizer self-test passed;
  - the staged continuity checker passed with 13 task rows and 13 changelog
    entries;
  - a read-only production metadata query confirmed migrations 111-112 are live:
    the view and role exist, with zero unexpected relation grants.
- Claude validation boundary: an email/path-redacted, tool-disabled review was
  prepared with Claude Code 2.1.220 and Opus. The initial call could not reach
  the API; the requested network retry was blocked pending explicit privacy
  approval for private repository egress. No Claude verdict is claimed.
- Production/external state: read-only metadata inspection only; no deployment,
  service restart, message/email, approval, schedule, credential, or data write.
- Rollback/recovery: revert only NC-20260728-004 reconciliation edits; do not
  revert the preserved Claude implementation batch or live database migrations.
- Documentation: active work, changelog, project map, business guide, schema
  references, tracking rules, and validation contract.
- Follow-ups: obtain explicit approval for the sanitized Claude API review,
  reconcile its findings, then create the committed/pushed handoff.

### NC-20260728-003 — Approved-send watchdog

- Date: 2026-07-28T11:50Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C3 — host runtime change plus one customer-facing email sent
- Affected systems: the NanoClaw host daemon (Slack approval path, IPC routing),
  `store/messages.db` (new `pending_sends` table), and one outbound email
- Outcome: the host now records that a send is owed whenever a `[SALES REVIEW]`
  card is approved, clears it when the matching `[HANDOFF: *→mailman]` is seen,
  and posts `[SEND NOT OBSERVED]` into the draft's thread when the grace period
  lapses with no handoff.
- Files:
  - `src/send-watchdog.ts` (new) + tests — `recordApproval`, `observeOutbound`,
    `sweepPendingSends`. Recipient-matched clearing: a handoff naming a
    different lead must not discharge this lead's expectation, or unrelated
    traffic would mask a real drop. One alert per approval; a failed post
    leaves the row for the next sweep.
  - `src/db.ts` — `pending_sends` table and accessors.
  - `src/ipc.ts` — `observeOutbound` on every outbound group message, called
    before routing so a held-then-cancelled send still counts as "the agent got
    that far".
  - `src/index.ts` — approval listener registered as an OBSERVER returning
    false, so the agent still receives the approval; 60s sweep interval.
- Deliberately NOT done: the host does not send the email itself. It holds the
  approved text, but re-deriving a body risks sending something other than what
  was approved — the 2026-07-23 regeneration failure. Alerting restores operator
  control without that risk.
- Remediation performed: Entry 938's approved reply was delivered at 11:43:12Z
  by injecting a `[HANDOFF: sales→mailman]` whose body was sliced verbatim from
  the approved card, not regenerated. Confirmed by `gmail_reply processed` and
  `[EMAIL SENT] to=… subject=Re: Questions about the AAMC Program and MCQ-PCC
  Qualification`, i.e. correctly threaded on her original subject.
- Verification:
  - 2026-07-28T11:45Z — `npx tsc --noEmit` clean; 15 watchdog tests pass,
    covering grace period, recipient mismatch, alert-once, and post-failure
    retry.
  - 2026-07-28T11:47Z — clean rebuild and restart on the Mac Mini (pid 48854);
    `pending_sends` confirmed created in the live schema; startup log clean.
  - Not yet verified live: an actual `[SEND NOT OBSERVED]` alert. That requires
    a stalled approval, which cannot be manufactured without withholding a real
    customer email.
- Open gap recorded, not fixed: the send wrote no `business_v2.interactions`
  row. `gmail-ipc` logged `reply leadId missing, no thread history for lookup`;
  Oana's inbound interaction (id 2472) carries a NULL `source_thread_id`, so the
  thread-based party lookup had nothing to match. This breaks the outbound-based
  Thread-ID recovery path and follow-up cadence for affected parties.

### NC-20260728-002 — Readable ODF/iWork attachments, no silent drops

- Date: 2026-07-28T11:26Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — host runtime behaviour and one agent-instruction line
- Affected systems: the NanoClaw host daemon's Slack attachment path (all
  groups, not only the grader) and the grader agent instructions
- Outcome: `.odt` / `.ods` / `.odp` uploads are extracted to text, Apple
  Pages/Numbers are extracted when they carry an embedded preview PDF, and every
  other attachment now yields an explicit note instead of nothing at all.
- Root cause: `downloadAndInlineFiles` had two branches (text, markitdown-doc)
  and no else. `application/vnd.oasis.opendocument.text` matches neither —
  `DOC_MIME_RE`'s `officedocument` alternative does not match `opendocument` —
  so the file contributed no content and no note, and the agent read the message
  as having no submission.
- Files:
  - `src/attachment-convert.ts` (new) — `classifyAttachment` routing plus
    `odfXmlToText`, `extractOdfText`, `extractIWorkPdf`. Zip entries are read
    with `unzip -p` (`/usr/bin/unzip`, present on the Mini), matching the
    existing shell-out-to-a-converter pattern. `odfXmlToText` converts block
    boundaries to line breaks BEFORE stripping tags, so paragraphs and table
    cells do not concatenate, and drops `office:annotation` so reviewer comments
    are not graded as submission text.
  - `src/channels/slack.ts` — dispatches on `classifyAttachment`; new
    `inlineOdfFile` / `inlineIWorkFile`; `fetchDocBuffer` extracted so all three
    converting paths share one size-check + download; a `default` branch that
    always emits a note.
  - `groups/grader/CLAUDE.md` — one line: a note-only `<attached_file>` means a
    file arrived that could not be read, so never answer it with "please attach
    the submission". Constrained to one line by the 200-line CLAUDE.md hook.
- Verification:
  - 2026-07-28T11:18Z — markitdown confirmed to REJECT `.odt`
    (`UnsupportedFormatException: The formats ['.odt'] are not supported`), so
    a dedicated ODF path was necessary rather than a routing fix.
  - 2026-07-28T11:22Z — extraction run against the real failing submission,
    `MENTORCOACHINGENGAGEMENTAGREEMENTCARLOSF.odt`: 6,723 characters recovered
    including the heading and the session table (`Carlos Flores` rows intact).
  - 2026-07-28T11:22Z — `submissions.numbers` (real, modern format) correctly
    yields no preview PDF and therefore takes the note path.
  - 2026-07-28T11:23Z — `npx tsc --noEmit` clean; 30 tests in
    `attachment-convert.test.ts` and 71 in `slack.test.ts` pass.
  - 2026-07-28T11:24Z — clean rebuild on the Mac Mini; `dist/attachment-convert.js`
    emitted and the new symbols present in `dist/channels/slack.js`. Daemon
    restarted via `launchctl kickstart -k`, running as pid 17587, startup clean.
  - Behaviour change to note: one existing test asserted images were skipped
    silently. That assertion was inverted deliberately — images now emit a note
    with image-appropriate wording, in every channel.
  - Not yet verified: a live `.odt` upload to `#gru-grader` grading end to end,
    and any live `.pages`/`.numbers` upload (no real sample with an embedded
    preview was available to test the success path).

### NC-20260728-001 — One Slack thread per sales lead

- Date: 2026-07-28T10:30Z
- Owner/client: Claude Code
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; deployed and
  live-verified before the review checkpoint; push pending
- Change class: C2 — host runtime behaviour, agent instructions, and one
  reversible per-group config write
- Affected systems: the NanoClaw host daemon (Slack send path and the agent
  output relay), the sales and inbox agent instructions, and
  `registered_groups.container_config` in `store/messages.db`
- Outcome: a lead now occupies one Slack thread — inbound message at the root,
  approval card and every later post threaded beneath it — and an over-length
  draft splits on a line boundary instead of inside a word.
- Reproduction: Entry 938 (Oana Tue), `#gru-sales`, 2026-07-28T09:22–09:27Z
  produced three root-level posts (handoff `1785230544.590929`, card
  `1785230834.912489`, recap `1785230838.601159`) and one mid-word continuation
  (`1785230835.048329`, opening "estation letter for the Standard Path").
- Files:
  - `src/lead-thread-key.ts` (new) — derives the canonical `lead:{email}`
    anchor. Scoped to lead-bearing messages (`[HANDOFF: *→sales]`,
    `[HANDOFF: sales→mailman]`, `[SALES REVIEW]`) and to labelled address
    fields only, because a false merge of two leads into one thread is worse
    than no merge. Tandem's own domains are skipped so the anchor is the lead.
  - `src/message-split.ts` (new) — boundary-aware splitting: blank line, then
    newline, then space, with a 60% fill floor so honouring an early boundary
    cannot emit a two-line chunk followed by a full one. Hard cut only when no
    boundary exists.
  - `src/channels/slack.ts` — a derived lead key overrides the author-supplied
    `threadKey`; lead threads do not set `reply_broadcast`, since broadcasting
    the card back to the channel bottom is the duplication the key removes; the
    over-length path uses `splitForSlack`.
  - `src/index.ts`, `src/types.ts` — `containerConfig.suppressFinalText` stops
    the host relaying the agent's final assistant text. It still marks
    `outputSentToUser`, so a late error cannot roll the cursor back and
    re-draft a lead that was already handled.
  - `groups/sales/WORKFLOWS.md` — the card gains a mandatory `Email:` line (the
    host threads on it) and replaces the verbatim `THEIR REQUEST` block with a
    one-or-two-line `THEIR ASK` summary. The mailman `Original-Message:` field
    is explicitly repointed at the handoff post at the thread root, which is
    the only remaining verbatim copy.
  - `groups/sales/CLAUDE.md`, `groups/sales/CLAUDE-MAIN.md`,
    `groups/inbox/CLAUDE.md`, `knowledge/shared/LEARNED-sales.md` — matching
    instruction updates, including an explicit "never post a recap".
- Verification:
  - 2026-07-28T10:24Z — `npx tsc --noEmit` clean.
  - 2026-07-28T10:24Z — 93 tests pass across `message-split.test.ts` (11),
    `lead-thread-key.test.ts` (11), and `slack.test.ts` (71, including 5 new
    canonicalization cases). Full suite: 172 failures, measured as identical to
    the pre-existing set by stashing this change and re-running the failing
    files; no new failures introduced.
  - 2026-07-28T10:26Z — `suppressFinalText` written for `sales` and `inbox` and
    read back from `registered_groups`; all 17 other groups confirmed UNSET.
  - 2026-07-28T10:26Z — source pushed to the Mac Mini after diffing every file
    against the Mini copy to confirm the only differences were this change.
  - 2026-07-28T10:27Z — clean rebuild on the Mac Mini after removing
    `tsconfig.tsbuildinfo`; `dist/lead-thread-key.js` and `dist/message-split.js`
    emitted, both symbols present in `dist/channels/slack.js`, and
    `suppressFinalText` present in `dist/index.js`.
  - 2026-07-28T10:27Z — daemon restarted via `launchctl kickstart -k`; startup
    log clean and Slack sends resumed.
  - 2026-07-28T10:39Z — a `[HANDOFF: chief→sales]` for the reproduction lead was
    injected through the real IPC path (`data/ipc/chief/messages/`) rather than
    posted to Slack by hand, so the host send path ran. The post anchored on
    `lead:oana.tue.coach@gmail.com`, confirming host-side derivation. The agent
    then correctly refused to re-draft (`[ALREADY-HANDLED]`, Entry 938 already
    at `sales review`), so this run did not exercise the card itself.
  - 2026-07-28T10:44–10:45Z — live end-to-end on the same lead via an operator
    correction and re-draft. The revised card carried the new format (`Email:`
    line, one-line `THEIR ASK`, no verbatim re-quote) at 1,994 characters
    against 4,782 across two parts for the 09:27 card — under Slack's limit, so
    it posted as a single message with no split at all. Zero sales posts
    followed the card, and the daemon logged
    `Final agent text suppressed (suppressFinalText)` at 10:45:28, confirming a
    recap was generated and dropped. The card threaded under the operator's
    active thread, which is the intended precedence: an explicit `threadTs`
    outranks the anchor, because that is where the human is reading.
  - Known residue: anchors created before this change keep their old namespaces
    (`sales:entry:*`, `inbox:lead:*`). A non-card post carrying a legacy key
    still resolves to the old thread — observed once on the `[ALREADY-HANDLED]`
    reply. Not backfilled: `SLACK_THREAD_TTL_MS` (8h) rolls dormant anchors over
    on their next use, and only two legacy anchors were inside that window.

### NC-20260727-001 — Durable party-scoped follow-up drop

- Date: 2026-07-27T15:10Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C3 — schema addition, host runtime behaviour, and a production
  data remediation
- Affected systems: `nanoclaw_business` (business_v2 schema), the NanoClaw host
  daemon, the sales agent instructions, and the daily `task-followup-daily` cron
- Outcome: an operator instruction to stop following someone up is now recorded
  against the party, honoured by the follow-up queue view, executed by the host
  on both the 👎 and the typed path, and confirmed from the rows the database
  returned rather than from the agent's intent.
- Files:
  - `data/business/migrations/nanoclaw-v2/113_followup_suppression.sql` — adds
    `parties.no_followup_at` / `no_followup_reason`, `fn_drop_followups`,
    `fn_resume_followups`, and the matching `v_sales_followup_queue` exclusion.
    `parties.dnd_at` was deliberately not reused: it means "unsubscribed via the
    email link" and is honoured by `v_active_pipeline`, so reusing it would also
    hide the lead from pipeline reporting.
  - `src/followup-drop.ts`, `src/followup-drop-parse.ts`,
    `src/followup-drop-deps.ts` and their tests — party-scoped drop plus a
    typed-instruction path.
  - `src/index.ts` — observes human messages in `#gru-sales`.
  - `groups/sales/WORKFLOWS.md` — the agent is told to use `fn_drop_followups`
    (party_id, no stage argument), to read back any state change before
    reporting it, and that skipping is not dropping.
- Safety properties of the typed path: it only ever drops a lead present in
  `v_sales_followup_queue`; it refuses to guess when a name matches more than
  one queued lead; it stays silent on draft edits that name no lead ("drop the
  pricing"); and it replies "matched no lead" instead of doing nothing silently
  when an explicit `#id` resolves to nothing.
- Verification:
  - 2026-07-27T14:55Z — `npx tsc --noEmit` clean.
  - 2026-07-27T14:55Z — 47 unit tests across the two new test files pass. Full
    suite: 172 failures, identical to the pre-existing failure set measured on a
    clean `HEAD` worktree (environment-dependent tests on this machine); the
    change adds 46 passing tests and no new failures.
  - 2026-07-27T14:58Z — migration 113 applied to `nanoclaw_business` on the Mac
    Mini; all statements committed.
  - 2026-07-27T14:59Z — clean rebuild on the Mac Mini after removing
    `tsconfig.tsbuildinfo`; `dist/followup-drop-parse.js`,
    `dist/followup-drop-deps.js`, `dist/followup-drop.js` emitted and
    `handleTypedDrop` present in `dist/index.js`.
  - 2026-07-27T14:59Z — daemon restarted via `launchctl kickstart -k`, running
    as pid 69020; startup log clean.
  - 2026-07-27T15:00Z — deployed wiring confirmed against the live
    `registered_groups` row mapping `slack:C0AHV1SGT6W` to folder `sales`.
  - Not yet verified: a live operator drop through the typed path, and a clean
    follow-up cron run. The next cron fires 2026-07-28 at 09:00.
- Deployment/migration: migration 113 applied and the daemon restarted, both on
  the Mac Mini only. The Mac Studio clone is not a runtime host.
- Data remediation: parties 10247, 10281, 10083, and 10407 suppressed;
  entries 213 and 239 moved to `nurture`. Entry 374 remains `won` and entry 345
  remains `lost` — the function does not touch terminal stages. The follow-up
  queue now returns zero rows for those parties.
- Rollback/recovery: `fn_resume_followups(party_id, reason)` per party; revert
  the view to migration 105 and drop the two functions and two columns to remove
  the schema change; revert the source files and rebuild.
- Documentation: `groups/sales/WORKFLOWS.md` updated in the same change.
- Follow-ups: commit the working tree; confirm the 2026-07-28 cron run drafts
  nothing for the suppressed parties; the duplicate `pipeline_entries` per party
  and duplicate parties per person remain an open data-quality issue that this
  change works around rather than resolves.

### NC-20260726-002 — Least-privilege inbound-document reader

- Date: 2026-07-26T21:44Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; deployed and
  live-verified before the review checkpoint; push pending
- Change class: C5 — new login identity and authorization boundary
- Affected systems: `business_v2.v_inbound_documents`, PostgreSQL role
  `bizmgr_reader`, and the bookkeeping read path
- Outcome: migration 111 exposes a normalized, one-row-per-document inbound-bill
  view; migration 112 creates a login role with only schema usage and SELECT on
  that view. The migration intentionally contains no password.
- Files: `data/business/migrations/nanoclaw-v2/111_v_inbound_documents.sql` and
  `112_bizmgr_reader_role.sql`.
- Verification:
  - 2026-07-28T12:03Z — read-only metadata query through the documented
    production host returned view exists = true, role exists = true, unexpected
    relation grants = 0;
  - migration 112 contains an assertion that rejects any additional relation
    grant at apply time;
  - no business rows, passwords, or credential values were retrieved during
    reconciliation.
- Protocol deviation: no active-work/changelog entry was created before the C5
  implementation or apparent production application. Original authorization,
  migration time, credential provisioning, and consumer end-to-end evidence are
  not reconstructable from tracked records.
- Deployment/migration: live objects verified; password/consumer connectivity
  deliberately not inspected.
- Rollback/recovery: revoke the view grant/schema usage and drop the role, then
  drop the view only under a separately authorized C5 rollback.
- Documentation: business guide, project map, active work, and this entry.
- Follow-ups: review and commit the migrations; confirm the downstream consumer
  through its own authorized release evidence.

### NC-20260726-001 — Structure-only schema reference refresh

- Date: 2026-07-26T08:00Z
- Owner/client: Claude Code + Codex reconciliation
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — internal generated documentation and refresh tooling
- Affected systems: `agent_docs/messages-db-schema.md`,
  `agent_docs/nanoclaw-business-pg-schema.md`, and `tools/refresh-schemas.sh`
- Outcome: the July 26 snapshots captured current SQLite/PostgreSQL structure.
  During NC-20260728-004, the SQLite output was found to contain one live sample
  row per table. All sample sections were removed; both schema files had trailing
  whitespace normalized; refresh now applies a deterministic sanitizer before
  replacing the tracked SQLite document.
- Verification:
  - sanitizer self-test covers populated and empty sample blocks while retaining
    multiple schema sections;
  - tracked schema documents contain no `Sample row:` marker;
  - the PostgreSQL snapshot is annotated with a migration-113 overlay because
    its generated timestamp predates that migration.
- Protocol deviation: the original schema refresh had no active-work/changelog
  entry and published live operational samples into a tracked file.
- Production/external state: the original refresh read live schemas; the
  reconciliation performed no database write.
- Rollback/recovery: revert the generated docs/tooling only; never reconstruct
  removed samples from Git.
- Documentation: project map and this entry.
- Follow-ups: after an authorized live refresh, verify the generated PostgreSQL
  snapshot supersedes the migration overlay without publishing rows.

### NC-20260724-002 — Bounded knowledge regeneration

- Date: 2026-07-24T17:08Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — internal knowledge/tool writes affecting C3 agent outputs
- Affected systems: `tools/regen-kb-delta.py`, its tests, knowledge
  manifest/state/source pieces, `KNOWLEDGE.md`, and shared/agent learned files
- Outcome: regeneration requests only affected sections and applies returned
  edits deterministically. Missing, ambiguous, or non-heading anchors fail
  closed before any knowledge/state write.
- Verification:
  - 2026-07-28 — 18 local splice/parser/batching/fail-closed checks passed;
  - the reconciliation did not call the external bridge or regenerate facts;
  - source-piece, manifest, state, and resulting knowledge changes remain
    available together for provenance review.
- Protocol deviation: implementation and generated knowledge changed after the
  protocol was introduced without an active-work/changelog entry.
- Deployment/external state: not established; tracked knowledge may be mounted
  by live agents through machine-local synchronization.
- Rollback/recovery: revert tool and knowledge artifacts as one provenance unit;
  never revert only the state file or only `KNOWLEDGE.md`.
- Documentation: active work and this entry.
- Follow-ups: human/Claude provenance review before commit; no external
  regeneration during code review.

### NC-20260724-001 — Fail-closed program schedule refresh

- Date: 2026-07-24T11:48Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — scheduler/tool and generated agent-context behavior
- Affected systems: `tools/refresh-schedule.py`, its tests, the
  machine-local `schedule-refresh` job, and Sales/Inbox/Booking schedule files
- Outcome: calendar-debug structures are rendered by program type; dates remain
  attached to their timezone track; a failed program fetch prevents every write.
- Verification: 2026-07-28 — 16 rendering/selection/fail-safe checks passed. No
  credential values or live calendar payloads were printed.
- Protocol deviation: implementation occurred after the protocol was introduced
  without an active-work/changelog entry.
- Deployment/external state: job registration and last-run state are
  machine-local and were not established from the repository.
- Rollback/recovery: disable the job before reverting the tool; retain the last
  known-good schedule rather than writing a partial file.
- Documentation: `docs/MINION-FRAMEWORK.md`, active work, and this entry.
- Follow-ups: review and commit; verify job registration/last result separately
  on the runtime host.

### NC-20260723-003 — Email program-language guard

- Date: 2026-07-24T00:37Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — host-side outbound content guard affecting C3 email
- Affected systems: `src/email-content-guard.ts` and its focused tests
- Outcome: block the known invented `MCT` acronym while allowing authoritative
  ICF URLs under `coachingfederation.org`.
- Verification: 2026-07-28 — all 10 content-guard tests passed as part of the
  195-test focused reconciliation set.
- Protocol deviation: implementation began after the shared protocol was added
  but no task/changelog entry was created.
- Deployment/external state: not established from tracked evidence.
- Rollback/recovery: revert the guard and tests; a rollback weakens outbound
  terminology enforcement and therefore requires explicit review.
- Documentation: active work and this entry.
- Follow-ups: review, commit, and establish deployment state before relying on
  the guard in production.

### NC-20260723-002 — Cross-client documentation continuity

- Date: 2026-07-23T16:19Z
- Owner/client: Codex
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 reversible internal CI/documentation control
- Affected systems: engineering workflow, documentation entry points, and
  pull-request CI
- Outcome: adds a shared change protocol, active-work register, engineering
  changelog, and required Claude/Codex entry-point links.
- Files: `CLAUDE.md`, `AGENTS.md`, `docs/CHANGE-PROTOCOL.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`,
  `docs/PROJECT-MAP.md`, `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`,
  `scripts/check-doc-continuity.mjs`, `package.json`,
  `.github/workflows/ci.yml`
- Verification: Claude adversarial protocol review completed; accepted
  corrections are incorporated. 2026-07-23T16:21Z — `node --check
  scripts/check-doc-continuity.mjs`, `npm run docs:continuity-check`,
  `npm run typecheck`, and `git diff --check` passed.
- Deployment/migration: not applicable; no application or external state change
- Rollback/recovery: revert only these documentation changes
- Documentation: this entry is part of the change
- Follow-ups: review and commit the documentation set

### NC-20260723-001 — Company operating-system improvement plan

- Date: 2026-07-23T16:19Z
- Owner/client: Codex with Claude Code/Opus adversarial validation
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C1 documentation/plan
- Affected systems: none yet; roadmap covers the full NanoClaw operating system
- Outcome: creates a source-evidenced, phased improvement plan and prioritized
  first 20 tickets.
- Files: `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`,
  `docs/PROJECT-MAP.md`
- Verification: `git diff --check` passed; document has unique headings; Claude
  validation record includes accepted, corrected, and rejected findings
- Deployment/migration: not applicable; plan is proposed, not implemented
- Rollback/recovery: remove the plan and project-map index row
- Documentation: project map indexes the plan
- Follow-ups: leadership decisions and review before implementation

## Released

Add committed/released entries here without rewriting their historical
evidence. Include commit, deployment, migration, and live-verification details
only after each boundary is actually crossed.
