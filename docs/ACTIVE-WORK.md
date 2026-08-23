# NanoClaw active work

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-07-28

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| Task ID           | Outcome                                                                                                                                                                                                                                                      | Owner/client                                   | Branch @ base                                                                                                                                                       | Status                | Class | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Next action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Updated           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `NC-20260822-013` | Pin the source-owned Practitioner fact catalog into NanoClaw and make knowledge regeneration/drift detection fail closed                                                                                                                                     | Codex                                          | `codex/program-facts-release-20260823` @ `51185a5`; isolated from dirty operational checkout                                                                        | `ready_for_review`    | C2    | Exact revision/hash-bearing catalog snapshots; deterministic injection into 13 tracked minion knowledge files; removal of duplicated Practitioner strings; post-regeneration injection; exact pack drift detection; tests and authority docs. External website/YouTube releases are recorded in the cross-repository source receipt, not performed by this NanoClaw commit.                                                                                                                                                                                                                                 | Review and push this isolated branch, deploy one exact NanoClaw artifact, then run the drift job and one natural minion fact read against catalog revision 2/hash `d84b3b06...`. Preserve the dirty operational checkout and its uncommitted Company OS records.                                                                                                                                                                                                                                                                                                                                   | 2026-08-23T01:16Z |
| `NC-20260815-006` | Make it impossible for the daemon to silently serve a release's frozen `store/`, `groups/`, and `knowledge/` instead of the operational checkout's, and state in the docs which copy agents actually read                                                    | Claude Code                                    | `codex/chaos-lifecycle-release` @ `d1d9cf7` (local-only claim; that branch owns `src/release-integrity.ts`, which `codex/continuity-reconciliation` does not track) | `ready_for_review`    | C2    | `src/release-integrity.ts` (`assertStateRootSeparation`, `codeRoot`/`stateRoot` on `ReleaseIdentity`), `src/index.ts` startup log, `src/release-integrity.test.ts` (+4 cases), `src/webhook-server.test.ts` fixture, `docs/RELEASE-INTEGRITY.md` ("Working directory boundary", Activation step 7), `docs/MINION-FRAMEWORK.md`; no schema, migration, deployment, or external message                                                                                                                                                                                                                       | Deploy is a rebuild + reactivate; on the next activation confirm `/health` reports `release.stateRoot=/Users/xbohdpukc/dev/NanoClaw` and `release.codeRoot` under `nanoclaw-releases`, which is the fact this change exists to make legible                                                                                                                                                                                                                                                                                                                                                        | 2026-08-15T20:35Z |
| `NC-20260815-005` | Retire the MCQ name, drop the `" Roster"` suffix from every roster tab, and order the tab strip rosters-first with services and reference last, without breaking payment routing                                                                             | Claude Code                                    | `codex/continuity-reconciliation` @ `b66bc80` (local-only claim)                                                                                                    | `complete`            | C4    | Seven tab titles and 133 `Product Map` rows in the Student Roster; new `tools/contador/rename-roster-tabs.cjs`. Excludes `Prep Exam`, `Sales` and `Product Map`, whose names are hardcoded in `process-payment.cjs`                                                                                                                                                                                                                                                                                                                                                                                         | None — all 132 mapped products verified to resolve, and three real payments replayed onto the renamed tabs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2026-08-15T21:25Z |
| `NC-20260815-004` | Stop Stripe Checkout purchases being recorded twice, stop the shell eating dollar signs out of product names, and repair the rows both defects already produced                                                                                              | Claude Code                                    | `codex/continuity-reconciliation` @ `b66bc80` (local-only claim)                                                                                                    | `deployed_unverified` | C4    | `tools/contador/process-payment.cjs` payment identity, Postgres write, and product resolution for the payment-intent half; `tools/contador/process-payment.test.ts`; three repaired `payments` rows; three stale `Sales` rows; removal of three untracked Syncthing conflict copies of `src/index.ts`                                                                                                                                                                                                                                                                                                       | Watch the next real Checkout purchase confirm one row rather than two; the exercised proof so far is a replay of existing payments                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 2026-08-15T21:05Z |
| `NC-20260815-003` | Remove the four payments recorded twice by Stripe from both the Payment Log and the `payments` table, and restore the real product name where the surviving row carried the degraded one                                                                     | Claude Code                                    | `codex/continuity-reconciliation` @ `b66bc80` (local-only claim)                                                                                                    | `complete`            | C4    | Payment Log sheet rows and `nanoclaw_business.payments` rows for four purchases; new `tools/contador/dedupe-checkout-payments.cjs`. Excludes the ingestion change that would stop it recurring, and the `$`-corruption defect                                                                                                                                                                                                                                                                                                                                                                               | Decide whether to stop the recurrence: nothing suppresses `payment_intent.succeeded` when the same purchase already arrived as `checkout.session.completed`, so the next Checkout purchase duplicates again                                                                                                                                                                                                                                                                                                                                                                                        | 2026-08-15T20:45Z |
| `NC-20260815-002` | Let the bookkeeper's roster tabs be renamed safely, and stop non-enrolment products (supervision and coaching sessions) from being filed on the Student Roster at all, without hiding them from the Payment Log                                              | Claude Code                                    | `codex/continuity-reconciliation` @ `b66bc80` (local-only claim)                                                                                                    | `deployed_unverified` | C4    | `tools/contador/process-payment.cjs` exam-routing tab classification and a data-driven not-a-student rule read from the Product Map; new focused tests; `vitest.config.ts` now includes `tools/**`; seven sentinel rows in the Product Map. Excludes the double-ingestion defect and the `$`-corruption defect                                                                                                                                                                                                                                                                                              | Watch the first real supervision payment and the first real exam-prep payment to confirm live behaviour, then the owner's tab renames are unblocked                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-08-15T20:15Z |
| `NC-20260815-001` | Make the bookkeeper Student Roster reflect one mentor-coaching roster and a real coaching-supervision roster, so every mentor-coaching and Coaching Supervision Mastery permutation Stripe sells lands on a credential tab instead of the unmapped catch-all | Claude Code                                    | `codex/continuity-reconciliation` @ `b66bc80` (local-only claim)                                                                                                    | `blocked`             | C4    | Google Sheet `1bX0hv…ZI70` (Product Map, Mentor Coaching Roster, ICF Mentor Coaching, new CSS Roster, Sales); new `tools/contador/roster-cleanup.cjs` + `tools/contador/lib/sheets-client.cjs`; toolbox `shared/stripe` gains read-only `--account` on `list-products`/`get-product`. Excludes any change to `process-payment.cjs`, the Payment Log sheet, the `payments` table, and any Stripe write                                                                                                                                                                                                       | Blocked on one `process-payment.cjs` task carrying two changes, then a build and Mini deploy: `:602` classifies program rosters by `endsWith(' Roster')` so the requested rename would silently disable exam routing, and the file needs a not-an-enrolment list so supervision sessions stop re-appearing on the `Sales` catch-all. Two further defects need separate tasks: four payments double-ingested as Checkout Session + PaymentIntent ($4,986 in Postgres, $1,688 in the Payment Log), and `payments.product_name` shell-corrupted for `$`-bearing products at `process-payment.cjs:730` | 2026-08-15T18:45Z |
| `NC-20260810-002` | Create a CNPC intake minion that receives Gravity Forms submissions through n8n, maintains a canonical coach/capacity ledger, proposes evidence-backed matches, and coordinates approval-gated client/coach/Plutio actions                                   | Codex                                          | `codex/continuity-reconciliation` @ `0a39380` (local-only claim)                                                                                                    | `validating`          | C5    | CNPC webhook contract and host-owned intake persistence; dedicated group prompt/knowledge; structured roster, capacity, match, chemistry, and engagement state; separate host-only CNPC Plutio credential namespace; focused tests and authority docs; live-verified public allowlist/normalization-only n8n workflow mapped from a sanitized dummy. Excludes production migration/write, private NanoClaw delivery, coach/client email, Slack post, Plutio action, NanoClaw deployment, commit, or push                                                                                                    | Obtain `#gru-cnpc`; apply migration 115, register the private webhook with a rotated secret, build/deploy one exact NanoClaw artifact, and only then enable n8n-to-NanoClaw delivery. External email and Plutio actions remain disabled pending named approval and receipt executors                                                                                                                                                                                                                                                                                                               | 2026-08-11T02:15Z |
| `NC-20260810-001` | Agents quote ICF CCE accreditation per Practitioner Series course instead of calling all seven pending                                                                                                                                                       | Claude Code                                    | `codex/continuity-reconciliation` @ `996ca14` (pushed); tandemweb `2fcc2f829` on `main` (pushed, deployed)                                                          | `deployed_unverified` | C2    | eleven `knowledge/agents/*/KNOWLEDGE.md` copies, `knowledge/shared/KNOWLEDGE.md`, and `knowledge/agents/sales/LEARNED.md` (Lesson 67); per-course approved/pending/no-claim status, two corrected accredited CC/RD splits, per-course URLs, differing guarantees, and reinsertion of the section the 2026-08-08 regen had deleted from the shared master; also the upstream `generate-llms-full.py` page list, the regenerated `llms-pieces`/`llms-full.txt`, the two contradicting marketing claims, and a `facts/programs.yaml` drift entry; no code, schema, build, or deployment, and no Slack or email | Observe the 2026-08-15 05:00 CT `knowledge-regen` (dry run shows +9 added / ~18 changed, 9 batches) and confirm the regenerated Practitioner Series section keeps per-course status; then observe one Sales reply quote an approved course with no pending caveat, which is what moves this to complete                                                                                                                                                                                                                                                                                            | 2026-08-11T01:40Z |
| `NC-20260809-004` | Make Sales responses request-first, relationship-aware, and able to abstain instead of forcing a program pitch                                                                                                                                               | Codex implementer + Claude Code owner/reviewer | `codex/continuity-reconciliation` @ `0a39380` (local-only claim)                                                                                                    | `ready_for_review`    | C2    | local request-first Sales authority, non-trackable abstention, path non-authority, compatible autonomy marker, tracked nine-case eval seed, focused/full offline verification, and exact-session Claude R1/R2 review; excludes overlapping delivery runtime and all production/Slack/email/deploy/commit/push actions                                                                                                                                                                                                                                                                                       | Owner reviews the composite uncommitted diff; next separately authorize the blinded historical behavior eval and, after it passes, an isolated commit/release/live canary                                                                                                                                                                                                                                                                                                                                                                                                                          | 2026-08-10T03:41Z |
| `NC-20260809-002` | Audit the complete Procurement opportunity-to-outcome system with Claude as NanoClaw Company-OS owner and identify why scraping, triage/scoring, assessment, and proposal preparation repeatedly fail to produce outcomes                                    | Codex + Claude Code owner                      | `codex/continuity-reconciliation` @ `0a39380` (local-only claim)                                                                                                    | `ready_for_review`    | C1    | read-only repository/history/runtime-evidence audit; two-round Codex/Claude convergence; official-source research; no production query/write, browser action, schedule/config change, Slack/email/proposal/submission, deployment, commit, or push                                                                                                                                                                                                                                                                                                                                                          | Owner reviews the converged R2 audit and resolves primary/backup operators, email auto-archive policy, pursuit ownership, framework authority, deadlines/lifecycle evidence, legacy/Bonfire disposition, and pilot scope; separately authorize the read-only production preflight before implementation                                                                                                                                                                                                                                                                                            | 2026-08-09T20:30Z |
| `NC-20260809-001` | Recalibrate Foundation grading against recent evidence while making human-authored student experience a hard release gate                                                                                                                                    | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `0a39380` (local-only claim); grading authority `a1b94fe` (local-only)                                                          | `validating`          | C2    | P0.0/P0.0b/P0.1 complete locally; Claude R13 accepted the conditional PASS paragraph contract, four host-owned silence reasons, exact malformed-root recovery, and regression coverage; pinned Node 22 full suite passes 151 files / 2,018 tests; 14 grading packs are rebuilt/current; no student data, Slack post, Heartbeat write, build, or deployment in this correction                                                                                                                                                                                                                               | Build an isolated exact release, deploy runner before host, verify runtime identity and `run_id`, then run one sanitized grader canary while keeping all Heartbeat writeback disabled                                                                                                                                                                                                                                                                                                                                                                                                              | 2026-08-10T09:12Z |
| `NC-20260805-002` | Deliver Lead #1029's exact approved email and eliminate the Sales/Mailman field-mutation failure                                                                                                                                                             | Codex                                          | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `validating`          | C3    | production Action `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d`; exact approved Gmail send and receipt reconciliation; Sales handoff/host rescue/Mailman verbatim contract and focused regressions; no redraft                                                                                                                                                                                                                                                                                                                                                                                                     | Exact recovery is Gmail-confirmed; continue the source fix under isolated `NC-20260804-003`, obtain explicit approval for the secret-excluding Claude review, then converge, build, activate, and live-verify the host-owned execution path                                                                                                                                                                                                                                                                                                                                                        | 2026-08-05T18:50Z |
| `NC-20260805-001` | Reconstruct the last month of Sales journeys and converge a request-first response methodology with Claude Code                                                                                                                                              | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `0a39380` (local-only claim)                                                                                                    | `ready_for_review`    | C1    | privacy-conscious read-only July 10–August 9 Sales thread analysis plus a read-only pre-inquiry Chaos path join; current prompts/workflows/knowledge/lessons; R2-R5 Codex/Claude convergence and PII-free coded artifacts; no runtime/database/schedule/deployment/Slack/email/commit/push change                                                                                                                                                                                                                                                                                                           | Prompt P1/P3/P4 are implemented locally under NC-20260809-004; run the blinded behavior eval next, while deterministic host H1-H7 and all release/live work remain separate                                                                                                                                                                                                                                                                                                                                                                                                                        | 2026-08-10T03:41Z |
| `NC-20260802-001` | Give MrGru a host-owned, idempotent grader file-upload path so Heartbeat grading no longer depends on visual Slack upload                                                                                                                                    | Codex                                          | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `ready_for_review`    | C5    | grader-only container MCP and per-group staged attachments; host path/hash/source enforcement and durable receipts; Slack root plus threaded file upload and grader wake; tracked five-way grader registration/30-second idle defaults; toolbox adapter; full pinned-Node regression and authority docs; no deployment                                                                                                                                                                                                                                                                                      | Review the preserved composite diff, then separately deploy one exact artifact and run one sanitized #gru-grader canary before using it for the queue                                                                                                                                                                                                                                                                                                                                                                                                                                              | 2026-08-02T16:36Z |
| `NC-20260731-003` | Production runs one real Node 22 build instead of hand patches, and per-lead status lines stop leaking to the channel root                                                                                                                                   | Claude Code                                    | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `deployed_unverified` | C3    | `src/lead-thread-key.ts` (`deriveLeadEntryRef`), `src/lead-email-resolver.ts` (new), `src/channels/slack.ts`, `src/channels/registry.ts`, `src/index.ts`, three test files; Mac Mini `src/` reconciled with the Studio worktree; Node 22.23.2 installed and pinned in launchd; `better-sqlite3` rebuilt; every hand-patched `dist/` file replaced by one compiled artifact                                                                                                                                                                                                                                  | Watch the next per-lead status line ("Lead #N …") land in that lead's thread, and the next unaided approval complete end-to-end. Decide whether to prune the ~118 stale `.test.js` artifacts left in production `dist/`                                                                                                                                                                                                                                                                                                                                                                            | 2026-07-31T18:05Z |
| `NC-20260731-002` | Lead detail stays inside the lead's thread instead of leaking into the channel                                                                                                                                                                               | Claude Code                                    | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `deployed_unverified` | C2    | `src/channels/slack.ts` (host lead anchor outranks agent-supplied `thread_ts`), `src/channels/slack.test.ts`; one hand-patched production `dist/channels/slack.js`                                                                                                                                                                                                                                                                                                                                                                                                                                          | Watch the next lead's draft/update cycle post entirely in-thread. The hand patch was replaced by a compiled artifact and the per-lead status-line gap was closed under `NC-20260731-003`                                                                                                                                                                                                                                                                                                                                                                                                           | 2026-07-31T18:05Z |
| `NC-20260731-001` | A cross-group handoff wakes its target group on every channel, not just the ones that happened to work                                                                                                                                                       | Claude Code                                    | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `deployed_unverified` | C3    | `src/db.ts` (`getNewMessages` wake rule), `src/index.ts` (owner map), `src/ipc.ts` (producer flag reverted to uniform), `src/db.test.ts`, `src/ipc-handoff-echo.test.ts`; one hand-patched production `dist/db.js`; one `store/messages.db` row flip                                                                                                                                                                                                                                                                                                                                                        | Observe the next mailman→sales and sales→mailman handoff waking their targets unaided. The hand-patched `dist/` was replaced by a real build and the Mini's `src`/`dist` divergence resolved under `NC-20260731-003`                                                                                                                                                                                                                                                                                                                                                                               | 2026-07-31T18:05Z |
| `NC-20260730-006` | Make email delivery observable and NanoClaw releases traceable and pinned to Node 22                                                                                                                                                                         | Codex                                          | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `validating`          | C5    | Sales/Mailman handoff contract and tests; handoff-without-spawn alerting; release identity in health; source/artifact mismatch refusal; package/runtime/launchd/release operations                                                                                                                                                                                                                                                                                                                                                                                                                          | Run Claude adversarial review over the preserved composite diff, reconcile findings, isolate commits from unrelated dirty files, then build and deploy one exact artifact                                                                                                                                                                                                                                                                                                                                                                                                                          | 2026-07-31T01:52Z |
| `NC-20260730-005` | Approved sales email actually reaches the customer again                                                                                                                                                                                                     | Codex (picked up from Claude Code)             | `codex/continuity-reconciliation` @ `0a39380`                                                                                                                       | `validating`          | C3    | `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-policy.ts`, `src/ipc.ts`, two test files; production hand patches; one customer email; three `store/messages.db` mutations                                                                                                                                                                                                                                                                                                                                                                                                                                      | Review and commit the reconciled source under NC-006, replace the production hand patches with that exact release, then observe the next unaided approval end-to-end                                                                                                                                                                                                                                                                                                                                                                                                                               | 2026-07-31T01:52Z |
| `NC-20260730-004` | Connect the Procurement review loop without trusting portal content or model-supplied human identity                                                                                                                                                         | Codex                                          | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                                       | `deployed_unverified` | C5    | migration 114; RLS-contained Bonfire legacy lane; default-off CaleProcure intake; host review cards; isolated host/runner/prompt dark deployment; no schedule, browser, live card, decision, or submission                                                                                                                                                                                                                                                                                                                                                                                                  | Name primary/backup Slack operators and action epoch, then separately approve a gates-on sanitized fixture and named-human review canary; do not claim business outcome validation                                                                                                                                                                                                                                                                                                                                                                                                                 | 2026-07-30T21:53Z |
| `NC-20260730-003` | Restore a trustworthy Procurement intake and review queue for CaleProcure and exact-resource email                                                                                                                                                           | Codex                                          | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                                       | `deployed_unverified` | C2    | migration 114; host-owned typed intake; deterministic CaleProcure normalization; exact-message email handoff; bounded queue IPC; deployed gates-off with NC-004; no Bonfire/schedule cutover or production intake row                                                                                                                                                                                                                                                                                                                                                                                       | Continue under `NC-20260730-004`: separately authorize one sanitized gates-on fixture and named-human review canary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-30T21:53Z |
| `NC-20260730-002` | Make healer remediation fail closed before completing the wider self-healing system                                                                                                                                                                          | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                                       | `deployed_unverified` | C5    | healer action/approval authority, separate deterministic restart control, pending-proposal safety, focused tests, self-healing authority docs; exact healer-only production release; no model action, implementation, operator/epoch configuration, main-daemon restart, or database migration                                                                                                                                                                                                                                                                                                              | Observe scheduled healer cycles and separately authorize a controlled daemon-down recovery canary before claiming deterministic restart live-verified. Gate B diagnosis separation and Gate C typed actions still precede autonomy                                                                                                                                                                                                                                                                                                                                                                 | 2026-07-30T21:38Z |
| `NC-20260730-001` | Reconstruct and safely resurrect the Procurement Scout as a closed opportunity-to-outcome process                                                                                                                                                            | Codex                                          | `codex/continuity-reconciliation` @ `1689527`                                                                                                                       | `ready_for_review`    | C1    | read-only repository/live audit; target design and phased implementation brief; no prompt, runtime, database, browser, schedule, or production change                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Human resolves the seven leadership gates in `docs/PROCUREMENT-RESURRECTION-PLAN.md`; accepted implementation phases receive separate C2-C5 task IDs                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2026-07-30T17:48Z |
| `NC-20260728-007` | Redesign the OneDrive Drop ingestion subsystem                                                                                                                                                                                                               | human                                          | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                                       | `planned`             | C2    | all four `scripts/copiers/*.py`, their launchd jobs, and the upstream Solera export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner is redesigning the subsystem. Do not re-enable the existing copiers; establish first whether the upstream export is coming back                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 2026-07-28T23:09Z |
| `NC-20260728-006` | Chat/people drops ingest instead of retrying forever and pinning `fileproviderd`                                                                                                                                                                             | Claude Code                                    | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                                       | `complete`            | C2    | `scripts/copiers/copy_chat.py`, `scripts/copiers/copy_people.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None. Fix verified live (66 COPIED / 0 FAILED under launchd) before the subsystem was stopped under NC-20260728-007                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-28T23:09Z |
| `NC-20260728-005` | Restore a truthful green Node 22 test baseline                                                                                                                                                                                                               | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `157cb1b`                                                                                                                       | `validating`          | C2    | Node 22 baseline repaired: 124 files / 1,595 tests pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the review branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2026-07-28T12:34Z |
| `NC-20260728-004` | Reconcile Claude changes with the shared company-OS protocol                                                                                                                                                                                                 | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `157cb1b`                                                                                                                       | `validating`          | C2    | committed review checkpoint; tracking rules; continuity records/checker; authoritative docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the durable handoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2026-07-28T12:34Z |
| `NC-20260729-004` | Close the highest-risk outbound-email and healer implementation gaps before broader Company-OS work                                                                                                                                                          | Codex + Claude validator                       | `codex/continuity-reconciliation` @ `1689527`                                                                                                                       | `deployed_unverified` | C3    | Gmail IPC authorization and final-boundary recipient/thread controls; durable approval grant reissue; denied-call acknowledgements; installed and tracked healer default; focused tests; Company-OS/security/project-map reconciliation; `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`                                                                                                                                                                                                                                                                                                     | Production host artifact and SQLite migration are deployed; both Gmail denial and restart-grant canaries passed; installed fast-healer implementation is off. Observe the first explicitly approved real/test-routed send before claiming outcome validation. Track Node 22 enforcement, prompt/source convergence, and disposable healer worktree isolation separately                                                                                                                                                                                                                            | 2026-07-30T17:50Z |
| `NC-20260729-003` | A guard-blocked or failed send can no longer look identical to a delivered one                                                                                                                                                                               | Claude Code                                    | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                                       | `deployed_unverified` | C3    | `src/send-watchdog.ts`, `src/db.ts`, `src/ipc.ts`, `src/gmail-ipc-handlers.ts`, `src/index.ts`, `tsconfig.json`, three test files                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Watch for a `[SEND NOT OBSERVED]` alert on the next genuinely blocked send; decide whether to also post the `[EMAIL BLOCKED]` line into the draft thread for instant notice                                                                                                                                                                                                                                                                                                                                                                                                                        | 2026-07-30T00:12Z |
| `NC-20260729-002` | Sales/inbox knowledge states the real Coaching Supervision Mastery offer instead of "pre-launch, no price"                                                                                                                                                   | Claude Code                                    | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                                       | `ready_for_review`    | C2    | `knowledge/agents/sales/KNOWLEDGE.md`, `knowledge/agents/inbox/KNOWLEDGE.md`, `knowledge/shared/KNOWLEDGE.md`, `knowledge/agents/sales/LEARNED.md`, `knowledge/shared/LEARNED-sales.md`                                                                                                                                                                                                                                                                                                                                                                                                                     | Operator supplies the unpublished attendance/missed-session and refund/deferral policy, then answer Lead #611 Q1; separately decide the `LEARNED-sales.md` 73-vs-51 lesson divergence                                                                                                                                                                                                                                                                                                                                                                                                              | 2026-07-29T21:55Z |
| `NC-20260729-001` | Adversarial Claude validation of the Company-OS v2 upgrade plan                                                                                                                                                                                              | Claude Code                                    | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                                       | `ready_for_review`    | C1    | `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new), `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Human/Codex read the report, decide the five blocking questions in §11, then reconcile accepted findings into `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` under a separate task ID                                                                                                                                                                                                                                                                                                                                                                                                                       | 2026-07-29T13:05Z |

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

### NC-20260822-013

- Source authority: Practitioner catalog revision 2, SHA-256 `d84b3b06...`,
  bound to the accepted source decision artifact.
- NanoClaw outcome: tracked snapshots plus deterministic injection into all 13
  tracked minion knowledge files; the old duplicated Practitioner strings are
  removed; post-regeneration propagation fails without the exact pack.
- Verification: sync 2/2, drift 10/10, typecheck, and continuity pass. Full
  suite reaches 1,640/1,641 tests; unrelated untouched chaos mock import and
  webhook listener-address failures remain evidenced in the changelog.
- Boundary: this isolated branch contains no deployment, daemon restart,
  message, schedule, provider, customer, or learner mutation.

### NC-20260815-006

- Trigger: a same-day session traced a Sales agent quoting pre-approval ICF
  accreditation copy to the wrong cause — that agents read `knowledge/` from the
  pinned release snapshot, because the daemon runs
  `~/.local/share/nanoclaw-releases/<commit>/dist/index.js` and that directory
  holds a `knowledge/` tree with a frozen mtime. The repository's knowledge was
  rsynced into the release directory on that basis, changing nothing any agent
  reads.
- What is true: `PROJECT_ROOT = process.cwd()` (`src/config.ts:24`), launchd
  keeps `WorkingDirectory` on the operational checkout per Activation step 7,
  and `expandPath()` resolves a relative mount `hostPath` with `path.resolve`.
  So `store/`, `groups/`, `data/`, every relative mount, and both `learn_lesson`
  and `route_lesson` writes land on the checkout. chief, mailman, inbox and
  sales declare the knowledge mount absolutely (`~/dev/NanoClaw/knowledge/...`)
  and were never ambiguous. The stale answers came from the `set -e` abort in
  `tools/validate-knowledge.sh`, fixed the same day, which had been skipping the
  copy-to-agents step since 2026-08-12.
- The release's `knowledge/` copy is transport payload — the archive carries the
  tracked runtime inputs — and nothing reads it. It is still a convincing decoy,
  which is the reason for this change.
- Applied: `verifyRuntimeRelease()` returns `codeRoot` and `stateRoot`, reported
  on `/health` and named in the startup log; in release mode it calls the new
  `assertStateRootSeparation()`, which refuses to start when the working
  directory is the release directory or nested inside it. Scoped to release mode
  because a development run legitimately has `dist/` inside the checkout.
- One existing test moved to a deployed topology (separate checkout and release
  directories) so the fixture models what the guard enforces. Four cases added,
  including a `<release>-operational` sibling that a string-prefix check would
  wrongly reject.
- Branch split: the code landed on `codex/chaos-lifecycle-release` (@ `d1d9cf7`),
  which owns `src/release-integrity.ts` and is what production release `84607fd`
  was cut from. `codex/continuity-reconciliation` does not track that module —
  its working tree holds an untracked, pre-`codeRootMatchesRelease` copy — so it
  carries this register entry only.
- Evidence: `npx tsc --noEmit` clean; 2290 of 2291 tests pass under Node 22.23.2.
  The one failure (`cnpc-prompt-contract`) and two playwright-core collection
  errors are pre-existing on that branch and reproduce with the changes stashed.
  No build, no deployment, no live verification.
- Left alone: the inert `knowledge/` copies and the `knowledge.bak-20260815-1435`
  backup inside mini-claw's release directories. Deleting files in an activated
  release is a deployment action, and the guard plus the docs remove the reason
  to read them.

### NC-20260815-005

- Trigger: the owner asked to retire the MCQ name, drop the `" Roster"` suffix
  from every roster tab, and move rosters to the head of the tab strip with
  services and reference tabs at the end. Blocked until NC-20260815-002 removed
  the `endsWith(' Roster')` dependency in exam routing.
- The tab title is the routing key: `process-payment.cjs` reads `Product Map`
  column B as a literal tab name. The retitle and the 133-row map rewrite are
  therefore issued as ONE Sheets batchUpdate, which is atomic. Reorder follows
  as a second batch since moving a sheet shifts the others.
- Guards: the script refuses to start if a rename target already exists, or if
  the rewritten map would name a tab that does not exist. The latter fired on
  the first run against the `(not a student)` sentinel — which occupies the tab
  column but names no tab — and is now exempted explicitly.
- `Prep Exam`, `Sales` and `Product Map` keep their names; those three are
  hardcoded in `process-payment.cjs`.
- Verification: all 132 distinct mapped products resolved through the deployed
  `resolveRosterTargets` against the renamed sheet, with 0 targets pointing at a
  missing tab or column; exam routing still pairs a program tab with `Prep
