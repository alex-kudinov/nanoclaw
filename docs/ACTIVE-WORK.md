# NanoClaw active work

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-08-03

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| Task ID           | Outcome                                                                                                                                         | Owner/client                       | Branch @ base                                                | Status                | Class | Scope                                                                                                                                                                                                                                                                                                                                                                                | Next action                                                                                                                                                                                                                                                                                                                                                             | Updated           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ | --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `NC-20260809-003` | Make Procurement a stable, observable opportunity-to-decision-to-proposal-ready system before adding sources                                    | Codex + Claude owner               | `codex/nc-20260809-003-procurement-recovery` @ `ba726e7`     | `deployed_unverified` | C5    | Migration 115 and receipt-bound immutable release are live; collection-only; scheduler/host receipt canary passed mechanically but failed the positive-control outcome; preserve manual commercial actions and submission                                                                                                                                                            | Claude R11 returned GO; run the full release gate, build/deploy the release-owned procedure, and require a natural nine-unit canary to discover the current positive control before review, proposal, or source expansion                                                                                                                                               | 2026-08-10T00:45Z |
| `NC-20260806-001` | A host-rejected Sales approval card returns the exact failure to its originating agent session and cannot be reported as successfully posted    | Codex + Claude validator           | `codex/nc-20260806-001-approval-rejection-loop` @ `aff14c8`  | `ready_for_deploy`    | C5    | Recover Marina Lead #1047's rejected card without redrafting; return malformed, content-invalid, and overlong cards to the exact originating container; preserve work-thread isolation; prevent pure posted/awaiting-approval recaps without hiding blocked progress; extend the release gate and validate with Claude                                                               | Commit and build the immutable release, rebuild and refresh the runner before host activation, copy the reviewed Sales instructions, activate and verify exact health, recycle only idle Sales containers, then run a non-customer exact-session rejection/repost canary                                                                                                | 2026-08-06T22:30Z |
| `NC-20260804-004` | Approved customer replies accept canonical Tandem booking, meeting, and payment links instead of failing on a stale content-guard whitelist     | Codex + Claude validator           | `codex/nc-20260804-003-host-owned-email-bytes` @ `8ae6993`   | `deployed_unverified` | C5    | Recover Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` exactly once; reconcile its Gmail receipt; audit canonical Sales link sources against the host whitelist; add narrow owned/transactional domains and adversarial lookalike tests; deploy the converged immutable release and verify its exact identity and guards                                                              | Observe the next natural approved email containing a canonical Sales link pass the normal approval-to-Gmail path; no synthetic customer send is needed                                                                                                                                                                                                                  | 2026-08-06T01:43Z |
| `NC-20260804-003` | Approved email bytes come only from host-owned approval state, never from Mailman's regenerated tool arguments                                  | Codex + Claude validator           | `codex/nc-20260804-003-host-owned-email-bytes` @ `8ae6993`   | `deployed_unverified` | C5    | Recover stranded approved actions exactly once; rehydrate every Mailman execution field; add exact scheduled-follow-up cards to the ledger; converge proposal follow-ups on one-time Gmail receipts; correct pre-Gmail status wording; pass focused/full tests and six Claude rounds; deploy immutable release; verify exact health and a live confirmed replay with no Gmail change | Observe the next natural approved customer email end to end through the normal Sales-to-Mailman watcher path; recovered sends and the live no-duplicate replay prove execution and replay mechanics but do not substitute for that business outcome                                                                                                                     | 2026-08-06T01:43Z |
| `NC-20260804-002` | Sales drafts use bounded relevant context and necessary database checks instead of rereading an oversized standard corpus on every handoff      | unassigned                         | pending                                                      | `planned`             | C3    | Profile Sales tool turns and canonical context dependencies; replace blanket 159k-character reads with measured targeted retrieval or a generated authoritative brief; preserve pricing, schedule, learned-correction, voice, approval, Entry ID, and threading safeguards                                                                                                           | Design a representative replay/eval set, establish current latency/quality baselines, then test a bounded retrieval plan before changing the Sales prompt or runtime                                                                                                                                                                                                    | 2026-08-04T12:54Z |
| `NC-20260804-001` | Every accepted Sales work item immediately receives an in-thread host acknowledgment before model generation                                    | Codex                              | `codex/nc-20260804-001-sales-generating-ack` @ `fa817a1`     | `deployed_unverified` | C3    | Enforce Sales `processingMessage` at startup; guarantee the dispatch acknowledgment is attempted before enqueue and remains retryable after a channel failure; align the Sales prompt and shared runtime documentation; inspect generation timing/model selection                                                                                                                    | Observe the next natural Sales handoff post exactly one in-thread `[PROCESSING] Generating response…` before its draft; no synthetic lead or email is needed                                                                                                                                                                                                            | 2026-08-04T12:54Z |
| `NC-20260803-003` | A forwarded human inquiry keeps its source text and Gmail identity through classification, routing, and exact downstream recovery               | Codex + Claude validator           | `codex/nc-20260803-003-forwarded-email-recovery` @ `21d5430` | `complete`            | C5    | Stop actionable sender-wide auto-rules; treat forwarded subjects as human conversations; retain forwarded text; durably store early-routed inbound email; reset stale route state across classifier changes and atomically retry an unrouted same-version result; 156 unsafe live auto-rules disabled reversibly                                                                     | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-04T01:16Z |
| `NC-20260803-002` | A model-supplied Entry ID cannot override the host-resolved Party for an exact approved email                                                   | Codex                              | `codex/nc-20260803-002-email-party-hint` @ `69bbdf7`         | `complete`            | C5    | Colleen Entry 985 recipient-guard false positive fixed; immutable host/runner/prompt release deployed; unchanged approved card recovered once with Gmail-confirmed receipt                                                                                                                                                                                                           | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-03T20:06Z |
| `NC-20260803-001` | One approved Sales reply stays in one Slack work thread, reaches the exact Mailman session, and produces one correctly attributed Gmail result  | Codex + Claude validator           | `codex/nc-20260803-001-email-session-threading` @ `5b76a2a`  | `complete`            | C5    | Exact-session/card/thread repair deployed; runner/prompts/Sales config updated; Justin Entry 600 exact recipient/body Gmail-confirmed once                                                                                                                                                                                                                                           | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-03T16:10Z |
| `NC-20260802-011` | Make every additive SQLite migration mechanically convergent against its predecessor schema before release                                      | Unassigned                         | pending                                                      | `planned`             | C3    | CI audit for initial indexes over later-migrated columns; predecessor-schema startup fixtures beyond pending_sends; split ALTER/backfill recovery; test-only DB initializer guard                                                                                                                                                                                                    | Build a schema-migration contract test that executes each predecessor fixture through repeated and partially completed initialization; then repair pre-existing ALTER-plus-backfill try blocks without changing live data semantics                                                                                                                                     | 2026-08-02T23:28Z |
| `NC-20260802-010` | Make typed approval resolution card-specific, visibly fail-closed, and consistent across every approval-driven email path                       | Unassigned                         | pending                                                      | `planned`             | C5    | card-filtered typed approval resolution and visible no-op; explicit listener scope; proposal-email action-ledger convergence; subject/boundary parsing hardening; canary header hygiene; blocked test-routing recovery wording; explicit canary environment binding                                                                                                                  | Choose whether typed approval remains global or becomes email-card-specific; implement and adversarially test N1-N6, including a first-class read-only canary environment/manifest binding that does not mutate or place secrets inside an immutable release                                                                                                            | 2026-08-02T23:35Z |
| `NC-20260802-009` | Every approved customer email is one durable, exact, Gmail-receipted action that cannot silently disappear or automatically duplicate           | Codex + Claude validator           | `codex/nc-20260802-009-email-assurance` @ `e1fa93e`          | `deployed_unverified` | C5    | host-issued email action ID; immutable approved content hash; append-only send stages; one-time execution claim; guard/uncertain result in approval thread; tracked Mailman procedure; release-blocking email suite; controlled internal canary                                                                                                                                      | Observe the next naturally approved customer email end to end; verify its exact Action-ID, approval-thread status, append-only events, Gmail receipt, and confirmed replay without creating a synthetic customer send. The internal transport/OAuth canary is complete but does not validate this business outcome                                                      | 2026-08-02T23:35Z |
| `NC-20260802-008` | Close remaining low-risk Sales routing observability, lookup, and retry debt without changing the one-root operator contract                    | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`      | `deployed_unverified` | C3    | rejection matrix; process-lifetime health diagnostics; bounded connected-send retry; per-resolved-lead routing serialization; six-hour scheduled revision window; active work-unit provenance; fail-closed cross-channel thread stripping; remainder-only chunk retry                                                                                                                | Observe the next natural inbound handoff/draft/operator-revision cycle and scheduled work card; confirm each work item has one channel root and all later activity remains in-thread                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-007` | Close remaining release-activation diagnostics and real-plist integration coverage before broadening the activation surface                     | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`      | `complete`            | C5    | atomic `shlock` claim with explicit operator stale-lock recovery; owner-safe cleanup; dry-run tool probes; pruned/same-directory diagnostics; healthy rollback proof; real `plutil` XML round-trip                                                                                                                                                                                   | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-006` | Every new Sales work item is the only channel-root post for its cycle; drafts, revisions, approvals, and later handoffs stay inside that thread | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`      | `deployed_unverified` | C3    | host work-unit thread provenance, Slack lead-anchor lifecycle and broadcast policy; concurrent same-lead roots; reconnect/partial retry; Sales/Inbox instructions; exact prompt deployed with reviewed runtime                                                                                                                                                                       | Observe one natural handoff → draft → operator feedback → revision cycle entirely inside one root; idle health verifies deployment, not the business outcome                                                                                                                                                                                                            | 2026-08-02T20:40Z |
| `NC-20260802-005` | One deterministic grading coordinator drains Modules 1-5 with five-way concurrency and opens Module 6 only from live verified prerequisites     | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `0f20224`      | `blocked`             | C3    | host-side grading plan/transition engine; bounded Slack-root polling projection; global Phase 1 gate; per-student Module 6 prerequisite gate; no autonomous Heartbeat write, certificate issue, or learner communication                                                                                                                                                             | Resolve NC-004 submission identity first; exact course titles are now observed, but the planner must not create a second identity or infer completion from Slack                                                                                                                                                                                                        | 2026-08-02T18:15Z |
| `NC-20260802-004` | Every Heartbeat submission has one durable host record keyed by the actual Heartbeat submission ID                                              | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `0f20224`      | `blocked`             | C3    | additive SQLite submission index and transition history; Slack root/file, grader verdict, Heartbeat writeback, latest observed source state; no submission body, feedback, attachment URL, or student message persistence                                                                                                                                                            | Owner decision: authorize bounded read-only discovery of Heartbeat's backing record ID, accept a collision-detecting derived key, or keep the index dark; visible UI exposes no submission ID                                                                                                                                                                           | 2026-08-02T18:15Z |
| `NC-20260802-003` | Preserve the deployed lineage and make release activation update the code root and expected commit as one validated operation                   | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`      | `complete`            | C5    | production lineage `23ffb07` → `aa1c821`; exact-three-field activation; stale-safe exclusive lock; dry-run prerequisites; health-verified switch/rollback; runtime code-root proof                                                                                                                                                                                                   | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-002` | A healthy heartbeat cannot keep a stale Sales or other agent container alive beyond its configured runtime                                      | Codex                              | `codex/nc-20260802-001-release` @ `3368831`                  | `deployed_unverified` | C3    | absolute container lifetime for normal and daemon-adopted runs; focused regression; exact follow-up release; the specifically identified stale Sales container exited before the follow-up restart                                                                                                                                                                                   | Observe one naturally long-running container stop at its configured wall-clock cap; code/release identity and idle production health are verified, but a second intentionally stale live container was not created                                                                                                                                                      | 2026-08-02T17:29Z |
| `NC-20260802-001` | Give MrGru a host-owned, idempotent grader file-upload path so Heartbeat grading no longer depends on visual Slack upload                       | Codex                              | `codex/nc-20260802-001-release` @ `0a39380`                  | `complete`            | C5    | grader-only container MCP and per-group staged attachments; host path/hash/source enforcement and durable receipts; Slack root plus threaded file upload and grader wake; tracked five-way grader registration/30-second idle defaults; toolbox adapter; pinned-Node regression and production canaries                                                                              | Resume the Module 1-5 queue through the adapter; preserve one root and one ledger row per real submission, and use only explicit terminal grader markers for Heartbeat writeback                                                                                                                                                                                        | 2026-08-02T17:29Z |
| `NC-20260731-003` | Production runs one real Node 22 build instead of hand patches, and per-lead status lines stop leaking to the channel root                      | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                | `deployed_unverified` | C3    | `src/lead-thread-key.ts` (`deriveLeadEntryRef`), `src/lead-email-resolver.ts` (new), `src/channels/slack.ts`, `src/channels/registry.ts`, `src/index.ts`, three test files; Mac Mini `src/` reconciled with the Studio worktree; Node 22.23.2 installed and pinned in launchd; `better-sqlite3` rebuilt; every hand-patched `dist/` file replaced by one compiled artifact           | Watch the next per-lead status line ("Lead #N …") land in that lead's thread, and the next unaided approval complete end-to-end. Decide whether to prune the ~118 stale `.test.js` artifacts left in production `dist/`                                                                                                                                                 | 2026-07-31T18:05Z |
| `NC-20260731-002` | Lead detail stays inside the lead's thread instead of leaking into the channel                                                                  | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                | `deployed_unverified` | C2    | `src/channels/slack.ts` (host lead anchor outranks agent-supplied `thread_ts`), `src/channels/slack.test.ts`; one hand-patched production `dist/channels/slack.js`                                                                                                                                                                                                                   | Watch the next lead's draft/update cycle post entirely in-thread. The hand patch was replaced by a compiled artifact and the per-lead status-line gap was closed under `NC-20260731-003`                                                                                                                                                                                | 2026-07-31T18:05Z |
| `NC-20260731-001` | A cross-group handoff wakes its target group on every channel, not just the ones that happened to work                                          | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                | `deployed_unverified` | C3    | `src/db.ts` (`getNewMessages` wake rule), `src/index.ts` (owner map), `src/ipc.ts` (producer flag reverted to uniform), `src/db.test.ts`, `src/ipc-handoff-echo.test.ts`; one hand-patched production `dist/db.js`; one `store/messages.db` row flip                                                                                                                                 | Observe the next mailman→sales and sales→mailman handoff waking their targets unaided. The hand-patched `dist/` was replaced by a real build and the Mini's `src`/`dist` divergence resolved under `NC-20260731-003`                                                                                                                                                    | 2026-07-31T18:05Z |
| `NC-20260730-006` | Make email delivery observable and NanoClaw releases traceable and pinned to Node 22                                                            | Codex                              | `codex/continuity-reconciliation` @ `0a39380`                | `validating`          | C5    | Sales/Mailman handoff contract and tests; handoff-without-spawn alerting; release identity in health; source/artifact mismatch refusal; package/runtime/launchd/release operations                                                                                                                                                                                                   | Run Claude adversarial review over the preserved composite diff, reconcile findings, isolate commits from unrelated dirty files, then build and deploy one exact artifact                                                                                                                                                                                               | 2026-07-31T01:52Z |
| `NC-20260730-005` | Approved sales email actually reaches the customer again                                                                                        | Codex (picked up from Claude Code) | `codex/continuity-reconciliation` @ `0a39380`                | `validating`          | C3    | `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-policy.ts`, `src/ipc.ts`, two test files; production hand patches; one customer email; three `store/messages.db` mutations                                                                                                                                                                                                               | Review and commit the reconciled source under NC-006, replace the production hand patches with that exact release, then observe the next unaided approval end-to-end                                                                                                                                                                                                    | 2026-07-31T01:52Z |
| `NC-20260730-004` | Connect the Procurement review loop without trusting portal content or model-supplied human identity                                            | Codex                              | `codex/continuity-reconciliation` @ `bc8a71b`                | `deployed_unverified` | C5    | migration 114; RLS-contained Bonfire legacy lane; default-off CaleProcure intake; host review cards; isolated host/runner/prompt dark deployment; no schedule, browser, live card, decision, or submission                                                                                                                                                                           | Name primary/backup Slack operators and action epoch, then separately approve a gates-on sanitized fixture and named-human review canary; do not claim business outcome validation                                                                                                                                                                                      | 2026-07-30T21:53Z |
| `NC-20260730-003` | Restore a trustworthy Procurement intake and review queue for CaleProcure and exact-resource email                                              | Codex                              | `codex/continuity-reconciliation` @ `bc8a71b`                | `deployed_unverified` | C2    | migration 114; host-owned typed intake; deterministic CaleProcure normalization; exact-message email handoff; bounded queue IPC; deployed gates-off with NC-004; no Bonfire/schedule cutover or production intake row                                                                                                                                                                | Continue under `NC-20260730-004`: separately authorize one sanitized gates-on fixture and named-human review canary                                                                                                                                                                                                                                                     | 2026-07-30T21:53Z |
| `NC-20260730-002` | Make healer remediation fail closed before completing the wider self-healing system                                                             | Codex + Claude validator           | `codex/continuity-reconciliation` @ `bc8a71b`                | `deployed_unverified` | C5    | healer action/approval authority, separate deterministic restart control, pending-proposal safety, focused tests, self-healing authority docs; exact healer-only production release; no model action, implementation, operator/epoch configuration, main-daemon restart, or database migration                                                                                       | Observe scheduled healer cycles and separately authorize a controlled daemon-down recovery canary before claiming deterministic restart live-verified. Gate B diagnosis separation and Gate C typed actions still precede autonomy                                                                                                                                      | 2026-07-30T21:38Z |
| `NC-20260730-001` | Reconstruct and safely resurrect the Procurement Scout as a closed opportunity-to-outcome process                                               | Codex                              | `codex/continuity-reconciliation` @ `1689527`                | `ready_for_review`    | C1    | read-only repository/live audit; target design and phased implementation brief; no prompt, runtime, database, browser, schedule, or production change                                                                                                                                                                                                                                | Human resolves the seven leadership gates in `docs/PROCUREMENT-RESURRECTION-PLAN.md`; accepted implementation phases receive separate C2-C5 task IDs                                                                                                                                                                                                                    | 2026-07-30T17:48Z |
| `NC-20260728-007` | Redesign the OneDrive Drop ingestion subsystem                                                                                                  | human                              | `codex/continuity-reconciliation` @ `cd78ad2`                | `planned`             | C2    | all four `scripts/copiers/*.py`, their launchd jobs, and the upstream Solera export                                                                                                                                                                                                                                                                                                  | Owner is redesigning the subsystem. Do not re-enable the existing copiers; establish first whether the upstream export is coming back                                                                                                                                                                                                                                   | 2026-07-28T23:09Z |
| `NC-20260728-006` | Chat/people drops ingest instead of retrying forever and pinning `fileproviderd`                                                                | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                | `complete`            | C2    | `scripts/copiers/copy_chat.py`, `scripts/copiers/copy_people.py`                                                                                                                                                                                                                                                                                                                     | None. Fix verified live (66 COPIED / 0 FAILED under launchd) before the subsystem was stopped under NC-20260728-007                                                                                                                                                                                                                                                     | 2026-07-28T23:09Z |
| `NC-20260728-005` | Restore a truthful green Node 22 test baseline                                                                                                  | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b`                | `validating`          | C2    | Node 22 baseline repaired: 124 files / 1,595 tests pass                                                                                                                                                                                                                                                                                                                              | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the review branch                                                                                                                                                                                                                                                            | 2026-07-28T12:34Z |
| `NC-20260728-004` | Reconcile Claude changes with the shared company-OS protocol                                                                                    | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b`                | `validating`          | C2    | committed review checkpoint; tracking rules; continuity records/checker; authoritative docs                                                                                                                                                                                                                                                                                          | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the durable handoff                                                                                                                                                                                                                                                          | 2026-07-28T12:34Z |
| `NC-20260729-004` | Close the highest-risk outbound-email and healer implementation gaps before broader Company-OS work                                             | Codex + Claude validator           | `codex/continuity-reconciliation` @ `1689527`                | `deployed_unverified` | C3    | Gmail IPC authorization and final-boundary recipient/thread controls; durable approval grant reissue; denied-call acknowledgements; installed and tracked healer default; focused tests; Company-OS/security/project-map reconciliation; `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`                                                                              | Production host artifact and SQLite migration are deployed; both Gmail denial and restart-grant canaries passed; installed fast-healer implementation is off. Observe the first explicitly approved real/test-routed send before claiming outcome validation. Track Node 22 enforcement, prompt/source convergence, and disposable healer worktree isolation separately | 2026-07-30T17:50Z |
| `NC-20260729-003` | A guard-blocked or failed send can no longer look identical to a delivered one                                                                  | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                | `deployed_unverified` | C3    | `src/send-watchdog.ts`, `src/db.ts`, `src/ipc.ts`, `src/gmail-ipc-handlers.ts`, `src/index.ts`, `tsconfig.json`, three test files                                                                                                                                                                                                                                                    | Watch for a `[SEND NOT OBSERVED]` alert on the next genuinely blocked send; decide whether to also post the `[EMAIL BLOCKED]` line into the draft thread for instant notice                                                                                                                                                                                             | 2026-07-30T00:12Z |
| `NC-20260729-002` | Sales/inbox knowledge states the real Coaching Supervision Mastery offer instead of "pre-launch, no price"                                      | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                | `ready_for_review`    | C2    | `knowledge/agents/sales/KNOWLEDGE.md`, `knowledge/agents/inbox/KNOWLEDGE.md`, `knowledge/shared/KNOWLEDGE.md`, `knowledge/agents/sales/LEARNED.md`, `knowledge/shared/LEARNED-sales.md`                                                                                                                                                                                              | Operator supplies the unpublished attendance/missed-session and refund/deferral policy, then answer Lead #611 Q1; separately decide the `LEARNED-sales.md` 73-vs-51 lesson divergence                                                                                                                                                                                   | 2026-07-29T21:55Z |
| `NC-20260729-001` | Adversarial Claude validation of the Company-OS v2 upgrade plan                                                                                 | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                | `ready_for_review`    | C1    | `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new), `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`                                                                                                                                                                                                                                                               | Human/Codex read the report, decide the five blocking questions in §11, then reconcile accepted findings into `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` under a separate task ID                                                                                                                                                                                            | 2026-07-29T13:05Z |

## Ready for review/commit/release

| Task ID           | Outcome                                                                    | Owner/client                       | Branch @ base                                 | Status                | Class | Scope                                                                                                                                                                     | Next action                                                                                                                                                      | Updated           |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------- | --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `NC-20260728-003` | Approved sends can no longer fail silently                                 | Claude Code                        | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C3    | `src/send-watchdog.ts`, `src/db.ts` (`pending_sends`), `src/ipc.ts`, `src/index.ts`; one remedial customer email                                                          | Push the review branch; watch for a `[SEND NOT OBSERVED]` alert on the next genuine stall and decide the unlogged-outbound gap                                   | 2026-07-28T12:34Z |
| `NC-20260728-002` | Readable ODF/iWork attachments; no silently dropped files                  | Claude Code                        | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C2    | `src/attachment-convert.ts`, `src/channels/slack.ts`, `groups/grader/CLAUDE.md`                                                                                           | Push the review branch; re-send a safe `.odt` to `#gru-grader` and confirm the text inlines and grades                                                           | 2026-07-28T12:34Z |
| `NC-20260728-001` | One Slack thread per sales lead; readable draft splits                     | Claude Code                        | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | `src/lead-thread-key.ts`, `src/message-split.ts`, `src/channels/slack.ts`, `src/index.ts`, `src/types.ts`, sales/inbox instructions, `registered_groups.container_config` | Complete Claude review of commit `157cb1b`, then push the branch                                                                                                 | 2026-07-28T12:34Z |
| `NC-20260727-001` | Durable party-scoped follow-up drop                                        | Claude Code                        | `codex/continuity-reconciliation` @ `157cb1b` | `deployed_unverified` | C3    | migration 113, `src/followup-drop*.ts`, `src/index.ts`, `groups/sales/WORKFLOWS.md`                                                                                       | Push the review branch; watch the 2026-07-28 09:00 follow-up cron for a clean run                                                                                | 2026-07-28T12:34Z |
| `NC-20260726-002` | Least-privilege inbound-document read contract for bizmgr                  | Claude Code (retrospective)        | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C5    | migrations 111-112; `business_v2.v_inbound_documents`; `bizmgr_reader`                                                                                                    | Complete Claude review of committed source and push; live existence/grants were read-only verified                                                               | 2026-07-28T12:34Z |
| `NC-20260726-001` | Refresh shared schema references without publishing live rows              | Claude Code + Codex reconciliation | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | `agent_docs/*schema*.md`, `tools/refresh-schemas.sh`, schema sanitizer                                                                                                    | Complete Claude review of the committed structure-only snapshot and push                                                                                         | 2026-07-28T12:34Z |
| `NC-20260724-002` | Restore bounded knowledge regeneration and reconcile changed facts/lessons | Claude Code (retrospective)        | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | `tools/regen-kb-delta.py`, tests, manifest/state, `KNOWLEDGE.md`, learned files and source pieces                                                                         | Complete Claude provenance review of commit `157cb1b` and push; do not regenerate externally during review                                                       | 2026-07-28T12:34Z |
| `NC-20260724-001` | Generate fail-closed, timezone-safe program schedules                      | Claude Code (retrospective)        | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | `tools/refresh-schedule.py`, tests, schedule operating documentation                                                                                                      | Complete Claude review of commit `157cb1b` and push; live job state remains machine-local                                                                        | 2026-07-28T12:34Z |
| `NC-20260723-003` | Block invented program acronyms while allowing authoritative ICF links     | Claude Code (retrospective)        | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | `src/email-content-guard.ts` and focused tests                                                                                                                            | Complete Claude review, push, and establish deployment state before relying on it                                                                                | 2026-07-28T12:34Z |
| `NC-20260723-002` | Cross-client documentation continuity                                      | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C2    | root instructions, shared continuity documents, continuity checker, CI                                                                                                    | Complete Claude review of commit `157cb1b`, then push; no runtime/business write occurred                                                                        | 2026-07-28T12:34Z |
| `NC-20260723-001` | Company-OS improvement plan                                                | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b` | `ready_for_review`    | C1    | `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, project-map index                                                                                                                  | Complete the separately tracked NC-20260729-001 adversarial validation, reconcile the roadmap, then push; roadmap items remain proposed unless explicitly marked | 2026-07-29T12:23Z |

