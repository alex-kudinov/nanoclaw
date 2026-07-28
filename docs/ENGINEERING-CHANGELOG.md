# NanoClaw engineering changelog

This is the shared, append-only engineering and operations record for Claude
Code, Codex, and human collaborators. It records change evidence, not product
marketing.

Protocol: `docs/CHANGE-PROTOCOL.md`

## Unreleased

### NC-20260728-005 — Restore the Node 22 test baseline

- Date: 2026-07-28T12:25Z
- Owner/client: Codex + Claude validator
- State: validating
- Commit/PR: uncommitted on `codex/continuity-reconciliation`
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
- Commit/PR: uncommitted on `codex/continuity-reconciliation` from
  `a6e4b13`
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- State: ready_for_review (deployed and live-verified; commit pending)
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- State: ready_for_review (deployed and live-verified; commit pending)
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
- Commit/PR: uncommitted working tree
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
