# NanoClaw active work

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-07-28

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| Task ID | Outcome | Owner/client | Branch @ base | Status | Class | Scope | Next action | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-20260728-007` | Redesign the OneDrive Drop ingestion subsystem | human | `codex/continuity-reconciliation` @ `cd78ad2` | `planned` | C2 | all four `scripts/copiers/*.py`, their launchd jobs, and the upstream Solera export | Owner is redesigning the subsystem. Do not re-enable the existing copiers; establish first whether the upstream export is coming back | 2026-07-28T23:09Z |
| `NC-20260728-006` | Chat/people drops ingest instead of retrying forever and pinning `fileproviderd` | Claude Code | `codex/continuity-reconciliation` @ `cd78ad2` | `complete` | C2 | `scripts/copiers/copy_chat.py`, `scripts/copiers/copy_people.py` | None. Fix verified live (66 COPIED / 0 FAILED under launchd) before the subsystem was stopped under NC-20260728-007 | 2026-07-28T23:09Z |
| `NC-20260728-005` | Restore a truthful green Node 22 test baseline | Codex + Claude validator | `codex/continuity-reconciliation` @ `157cb1b` | `validating` | C2 | Node 22 baseline repaired: 124 files / 1,595 tests pass | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the review branch | 2026-07-28T12:34Z |
| `NC-20260728-004` | Reconcile Claude changes with the shared company-OS protocol | Codex + Claude validator | `codex/continuity-reconciliation` @ `157cb1b` | `validating` | C2 | committed review checkpoint; tracking rules; continuity records/checker; authoritative docs | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the durable handoff | 2026-07-28T12:34Z |
| `NC-20260729-004` | Close the highest-risk outbound-email and healer implementation gaps before broader Company-OS work | Codex + Claude validator | `codex/continuity-reconciliation` @ `1689527` | `deployed_unverified` | C3 | Gmail IPC authorization and final-boundary recipient/thread controls; durable approval grant reissue; denied-call acknowledgements; installed and tracked healer default; focused tests; Company-OS/security/project-map reconciliation; `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md` | Production host artifact and SQLite migration are deployed; both Gmail denial and restart-grant canaries passed; installed fast-healer implementation is off. Observe the first explicitly approved real/test-routed send before claiming outcome validation. Track Node 22 enforcement, prompt/source convergence, and disposable healer worktree isolation separately | 2026-07-30T17:50Z |
| `NC-20260729-003` | A guard-blocked or failed send can no longer look identical to a delivered one | Claude Code | `codex/continuity-reconciliation` @ `cd78ad2` | `deployed_unverified` | C3 | `src/send-watchdog.ts`, `src/db.ts`, `src/ipc.ts`, `src/gmail-ipc-handlers.ts`, `src/index.ts`, `tsconfig.json`, three test files | Watch for a `[SEND NOT OBSERVED]` alert on the next genuinely blocked send; decide whether to also post the `[EMAIL BLOCKED]` line into the draft thread for instant notice | 2026-07-30T00:12Z |
| `NC-20260729-002` | Sales/inbox knowledge states the real Coaching Supervision Mastery offer instead of "pre-launch, no price" | Claude Code | `codex/continuity-reconciliation` @ `cd78ad2` | `ready_for_review` | C2 | `knowledge/agents/sales/KNOWLEDGE.md`, `knowledge/agents/inbox/KNOWLEDGE.md`, `knowledge/shared/KNOWLEDGE.md`, `knowledge/agents/sales/LEARNED.md`, `knowledge/shared/LEARNED-sales.md` | Operator supplies the unpublished attendance/missed-session and refund/deferral policy, then answer Lead #611 Q1; separately decide the `LEARNED-sales.md` 73-vs-51 lesson divergence | 2026-07-29T21:55Z |
| `NC-20260729-001` | Adversarial Claude validation of the Company-OS v2 upgrade plan | Claude Code | `codex/continuity-reconciliation` @ `cd78ad2` | `ready_for_review` | C1 | `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new), `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md` | Human/Codex read the report, decide the five blocking questions in §11, then reconcile accepted findings into `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` under a separate task ID | 2026-07-29T13:05Z |

## Ready for review/commit/release

| Task ID | Outcome | Owner/client | Branch @ base | Status | Class | Scope | Next action | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-20260728-003` | Approved sends can no longer fail silently | Claude Code | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C3 | `src/send-watchdog.ts`, `src/db.ts` (`pending_sends`), `src/ipc.ts`, `src/index.ts`; one remedial customer email | Push the review branch; watch for a `[SEND NOT OBSERVED]` alert on the next genuine stall and decide the unlogged-outbound gap | 2026-07-28T12:34Z |
| `NC-20260728-002` | Readable ODF/iWork attachments; no silently dropped files | Claude Code | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C2 | `src/attachment-convert.ts`, `src/channels/slack.ts`, `groups/grader/CLAUDE.md` | Push the review branch; re-send a safe `.odt` to `#gru-grader` and confirm the text inlines and grades | 2026-07-28T12:34Z |
| `NC-20260728-001` | One Slack thread per sales lead; readable draft splits | Claude Code | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | `src/lead-thread-key.ts`, `src/message-split.ts`, `src/channels/slack.ts`, `src/index.ts`, `src/types.ts`, sales/inbox instructions, `registered_groups.container_config` | Complete Claude review of commit `157cb1b`, then push the branch | 2026-07-28T12:34Z |
| `NC-20260727-001` | Durable party-scoped follow-up drop | Claude Code | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C3 | migration 113, `src/followup-drop*.ts`, `src/index.ts`, `groups/sales/WORKFLOWS.md` | Push the review branch; watch the 2026-07-28 09:00 follow-up cron for a clean run | 2026-07-28T12:34Z |
| `NC-20260726-002` | Least-privilege inbound-document read contract for bizmgr | Claude Code (retrospective) | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C5 | migrations 111-112; `business_v2.v_inbound_documents`; `bizmgr_reader` | Complete Claude review of committed source and push; live existence/grants were read-only verified | 2026-07-28T12:34Z |
| `NC-20260726-001` | Refresh shared schema references without publishing live rows | Claude Code + Codex reconciliation | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | `agent_docs/*schema*.md`, `tools/refresh-schemas.sh`, schema sanitizer | Complete Claude review of the committed structure-only snapshot and push | 2026-07-28T12:34Z |
| `NC-20260724-002` | Restore bounded knowledge regeneration and reconcile changed facts/lessons | Claude Code (retrospective) | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | `tools/regen-kb-delta.py`, tests, manifest/state, `KNOWLEDGE.md`, learned files and source pieces | Complete Claude provenance review of commit `157cb1b` and push; do not regenerate externally during review | 2026-07-28T12:34Z |
| `NC-20260724-001` | Generate fail-closed, timezone-safe program schedules | Claude Code (retrospective) | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | `tools/refresh-schedule.py`, tests, schedule operating documentation | Complete Claude review of commit `157cb1b` and push; live job state remains machine-local | 2026-07-28T12:34Z |
| `NC-20260723-003` | Block invented program acronyms while allowing authoritative ICF links | Claude Code (retrospective) | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | `src/email-content-guard.ts` and focused tests | Complete Claude review, push, and establish deployment state before relying on it | 2026-07-28T12:34Z |
| `NC-20260723-002` | Cross-client documentation continuity | Codex + Claude validator | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C2 | root instructions, shared continuity documents, continuity checker, CI | Complete Claude review of commit `157cb1b`, then push; no runtime/business write occurred | 2026-07-28T12:34Z |
| `NC-20260723-001` | Company-OS improvement plan | Codex + Claude validator | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review` | C1 | `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, project-map index | Complete the separately tracked NC-20260729-001 adversarial validation, reconcile the roadmap, then push; roadmap items remain proposed unless explicitly marked | 2026-07-29T12:23Z |

## Task details

### NC-20260729-004

- Outcome: implement only the first validated containment slice from
  `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` before beginning the
  broader Company-OS architecture program.
- Owner/client: Codex implements; Claude Code Opus performs an inspectable
  pre-commit review through `claude -p` using the INFO account token selected by
  `~/.shared/shell/50-claude-tokens.sh`. Token values must never enter prompts,
  logs, diffs, documentation, or command output.
- Change class: C3 because the enforcing boundary controls customer-email reads
  and sends. No email, message, approval, migration, production-data write,
  deployment, daemon restart, or live configuration change is authorized by
  this task.
- Scope:
  - source-group authorization for every `gmail_*` IPC operation, with
    quarantine and negative tests;
  - host-owned party/recipient validation for new sends, fail-closed behavior
    when identity cannot be established, reply CC validation, test routing for
    replies, and a host-owned thread-assignment boundary;
  - tracked `HEALER_IMPLEMENT_ENABLED=0` default;
  - focused security tests plus the root and independent agent-runner validation
    required by `CLAUDE.md`;
  - reconciliation of `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`,
    `docs/PROJECT-MAP.md`, `docs/SECURITY.md`, this register, and
    `docs/ENGINEERING-CHANGELOG.md`.
- Overlap: NC-20260729-003 already has uncommitted, deployed-but-not-live-verified
  edits in `src/ipc.ts`, `src/gmail-ipc-handlers.ts`, `src/db.ts`,
  `src/index.ts`, `src/send-watchdog*`, tests, and `tsconfig.json`. Preserve
  those edits exactly and build containment on top; do not claim or reclassify
  their deployment evidence.
- Leadership defaults adopted for implementation planning: healer implementation
  stays off until disposable-worktree isolation; only named operators may
  authorize future C3+ autonomy; the courses SMTP bypass must move behind the
  host capability in a separately scoped cutover; Gmail history gaps must not
  remain silent; procurement CDP must be network-isolated or retired. This task
  implements the healer default and Gmail boundary only.
- Validation boundary: use Node 22 from `.nvmrc`; run focused rejection/success
  tests, `npm run typecheck`, `npm test`, the independent
  `container/agent-runner` build/tests, documentation continuity, and
  `git diff --check`. Then give Claude Opus the sanitized task context and diff
  for adversarial review, address supported findings, rerun affected checks,
  and only then commit.
- Qodo rules: the canonical `.claude/skills/get-qodo-rules/SKILL.md` procedure
  was attempted before code edits, but `~/.qodo/config.json` is absent, so no
  Qodo repository rules were available. Tracked repository instructions remain
  the governing controls. Independently re-confirmed by the validator on
  2026-07-30 — `~/.qodo/` does not exist and no config file was created.
- Independent pre-commit review completed 2026-07-30T04:00Z by Claude Code
  2.1.220, model `claude-opus-5[1m]` at maximum effort, account label
  `info-tandem`. Report:
  `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`.
  **Verdict: CHANGES REQUIRED.**
- Validator reproduced every recorded check independently under pinned Node
  22.23.2: typecheck passes; root suite 127 files / 1,625 tests pass; the
  `container/agent-runner` build passes and its suite passes 3 files / 22 tests;
  `npm run docs:continuity-check` passes; `git diff --check` passes. All fourteen
  intended security-model items were tested against source; twelve hold as
  written, item 7 partially holds, item 6 holds for the file but not for the
  caller.
- Blocking findings Codex must address before commit:
  1. **P1-1** — `gmail_reply` is authorized only from a process-local grant, and
     the durable fallback in `src/gmail-ipc-business-scope.ts:24` is restricted
     to `sales` + `{gmail_get_thread, gmail_search}`. The only grant origins are
     `src/channels/gmail.ts:454` (inbound → mailman) and
     `src/classify-ipc-handlers.ts:404` (correction → chief), so after a daemon
     restart no code path can re-authorize an approved reply. Recovery via the
     Sales resolver requires a `business_v2.interactions` row with
     `metadata->>'thread_id'`, which only `email-interaction-log.ts:33-38`
     writes and only on a successful *outbound* send — so follow-ups recover but
     first replies to new inbound leads and every `chief` support reply do not.
     Fails loud via the NC-003 watchdog after ~6 minutes; still a customer-facing
     outage of the primary revenue path. Preferred fix: grant
     `mailman` the thread from host-held card state at the approval boundary.
  2. **P1-2** — a quarantined `gmail_*` request writes nothing back to the
     calling group, while `container/agent-runner/src/ipc-mcp-stdio.ts:565-606`
     has already told the model "queued — content will arrive as a follow-up".
     The agent stalls waiting for a result that never comes, which is the exact
     sequence recorded under NC-20260728-003 (lost approval, fabricated cause),
     and the new group prompts instruct agents to escalate on rejection without
     giving them any way to learn of it. Fix: write one `type:'message'`
     `[gmail_* DENIED] <reason>` file into the source group's `input/`.
- Non-blocking findings recommended for the same commit: **P2-1**
  `clearPendingSendsByRecipient` (`src/db.ts:960-970`) deletes every row for an
  address, so a second approved email to the same person becomes silent again —
  narrow to the oldest matching row; **P2-3** the NC-20260729-003 changelog
  entry now describes the `GMAIL_TEST_RECIPIENT` callback suppression that
  NC-004 added, which the Mac Mini build of 2026-07-30T00:09Z does not contain —
  restore the deployed description and add a dated addendum.
- Deferred with explicit acceptance: **P2-2** grants are group-global and
  accumulate for the process lifetime, so `mailman`'s address set lets an
  attacker-controlled email body propagate any previously-seen address to
  `sales` (bound propagation to host-generated header lines, and move to
  work-item-scoped grants in the ledger slice); **P2-4** no expression index
  supports `interactions.metadata->>'thread_id'` on the authorization hot path
  (needs its own migration and task ID); seven P3 items listed in the report.
- Observability gap to close before deployment: quarantine has no metric, no
  alert, and no retention policy, yet a trickle of quarantined `gmail_*` files
  is the primary production signal that P1-1 is occurring.
- Validator state boundary: repository reads plus this report and two continuity
  edits. No implementation code was edited, nothing was staged, committed, or
  pushed, and no deployment, migration, service change, credential action,
  message, email, approval, or production write occurred. The 51-path dirty
  worktree was preserved unchanged.
- Remediation completed 2026-07-30T11:31Z:
  - **P1-1 fixed:** an approved card records its exact Gmail thread and
    recipient in `pending_sends`; the host reissues that grant at approval time
    and can reconstruct the same narrow grant from SQLite after a daemon
    restart. The dispatch path overwrites any container-supplied recipient with
    the host-approved value, and the final reply boundary verifies the
    Gmail-derived recipient is identical.
  - **P1-2 fixed:** every quarantined Gmail IPC now receives a best-effort
    `[gmail_* DENIED]` follow-up in the source group's input directory, so the
    caller can stop and escalate instead of waiting indefinitely. The scanner
    excludes both `errors` and `quarantine`.
  - **P2-1 fixed:** recipient confirmation clears only the oldest matching
    pending expectation, preserving a second approved message to the same
    address. **P2-3 fixed:** NC-003's deployed behavior and NC-004's
    test-routing correction are recorded separately below and in the
    changelog.
  - **P2-2 materially narrowed:** handoff propagation accepts email addresses
    only from structured host-style headers before any body/message delimiter;
    a body-injected previously seen address cannot propagate. Each in-memory
    resource set is bounded to 5,000 entries. A true work-item-scoped grant
    ledger remains a separate architecture ticket.
  - Hardening from the review was included: spoofed `groupFolder` coverage,
    quarantine scanner reprocessing coverage, default-deny Gmail guidance in
    the group template, and documentation of the host-direct proposal/digest
    exceptions.
- Post-remediation verification:
  - focused Node 22 set including native SQLite: **6 files / 126 tests pass**;
  - `npm run typecheck` passes;
  - the normal parallel root suite reached **126 files / 1,629 tests** twice,
    with one different ephemeral webhook socket failure per run
    (`EADDRINUSE`, then `socket hang up`); the affected webhook file passes
    alone (**35/35**) and the deterministic single-worker root suite passes
    **127 files / 1,631 tests**;
  - the independent `container/agent-runner` build passes and its suite passes
    **3 files / 22 tests** under Node 22.
- Explicit deferrals: the PostgreSQL expression index for
  `interactions.metadata->>'thread_id'` requires its own tracked migration;
  work-item-scoped grants, quarantine metrics/alerting/retention, and the
  remaining P3 findings remain backlog. These do not reopen either remediated
  P1 finding, but they remain deployment-readiness work.
- Current state: source, Claude reports, remediation, and verification evidence
  are committed locally at `1689527`. The reviewed compiled host artifact and
  additive SQLite migration were deployed to the Mac Mini on 2026-07-30.
- Production release:
  - preflight found a healthy but dirty operational checkout, Node 25.8.2
    rather than the pinned Node 22, and the installed fast-healer unit with
    implementation enabled;
  - a restricted rollback bundle was created at
    `~/.local/share/nanoclaw-deploy-backups/NC-20260729-004-20260730T172332Z`,
    including the prior source/dist artifacts, installed launchd plists, and a
    native SQLite backup;
  - the exact Git archive was staged immutably at
    `~/.local/share/nanoclaw-releases/1689527` with SHA-256
    `5114fe4b9b0e062f4dd822337adac1eddf0932bb81cac43e1744e117265ce703`;
  - target-runtime typecheck, focused authorization tests, and build passed
    under the installed Node 25.8.2 before activation. Node 22 startup/launchd
    enforcement remains `OPS-001`; this deployment did not silently change the
    production runtime;
  - launchd could not activate a symlinked release because the direct-run guard
    compares the invoked path with `import.meta.url`. Those attempts exited
    cleanly and the prior daemon recovered. The final activation copied the
    already-built immutable release `dist/` into the existing runtime path and
    restarted the managed service;
  - production now has one managed process, PID 68325 at verification time.
    SQLite contains `pending_sends.gmail_thread_id` and
    `idx_pending_sends_gmail_thread`; Slack and Gmail are connected; the
    PostgreSQL probe passed; there were no pending sends, active jobs, or real
    NanoClaw Apple Containers;
  - an inert unauthorized-Gmail canary was quarantined and returned a
    `[gmail_send DENIED]` acknowledgement without dispatch. A separate
    synthetic pending-approval canary proved exact recipient/thread grant
    reconstruction after the in-memory grants were cleared. It was removed
    after verification and sent no customer email;
  - the installed and tracked fast-healer implementation flag is now `0`, and
    the loaded unit reports the same value.
- Deployment boundary: the dirty Mac Mini source checkout and its operational
  group prompts were deliberately not overwritten. Host enforcement is the
  reviewed artifact from `1689527`; prompt/source convergence remains a
  separate tracked release concern. One stale adopted-container health record
  was observed even though the Apple Container inventory was empty.
- State boundary: `deployed_unverified`. Technical safety canaries passed, but
  no genuine customer send or explicitly routed end-to-end success canary was
  performed. No message or customer email was sent by this deployment.

### NC-20260729-003

- Outcome: a guard-blocked, failed, or declined send is no longer
  indistinguishable from a delivered one. `[SEND NOT OBSERVED]` now lands in the
  draft's own Slack thread within roughly 6 minutes.
- Trigger: on 2026-07-29 an approved reply was blocked by the content guard for
  the banned phrase "thank you for reaching out". One line went to `#gru-chief`;
  `#gru-sales` showed the approval then silence, and NC-20260728-003's watchdog
  stayed quiet.
- Root cause: the `pending_sends` row was deleted when the
  `[HANDOFF: sales→mailman]` line was observed, which happens *before* mailman
  composes the mail. Every downstream refusal therefore occurred after the
  expectation had already been discharged.
- Design deployed under NC-003: the handoff is progress only and the expectation
  is discharged after Gmail accepts the call, keyed on the intended recipient
  because the send runs as `mailman` while the approval belongs to `sales`. The
  00:09Z Mac Mini build also discharges after a `GMAIL_TEST_RECIPIENT` redirect.
  NC-004 supersedes that test-routing behavior in the worktree so a customer
  expectation remains pending when only the test address received the email.
- Deliberate trade-off: a card with no `Email:` line produces a false alert
  rather than silence. `Email:` was made mandatory by NC-20260728-001.
- Also in this change: `tsconfig.json` now excludes `src/**/*.sync-conflict-*`.
  Fifteen Syncthing conflict copies sat inside `"include": ["src/**/*"]`, so
  stale duplicates of `index.ts`, `db.ts`, `send-watchdog.ts`, and
  `attachment-convert.ts` were being typechecked and compiled while remaining
  invisible to Git and to Syncthing.
- Verification boundary: typecheck clean and 115 tests pass on the Mac Mini
  under its own runtime, including `db.test.ts`. Built and restarted there
  (pid 2480, clean startup, Slack + Gmail connected, single daemon owning
  `:8088`). A real `[SEND NOT OBSERVED]` from a blocked send is NOT yet observed
  and cannot be manufactured without withholding a customer email.
- Note recorded, not fixed: `.nvmrc` and CI pin Node 22, the authoring shell runs
  26.5.0, and the Mac Mini production host runs 25.8.2. No enforced runtime
  matches the pin.

### NC-20260729-002

- Trigger: Lead #611 (Jennifer Watson, EPA — two PCC coaches enrolling in
  Coaching Supervision Mastery). The sales draft said "pricing not yet public —
  founding cohort / no price quote" and escalated, while `SCHEDULE.md` showed a
  live October 7 cohort.
- Root cause: two files on two independent pipelines.
  `knowledge/agents/sales/SCHEDULE.md` is regenerated daily by
  `tools/refresh-schedule.py` from the program calendars and carries dates only,
  so the October 7 cohort appeared automatically (file written 2026-07-28
  06:30). `knowledge/agents/sales/KNOWLEDGE.md` carries price and policy, was
  last written 2026-07-22 15:52, and still held an explicit guardrail block:
  "The program is PRE-LAUNCH / in development" and "Do NOT quote a student price
  — none is public." The agent obeyed its knowledge and correctly surfaced the
  contradiction rather than guessing; this was stale knowledge, not agent error.
- Source of truth used: https://tandemcoach.co/coaching-supervisor-training/ and
  https://tandemcoach.co/coaching-supervisor-specialization-css/ read read-only
  on 2026-07-29. No price or date in this change was inferred.
- Facts now recorded: AACS accreditation granted to Tandem July 2026, valid
  through July 2029, 72-hour program; inaugural cohort October 7, 2026 –
  February 10, 2027, Wednesdays 09:00 CT / 10:00 ET, 16 weekly 2-hour live
  classes with a winter-holiday break; ~72 contact hours, 64% live (32h live +
  14h fieldwork + ~26h self-paced); cohort of 9–12; instructor of record Cherie
  Silas; 5 observed supervision sessions with written feedback; 6h
  supervision-on-supervision; **$3,996 inaugural or $999/month × 4, $4,796
  regular thereafter**; Stripe checkout from the program page.
- Corrected stale facts: previous KB said 60–70 hours at ~50% live, said AACS
  applications "open mid-June 2026" as a future event, and gave the practicum as
  ~5 supervision hours.
- Deliberately NOT invented — still unpublished on both pages and still blocking
  Lead #611's first question: the attendance / missed-session policy (including
  the November 11 holiday) and the refund/cancellation/deferral policy. The KB
  now names both as must-ask-the-operator rather than leaving the agent to
  improvise.
- Also corrected: sales Lesson 23 asserted "ICF has not yet released specifics,
  timelines, or application process for the Coaching Supervision
  Specialization." Because `LEARNED.md` overrides `KNOWLEDGE.md` by design
  (`groups/sales/CLAUDE.md:31`), that lesson would have defeated this entire
  update. It carries a dated PARTLY SUPERSEDED status line; the MCC-exam half of
  the lesson still stands and was preserved.
- Open issue found while working, NOT fixed: `knowledge/agents/sales/LEARNED.md`
  (51 lessons, 217 lines) and `knowledge/shared/LEARNED-sales.md` (73 lessons,
  302 lines) have diverged, and the agent copy carries a CONTESTED marker the
  shared copy lacks. The sales container reads the agent copy
  (`/workspace/extra/knowledge/LEARNED.md`), so 22 lessons present only in the
  shared file are not in force. Reconciling them is a provenance review and the
  operator's call, not a mechanical merge.
- Second open issue, NOT fixed: `SCHEDULE.md` emits no cohort END date, which is
  why the Lead #611 draft said "through late January" when the program runs to
  February 10, 2027. `tools/refresh-schedule.py` would need to render end dates.
- Regeneration risk: `knowledge/agents/sales/KNOWLEDGE.md` and
  `knowledge/shared/KNOWLEDGE.md` carry a `manifest-hash` header and are partly
  managed by `tools/regen-kb-delta.py`. These hand edits target Tandem
  program-fact sections with no corresponding source piece, but confirm they
  survive the next regeneration.
- State boundary: knowledge/instruction files only. No source, schema, runtime,
  deployment, message, email, approval, or production data change. Not yet
  synced or verified live on the Mac Mini.

### NC-20260729-001

- Outcome: obtain an evidence-grounded, adversarial Claude review of the updated
  Company-OS direction before any implementation initiative is approved.
- Task brief: `docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`.
- Owner/client: Claude Code, using the latest available Opus model at maximum
  effort.
- State boundary: repository reading plus a C1 validation report and continuity
  updates only. No source/runtime change, migration, deployment, service
  restart, credential action, message/email, approval, schedule change, or
  production data write is authorized.
- Required output: an inspectable report at
  `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` that source-checks
  current-state claims, challenges priorities and complexity, and recommends
  the smallest credible first six-week slice.
- Handoff: update this row and append a factual engineering-changelog addendum
  with the model/version, files inspected, findings accepted/rejected, and
  verification boundary.
- Completed 2026-07-29T13:05Z by Claude Code, model `claude-opus-5[1m]` (Opus 5,
  1M context) at maximum effort. Report written to
  `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`.
- Result: all 13 current-state claims verified; two carry material corrections
  (healer defect mis-named; procurement Chrome risk overstated while the shared
  CDP bridge risk is missing); none rejected outright. Twelve findings absent
  from the plan were added, four rated critical. Disposition: **accept with
  changes** — architecture accepted, Wave 0 contents and the six-week slice
  replaced.
- Highest-severity finding for the next reader: `src/ipc.ts:470-497` dispatches
  the `gmail_*` IPC family with no source-group check, while `classify_*`
  (`:569`) and `route_lesson` (`:524`) in the same switch are gated. Combined
  with the identical `ALLOWED_TOOLS` list for every group
  (`container/agent-runner/src/index.ts:92-100`) and a recipient guard that is
  opt-in via the agent-supplied `leadId`
  (`src/gmail-ipc-handlers.ts:382-385`), every agent container can read the
  whole mailbox and send/reply from it.
- Two items need a read-only check on the Mac Mini that this validation was not
  authorized to perform: whether `com.nanoclaw.healer.fast` is loaded (the
  tracked template sets `HEALER_IMPLEMENT_ENABLED=1`), and whether the
  procurement CDP socat bridge is currently bound on `192.168.64.1:9250`.
- Local observation recorded during the review, not remediated:
  `com.nanoclaw.repo-hygiene` is loaded on this Mac Studio checkout and exits
  127 daily because `tools/clean-sync-conflicts.sh` does not exist in the
  repository. Fifteen `*.sync-conflict-*.ts` files consequently remain in
  `src/`, inside the `tsconfig.json` build graph.
- State boundary held: repository reads plus this report and the two continuity
  edits. No source, runtime, migration, deployment, service, credential,
  message, approval, schedule, or production-data change. No secret, customer
  data, log, database row, or backup content was read or reproduced. The
  pre-existing dirty worktree was preserved.

### NC-20260728-007

- Outcome: a redesigned ingestion path for the Solera OneDrive `Drop`, replacing
  the four `scripts/copiers/*.py` jobs. Owner is doing the redesign; this entry
  exists so the stopped state is not mistaken for a regression.
- State as of 2026-07-28T23:09Z: all four launchd jobs booted out and their
  plists renamed to `*.plist.disabled`, so the stop survives reboot:
  `com.nanoclaw.copy-calendar`, `copy-chat`, `copy-email`, `copy-people`.
  No copier process is running. Nothing was deleted from the drop.
- Decisive finding: the upstream Solera export is dead, so the copiers were
  burning a full core against a frozen pile for roughly twelve days.
  Last delivery per channel, by file mtime:
  - `Drop/Chats` — 2026-07-15 16:00 (had run ~40 files/day, steady);
  - `Drop/People` — 2026-07-15 17:19;
  - `Drop/Calendar` — 2026-07-16 10:17 (had run ~1,500 files/day, then 948 on
    07-16 and nothing after — consistent with the exporter dying mid-day rather
    than being stopped cleanly);
  - `Drop/Email` — 2026-03-28; the drop holds only `.processed/`.
- Residual backlog left in place, undeleted: 161,887 files in `Drop/Calendar`,
  4,782 in `Drop/Chats`.
- Known defect the redesign must address, distinct from NC-20260728-006's
  `EDEADLK` fix: `copy_calendar.py` fails with `[Errno 60] Operation timed out`
  (125,321 `FAILED` against 85 `COPIED` in the current log). It rescans all
  161,887 files every 300s with no per-file state, so every timeout is retried
  forever. Bounded work per run and a skip/backoff list are the minimum.
- Open question for the redesign, not answerable from this machine: why the
  upstream export stopped on 2026-07-16, and whether it is returning.
- Design constraint carried forward: the copiers' `f.unlink()` on ingest
  replicates deletions up to the Solera tenant while OneDrive is linked. Any
  redesign should track processed state outside the synced tree rather than by
  mutating it.

### NC-20260728-006

- Outcome: `copy_chat.py` and `copy_people.py` ingest their OneDrive drops
  instead of failing every file on every run, which also removes the sustained
  `fileproviderd` load the retry storm was generating.
- Trigger: `fileproviderd` sat at 100-110% CPU with the machine showing keyboard
  and trackpad stutter. Profiling attributed the hot serial queue to
  `com.microsoft.OneDrive-mac.FileProvider/…: database`, and OneDrive was the
  only FileProvider domain making progress (three others were frozen and idle).
- Root cause: `copy_calendar.py:15-23` opts the process into dataless-file
  materialization via `setiopolicy_np(3, 0, 2)`, because launchd-spawned
  processes can run with materialization disabled and every read of a OneDrive
  placeholder then fails with `EDEADLK`. `copy_email.py` has the same opt-in.
  `copy_chat.py` and `copy_people.py` carry the explanatory `shutil.copy2`
  comment but never received the call. Every `copy2` therefore failed, the
  failure path skipped `f.unlink()`, the file stayed in the drop, and launchd
  retried all 4,850 chat files every 300s indefinitely.
- Secondary defect: `copy_chat.py` and `copy_people.py` also lack the 10 MB log
  rotation guard added to `copy_calendar.py:25-28` after an earlier failure loop
  filled the disk. `copy_chat.log` had reached 18.6 GB.
- Containment (applied before the code change): `com.nanoclaw.copy-chat` booted
  out and `copy_chat.log` truncated, reclaiming 17 GB.
- Not in scope: the ~188k queued OneDrive upsync deletions. Those are accumulated
  debt from prior successful `f.unlink()` calls, are finite, and were draining on
  their own at roughly 950 entries/minute.

### NC-20260728-005

- Outcome: eliminate the pre-existing red test baseline so future Claude/Codex
  changes can distinguish regressions without stashing and comparing failures.
- Trigger: Node 22 comparison showed 41 failures on clean `a6e4b13` and 49 in
  the Claude batch. NC-20260728-004 repaired the eight batch-introduced IPC test
  regressions; this task repaired the six remaining baseline clusters.
- Product defects repaired:
  - ordinary message polling now excludes rows marked `is_bot_message`, while
    cross-group handoffs remain visible in the explicit group-exclusion mode;
  - queue retry preserves the original `(chat, thread)` key instead of
    repeatedly appending `||root`;
  - bare scheduler chat IDs and root-message composite IDs share one queue
    state, restoring task priority and preventing competing containers.
- Stale test contracts repaired:
  - formatting expects the intentional per-message `ts` attribute;
  - Gmail fixtures no longer use phrases the production content guard is
    designed to block;
  - container-runner tests adapt process streams to detached file-backed
    `LogTail`, and runtime expectations include the intentional command
    timeouts.
- Evidence: under pinned Node 22, the complete suite passes: 124 test files,
  1,595 tests, zero failures and zero unhandled errors. It was run outside the
  repository sandbox because webhook and `tsx` tests require temporary local
  TCP/IPC listeners; the same failures reproduced as `EPERM` inside the
  sandbox and disappeared with local-listener permission.
- Validator boundary: Claude Code 2.1.220 was prepared for a tool-disabled,
  sessionless Opus review of an email/path-redacted staged patch. The sandboxed
  attempt failed with `ENOTFOUND`; the network retry was correctly blocked by
  the privacy gate because sending a substantial private repository payload
  requires explicit user approval. No Claude verdict exists yet.
- Rule: prefer correcting stale fixtures and missing test isolation. Change
  production behavior only when the failing test reveals an independently
  valid robustness defect, and add focused evidence for that change.
- Production/external state: none authorized or required.

### NC-20260728-004

- Outcome: reconcile the entire July 23-28 uncommitted batch into one portable,
  reviewable company-OS handoff without changing production state.
- Trigger: a read-only audit found retroactive registration, unregistered
  change clusters, inaccurate lifecycle state, Git-ignored authoritative
  migrations/group procedures, a shallow continuity checker, Node-version
  drift, and live sample rows in a tracked schema snapshot.
- Scope: Git tracking policy, retrospective records, project/schema/group
  authority, structure-only schema generation, continuity validation, full
  repository validation, Claude review, and durable Git handoff.
- Explicit exclusions: no deployment, daemon restart, message/email, approval,
  schedule change, credential change, or production data write.
- Baseline: branch `codex/continuity-reconciliation`, base `a6e4b13`; 37 tracked
  modifications and 19 untracked paths before reconciliation, plus ignored
  authoritative files.
- Verification so far: pinned Node 22 typecheck passed; the complete root suite
  passed (124 files / 1,595 tests); 16 schedule tests, 18
  knowledge-regeneration tests, the schema-sanitizer self-test, the continuity
  checker, and the independent runner build plus 22 tests passed.
- Claude validation is pending an explicit privacy approval for a sanitized
  private-code payload; the attempted review did not reach the API and produced
  no verdict.
- Owner/client: Codex implementation with Claude Code as the requested
  adversarial validator.

### NC-20260726-002

- Retrospective registration: migrations 111 and 112 were created on July 26
  without an active-work row or changelog entry.
- Outcome: `business_v2.v_inbound_documents` exposes only the vendor-bill fields
  required by bookkeeping, and `bizmgr_reader` receives schema usage plus SELECT
  on that one view instead of broad agent/admin credentials.
- Evidence limit: original implementation/authorization transcript is not
  tracked. On 2026-07-28, a read-only query through the documented production
  host confirmed the view exists, the role exists, and it has zero unexpected
  relation grants. No rows or secrets were retrieved.
- State boundary: a C5 identity/authorization boundary exists in production;
  its password was deliberately excluded from the migration and repository.

### NC-20260726-001

- Retrospective registration: the July 26 generated schema snapshots had no task
  or changelog entry.
- Finding during reconciliation: the SQLite generator embedded one live row per
  table, placing identifiable and operational data into a tracked document.
- Remediation: tracked snapshots are structure-only; a deterministic sanitizer
  strips sample blocks and trailing whitespace, and the refresh script applies
  it before replacing the shared SQLite schema file.

### NC-20260724-002

- Retrospective registration: the section-targeted knowledge regeneration,
  generated knowledge/state, source-piece changes, and approved learned-rule
  updates were absent from the shared register.
- Outcome: changed source pieces produce bounded `@@UPDATE` operations that are
  deterministically spliced into `KNOWLEDGE.md`; invalid/ambiguous headings fail
  closed without a partial write.
- Evidence limit: source provenance must be reviewed from the manifest/pieces;
  this reconciliation does not call the external bridge or regenerate facts.

### NC-20260724-001

- Retrospective registration: the schedule-refresh implementation and tests
  were created after the protocol but were absent from the shared register.
- Outcome: schedules are rendered from authoritative calendar-debug structures,
  keep dates attached to the correct timezone track, and write nothing when any
  program fetch fails.
- Evidence limit: rendering tests pass; the tracked repository does not
  establish whether the machine-local `schedule-refresh` job is currently
  registered or when it last ran.

### NC-20260723-003

- Retrospective registration: the email-content guard change was created after
  the protocol but had no task/changelog entry.
- Outcome: known invented `MCT` wording is blocked while the authoritative ICF
  domain and its subdomains are accepted.
- Evidence limit: focused tests pass; deployment state is not established by
  tracked evidence.

### NC-20260728-003

- Outcome: an approval that never produces a mailman handoff now raises a
  `[SEND NOT OBSERVED]` alert in the draft's own thread within ~5 minutes,
  instead of looking identical to a completed send.
- Trigger: the operator approved Entry 938 (Oana Tue) at 2026-07-28T10:45:47Z,
  asked "has this been sent?" 45 minutes later, and was told "MCP connectivity
  issues blocked the send".
- Findings, all from daemon logs and the business database:
  1. There was no MCP failure. `gmail_search processed` succeeded at 10:47:28Z.
     The only warning in the window is `Gmail push: fetchAndProcess failed`
     (10:52:43Z), which is the inbound push handler and unrelated to sending.
     The stated cause was fabricated.
  2. The real failure: the agent searched Gmail for the Thread-ID, logged
     "Gmail search result arrived" at 10:47:38Z, and by 10:57:14Z reported
     "Still awaiting the Gmail search result", then classified the lead as
     "already posted and awaiting approval" — it had lost the approval itself.
     No `[HANDOFF: sales→mailman]` was ever emitted.
  3. `suppressFinalText` (NC-20260728-001) hid the two status lines that would
     have surfaced the stall at 10:47Z. Corrected in that task: suppression now
     applies only to root-triggered runs.
- Remediation: the approved body was re-sent verbatim, sliced out of the
  approved card (message `1785235523.568119`) rather than regenerated, to avoid
  the 2026-07-23 approved-draft-regenerated failure. Delivered 11:43:12Z.
- Design decision: the watchdog alerts, it does not send. The host holds the
  approved text but re-deriving an email body risks sending something other
  than what was approved; a loud alert restores operator control without that
  risk.
- Open gap found while verifying, NOT fixed: the send completed
  (`gmail_reply processed`, `[EMAIL SENT]`) but wrote no row to
  `business_v2.interactions`. `gmail-ipc` logged
  `reply leadId missing, no thread history for lookup`, and Oana's inbound
  interaction (id 2472) has a NULL `source_thread_id`, so the thread-based party
  lookup had nothing to match. Consequences: the Thread-ID recovery path that
  reads the latest outbound interaction cannot work for this party, and
  follow-up cadence sees no contact. Needs a decision on whether inbound
  classification should populate `source_thread_id`.
- State boundary: host runtime change, one new SQLite table, and ONE
  customer-facing email sent under an existing operator approval.
- Protocol deviation: registered after implementation began, not before.

### NC-20260728-002

- Outcome: OpenDocument and Apple iWork uploads are converted to text where that
  is possible, and no attachment of any type is ever dropped without telling the
  agent something arrived.
- Trigger: the operator reported the grader silently failing, or asking for a
  submission, on `.odt` / `.pages` / `.numbers` uploads.
- Root cause: `downloadAndInlineFiles` in `src/channels/slack.ts` matched only
  text and `pdf/docx/xlsx/pptx/doc/xls/ppt`. Anything else fell out of both
  branches and contributed nothing — no content and no note. The agent then saw
  a message with no submission in it. Confirmed in production: message
  `1785203517.554989` (2026-07-28T01:51:57Z) stored as exactly
  "Vannessa Valle / Module 2, Part 2" with no `<attached_file>` block, and the
  grader replied "Please paste or attach the submission" 22 seconds later.
  `application/vnd.oasis.opendocument.text` never matched `DOC_MIME_RE`, whose
  `officedocument` alternative does not match `opendocument`.
- Format findings, both verified against real files on this machine:
  - ODF is a zip holding a plain-markup `content.xml`; extraction is exact.
    markitdown does NOT support it — it raises `UnsupportedFormatException` for
    `.odt`, so routing ODF at markitdown would have produced a note, not text.
  - Modern iWork stores text in `Index/*.iwa` (Snappy-compressed protobuf) and
    ships only `preview.jpg`, a page-one thumbnail. `submissions.numbers` has 43
    entries and no PDF. Only files saved with an embedded preview carry
    `QuickLook/Preview.pdf`. So iWork is best-effort by design, with an explicit
    note when no preview exists rather than a silent or guessed result.
- Deliberate scope decisions:
  - `.key` is NOT treated as Keynote by extension — it collides with PEM/SSH
    private keys. Keynote still routes by mimetype.
  - Images now produce a note too, with image-appropriate advice. This changes
    behaviour in every channel, not just the grader: a shared screenshot now
    adds one `<attached_file … note="…" />` line to the agent's prompt.
- State boundary: host runtime change plus one agent-instruction line. No
  schema, no database write, no external system contacted.
- Protocol deviation: registered after implementation began, not before.
- Verification: recorded separately in the changelog entry.

### NC-20260728-001

- Outcome: a lead occupies exactly one Slack thread in `#gru-sales` — the
  inbound message is the root, the approval card and every later post are
  replies — and a draft too long for one Slack message breaks on a line
  boundary instead of mid-word.
- Trigger: the operator reported three top-level posts per lead plus a draft
  arriving as two messages. Reproduced against Entry 938 (Oana Tue,
  2026-07-28T09:22–09:27Z).
- Root causes, all four confirmed against the live message and anchor tables:
  1. Per-minion thread-key namespaces. Inbox anchored `inbox:lead:{email}` /
     `inbox:email:{gmail thread id}`, sales anchored `sales:entry:{entry id}`.
     Two namespaces for one lead is two channel roots. `slack_thread_anchors`
     shows the paired rows for leads 905/911/921/923/930.
  2. `src/index.ts` echoed the agent's final assistant text to the channel with
     no `threadKey`, so any closing sentence became a third root-level post.
     For Entry 938 that was "[SALES REVIEW] posted for Entry 938 …".
  3. The `[SALES REVIEW]` card re-quoted the lead's full inbound verbatim in
     `THEIR REQUEST`, which the handoff root already carried in full.
  4. `src/channels/slack.ts` split over-length messages on a raw character
     index. The Entry 938 draft broke as "…no att" / "estation letter for the
     Standard Path".
- Design: the host derives the anchor rather than trusting the agent. Lead
  email is the only identity present at every stage (inbox has it before an
  Entry ID exists), so the canonical key is `lead:{email}`, derived only from
  labelled address fields on lead-bearing messages. Broadcast is suppressed on
  lead threads so the card does not reappear at the channel bottom.
- Files: `src/lead-thread-key.ts`, `src/message-split.ts`, their tests,
  `src/channels/slack.ts`, `src/channels/slack.test.ts`, `src/index.ts`,
  `src/types.ts`, `groups/sales/CLAUDE.md`, `groups/sales/CLAUDE-MAIN.md`,
  `groups/sales/WORKFLOWS.md`, `groups/inbox/CLAUDE.md`,
  `knowledge/shared/LEARNED-sales.md`.
- State boundary: host runtime change, agent-instruction change, and one
  reversible SQLite config write (`suppressFinalText` on `sales` and `inbox`).
  No database schema change, no email, no external system contacted.
- Protocol deviation: registered after implementation began, not before.
- Verification: recorded separately in the changelog entry.

### NC-20260727-001

- Outcome: "stop following up this person" is now durable, party-scoped, and
  enforced by the host instead of by the sales container.
- Trigger: the operator reported follow-ups still going to two people they had
  told the system to drop repeatedly.
- Root causes, both confirmed against production data:
  1. 2026-07-24T16:21Z the sales agent posted "Entry #213 (Namrata Kohli) marked
     lost — no further follow-ups" while `pipeline_stage_history` row 1383
     records `new → qualifying` with reason `lost`. The call transposed the
     stage and reason arguments of `fn_advance_pipeline_stage`; `qualifying` is
     a valid stage, the function returns void, and nothing was read back. The
     lead was re-drafted 2026-07-25 and 2026-07-27.
  2. The drop was entry-scoped while the intent is person-scoped. Party 10247
     holds entries 213 and 374; Renee Carr exists as parties 10083 and 10281.
     A second failure mode: entry 345 drew `[SKIP — DB TRACKING ANOMALY]` on
     five consecutive weekdays, which writes nothing at all.
- Files: `data/business/migrations/nanoclaw-v2/113_followup_suppression.sql`,
  `src/followup-drop.ts`, `src/followup-drop-parse.ts`,
  `src/followup-drop-deps.ts`, their test files, `src/index.ts`,
  `groups/sales/WORKFLOWS.md`.
- State boundary: schema change, host runtime change, agent-instruction change,
  and a production data remediation. No email was sent and no customer-facing
  system was contacted.
- Protocol deviation: registered after implementation began, not before.
- Verification: recorded separately in the changelog entry.

### NC-20260723-001

- Outcome: comprehensive company operating-system improvement roadmap across
  functionality, security, reliability, data, performance, AI quality,
  governance, continuity, and value.
- Validation: Claude Code 2.1.217/Opus performed a tool-disabled adversarial
  review of the non-secret plan. Accepted, corrected, and rejected findings are
  recorded in the plan.
- State boundary: documentation only. No runtime, database, credential, agent,
  external system, deployment, or machine setting was changed.
- Verification: Markdown structure and `git diff --check` passed.

### NC-20260723-002

- Outcome: one tracked protocol for work registration, authoritative-document
  updates, verification evidence, handoffs, and change history across Claude
  Code and Codex.
- Files: `CLAUDE.md`, `AGENTS.md`, `docs/CHANGE-PROTOCOL.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`,
  `docs/PROJECT-MAP.md`, the improvement plan,
  `scripts/check-doc-continuity.mjs`, `package.json`, and CI.
- State boundary: documentation/operating contract plus a read-only CI
  continuity check. No runtime or external business state.
- Claude validation: accepted concurrency/ID/ownership/lifecycle corrections;
  corrected the validator's unconditional push recommendation by documenting
  same-worktree and cross-machine visibility modes.
- Verification so far: `npm run docs:continuity-check` passes.

## Coordination notes

- Existing entries pre-date any new task unless explicitly superseded.
- Before touching an entry's files or external systems, coordinate with its
  owner or continue under the same task ID.
- Do not place secrets, customer content, raw logs, or credential-bearing URLs
  here.