## Task details

### NC-20260809-003

- Trigger: after the two-round NC-20260809-002 audit converged, the owner
  authorized all in-scope implementation, production, deployment, and canary
  actions needed to make Procurement stable, reliable, and useful.
- Safety boundary: opportunity submission, signature, attestation, portal
  registration, contractual acceptance, and customer-facing commitments remain
  human-only. Production mutations must be additive, backed up, reversible,
  receipt-bearing, and separately recorded as migrated, deployed,
  live-verified, or outcome-validated.
- Isolation: this branch/worktree starts from exact live release commit
  `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b`, not the 137+-path shared dirty
  checkout. Do not import unrelated active work or rebuild production from its
  operational checkout.
- Live preflight at 2026-08-09T19:49Z: release `97ca2cc` is verified under Node
  22.23.2 with Slack/Gmail connected and no active containers. Both Procurement
  taxonomy rows are enabled and `auto_archive=true`; 466 Procurement-classified
  emails exist and 348 lack `routed_at`. Migration-114 run, observation, and
  card tables are empty; all 396 opportunities remain `unreviewed` and
  source-keyless; the review constraint is not validated. The active daily task
  timed out on 2026-08-09 after 76 prior success and 13 error rows. All four
  Procurement daemon environment keys are absent. The private framework remains
  April-dated, with 12 briefs, 6 analyses, 2 proposal drafts, and 2 status files.
- Required sequence: finish the no-content preflight; converge the migration
  115/host API/reconciler design with Claude; implement and test; commit one
  exact source tree; build/verify an immutable artifact; apply additive schema
  and taxonomy/config changes with backups; deploy once; run negative and
  sanitized positive canaries; then carry one public opportunity to a recorded
  `passed` or `proposal_ready` state without submission.
- Source expansion gate: no new feed until the closure canary passes. SAM.gov's
  official API is first candidate; official state email alerts follow only
  after caller-level email routing and liveness reconciliation are proven.
- Claude R2 adversarial implementation review returned `CHANGES REQUIRED` and
  found two exact original-failure-class defects: unacknowledged Slack alerts
  could be lost permanently, and untouched overdue pursuits alerted only once.
  The post-R2 implementation now keeps undelivered alerts pending until a
  delivery receipt is acknowledged, continues after individual Slack failures,
  uses daily buckets for time-driven conditions, applies the accepted 14-day
  deadline window, requires exact per-unit coverage receipts, rejects card-less
  programmatic `process`, renders exact pursuit commands in the decision
  receipt, and records per-run opportunity associations.
- Claude R3 returned `CONVERGED`, but Codex independently found a false-receipt
  branch that remained reachable when Slack failed after a committed decision.
  The final design writes exact success receipts transactionally into the
  acknowledged outbox, routes them to the bound decision thread, retries them
  until a Slack timestamp is acknowledged, and never emits `NOT RECORDED`
  after commit. Claude R4 explicitly corrected the R3 miss and returned
  `CONVERGED`; all five release gates are GO.
- Schema-only rehearsal on the production PostgreSQL host passed: migration 115
  applied and reapplied idempotently; the transactional smoke covered pursuit
  replay/terminal state, coverage, retry, source-run association, RLS, expiry,
  event ledger, daily re-alert, and delivery acknowledgment; the tracked
  rollback then removed 115 and restored both migration-114 decision paths.
  The disposable database and six temporary SQL files were removed. No live
  business row, daemon, gate, schedule, taxonomy row, or message changed.
- Final pinned Node 22.23.2 verification passes formatting, typecheck,
  documentation continuity, 9 focused files / 64 tests, and the complete
  permission-enabled repository suite at 151 files / 1,969 tests. The
  independent runner build and 4 files / 29 tests also pass.