Exam`; row counts intact across all 13 tabs; three real payments replayed end
  to end onto `Mentor Coaching`, `CSS`, and nowhere respectively.

### NC-20260815-004

- Trigger: NC-20260815-003 repaired the duplicate rows but not their cause, and
  the owner asked for the identified defects to be fixed rather than reported.
- Fix 1, recurrence. A Checkout purchase raises `checkout.session.completed`
  (cs*…) and `payment_intent.succeeded` (pi*…). Both halves know the
  payment-intent id — the session carries it — so a payment is now stored under
  that id, and whichever event arrives second updates the first one's row.
  Lookup also accepts the event's own id so rows written before this change are
  adopted rather than duplicated.
- Fix 2, the shell eating product names. The Postgres write built one shell
  command with values inline, so the shell expanded them before psql saw them:
  `($999/mo ×4)` was stored as `(99/mo ×4)`. Values now pass as psql variables
  referenced by `:'name'`, fed on stdin — psql does not interpolate variables
  for `-c`. `execFileSync` removes the shell entirely, and `sqlEscape` was
  deleted rather than left available for the next concatenated query.
- Fix 3, found only by running it. With both halves on one row, the poorer event
  degraded it: the payment-intent half carries "Unknown" and no product id. Both
  stores now refuse that — a `CASE` guard on the upsert, and a read-before-write
  guard on the sheet. Then a live replay showed the intent half still reaching
  the `Sales` catch-all, because "Unknown" matches no Product Map row and so
  misses the not-a-student sentinel. The intent branch now resolves its product
  from the checkout session, which required two calls: Stripe caps `expand` at
  four levels and the list-endpoint path was five.
- Data repaired: three `payments` rows whose names had lost their price; three
  stale `Sales` rows that were duplicate halves of payments already correctly
  rostered. Two rows matching the mangling pattern were deliberately left alone
  — `MCS Advanced Accreditation Mentor Coaching — Installment (/mo)` genuinely
  has no price in its Stripe name, confirmed against the Payment Log, which is
  written before the shell step.
- Also removed: three untracked Syncthing conflict copies of `src/index.ts` on
  both machines. An earlier claim that these reached the build was wrong —
  `tsconfig.json` excludes them, `.gitignore` and `.stignore` cover them, and
  `src/index.ts` skips them at runtime. They were stale cruft, not a hazard.
- Verification: 27 focused tests, full suite 2,063/2,063 on the Mini under
  pinned Node 22.23.2. The upsert was rehearsed against a temp table inside a
  rolled-back transaction for all three arrival orders. Then exercised live:
  replaying a checkout event and its payment-intent twin produced ONE row, and
  three replays of `$`-bearing payments restored the correct names with the
  `payments` row count unchanged at 247.
- Open: the proof so far is replay of existing payments. The next genuinely new
  Checkout purchase is the live confirmation.

### NC-20260815-003

- Trigger: the owner confirmed the duplicate-payment table produced during
  NC-20260815-001 and asked for it to be fixed.
- Cause: a Stripe Checkout purchase raises both `checkout.session.completed`
  (real product + `product_id`) and `payment_intent.succeeded` (generic
  description, no product). Both were ingested, and the upsert dedup is keyed on
  Stripe id, which differs between the halves.
- The two stores had diverged, so the repair differs per store, and an earlier
  claim that both carried all four duplicates was wrong. `payments` held both
  halves of all four ($4,986); its four PaymentIntent rows were deleted. The
  Payment Log held both halves for only two ($1,688); those duplicates were
  deleted. For the other two the Payment Log's single row _was_ the PaymentIntent
  half — the only record of a real payment — so it was kept and its degraded
  product name corrected instead.
- Boundary: C4, deletes rows from the revenue record. Excludes the ingestion
  change that would prevent recurrence and the `$`-corruption defect.
- Safety: dry-run default; the Postgres delete requires both the intent-side
  event type and an `EXISTS` check for the surviving twin, so a re-run cannot
  remove the last record of a payment; sheet renames are applied before
  deletions, and deletions run bottom-up so shifting rows cannot misalign them.
  Rollbacks for both stores were captured before the first write.
- Verification: Postgres shows 0 remaining intent halves, 4 checkout halves
  kept, 0 cs/pi duplicate pairs anywhere, 247 rows. Payment Log shows both
  duplicates absent, both renames in place, 395 rows, gross $272,701.40. Dry-run
  predictions matched applied actions line for line.
- Open: recurrence is not prevented. The next Checkout purchase will duplicate
  again until the pipeline records the underlying payment-intent id on the
  checkout event and upserts on it.

### NC-20260815-002

- Trigger: NC-20260815-001 could not perform the owner's requested roster-tab
  renames, and its removal of supervision rows from the `Sales` catch-all would
  have been undone by the next payment.
- Two changes to `tools/contador/process-payment.cjs`. Exam routing no longer
  classifies program tabs by an `endsWith(' Roster')` title test, which had made
  a silent behaviour change out of any tab rename. And a Product Map row whose
  tab column is the sentinel `(not a student)` now suppresses every Student
  Roster write for that product — credential tab and `Sales` catch-all alike —
  while leaving the Payment Log and Postgres writes untouched.
- Testability was a prerequisite: the script ran `main()` at import and exited
  at module scope on missing argv or Stripe keys, so importing it fired the
  whole pipeline. Those three now run only under `require.main === module`, and
  the routing decision is a pure exported function.
- Boundary: C4, live payment pipeline. Excludes the double-ingestion defect and
  the `$`-corruption defect, which remain separate unowned tasks.
- Verification: 17 new focused tests including a parametrised regression that
  asserts program-tab classification survives four candidate renames. Full suite
  on the Mini under pinned Node 22.23.2 passes 2,053/2,053; two suites fail to
  load only for Codex's absent migrations 114/115, unrelated and pre-existing.
  The Studio cannot run the suite at all (`better-sqlite3` ABI 127 vs Node 26's
  147). Routing was then simulated against the live Product Map through the
  deployed function, confirming all four behaviours including the deliberate
  exclusion of `5x Sessions`.
- Deploy-topology correction: `~/dev` is NOT paused for Syncthing. The script
  was byte-identical on the Mini before the `scp`, and a marker file propagated
  Studio→Mini in ~15s. Any `tools/**/*.cjs` edit is therefore a production
  deploy on save; a rollback must be captured from git, not by copying the
  working file. Rollback for this change is on the Mini at
  `/tmp/process-payment.cjs.rollback`.
- Open: the renames and tab-strip reorder are now safe and await the owner.
  `Prep Exam`, `Sales`, and `Product Map` are still hardcoded by name and cannot
  be renamed without a further code change.

### NC-20260815-001

- Trigger: the owner reported that the Student Roster's `Mentor Coaching Roster`
  and `ICF Mentor Coaching` tabs hold the same set of products and should be
  merged, that there is no roster for coaching supervision training, and that
  Coaching Supervision Mastery should be mapped to it in every permutation
  Stripe sells.
- Read-only discovery established three separate defects rather than one layout
  preference. `Product Map` had no header row while `process-payment.cjs`
  discards row 1 unconditionally, so its first mapping was dead. The
  `ICF Mentor Coaching` tab's columns began at `ACC` instead of `Email`/`Name`,
  so the roster writer's `newRow[colIndex] = date` overwrote the buyer's email
  with the payment date. Coaching Supervision Mastery had no mapping at all and
  both buyers had fallen through to the `Sales` catch-all.
- The exact product names live on the _second_ Stripe account, which the
  toolbox's `list-products` / `get-product` could not reach — a miss there
  returns "No such product", indistinguishable from a deleted product. Both
  tools gained a read-only `--account primary|alt|all` (defaults unchanged) so
  the catalog could be enumerated before writing any mapping.
- Boundary: C4 because the roster is the shared enrollment record trainers read
  and the change deletes a tab and rewrites the Product Map. Excluded by
  intent: `process-payment.cjs`, the Payment Log sheet, the `payments` table,
  and every Stripe write.
- Applied via `tools/contador/roster-cleanup.cjs --apply` (dry-run by default,
  idempotent, each phase asserted before it mutates). A full snapshot of all
  four affected tabs was captured first. The merge refuses to delete
  `ICF Mentor Coaching` unless every row on it resolves to both an email and a
  target column; Laura Smith's lost address was recovered by name and date from
  the `Sales` row that recorded the same payment intact.
- Verification at 2026-08-15T17:50Z: every mutated range read back. Laura Smith
  is on `Mentor Coaching Roster` with her real address and `ACC Renewal`
  `8/4/2026`; `CSS Roster` exists and carries both supervision buyers;
  `Product Map` is 141 data rows under a real header with no row targeting a
  non-existent tab; `ICF Mentor Coaching` is gone; `Sales` retains exactly the
  still-unmapped rows. Re-running the upsert reported `already set` rather than
  rewriting, confirming idempotence.
- Governing rule stated by the owner mid-task: mentor coaching and mentor coach
  training (MCS) are distinct products for distinct people — the first is bought
  by coaches earning their own credential, the second by coaches training to
  become mentor coaches. Product names are not evidence of which; route by what
  the buyer is enrolled in. `MCS Advanced Accreditation Mentor Coaching —
