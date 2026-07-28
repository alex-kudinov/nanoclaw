# NanoClaw active work

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-07-28

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| Task ID | Outcome | Owner/client | Branch @ base | Status | Class | Scope | Next action | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-20260728-005` | Restore a truthful green Node 22 test baseline | Codex + Claude validator | `codex/continuity-reconciliation` @ `a6e4b13` | `validating` | C2 | Node 22 baseline repaired: 124 files / 1,595 tests pass | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and commit | 2026-07-28T12:31Z |
| `NC-20260728-004` | Reconcile Claude changes with the shared company-OS protocol | Codex + Claude validator | `codex/continuity-reconciliation` @ `a6e4b13` | `validating` | C2 | entire staged worktree; tracking rules; continuity records/checker; authoritative docs | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and create the durable Git handoff | 2026-07-28T12:31Z |

## Ready for review/commit/release

| Task ID | Outcome | Owner/client | Branch @ base | Status | Class | Scope | Next action | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-20260728-003` | Approved sends can no longer fail silently | Claude Code | `main` @ `a6e4b13` | `deployed_unverified` | C3 | `src/send-watchdog.ts`, `src/db.ts` (`pending_sends`), `src/ipc.ts`, `src/index.ts`; one remedial customer email | Watch for a `[SEND NOT OBSERVED]` alert on the next stalled approval; decide on the unlogged-outbound gap below | 2026-07-28T11:50Z |
| `NC-20260728-002` | Readable ODF/iWork attachments; no silently dropped files | Claude Code | `main` @ `a6e4b13` | `deployed_unverified` | C2 | `src/attachment-convert.ts`, `src/channels/slack.ts`, `groups/grader/CLAUDE.md` | Re-send the Vannessa Valle `.odt` (or any `.odt`) to `#gru-grader` and confirm the text inlines and grades | 2026-07-28T11:26Z |
| `NC-20260728-001` | One Slack thread per sales lead; readable draft splits | Claude Code | `main` @ `a6e4b13` | `ready_for_review` | C2 | `src/lead-thread-key.ts`, `src/message-split.ts`, `src/channels/slack.ts`, `src/index.ts`, `src/types.ts`, sales/inbox instructions, `registered_groups.container_config` | Review and commit the live-verified implementation | 2026-07-28T12:03Z |
| `NC-20260727-001` | Durable party-scoped follow-up drop | Claude Code | `main` @ `a6e4b13` | `deployed_unverified` | C3 | migration 113, `src/followup-drop*.ts`, `src/index.ts`, `groups/sales/WORKFLOWS.md` | Commit the working tree; watch the 2026-07-28 09:00 follow-up cron for a clean run | 2026-07-27T15:10Z |
| `NC-20260726-002` | Least-privilege inbound-document read contract for bizmgr | Claude Code (retrospective) | `main` @ `a6e4b13` | `ready_for_review` | C5 | migrations 111-112; `business_v2.v_inbound_documents`; `bizmgr_reader` | Review and commit; view/role existence and zero unexpected relation grants were live-verified read-only on 2026-07-28 | 2026-07-28T12:03Z |
| `NC-20260726-001` | Refresh shared schema references without publishing live rows | Claude Code + Codex reconciliation | `main` @ `a6e4b13` | `ready_for_review` | C2 | `agent_docs/*schema*.md`, `tools/refresh-schemas.sh`, schema sanitizer | Review and commit the structure-only schema snapshot and permanent sanitizer | 2026-07-28T12:03Z |
| `NC-20260724-002` | Restore bounded knowledge regeneration and reconcile changed facts/lessons | Claude Code (retrospective) | `main` @ `a6e4b13` | `ready_for_review` | C2 | `tools/regen-kb-delta.py`, tests, manifest/state, `KNOWLEDGE.md`, learned files and source pieces | Review provenance and commit; do not regenerate against external sources during review | 2026-07-28T12:03Z |
| `NC-20260724-001` | Generate fail-closed, timezone-safe program schedules | Claude Code (retrospective) | `main` @ `a6e4b13` | `ready_for_review` | C2 | `tools/refresh-schedule.py`, tests, schedule operating documentation | Review and commit; live job registration/run state remains machine-local | 2026-07-28T12:03Z |
| `NC-20260723-003` | Block invented program acronyms while allowing authoritative ICF links | Claude Code (retrospective) | `main` @ `a6e4b13` | `ready_for_review` | C2 | `src/email-content-guard.ts` and focused tests | Review, commit, and establish deployment state before relying on it | 2026-07-28T12:03Z |
| `NC-20260723-002` | Cross-client documentation continuity | Codex + Claude validator | `main` @ `a6e4b13` | `ready_for_review` | C2 | root instructions, shared continuity documents, continuity checker, CI | Review, then commit; no runtime or external business action occurred | 2026-07-23T16:21Z |
| `NC-20260723-001` | Company-OS improvement plan | Codex + Claude validator | `main` @ `a6e4b13` | `ready_for_review` | C1 | `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, project-map index | Review, then commit; no implementation or production action has occurred | 2026-07-23T16:19Z |

## Task details

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
