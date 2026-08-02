# NC-20260802-003/004/005 — Claude adversarial architecture review R1

- Task IDs: `NC-20260802-003`, `NC-20260802-004`, `NC-20260802-005`
- Reviewer: Claude Code (Opus 5)
- Request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R1.md`
- Branch/base: `codex/nc-20260802-003-company-os-sequence` @ `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Class: C0 read-only analysis; no source, schema, prompt, service, or external
  state was changed by this review
- Date: 2026-08-02T17:51Z

## 1. Verdict

**APPROVE WITH REQUIRED CHANGES.**

The three slices target real, correctly-identified defects, and the authority
ordering (Heartbeat authoritative for facts, SQLite for operational
correlation, no autonomous student-facing action) is right. The direction
should proceed.

Seven P0 findings must be resolved before production code is written. Two of
them (P0-3, P0-7) cannot be closed inside the repository — they need one
bounded live observation or an owner decision. The remaining five are design
corrections that fit inside the proposed slices.

The single most consequential finding is **P0-6**: NC-005's entire terminal-state
contract rests on a Slack verdict marker that no tracked source specifies and
that no component is instructed to emit. It currently works only as an emergent
side effect of an unrelated display-prefix feature, and it has never been
validated against a real grader verdict.

Per-slice verdicts:

| Slice | Verdict | Blocking findings |
| --- | --- | --- |
| NC-003 release activation | approve with required changes | P0-1, P0-2 |
| NC-004 submission index | approve with required changes | P0-3, P0-4, P0-5 |
| NC-005 coordinator | approve with required changes | P0-6, P0-7 (both depend on NC-004 fixes) |

NC-003 may proceed to implementation once P0-1/P0-2 are folded in. NC-004 and
NC-005 must not start until P0-3 and P0-7 have owner answers (§7).

## 2. Findings

Ordered P0 → P2. Line references are to this worktree at `0f20224`.

### P0-1 — Rendering the candidate plist from the tracked template silently reverts machine-local service configuration

**Evidence.** `setup/launchd/com.nanoclaw.plist:19` sets
`NANOCLAW_CODE_ROOT=/Users/xbohdpukc/dev/NanoClaw` — the operational checkout,
not a release directory, contradicting `docs/RELEASE-INTEGRITY.md:115`.
`setup/launchd/com.nanoclaw.plist:31-32` names
`/opt/homebrew/opt/node@22/bin/node` and `…/dev/NanoClaw/dist/index.js`. But
`docs/ACTIVE-WORK.md:153-158` (NC-20260731-003) records that production Node was
installed at `~/.local/node/22.23.2` and **launchd was repointed at it**, because
the previous interpreter was 25.8.2 and `assertExactNodeVersion`
(`src/release-integrity.ts:73-84`) refuses anything but the exact pin. The
tracked template also carries `MAX_CONCURRENT_CONTAINERS=10` (line 11-12), a
specific `PATH` (line 22-23), and fixed log paths — none of which the activation
task owns.

**Failure.** Activation renders a candidate from the tracked template, writes
the release commit and code root correctly, and simultaneously reverts the
interpreter to a floating Homebrew symlink and resets unrelated operational
tuning. Startup then refuses on the Node check, and `KeepAlive` (line 25-26)
turns the refusal into a permanent 10-second respawn loop.

**Required change.** The candidate must be produced by **parsing the currently
installed plist and setting exactly the identity fields**, never by re-rendering
`setup/launchd/com.nanoclaw.plist` or by reusing the generator at
`setup/service.ts:100-137`. Preflight must diff candidate against installed and
refuse if any key other than `ProgramArguments[1]`, `NANOCLAW_CODE_ROOT`, and
`NANOCLAW_EXPECTED_RELEASE_COMMIT` changed. If a release genuinely needs to
change another key, that is a separate, explicitly-listed, reviewed field.

### P0-2 — The two paired fields fail asymmetrically, and the silent one is invisible after activation

**Evidence.** `NANOCLAW_EXPECTED_RELEASE_COMMIT` mismatch is a hard startup
refusal (`src/release-integrity.ts:173-179`). `NANOCLAW_CODE_ROOT` is read
exactly once, at `src/container-runner.ts:138`:
`process.env.NANOCLAW_CODE_ROOT || projectRoot`. A missing or stale value is
**not** an error — it silently falls back to the operational checkout.
`ReleaseIdentity` (`src/release-integrity.ts:20-29`) has no `codeRoot` field, and
`/health` returns exactly that object (`src/index.ts:1431`,
`src/webhook-server.ts:60`).

**Failure.** Activation updates the commit but not the code root (or updates it
to a pruned/incorrect path). Startup succeeds, `/health` reports
`release.verified=true` with the intended commit, every documented deployment
check in `docs/RELEASE-INTEGRITY.md:119-121` passes — and every container is
still mounting agent-runner source and skills from the old checkout. The
activation contract's own stated purpose ("changes the release code root and
expected full commit together") is unverifiable with the current health surface.

**Required change.** Add `codeRoot` (resolved, absolute) and a
`codeRootMatchesRelease` boolean to `ReleaseIdentity`, populate it in
`verifyRuntimeRelease()`, and expose it in `/health`. Activation's
post-reload verification must assert the reported `codeRoot` equals the intended
release directory, not only the commit. Separately consider making a
`NANOCLAW_CODE_ROOT` that does not contain a verifying `dist/release-manifest.json`
a startup refusal when `NANOCLAW_REQUIRE_RELEASE_MANIFEST=1`; that is the change
that makes the pair genuinely atomic rather than merely written together.

### P0-3 — The mandated primary key may not exist on the only permitted surface