- Production migration 115 and immutable release `9aa23b4e7c39` are live under
  Node 22.23.2 with Slack/Gmail healthy. The legacy daily scan is paused and
  collection alone is enabled; review remains disabled. The first bounded
  one-time CaleProcure canary crossed the old five-minute timeout and completed
  after 443 seconds, but wrote no source-run receipt, so its scheduler
  `success` is explicitly rejected as a business success. While that run was
  active, the due `once` row was queued a second time because `next_run` was not
  cleared until completion. `src/task-scheduler.ts` now claims a one-time task
  before container execution; the focused fake-timer regression proves a slow
  run is queued exactly once.
- Claude session `58fde579-483e-42ca-a516-434971d3ad07` resumed from native
  handoff `2026-08-09-1651-procurement-proposal-source-r5.md`. R6 changed the
  proposal verdict to `CHANGES REQUIRED`, corrected the missing action-card and
  event-ledger contracts, and found a latent 115 reconciler defect that would
  rewrite a future submitted pursuit as `expired_undecided`. That path is not
  reachable under 115, but migration 116 may not enable `proposal_ready` or
  `submitted` until it replaces the expiry predicate and passes R7 review.
- The second natural CaleProcure canary ran exactly once after an operational
  pause-on-pickup workaround but again produced no source-run receipt. Public
  browser inspection found eight zero-result planned searches and one current
  `facilitation` row, event `0000039985` for SF Bay Conservation Commission.
  The page keeps a stale hidden row after a zero-result search and does not
  safely settle at `networkidle`; the installed procedure now uses visible
  markers, ignores retained hidden rows, rejects default-table extraction, and
  requires a verified business-unit/event identity.
- An operator-assisted adapter canary first failed closed on the missing
  business unit, then completed as source run 4 after public agency evidence
  established business unit `3820`: planned 9, observed 9, missing 0, one new
  observation/opportunity. This proves the adapter/database path only and does
  not count as a natural agent scan.
- Claude R7 returned `CHANGES REQUIRED`. It confirmed the pre-validation
  final-text leak and uncorrelated post-start receipt query, and additionally
  found an under-inclusive `rescan` matcher, missing release-owned unit/version
  checks, a fail-open optional validator, and a restart orphan introduced by
  clearing a one-time task's due timestamp. The follow-up delta binds IPC
  ingestion to a host-owned task token, buffers final text until validation,
  uses a compare-and-swap claim, and fails orphaned one-time tasks loud rather
  than rerunning them silently. Review remains disabled.
- Claude R8 independently returned `GO` for commit, immutable collection-only
  deployment, and a third natural CaleProcure canary. Its review closed all ten
  R7 findings and confirmed the host token, CAS, task-state, release-contract,
  and JSONB-predicate semantics. Pinned Node 22.23.2 then passed the complete
  permitted repository suite at 152 files / 1,980 tests, plus typecheck, build,
  formatting, documentation continuity, and the independent runner build and
  4 files / 29 tests. Before the canary, execute the read-only PostgreSQL
  predicate precheck; keep review disabled and require event `0000039985` / BU
  `3820` as the unassisted positive control. R8 also records three safe-direction
  scheduler follow-ups (restart-overlap false orphan alert, exact group-not-found
  terminal reason, and a lost-CAS regression) that do not permit a false success
  and do not block this reviewed release.
- Follow-up commit `ba726e7cbda0` was built as immutable archive SHA-256
  `09606bde8ed6a9f20ef587c46f3a8877a30809c88987fada187e29b03f95b6de`
  (source tree `14272af5b15c6431ff9de41f44cdcf182f6a9224`, artifact
  `268749789bde31b0f6389776066802e6d537f2558f1fd93186dac2700f51492d`)
  and activated successfully. The plist rollback is
  `com.nanoclaw.plist.rollback-9aa23b4e7c39-2026-08-09T23-54-21-421Z`.
  Health reports exact `ba726e7`, Node 22.23.2, Slack/Gmail connected, and no
  active container. A read-only live PostgreSQL JSONB-predicate precheck
  returned zero contradictory rows. Live task timeout drift was corrected
  from 600000 to release-owned 900000 milliseconds while no task was active.
- The production plist unexpectedly still had CaleProcure ingest disabled;
  collection was enabled with an exact backup under
  `NC-20260809-003-20260809T212700Z`, while review remains `0`. The release
  archive does not package `knowledge/`, so the separately tracked reviewed
  procedure was installed byte-exact after backing up its prior bytes; this
  operational packaging boundary must remain explicit.
- Third natural task `nc-20260809-003-caleprocure-canary-3` ran exactly once
  and completed host source run 5 with adapter v2, planned 9, observed 9,
  missing 0. Its source/task correlation and scheduler behavior therefore pass,
  but it reported zero observations/opportunities and missed the known public
  positive control, so the business outcome fails and review stays disabled.
  Independent browser reproduction found the immediate cause: entering
  `facilitation` leaves the unfiltered/default state until the page's explicit
  `Search` button is clicked. After that click the visible grid reports one
  result and shows event `0000039985`; the page simultaneously retains hidden
  duplicate summaries/elements. The procedure correction now requires
  `Clear Criteria`, exact fill, explicit `Search`, and visible-only summary/grid
  proof. Claude review and another natural positive-control canary are required
  before any review, proposal, or source-expansion gate changes.
- Claude R9 returned `CHANGES REQUIRED`: Step 4 still defined observation by
  page load, visible-only selection lacked an operational snapshot method, and
  the documented in-run retry for `partial` cannot converge under a task-bound
  run key. Those determinate procedure defects are being corrected. Public
  browser inspection also found a portal-native stable-identity path: the
  visible `Look up businessUnit` table maps the exact SF Bay Conservation
  Commission row to `3820`, and the constructed clean detail URL visibly
  confirms event `0000039985`, department, title, and close date. The procedure
  will require exact-one lookup match plus detail-page verification and fail
  partial on ambiguity.
- R9 also confirmed a release-integrity gap: `groups/procurement/CLAUDE.md` is
  manifest-covered but delegates to a `knowledge/` procedure that the release
  archive omits and the container currently mounts from the mutable operations
  checkout. Before the next canary, package tracked `knowledge/` bytes and have
  the host prefer the verified release-owned per-group knowledge directory,
  with a tested fallback only for older releases that do not contain it.
- Claude R10 returned `CHANGES REQUIRED` on one release-integrity drift case:
  raw configured targets `''`, `knowledge/`, and `./knowledge` could survive
  suppression, normalize to the release-owned target, and mount later. The host
  filter now uses the same empty-value fallback and POSIX normalization as the
  mount resolver, with a regression for every alias. R10 otherwise accepted
  the three R9 procedure repairs, portal-native identity workflow, packaged
  knowledge, old-release fallback, and release-root trust boundary. Its
  non-blocking instruction findings are also incorporated: resolve controls
  before acting, require lookup-reported global uniqueness, and permit only
  trim/whitespace/case normalization for department equality.
- Claude R11 returned `GO` after independently exercising twelve mount-target
  spellings and reproducing all five focused verification claims. It authorizes
  commit, immutable collection-only deployment, and one fourth natural canary
  with review disabled. The exact CLI result was 233.640 seconds and
  `$7.0173895`; the response document's internal end time is not used as
  operational evidence. R11's nested-subpath hardening remains non-blocking
  because no tracked configuration targets such a path.
- The final exact Node 22.23.2 gate passes 152 files / 1,986 tests, host build,
  typecheck, formatting, documentation continuity, and `git diff --check`; the
  independent runner build and 4 files / 29 tests also pass. An earlier npm
  wrapper attempt selected ambient Node 26 and was discarded as invalid runtime
  evidence before the suite was rerun directly with the pinned executable.

### NC-20260806-001

- Trigger: Marina Minina Lead #1047 produced a syntactically valid review card
  whose draft contained the banned phrase `happy to help`. Container-side
  `send_message` returned `Message sent.` before the asynchronous host checked
  the exact card. The Slack transport replaced the card with
  `[APPROVAL CARD REJECTED]`, but that later content-guard branch did not return
  the rejection to the originating Sales container. Sales therefore emitted a
  false `Draft posted ... awaiting approval` recap while no approval card
  existed.
- Recovery: the exact rejected card was recovered from Sales session
  `f99127da-01cf-44b7-9399-a85cb6907278`. Only the banned phrase was changed,
  from `happy to help map out` to `I can map out`; the deployed parser and
  content guard accepted the corrected card, and the normal Sales IPC path
  stored it in Marina's original Slack thread at ts `1786051860.082149`.
- Boundary: make host validation feedback authoritative and targeted to the
  same container; do not weaken the content guard, synthesize customer email,
  approve the card, or send it to Gmail.
- Claude R1: fresh Opus session `22b5d0af-9626-4455-8b57-76c3076f217e`
  returned `CHANGES REQUIRED`. It verified the exact Marina feedback and
  container-isolation path, then found that the first recap predicate could
  suppress blocked prose, an overlong valid card still lacked targeted
  feedback, the unavailable-container branch lacked a regression, and an
  approval card with `target_group` received a false cross-group tool string.
  Codex reproduced and repaired all four before R2.
- Claude R2: returned `CHANGES REQUIRED` because IPC measured only raw card
  length while Slack measured the group prefix plus card length when the marker
  had leading whitespace. Codex replaced the shared constant with a shared
  prefix-aware predicate used at both sites, added the exact 3,995-character
  regression, preserved question/still recaps, and added runner build/tests to
  the immutable email release gate before R3.
- Claude R3: returned `CONVERGED` on the shared predicate, exact regression,
  recap behavior, and empirically fail-closed runner gate. Its non-blocking
  fresh-checkout prerequisite is now explicit: install the independent
  runner's lockfile before the shared email gate or immutable release build.
- Claude R4: returned `CONVERGED` on that documentation closeout. The command
  includes `--include=dev` so a release shell with `NODE_ENV=production` still
  installs the runner's build/test tools. The bounded follow-up is to cap
  consecutive rejection/correction turns per container and lead; the current
  container lifetime still prevents an infinite process, but not repeated
  visible churn within that lifetime.

### NC-20260804-004

- Trigger: approved Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` contained a
  direct `us06web.zoom.us` meeting link supplied for the requested response.
  The host content guard blocked it solely because `zoom.us` was absent from
  the static link whitelist.
- Recovery: the owner explicitly ordered the email sent. A bounded recovery
  proved the stored card recipient, subject, content hash, and Gmail thread all
  matched the durable action; proved there was no prior Gmail receipt; and
  allowed only the single Zoom-domain violation. Gmail accepted message
  `19fcd6a20fc986df` on thread `19fcd3af14473697` at
  `2026-08-04T15:35:12.964Z`. The action is durably `confirmed` with exactly one
  confirmed event and must not be replayed. The missing mechanical receipt was
  posted back to the exact Sales thread at Slack ts `1785858368.200159`.
- Audit boundary: compare canonical Sales/customer-service link sources to the
  actual host whitelist. Add only company-owned or established transactional
  domains with explicit regression cases; do not turn approval into a general
  arbitrary-link bypass.
- Implementation: allow regional `zoom.us` meeting hosts, Tandem's legacy
  `tandemcoaching.com` site and company-controlled `tco.ac` short links, and
  Stripe's canonical `book.stripe.com` checkout host. Exact hostname/subdomain
  matching remains unchanged, and suffix lookalikes remain blocked. The content
  guard suite is now part of `test:email-critical`. Parseable approval cards
  run that same guard before Slack presents them and again before Action-ID
  creation, so deterministic content failure appears before approval.
- Verification: the exact converged tree passes typecheck, the expanded serial
  email-critical gate (18 files / 497 tests), and the complete suite (147 files
  / 1,927 tests) under pinned Node 22.23.2. Claude R1 returned changes required;
  R2 and the narrow post-hardening R3 both returned converged.
- Release boundary: ship with NC-20260804-003. No further customer email is
  part of mechanical release validation.
- Deployment: immutable release `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba`
  is active on the production Mac mini. Health verifies source tree
  `89f2629dfdde77b160fbc30824287eefa0782545`, artifact hash
  `1ace579828a381aedef998ac4ae1819f409960ea59fc802789e437dfa0ee06de`,
  pinned/runtime Node `22.23.2`, exact code root, connected Gmail and Slack,
  one listener, and an idle queue. Operational Sales/Mailman instruction hashes
  match the release. The next natural canonical-link approval remains outcome
  validation.

### NC-20260804-003

- Trigger: Lead #1003 Action `4fae5b5b-7a56-4588-8c62-c16e769ae371`
  carried the exact approved subject/body through the Sales handoff, but Mailman
  changed one literal `&` to `&amp;` and omitted `action_id` in its Gmail tool
  call. The immutable hash guard stopped before Gmail; the generic hold message
  incorrectly told the operator to reconcile a receipt even though no execution
  claim or Gmail call existed.
- Authorized recovery: the owner ordered the email sent before implementation.
  A bounded host script required the durable action to have no execution,
  confirmed, or uncertain event; re-parsed the exact stored approval card;
  verified recipient, subject, body hash, and Gmail thread; and atomically
  queued one exact reply. Gmail confirmed message `19fcd16443172cb1` on thread
  `19fccbd558f107e6` at `2026-08-04T14:03:36.867Z`. No redraft or duplicate was
  used.
- Second production reproduction: Lead #1019 Action
  `732cc8de-b9cc-4cb6-8d73-2e6b833e6d01` supplied the correct Action-ID,
  recipient, and subject, but Mailman again expanded one approved literal `&`
  to `&amp;` (455 approved UTF-8 bytes versus 459 attempted bytes). The host held
  before an execution claim. Read-only preflight proved the stored card and
  action hash matched, the ledger had no Gmail attempt/receipt, and Gmail Sent
  had no matching post-approval message. Bounded recovery sent the exact stored
  card once; Gmail confirmed message/thread `19fceafb937b9bfa` at
  `2026-08-04T21:30:50.684Z`, the business interaction was logged, and the
  mechanical receipt was posted in the originating Sales thread. This is the
  same already-tested defect, not a new defect family; do not replay the action.
- Third production reproduction: Lead #1029 Action
  `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d` repeated both original defects before
  deployment: Sales omitted the host-issued Action-ID from its handoff, then
  Mailman changed a literal `&` to `&amp;` in both the approved subject and body.
  The immutable hash guard held before execution. Read-only ledger/card/Gmail
  Sent checks proved no prior send; an exact hash-matching IPC recovery then
  passed the normal action, recipient, Party, content, Gmail, receipt, and Slack
  boundaries. Gmail confirmed message/thread `19fd3438954b40fe` at
  `2026-08-05T18:50:46.831Z`. The originating Sales thread has the mechanical
  receipt. A new IPC regression covers this exact unthreaded, no-Action-ID,
  entity-mutated first-response shape; do not replay the action.
- Fourth production reproduction: Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` repeated the same defect before
  deployment. Mailman's unthreaded `gmail_send` omitted the Action-ID, preserved
  recipient and subject, but expanded one approved literal `&` to `&amp;` in the
  body (1,852 approved bytes versus 1,856 attempted bytes). The immutable hash
  guard held before execution. The ledger and exact Gmail Sent search proved no
  prior send; exact approved-card recovery passed the normal host boundaries.
  Gmail confirmed message/thread `19fd44fd031fc6f1` at
  `2026-08-05T23:43:48.546Z`, and the originating Sales thread received the
  mechanical receipt at Slack ts `1785973428.757949`. The Lead-#1029 regression
  already covers this body-only subset through the stricter combined
  subject/body mutation case; do not replay the action.