Installment (/mo)` resolved as training on that basis (3 × $999 = the $2,997
  MCS Standard Path, and both buyers carry Stripe `product=mcs-cohort-sept-*`
  metadata) and now maps to `MCQ Roster` → `MCS Practicum`, with Katy Stone and
  Jeremy Sieurac replayed there off `Sales`. Verified in both directions: no
  trainee on `Mentor Coaching Roster`, no mentor-coaching client on `MCQ Roster`.
- Second rule from the owner: a mentoring purchase belongs on a credential-
  program roster only if the buyer is in that program. Applied — and the mapping
  turned out to be inverted in both directions. `ACC Renewal Mentoring` (bought
  by coaches who already hold an ACC) was filing onto `ACC Roster`, while the
  real `Level 1`/`Level 2` program mentoring products were unmapped and falling
  to `Sales`. Wahida Saeedi and Thamer M Alessa moved to `Mentor Coaching
Roster`; Edward Utz (holds M1–M4) got his Group Mentoring onto `ACC Roster`.
  The script enforces the rule rather than trusting a hand-written list: a
  demotion is refused if the student holds any coursework column, and the
  destination is written and read back before the source is cleared.
- Third rule from the owner: supervision sessions are delivered services, not
  enrolments — nobody becomes a student by buying one, so they are excluded from
  this spreadsheet entirely and their eight Stripe products stay deliberately
  unmapped. Denise Cole's two `Sales` rows were removed. This does not stay done
  by itself: the catch-all re-collects any unmapped product, so it needs the
  code change below.
- Fourth rule from the owner: paid Plutio invoices behind `Sales` rows must be
  read from Plutio and matched to products. All eight resolved. The load-bearing
  discovery is that the payer is frequently **not** the student — four of the
  eight were sponsor-paid, and one covered eight students at once — so the Stripe
  payload alone can never place these. Twelve students were added or corrected:
  Holly Coneway, Oana Tue, Yoneko Riley-Barrow (under her own address, not the
  DOJ payer's), Jessica Velez (`Full Program`), Kristin Strunk (moved off
  `ACC Roster`, same contamination as Wahida/Thamer), and the eight ALLENATI
  seats. One `Sales` row was a $1 Plutio "test invoice" and was removed.
- Blocked: the owner asked to drop `" Roster"` from every roster tab name and
  reorder the tab strip. `process-payment.cjs:602` classifies program rosters by
  `m.tab.endsWith(' Roster')`, so the rename would silently disable exam routing
  and start writing exam-prep buyers to both the program roster and `Prep Exam`.
  Needs a one-line code fix (`m.tab !== 'Prep Exam'`), a build, and a Mini
  deploy as its own task before any tab is renamed. Reordering the strip is
  safe on its own; no code depends on tab position.
- Separate defects found, each needing its own task: four payments recorded
  twice (Checkout Session _and_ its PaymentIntent) for $4,986 of phantom revenue
  in `payments` and the Payment Log, confirmed against Stripe's balance-
  transaction ledger; and the shell-expansion corruption of
  `payments.product_name` at `process-payment.cjs:730`.
- Open, smaller: the Stripe-side product name that is itself missing its price;
  the header-by-position assumption still in the roster writer; and the five
  contador scripts that still duplicate the Sheets client now in
  `tools/contador/lib/sheets-client.cjs`.

### NC-20260809-001

- Trigger: the owner asked Codex and Claude to revalidate the grader against new
  submissions and make it impossible for students to infer AI authorship.
- Boundary: local plans, source, prompts, tests, dry runs, privacy-preserving
  aggregate checks, and Things mirroring. The owner later authorized proceeding
  to deployment while keeping Heartbeat result posting disabled. No certificate
  action or student-facing Heartbeat write is authorized by this task.
- Closed prerequisites: `~/dev/grading` has a Studio-local, no-remote Git
  baseline at `a64a1be`; Studio and Mini matched exactly at 796 files,
  14,020,963 bytes, aggregate SHA-256 `e292be56...fcee3c`.
- Overlap with `NC-20260802-001`: that task owns the grader file-upload route,
  `scripts/register-grader.ts`, and Slack/file delivery tests. Preserve its
  idempotent root-plus-threaded-file contract, fixed grader destination, durable
  receipt semantics, 30-second idle timeout, and undeployed state.
- Overlap with `NC-20260728-002`: that task owns attachment conversion in
  `src/channels/slack.ts`, its tests, and the unreadable-file instruction in
  `groups/grader/CLAUDE.md`. Preserve ODF/iWork conversion behavior and its open
  live `.odt` verification; P0.1 changes only outbound grader-copy handling.
- R3 correction: do not gate generic `SlackChannel.sendMessage` and do not use
  `fromGroup` alone. Host `[PROCESSING]` shares the grader tag, while
  grader-to-certifier handoff targets another channel. Gate only an agent message
  originating from `grader` and addressed to the registered grader channel.
- Live config preflight: Studio has only `grader` with `threadPerMessage=1`; the
  production Mini has `grader` (`1/0`), inbox (`0/1`), and sales (`1/1`) for
  `threadPerMessage/suppressFinalText`. Therefore a generic
  `threadPerMessage => suppress in threads` change would break Sales. Use a new
  grader-scoped `suppressFinalTextInThreads` flag and leave Sales/Inbox behavior
  unchanged.
- Settled defaults for implementation: Heartbeat receives feedback body only;
  the verdict line remains the operator's Approve/Retry marker. Student copy is
  always one Slack message and remains under the existing 1,500-character
  default. A block leaves Heartbeat unchanged, posts only a fixed operator notice,
  and requires an operator re-trigger; response-time policy remains a deployment
  gate, not an invented code default.
- Codex composite review: P0.1 acceptance is complete locally. The review caught
  and corrected registration-drift fail-open behavior in the normal and adopted
  final-text relays, and corrected the prompt so the verdict line is explicitly
  an operator marker rather than Heartbeat copy. Pinned Node 22.23.2 evidence:
  focused 7 files / 247 tests, full 145 files / 1,874 tests, typecheck, formatting,
  schema self-test, documentation continuity, and diff check clean.
- Claude continuity: R1-R3 used session
  `f441cd01-6dcc-4d66-ad83-16d23abb2736`; native handoff
  `handoffs/2026-08-09-1503-grader-recalibration-p0-1-r3.md` rotates R4 into a
  fresh session. The sensitive transcript copy was correctly refused and is not
  required because the Markdown handoff and repository round artifacts are
  self-contained.
- R4 implemented the boundary (uncommitted, undeployed): new
  `src/grader-delivery.ts` (destination-scoped entry point, per-thread lock,
  gate call, strict post, block notice, precondition re-check) and
  `src/grader-delivery.test.ts`; `src/db.ts`
  `hasDeliveredGraderStudentCopy`/`hasGraderOutputInThread` (whole-thread,
  structural, policy-independent); `src/channels/slack.ts`
  `postGraderStudentCopy`/`postGraderOperatorNotice` (prefix-free, no queue, no
  split, no lead anchor, rejects without a timestamp, persists
  `from_group='grader'`); `src/ipc.ts` source-and-destination routing that fails
  closed when the boundary is absent; `src/types.ts`
  `suppressFinalTextInThreads` applied by a shared `shouldSuppressFinalText` in
  both the normal and adopted relays; a bounded IPC-drain missing-output notice;
  `src/grader-output-gate.ts` shared verdict predicate, absolute 3,500-character
  cap, and operator-addressed block wording; `scripts/register-grader.ts` both
  suppression flags; and the `groups/grader/CLAUDE.md` two-message contract.
  Evidence in `docs/reports/NC-20260809-001-GRADER-RECALIBRATION-CLAUDE-RESPONSE-R4.md`.
- R4 did NOT change `registered_groups.container_config` in any database. The
  tracked registration script now sets both suppression flags, but the live
  grader row still reads `suppressFinalText=0`, so the threaded-final
  suppression is inert in production until that row is updated as part of the
  deployment.
- Owner correction, 2026-08-09: Heartbeat assignment content is not an
  unavailable input. The existing course publishing/pull toolset can read each
  assignment lesson. A read-only inventory resolved six current written lessons
  for Mentor Coaching Foundation. Exact comparison found the M1, M3, and M6
  grading snapshots current, while M2, M4, and M5 differ from live Heartbeat in
  grading-relevant wording. R7 therefore makes live Heartbeat assignment content
  the assignment authority supplied to each grade. The grading repository
  remains authority for voice, calibration, rubric, and durable records.
- R7 implemented locally (uncommitted, undeployed): new
  `src/grader-submission-context.ts`, `src/grader-assignment-fetch.ts`,
  `src/grader-run-context.ts`, `src/grader-salutation.ts` with their tests;
  `salutation-name-mismatch` in `src/grader-output-gate.ts`;
  `missing-submission-context` and the required run context in
  `src/grader-delivery.ts`; context lookup in `src/ipc.ts`; context
  establishment before `runAgent` in `src/index.ts`; `heartbeat` metadata on the
  six mapped assignments in `~/dev/grading/registry.json` with `validate.py`
  shape/uniqueness/ambiguity checks and `test_validate.py`; and the Step 3 live
  assignment contract in `groups/grader/CLAUDE.md`, compacted to exactly 200
  lines. Evidence in
  `docs/reports/NC-20260809-001-GRADER-RECALIBRATION-CLAUDE-RESPONSE-R7.md`.
- R7 deviations, both deliberate and documented: an assignment with no
  `heartbeat` mapping resolves as `snapshot-only` and still authorizes student
  output, so ACC/PCC/MCC grading is preserved rather than taken offline; and the
  legacy one-line `grade <student> <assignment>` command is still resolved, by
  exact longest registered-label suffix, so typed operator traffic does not
  start blocking. Both are one-line changes if the owner wants the strict
  reading instead.
- R7 response-shape assumption is resolved: subsequent read-only checks against
  all six registered lesson IDs returned the exact requested `id`, registered
  title, and nonblank content. R8 therefore withdrew R7 Finding 1. No student or
  submission data was accessed and no Heartbeat write occurred.
- R7 safety boundary: the NanoClaw host performs one allowlisted GET for the
  assignment resolved from the root header, validates lesson ID/title/content,
  and injects escaped current content into that run. The grader container never
  receives `HEARTBEAT_API_KEY`, the courses repository, or any publishing tool.
  Missing, ambiguous, empty, oversized, mismatched, or failed assignment context
  cannot produce a student staging unit. No persistent live-content cache or
  student-data store is introduced in this slice.
- R8-R11 closed the remaining run-proof race. Every initial and warm grader
  Claude turn now has a host-minted UUID; the container stamps it outside the
  model tool schema; the host requires exact UUID, destination, and thread before
  student staging. Two queued turns remain separate and unacked until consumed;
  credential rotation replays the exact failed turn; restart/adoption and missing
  or malformed IDs fail closed. Warm turns synchronously reuse the verified live
  assignment for at most ten minutes and register proof only after the pipe write
  succeeds, so the global Slack loop never waits on Heartbeat.
- Claude R11 verdict: `ACCEPT`. Final source evidence: root 149 files / 1,992
  tests; agent runner 4 / 27; both typechecks clean; grading live-registry checks
  29/29; prompt exactly 200 lines. The grading registry change is committed
  locally at `f19fa39`; NanoClaw remains uncommitted, unbuilt, and undeployed.
- This code acceptance does not satisfy the overriding release gate. A blind,
  submission-in-hand, control-seeded human review of a real recent corpus remains
  required before deployment because students must never infer AI grading.
- R12/R13 correction: a genuine PASS grow now begins in paragraph two, while no
  grow is invented when the work offers none. Four host-owned missing-output
  reasons distinguish unavailable context, run error, unstaged results, and no
  result; malformed roots receive the exact two-line-root recovery. Claude R13
  returned `ACCEPT` with no required code or test fix remaining.
- Final corrected verification under pinned Node 22.23.2: 151 files / 2,018
  tests, focused grader 4 / 100, typecheck, continuity, and diff checks pass;
  runner remains 4 / 27; all 14 grading packs are current and pack-builder tests
  pass. This is still tested source, not deployment or human-voice proof.

### NC-20260809-002

- Trigger: the owner reports that the end-to-end Procurement effort repeatedly
  falls through the cracks and does not reliably scrape, triage/score, assess,
  or produce proposal-ready work; additional sources may also be required.
- Boundary: C1 audit and design only. Preserve the heavily dirty shared tree.
  Do not query or mutate production, drive the Procurement browser, enable
  gates, alter schedules/configuration, post review cards, send messages/email,
  generate or submit a real proposal, deploy, commit, or push.
- Collaboration: Claude Code is the NanoClaw Company-OS owner for this review;
  Codex orchestrates the file-based convergence process and independently
  verifies every load-bearing claim. Use the exact Procurement project session
  and keep all substantive exchanges in `docs/reports/`.
- Scope interpretation: audit the procurement lifecycle from source discovery
  through relevance triage, kill-screen/assessment, proposal preparation,
  manual submission evidence, outcome closure, and learning. Explicitly
  distinguish this from the unrelated MCS student-grader subsystem unless
  repository evidence shows a shared failure boundary.
- Evidence rules: source, tests, migrations, current role instructions, and
  dated continuity records are in scope. Secrets, `.env*`, Claude settings,
  browser profiles/auth state, raw databases/logs/customer data, solicitation
  contents, and private proposal text are forbidden.
- Artifacts: round requests/responses and convergence state under
  `docs/reports/`, followed by one evidence-cited audit report after Codex and
  Claude agree on the material facts.
- Current evidence: Codex's independent report is
  `docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CODEX-INDEPENDENT.md`.
  The focused Node 22.23.2 procurement safety suite passes 7 files / 81 tests,
  but no source-completeness, proposal, submission, or outcome test exists.
- Collaboration history: the exact Procurement Claude session was recovered
  and R1 was prepared. The first external attempt paused for explicit owner
  authorization; that authorization was subsequently received and both rounds
  completed within the original non-secret, single-artifact-per-round boundary.
- Convergence result: the owner authorized the bounded external review. Claude
  R1 and R2 ran in exact session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`; Codex independently verified the
  load-bearing claims. The final evidence-cited audit is
  `docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CLAUDE-RESPONSE-R2.md`.
  All 23 material findings converge. Production state and implementation remain
  separately unauthorized.