**Evidence.** The request requires "a non-empty real Heartbeat submission ID as
the primary key" and forbids inventing a Heartbeat API — the signed-in browser
is the only surface. The operator procedure, which is the only artifact
describing what that surface actually shows, never mentions a submission ID.
`references/batch-ledger.md:9-11` defines the row key as `queue_key` =
"Normalized student, assignment, and submission time". `references/approval-index.md:16-26`
keys on canonical assignment title plus `submission_time`. SKILL.md:78-79 projects
"submission time, student, exact assignment, text presence, attachment presence"
— no identifier.

**Failure.** Implementation begins, discovers no stable opaque ID is exposed,
and the operator synthesizes one from student+assignment+timestamp. That is
precisely the composite identity `docs/ACTIVE-WORK.md:80-82` forbids from
becoming "a second submission identity" — except now it is the *primary* one,
with all of the collision and rename fragility the constraint was written to
prevent, and with no way to detect the substitution afterwards.

**Required change.** Before any schema work, one bounded live observation must
record whether a Heartbeat submission row or detail view exposes a stable
identifier that (a) is visible from the queue projection, (b) survives an
Approve/Retry transition, and (c) differs between a first attempt and a
resubmission. Record the answer in the task record. If the answer is no, the
identity design must change deliberately (§7, Decision 1) rather than by
implementation default.

### P0-4 — "Idempotent duplicate" and "stale writers fail" are contradictory under version-only optimistic concurrency

**Evidence.** The proposal states both "Use typed, optimistic transitions with
expected version and legal state checks" and "A duplicate observation is
idempotent; stale writers fail."

**Failure.** Under version-only OCC these are the same event. The operator's
browser tab reconnects (SKILL.md:130-132 explicitly plans for this) and replays
the *same* Heartbeat approval observation. The row's version has already been
bumped by the first apply, so the expected-version check fails and the
identical, correct observation is rejected as a stale write. The operator sees
a conflict for an action that in fact succeeded, and the documented recovery
("reconcile the cached ledger once against the live queues") has no way to tell
a genuine conflict from a benign replay.