- Final pre-activation drain: three additional stranded approvals were proved
  free of Gmail execution evidence and recovered from their exact stored cards
  through the reviewed release code. Actions
  `c62d02ac-ed49-4b28-93f9-8935e3f07423`,
  `b3b0727f-1c51-476e-b854-b313996de655`, and
  `a5013939-ff73-44bc-bb98-0e4a5a7903d5` are durably confirmed once with Gmail
  receipts `19fd4b60e5c393c6`, `19fd4b6457fdb1db`, and
  `19fd4b85d6692aa2`; their originating Sales threads have the mechanical
  receipts. The post-drain ledger contained only 23 confirmed and two
  deterministically blocked actions, with no pending, executing, attention, or
  uncertain work.
- Design correction: the model may request execution but must not resupply
  approved customer-facing fields. For an exact durable action, the host will
  rehydrate those fields from `draft_ts` and `chat_jid`, verify them against the
  stored hash and recipient, and dispatch only the host-derived payload. Any
  model-supplied CC is discarded because CC is not represented in the approval
  record; model `lead_id` and `email_type` are replaced with host-derived
  values too.
- Action-selection correction: a newer approval in the same Slack work thread
  durably supersedes older pre-Gmail actions. Multiple live approvals on one
  Gmail thread hold unless raw request content corroborates exactly one durable
  candidate; those raw bytes are never executed. Terminal states are checked
  before card rehydration, and explicit stale actions report that Gmail was not
  called.
- Audit correction: scheduled Sales `[FOLLOW-UP #N]` cards were not recognized
  by the ledger at all. Their canonical format now requires exact `Email`,
  `Thread-ID`, fenced `Subject`, and fenced body fields; legacy incomplete cards
  fail visibly and must be reposted. Host-generated proposal follow-ups now
  claim and confirm the same one-time action ledger before their direct Gmail
  call, so a post-Gmail interaction-log failure cannot leave the proposal draft
  pending and invite a duplicate resend.
- Boundary: exact customer recovery, implementation, Claude review, commit,
  immutable activation, and safe live verification are authorized. No unrelated
  email, regenerated content, approval widening, OAuth change, or unrelated
  production-data cleanup is in scope.
- Convergence and validation: Claude Opus R1 found the stale-action selector
  blocker and returned changes required. Codex reproduced and repaired it plus
  the bounded R1 findings. R2 returned converged; after Codex removed the final
  raw prior-follow-up marker false rejection and updated security documentation,
  R3 again returned converged. The exact final tree passes pinned Node 22.23.2
  typecheck, the serial 18-file / 497-test email gate, and the complete 147-file
  / 1,927-test suite.
- Deployment and replay proof: immutable release
  `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba` is active and health-verified with
  artifact hash
  `1ace579828a381aedef998ac4ae1819f409960ea59fc802789e437dfa0ee06de`.
  A live replay of confirmed Action `c62d02ac-ed49-4b28-93f9-8935e3f07423`
  was consumed by the watcher and posted `[EMAIL ALREADY SENT]` in the original
  Sales thread. The action event count remained six and the exact Gmail Sent
  result set remained unchanged, proving the running host made no duplicate
  Gmail call. The next natural approved email remains business-outcome
  validation of the complete normal path.

### NC-20260804-001

- Owner/client: Codex.
- Branch/base: `codex/nc-20260804-001-sales-generating-ack` from
  `f513f94f81fa3bbd2662cbf52e0d50c9fc3ab3ae`.
- Status: deployed, awaiting the next natural Sales handoff for outcome
  verification.
- Observed incident path: the Mailman-to-Sales handoff entered Sales host
  processing in 0.9 seconds, no container-slot wait was observed, and the review
  card appeared roughly 134 seconds after handoff. Live registration and the
  exact saved runner session confirm Sales used Sonnet, not Opus. That one draft
  consumed 19 agent turns / 12,007 output tokens: ten full-file reads returned
  159,125 characters, five PostgreSQL commands handled lead/pipeline state, one
  ToolSearch resolved the messaging tool, and one send posted the card. The
  tools were finished about 80 seconds before ToolSearch, isolating the largest
  remaining delay to model processing over the oversized context. Follow-up
  `NC-20260804-002` owns measured context reduction; it must not trade away
  pricing, scheduling, learned-correction, approval, or recipient safeguards.
- Root cause: `groups/sales/CLAUDE.md` said the host supplied a mechanical
  processing acknowledgment, and host dispatch already supported an opt-in
  `processingMessage`, but the Sales startup invariant enforced only
  `threadPerMessage`. A dispatch send failure also recorded duplicate
  suppression before delivery and could prevent the spawn fallback from
  retrying the receipt.
- Implementation: require the exact Sales receipt `Generating response…`
  alongside per-message work isolation, preserve all unrelated container
  overrides, await the in-thread receipt before enqueue, and record its
  duplicate key only after successful channel delivery. Sales instructions and
  shared architecture now describe the exact host/model contract.
- Verification: under pinned Node 22.23.2, focused routing tests pass 23/23,
  email-critical tests pass 14 files / 443 tests, the complete suite passes 145
  files / 1,904 tests with its required loopback/subprocess permissions,
  typecheck and production build are clean, formatting/diff whitespace pass,
  and documentation continuity passes. The clean immutable build re-ran and
  passed its 14-file / 443-test email gate; bundle verification reports 520
  files. Production health verifies launchd PID 38279 on Node 22.23.2, connected
  Gmail/Slack, an empty wait queue, exact release/code-root agreement, and the
  exact reviewed Sales prompt hash. The persisted Sales row now carries
  `processingMessage: "Generating response…"`, `threadPerMessage: true`, and
  retains its other settings. The next natural Sales handoff remains the only
  missing business-path observation.
- Release/deployment: commit
  `fa817a179448838a7489d4398992ce3cd9c929fb`, source tree
  `830e8d9785c6c8dab9a47a74e23acdc3c105f98d`, artifact digest
  `4e620674603c4d8dabe44f3b9c7b2224cd0e7ca6d962acab1e3848adad8f285e`,
  archive digest
  `125f1fc835c9cd067409a46be27d381bc04db747e5f32c7094a6a6f641840d65`.
  Activated on the production Mac Mini at 2026-08-04T12:51Z; rollback plist is
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-21d54309a42a-2026-08-04T12-51-22-058Z`.
- Safety boundary: do not create a synthetic lead, customer send, or approval
  to prove the receipt. Deployment may verify code/config/health; natural
  in-thread outcome evidence remains distinct.

### NC-20260804-002

- Trigger: the latency audit under NC-20260804-001 showed that the representative
  simple Sales draft was not queued and was not running Opus. It used Sonnet for
  19 turns and loaded 159,125 characters through ten reads before producing the
  card. The three largest inputs were `KNOWLEDGE.md` (55,713 returned
  characters), `LEARNED.md` (44,659), and `WORKFLOWS.md` (30,822).
- Boundary: do not simply remove required reads or switch models. Establish a
  representative set spanning pricing, scheduling, returning leads, forwarded
  inquiries, missing Entry IDs, revisions, and approvals; compare exact draft
  facts and required database/host actions before and after any retrieval change.
- Candidate direction: bounded heading/keyword retrieval or a reproducibly
  generated Sales briefing from canonical knowledge and learned corrections,
  with provenance and drift checks. Redundant Claude auto-memory reads should be
  measured separately from canonical file access.
- Deployment: none. This task records the verified performance debt; it does not
  alter Sales drafting behavior in NC-20260804-001.

### NC-20260803-003

- Trigger: a forwarded Level 1 registration inquiry from an internal sender
  matched a learned calendar-notification sender rule, reached Chief without
  the original inquiry or exact Gmail identifiers, and dead-ended when Chief
  and Sales attempted searches outside their host-assigned capability.
- Confirmed failure chain: the sender-wide auto-rule treated `Fwd:` as a normal
  notification; the parser cut text at the forwarded-message boundary; the
  early classified route returned before normal inbound persistence; and the
  Chief fallback omitted the Gmail message/thread IDs even though the host had
  granted Mailman those exact resources.
- Safety boundary: repair retrieval and routing only. Replaying the inbound
  inquiry may produce or recover a Sales draft, but it does not approve or send
  a customer email. Any production rule change must target the exact harmful
  row and remain reversible.
- Live rule remediation: an aggregate audit found 156 enabled `source='auto'`
  sender rules whose target taxonomy is not auto-archive (428 historical
  matches). All 156 were set `enabled=false` in one constrained update; no row
  was deleted, manual/lesson/seed rules were untouched, and a follow-up count
  confirmed zero enabled auto rules remain for non-auto-archive labels.
- Verification: pinned Node 22.23.2 typecheck, the final handler's 25 tests,
  and the complete 145-file / 1,900-test suite pass. Documentation continuity
  and diff whitespace also pass. Claude R6 found a rules-runner duplicate edge in the
  route retry; R7 converged after the retry became an atomic, stored-label,
  non-rules-runner claim. The immutable release build remains pending.
- Forwarded-recipient binding: a Tandem-owned From domain with a Gmail-added,
  aligned DMARC or DKIM pass plus an explicit Gmail/Apple/Outlook marker lets
  the host resolve the external From/Reply-To in the first forwarded header
  block. The external person becomes the lead, the teammate remains
  `Forwarded-By`, and the internal Gmail thread is audit-only and receives no
  Mailman reply grant; an approved response is a new email.
- Deployment/outcome: immutable release `21d54309a42a` is active with matching
  launchd PID/listener/release code root, Node 22.23.2, and connected Gmail and
  Slack. The exact failed message was replayed once, classified
  `MrGru/lead/inquiry`, routed once to Sales, and produced one validated Sales
  review card in its own thread. Recovery produced zero send events; the card
  remains approval-bound.

### NC-20260803-002

- Trigger: exact approved action `7f0ee312-1b73-4f9a-bbda-4459ee351436`
  for Colleen Entry 985 reached Mailman and the Gmail execution boundary, then
  failed closed with `recipient_guard`. No Gmail message or receipt exists.
- Root cause: Mailman passed pipeline Entry ID `985` in the legacy `lead_id`
  tool field, while the host independently resolved the exact approved recipient
  and Gmail thread to canonical Party ID `11152`. `verifyPartyRecipient()`
  called the model field a hint but allowed it to override the host result and
  rejected the legitimate send as a party mismatch.
- Safety boundary: the exact approved recipient, subject, body hash, Gmail
  thread, action claim, known-party email membership, CC checks, content guard,
  and Gmail receipt requirements remain unchanged. A host-resolved party wins
  over a conflicting model hint; the hint is used only when the host cannot
  resolve a party and the recipient is still proven among that party's known
  addresses.
- Owner authorization: the existing Slack approval authorizes only Colleen's
  exact draft. Recovery must mint a fresh action from an unchanged card after
  the terminal blocked action, and must not send any unrelated email.
- Release: immutable commit `69bbdf782770cc4389d7a0d9035b50e36f75aa47`
  is live under exact Node 22.23.2 with matching manifest/code root and healthy
  Slack/Gmail connections. The runner image was rebuilt first, all 17 runner
  snapshots were refreshed, and the operational Mailman procedure hash matches
  the reviewed release. Rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-5b76a2aa40c5-2026-08-03T19-57-19-459Z`.
- Recovery: reposted card `1785787259.608959` was byte-identical to blocked
  card `1785785402.796949` (1,045 bytes; SHA-256
  `faa1cf763ab16f18759b6e3573db92ecb08a477f7af1446788a890e047386405`).
  Fresh action `15757279-47de-4a94-84f2-10613f63ea8c` confirmed at
  `2026-08-03T20:06:11.446Z` with Gmail message `19fc93bda9566299` on original
  thread `19fc907d76aa161a`. The ledger has one confirmed row, one matching
  confirmed-content row, and one row for that Gmail message ID; the outbound
  interaction was logged and Slack posted the Gmail receipt.

### NC-20260803-001

- Trigger: the first natural approved-customer workflow after NC-20260802-009
  exposed three interacting production defects. Justin Mangum's Sales card was
  approvable despite lacking a parseable `Subject:` inside its draft fence, so
  no exact email action was armed. Two concurrent Mailman containers then read
  a shared, untargeted Gmail-denial input and consumed each other's results:
  Justin's denial was attributed to Judith Pineiro after Judith's separate
  approved reply had already received Gmail message ID `19fc7f12ade6742f`.
  Concurrent root- and thread-scoped Sales work units also split Justin's review
  card from the thread containing the operator instruction and later status.
- Evidence boundary: production logs and the immutable release identity were
  inspected read-only. Production is running exact release `e1fa93e` under Node
  22.23.2, PID 68877. Judith's reply is Gmail-confirmed; Justin's unbound
  `gmail_reply` is quarantined and was not sent. Customer body text and secrets
  are not copied into continuity or Claude review artifacts.
- Owner authorization: at 2026-08-03T14:15Z the owner explicitly ordered an
  immediate fix, Claude validation, and completion of the stuck email. This
  authorizes implementation, review, commit, production activation, and exact
  recovery of the already-approved Justin action. It does not authorize a
  regenerated draft, changed recipient/content, unrelated email, OAuth change,
  database cleanup, or Procurement activation.
- Invariants: malformed cards must be rejected before an operator can approve
  them; asynchronous host results must be delivered only to the originating
  container; one Sales work item must have one host-owned Slack root/work-unit;
  uncertain outcomes remain held; recovery must use exact operator-approved
  bytes and end in a Gmail-confirmed receipt before it is called sent.
- Claude R3 found a second instance of the incident class: Chief's canonical
  support template was ignored by Git and used a legacy shape that could not
  arm an action. The reconciliation now tracks and packages the template in the
  exact fenced form, proves the tracked file parses, uses group-appropriate
  rejection text, logs exit-swept unacknowledged results, orders runner rollout
  before host activation, removes unrelated reformatting, and shares the
  host-root predicate.
- Current pinned-runtime evidence after R3 reconciliation: typecheck passed;
  the focused six-file set passed 218 tests; and the release-blocking
  email-critical set passed 14 files / 416 tests. Broad gates remain to be
  rerun after Claude convergence and before release construction.
- Claude R4 found two remaining blockers: malformed cards already in Slack
  became silent at approval, and activation did not explicitly deliver the
  corrected tracked template into the writable operational group workspace. It
  also exposed the single-row approval parser against Slack's 4,000-character
  split. The reconciliation posts one visible rejection while minting no
  action, refuses to split overlong approval cards, uses a group-neutral
  quarantine family, and makes changed-prompt copy/hash an ordered activation
  gate. The Chief template is staged and recognized by `git ls-files`.
- Post-R4 pinned-runtime evidence: typecheck passed; the focused four-file set
  passed 179 tests; and email-critical passed 14 files / 417 tests.