### NC-20260805-002

- Trigger: Lead #1029's operator-approved Sales draft produced a Mailman handoff
  but the originating Slack thread later showed `[EMAIL HELD]` for a
  subject/body hash mismatch and `[SEND NOT OBSERVED]`.
- Read-only production evidence before recovery: the durable action never
  entered `executing` and had no Gmail message/thread receipt; an exact Gmail
  Sent search for the recipient after 2026-08-05 returned zero messages. The
  Sales handoff omitted the host-issued Action-ID. Mailman's recorded tool call
  also HTML-escaped the literal ampersand in the approved subject and one body
  sentence, violating the verbatim contract and producing a different hash.
- Authorized recovery: send exactly the Slack-approved subject/body once through
  the existing host action, hash, recipient, party, content, Gmail, receipt, and
  Slack status boundaries. Do not redraft and do not bypass the host guard.
- Recovery result: the exact approved card passed those normal boundaries and
  Gmail confirmed message/thread `19fd3438954b40fe` at
  `2026-08-05T18:50:46.831Z`; the originating Sales thread contains the
  mechanical `[EMAIL SENT]` receipt. Do not replay this action.
- Implementation boundary: preserve the dirty worktree and overlapping NC-006
  email changes. The existing isolated `NC-20260804-003` implementation now has
  a focused Lead-#1029-shaped regression for missing Action-ID plus model-mutated
  entity escaping; its pinned Node 22.23.2 email-critical gate passes 18 files /
  492 tests. It is not committed, deployed, or live-verified yet.