**Required change.** Transitions carry a caller-supplied
`observation_key TEXT NOT NULL UNIQUE`, derived from the observation's own
content (source, submission ID, observed state, and the operator's run ID) and
**not** from the record version. Apply logic, inside one transaction:

1. if `observation_key` already exists → return the recorded outcome unchanged
   (idempotent, no version bump);
2. else if `expected_version != current_version` → reject as stale;
3. else if the transition is not legal from the current state → reject with the
   attempted and current states;
4. else apply, bump version, append the transition row.

### P0-5 — The schema has no course dimension and no run dimension, but NC-005's two central gates require both

**Evidence.** The proposed columns are "stable IDs/keys, assignment/status
metadata, timestamps, hashes, Slack root/file IDs, verdict/writeback state,
source last-seen state, and integer version". NC-005 requires (a) "Phase 1
chooses only Modules 1-5 while live `Complete (no feedback)` is non-zero" — a
count that SKILL.md:134-136 scopes to one opened Heartbeat *course*; and (b)
Module 6 prerequisites "explicitly observed approved in Heartbeat during the
**current run**". `~/dev/grading/courses.json` defines four enrollable courses
(`foundation`, `acc-bars`, `pcc-markers`, `mcc-bars`), only one of which issues a
certificate, and each with a different `required[]` set.

**Failure.** Without a course key the eight-prerequisite gate is hard-coded to
Foundation and the index cannot represent an ACC/PCC/MCC submission at all — the
first non-Foundation submission either collides on assignment title or is
silently excluded from the Phase 1 count. Without a run key the coordinator
literally cannot evaluate its own headline invariant; it will fall back to "most
recent observation", which is the cached-approval failure mode
`references/approval-index.md:83-89` exists to prevent.

**Required change.** Add `course_key TEXT NOT NULL` to the submission row and a
`grading_runs` table with `run_id` referenced by every observation transition.
Both gates then become expressible as plain predicates (§4.3).

### P0-6 — NC-005's terminal verdict marker has no specified producer and has never been validated

**Evidence — the consumer.**
`~/dev/toolbox/shared/slack/tools/slack/poll-grader-threads.sh:51-63` classifies
a thread by matching replies against `\[grader\]\s+(PASS|NO PASS)`; anything
else is `pending`/`processing`. `references/decision-rules.md:24-30` makes that
marker the *only* legal routing signal ("Never route based only on positive or
negative prose. Require a valid verdict marker").

**Evidence — the producer.** `groups/grader/CLAUDE.md:124-126` instructs only:
"Post the verdict + feedback to Slack FIRST (verdict on its own line…)". The
string `[grader]` appears **nowhere** in `groups/`, `src/`, `docs/` (excluding
this report), or `~/dev/grading/` outside one 2026-07-05 Claude Code
transcript, where it is a thread-display label and not a verdict. The prefix is
produced incidentally by `src/channels/slack.ts:777-780`:

```ts
const prefix = fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
const displayText = prefix + text;
```

**Failure.** The regex matches only when the grader's message begins with the
literal token `PASS` or `NO PASS` — because `[grader]\n` is prepended, and `\s+`
consumes the newline, so anything between the prefix and the verdict breaks the
match. Two independent ways this silently fails today:

1. the grader opens with a sentence, a student name, or a heading and puts the
   verdict on a later line — permitted by its prompt, unmatched by the regex;
2. the grader's message itself starts with `[` — the discrepancy-gate flag
   (`groups/grader/CLAUDE.md:104-115`), a held calibration notice, or the
   `[HANDOFF: grader→certifier]` emission (line 147-150) — in which case
   **no prefix is added at all** and no marker can ever appear.

In both cases the coordinator holds the item forever. That is fail-closed, which
is correct, but it means the pipeline silently stops draining and the failure
looks identical to "the grader is slow". `docs/ENGINEERING-CHANGELOG.md:97-99`
confirms the NC-001 canary produced no learner verdict — the grader flagged the
synthetic identity instead — so **this path has never once been exercised against
a real verdict.**

**Required change.** Make the marker an explicit, tracked contract before the
coordinator depends on it:

1. amend `groups/grader/CLAUDE.md` Step 6 to require the message's first line to
   be exactly `[VERDICT] PASS` or `[VERDICT] NO PASS` — a token the grader emits
   itself, independent of the display prefix, and immune to the `startsWith('[')`
   suppression;
2. keep the existing `\[grader\]\s+(PASS|NO PASS)` match as a compatibility
   fallback for in-flight threads;
3. treat *both markers present and disagreeing*, and *the token present more
   than once with different verdicts*, as `contradictory` → hold;
4. add a host-side regression over a captured real grader message, not a
   synthetic one.

Until (1) ships, NC-005 must classify an unmatched thread as `awaiting_marker`
and surface it as an operator escalation after a bounded age, never as `pending`.

### P0-7 — The eight "canonical assignment titles" disagree across sources, and none of them is tracked or release-bound

**Evidence.** `references/decision-rules.md:64-73` lists eight required titles.
`~/dev/grading/registry.json` lists the same assignments under different titles:

| decision-rules.md | registry.json |
| --- | --- |
| `Module 3 Assignment: Managing the MC Process` | `Module 3: Mentor Coaching Development Plan` |
| `Module 5 Assignment: Facilitating Client Skill Development` | `Module 5: Developmental Feedback Document` |
| `Module 1 Assignment Part 2: Ethical Scenario Analysis` | `Module 1 Part 2: Ethical Scenario Analysis` |
| `Module 4 Assignment Part 2: Session Analysis of Recording A` | `Module 4 Part 2: Session Analysis of Recording A` |

The M3 and M5 rows are not wording variants — they are different assignment
names. At most one set matches what Heartbeat actually renders today.

Neither source is portable. `~/dev/grading` reaches the grader only as a runtime
mount (`scripts/register-grader.ts:50-58`, `hostPath: '~/dev/grading'`), and the
release archive bundles only `.nvmrc`, `package.json`, `package-lock.json`,
`container`, `groups`, `launchd`, `setup/launchd`
(`scripts/build-release.mjs:88-97`). The operator skill lives outside the
repository entirely and the request itself labels it "evidence, not repository
authority".

**Failure.** NC-005 hard-codes eight title strings in host code. If they are the
decision-rules set and Heartbeat renders the registry set (or vice versa), every
Module 6 candidate is permanently ineligible, no certificate is ever flagged,
and the coordinator reports a clean, confident "prerequisites not met". Nothing
in the design detects a title that matches zero live rows. A third divergent copy
of a business-critical mapping also violates `docs/CHANGE-PROTOCOL.md:113-116`
(step 7: authoritative files must be Git-trackable; a local runtime copy is not
portable source authority).

**Required change.**

1. Create one tracked, versioned mapping file in the NanoClaw repository —
   `data/grading/course-prerequisites.json` — holding, per course key: the exact
   Heartbeat assignment title, the grading-system `code`, the module number, the
   submission type (`knowledge` | `written`), and whether it is the Module 6
   gated item. It is Git-tracked, therefore release-bundled and reviewable.
2. The coordinator loads only that file. It never embeds titles in TypeScript.
3. Add a validation command that cross-checks the file against
   `~/dev/grading/registry.json` and `courses.json` when those are reachable, and
   fails loudly on divergence rather than preferring either.
4. The coordinator must treat "a required title matched zero observed rows for
   this student in this run" as a distinct `title_unmatched` escalation, not as
   `missing prerequisite`. A systematic rename then surfaces as a mapping
   defect within one run instead of as silent, permanent ineligibility.

### P1-1 — Preflight does not validate the interpreter, and `KeepAlive` turns a refusal into a crash loop

`setup/launchd/com.nanoclaw.plist:31` names `/opt/homebrew/opt/node@22/bin/node`,
a Homebrew symlink that floats to the newest 22.x on `brew upgrade`.
`src/release-integrity.ts:163` demands the **exact** manifest pin. `KeepAlive`
(line 25-26) plus `RunAtLoad` (line 34-35) means a refusing daemon respawns every
~10 seconds indefinitely. Preflight must execute the candidate plist's
`ProgramArguments[0] --version` and compare it to `manifest.nodePin`, and must
refuse activation on mismatch. Checking that the path exists is not sufficient.

### P1-2 — The rollback artifact's validity is asserted, not verified

"Create a non-overwriting rollback copy" guarantees a file exists; it does not
guarantee the file still describes a working service. Two concrete failures: the
prior immutable release directory under `~/.local/share/nanoclaw-releases/` may
have been pruned, so the rollback plist points at nothing; and on a second
activation attempt after a failed first, "copy the currently installed plist"
captures the *bad* candidate as the rollback. Required: capture the rollback copy
only from a plist that was healthy at the start of this activation, verify the
release directory it references still passes `scripts/verify-release.mjs`, record
the exact rollback path in the activation result, and roll back by that recorded
path only — never by "most recent backup".

### P1-3 — `unload`/`load` is not atomic, does not wait, and contends for the listener and the database

Legacy `launchctl unload` returns before the process exits. The old daemon holds
`:8088` (`src/webhook-server.ts`) and the SQLite file; the new one binding first
gets `EADDRINUSE`, exits, and respawns under `KeepAlive`. The evidence standard
already in use recognizes this — `docs/ACTIVE-WORK.md:448-450` records "One
daemon (PID 42265) owns `:8088`". Activation must: `plutil -lint` the candidate
before install; unload; wait with a bounded timeout for the prior PID to exit
and the listener to be released; load once; then poll `/health` until it reports
`release.verified=true`, the intended full commit, **and** the intended
`codeRoot` (P0-2), or roll back. "Perform one unload/load cycle" is not by
itself a success condition.

### P1-4 — SQLite has no WAL, no busy timeout, and no foreign-key enforcement, but the new index gets at least three writers

`src/db.ts:349-358` opens the database with `new Database(dbPath)` and no
`PRAGMA` at all — no `journal_mode=WAL`, no `busy_timeout`, no
`foreign_keys=ON`. The submission index will be written by the host daemon (IPC
receipts), a coordinator CLI in a separate process, and the operator's writeback
path. Under the default rollback journal, a reader blocks a writer and
`SQLITE_BUSY` surfaces as a hard throw.

Required: every transition runs as a single `BEGIN IMMEDIATE` transaction
covering read, version check, update, and transition insert; set an explicit
busy timeout on the connection; and **do not declare a foreign key** from
transitions to submissions — with `foreign_keys` off it is decorative and would
create a false sense of referential safety. Enforce parent existence inside the
same transaction instead.

### P1-5 — There is no versioned SQLite migration system; the new tables must live in `createSchema()`

`src/db.ts:20-347` is the entire host schema: `CREATE TABLE IF NOT EXISTS`
blocks followed by try/catch `ALTER TABLE` statements. `_initTestDatabase()`
(line 361-364) calls the same function, which is why every existing table is
testable in memory. NC-004 must extend `createSchema()` and must not introduce a
parallel migration runner for SQLite (the ordered-migration discipline in
`data/business/migrations/nanoclaw-v2/` is PostgreSQL-only). `agent_docs/messages-db-schema.md`
must be regenerated via `tools/refresh-schemas.sh` in the same change,
structure-only.

### P1-6 — Knowledge checks are prerequisites but never receive a Slack root or a grader verdict

Three of the eight Module 6 prerequisites are knowledge checks
(`references/decision-rules.md:66,68,71`), and SKILL.md:157-159 states plainly:
"Validate the certificate locally. Do not send it to Slack." If the index makes
Slack root, file ID, or verdict non-nullable, those three rows cannot exist and
the gate can never be satisfied. Required: a `submission_type` discriminator
(`knowledge` | `text` | `file`), with Slack/verdict columns nullable and a CHECK
constraint asserting that a `knowledge` row has no Slack root and no grader
verdict, while a `text`/`file` row that reached `graded` has both.

### P1-7 — A single permanent exception blocks Module 6 forever, and the design cannot distinguish that from "still draining"

Phase 1 gates on the live `Complete (no feedback)` count reaching zero, and
SKILL.md:97-99 is explicit that "A ledger `exception` does not drain a Heartbeat
row." An unreadable attachment therefore parks one row in that queue
permanently, and every Module 6 item — for every student — is blocked
indefinitely. Required: the coordinator returns a distinct `phase_1_blocked`
result carrying the exact blocking rows and their exception reasons, separate
from `phase_1_draining` and from `no_work`. An operator-acknowledged exception
must be representable as a state that excludes the row from the blocking set
without pretending the Heartbeat row was drained.

### P1-8 — The "current run" invariant contradicts the operator procedure's durable cache

The request requires prerequisites "explicitly observed approved in Heartbeat
during the current run". `references/approval-index.md:73-89` and SKILL.md:50-58
deliberately built the opposite: a durable cache reused after a live
assignment/date **vector** comparison via `scripts/check-approval-cache.py`. Both
are defensible; implementing them silently differently is not.

Recommended reconciliation, which satisfies both documents' safety intent: an
approval is usable iff, **during the current run**, the coordinator holds an
observation whose `(assignment_title, submitted_at, status)` triple was compared
against a live Heartbeat projection recorded with a `projected_at` inside this
run. Reuse is then always backed by a current-run live read of the vector; only
the expensive per-row drill-down is cached. Whichever rule is chosen must be
stated as an invariant in the task record, because the cheaper rule is
indistinguishable from the stricter one by inspecting the code.

### P1-9 — Two live thresholds disagree about knowledge-check approval (owner decision)

`references/decision-rules.md:10` requires "greater than 85 percent", and
`SKILL.md:368` adds "Treat exactly 85 percent as not eligible for automatic
approval".
`~/dev/grading/registry.json` `quiz_certificates.rule` says "PASS if the uploaded
certificate shows 80%+", and `~/dev/grading/courses.json` records each quiz as
"80%". A certificate showing 82% is a pass by the grading system's own rule and a
hold by the operator procedure. This is a live business discrepancy affecting
real students today, independent of these three slices. See §7, Decision 3.

The design consequence is narrow and should be adopted regardless of the answer:
**the coordinator must never evaluate a score.** It records only the operator's
verified Heartbeat status. No threshold constant belongs in NanoClaw source.

### P2-1 — The five-root ceiling is a coordinator output bound, not an enforceable concurrency guarantee

`scripts/register-grader.ts:46,49` sets `threadPerMessage: true` and
`idleTimeout: 30000` so five roots *can* occupy five slots, but the global
ceiling is shared: `setup/launchd/com.nanoclaw.plist:11-12` sets
`MAX_CONCURRENT_CONTAINERS=10` across every group. Five grader roots plus Sales,
Mailman, and scheduled work can saturate it. State the invariant as "the
coordinator emits at most five unresolved roots" and do not describe it as
five-way parallel grading.

### P2-2 — The coordinator must not become a container-reachable capability

`docs/PROJECT-MAP.md:511-523` requires binding a request's claimed group to
container state. If the coordinator is exposed through the shared MCP namespace,
the grader agent can read and influence its own scheduling. The coordinator is a
host library plus an operator CLI; it must not appear in
`container/agent-runner/src/ipc-mcp-stdio.ts` and a negative test should assert
that a `grading_plan`-style IPC from any container is quarantined.

### P2-3 — Hashing the student name is false privacy and breaks a required output

The privacy boundary correctly forbids bodies, feedback, and attachment URLs.
A hashed student name, however, is trivially reversible against a known roster,
so it provides no real protection — and the run must still emit
`CERTIFICATE READY - STUDENT NAME` (SKILL.md:358-360). Store the display name in
the clear (already durable in `~/dev/grading/students/<slug>/record.json` and
visible in every Slack root) and reserve hashing for the downloaded file bytes,
where it has genuine integrity value.

### P2-4 — `AbandonProcessGroup` means activation does not reset container state

`setup/launchd/com.nanoclaw.plist:5-6` sets `AbandonProcessGroup`, and NC-002
made the new daemon adopt live sidecars with their original absolute deadline.
Containers spawned before activation keep the mounts derived from the *previous*
`NANOCLAW_CODE_ROOT` (`src/container-runner.ts:138`) and are not corrected by a
rollback. Record this as a declared residual in the activation contract, in the
same register as the writable group-workspace residual already noted at
`docs/RELEASE-INTEGRITY.md:123-130`.

### P2-5 — The grader's own durable record is a third system of record and should be bound, not ignored

`groups/grader/CLAUDE.md:124-136` writes `record.json`, `ledger.csv`, and
`<code>__r<N>__result.md` per attempt, append-only. That is an independent,
already-durable verdict record. Storing a nullable
`grading_record_ref` (slug, code, attempt N) on the index row costs almost
nothing and lets the coordinator detect the two divergence cases that otherwise
look identical to a stall: the grader persisted a verdict but Slack shows none
(P0-6's failure mode), and Slack shows a verdict with no persisted record
(an interrupted Step 6).

## 3. Corrected authority and state model

### 3.1 Authority

| Fact | Authority | Everything else is |
| --- | --- | --- |
| Submission exists, its status, course completion | Heartbeat, read through the signed-in browser | an observation with a timestamp and a run ID |
| Written verdict for one submission | the grader's Slack verdict **and** its `record.json` attempt | correlated evidence; disagreement is a hold |
| Knowledge-check result | Heartbeat | never computed by NanoClaw |
| Required prerequisites per course | tracked `data/grading/course-prerequisites.json` | validated against `registry.json`/`courses.json`, never inferred |
| Slack delivery of one artifact | the durable receipt (`src/grader-file-message.ts:37-52`) | delivery evidence only, never workflow state |
| Process state (what to do next) | `store/messages.db` submission index | Slack threads and agent sessions are views |
| Running code identity | `dist/release-manifest.json` + `/health` | the installed plist is the *intent*, not the proof |

### 3.2 Invariants

**Release activation (NC-003)**

- I1. Exactly three fields change: `ProgramArguments[1]`, `NANOCLAW_CODE_ROOT`,
  `NANOCLAW_EXPECTED_RELEASE_COMMIT`. Any other diff against the installed plist
  aborts before mutation.
- I2. The candidate's interpreter is executed and its version equals
  `manifest.nodePin` exactly, before mutation.
- I3. The rollback plist is captured from a plist proven healthy at the start of
  this activation, its referenced release directory verifies, and its absolute
  path is returned in the activation result.
- I4. The installed plist is replaced by `rename(2)` within the same directory,
  after `plutil -lint` passes on the candidate.
- I5. Exactly one unload/load cycle occurs, bounded-waiting for prior-PID exit
  and listener release between them.
- I6. Activation succeeds only when `/health` reports `release.verified=true`,
  the intended full commit, **and** the intended `codeRoot`.
- I7. Failure after replacement restores the recorded rollback plist and attempts
  exactly one bounded load. Activation never rebuilds, never edits `dist/`, and
  never retries the candidate.
- I8. `prepare` performs no privileged operation, no `launchctl` call, and no
  write outside a scratch directory; it is the only part covered by ordinary
  unit tests.

**Submission index (NC-004)**

- I9. One row per real Heartbeat submission, keyed by `submission_id`, scoped by
  `course_key`. A resubmission is a new row, ordered by `submitted_at`.
- I10. `upload_idempotency_key` is UNIQUE where present, binding the Slack
  delivery receipt to exactly one submission row.
- I11. No submission body, feedback text, attachment URL, Slack file URL, or
  unrelated student message is ever persisted.
- I12. Every state change is one `BEGIN IMMEDIATE` transaction performing:
  observation-key idempotency check → expected-version check → legal-transition
  check → row update → append-only transition insert.
- I13. `transitions` is append-only. No `UPDATE` or `DELETE` statement targets
  it anywhere in the codebase.
- I14. A `heartbeat_observation` transition carries `run_id`, `observed_at`, and
  `source='heartbeat'`. A `heartbeat_writeback_confirmed` transition is a
  distinct type and never inferred from an observation.
- I15. A `knowledge` row has no Slack root and no grader verdict; a `text`/`file`
  row in a graded state has both.

**Coordinator (NC-005)**

- I16. Pure function: `(indexed rows, run snapshot) → plan`. No I/O, no clock
  read, no Slack call, no Heartbeat call, no database write.
- I17. Not reachable from any container. Host library plus operator CLI only.
- I18. Phase 1 emits only Modules 1-5 while live `Complete (no feedback)` for the
  course is non-zero, and distinguishes `phase_1_draining`, `phase_1_blocked`
  (with the exact blocking rows), and `no_work`.
- I19. At most five unresolved posted/processing roots for the course; all
  outstanding root timestamps are returned as one batch matching
  `slack/poll-grader-threads --channel ID --thread-ts TS[,TS…]`.
- I20. Module 6 is eligible only when every prerequisite in the tracked mapping
  for that course has a current-run Heartbeat-sourced `approved` observation, no
  newer unresolved or retry row exists, and no prerequisite title matched zero
  observed rows.
- I21. Missing, contradictory, or unmatched markers hold the item. The
  coordinator never issues a certificate, never emits student-facing text, and
  never uses grader-authored completion claims (`groups/grader/CLAUDE.md:137-145`
  is explicitly *not* an input).
- I22. Every hold carries a machine-readable reason and the evidence that would
  clear it.

## 4. Minimal file, API, and schema plan

### 4.1 NC-003 — release activation

**New**

- `src/release-activation.ts` (~180 lines) — pure/testable core:
  `parseInstalledPlist(xml)`, `renderCandidate(installed, {codeRoot, commit, execPath})`,
  `diffCandidate(installed, candidate)` → the allowed-change assertion (I1),
  `planActivation(...)` → the ordered step list plus the rollback path.
  No `child_process`, no `launchctl`, no writes.
- `src/release-activation-exec.ts` (~140 lines) — the privileged half:
  `plutil -lint`, interpreter version probe (I2), rollback capture and
  verification (I3), atomic rename (I4), bounded unload/wait/load (I5),
  `/health` assertion (I6), rollback (I7).
- `scripts/activate-release.mjs` — CLI with `--release-dir`, `--commit`,
  `--plist`, `--dry-run` (default), `--apply`. Refuses `--apply` without an
  explicit `--confirm-host <hostname>` match.
- `src/release-activation.test.ts` — covers §5.1.

**Changed**

- `src/release-integrity.ts` — add `codeRoot` and `codeRootMatchesRelease` to
  `ReleaseIdentity`; populate in `verifyRuntimeRelease()` (P0-2).
- `docs/RELEASE-INTEGRITY.md` — replace §Activation steps 6-9 with the single
  validated operation and the seven invariants; document the new health fields.

**Explicitly not changed in this slice:** `setup/launchd/com.nanoclaw.plist`,
`setup/service.ts`, any installed plist, any launchd unit, any release
directory, any production process.

### 4.2 NC-004 — submission index

Added to `createSchema()` in `src/db.ts` (P1-5), with no foreign keys (P1-4):

```sql
CREATE TABLE IF NOT EXISTS heartbeat_submissions (
  submission_id            TEXT PRIMARY KEY,          -- real Heartbeat ID (P0-3)
  course_key               TEXT NOT NULL,             -- P0-5
  student_name             TEXT NOT NULL,             -- display name (P2-3)
  student_slug             TEXT NOT NULL,             -- joins the grading record
  assignment_title         TEXT NOT NULL,             -- exact Heartbeat title
  assignment_code          TEXT,                      -- grading-system code, nullable
  submission_type          TEXT NOT NULL,             -- knowledge|text|file (P1-6)
  submitted_at             TEXT NOT NULL,             -- ordering authority (I9)
  state                    TEXT NOT NULL,             -- see the state set below
  version                  INTEGER NOT NULL DEFAULT 1,
  upload_idempotency_key   TEXT,                      -- UNIQUE where present (I10)
  slack_root_ts            TEXT,
  slack_file_ids           TEXT,                      -- JSON array of Slack file IDs
  artifact_sha256          TEXT,                      -- downloaded file bytes only
  grader_verdict           TEXT,                      -- pass|no_pass|contradictory
  grader_verdict_ts        TEXT,
  grading_record_ref       TEXT,                      -- slug/code/attempt (P2-5)
  writeback_action         TEXT,                      -- approve|retry
  writeback_confirmed_at   TEXT,
  source_last_state        TEXT,                      -- last observed Heartbeat status
  source_last_seen_run_id  TEXT,
  source_last_seen_at      TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  CHECK (submission_type IN ('knowledge','text','file')),
  CHECK (submission_type <> 'knowledge'
         OR (slack_root_ts IS NULL AND grader_verdict IS NULL))   -- I15
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hb_sub_idem
  ON heartbeat_submissions(upload_idempotency_key)
  WHERE upload_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hb_sub_open
  ON heartbeat_submissions(course_key, state, submitted_at);
CREATE INDEX IF NOT EXISTS idx_hb_sub_prereq
  ON heartbeat_submissions(course_key, student_slug, assignment_title, submitted_at);

CREATE TABLE IF NOT EXISTS heartbeat_submission_transitions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id    TEXT NOT NULL,
  observation_key  TEXT NOT NULL UNIQUE,     -- idempotency, not versioning (P0-4)
  run_id           TEXT NOT NULL,            -- P0-5
  kind             TEXT NOT NULL,            -- transition type
  source           TEXT NOT NULL,            -- heartbeat|slack_receipt|grader|operator
  from_state       TEXT NOT NULL,
  to_state         TEXT NOT NULL,
  from_version     INTEGER NOT NULL,
  to_version       INTEGER NOT NULL,
  detail           TEXT,                     -- bounded JSON, no body/feedback/URL
  observed_at      TEXT NOT NULL,
  recorded_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hb_trans_sub
  ON heartbeat_submission_transitions(submission_id, id);
CREATE INDEX IF NOT EXISTS idx_hb_trans_run
  ON heartbeat_submission_transitions(run_id, kind);

CREATE TABLE IF NOT EXISTS grading_runs (
  run_id      TEXT PRIMARY KEY,
  course_key  TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  operator    TEXT NOT NULL
);
```

States: `observed`, `prepared`, `posted`, `processing`, `graded_pass`,
`graded_no_pass`, `awaiting_marker`, `held`, `writeback_pending`,
`writeback_confirmed`, `exception`.

Transition kinds: `heartbeat_observed`, `artifact_prepared`,
`slack_delivery_receipt`, `grader_verdict_observed`, `writeback_submitted`,
`heartbeat_writeback_confirmed`, `held`, `exception_recorded`,
`exception_acknowledged`.

**New module** `src/heartbeat-submission-index.ts` (~200 lines):

```ts
recordObservation(o: HeartbeatObservation): TransitionResult
applyTransition(t: SubmissionTransition): TransitionResult
getSubmission(id: string): SubmissionRow | undefined
listOpen(courseKey: string): SubmissionRow[]
listPrerequisiteStates(courseKey, studentSlug, runId): PrerequisiteState[]
startRun(courseKey, operator): string
```

`TransitionResult` is a discriminated union:
`{applied} | {idempotent, priorTransitionId} | {stale, currentVersion} | {illegal, from, to}`.
It never throws for a normal conflict — a thrown error means a bug.

**Changed:** `src/ipc.ts:606` records a `slack_delivery_receipt` transition when
`dispatchGraderFileMessage` returns `complete` or `duplicate_complete`, keyed by
the payload's `idempotency_key`, so delivery evidence enters the index at its
only authoritative moment. `agent_docs/messages-db-schema.md` regenerated
structure-only.

### 4.3 NC-005 — coordinator

**New**

- `data/grading/course-prerequisites.json` — tracked mapping (P0-7).
- `src/grading-coordinator.ts` (~200 lines), pure:
  `planGradingRun(snapshot: RunSnapshot, rows: SubmissionRow[], map: PrerequisiteMap): GradingPlan`.
- `src/grading-verdict-marker.ts` (~60 lines) — the only place the marker regex
  exists; exports `classifyVerdict(threadReplies): 'pass'|'no_pass'|'contradictory'|'awaiting_marker'|'processing'`.
- `scripts/grading-plan.mjs` — read-only CLI emitting the plan as JSON.
- Tests per §5.2/§5.3.

```ts
interface RunSnapshot {
  runId: string;
  courseKey: string;
  liveCompleteNoFeedbackCount: number;   // per course, includes knowledge checks
  liveNeedsApprovalCount: number;
  projectedAt: string;                   // this run's live vector read (P1-8)
}

interface GradingPlan {
  phase: 'phase_1_draining' | 'phase_1_blocked' | 'phase_2_module_6' | 'no_work';
  dispatch: Array<{ submissionId: string; reason: string }>;      // ≤ 5 − outstanding
  pollBatch: { channel: string; threadTs: string[] };             // ≤ 5, one call
  holds: Array<{ submissionId: string; reason: HoldReason; clearedBy: string }>;
  moduleSixEligible: Array<{ studentSlug: string; submissionId: string }>;
  moduleSixBlocked: Array<{ studentSlug: string; missing: string[]; unmatched: string[] }>;
  escalations: Array<{ kind: 'phase_1_blocked'|'title_unmatched'|'awaiting_marker'|'contradictory'; detail: string }>;
}
```

`dispatch` is capped by `5 − |{posted, processing}|`, never by 5 alone.
`moduleSixEligible` requires I20 in full. `escalations` is non-empty whenever the
plan is empty for a non-obvious reason — the coordinator must never return a
silent `no_work` while an item is stuck.

## 5. Acceptance tests

Focused and negative tests, one per invariant that can fail silently in
production. Negative cases are listed first within each group because every P0
above is a silent-failure mode.

### 5.1 Release activation

Negative:

1. candidate differs from installed in a fourth key (`MAX_CONCURRENT_CONTAINERS`)
   → abort before mutation, installed plist byte-identical (I1, P0-1).
2. candidate's interpreter reports `v22.20.0` against a `22.23.2` pin → abort,
   no mutation (I2, P1-1).
3. rollback source plist references a release directory that no longer verifies
   → abort before mutation (I3, P1-2).
4. `plutil -lint` fails on the rendered candidate → abort, installed plist
   unchanged (I4).
5. post-load `/health` returns the intended commit but a stale `codeRoot` →
   treated as failure, rollback executed (I6, P0-2).
6. `/health` never becomes healthy within the bound → exactly one rollback load,
   no second candidate load, no rebuild (I7).
7. prior PID still holds `:8088` past the wait bound → abort with the listener
   still owned by the old daemon, no orphan (I5, P1-3).
8. `prepare` invoked with a valid plan spawns no process and writes nothing
   outside its scratch directory (I8).

Positive:

9. a valid plan changes exactly three fields, byte-diffed against the installed
   plist.
10. the returned rollback path exists, lints, and reproduces the prior identity.

### 5.2 Submission index

Negative:

1. empty, whitespace, or absent `submission_id` → rejected, no row (I9).
2. two rows claiming the same `upload_idempotency_key` → second insert rejected
   by the unique index (I10).
3. transition with a stale `expected_version` and a **new** `observation_key` →
   `{stale}`, row and version unchanged (P0-4).
4. transition replaying an existing `observation_key` → `{idempotent}`, version
   **not** bumped, no duplicate transition row (P0-4).
5. illegal transition (`writeback_confirmed` → `posted`) → `{illegal}`, no write.
6. `UPDATE`/`DELETE` against `heartbeat_submission_transitions` → asserted absent
   by a repository-wide grep test (I13).
7. a `knowledge` row carrying a `slack_root_ts` → CHECK violation (I15, P1-6).
8. `detail` payload containing a `>` 512-byte string, an `http` URL, or a
   `files.slack.com` reference → rejected at the boundary (I11).
9. a `heartbeat_writeback_confirmed` transition with no preceding
   `writeback_submitted` → `{illegal}` (I14).

Positive:

10. observation → prepared → posted → processing → graded_pass →
    writeback_pending → writeback_confirmed produces seven transitions and
    version 8.
11. a resubmission after `graded_no_pass` creates a **second** row with a later
    `submitted_at`; `listPrerequisiteStates` returns the newer row (I9).
12. a `duplicate_complete` grader receipt records exactly one
    `slack_delivery_receipt` transition across two IPC calls.

### 5.3 Coordinator

Negative:

1. `liveCompleteNoFeedbackCount = 1` with an eligible Module 6 candidate →
   `phase_1_draining`, `moduleSixEligible` empty (I18).
2. the only remaining Phase 1 row is an unacknowledged `exception` →
   `phase_1_blocked` with that row named, **not** `no_work` (P1-7).
3. seven of eight prerequisites approved, one `retry` → blocked, the retried
   title listed in `missing` (I20).
4. all eight approved but one carries a newer unresolved submission → blocked
   (I20).
5. all eight approved with observations from a **prior** `run_id` → blocked
   (I20, P1-8).
6. a required title matches zero observed rows → `title_unmatched` escalation,
   distinct from `missing` (P0-7).
7. thread text `[grader]\nStrong work. PASS` → `awaiting_marker`, item held
   (P0-6).
8. thread text beginning `[HANDOFF: grader→certifier]` → `awaiting_marker`, item
   held, and specifically **not** classified `pass` (P0-6).
9. both `PASS` and `NO PASS` markers present in one thread → `contradictory`,
   held (I21).
10. four roots already `posted` → `dispatch` length ≤ 1 (I19).
11. a grader message asserting "course complete, certificate ready" with all
    prerequisites unverified → no eligibility change (I21).
12. `planGradingRun` called twice with identical inputs returns deep-equal plans
    and performs no I/O — asserted by a mocked `fs`/`Date` guard (I16).
13. a `grading_plan` IPC from any container → quarantined, plan unreachable
    (I17, P2-2).

Positive:

14. `liveCompleteNoFeedbackCount = 0`, all eight prerequisites approved this run,
    no newer attempts → `phase_2_module_6` with that student eligible.
15. `pollBatch.threadTs` round-trips through the documented
    `slack/poll-grader-threads --thread-ts` CSV form for five roots.

## 6. Verification performed by this review

- Read-only. No file in the repository was created or modified except this
  report. No build, no test run, no deployment, no external call, no database
  read or write, no Slack or Heartbeat interaction.
- Sources read in the requested authority order, plus
  `src/channels/slack.ts`, `src/webhook-server.ts`, `src/router.ts`,
  `src/container-runner.ts`, `scripts/register-grader.ts`, `setup/service.ts`.
- Corroborating evidence read outside the repository, treated as evidence and
  not authority: the operator skill and its three references;
  `~/dev/grading/courses.json`, `registry.json`; and
  `~/dev/toolbox/shared/slack/tools/slack/poll-grader-threads.sh`.
- **Verification limit:** this worktree has no `node_modules`, so `npm run
  typecheck`, `npm test`, and `npm run docs:continuity-check` were not run. No
  claim in this report depends on executing project code. Every code claim cites
  a file and line read directly.

## 7. Owner decisions genuinely required before implementation

Three. Everything else in this report is an engineering correction that Codex
can apply without further input.

**Decision 1 — submission identity (blocks NC-004; P0-3).**
Does Heartbeat expose a stable submission identifier through the signed-in
browser that is visible at queue-projection time, survives Approve/Retry, and
differs between a first attempt and a resubmission? Resolve with one bounded live
observation, not a design assumption. If the answer is no, the owner must choose
between: (a) an explicit synthetic identity
`sha256(course|student_slug|assignment_title|submitted_at)` documented as a
NanoClaw-minted key with its rename/collision exposure stated, or (b) deferring
NC-004 until an identifier exists. The current requirement — "a real Heartbeat
submission ID is mandatory" — cannot be satisfied by decree.

**Decision 2 — canonical prerequisite titles (blocks NC-005; P0-7).**
Which eight titles does Heartbeat render today for Mentor Coaching Foundation?
`references/decision-rules.md` and `~/dev/grading/registry.json` disagree on
Module 3 and Module 5 by assignment *name*, not just wording. One live read of
the `Complete (with feedback)` queue for a single completed student resolves it.
The answer becomes the tracked `data/grading/course-prerequisites.json`, and the
losing source should be corrected in the same change.

**Decision 3 — knowledge-check threshold (business, not blocking).**
80% (`registry.json` `quiz_certificates.rule`, `courses.json`) or >85%
(`references/decision-rules.md`)? Students scoring 80–85% are affected today,
independent of these slices. This does not block implementation because the
correct design is the same either way — the coordinator never evaluates a score —
but it is a live inconsistency this review surfaced and should not be left
undecided.

## 8. Elapsed time, cost, and unresolved issues

- Elapsed: 2026-08-02T17:45Z → 17:51Z, approximately 6 minutes of Claude
  wall-clock, single session, no subagents, no external API calls beyond local
  file reads.
- Prior session context: the earlier attempt recorded in
  `docs/reports/NC-20260802-003-CONVERGENCE-STATE.md` reached zero model tokens;
  this is the first substantive R1 response.

Unresolved after this review:

1. Decisions 1-3 above.
2. Whether the grader currently emits a verdict as the first token of its Slack
   message often enough that the existing `poll-grader-threads` regex has been
   working by luck. Resolvable by reading one real completed
   `#gru-grader` thread; not resolvable from the repository. Until then, treat
   the marker path as **unvalidated**, not as working.
3. Whether `~/dev/grading` should become release-bundled or remain a runtime
   mount. It carries the rubrics, packs, and student records the grader depends
   on, is excluded from the release archive
   (`scripts/build-release.mjs:88-97`), and is therefore outside every
   provenance guarantee in `docs/RELEASE-INTEGRITY.md`. Out of scope for these
   three slices; worth a separate `planned` row.
4. NC-002's natural wall-clock container expiry remains unobserved
   (`docs/ACTIVE-WORK.md:17`) and is unaffected by anything proposed here.
5. This report proposes changes to `groups/grader/CLAUDE.md` (P0-6) and a new
   tracked `data/grading/course-prerequisites.json` (P0-7). Both are outside the
   file scope currently recorded for NC-003/004/005 in `docs/ACTIVE-WORK.md` and
   need those rows updated before the edits are made.