- Convergence and release: Claude Opus 5 R6 returned `APPROVE`. Commit
  `5b76a2aa40c5709b5964c57f0ad5ba81938a1f78` passed the clean release gate;
  production verified the immutable release, rebuilt runner image
  `sha256:9de282074c63df2aef0902a07ffe540a756c54e30835d49fa8b65e0ac7a77767`,
  refreshed all 17 runner snapshots, hash-verified all five changed operational
  prompts, applied the one-row Sales `threadPerMessage` migration, and activated
  with healthy Slack/Gmail connections under Node 22.23.2.
- Recovery outcome: a corrected card was reconstructed from the stored prior
  recipient and 335-byte body plus the existing Gmail-thread subject. Production
  hash checks proved recipient equality, body equality, exact subject, and parser
  acceptance before approval. Action
  `92c2130d-4ee3-4d07-8632-1c29b2884281` reached `confirmed` with Gmail message
  `19fc862d08848576` on original thread `19fc7dbb8d41a592`; one confirmed event,
  one distinct message, one distinct thread, and one matching confirmed content
  row prove no duplicate send. Slack posted the matching `[EMAIL SENT]` receipt.

### NC-20260802-011

- Source: NC-009's first activation exposed a fresh-database-only blind spot,
  and Claude Opus 5 R3 found the corrected `pending_sends` fixture is exact but
  intentionally narrow.
- F1: add a release-blocking static or executable audit that no index/constraint
  in the initial schema block references a column added only by a later
  migration. R3's mechanical audit found zero current violations after the
  NC-009 fix.
- F2: separate older `ALTER TABLE` and backfill recovery. Several pre-existing
  migrations wrap both in one `try`; if the ALTER succeeds and the backfill
  fails, later startups skip the backfill because the repeated ALTER throws.
- F3: keep test database initializers unreachable in production, or move schema
  fixture support out of the shipped runtime module. The new helper has the
  same pre-existing exposure class as `_initTestDatabase` and no production
  caller.
- Boundary: prevention and cleanup only. No production schema or data change is
  authorized by this planned row.

### NC-20260802-010

- Source: Claude Opus 5 review R2 for NC-009 approved commit and activation but
  required its non-blocking N1-N5 findings to remain visible rather than be
  silently waived.
- N1: resolve an exact typed approval to the newest bot-authored approval card,
  not merely the newest bot message, and post a visible fail-closed reply when
  no eligible card is found. This closes the current silent second-approval
  no-op after the host's mechanical `[EMAIL ACTION]` status line.
- N2: decide and encode the scope of typed approvals. The current Slack channel
  offers the exact whole-message form to every registered approval listener,
  including incident and proposal-follow-up listeners that historically relied
  on a reaction. Either narrow the typed trigger or document and test the
  broader contract. NC-20260804-003 separately converges proposal-follow-up
  execution on NC-009's durable action/receipt boundary; the trigger-scope
  decision remains here.
- N3: anchor both `Subject:` and `Body:` parsing after the trusted original-text
  boundary, and fail closed when that boundary is missing.
- N4: sanitize the canary Subject inside `buildTransportCanaryRaw` even though
  the only production caller already validates a 40-hex release commit.
- N5: when global test routing blocks an action, say explicitly that recovery
  requires a corrected fresh draft and approval.
- N6: give the transport canary explicit, read-only paths for its operational
  environment and activated release manifest. Immutable releases contain no
  `.env`, so the direct release-root invocation cannot authenticate; NC-009's
  one canary used an isolated temporary working-directory bridge instead of
  mutating the verified release or copying secret values. Replace or remove
  the unpinned `email:transport-canary` npm path, and ship a tracked non-sending
  preflight that reports only Boolean credential presence plus resolved release
  identity before any canary can send.
- Safety/priority: N1 fails closed and N3-N6 cannot create a wrong or duplicate
  send. N2 widens triggers on pre-existing guarded paths and is the next
  approval-architecture decision. None authorizes a customer send.

### NC-20260802-009

- Trigger: after the July email-path batch, approved emails repeatedly failed
  or stalled while the operator waited. The incident was not one defect: an
  agent printed rather than routed a handoff; cross-group bot rows failed to
  wake Mailman; PostgreSQL bigint strings disagreed with model numeric IDs;
  unrealistic mocks hid that production failure; and source, compiled runtime,
  tracked procedures, and deployment evidence drifted apart.
- Outcome: one parseable approved card creates one host-issued action ID bound
  to its approval thread, normalized recipient, approved subject/body hash,
  durable stage history, guard result, and Gmail receipt. Same-recipient work
  is never correlated by recipient alone. Confirmed replay returns the original
  receipt without Gmail; an executing or uncertain action is held for explicit
  reconciliation. Failure is posted in the approval thread.
- Authority: the model may relay an Action-ID but cannot mint or overwrite the
  host record. Recipient, Party, content, Gmail-resource, and one-time execution
  checks remain host-side. This slice does not claim named-operator/expiry
  binding for every Company-OS approval class.
- Documentation drift in scope: `groups/mailman/OUTBOUND-EMAIL.md` was required
  by the tracked Mailman prompt but ignored by Git and absent from releases. Its
  local copy also contradicted current Unicode subject behavior and assigned a
  premature post-send database write to the model. Bring the corrected
  procedure under tracked authority and release packaging.
- Release boundary: `release:build` must run the serial email-critical suite
  against the exact clean commit before compilation. Deployment and a real
  controlled internal Gmail canary remain separate authorized states; no
  customer address or prompt-selected destination is permitted for the canary.
- Overlap: touches the same Sales/Mailman/Gmail/watchdog surfaces as NC-006 and
  prior NC-005/NC-006 email fixes. It must preserve the NC-006/008 one-root
  Slack contract and release activation controls. Procurement stays dark.
- Authorization: the owner said “execute” after approving this ticket's
  implementation, Claude review, commit, production activation, and one
  controlled internal canary. This does not authorize a customer email,
  production business-record mutation, prompt-authored recipient, OAuth change,
  or unrelated cleanup.
- Claude R1: exact-session Opus 5 review
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R1.md` returned `CHANGES
REQUIRED`. It reproduced a duplicate-send path where the five-minute alert
  changed `executing` to executable `attention_required`; found typed
  approvals were outside the host listener; identified legacy action-ID
  conflict, nullable-recipient confirmation, bare “queued” tool results, and
  the unsafe global test-routing canary; and required a tracked canary
  procedure.
- R1 reconciliation: overdue `executing` now becomes non-executable
  `uncertain` and says the email may have sent; exact typed `Approved` in a
  draft thread invokes the same host listeners as a reaction; the host posts
  the Action-ID in that thread and blocks malformed cards immediately; legacy
  conflicts backfill but never overwrite a missing action ID; global test
  routing blocks action-bound sends before claim; unbound requests alert Chief;
  the runner qualifies “queued”; untrusted original text cannot supply the
  parsed `Body:` marker; and a dedicated monitored-mailbox transport canary
  proves an exact Gmail receipt without customer/business state.
- R1 validation after reconciliation: exact Node 22.23.2 typecheck/build,
  email-critical 10 files / 294 tests, full serial regression 145 files / 1,845
  tests, runner build and 3 files / 22 tests, documentation continuity/schema
  self-test, and source formatting pass.
- Claude R2: exact-session Opus 5 review
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R2.md` returned `APPROVE WITH
FOLLOW-UPS`. It independently reproduced the interrupted-attempt lockout,
  recoverable never-started approval, terminal-state race guards, legacy action
  ID backfill, old-schema aggregate precondition, canary isolation, and release
  gate parity. Its N1-N5 residuals are registered as NC-20260802-010; none can
  send a wrong or duplicate email, and none blocks the authorized activation.
- First activation attempt: commit `d1bfccef1c5b6e49837ea668bdbfae207c0aec10`
  passed its archive/runtime verifier and dry-run, and the aggregate production
  `pending_sends` count was zero. At 2026-08-02T23:08Z target startup failed on
  `no such column: action_id`: the initial schema block tried to create the new
  action index before the later legacy-table `ALTER TABLE` loop added that
  column. Fresh databases used in tests already had the column, so they did not
  exercise this order. The activator restored exact release `aa1c821`; one
  healthy listener, Slack/Gmail connectivity, and an empty queue were verified.
  No canary or customer email ran. The exact pre-activation group prompts were
  restored from their release-specific backup.
- Fix in validation: defer `idx_pending_sends_action` creation until after all
  NC-009 columns are added. A new database test reconstructs the structure-only
  production pre-NC-009 table and its three indexes before calling the real
  schema initializer, then proves action/event writes work after migration.
- Claude R3: exact-session Opus 5 review
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R3.md` returned `APPROVE`.
  It executed both the committed and corrected real `createSchema()` bodies
  against the exact live DDL, proved the new fixture catches the committed
  failure, verified fresh/legacy/partial/idempotent convergence and action-ID
  uniqueness, and found zero other initial-index/later-column violations. Its
  non-blocking migration-maintenance findings are registered as NC-20260802-011.
- Post-R3 validation on exact Node 22.23.2: typecheck/build, email-critical 10
  files / 295 tests, full serial regression 145 files / 1,846 tests, runner
  build and 3 files / 22 tests, continuity, formatting, and diff integrity pass.
- Corrected deployment: commit `e1fa93e09f6dedf363c9a8c0be1723583563f533`
  produced a 520-file release with source-tree digest
  `7ade520429963e29e5d050da0b105bf7d2497b2b`, artifact digest
  `de470dd842a6443bb21fa95e3f827afb240324c3f50e35385ceb3cd21337c24a`,
  and archive SHA-256
  `e99cca9e13f8b35d9070ecfc444a79a66807db7a6814b06d1cfb66b6c69500b0`.
  Local unpack verification, production transfer verification, bundled release
  verification, a zero-row precondition, and the exact-three-field dry-run all
  passed. Activation changed `aa1c821` to `e1fa93e`; launchd, the sole
  NanoClaw listener, and no-cache health converged on PID 68877 under Node
  22.23.2 with matching commit/code root, Slack/Gmail connected, and zero
  active, waiting, or outbound work. The live additive schema has its action
  and event indexes, with zero pending actions and zero email events.
- Internal transport canary: the one authorized fixed monitored-mailbox canary
  succeeded after Gmail returned and re-read message/thread receipt
  `19fc4d33ccf3061e`; the recipient was disclosed only as SHA-256
  `a25b480c540d47711e9892cf5319e34bd91e430b7fe85cce306c30b90580df31`.
  It created no Slack post, customer/action row, business interaction, or OAuth
  change. Because immutable releases intentionally contain no `.env`, the
  canary ran from an isolated temporary working directory that linked the
  existing operational environment and copied only the activated manifest;
  the exact release binary and manifest were used and the harness was removed.
  The direct release-root command's environment assumption is tracked for
  follow-up under NC-010.
- Remaining boundary: NC-009 is deployed and its Gmail transport/OAuth receipt
  is live-verified. The full approved-customer path is not outcome-validated
  until a natural approved send proves Action-ID continuity, threaded operator
  status, event history, Gmail confirmation, and replay behavior without a
  synthetic customer message.
- Claude R4: the same exact Opus 5 session reviewed the deployment/canary record
  and returned `APPROVE WITH FOLLOW-UPS` in
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R4.md`. It found no factual
  contradiction, overclaim, missing rollback fact, secret/customer-address
  leak, or commit blocker; it reproduced continuity and diff-integrity checks.
  Its D1/D2 findings—the unpinned npm canary path and lack of a tracked
  non-sending preflight—are now explicit in NC-010 N6. D3's shared-environment
  precision is reconciled in the runbook.

### NC-20260802-008

- Dependency: NC-006 is committed. On 2026-08-02 the owner explicitly ordered
  NC-007 and NC-008 before the combined deployment, superseding the earlier
  implementation-order dependency on a prior live observation. Do not weaken
  the queue-registered work-unit default or permit lead replies to broadcast;
  the deployment still requires a real post-switch observation before the
  behavior can be called outcome-validated.
- Scope: add negative coverage for every historical-root rejection reason;
  make resolver downgrades observable; define a bounded retry trigger for
  queued non-connection failures; reconcile simultaneous anchor rolls; give
  `[COLD]` and restarted follow-up work an explicit generation or recency bound;
  require active queue state before inheriting a work-unit thread; define the
  non-lead Sales inheritance boundary; and avoid duplicating a successfully
  posted first chunk inside its thread.
- Implementation: same-lead routing is serialized before anchor lookup so two
  simultaneous scheduled re-posts cannot both become roots. A scheduled marker
  is a revision only while its stored root is at most six hours old; older
  `[COLD]`/same-number follow-up cards start a new cycle. The active queue state
  is now mandatory for container-context inheritance, explicit timestamps are
  stripped across channels, and same-channel non-lead Sales status inherits
  only the host-registered work-unit thread. Resolver degradations and outgoing
  retry depth/attempts are exposed as non-sensitive channel health diagnostics.
  Connected send failures receive one bounded exponential retry trigger, while
  a partial multi-chunk delivery queues only its unsent remainder beneath the
  already-persisted root.
- R5 reconciliation: an unregistered source group now strips thread authority
  rather than failing open, the resolver downgrade counter explicitly says it
  resets on process start, and the prompt anchors the six-hour window to root
  creation. Resolver failure still cannot safely produce the canonical
  email-based anchor, so those sends remain fail-visible and unanchored; the
  health downgrade counter is the operator signal, and a fallback identity is
  explicitly declined because it would silently create a second lead authority.
- Verification: Node 22.23.2 typecheck, the combined release/Sales suite at 7
  files / 186 tests, and the full regression at 144 files / 1,827 tests pass.
  Documentation continuity, schema sanitizer self-test, source formatting, and
  diff whitespace pass. Claude R6 blocker-closure review remains pending.
- Review: exact-session Claude Opus R6 returned `APPROVE WITH FOLLOW-UPS`, with
  no commit or deploy blockers. Resolver-outage fallback identity is explicitly
  declined above; the remaining retry/persistence and operator-mid-activation
  races are accepted residuals documented in the report.
- Boundary: no Slack post, database rewrite, or production rollout is implied
  by this planned row. Each runtime behavior change needs its own reviewed
  implementation and live-verification boundary.
- Deployment: commit `aa1c82187b7fbf10050a4863bdbe8d07e87af82c` is live on
  the production Mac Mini. Slack/Gmail are connected, the outgoing queue and
  resolver-downgrade counter are zero, and no container is active or waiting.
  No synthetic Sales post was created; the end-to-end thread outcome remains a
  natural-traffic observation.

### NC-20260802-007

- Dependency: NC-003 must be committed first. Preserve the exact-three-field
  activation plan, exclusive lock, pre-mutation listener probe, bounded
  rollback, and explicit host confirmation.
- Scope: improve the diagnostic for a pruned prior release and same-directory
  targets; replace racy automatic stale-lock reclaim with an atomic claim and
  explicit operator recovery; surface broken tool probes during dry-run; prove
  the healthy-rollback reporting branch; and exercise real macOS plist
  JSON-to-XML conversion/linting outside the mocked unit boundary.
- Implementation: macOS `shlock` now owns the PID lock using its atomic
  `link(2)` claimant and refuses every extant lock; cleanup removes only a lock
  still naming this process. A dead holder is reported as stale and requires a
  documented operator proof/removal/rehearsal sequence rather than an unsafe
  automatic unlink. Both listener and lock-tool availability run in dry-run;
  pruned, same-real-directory, and already-active roots fail directly; healthy
  rollback is asserted; and a Darwin-only integration test round-trips the
  candidate through the real `plutil` XML renderer/parser.