- Additional recurrence: Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` omitted the Action-ID and changed one
  approved body `&` to `&amp;`. Exact preflight found no prior send; exact-card
  recovery is Gmail-confirmed once as `19fd44fd031fc6f1`, and the Sales thread
  has the receipt. This is the same undeployed defect and is already covered by
  the stricter Lead-#1029 regression; do not replay it.

### NC-20260810-002

- Trigger: CNPC's EA manually copies Gravity Forms applications into a Google
  Sheet, prompts an LLM against a Word coach bench, cross-checks a separate
  availability form, drafts client/coach email, coordinates chemistry calls,
  creates contract/payment work, and adjusts coach availability. The owner wants
  a CNPC minion with minimal human intervention and will connect Gravity Forms to
  n8n.
- Read-only discovery: the Word intake procedure confirms the lifecycle and the
  rule that a coach slot is not filled until contract signature and payment,
  while pending matches and chemistry calls still affect load balancing. The
  Word bench, public team page, Plutio onboarding responses, and Plutio
  availability responses have different record counts and stale/formatting
  risks. None is treated as canonical alone. No form, Sheet, Plutio, email, or
  production database write was made during discovery.
- Boundary: C5 because this introduces a public webhook, identity/customer data,
  a new agent role, and future email/contract/payment capabilities. This local
  slice performs no migration, registration, Slack post, email, Plutio action,
  deployment, commit, or push. It deliberately blocks every external action.
- Implemented locally: normalized and length-bounded Gravity Forms contract;
  authenticated capture-only n8n workflow configuration with no downstream
  connection and only a one-way ingress-secret digest;
  `cnpc-coaching-intake` event-key dedup; host identity/intake write;
  deterministic eligibility and pricing; migration 115 for canonical intakes,
  coach roster, capacity snapshots, match runs/candidates, chemistry soft holds,
  signed-and-paid engagement gate, and receipt-bearing action outbox; bounded
  match-pool preparation; strict model-result validation/persistence; reaper
  replay support; CNPC prompt/knowledge; registration script; environment
  placeholders; setup/design runbook; project-map entry; focused tests.
- Security decisions: n8n and the minion receive no Plutio credentials. CNPC
  Plutio uses a separate host-only credential namespace and may not reuse the
  existing single-workspace reaper until credential selection is explicit. The
  credential disclosed in chat must be rotated before production. Coach uploads,
  private client lists, coach emails, and raw Plutio responses are excluded from
  prompts. The model can rank only host-provided active coaches with capacity,
  and the host rejects invented coach IDs or stale roster versions.
- Verification at 2026-08-11T00:40Z under pinned Node 22.23.2: typecheck passes;
  five focused non-network files pass 51 tests; the focused HTTP webhook suite
  passes 37 tests with the required local ephemeral listener permission; the
  full root suite passes 155 files / 2,046 tests; documentation continuity and
  `git diff --check` pass. Documentation continuity initially failed only
  because new authority files were not yet Git-trackable, the status used a
  noncanonical value, and this detail section was missing; those defects are
  corrected.
- Concurrent-tree note: this task began at HEAD `0a39380`. During the work, the
  shared branch advanced independently to `2e6fb70` for NC-20260810-001. CNPC
  work remains uncommitted and preserves that commit and the broader dirty tree.
  Correction from the NC-20260810-001 owner: that commit was amended for its
  message only and is now `996ca14`; the tree it contains is byte-identical.
- Deployment/migration state: the public n8n normalization-only workflow is
  imported, published, restarted, and live-verified (`401` without its ingress
  secret, `202 normalized` with it). Sanitized Gravity Forms form 1 entry 583
  established the exact field map. Migration 115 is not applied; `#gru-cnpc`
  and its private webhook runtime definition are not registered; no NanoClaw
  artifact is built or deployed; normalized delivery remains disabled.
- Exact next action: obtain the dedicated Slack channel ID; rotate/set the
  private CNPC webhook secret; apply migration
  115 and register the group/webhook on the target; build/deploy an immutable
  artifact; verify health and registration; then enable n8n-to-NanoClaw delivery.
  Mailbox, named approvers, Plutio templates, and receipt executors remain a
  separately gated follow-on before real-client automation.

### NC-20260810-001

- Trigger: the operator reported that Sales still treated every Practitioner
  Series course as ICF CCE accreditation-pending even though several courses had
  already been approved.
- Boundary: C2 knowledge-only correction. It rewrites the Practitioner Series
  facts in the eleven agent knowledge copies and the shared master, and adds one
  sales learned lesson. It changes no code, schema, build, or schedule, and
  performs no production query/write, Slack post, email, deployment, commit, or
  push.
- Evidence basis: `~/dev/tandemweb/pages/practitioner-series/05-section-catalog.html`
  (2026-08-09) states three courses are ICF CCE-approved for 80 hours between
  them, with the rest in review. Each course's own hero, format, enroll, and FAQ
  sections confirm the accredited hour counts and CC/RD splits for Running a
  Coaching Business (40.0 h, 9 CC + 31 RD), Coaching Tools Mastery (20.0 h,
  13 CC + 7 RD), and AI for Coaches (20.0 h, 6 CC + 14 RD). Tandemweb commit
  `56a57437a` recorded the grant; it never reached the knowledge base.