- R5 reconciliation: Claude empirically proved that macOS `shlock` refuses
  stale locks. The mock now matches the platform, live and dead holders are
  distinguished, tool availability is rehearsed, and stale recovery is an
  explicit operator proof/removal/rehearsal step. Symlink aliases of the active
  release also fail directly.
- Verification: Node 22.23.2 typecheck, the combined release/Sales suite at 7
  files / 186 tests, and the full regression at 144 files / 1,827 tests pass,
  including the real plist integration test. Documentation continuity, schema
  sanitizer self-test, source formatting, and diff whitespace pass. Claude R6
  blocker-closure review remains pending.
- Review: exact-session Claude Opus R6 returned `APPROVE WITH FOLLOW-UPS`, with
  no commit or deploy blockers. The platform behavior, mock, recovery runbook,
  and dry-run prerequisites now agree.
- Boundary: this is follow-up verification and ergonomics work, not authority
  to switch the installed plist or restart launchd.
- Deployment: the owner-authorized activator dry-run and apply both succeeded
  on `macmini-eth.kudinov.com`, changing exactly the three planned identity
  fields from `23ffb07` to `aa1c821`. Release root and prompt hashes match; the
  in-place 512-file bundle re-verifies; Node 22.23.2, launchd, listener, and
  health converge on PID 14460; and the activation lock is absent. An immediate
  post-switch probe briefly sampled retiring PID 7169, so completion is based
  on the subsequent no-cache probe where health, `lsof`, launchd, and `ps`
  agreed—not on the transient sample.

### NC-20260802-006

- Operator contract: each newly received handoff to Sales is a fresh top-level
  work-item root. The associated draft, revisions, questions, approval status,
  outbound handoff, and confirmations are thread replies and never broadcast to
  the channel timeline.
- Root lifecycle: a new `*→sales` handoff deliberately repoints the canonical
  lead anchor even when an older lead thread exists. A scheduled `[FOLLOW-UP]`
  or `[COLD]` card is also a new visible work item so its approval/control
  surface cannot disappear in a collapsed old thread. Ordinary lead replies
  never roll solely because an anchor exceeded the generic TTL.
- Concurrent cycles: an explicit thread is accepted only when the host already
  persisted that root in the same channel for the same lead. This preserves an
  older still-open cycle after the current lead anchor advances, while rejecting
  mistyped or unrelated model-supplied timestamps.
- Work-unit authority: the runner labels its IPC output with its container
  identity, and the host defaults Sales replies to the queue-registered Slack
  thread that woke that exact container. Omitted `thread_ts` therefore cannot
  redirect an older active cycle to the newest lead anchor. Cross-group sends
  never inherit the source thread.
- Scheduled revision dedup: a repeated `[FOLLOW-UP #N]` or `[COLD]` card whose
  current stored root has the same normalized marker and lead is a thread reply,
  not another channel root.
- Retry boundary: reconnects re-enter the canonical router. If a long handoff's
  first chunk established a root before a later chunk failed, the retry is
  forced beneath that host-recorded root rather than creating another root.
- Host boundary: the queue and IPC watcher originate active work-unit context;
  the Slack adapter validates any explicit historical root and enforces the
  anchor/broadcast policy. Prompt instructions remain defense in depth.
- Follow-up disposition: the R3 host-authority, scheduled-card dedup, dead
  branch, faithful partial-retry fixture, and channel-scoped message lookup
  findings are closed here. Negative rejection coverage, resolver downgrade
  telemetry, non-connection retry triggering, anchor-roll races, scheduled-cycle
  recency/generation, active-state and non-lead inheritance hardening, and
  in-thread chunk-content dedup remain open under planned task
  `NC-20260802-008`.
- State boundary: implementation and local tests are authorized. No Slack post,
  production database edit, installed service change, or deployment is part of
  this slice without separate authorization.

### NC-20260802-005

- Dependency: the coordinator may schedule only submissions represented by the
  NC-004 host index. Slack delivery receipts remain delivery evidence, not the
  grading workflow record.
- Phase contract: while any live `Complete (no feedback)` row exists, only
  Modules 1-5 may be dispatched. At most five unresolved Slack roots may be in
  flight. All outstanding root timestamps are exposed as one polling batch.
- Module 6 boundary: eligibility requires all eight canonical prerequisites to
  have current-run, Heartbeat-sourced `approved` observations and no newer
  unresolved/retry attempt. The coordinator never trusts the grader's course
  completion text and never issues a certificate.
- Side-effect boundary: the coordinator returns explicit next actions and
  transition preconditions. A signed-in browser operator still performs and
  verifies Heartbeat writes; missing or contradictory evidence holds the item.
- Live title observation: the exact assignment titles currently rendered by
  Heartbeat are recorded in
  `docs/reports/NC-20260802-004-HEARTBEAT-ID-OBSERVATION.md`. Title drift is no
  longer an open architecture question; submission identity remains blocking.

### NC-20260802-004

- Authority: `store/messages.db` owns this operational workflow index because it
  correlates Heartbeat source IDs, Slack delivery, grading, and writeback. Live
  Heartbeat remains authoritative for submission/result facts.
- Privacy boundary: persist stable IDs, assignment/status metadata, timestamps,
  hashes, Slack identifiers, verdict state, and transition evidence only. Do not
  persist submission bodies, feedback text, attachment URLs, or unrelated
  student messages.
- Identity boundary: a real Heartbeat submission ID is mandatory. Composite
  student/assignment/timestamp keys may help locate a row but cannot become a
  second submission identity.
- Concurrency boundary: transitions use the record version and append-only
  history so reconnects, multiple clients, duplicate posts, and stale
  writebacks fail closed instead of silently overwriting newer state.
- 2026-08-02 read-only observation: neither the queue projection nor submission
  detail dialog exposed a stable submission ID in the visible URL or DOM. The
  criterion fails at source visibility, before any attempt to prove transition
  survival or attempt uniqueness. No schema or runtime code was started.

### NC-20260802-003

- Continuity: this isolated branch begins at `0f20224`, the record commit above
  the deployed `23ffb07` runtime, so NC-001/002 source and deployment evidence
  are canonical without touching the unrelated dirty shared checkout.
- Failure exposed by deployment: the installed launchd plist carries both
  `NANOCLAW_CODE_ROOT` and `NANOCLAW_EXPECTED_RELEASE_COMMIT`; editing or loading
  them in separate steps can create a deterministic startup refusal.
- Target: parse the installed plist and change exactly `ProgramArguments[1]`,
  `NANOCLAW_CODE_ROOT`, and `NANOCLAW_EXPECTED_RELEASE_COMMIT`; validate the
  current rollback target, target manifest, bundle, interpreter, and candidate
  plist before mutation; atomically replace the plist; perform one bounded
  unload/load; prove commit and code root in health; restore once on failure.
- Boundary: implementation and local tests are authorized. No installed plist,
  launchd unit, release directory, or production process is changed by this
  slice without a separate deployment command/authorization.
- Implementation: `release:activate` is dry-run by default and requires an
  exact `--confirm-host` match for `--apply`. Production startup now refuses a
  code root outside the verified release, and health reports the resolved root
  plus its match state. The transitional rollback check accepts an older healthy
  release that lacks the new health fields only after its installed root and
  bundle verify independently.
- Concurrency/recovery: apply holds one fixed exclusive activation lock.
  Post-replacement failure restores and health-checks the rollback release while
  preserving the original activation error. A separately explicit
  `--recover-from-down` apply path permits repair when the current daemon cannot
  answer health or has no PID; bundle, interpreter, hostname, target-health, and
  rollback requirements remain enforced.
- Recovery hardening: a lock whose recorded PID is no longer alive is reclaimed
  once with an exclusive re-acquire; a live or unreadable lock still fails
  closed. `lsof` availability is proved before mutation, including recovery
  mode, and lock cleanup cannot replace activation/rollback evidence.
- Follow-up disposition: R2 F8 and R3 A1/A2/A4 are closed here. The pruned prior
  root diagnostic, same-directory diagnostic, healthy-rollback branch proof,
  real plist XML integration coverage, stale-lock double-reclaimer race, and
  dry-run probe placement remain open under planned task `NC-20260802-007`;
  real XML rendering is intentionally not asserted from the mocked unit suite.

### NC-20260802-002

- Trigger: the NC-001 release restart adopted `nanoclaw-sales-1785689606073`
  even though the operator identified that Sales run as stale and authorized its
  interruption.
- Root cause: `runContainerAgent` reset its documented hard-timeout timer on
  every heartbeat and output marker, turning the wall-clock ceiling into an
  inactivity timeout. Restart adoption then trusted every live sidecar PID and
  installed no replacement lifetime deadline. The adopted-container liveness
  checker is intentionally skipped, and regular heartbeats kept its queue
  activity fresh, so the stale run could survive indefinitely.
- Boundary: preserve heartbeat-driven freeze detection and spawn diagnostics,
  but make the configured timeout an absolute lifetime from `startedMs` for
  both original and adopted execution. Stop only the exact stale Sales
  container after verifying its identity; do not touch customer data or other
  group containers.

### NC-20260802-001

- Trigger: the operator authorized implementation after browser-driven Slack file
  upload repeatedly dominated Heartbeat grading latency even though MrGru already
  has `files:read` and `files:write` OAuth scopes.
- Boundary: the first slice is deliberately grader-only. It accepts files only
  from privileged `main`/`chief` group IPC, stages and verifies a regular file
  inside that source group's IPC tree, fixes the destination to the registered
  `grader` group, and records an idempotency receipt before any Slack side effect.
- Delivery contract: post one clean Slack root, upload the file into that root's
  thread with Slack's supported upload API, then persist an inline readable copy
  to NanoClaw so the grader wakes exactly once. A pending receipt is held rather
  than automatically retried when external outcome is uncertain.
- Overlap: `src/channels/slack.ts`, `src/channels/slack.test.ts`, `src/ipc.ts`,
  `src/index.ts`, the container MCP, and continuity docs already contain unrelated
  uncommitted work from active tasks. Preserve it and layer only bounded additions.
- State gate: implementation and local validation are authorized. No production
  deployment, daemon restart, OAuth change, or live upload is part of this task
  without a separate deployment/canary decision.

### NC-20260731-003

- Trigger: two open items from NC-20260731-001/-002 — production was running
  hand-patched `dist/` files, and per-lead status lines still posted at the
  channel root — plus the recorded suspicion that the Mac Mini slept overnight.
- Deployment state found: the Mini's `src/` was frozen at commit `a6e4b13`
  (six behind the Studio, 234 vs 243 `.ts` files) because the `~/dev` Syncthing
  folder is **paused on the Studio**. The Mini's own Syncthing reported
  `state: idle, needFiles: 0` — an in-sync report from the receiving side proves
  nothing when the sender is paused. Operator chose to leave it paused and deploy
  explicitly, so `src/` is now pushed by `tar` at deploy time.
- Boot blocker found in pre-flight: `verifyRuntimeRelease()` (`index.ts`) calls
  `assertExactNodeVersion()` on **both** paths — manifest present and absent —
  so a fresh build refuses to start unless the runtime matches `.nvmrc` exactly.
  Production ran Node 25.8.2 against a `22.23.2` pin; the previously deployed
  `dist/index.js` never called the guard, which is why hand patches booted. Node
  22.23.2 was installed at `~/.local/node/22.23.2`, launchd repointed at it, and
  `better-sqlite3` rebuilt for the older ABI (it failed `ERR_DLOPEN_FAILED`
  otherwise).
- Release: one artifact built from the reconciled source, import pre-flight run
  over all 125 modules (zero unresolved — the exact failure that caused the
  2026-07-30 outage), then verified by rebuilding **on the Mini** and hash-
  comparing against the deployed tree: identical. Restart produced `runs = 1`
  with no spawn storm and an empty error log.
- Side effect worth recording: this release is what actually carried the already-
  remediated NC-004 P1-1/P1-2/P2-1 and NC-002 P1-1/P1-2 fixes into production.
  They had been fixed in source on 2026-07-30 but were stranded behind the stale
  hand-patched `dist/`.
- Fix (threading): a per-lead status line names its lead by pipeline entry id and
  carries no address, so `deriveLeadThreadKey` could not anchor it.
  `deriveLeadEntryRef` extracts that id and `lead-email-resolver.ts` turns it
  into the canonical `lead:{email}` key via `pipeline_entries → parties`. The
  derivation is deliberately narrow — the id must open the message and the
  message must name exactly one entry — because a false merge (two leads in one
  thread) is worse than no merge. A lookup failure costs the anchor, never the
  message.
- Correction to the record: **the Mac Mini does not sleep.** Uptime is 61 days,
  `pmset -g log` shows zero sleep/wake events, and during the 06:00 hour it was
  reported unreachable the daemon processed 279 Gmail pushes (1,590 between
  00:00 and 08:00). `macmini-eth.kudinov.com` resolves to `192.168.1.50` on
  `en8`, which carries a `/32` netmask on a `/24` LAN; its TCP return path is
  asymmetric, so ICMP answers while TCP times out. `192.168.1.171` (en1) and
  `100.115.115.206` (Tailscale) both accept SSH. `en8` also carries the default
  route, so it was left untouched — correcting it remotely risks taking the
  daemon offline.

### NC-20260731-002

- Trigger: the operator reported that for Entry #871 sales replied in Jordan's
  thread with "[draft updated]" and then posted the updated draft itself into
  `#gru-sales`. Stated goal: the channel should carry only thread heads, with all
  back-and-forth inside the thread.
- Evidence: the messages for that lead split across two thread IDs —
  `1785510996.909209` (the real handoff message, where the first card and the
  "Draft updated…" note correctly landed) and `1785510996.909199`, which is not a
  message that exists. `slack_thread_anchors` held the **correct** value
  (`lead:jmproductionselite@gmail.com → …909209`), so the anchor was never wrong.
- Root cause: `src/channels/slack.ts` resolved the host-derived lead anchor only
  when the caller supplied no `threadTs` — "an explicit threadTs always wins (the
  caller already knows the thread)". That holds for host callers and fails for a
  model, which retypes a 16-digit float out of the `ts` attributes in its prompt.
  At 16:12:28Z the agent supplied `1785510996.909199`; the digits appear borrowed
  from the operator's in-thread reply `1785514294.509199`. Slack does not reject
  an unknown `thread_ts` — it posts to the channel — so the message silently left
  the thread.
- Fix: when the host can derive a canonical lead anchor, that anchor now outranks
  an agent-supplied `thread_ts`. This is the same principle already stated in
  `lead-thread-key.ts` — the host derives the anchor rather than trusting the
  agent — extended to the one case where the agent could still override it.
  `opts.threadKey` is agent-supplied and deliberately does **not** get this
  precedence; only the derived `leadKey` does, so non-lead threading is
  unchanged (the existing "explicit threadTs wins over threadKey" test still
  passes untouched).
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,720 tests** passes; format passes. The new test was proven to fail against
  the old precedence before being accepted.
- Production: `dist/channels/slack.js` hand-patched with the equivalent
  expression, daemon restarted (pid 20788). Backup `/tmp/slack.js.bak-*`.
- Known remaining root noise, not fixed: per-lead status lines such as
  "Lead #611 (Jennifer Watson…)" and "[NO ACTION] Entry #85…" carry no labelled
  address field, so `deriveLeadThreadKey` returns undefined and they post at
  channel root. Closing that needs host-side resolution of `Lead #<id>` /
  `Entry #<id>` to the party email — a business-DB lookup on the Slack send path,
  which is a deliberate cost decision rather than a silent addition.
- Not verified: a full draft→update→approve cycle landing entirely in-thread.

### NC-20260731-001

- Trigger: the operator reported "sales accepts a handoff and then does nothing —
  where's the draft?" for Entry #871 (Jordan). At 2026-07-31T15:16:36Z the
  `[HANDOFF: mailman→sales]` routed and posted to `#gru-sales`; no
  `Spawning container agent | sales` ever followed.
- Same defect as `NC-20260730-005` defect 2, on the delivery path that fix did
  not cover. Yesterday's fix set `is_bot_message: false` in `ipc.ts`'s
  `storeMessageDirect`, which only covers **non-Slack** targets. Slack targets
  self-persist through `channels/slack.ts:1203`, which stores every host post
  with `is_bot_message: true`, so `mailman→sales` was still invisible to the
  spawn loop. Fixing producers one at a time is whack-a-mole: each channel has
  its own persistence path and each new one reintroduces the gap.
- Fix moved to the single consumer. `getNewMessages` in `src/db.ts` is the only
  query that decides whether anything wakes a group. It now classifies each row:
  human/inbound always wakes; a group's **own** echo (`from_group` equals the
  channel's owning folder) never wakes it — this is the noop-container swarm
  guard of 2026-07-05; a **cross-group** row (`from_group` set and different from
  the owner) wakes the target, because that is a handoff addressed to it. A chat
  with no known owner keeps the old conservative behaviour.
- `src/index.ts` now passes a jid→folder map so the rule can tell class 2 from
  class 3. `src/ipc.ts` reverts to `is_bot_message: true` so the flag no longer
  encodes routing semantics in a second place.
- Coordination note for Codex: `src/ipc-handoff-echo.test.ts` gained a test
  asserting `is_bot_message: false` at the producer while this was in flight.
  That assertion was relaxed to `from_group: 'sales'` rather than deleted — the
  behaviour it protects (the row exists, correctly tagged, and wakes mailman) is
  still covered, now by the consumer rule plus the new `src/db.test.ts` cases.
  Nothing else of that change was touched.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,719 tests** passes; `npm run format:check` passes. New `db.test.ts` cases
  cover wake-on-cross-group, no-wake-on-own-echo, no-wake-on-untagged-host-noise,
  cursor advance past suppressed rows, and the unknown-owner conservative path.
- Production: `dist/db.js` hand-patched with the equivalent rule expressed purely
  in SQL (a correlated lookup of `registered_groups.folder`), so no compiled-JS
  restructuring was required. Validated against live data before restart — it
  selected the cross-group handoff and suppressed sales' own echoes — then the
  daemon was restarted (pid 2469). Two minutes of observation showed exactly one
  container spawn, confirming no spawn storm. Backup:
  `/tmp/db.js.bak-*` on the Mini.
- Operator-authorized production data change: `store/messages.db` row
  `1785510996.909209` had `is_bot_message` flipped to wake sales for Entry #871
  before the code fix was deployed. Sales spawned at 15:25:54 and posted the
  `[SALES REVIEW]` card at 15:26:45.