- Second defect found while fixing the first: the 2026-08-08 regen produced a
  `knowledge/shared/KNOWLEDGE.md` with no `## Practitioner Series` section at
  all, because `generate-llms-full.py` emits no `practitioner-series*` piece.
  Since `validate-knowledge.sh --update` propagates by blind copy, the next
  propagation would have deleted the section from every agent. The corrected
  section was therefore written into the shared master as well as the agent
  copies.
- Local runtime determination: this checkout is `MacStudio`; `launchctl list`
  shows no `com.nanoclaw` main daemon here. The production checkout on the Mac
  Mini (`100.115.115.206`) already holds these knowledge files as of
  2026-08-10 15:36 CT through the existing `knowledge/` sync, so containers will
  read them on their next spawn. No container has been respawned or observed
  against them.
- Second increment (2026-08-10T23:58Z), on operator instruction: the upstream
  omission is fixed. `~/dev/tandemweb/tools/generate-llms-full.py` now lists a
  CCE-courses divider plus all eight practitioner-series pages, and a
  `--no-scrape` regeneration produced 62 pieces with nine new part-a files and
  no deletions, so the section survives future knowledge regens. The operator
  also resolved the split conflict — ADHD Coaching 15 CC + 5 RD, Systemic
  Coaching 16 CC + 4 RD — so the knowledge base quotes all three pending splits
  again, labelled "submitted" rather than "accredited".