- Threading, investigated and **not** a defect in the draft path: the Entry #871
  card posted with `thread_ts = 1785510996.909209`, i.e. correctly threaded under
  its handoff. What appears at channel root are separate per-lead status lines
  (Lead #611, Entry #85) that carry no labelled address field, so
  `deriveLeadThreadKey` (`src/lead-thread-key.ts:65`) returns undefined and they
  fall back to the channel. Recorded as a follow-up, not fixed here.
- Not verified: an unaided handoff→draft cycle with no manual row flip.

### NC-20260730-006

- Outcome: close the delivery and release-integrity follow-ups exposed by
  `NC-20260730-005` without broadening email-send authority.
- Owner/client: Codex. Picked up at 2026-07-31T01:15Z after the user authorized
  todo items 1-3 as one release-integrity track.
- Change class: C5 because startup refusal, release provenance, and the service
  runtime become enforced host boundaries; the email path itself remains C3.
- Intended scope:
  - make a Sales approval produce an actual typed Mailman handoff, never a prose
    imitation, with one approved lead per execution turn and no fake Thread-ID;
  - record and alert when a routed Mailman handoff is not consumed within the
    expected polling window, independently of the later send watchdog;
  - add a full handoff/wake regression using PostgreSQL-realistic bigint string
    semantics;
  - embed non-secret commit/artifact/runtime identity in `/health`;
  - refuse startup when the running artifact lacks matching release metadata or
    the Node major differs from `.nvmrc`;
  - provide a controlled release builder/validator so deployment never depends
    on a dirty production checkout or hand-edited `dist/`.
- Overlap: the staged `NC-20260730-003/004` Procurement slice owns parts of
  `src/index.ts`, `src/ipc.ts`, Gmail policy, environment examples, architecture,
  security, project map, and continuity files. Preserve it exactly and build the
  reviewed composite release from committed source. Unstaged knowledge,
  copier, and Markdown-renderer changes are user-owned and out of scope.
- Deployment boundary: the user authorized todo items 1-3, including replacing
  the production hand patches with the reviewed release. No new customer email,
  Procurement gate, healer action, database migration, or unrelated external
  action is authorized by this task.

### NC-20260730-005

- Trigger: the operator approved a sales draft for Lead #962
  (contact-form inquiry) at 2026-07-30T21:55:09Z and received only
  `[SEND NOT OBSERVED]` six minutes later. No `[EMAIL BLOCKED]` line, no
  quarantine entry, no explanation anywhere.
- Three independent defects were found, all on the approved-send path. Two are
  regressions introduced by `NC-20260729-004`; one is older and had been masked.
- Defect 1 — **every `gmail_send` carrying a `lead_id` was blocked.**
  `src/gmail-ipc-handlers.ts` compared the agent-supplied `leadId` with the
  host-resolved party using `!==`. Party IDs are PostgreSQL `bigint`, which
  node-postgres returns as a **string**, while the container tool declares
  `lead_id: z.number()`. `11119 !== '11119'` was always true, producing the
  self-contradicting refusal `claimed party 11119 does not match host-resolved
party 11119`. `groups/mailman/OUTBOUND-EMAIL.md` instructs mailman to _always_
  send `lead_id`, so this blocked the entire outbound sales path from the moment
  NC-004 reached production. Fixed by normalizing at the boundary
  (`toPartyId`) so the resolver returns a number and the comparison cannot be
  representation-sensitive.
- Why 1,661 tests missed it: `src/gmail-ipc-handlers.test.ts` mocked
  `business-db` returning party IDs as JS **numbers**. The mock now returns
  bigint-as-string exactly as the driver does. Reverting the fix with the
  corrected mock fails 6 tests; before, it failed none.
- Defect 2 — **a `sales→mailman` handoff could not wake mailman.**
  `src/ipc.ts` stored the host-routed handoff with `is_bot_message: true`, and
  `getNewMessages` (`src/db.ts`, the only loop that starts a container) filters
  `COALESCE(is_bot_message,0) = 0`. The Gmail channel's `sendMessage` is a no-op,
  so that row was the only possible trigger. Handoffs were therefore invisible to
  the spawn loop and were only ever read as trailing context when an unrelated
  inbound email happened to wake mailman anyway. High inbound volume masked this
  for days; on a quiet mailbox the approved send simply never went out. Verified
  directly: the re-injected handoff routed at 22:28:59Z and sat unprocessed for
  nine minutes until the row was made visible, at which point mailman spawned in
  under a second. Fixed by storing cross-group handoffs to non-Slack targets with
  `is_bot_message: false`; `from_group` still carries the source, so the
  own-group echo filter and `isUntaggedBotNoise` are unaffected.
- Defect 3 — a `gmail_search` for a **bare address** was quarantined rather than
  normalized (lead #954, 21:53:40Z). The agent had already been told "queued,
  results will arrive as a follow-up", so it announced it was pausing that thread
  pending a result that could never arrive. `normalizeGmailSearchQuery` now
  rewrites an unambiguous bare address to `from:X OR to:X`; anything carrying an
  operator or a second term is still refused. `handleGmailSearch` executes the
  normalized query so the authorized scope and the executed scope are identical.
- Not a defect, recorded because it was the first hypothesis: the malformed
  `Thread-ID: (none — contact-form lead, no prior email thread)` placeholder in
  the original handoff never reached a guard. It is still wrong —
  `groups/sales/WORKFLOWS.md` says to omit the line — and the sales handoff also
  omitted `To:`, `---END-ORIGINAL---`, and `Body:`.
- Root cause of the _original_ stall, distinct from all three: the sales agent
  emitted the handoff as its **final assistant text** instead of calling
  `mcp__nanoclaw__send_message`. No IPC file was written, so nothing routed. It
  had made a correct IPC call for a different lead 16 seconds earlier in the same
  run, so the mechanism works — it dropped the call on the second lead of a
  two-lead turn. Prompt hardening for that is an open follow-up, not fixed here.
- Production actions taken under this task, all authorized by the operator:
  - one customer email delivered to the Lead #962 recipient at 2026-07-30T22:42:02Z
    (`gmail_send processed`, message `19fb5311a98be747`, `originalTo` equal to the
    real recipient, not test-routed). Body byte-identical to the approved draft,
    recovered from `store/messages.db`, never regenerated. Interaction logged;
    the `pending_sends` expectation cleared on the confirmed send;
  - `dist/gmail-ipc-handlers.js` and `dist/ipc.js` hand-patched on the Mac Mini
    and the daemon restarted twice (pids 61600, 65516);
  - three `store/messages.db` mutations: one handoff row inserted, one row's
    `is_bot_message` flipped, and mailman's `sessions` rows deleted so a stale
    session could not claim the send was already made.
- **Open integrity problem, not fixed here:** the production `dist/` does not
  correspond to the Mini's `src/`. `verifyPartyRecipient` exists only in
  `dist/gmail-ipc-handlers.js`; the host's `src/gmail-ipc-handlers.ts` is an older
  variant without it. Running `npm run build` on the Mini would silently revert
  the whole NC-20260729-004 Gmail boundary. That is why both fixes were applied to
  the compiled artifact instead. Backups: `/tmp/gmail-ipc-handlers.js.bak-*` and
  `/tmp/ipc.js.bak-*` on the Mini.
- Verification in the reviewed worktree, pinned Node 22.23.2: typecheck passes;
  full suite **134 files / 1,695 tests** pass; `npm run format:check` passes. The
  regression test was proven to fail against the original code before being
  accepted.
- Not verified: an unaided operator approval flowing end-to-end without manual
  intervention. That is the next observation.
- Pickup 2026-07-31T01:15Z: Codex assumed ownership to reconcile the three
  source fixes, obtain cross-client review, build one exact composite artifact,
  replace the two-file production hand patch, and verify the next unaided
  approval. The prior customer email and database mutations remain historical
  evidence and will not be replayed.

### NC-20260730-004

- Outcome: extend the uncommitted Procurement control-plane slice so public
  CaleProcure rows reach the deterministic host adapter and a named human can
  make an explicit, version-bound decision from a host-generated Slack card.
- Owner/client: Codex.
- Change class: C5 because Slack identity becomes an authorization boundary.
  At 2026-07-30T21:34Z the user explicitly authorized migration and deployment.
  That authorization is bounded to migration 114 and an isolated gates-off dark
  deployment with service restart and synthetic safety verification. It does
  not authorize enabling either Procurement gate, configuring operator IDs or
  an action epoch, changing the scheduled task, browsing CaleProcure or
  Bonfire, posting a real card, changing a production opportunity, sending
  email/message, or submitting a bid.
- Implemented controls:
  - the Procurement container may submit only a bounded typed CaleProcure
    result array; the host validates, timestamps, deduplicates, parameterizes,
    and records source-run completion;
  - CaleProcure ingestion is default-off behind an explicit host gate;
  - review cards are generated from current database truth and bound to the
    exact opportunity, review version, Slack channel/message, and action epoch;
  - decision commands are exact, reason-required, thread-bound, and accepted
    only from explicitly configured Slack user IDs;
  - stale versions, old epochs, unrecorded cards, unnamed users, model/bot
    messages, and replays fail closed;
  - `process`, `drop`, and `needs_info` remain workflow decisions only; they do
    not authorize proposal commitments, replies, registration, or submission.
- Overlap: continues `NC-20260730-003` and may touch its uncommitted migration,
  Procurement IPC/intake, agent-runner MCP, group authorities, and shared
  continuity docs. `NC-20260730-002` owns all `src/healer/*` and self-healing
  files; preserve those diffs unchanged.
- Named business owner and backup remain unresolved. The implementation must
  therefore ship with no operator IDs configured and the action gate off.
- Verification at the 2026-07-30T19:13Z snapshot: pinned Node 22.23.2
  typecheck passed; 104 focused tests passed; the full serial suite passed 134
  files / 1,685 tests; independent
  `container/agent-runner` build and 3 files / 22 tests pass; repository
  formatting, schema sanitization, continuity, and diff checks pass.
- Concurrent handoff note: after that green full-tree snapshot,
  `NC-20260730-002` changed `src/healer/approval.ts`; the current checkout's
  root typecheck now fails at its line 63. Repository-wide formatting, the
  current Procurement-focused 104 tests, schema sanitization, 23/23 continuity
  check, and diff checks pass. This task preserves the Healer owner's
  in-progress fix.
- Deployment boundary at authorization: migration 114 remains unapplied and all
  new environment examples are off/empty. Preserve the production dirty
  checkout and the overlapping Healer task by building and deploying only the
  Procurement-owned source/prompt/runner slice from an isolated release tree.
- Deployment evidence: migration 114 and the isolated host/runner/prompt release
  were activated on the production Mac Mini at 2026-07-30T21:52:49Z. The
  restricted backup is
  `~/.local/share/nanoclaw-deploy-backups/NC-20260730-004-20260730T2146Z`;
  release archive SHA-256 is
  `1e4b402aacf953addc01ce532d2adbfffc50ef9591cf3f2fb77e354656a3e18d`;
  runner digest is
  `sha256:004e711111abf9fdde65cf26a58b24894c8414ba77d89432e63613eb90e73c7f`.
  One daemon (PID 42265) owns `:8088`, Slack/Gmail are connected, all control
  tables/queue are empty, and the live artifact resolves both gates off with
  no operators or epoch.
- Live privilege evidence: the legacy role had direct
  `SELECT/INSERT/UPDATE`, so migration 114 was hardened before application.
  RLS now exposes only 298 source-keyless Bonfire rows to Procurement, zero new
  source-keyed/non-Bonfire rows, and the direct CaleProcure insert denial canary
  left zero residue. All 309 legacy rows remain visible to readonly/admin.
- Remaining boundary: no Procurement batch, review card, decision, schedule,
  browser, message/email, proposal, or submission was performed. Collection
  and review remain disabled until named primary/backup operators, an epoch,
  and a separately authorized gates-on canary are approved.

### NC-20260730-003

- Outcome: implement the smallest credible Procurement resurrection slice from
  `docs/PROCUREMENT-RESURRECTION-PLAN.md`: deterministic CaleProcure and
  exact-resource email observations become durable, deduplicated review work
  without direct model-authored SQL.
- Owner/client: Codex.
- Change class: C2 local implementation. This task may add tracked source,
  tests, an ordered PostgreSQL migration, and authoritative documentation. It
  does not authorize applying the migration, deploying/restarting services,
  changing the daily schedule, using the Bonfire browser, rewriting the 309
  production rows, sending messages/email, or submitting a bid.
- Accepted direction:
  - retain the opportunity-to-outcome idea and keep all submissions manual;
  - start with CaleProcure plus exact-resource email;
  - make the host own validation, parameterized writes, deduplication, and
    queue state;
  - carry Gmail message/thread IDs as host-granted read-only resources instead
    of embedding full email bodies in handoffs;
  - leave Bonfire isolated from this slice pending its separate containment and
    30-day value decision.
- Initial implementation scope:
  - a tracked, additive Procurement control-plane migration with source runs,
    immutable observations, canonical opportunities, an actionable review view,
    and narrow host-callable functions;
  - a typed host module that validates CaleProcure/email observations and calls
    only parameterized database functions;
  - deterministic CaleProcure normalization against sanitized fixtures;
  - host routing for `procurement/*` email labels that stores the observation,
    grants only the exact Gmail resources, and writes a bounded handoff;
  - focused unit/contract tests plus Procurement prompt/schema/project-map
    reconciliation.
- Overlap: `NC-20260730-002` owns healer files and safety authorities;
  `NC-20260729-004` owns the deployed Gmail authorization baseline and broader
  CDP isolation decision. This task may extend the Gmail read-only matrix and
  host router only for Procurement, preserving all existing grants and denial
  behavior.
- Implemented locally:
  - migration 114 adds the portable legacy table definition plus source-run,
    immutable-observation, normalized-opportunity, review-queue, and optimistic
    host-transition contracts;
  - the host validates/hashes CaleProcure and email observations and calls only
    parameterized functions;
  - email routing persists before handoff, carries no body, and grants
    Procurement only exact-message `gmail_read`;
  - `procurement_queue` is directory-authorized to the Procurement group and
    returns no raw payload or Gmail identifiers;
  - prompts, schema references, security, architecture, project map, and the
    resurrection plan distinguish local implementation from live state.
- Verification: under pinned Node 22.23.2, root typecheck passes; the complete
  serial suite passes 130 files / 1,661 tests; and independent
  `container/agent-runner` build plus 3 files / 22 tests pass. The same 87
  focused root tests also passed during implementation.
- Deployment boundary: migration 114 and the matching isolated
  host/container/prompt slice were deployed gates-off under
  `NC-20260730-004` on 2026-07-30. The schedule, browser, email/message,
  proposal/submission systems, and all 309 legacy rows remain unchanged; the
  new control tables and queue remain empty.
- Next action: continue under `NC-20260730-004` with separately authorized
  gates-on sanitized fixture and named-human review canaries.

### NC-20260730-002

- Outcome: complete the first safety gate in the self-healing recovery plan
  before improving throughput or re-enabling any autonomous action.
- Owner/client: Codex.
- Change class: C5 because the current approval path can execute a
  model-proposed shell command on the production host. This task changes the
  authorization boundary but does not authorize deployment, service reload,
  production incident mutation, Slack approval, command execution, or any
  external action.
- Verified starting state:
  - NC-20260729-004 is `deployed_unverified`; its installed and tracked
    `HEALER_IMPLEMENT_ENABLED=0` containment must remain intact;
  - the fast healer and digest are live, while auto-remediation and
    implementation have no recorded production actions;
  - seven incidents were `awaiting_approval`, and two historical
    `approved_apply` actions exist;
  - the installed fast-healer plist does not define `HEALER_OPERATOR_UID`;
    absent another inherited value, source currently treats any non-bot Slack
    user as an operator;
  - `HEALER_QUIET` gates diagnosis/remediation/implementation but not
    `runApprovals`, so it is not a complete action kill switch.
- Initial implementation scope:
  - add one default-off `HEALER_ACTIONS_ENABLED` boundary covering approved
    commands, automatic reruns, and code implementation;
  - require an explicit named-operator allowlist and fail closed when absent;
  - re-check trust, class, proposal kind, and action state at final approval
    execution rather than relying only on proposal-time state;
  - bind an approval to a fresh one-time proposal and prevent stale Slack
    reactions from being re-consumed after a later state transition;
  - keep collection, heartbeat, digest, and read-only diagnosis independent of
    the action gate;
  - update the tracked launchd template and self-healing authorities without
    changing the installed unit.
- Overlap: preserve all NC-20260729-004 source/artifact/deployment evidence and
  the user-owned Procurement/knowledge/copier/email-renderer worktree changes.
  This task owns only the healer safety slice and its documentation.
- Local implementation checkpoint:
  - one effective policy requires the global action flag, a named operator
    allowlist, and an action epoch; missing values and quiet mode fail closed;
  - host-issued proposal epochs, nonces, and timestamps replace model-supplied
    values, expire old Slack signals, and are claimed atomically before a shell
    command or implementation pipeline can run;
  - approval execution rechecks the current trust/class/fix kind, records the
    named approver, redacts command/output audit data, and disarms stale claims;
  - confidence/root-cause labels are insufficient by themselves: a completed
    passing adversarial review is required at proposal and execution time; an
    initial refutation can only be overturned by the independent tie-breaker;
  - the default-off gate covers approved commands, allowlisted auto-reruns, and
    code implementation. Fixed model-independent daemon recovery instead uses
    default-on `HEALER_RESTART_ENABLED`, preserving the existing availability
    behavior while `HEALER_QUIET` remains the common stop;
  - the tracked fast-healer template has `HEALER_ACTIONS_ENABLED=0`,
    `HEALER_RESTART_ENABLED=1`, and `HEALER_IMPLEMENT_ENABLED=0`. The installed
    unit was not changed and remains implementation-off from NC-004.
- Verification after review remediation: pinned Node 22.23.2 typecheck passes;
  the healer suite passes **20 files / 197 tests**; the complete serial
  repository suite passes **134 files / 1,689 tests**. Documentation
  continuity, repository formatting, and diff checks are the final handoff
  checks.
- Completion authority: `docs/SELF-HEALING-COMPLETION-PLAN.md`.
- Independent C5 review completed 2026-07-30T19:02Z by Claude Code 2.1.220,
  model `claude-opus-5[1m]` at maximum effort, account label `info-tandem`.
  Report: `docs/reports/NC-20260730-002-CLAUDE-C5-REVIEW.md`.
  **Verdict: CHANGES REQUIRED.**
- Validator reproduced every recorded check independently under pinned Node
  22.23.2: typecheck passes; healer suite 20 files / 193 tests; full repository
  suite 130 files / 1,661 tests; `npm run docs:continuity-check` passes (22
  active/ready rows, 22 changelog entries); `npm run format:check` passes across
  all of `src/**/*.ts`; `git diff --check` passes. Two blockers recorded in the
  `NC-20260730-003` entry are therefore resolved and should be amended there:
  continuity is no longer blocked, and no `src/healer/*` file fails Prettier.
- Host-execution inventory confirmed: `approval.ts:176`, `remediate.ts:67`,
  `implement.ts:134`, and `collector.ts:229` are all enclosed by the new
  boundary. `agentic.ts:74` (diagnosis) is deliberately outside it. The
  `implement.ts:124` single-quote escaping was checked specifically and is
  correct — there is no shell-injection path.
- Deployment-blocking finding **P1-1**: `restartDaemon()`
  (`collector.ts:226-239`, `:280`) is now behind the same default-off switch as
  arbitrary model-authored shell, and the tracked template ships
  `HEALER_ACTIONS_ENABLED=0` with no operator allowlist or epoch. The fast
  healer is live today and does restart a dead daemon; after a dark deployment
  it will only post to Slack. The restart takes no model input — fixed
  `launchctl kickstart -k gui/$uid/com.nanoclaw` argv, already capped and
  idempotent — so it is the typed-action class the plan intends to permit.
  Either add a separate `HEALER_RESTART_ENABLED` (default on) or record the
  availability trade-off with a named human owner for daemon-down recovery.
  Decide this before authorizing deployment; it does not block the commit.
- Commit-blocking finding **P1-2**: the implementation path never re-evaluates
  trust at the final boundary. `runApprovals` calls `isActionable` (and
  therefore `isTrustworthy`) immediately before executing;
  `implement.ts:82-100`/`:144-200` filter only on confidence and
  cause_or_symptom in SQL and recheck only `fixApprovalIsCurrent`, so the
  adversarial-review requirement is enforced indirectly through nonce issuance
  and does not survive a trust change after arming. Add
  `if (!isTrustworthy(inc)) return false;` in `dispatch()` plus the matching
  filter condition and one test.
- Recommended in the same commit: **P2-2** `remediate.ts:74-80` records
  `command` and `out` unredacted while `approval.ts:179-181` redacts both, so
  the changelog's unqualified "redacted command/output audit data" is wrong for
  the auto-rerun path; and four documentation corrections — the P1-1 deployment
  consequence, the `HEALER_INVESTIGATE_BASH=1` Bash escape hatch that sits
  outside the gate (P2-3), the "refuting review → manual-only" claim that the
  `synthesize` tie-breaker path contradicts (P2-5), and `implement.ts:9-13`'s
  claim of a time-box that `spawnPipeline` does not implement.
- Deferred with explicit acceptance: **P2-1** `verifyRemediating` can close an
  implement-dispatched incident as `verified_fixed` after 6 quiet minutes while
  the unbounded detached pipeline is still running, after which `pollResults`
  never reports the draft PR; **P2-4** the trust gate compares
  `review.reason` against two free-text literals produced in the untouched
  `investigate.ts`, so a reword silently opens it; **P2-6** `applied_action` is
  a single last-write-wins column rather than an audit log; five P3 items
  including reject-should-win in `emojiVerdict` and the implicit dependency
  between the 5-minute stale-claim window and the 120-second shell timeout.
- Validator state boundary: repository reads plus this report and two continuity
  edits. No implementation code was edited, nothing was staged or committed, and
  no deployment, service, launchd, incident, Slack reaction, operator/epoch
  configuration, credential, or production write occurred. The 65-path dirty
  worktree, including the concurrent NC-20260730-001/003 and user-owned changes,
  was preserved unchanged.
- Review remediation checkpoint:
  - P1-1 resolved by separating fixed daemon recovery into default-on
    `HEALER_RESTART_ENABLED`; the global model-authored action gate remains off;
  - P1-2 resolved by rechecking `isTrustworthy` both in candidate loading and
    immediately before implementation claim/credential access;
  - automatic-rerun command/output audit fields are redacted;
  - generic recurrence verification now excludes detached implementation runs;
    reject wins over approve when named-operator reactions conflict; blank TTL
    configuration uses the bounded default; stale-claim timing is documented;
  - security, design, diagnosis, completion, project-map, and implementation
    text now disclose diagnostic Bash outside the action gate, the tie-breaker,
    deterministic restart behavior, and the unbounded pipeline residual.
- Remaining accepted design debt: review status is coupled to free-text
  literals; `applied_action` is last-write-wins rather than an append-only
  action log; the implementation pipeline remains unbounded and runs in the
  operational checkout. Gates B, C, and F own those corrections before
  autonomy or implementation enablement.
- Production deployment 2026-07-30T21:36Z–21:38Z:
  - exact commit `bc8a71b62ca952d7d919144f91609e761d382641` was archived
    with SHA-256
    `77ba774119e9edf48726d3f1e0e26072ba11ba2f33406450304b84154f634437`
    and built on the Mac Mini under its installed Node 25.8.2 runtime;
  - target-runtime typecheck, focused 5-file/60-test healer verification, and
    build passed before activation;
  - only `dist/healer/` and the fast-healer launchd unit were replaced. The
    dirty operational source checkout, main daemon artifact/process, scheduled
    work, databases, prompts, and concurrent Procurement work were untouched;
  - the loaded policy reports `HEALER_ACTIONS_ENABLED=0`,
    `HEALER_RESTART_ENABLED=1`, and `HEALER_IMPLEMENT_ENABLED=0`; the deployed
    action-policy SHA-256 is
    `f5624020fe26ee105ef5dc740bf12327e262dff2da4eec8a34ae791fd40e943b`;
  - one real fast cycle exited `0` with no incidents, actions, approvals,
    implementations, or daemon-down condition. The main daemon stayed on PID
    68325 with Slack/Gmail connected, zero active containers, and an empty
    waiting queue;
  - rollback is available at
    `~/.local/share/nanoclaw-deploy-backups/NC-20260730-002-20260730T213639Z`;
    the immutable release is
    `~/.local/share/nanoclaw-releases/bc8a71b`.
- State boundary: `deployed_unverified`. Dark deployment and policy denial are
  live-verified; deterministic restart is configured and executable but was not
  induced against the healthy main daemon. A controlled daemon-down canary and
  longer observation remain before `complete`.

### NC-20260730-001

- Outcome: recover the Procurement Scout's original opportunity-to-outcome
  purpose and replace its improvised browser/SQL loop with a safe, measurable
  target design before any operational change.
- Owner/client: Codex.
- Change class: C1 investigation and design. The production Mac Mini was
  inspected read-only; no prompt, runtime, browser, schedule, database,
  message, proposal, or portal state was changed.
- Primary output: `docs/PROCUREMENT-RESURRECTION-PLAN.md`.
- Verified production state on 2026-07-30:
  - the group and daily schedule are active, and the dedicated Procurement
    Chrome service plus shared-gateway CDP bridge are live;
  - the 309-row store is dominated by 163 `new` rows, including 127 classified
    as noise; only 2 rows remain in `scraped`, and no row has reached a proposal,
    submission, or outcome state;
  - the local proposal framework has 12 briefs, 6 analyses, 2 proposal drafts,
    2 status files, and no bid-history outcome/correction rows;
  - the tracked/ignored schema sources do not reproduce the live status
    constraint, and email RFP labels are explicitly `classify_only`.
- Design result: start with deterministic CaleProcure plus exact-resource email
  intake, host-owned typed transitions and parameterized operations, an
  actionable review queue, provenance-aware framework facts, manual submission,
  and required outcome closure. Bonfire automation must use an isolated
  capability or be retired; the live shared CDP bridge is not acceptable.
- Overlap: `NC-20260729-004` already owns the broader Company-OS decision that
  Procurement CDP must be isolated or retired. This task supplies live evidence
  and the business-process design; it does not edit or deploy that boundary.
- Next action: finish documentation validation, then human resolves the seven
  leadership gates in the plan. Every accepted implementation phase receives a
  separate C2-C5 task with exact files, migration, rollback, and deployment
  evidence.

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
     writes and only on a successful _outbound_ send — so follow-ups recover but
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
  `[HANDOFF: sales→mailman]` line was observed, which happens _before_ mailman
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