- Known limits: the tandemweb generator change is local and uncommitted, and no
  `generate-knowledge.sh` run has exercised the new pieces. Two marketing pages
  still contradict the resolved values and will feed the knowledge base on the
  next regen; both are listed as follow-ups and were deliberately left unedited,
  because changing advertised CCE hours on a live sales page is an owner
  decision, not an engineering one.

### NC-20260809-004

- Trigger: after reviewing the converged 30-day Sales journey audit, the owner
  authorized implementation of the Sales-agent redesign and reiterated that
  task-scoped data transfer between Codex and Claude is authorized.
- Boundary: C2 local implementation only. This first slice changes Sales
  decision, review-card, response, and path-signal policy; aligns isolated
  draft-marker detection; adds offline contract tests; and keeps the relevant
  authority/continuity documents synchronized. It does not modify the currently
  overlapping Mailman, approval-rejection, `pending_sends`, Gmail-receipt, or
  production execution paths. No production query/write, Slack post, email,
  deployment, commit, or push is authorized.
- Evidence basis: `NC-20260805-001` R5 converged on request precedence,
  conditional commercial fields, first-class abstention, path-signal
  non-authority, and marker alignment. The working branch predates the later
  approval-rejection commit `97ca2cc` while carrying uncommitted delivery-path
  changes, so that branch drift is explicitly out of this slice.
- Claude continuity: resume exact Sales-owner session
  `ae6931fb-c0e6-4714-9b81-ac8599a00f4f`; rotate with a native handoff if the
  session reaches its context boundary.
- Local runtime determination: `launchctl list` contains no NanoClaw/Gru/company
  daemon, and enabled local LaunchAgents do not point a NanoClaw service at this
  checkout. The group prompt edits were therefore not mounted into a running
  local agent. No Mini sync, service restart, or production release occurred.
- Implemented authority: relationship evidence must predate the current inbound;
  current asks and answerability precede one of seven routes; `TRANSACT` requires
  a verbatim at-most-15-word current-message `Route-Basis`; `LOW`/`HUMAN` uses a
  non-trackable `[SALES ESCALATION]`; ORIENT and scheduled follow-ups cannot add
  commercial material; website path is non-binding.
- Marker replay: 2,322 local Sales bot rows, old recognizer 568, final recognizer
  568, zero differences. The exact legacy `REVISED DRAFT FOLLOW-UP:` alias is
  recognition-only; future producers use the two canonical headings. Follow-up
  heuristic classification shares the same emphasis/legacy grammar.
- Claude review: exact session R1 and R2 returned `ACCEPT WITH CHANGES`; after
  Codex reconciled every in-bound high/medium/low finding, R3 returned `ACCEPT`
  with no material defect. The excluded approval-rejection and Handling
  Approval blocks were attested text-identical by Claude, but no pre-edit hashes
  exist. Current review baselines are `CLAUDE.md` SHA-256
  `14f6dab...a662` and `WORKFLOWS.md` `089a565...0bec`.
- Verification: pinned Node 22.23.2 focused 5 files / 34 tests and final prompt
  pair 2 / 17 pass; root suite produced 1,963 passes with 43 permission-only
  failures, then both affected files passed 43/43 with localhost/subprocess
  permission (150 files / 2,006 tests accounted for). Typecheck, local build,
  targeted formatting, documentation continuity, and diff check pass.
- Honest limit: the tracked nine-case seed validates contract structure, not
  model response quality. The blinded historical evaluation and two-annotator
  scoring remain required before claiming improvement or authorizing release.

### NC-20260805-001

- Trigger: the owner asked Codex to run the proposed request-first Sales
  response methodology through Claude for an independent adversarial review.
- Resumed scope (2026-08-09): the owner explicitly asked Codex and Claude to
  investigate the last month of Sales behavior comprehensively, including
  customer entry paths, requests, initial drafts, operator corrections, and
  revised responses. The analysis window is 2026-07-10 through 2026-08-09.
- Boundary: C1 analysis/design only. Read-only production queries and bounded
  transmission of in-scope Sales evidence to Anthropic Claude are authorized.
  No Sales prompt, workflow, knowledge, runtime, database, schedule, deployment,
  Slack message, email, commit, or push may change in this phase.
- Artifacts: R2-R5 Codex/Claude requests, responses, convergence state, corrected
  289-case and 105-operator-line R4 JSONL files, and the PII-free 71-identity
  Chaos path report/JSONL under `docs/reports/`. R4 is the corrected
  Slack/operator baseline; R5 is the integrated convergence verdict.
- Current evidence: 1,345 Sales-channel rows across the 30-day window; 289
  included work cycles; 105 substantive operator lines; 81 hand-reviewed
  drafted cases for unrequested content; 71 PII-free matched path identities
  linking to 145 cases. The non-path change surface is converged. Path behavior
  is not: analyzed pre-inquiry/all-device/coarse-family context differs from the
  deployed single-newest-device/unbounded-time/raw-URL signal, whose formatted
  counts are also lexicographically mis-ordered.
- Resolved blocker: the owner explicitly requested Claude collaboration and
  last-month evidence analysis on 2026-08-09. Secrets, environment files,
  credential/authentication stores, raw database dumps, and unrelated customer
  data remain excluded; durable reports must be PII-scrubbed.
- External-transmission blocker (2026-08-09T21:46Z): the first round 2 Claude
  invocation failed before review with sandbox `ENOTFOUND`. The identical
  network-enabled retry was rejected because the sealed in-scope snapshot
  contains raw customer names, email addresses, and message content. The owner
  must explicitly authorize that specific transmission to Anthropic Claude or
  decline it; the local snapshot remains mode `0600` under `/private/tmp`, and
  no customer content has been transmitted.
- Authorization resolution (2026-08-09T23:32Z): the owner states that data
  transfer is always authorized for tasks where Codex is asked to work with
  Claude and directs Codex to stop asking. Treat that standing instruction as
  authorization to transmit only the in-scope task data needed for the named
  collaboration. It does not authorize unrelated private data, secrets,
  production writes, external messages, deployment, commit, or push.
- Continuity: exact Claude session is
  `ae6931fb-c0e6-4714-9b81-ac8599a00f4f`. Analysis is ready for owner review.
  Recommended implementation ordering is deterministic host H1-H7, then
  prompt/card/abstention P1/P3/P4; keep Pass 0 as recorded context only until
  the four signal divergences are fixed and a blinded path-on/path-off eval
  passes. Implementation, commit, push, deployment, and live changes require a
  separate owner decision.

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
