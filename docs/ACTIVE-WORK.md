# NanoClaw active work

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-08-29

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| Task ID           | Outcome                                                                                                                                                                                                | Owner/client                       | Branch @ base                                                                                                                                  | Status                | Class | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Next action                                                                                                                                                                                                                                                                                                                                                             | Updated           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `NC-20260902-001` | Make Sales and every minion consume current, provenance-bound business facts plus live schedules and learned corrections without weakening immutable release instructions | Codex + Claude reviewer | `codex/sales-knowledge-runtime-20260902` from pushed post-live `59fbdbea` / exact live release `8df61d98` | `in_progress` | C3 | Incident-triggered knowledge/runtime correction. Split immutable release-owned instructions and canonical fact packs from operational `SCHEDULE.md`/`LEARNED.md`; add AACS/Coaching Supervision Mastery to deterministic program facts with stale-negative checks; make release/activation validate the effective mounted inputs; add regression/replay coverage for Lead #1311; reconcile minion/release documentation. Preserve all dirty primary work, existing prompts outside the required knowledge contract, provider state, schedules, approvals, and customer communication. | Inspect the exact release mount planner, builder, knowledge generators, facts detector, and activation workflow; implement the smallest fail-closed split and tests, run pinned focused/full gates, obtain bounded Sonnet/high review, then build/deploy from the current live lineage after a natural zero-work drain and verify a non-sending Sales replay. | 2026-09-02T11:54:40Z |
| `NC-20260830-001` | Keep grader discrepancy notices in the exact submission thread and prevent operator-only decisions from disappearing as suppressed final text | Codex + Claude reviewer | pushed `codex/grader-thread-routing-20260830`; exact live release `8df61d98`; prior `d834cb2f` | `complete` | C3 | Exact-run thread binding and discrepancy-tool instructions are live. Pinned Node focused 74/74, typecheck, format, build, continuity, release-critical 748/748, and runner 45/45 pass; full root retains only the exact two recorded base failures. Sonnet/high R1B returned no material findings. Vedat M3/M5 Heartbeat outcomes and tracker cells are verified. A sanitized discrepancy canary posted one operator notice in its exact thread, no generic missing-output notice, no verdict, and no record/ledger row. Release health, channels, listener, queues, bundle, and prompt hash pass; no certificate was issued. | None. Preserve the backup and rollback plist; future discrepancy runs should remain thread-bound and any new missing-output notice is a fresh incident. | 2026-08-31T03:09Z |
| `NC-20260829-002` | Stop Sales from parroting narrative coaching inquiries or turning one prospect's experience into unsupported fit, prevalence, or outcome claims | Codex + Claude reviewer | `codex/sales-intake-voice-20260829`; exact live base `b7004bb8`; reviewed implementation `37005d37` | `ready_for_deploy` | C3 | Narrative coaching need now routes `ORIENT/MEDIUM/PARTIAL`; program matching cannot prove fit, answerability, prevalence, medication history, or outcomes; the calibrated custom-engagement rule requires synthesis, verified mechanics, and one fit conversation. Focused Sales/email safeguards 49/49, typecheck, continuity, and diff check pass. Full root is 3,384 pass/32 skip with only two unrelated reproducible baseline failures in the CNPC wrapper assertion and date-stale Trafft fixture; neither failing file is changed. Claude Sonnet/high R1 found one consultation-call conflict; the corrected boundary passed focused tests and R2 returned `NO MATERIAL FINDINGS`. The original Lead #1276 card remains pending approval with no Gmail send receipt; no customer email is authorized. | Commit/push the deployment record, build and verify the exact immutable release, compare/copy reviewed prompt hashes and activate it on the Mini, then post and verify the replacement Lead #1276 approval draft in the existing Slack thread without approving or sending it. | 2026-08-29T20:52Z |
| `NC-20260829-001` | Repair checkout failure/recovery, establish Tandem + Stripe identity before payment, and give failed customers specific remediation on-page and in consented follow-up | Codex + Claude reviewer | NanoClaw customer-remediation extension on `090a7746`; Tandemweb extension on live `6e02da19f`; n8n projection `ac303ca5` unchanged | `validating` | C4 | Existing recovery and capture-first identity remain live. The extension adds a persistent EN/ES/FR/JA failure state from the same closed six-key policy, carries the retained key into localized subject/guidance/support person fields on the existing gated Encharge event, and tracks the eight templates for active flow `400441`. Generic abandonment stays distinct; raw Stripe detail is excluded; all existing consent/cutoff/purchase/reply/unsubscribe/idempotency/lease gates remain. Focused NanoClaw 14/14 plus typecheck and Tandemweb syntax/static contracts pass. Bounded Claude Sonnet/high returned `NO MATERIAL FINDINGS`; no provider template, deployment, customer event/email, historical case, or Stripe transaction has changed yet. | Run full gates, commit/push both isolated branches, deploy NanoClaw before the templates so every merge field exists, deploy Tandemweb, update/read back all eight existing templates without sending a canary, then verify live source/provider/flow/health and leave natural checkout/reminder outcomes open. | 2026-08-29T19:39Z |
| `NC-20260827-004` | Restore the Plutio outbox reaper after an activation canary contaminated the immutable release, then prevent release-root runtime logging | Codex + Claude reviewer | pushed `codex/release-integrity-log-contamination-20260827`; implementation/live release `2773def5`; prior release `d11e949b` | `complete` | C4 | Preserved the one-line contaminant outside the release with checksum, restored full-bundle verification, processed all six outage-created Plutio rows with zero retries/dead letters, and observed the next natural cron succeed. The reviewed logger containment and truthful inventory diagnostics are live in exact release `2773def5`. A release-root canary created no JSONL file, the bundle re-verified, the new Plutio wrapper processed zero remaining rows, parity stayed healthy, and one process/listener plus connected Gmail/Slack and zero active sends verify. Claude Sonnet/high's one material runbook finding was independently verified and corrected. The dirty primary and unrelated live state remain preserved. | None. Preserve the incident artifact and rollback plist; any future unlisted release file remains a fail-closed incident, not an invitation to update the inventory. | 2026-08-28T02:04Z |
| `NC-20260827-003` | Detect succeeded Stripe course payments that never reach NanoClaw and persist an owned ingress exception without replay | Codex + Claude reviewer | `codex/stripe-payment-ingress-parity-20260827` @ `d11e949b`; exact live release `d11e949b`; program item `work:stripe-payment-ingress-parity` | `complete` | C4 | Owner-directed bounded both-account Stripe PaymentIntent parity against durable host authority. Independent review found no material issues; immutable off-first deployment and one-key enable captured the proven same-day missed Tandem payment exactly once as a privacy-minimized owned exception. No provider replay, Payment Log, roster, `public.payments`, refund, communication, product/student identity, accounting, QuickBooks, or customer action occurred. | No further action. | 2026-08-27T19:15Z |
| `NC-20260827-002` | Finish the useful current-client Plutio identity pass without historical project/client reassignment | Codex | pushed `codex/relationship-context-current-plutio-coverage-20260827` from NC-009 final evidence `c813879d`; exact live release remains `6a978328`; concurrent external-watchdog task `NC-20260827-001` is separate | `complete` | C1 | Current-only provider and Party-graph double reads prove the 11 qualifying In-progress projects contain nine person and three company-link occurrences across two companies. All provider objects exist, but only one person has an already-existing exact ledger/ref; the other eight people and two companies expose no populated exact external-ID field or authoritative host bridge, with zero conflicts. Mapping them would require rejected Plutio cleanup or forbidden name/email inference. No historical assignment/reassignment, code, database, provider, runtime, Party/ref/role, communication, minion, checkout/lifecycle/Sales/watchdog, or legacy-receiver change occurred. Live release `6a978328` remains healthy; adapter/client replays changed zero. | None. This is the accepted useful Plutio coverage ceiling. Return to a separately selected higher-value Company OS roadmap item. | 2026-08-27T13:19Z |
| `NC-20260827-001` | Stop the external watchdog from turning a healthy deployment restart into a self-sustaining stale-Slack-heartbeat restart loop | Codex + Claude reviewer | pushed `codex/watchdog-heartbeat-grace-20260827` @ implementation `6dcdf4bd`; live script SHA-256 `ec488448` | `complete` | C3 | The reviewed external watchdog now derives heartbeat timing from configuration and grants only a healthy, Slack-connected daemon one bounded first-heartbeat window. The exact incident and fail-loud boundaries pass focused tests; Claude Sonnet/high returned `NO MATERIAL FINDINGS`. Live ticks at 00:33/00:35 applied grace without restart, a fresh heartbeat stored at 00:37:15, the 00:37:52 tick logged plain `OK`, PID 28556 crossed 10 minutes unchanged, channels remained connected, queues empty, and failures zero. | None. Preserve the rollback artifact and treat any future stale-heartbeat alert after the startup window as a real diagnostic signal. | 2026-08-27T05:38Z |
| `NC-20260826-009` | Map authoritative Plutio contract/project engagement evidence without treating contact presence as client authority | Codex + Claude reviewer | pushed `codex/relationship-context-plutio-engagement-20260826`; implementation `2e55df75`; exact-live merge `0b687f7e`; exact live `6a978328`; toolbox repair `922b7fea` | `complete` | C5 | Exact release `6a978328` is live with the separately enabled provider-neutral adapter. Stable accounting is 117 projects, 183 contracts, eight coaching definitions, and 59 qualified projects: 11 In progress, 41 Completed, two New, five Canceled. Existing exact person refs map two links into one fresh active and one historical coaching engagement; 50 person and eight company links remain held. Client projection covers 1,438/1,438 active Parties with 63 defensible customer/client Parties and exact replay changed zero projections. Shared auth parses only declared keys and copies/changes no credential. Combined focused 69/69, PostgreSQL 6/6, full 3,333 pass/31 skip with one unchanged CNPC baseline assertion, runner 45/45, release gate 748 plus runner 45/45, and live privacy/non-interference checks pass. Claude R1 findings were corrected; R2 returned no material findings. The initial NC-008 reservation collided with the already-live Sales task and was reconciled to NC-009. No Plutio/provider/customer/project/contract/invoice/proposal write, credential rotation/value/scope change, Party merge, role/ref rewrite, payment/consent action, communication, minion grant, checkout/lifecycle/Circle/Sales-support/legacy-receiver change. | None for this phase. The remaining 50 person/eight company exact-ref gap is a separately unauthorized candidate; do not resolve it by name or email. | 2026-08-27T05:12Z |
| `NC-20260826-008` | Make an exact Alex/Cherie answer in an active-client support thread produce the approval draft in the same Sales turn without CRM, Gmail, attachment, context, or escalation detours | Codex + Claude reviewer | `codex/sales-operator-fast-path-20260826` @ `f52f708f`, exact live release | `deployed_unverified` | C3 | Added and deployed the zero-tool operator-answer fast path for `[SOURCE: email-active-client]`/`SERVICE`: once Alex or Cherie supplies the missing fact or decision in the exact work thread, Sales must immediately produce one `[CLIENT SUPPORT REVIEW]` from the existing request, Thread-ID, and operator fact. It may not call psql, Gmail, attachment, Party Context, Chaos, Plutio, or another minion; may not re-escalate; and may not create pipeline state. Preserve exact approval/send gates, thread/recipient binding, unsupported-fact abstention, and complex Sales behavior outside this narrow path. No customer email, approval, provider/database mutation, model change, or broad routing rearchitecture. | Exact release, operational prompt hashes, service/channels/listener/queues, backup, and safety workers are live-verified. Do not manufacture or duplicate customer work; close natural-outcome proof on the next real qualifying Alex/Cherie answer by confirming one same-turn support card and zero lookup/tool detours. | 2026-08-27T04:19Z |
| `NC-20260826-007` | Let Sales prepare approval-gated active-client/student support responses without inventing pipeline opportunities, while repairing genuine-lead entry resolution to use the existing least-privilege helper | Codex + Claude reviewer | pushed `codex/sales-support-entry-fix-20260826`; prompt `371e6e0a`; combined release `55efd52f`; exact enforcement/live `25b44f98` | `complete` | C3 | Active-client/student `SERVICE` work uses pipeline-free `[CLIENT SUPPORT REVIEW]`; genuine leads use `v_active_pipeline` and `fn_create_pipeline_entry`. The operator approved the first natural response and Gmail confirmed it exactly once; the later support card remains unapproved behind a host stop, one confirmed action, and zero pipeline entries. Deterministic host enforcement now rejects SERVICE-as-Sales, nonnumeric Sales lead IDs, and non-SERVICE support cards at IPC, Slack, and approval arming while retaining historical execution reconciliation. Claude R2 returned no material findings. Focused 222/222, email-critical 748/748, typecheck/format/continuity, and full 3,324-pass/30-skip gates pass apart from the unchanged CNPC assertion. Live inert canary was rejected, quarantined, leaked no draft body, and created zero actions. Exact release health, channels, listener, queues, prompts, and Relationship Context workers pass. | None. Customer response is Gmail-confirmed once; the duplicate support card is unapproved and explicitly stopped. Future malformed support-as-Sales drafts fail before approval. | 2026-08-27T03:59Z |
| `NC-20260826-006` | Project every active Party's defensible client and customer relationship status without guessing active engagement | Codex + Claude reviewer | pushed `codex/relationship-context-client-projection-20260826`; implementation `0ca7939f` from NC-005 final evidence `13c855db` | `ready_for_deploy` | C5 | Reviewed default-off worker maintains one deterministic, privacy-minimized `relationship` projection per active canonical Party. Exact succeeded Stripe payment and latest active-subscription facts are the only current positive customer evidence. Existing client/student/prospect role rows are separately labeled as recorded but unproven because all lack authority metadata. Active engagement remains unknown; Plutio contract access is unavailable and cannot be inferred. Focused 34/34, PostgreSQL 5/5, full 3,317 pass/30 skip with one unchanged CNPC baseline assertion, runner 45/45, typecheck/build/continuity pass; one Claude finding was independently disproved by migration source and an added merge regression. No Party merge, source/ref or role rewrite, legacy promotion, provider/customer/payment/contract/consent mutation, communication, broad minion access, or checkout/lifecycle/Circle/legacy-receiver change. | Build and verify one immutable release from the pushed branch, then back up/off-first deploy, enable only the new flag, and verify aggregate live coverage, exact replay, privacy, and non-interference. | 2026-08-27T03:20Z |
| `NC-20260826-005` | Extend Party Context with both Stripe accounts, exact contact-form submissions, and verified Chaos identities | Codex + Claude reviewer | pushed/live `codex/relationship-context-stripe-contact-chaos-20260826` @ exact release `d5375964`; implementation `7a4a876b` from `5c02acd3` | `complete` | C5 | Exact live read-only adapters connect 75 Stripe customers plus 157 native payment/subscription refs, 185 immutable contact submissions, and 1,328 verified Chaos visitors; 722/6/40 identities remain explicit legacy, 1,314 Stripe native facts are held, and conflicts are zero. Evidence is account/source scoped and PII-minimized. No provider/customer/form/Chaos mutation, Party merge, communication, consent change, broad minion access, or checkout/lifecycle/Circle/legacy-receiver change. | None. Preserve evidence and rollback; new source facts reconcile on the bounded 15-minute cycle while query/minion access remains separately disabled. | 2026-08-27T02:04Z |
| `NC-20260826-004` | Connect every defensible Trafft, Plutio, and Encharge identity to Party context and classify the unresolved remainder explicitly as legacy | Codex + Claude reviewer | pushed `codex/relationship-context-provider-reconciliation-20260826`; exact live implementation `1a381e48` from prior live `adc0c5d8` | `complete` | C5 | Live provider-neutral reconciliation imports 1,364 unique Plutio person refs and 1,242 email-free Encharge person refs/consent projections; 159/173 Trafft customers and 358/424 appointment records are exact, while 14 customers and 66 appointment records are durably legacy. All provider conflicts are zero and both Encharge/Trafft replays are duplicate-only. Provider-native authority and adapter extensibility remain intact. No provider/contact/consent/campaign/Plutio mutation, Party merge, communication, payment/contract action, broad minion access, or lifecycle/checkout/Circle/legacy-receiver change. | None for this reconciliation. New provider systems follow the same adapter/sanitized-snapshot contract; reclassify legacy only when new stable evidence exists. | 2026-08-26T22:11Z |
| `NC-20260826-003` | Bind exact Trafft identity for safely source-created Parties and unlock exact appointment projections without legacy email inference | Codex + Claude reviewer | pushed `codex/trafft-exact-identity-20260826`; exact live `adc0c5d8` from prior live `416384fc` | `complete` | C5 | Transaction-atomic exact customer/appointment refs bind only Parties created by Trafft after adapter registration and appointments whose ledger Party agrees with the exact customer ref. Live natural reconciliation produced 2 customers, 4 appointments, and 4 current projections; 418 current-row holds and all 422 immutable held observations remain. One minimized host-only exact read delivered receipt 1. No historical email binding, provider/customer/Plutio/credential/payment/contract write, broad minion access, scheduled context consumer, or lifecycle/checkout/Circle/legacy mutation. | None. Expand exact identity only through a separately authoritative provider reference or owner-reviewed reconciliation; do not promote the remaining legacy holds by email. | 2026-08-26T20:27Z |
| `NC-20260826-001` | Make `Tandem Team` the explicit generic relationship owner managed by Tandem OS without granting action authority | Codex + Claude reviewer | `codex/relationship-owner-tandem-team-20260826` @ exact pushed/live Relationship Context lineage `460a51c7`; saved primary lacks `.git` metadata and remains preserved | `validating` | C5 | Accepted owner decision, migration/rollback 138, append-only principal and exact lane assignments, fail-closed resolver, policy/shadow/review/store provenance, PostgreSQL proof, docs, and tests. Ownership is accountability/routing only; no send, approval, provider write, follow-up activation, credential, payment, contract, customer communication, or inferred individual owner. | Run full pinned-Node verification and continuity, obtain independent Claude Sonnet/high review, fix every material finding, then use the established exact-release/deployment workflow with production preflight and live non-interference proof. | 2026-08-26T14:15Z |
| `NC-20260825-004` | Put the maximum safely supportable Relationship Context slice into production, starting with the reviewed foundation and read-only Trafft shadow context | Codex + Claude reviewer | pushed `codex/relationship-context-production-rollout-20260825`; exact live implementation `e97c9f87` directly contains prior live `8e475e03` | `complete` | C5 | Migration 137 and exact immutable release are live. The credential-free Trafft host-ledger shadow is healthy/complete over 414 eligible appointments, stores 414 minimized null-Party observations plus 414 identity holds, creates zero projections, and replays 414/414 duplicates. Query/minion access remains off with zero grants. Checkout recovery production sends, Community lifecycle shadow, Gmail/Slack, providers/legacy receivers, and dirty primary are preserved. No guessed identity, provider/customer/Plutio/credential/payment/contract write, broad minion grant, or destructive rollback. | None for this safe rollout. Exact Trafft customer-to-Party authority remains a separate owner/schema decision before any minion context pilot or projection. | 2026-08-25T22:54Z |
| `NC-20260825-003` | Implement the provider-neutral Relationship Context dark foundation without provider writes, customer actions, production migration, activation, or deployment | Codex + Claude reviewer | pushed `codex/relationship-context-dark-foundation-20260825`; implementation `050fed67` from exact reviewed/live lineage `683d61208e1c` | `complete` | C2 | Migration/rollback 137, stable adapter/fact contracts and registry, fixture-only LMS adapter, ambiguity-safe identity/store/service, bounded observations/projections/query receipts, exact one-shot host grants, default-off `party_context_get`, dry-run-only Plutio plan, disposable PostgreSQL proof, docs, and tests. Claude R1's four material findings are corrected; R2 closed the load-bearing findings and rollback ambiguity. Codex verified and hardened version/privacy/identity registration and batch bounds. Immutable 980-file release proof was built but not deployed. No production DB/provider/customer/Plutio/minion/deployment mutation. | None for this local dark implementation. Production migration, provider adapters, activation, deployment, and business outcomes remain separate work. | 2026-08-25T19:24Z |
| `NC-20260824-010` | Stop and correct the Community lifecycle relay errors reaching `#gru-chief` without changing legacy receivers, Circle, or lifecycle consumers                                                         | Codex                              | exact live `8e475e036ad6`; pushed `codex/student-lifecycle-action-inference-live-20260824`; toolbox `e269711`                                | `deployed_unverified` | C3    | The 16-alert incident is corrected: exact rollback/18-row baseline preceded deterministic four-shape inference, minimized host-field alignment, reviewed exact-live release, inactive workflow replacement, four provider-free direct canaries, and exact provider restoration. Final state is 18+4 legacy-unchanged, registry receipt 4, five fixture events/four owned identity holds, zero enrollments/state/actions, zero target retention/active executions, and no lifecycle error-handler increase across the full post-reactivation observation. Checkout production sends are preserved. Circle, legacy receivers, consumers, users/groups/courses, and durable prior evidence remain unchanged. | Return to the original 14-day shadow gate: resolve progress `AUTH_ERROR`, obtain two complete scans, observe natural core receipts, and review parity/owned exceptions. Do not change Circle, legacy receivers, or lifecycle consumers. | 2026-08-24T22:38Z |
| `NC-20260824-009` | Prospectively send up to two consented abandoned-checkout reminders across eligible paid courses without duplicates or stale post-purchase sends                                                       | Codex + Claude Code reviewer       | `codex/checkout-recovery-two-reminders-20260824` @ exact live `44298a9f03d7`; Tandemweb/toolbox companion worktrees                            | `ready_for_deploy`    | C4    | Policy-v2 localized consent; locale/safe return URL metadata; migration 136 per-touch intents and append-only receipts; host-owned timing, current/sibling purchase suppression, cutoff/no-backfill, Encharge event handoff; eight locale/touch templates and pilot-first replacement flow. Expired ambiguous dispatch leases hold instead of replaying; touch two requires touch-one provider acceptance. Claude correction R3 returned `NO MATERIAL FINDINGS`. Protect existing checkout shadow, student lifecycle, grader, Contador, payment, accounting, CRM, booking, roster/access, and required-student-message behavior.                                                                                                                                | Build/deploy the exact current-lineage release with sending disabled, create deactivated provider assets, run the allowlisted two-touch canary, then switch to the prospective production cutoff and retire only legacy entry triggers while existing entrants drain.                                                                                                  | 2026-08-24T23:33Z |
| `NC-20260824-008` | Make one Foundation grading routine cover English, French, Japanese, and Spanish while producing course-language feedback that meets the existing human-faculty release invariant                      | Codex + Claude Code reviewer       | live NanoClaw `44298a9f03d7`; standalone grading authority `85243f1`; personal skill manifest                                                  | `deployed_unverified` | C3    | The exact combined-lineage release is live and healthy with Gmail/Slack connected. Mini's task-critical grading files hash-match Studio; the reviewed operational grader prompt hash-matches the release. Live content-free checks load all 32 registry assignments, resolve 24 written mappings as 6 per locale, accept compliant output for all four locales, and reject the tested locale failures without a Slack post or student record. English remains enabled; localized writeback/tracker/certificate actions are manifest-disabled. Claude R2 findings were fixed and R3 returned `ACCEPT`.                                                                                                                                                                                                                                                                                                                                                                                      | On the first natural French, Japanese, or Spanish submission, stage feedback in Slack, apply blind human-language review, and record calibration evidence. Do not enable localized Heartbeat writeback, trackers, or certificates until a later recorded release gate.                                                                                                  | 2026-08-24T22:00Z |
| `NC-20260824-003` | Stop Sales and other minions denying the verified French, Japanese, and Spanish Mentor Coaching Foundations products                                                                                   | Codex                              | `codex/mcs-localization-knowledge-repair-20260824` from current post-deployment head `000a5ba9716c`                                            | `ready_for_deploy`    | C3    | Hash-bound language catalog/pack, exact injection into all 13 tracked KBs, regeneration-safe validation, raw-byte runtime drift detection, and malformed-input refusal are implementation/review complete. R1 found one fail-closed crash plus two coverage/hash issues; all were fixed and R2 returned no material findings. No reply to the prospect, provider/course/enrollment/payment/translation/customer mutation, price/entitlement change, or localized-live-cohort/translated-ICF claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Commit/push, build the immutable release from the current `7a36d79c…` live lineage, drain natural work, deploy through the three-pointer activator, and read back the exact live Sales KB block and healthy channels/queues without sending a message.                                                                                                                  | 2026-08-24T20:44Z |
| `NC-20260824-007` | Release the Community student-lifecycle control plane into four-action shadow capture without changing legacy receivers, Circle, or lifecycle consumers                                                | Codex                              | `codex/student-lifecycle-community-shadow-live-20260824` from exact live checkout-recovery release `ab3124a0312d`; toolbox companion `71f35cf` | `ready_for_deploy`    | C3    | The reviewed four-action manifest/catalog, protected 18-registration baseline, provider/reconciliation CLIs, aggregate health, inactive relay/rendering, and guarded Heartbeat/n8n controls are rebased onto the current live lineage. The first inactive import safely exposed n8n's 36-character workflow-ID limit before creation; the 34-character ID and shared guard pass focused tests and bounded Sonnet/high R3 with no material findings. Provider/config/runtime mutation remains pending; progress API is held on HTTP 401. No Circle access/change, legacy receiver cutover/deletion, lifecycle action/message/certificate/Encharge/minion behavior, Heartbeat user/group/course mutation, or manufactured provider student event.                                                                                                                                                                                                                                            | Commit/push/rebuild the correction, then resume the disabled-first import/config/deploy/catalog/canary/four-registration runbook. Keep the 14-day/two-complete-progress-scan gate waiting and Circle untouched.                                                                                                                                                         | 2026-08-24T19:45Z |
| `NC-20260824-006` | Build and deploy a durable, both-account abandoned-checkout shadow control without sending recovery messages                                                                                           | Codex                              | `codex/checkout-recovery-shadow-20260824` @ live merged release `7a36d79ca787`; Tandemweb `0d09278fb`; toolbox `9b06988` + `8a10a07`           | `deployed_unverified` | C3    | Migration 135 and exact merged host release are live; Tandemweb server producer plus unchecked versioned consent, downstream-acknowledged retention-free website relay, durable n8n five-event trigger definitions for both fixed Stripe accounts, terminal purchase precedence, 45-minute Tandem timeout/five-minute failure path, Heartbeat event-only cases, and content-minimized owner readback are enabled in shadow mode. One signed consent-denied non-customer canary is durably `captured/ineligible`; no customer send exists. Concurrent Community student-lifecycle source/live state is preserved in the merged release.                                                                                                                                                                                                                                                                                                                                                     | Observe only the next natural eligible checkout failure/expiry/captured timeout and exact later-purchase suppression/owner projection. Do not manufacture a Stripe event, send recovery, bulk-work history, or activate Encharge nurture.                                                                                                                               | 2026-08-24T19:58Z |
| `NC-20260824-005` | Deploy the exact reviewed Community-only student-lifecycle dark foundation while keeping every provider/action boundary disabled                                                                       | Codex                              | `codex/student-lifecycle-dark-foundation-20260824`; exact live source `7364accd53ae`                                                           | `complete`            | C3    | Exact immutable release is live after zero-work drain, protected backups, additive migration 134, dry-run, and one three-pointer activation. Lifecycle is explicitly disabled with zero configuration keys/rows, all schema admin-only, Gmail/Slack healthy, one listener, zero waiting/outbound backlog, and unchanged error baseline while natural work runs. No n8n/Heartbeat/legacy/Circle/credential/action/message/certificate/minion change occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | None for this dark deployment. Provider ingestion/cutover, lifecycle actions, and Circle remain separately authorized work.                                                                                                                                                                                                                                             | 2026-08-24T17:45Z |
| `NC-20260824-004` | Plan, reconcile, and implement the Community-only dark student-lifecycle foundation while leaving Circle and every external/provider boundary untouched                                                | Codex                              | `codex/student-lifecycle-dark-foundation-20260824` @ `7364accd53ae`; pushed                                                                    | `complete`            | C2    | Community-only dark foundation is implementation- and review-complete. Claude plan R1 corrections preceded source work; implementation R1 findings were fixed and correction R2 returned `NO MATERIAL FINDINGS`. Focused 129/129, disposable store 2/2, migration lifecycle/permissions, typecheck/build/format/continuity/capability/diff pass; full 3,161 pass / 14 skip with only the unchanged CNPC wrapper failure. Circle and every external/production state remained unchanged during implementation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None for local implementation. Dark deployment is recorded by `NC-20260824-005`; provider activation and Circle remain separate.                                                                                                                                                                                                                                        | 2026-08-24T17:45Z |
| `NC-20260824-001` | Make internal Slack notification previews explain the business event before diagnostic metadata                                                                                                        | Codex                              | `codex/human-first-slack-notifications-20260824` @ `fbf02a44`                                                                                  | `in_progress`         | C3    | Presentation-only correction for Contador payment receipts, Chaos website activity, and verified form submissions after a bounded audit of nearby deterministic Slack notifications. Human action/outcome must lead; identifiers and diagnostics may follow. No payment processing, lead classification, routing, customer communication, provider event, schema, credential, schedule, or unrelated notification behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Run narrow/full verification, obtain independent Claude Sonnet/high review, then release/deploy and verify exact live health without manufacturing a payment or website event.                                                                                                                                                                                          | 2026-08-24T13:15Z |
| `NC-20260823-006` | Make every host-admitted Stripe payment or refund finish with verified operational receipts or remain as a durable owned Contador exception | Codex + Claude reviewer | pushed/live `codex/contador-natural-payment-proof-20260827` @ exact release `6778be02`; migration 139; merged watchdog source `3423ca7a` | `complete` | C4 | The natural payment happy path and terminal exception path are live-verified. Migration 139 provides typed `ch_`/`py_`; processor/contract failures return handled durable `write_failed`; terminal-held cases cannot reopen/external-replay; exact guarded repair terminalized only cases 8:v3/a4 and 11:v2/a3 without external calls. Final ledger: six complete, two needs-product, three write-failed, one refund needs-review, zero processing. Ten exact receipts were added; original source times preserved; applied replay no-op; public payments/Stripe inbox/deadletters/aliases unchanged. Claude R1 replay finding was fixed and R2 returned no material findings. Focused 125/125, full 3,347 pass/31 skip with sole unchanged CNPC assertion, runner45, release748, local/Mini artifact, backup/migration/activation, channels/queues/watchdog/query/checkout/lifecycle/context non-interference pass. No provider/event replay, missed-payment repair, refund, communication, product/payer redesign, accounting, or ingress-parity activation. | None for the host-admitted ledger. The missed provider delivery remains separate `work:stripe-payment-ingress-parity`; refund closure remains separate. Select the next roadmap item independently. | 2026-08-27T18:38Z |
| `NC-20260822-011` | Deploy the complete host-owned Gmail attachment capability so required email evidence is processed or explicitly held without exposing attachment bytes                                                | Codex                              | `codex/gmail-attachment-release-20260823` @ exact live `195dd3b3664a`                                                                          | `deployed_unverified` | C5    | Exact reviewed release is live: host-private byte retrieval; count/size/depth/type/magic/ZIP limits; SHA-256; quarantine/encrypted holds; text/PDF/Office/ODF/iWork extraction; bounded OCR; minimized SQLite receipts; temporary cleanup; untrusted-evidence delivery; and held-state closure gates. Image/snapshots/dependencies, WAL-safe backup, rollback, service/channel/schema/queue/non-interference proof pass. No attachment bytes or customer/provider action were manufactured for proof.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Observe only natural Gmail attachment work: one supported ready receipt and one explicit held receipt, with downstream refusal to close where required. Do not manufacture an email or scan the mailbox broadly.                                                                                                                                                        | 2026-08-24T01:10Z |
| `NC-20260823-005` | Execute the approved three-source sequential healer expansion pilot without raising concurrency or enabling broad remediation                                                                          | Codex                              | `codex/self-healing-bounded-projection-20260823` @ live `d4f428912679`                                                                         | `complete`            | C3    | `MAX_ITEMS=1` remained fixed. Sources `d0ca…` and `d3c…` are `resolved/verified_fixed` with completed version-2 work, 3 observations / 3 events / 1 receipt, and duplicate-only replay. For `458c…`, the accepted safe-state kept collector/ingest/review gates off, disabled only the contradictory daily CaleProcure job with backup and dual registry/SQLite readback, and recorded a named no-action receipt: completed version 2 with 2 observations / 3 events / 1 receipt and replay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | None for this pilot. Any fourth source, `MAX_ITEMS` increase, CaleProcure shadow/collection reactivation, or backlog policy requires a new accepted decision.                                                                                                                                                                                                           | 2026-08-23T19:15Z |
| `NC-20260823-004` | Resolve and remediate the single presented healer item, close its bound Company Work item with verified evidence, then prepare the expansion decision                                                  | Codex                              | `codex/self-healing-bounded-projection-20260823` @ live `883f375f5ceb`                                                                         | `complete`            | C3    | Incident `563834` was an operator `[eval1]` typo, not a missing migration. The unsafe Knex/Prisma proposal was rejected; no command/migration ran. Guarded correction plus the normal verifier produced `resolved/verified_fixed`; the existing work item is `outcome_validated/completed` version 2 with 3 observations / 3 events / 1 receipt and duplicate-only replay. One Codex verification-query log artifact was preserved and exactly suppressed with a durable receipt before collector ingestion; no second incident or alert was created.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner decision on candidate `work:self-healing-sequential-expansion-pilot`. Recommendation: keep `MAX_ITEMS=1`; fix `healer:d0ca940a103136d3` first, then rotate only after terminal receipt/replay.                                                                                                                                                                    | 2026-08-23T21:25Z |
| `NC-20260823-003` | Present the single healer Company Work item once through the existing Chief exception loop and prove durable pickup/attempt without remediation                                                        | Codex                              | `codex/self-healing-bounded-projection-20260823` @ live `d39bc0733e2d`                                                                         | `complete`            | C3    | One bounded restart invoked the existing startup tick. It posted one source-bound healer packet, suppressed two unchanged packets, and produced one durable dispatch with `posted,picked_up,attempt_succeeded`, status `attempted/1/posted`. The healer item correctly remains `accepted/blocked` version 1 with one observation; attempt is not source resolution. No second source, duplicate packet, remediation, source correction, customer communication, schedule, credential, queue buildup, or new daemon error occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None for presentation/pickup. The named owner must now decide the proposed resolution; execution/remediation remains separately authorized.                                                                                                                                                                                                                             | 2026-08-23T17:29Z |
| `NC-20260823-002` | Wire and prove exactly one naturally existing healer-resolution projection without creating an unbounded Company Work backlog                                                                          | Codex                              | `codex/self-healing-bounded-projection-20260823` @ live `883f375f5ceb`                                                                         | `complete`            | C3    | Exact-source/max-one controls and the one-source canary are live and Codex-verified: 1 item / 1 observation / 2 events, replay no-op, healthy report/non-interference. Updated token rotation enabled the required Claude Sonnet/high review; one high stale-actor invariant finding was fixed and regression-tested, and the correction review returned `NO MATERIAL FINDINGS`. Main and fast-healer services now run exact corrective release `883f375f…`; a natural fast cycle was duplicate-only with no error. No second source, manufactured incident, remediation, schedule, or credential change occurred.                                                                                                                                                                                                                                                                                                                                                                         | None for this one-source milestone. Expansion, owner resolution, and remediation remain separately authorized.                                                                                                                                                                                                                                                          | 2026-08-23T20:18Z |
| `NC-20260823-001` | Deploy the reviewed healer-resolution schema and immutable host release dark, with backup, rollback, health, and non-interference proof                                                                | Codex                              | `codex/self-healing-visible-resolution-20260823` @ live `97026492b85e`                                                                         | `complete`            | C3    | Exact release `97026492b85e…` is live on `mini-claw.local` under Node 22.23.2 after archive verification, zero-work drain, mode-0600 business_v2/plist backup, additive migration 132, activator dry-run, and three-pointer activation with rollback retained. The adapter remains disabled/absent; healer report/schema are empty; one listener and Gmail/Slack are healthy; queues are empty; no error lines were added; protected Company Work counts/hashes remain 25/164/76 and unchanged. No live projection, Slack post, owner-work presentation, remediation/action, schedule, credential, or adapter activation occurred.                                                                                                                                                                                                                                                                                                                                                         | None for this dark deployment. A live projection/presentation canary requires a separately accepted owner decision and must use natural healer evidence rather than a manufactured incident.                                                                                                                                                                            | 2026-08-23T14:18Z |
| `NC-20260822-017` | Add the dark, truthful Company Work schema and host adapter for healer pending decisions, with disposable-database proof and no live projection                                                        | Codex                              | `codex/self-healing-visible-resolution-20260823` @ implementation `e7ddaf9e`; live release `97026492b85e`                                      | `complete`            | C3    | Migration 132, the default-off writer, exact lifecycle/receipt semantics, report/CLI support, structure-only schema docs, and disposable PostgreSQL proof are committed, deployed dark, and structurally/live verified. Exact replay and terminal replay are no-op; changed evidence updates one blocked item; verified recovery or a hashed named no-action decision closes it; recurrence reopens it. Production schema is empty/admin-only/append-only, the adapter remains disabled, and existing Company Work evidence is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None for the dark capability milestone. Adapter activation, live incident projection, owner-work presentation, and remediation remain separately gated.                                                                                                                                                                                                                 | 2026-08-23T14:18Z |
| `NC-20260822-016` | Project the minimized healer resolution catalog into a deterministic, default-dry-run Company Work plan without creating runtime work or enabling remediation                                          | Codex                              | `codex/self-healing-visible-resolution-20260823` @ read-only checkpoint `6703de6e`                                                             | `ready_for_review`    | C2    | Local source explicitly refuses to misuse existing Sales/job/program-facts ledger semantics, declares the required future `healer_resolution` workflow, and deterministically plans ensure/update/reopen/verified-close/named-no-action-close/verification-hold/no-op behavior. Exact replay is no-op; changed evidence stays on the same source identity. The CLI has no apply flag or ledger writer. No migration, production read/write, Company Work mutation, Slack post, action, shell rerun, implementation, configuration, deployment, restart, credential, or external state change.                                                                                                                                                                                                                                                                                                                                                                                              | Review/commit the dry-run plan, then continue the same program item with migration 132, content-minimized observations, owner/decision receipts, report support, and a default-off host adapter rehearsed only in disposable PostgreSQL.                                                                                                                                | 2026-08-23T03:41Z |
| `NC-20260822-015` | Build the first read-only healer resolution catalog so existing proposed fixes and unresolved decisions are durable, deduplicated, and visible without enabling remediation                            | Codex                              | `codex/self-healing-visible-resolution-20260823` @ exact live `1f474f90` (isolated worktree)                                                   | `ready_for_review`    | C2    | Local source now maps one current item per incident fingerprint, emits stable resolution evidence, and explicitly classifies verified recovery, named rejection, monitoring, or pending decisions for approval/manual/recurring/no-fix/unverified/unrouted/stale/unknown states. The standalone CLI reads minimized existing fields only; raw context, commands, diffs, Slack/thread identity, and transcript paths are excluded. No migration, production read/write, Company Work projection, Slack post, action, shell rerun, implementation, configuration, deployment, restart, credential, or external state change. The dirty primary and existing healer safety boundary remain untouched.                                                                                                                                                                                                                                                                                         | Review and commit the read-only candidate, then continue the same program item with a separately tracked Company Work projection over only the minimized catalog fields. Keep Slack as a projection and do not enable healer actions.                                                                                                                                   | 2026-08-23T03:07Z |
| `NC-20260822-013` | Bind NanoClaw's Practitioner Series knowledge and deterministic drift closure to the accepted cross-repository program-fact authority                                                                  | Codex                              | `codex/program-facts-live-release-20260823` @ implementation `553cc94c` (exact-live-base isolated worktree)                                    | `ready_for_deploy`    | C3    | Add the revision-2/hash-pinned Practitioner catalog and generated minion pack, inject the pack into every tracked knowledge consumer, and extend the existing version-1 program-facts detector without changing its durable evidence schema. Existing Company Work closure behavior, prices/products authority, customer messaging, credentials, and unrelated dirty work remain unchanged. Release `acd0206f` is healthy but its read-only detector canary exposed that the historical bundle omitted `facts/`; no detector or Company Work run occurred. The corrected builder now packages and attests those inputs. The owner authorized commit, push, replacement deployment, and live readback.                                                                                                                                                                                                                                                                                      | Push, build, and verify the corrected replacement, drain the startup container, replace `acd0206f` with rollback retained, then run one deterministic live detector receipt and record whether the existing exception closes.                                                                                                                                           | 2026-08-23T01:47Z |
| `NC-20260821-007` | Turn the payment-reconciled overdue-invoice backlog into one bounded, source-bound internal Contador review packet without creating customer work                                                      | Codex                              | `codex/nc-20260821-007-followup-review` @ `c0d1f0dd` (isolated worktree)                                                                       | `ready_for_review`    | C3    | Pure packet/decision contract and default-dry-run host command over the deployed follow-up source shadow. It selects only exact policy-ready Plutio receivables, caps at 25, binds source/decision/snapshot fingerprints, and fails closed on source errors, clock/fingerprint drift, malformed identity, or duplicates. The command has no apply/post mode. Focused, typecheck, build, continuity, and 2,965-test broad gates pass except the unchanged baseline CNPC wrapper-literal assertion. No case projection, PostgreSQL write/migration, Slack post/reaction, Contador agent run, collection decision, draft, approval, Plutio/payment mutation, customer email, scheduler activation, or legacy-task restart is authorized. The operational checkout and NC-006 natural Sales receipt gate remain untouched.                                                                                                                                                                     | Commit/push the reviewed candidate and build its exact release artifact. A clean Mini packet run requires a separately authorized release; projection, Slack presentation, and decision consumption remain later gates.                                                                                                                                                 | 2026-08-22T04:35Z |
| `NC-20260821-006` | Turn the follow-up shadow's exact thread, accountable-owner, and payment-reconciliation blocks into trustworthy source evidence without manufacturing customer work                                    | Codex                              | `codex/nc-20260821-006-followup-evidence` @ deployed `8c4e3c2b` (implementation `1dbc15df`; isolated worktree)                                 | `deployed_unverified` | C3    | Exact release `8c4e3c2b` is live under Node 22.23.2. Future approved Sales sends are host-bound to the exact pipeline entry in their confirmed interaction receipt; exact invoice-scoped paid transactions require stable receipt IDs and complete currency evidence before reconciling invoice arithmetic. The activated release's read-only Mini dry run had zero source errors and moved eight overdue invoices only to internal collection review. No historical backfill, projection, Slack presentation, collection decision, draft, approval, assignment, pipeline/Plutio/payment mutation, customer send, scheduler activation, or legacy-task restart occurred. Ownership remains fail-closed: Plutio exposes creator rather than assignee, zero of 1,163 live pipeline entries has owner metadata, and only two of five pending proposals have one active pipeline entry.                                                                                                        | Observe the next natural approved Sales send for its exact pipeline-bound Gmail interaction receipt. Define a tracked assigned-owner schema and explicit owner assignments later; never substitute `createdBy`, a duplicate pipeline entry, or a global sender. Keep projection, presentation, drafting, sending, and scheduling dark.                                  | 2026-08-22T02:40Z |
| `NC-20260821-005` | Reconcile Sales conversations, unsigned proposals, and overdue receivables into one read-only durable follow-up shadow and an operator-reviewable disposition backlog without generating customer work | Codex                              | `codex/nc-20260821-005-followup-shadow` @ deployed `e01c9228` (isolated worktree)                                                              | `complete`            | C3    | Exact release `e01c9228` is live and one full content-free Mini dry-run completed with zero source errors: 189 observations (164 Sales, five proposals, 20 invoices), zero ready, 165 blocked, 12 waiting, and 12 terminal. The first run exposed a bounded-process failure caused by per-record Plutio recipient reads; batched identity reads fixed it before the successful rerun. The legacy task remains paused and the proposal loop unchanged. No Slack card, draft, approval, pipeline/Plutio/payment mutation, schedule wiring, projection apply, or customer send occurred.                                                                                                                                                                                                                                                                                                                                                                                                      | Stop at the strategic Company OS milestone. Repair the proven identity, owner, and payment-receipt data contracts before separately reviewing any dark projection; do not activate presentation, drafting, customer action, or scheduling from this snapshot.                                                                                                           | 2026-08-21T22:25Z |
| `NC-20260821-004` | Make Node 22.23.2 the one executable contract for NanoClaw development, CI, container builds, releases, and production instead of repeatedly running project commands under ambient Node 20/26         | Codex                              | `codex/nc-20260821-005-followup-shadow` @ deployed lineage `e01c9228`                                                                          | `deployed_unverified` | C2    | Exact 22.23.2 binds both package engines/engine-strict installs, five GitHub setup steps, CI push/PR, the agent-image base, release inputs, startup/health, and a repository launcher. The live daemon reports exact 22.23.2. The prior minion image was retained as `rollback-20260821-e01c9228-node22.22.0`; a replacement image built successfully from verified release `e01c9228` with manifest `8de63770...`, after restarting the idle Apple Container builder with the required `192.168.1.1` DNS. This post-build shell could not reacquire the Apple `container` CLI for a separate runtime smoke, so the image version is build-proven, not independently launch-proven. Global Node 26 remains unchanged and outside the NanoClaw contract.                                                                                                                                                                                                                                    | On the next natural minion launch, verify its reported Node version is 22.23.2 and retain the rollback tag until that evidence exists. No global Node change is needed.                                                                                                                                                                                                 | 2026-08-21T22:25Z |
| `NC-20260821-003` | Give Inbox, Sales, and Chief bounded visible-recipient context and approval-safe reply-all proposals while making automation/intelligence gains an explicit Company OS delivery gate                   | Codex                              | `codex/nc-20260821-003-recipient-context` @ deployed `3de6707d` (isolated worktree)                                                            | `deployed_unverified` | C3    | Exact release `3de6707d` is live under Node 22.23.2 with one listener, connected Gmail/Slack, empty queues/containers, exact prompt identity or reviewed Chief merge, and identical pre/post email-action evidence. The roadmap now requires business, automation, and minion-intelligence gains in one of three outcome lanes. Host-derived `Visible-To`, `Visible-Cc`, and maximum-ten `Reply-All-Candidates` survive direct/classified routes; BCC, owned/primary/duplicate addresses, and forwarded envelopes are excluded. Sales/Chief require explicit sender/operator intent; exact approved Cc is immutable; Gmail revalidates latest external participants. No customer email, approval mutation, or synthetic multi-recipient canary occurred.                                                                                                                                                                                                                                   | Observe the next natural multi-recipient inbound: confirm the routed minion receives the exact bounded candidates, proposes Cc only on explicit intent, keeps it visible through approval, and either receives one exact Gmail receipt or a deterministic pre-send block. Do not manufacture or broaden customer action to close this gate.                             | 2026-08-21T20:38Z |
| `NC-20260821-002` | Replace the broken repetitive daily Sales follow-up task with one policy-led, evidence-backed process across active leads, unsigned Plutio proposals, and unpaid invoices                              | Codex                              | `codex/nc-20260821-002-followup-process` @ deployed `6b9b5f27` (isolated worktree)                                                             | `complete`            | C3    | The exact live `task-followup-daily` row remains paused. Exact release `6b9b5f27`, policy `2026-08-21.2`, and empty/admin-only migrations 130-131 are live. The authority now makes a named-human rejection terminal for the exact Sales case and requires a separately wired, read-back-verified canonical `lost` transition; silence or expiry cannot regenerate an identical daily card. The correction remains intentionally dark: no source adapter, backlog import, presentation, decision consumer, case/pipeline mutation, draft, approval, Plutio/payment action, scheduler, or customer send was activated.                                                                                                                                                                                                                                                                                                                                                                      | Strategic Company OS checkpoint with the operator. If the outcome focus is confirmed, create a new task for read-only source shadow and operator-reviewed backlog disposition; keep customer-action activation as a later natural-canary gate.                                                                                                                          | 2026-08-21T17:00Z |
| `NC-20260821-001` | Make each actionable Company OS exception packet prove durable Chief pickup and one bounded resolution attempt instead of disappearing after notification delivery                                     | Codex                              | `codex/nc-20260821-001-exception-attempt-receipts` @ deployed `f6089cce` (isolated worktree)                                                   | `complete`            | C3    | Exact migration 129 remains live. A natural post-startup exception cycle posted three source-bound packets; all three were durably posted, picked up, attempted successfully, and receipted, with zero failed attempts. Protected Company Work core aggregates and customer-email state were unchanged. These receipts prove backend ownership and a bounded attempt, not source correction or business resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None for the pickup/attempt milestone. Observe source-level correction and detector-verified closure separately; do not treat an attempt receipt as resolution.                                                                                                                                                                                                         | 2026-08-21T17:00Z |
| `NC-20260820-009` | Activate exactly one complete outcome-review packet for the existing named Chief operator without Gmail search, bulk backfill, or customer action                                                      | Codex                              | `codex/nc-20260820-009-outcome-review-activation` @ deployed `288105cb` (isolated worktree)                                                    | `complete`            | C3    | Exact release `288105cb` and migration 128 are live on PID 78177. Startup reconciled the sole configured operator's already-present exact-packet 👍 (`+1`) as one explicit `clean` assessment: packet #1 is decided, quality receipt #1 and its actor/evidence bindings exist, all four packet lifecycle events exist once, and one Chief-owned bot acknowledgment is bound to the original thread. There is still exactly one packet. Work items remain 22/version sum 117 with 139 events and 63 receipts; none was appended after activation. SQLite email actions/events are byte-row-identical to the stopped backup, and the outcome path created no Gmail read/search, email/customer action, remediation, work mutation, second packet, or outcome-review agent run. Two startup Chief runs came from the separately established exception brief/work-packet loop, not the review decision/ack.                                                                                    | None.                                                                                                                                                                                                                                                                                                                                                                   | 2026-08-21T12:13Z |
| `NC-20260820-008` | Deliver one exact, durable operator-review packet for each eligible Sales-email outcome and turn only a named operator's explicit reaction into the existing append-only quality assessment            | Codex                              | `codex/nc-20260820-008-outcome-review` @ deployed `6f40b1da` (isolated worktree)                                                               | `complete`            | C3    | Exact release `6f40b1da` and migration 127 are live on PID 69300 under Node 22.23.2. Outcome review is dark: disabled, zero configured operators, zero runs/packets/events/quality receipts, no attempt or error, and empty queues. The schema has admin-only ownership, zero non-admin grants/forbidden content columns, and the expected constraints/indexes/triggers. Protected Company Work and exception counts/fingerprints match before/after; SQLite remains healthy at 88 actions/435 events with zero active actions. No raw content/identity entered PostgreSQL and no Gmail search/read, model classification, default-clean/backfill, packet, assessment, customer message, remediation, workflow mutation, or action occurred.                                                                                                                                                                                                                                               | None for this dark-deployment milestone.                                                                                                                                                                                                                                                                                                                                | 2026-08-21T01:32Z |
| `NC-20260820-007` | Add a default-off, host-only assessment producer that turns one exact operator-reviewed evidence package into one review-bound outcome-quality receipt without Gmail/Slack reads or inferred outcomes  | Codex                              | `codex/nc-20260820-007-outcome-assessment` @ deployed `265622bd` (implementation `343ae193`; isolated worktree)                                | `complete`            | C2    | Exact release `265622bd` is live on launchd/listener PID 63259 under Node 22.23.2. The standalone command defaults to dry-run, is absent from daemon/IPC/scheduler/container composition, and requires exact host/release/plan/task confirmation for one apply. Live empty/default and unconfirmed-apply invocations refuse before database access; the aggregate reader remains 15 accepted/13 completed and 0/13 quality coverage. Pre/post work-item/event/receipt, exception-brief/event, and quality-receipt fingerprints are identical; the ordinary startup loop refreshed only the active case projection's `last_seen_at`, with zero opened/reopened/resolved cases or new lifecycle events. SQLite stays 88 actions/435 events with zero active actions and `quick_check=ok`; Gmail/Slack are connected and queues are empty. No assessment receipt, Gmail/Slack/content read, message, remediation, agent/classifier, bulk/default-clean/backfill, or external action occurred. | None for this deployment milestone. A first real assessment requires a separately supplied operator-reviewed evidence package and explicit apply authorization; do not backfill the 13 missing outcomes.                                                                                                                                                                | 2026-08-21T00:14Z |
| `NC-20260820-006` | Define and deploy a canonical, privacy-minimized customer-visible outcome-quality receipt so the third Sales service indicator cannot confuse missing review coverage with zero defects                | Codex                              | `codex/nc-20260820-006-outcome-quality` @ deployed `09bc2408` (implementation `c461e11e`; isolated worktree)                                   | `complete`            | C2    | Exact release `09bc2408` is live on launchd/listener PID 82117 under Node 22.23.2. Migration 126 is live with 17 constraints, six indexes, two enabled triggers, admin ownership, zero non-admin grants/forbidden content columns, and zero receipts. Contract-version-2 staged and active reads preserve 15 accepted/13 completed and show 13 exact customer-visible outcomes, 0 assessed, 13 missing, so the adverse rate is truthfully unavailable. Existing Company Work counts/fingerprints and SQLite 87 actions/430 events are unchanged; Gmail/Slack are connected and queues are empty. No producer/write CLI, customer content/identity, agent grant, classifier, Gmail/Slack read, message, remediation, threshold/SLO, approval, or action authority was added.                                                                                                                                                                                                                | None for this dark-contract milestone. A separately tracked, default-off assessment workflow remains the successor; it must not backfill 13 clean outcomes or infer adverse outcomes from internal exceptions.                                                                                                                                                          | 2026-08-20T20:17Z |
| `NC-20260820-005` | Establish a truthful read-only Mailman/Sales service-indicator baseline from the durable Company Work ledger without inventing customer-defect evidence                                                | Codex                              | `codex/nc-20260820-005-service-indicators` @ deployed `a02abaca` (implementation `b71bfae2`; isolated worktree)                                | `complete`            | C2    | Exact release `a02abaca` is live on PID 10617 under Node 22.23.2. The active aggregate-only 30-day read reports 15 accepted, 13 outcome-validated, 2 incomplete, 86.67% completion, p50 29m01.725s, p95 6h16m18.994s, and max 9h25m12.618s. Customer-visible defect/reversal remains explicitly unavailable because no canonical receipt exists; internal failures are not a proxy. Pre/post Company Work and exception fingerprints are identical. Gmail/Slack are connected; one listener, zero containers/waiters/outgoing Slack/active email actions, unchanged SQLite 87 actions/430 events, `quick_check=ok`, and no post-marker WARN/ERROR/FATAL headlines are verified. No content/identifier output, message, email, workflow, schema, schedule, threshold/SLO, prompt, approval, or action authority was added.                                                                                                                                                                  | None for this baseline milestone. Design the canonical customer-visible defect/reversal receipt and its privacy/authority boundary as a separately tracked task before measuring or setting an objective; do not infer it from the two incomplete internal items.                                                                                                       | 2026-08-20T19:44Z |
| `NC-20260820-004` | Attach the contact form's already-captured entry-page context to the inbound packet so Inbox and Sales can understand ambiguous questions without a manual search or an unnecessary clarification hop  | Codex                              | `codex/nc-20260820-004-contact-context` @ deployed `eb5fbaa1`; Tandem website `bdf8fd9b3`                                                      | `deployed_unverified` | C2    | Exact website commit `bdf8fd9b3`, active n8n workflow 1, and immutable NanoClaw release `eb5fbaa1` now carry the privacy-reduced entry page through existing ingress and handoff paths. PID 2211 is healthy on Node 22.23.2 with connected Gmail/Slack, exact operational prompt/webhook hashes, one listener, and empty runtime/email queues. Context remains untrusted and non-authoritative; missing/invalid input fails open. No Chaos lookup, new tracking, schema mutation, synthetic contact, customer email, approval, or send authority was added.                                                                                                                                                                                                                                                                                                                                                                                                                                | Observe the next genuine contact submission. Require the bounded entry page to reach Inbox and Sales when available, or fail open when absent, with no Chaos search and no unnecessary clarification hop. Do not manufacture a lead for proof.                                                                                                                          | 2026-08-20T19:19Z |
| `NC-20260820-003` | Make every actionable Company OS email work item hydrate the exact original Gmail message/thread for Chief without mailbox search or guessed context                                                   | Codex                              | `codex/nc-20260820-003-source-bound-work` @ deployed `bab154cb` (implementation `8543c1b8`; isolated worktree)                                 | `deployed_unverified` | C2    | Exact release `bab154cb` is live on PID 73082 under Node 22.23.2 after a natural Procurement drain, WAL-safe SQLite/plist backup, verified three-path launchd activation, and additive source-message migration. Gmail/Slack are connected; runtime, Slack, and active-email queues are empty; protected PostgreSQL aggregates remain 21 work items, 7 cases, and 6 posted briefs. The operational Chief prompt preserves its newer grader safety rule while adding the reviewed Company OS packet contract. Startup correctly returned `duplicate_brief` for today's existing brief 10, so no packet or customer email was manufactured.                                                                                                                                                                                                                                                                                                                                                  | Await the next natural new/change-fingerprint Company OS brief and verify one tracked work packet wakes Chief with exact bounded source context; for an email-backed item, require no search and at most one exact read only if truncated. Do not manufacture work or send customer email for proof.                                                                    | 2026-08-20T18:21Z |
| `NC-20260820-002` | Turn deterministic program-facts drift from a notify-only Slack warning into one durable, deduplicated, owner-visible Company Work exception that can be evidence-resolved and detector-verified       | Codex                              | `codex/nc-20260820-002-program-facts-work` @ deployed implementation `8344524c` (isolated worktree)                                            | `deployed_unverified` | C2    | Exact release `8344524c` is live on PID 38712 under Node 22.23.2 after a zero-work drain, secured affected-schema backup, migration 125, compiled-job cutover, and active-mode enablement. One direct detector canary opened stable item 21 and one Sales alert; the recurring Chief loop opened its exact owner-review case and posted brief 10. A second run through Campanero's real host scheduler added observation 2 without a duplicate Sales alert. Automatic facts, knowledge, products, website, email, action, push, or merge remain excluded.                                                                                                                                                                                                                                                                                                                                                                                                                                  | The owner must decide which program-fact source is authoritative and correct the conflicting sources under a separate authorized knowledge/fact change. Then run the exact installed detector through the host scheduler: require a clean receipt, item 21 completed, and its exact exception case source-resolved. Also observe the next natural 08:00 CT run.         | 2026-08-20T16:03Z |
| `NC-20260818-003` | Make natural inbound Gmail history expiry freeze the exact prior cursor in both runtime and the generic Company OS watermark without recovering or advancing across the gap                            | Codex                              | `codex/nc-20260818-003-gmail-gap-freeze` @ deployed `64f1421e`                                                                                 | `deployed_unverified` | C2    | Exact repair release `64f1421e` is live on fresh PID 10482 after copied-live-database proof, zero-work drain, and fresh dual backup. The live SQLite migration preserved all 136 pre-cutover receipt rows/fingerprint, widened only the reason constraint, retained both executable append-only triggers, and passed `quick_check`. A natural Gmail push retried the stalled range, durably recorded exactly two `rejected/message_unavailable` receipts, and advanced both equal/current cursors; two subsequent natural advances leave source version 5/current with no open gap. Gmail message, email action/event, Company Work item/event/receipt, task, group, and occurrence fingerprints are unchanged; two classifications and four other terminal receipts are attributable ambient inbound processing. Gmail/Slack remain connected with empty queues and the error log is unchanged since 2026-08-15.                                                                          | Keep the exact active bridge and observe one natural `users.history.list` expiry. It must record one `history_expired` gap with both cursors frozen and stop before another Gmail call; do not manufacture expiry, skip a cursor, or claim recovery.                                                                                                                    | 2026-08-18T20:49Z |
| `NC-20260818-002` | Prove one bounded gap-independent live read-only Gmail mailbox shadow without manufacturing a gap or changing current ingestion                                                                        | Codex                              | `codex/nc-20260818-002-gmail-live-shadow` @ installed `2328c7e1` from `fb1cfd20`                                                               | `complete`            | C2    | Exact candidate `2328c7e1` is independently verified and installed read-only beside the active daemon without activation. After a zero-work gate and complete mode-0600 `business_v2` backup, migration 124 was applied empty/admin-only and one resumable live audit reached the terminal page: 171 pages / 85,076 IDs = 67 accepted + 39 rejected + 84,970 unknown, with no retained token. Exact pre/post source/event/state (1/1/1, version 1/current), migration-123 (0/0/0), Company Work/occurrence fingerprints, SQLite cursor/messages/receipts/email actions, and service PID/release/channels are unchanged. PID 47982 remains on verified `dc3e5f0d`. No content read, Gmail/SQLite/generic-watermark mutation, gap/404, recovery/routing, daemon wiring/restart, work/task/action authority, external message, push, or merge occurred.                                                                                                                                       | None for this milestone. The next separately tracked gate is natural-404 recovery wiring; it must preserve the honest 84,970 unknowns and may not advance a cursor or recover work without exact accepted/rejected evidence.                                                                                                                                            | 2026-08-18T17:49Z |
| `NC-20260818-001` | Register and bootstrap exactly one inbound Gmail trigger source from the existing durable SQLite cursor without calling Gmail or wiring recovery                                                       | Codex                              | `codex/nc-20260818-001-gmail-source-bootstrap` @ installed `1b70de94` from `dd992537`                                                          | `complete`            | C2    | Exact release `1b70de94` is independently verified and installed read-only beside the active daemon but not activated. After a natural zero-work drain and a complete unfiltered `business_v2` mode-0600 backup, one transaction registered exactly `mailbox:primary:inbound-v1` and its zero-count bootstrap; immediate exact replay was duplicate-only. Production source/event/state counts are 1/1/1 with version 1/current, the SQLite cursor fingerprint is unchanged, migration-123 shadow counts remain 0/0/0, and protected Company Work/occurrence fingerprints are unchanged. PID 47982 remains on verified `dc3e5f0d` with connected Gmail/Slack and empty queues. No Gmail API/profile/list/read, SQLite write, daemon activation/restart/import, shadow row, 404/gap/reconciliation behavior, recovered message, task/work/action authority, external message, push, or merge.                                                                                               | None for this milestone. Start a separately tracked bounded live read-only shadow; do not wire 404 recovery or cursor authority as part of this task.                                                                                                                                                                                                                   | 2026-08-18T13:28Z |
| `NC-20260817-013` | Apply migration 123 as an empty, admin-only Gmail reconciliation-shadow schema without activating any source, Gmail read, shadow producer, recovery path, or cursor authority                          | Codex                              | `codex/nc-20260817-013-gmail-shadow-schema` @ production schema milestone                                                                      | `complete`            | C2    | Exact live-release migration 123 was applied after branch convergence, a natural zero-work drain, and a verified mode-0600 custom-format PostgreSQL backup. All three target tables are empty, owned by `nanoclaw_admin`, expose zero non-admin grants and zero forbidden content/action columns, and retain the expected constraints, six indexes, and two append-only triggers. Protected PostgreSQL fingerprints are unchanged; the exact service/release/channels were not restarted or changed. One ambient `own_outbound` Gmail receipt arrived during post-check while Gmail messages and email actions/events stayed fixed. No source/bootstrap, Gmail API call, shadow row, 404/cursor change, recovery, task/work/action authority, message, push, or merge.                                                                                                                                                                                                                     | None for this dark-schema milestone. Start a separately tracked source registration/bootstrap gate; do not call Gmail, create shadow rows, or change 404/cursor authority under NC-013.                                                                                                                                                                                 | 2026-08-18T04:38Z |
| `NC-20260817-012` | Deploy the exact NC-011 Slack raster-vision release with no stale-container adoption, then prove channel health and the new read-only mount without posting a Slack canary                             | Codex                              | `codex/nc-20260817-012-slack-image-release` @ deployed `dc3e5f0d`                                                                              | `complete`            | C2    | Exact verified release `dc3e5f0d` is live under Node 22.23.2 with matching code root, one fresh listener, connected Gmail/Slack, empty outgoing Slack queue, and retained rollback to `263ac7c4`. A zero-container drain preceded activation. The reviewed global prompt was privately backed up and atomically installed with matching release hash. Owner-only host paths and a disposable container proved `/workspace/ipc/inbound` readable but not writable; the canary was removed. Two later natural Sales/Mailman containers independently exposed per-group `ro` inbound mounts. NC-012 caused no operator screenshot export, Slack post/replay, customer message, Gmail action, database/schema mutation, OAuth change, task/action authority, push, or merge.                                                                                                                                                                                                                   | None for this deployment/mount milestone. A fresh user-resubmitted screenshot is the remaining natural business-path proof for NC-011.                                                                                                                                                                                                                                  | 2026-08-18T02:54Z |
| `NC-20260817-011` | Let image-capable minions inspect supported Slack screenshots instead of discarding the pixels and asking the operator to transcribe them                                                              | Codex                              | `codex/nc-20260817-011-slack-image-vision` @ deployed via `dc3e5f0d`                                                                           | `deployed_unverified` | C2    | The committed signature-validated 10 MB PNG/JPEG/GIF/WebP staging, opaque/private atomic paths, 30-day derived-copy retention, explicit failure notes, read-only group mount, exact-path `Read` instruction, and untrusted-image boundary are deployed and service/mount verified. Root Node 22 typecheck/build, 157 affected tests, runner build/43 tests, and 2,673/2,674 unrestricted root tests pass; the sole CNPC failure is reproduced unchanged at base. The operator screenshot was not exported or replayed, so actual image interpretation remains intentionally unclaimed.                                                                                                                                                                                                                                                                                                                                                                                                     | Resubmit one screenshot naturally in Slack and require the addressed image-capable minion to use the attachment without requesting transcription; do not manufacture or replay operator content.                                                                                                                                                                        | 2026-08-18T02:54Z |
| `NC-20260817-010` | Quantify historical inbound-Gmail disposition coverage without reading content, inventing evidence, or changing production state                                                                       | Codex                              | `codex/nc-20260817-010-gmail-historical-coverage` @ `6bc9da26`                                                                                 | `complete`            | C2    | Default-off retained-host auditor and exact private audit artifact are verified. One aggregate-only production dry run closed all 3,041 retained IDs: 23 terminal receipts, 1,675 recoverable, and 1,343 unknown (36 unresolved direct routes, 517 outbound without receipts, 790 unsupported inbound). Pre/post protected-state fingerprint `2935c191…` is identical across Gmail rows, receipts, cursor state, pending sends, classifications, and absent migration-123 tables. `mailboxComplete=false` and `gmailQueried=false`; live release `dc3e5f0d`, service, listener, and channels were unchanged. Focused 47/47, typecheck/build, email-critical 704/704, runner 43/43, continuity, and exact bundle verification pass; unrestricted baseline is 2,678/2,679 with only the unchanged CNPC wrapper assertion failing. No Gmail call, database/cursor/receipt/source/shadow/work/action write, deployment, push, or merge.                                                        | None for NC-010. The 1,343 unknowns remain non-authoritative; start a separately tracked migration-123 dark-schema gate before source/bootstrap or any live Gmail shadow.                                                                                                                                                                                               | 2026-08-18T03:44Z |
| `NC-20260817-009` | Activate the durable Gmail disposition-receipt producer with an exact immutable release, recovery-safe SQLite backup, and natural no-send proof                                                        | Codex                              | `codex/nc-20260817-009-gmail-receipt-activation` @ deployed `263ac7c4`                                                                         | `complete`            | C2    | Exact release `263ac7c4` is live after clean build/extraction, a drained WAL-safe mode-0600 SQLite backup, and recovery-safe activation retaining rollback to `de815e1d`. The additive receipt table and two append-only triggers, SQLite integrity, Node 22.23.2 release identity, one listener, and Gmail/Slack health are verified. Natural aggregate-only proof contains 18 receipts with 18 distinct message IDs and fingerprints: three ordinary inbound persists, ten completed rule auto-archives, and five own-outbound rejections. All three persisted receipts have matching message rows. The current process completed 67 push/safety cycles with zero receipt, processing, safety-poll, or cursor-hold failures; two recent one-candidate scans each added one message and advanced monotonically. No synthetic traffic, historical backfill, migration 123, source/bootstrap, live shadow, 404/cursor-authority change, push, or merge occurred.                            | None for this milestone. Start a separately tracked read-only historical-coverage dry run that quantifies unknown IDs without inventing dispositions; migration 123, source bootstrap, live shadow, and 404 handling remain later gates.                                                                                                                                | 2026-08-18T02:07Z |
| `NC-20260817-008` | Make every newly observed inbound Gmail candidate end in one durable content-free accepted/rejected receipt or hold the history cursor for retry                                                       | Codex                              | `codex/nc-20260817-008-gmail-disposition-receipts` @ `77dda13d` (local implementation from deployed `de815e1d`)                                | `complete`            | C2    | Append-only SQLite disposition contract/store; exact replay/conflict and privacy controls; all current Gmail terminals mapped; ordinary-row and routed-marker retry bridge; cursor hold on unknown/failure or non-terminal page 20; read-only reconciliation lookup; 143 focused, 405 Company OS/Gmail, and 685 email-critical tests green. Local only: no production schema/data, Gmail call, runtime deploy, migration 123, source row, message/action, push, or merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None for this local milestone. Production SQLite backup/schema creation, deployment and natural receipt proof, historical unknown accounting, migration 123, source bootstrap, and any live Gmail shadow require separately tracked promotion gates.                                                                                                                    | 2026-08-17T22:38Z |
| `NC-20260817-007` | Deploy the exact NC-006 Gmail reconciliation-shadow release dark while leaving migration 123 unapplied and every Gmail/source/runtime path unchanged                                                   | Codex                              | `codex/nc-20260817-007-gmail-shadow-dark-deploy` @ deployed `de815e1d`                                                                         | `complete`            | C2    | Exact release `de815e1d` is live with the NC-006 bytes installed but unwired. Migration 123 remains absent; no source registration/bootstrap, live Gmail read, shadow row, 404 interception, cursor, task, action, message, push, or merge occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | None for this deployment milestone. Durable real candidate-disposition receipts are the next local prerequisite; migration 123 application, source bootstrap, live read-only shadow proof, and any 404/cursor authority remain separate later gates.                                                                                                                    | 2026-08-17T22:04Z |
| `NC-20260817-006` | Add the durable, resumable, read-only shadow foundation needed to prove large inbound Gmail gap snapshots without changing production ingestion                                                        | Codex                              | `codex/nc-20260817-006-gmail-reconciliation-shadow` @ `67870546` (local implementation)                                                        | `complete`            | C2    | Committed exact read-only Google list/profile wrapper; content-free resumable snapshot/candidate receipt contract and unapplied schema/store; synthetic and disposable-PostgreSQL proof. No production source registration, cursor, 404 interception, message read/recovery, task, agent, action, send, deploy, push, or merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for this local milestone. Durable real disposition receipts, dark migration/source bootstrap, bounded live read-only shadow proof, and any runtime recovery or cursor authority require separately tracked gates.                                                                                                                                                  | 2026-08-17T20:21Z |
| `NC-20260817-005` | Add a dark, source-specific bounded reconciliation adapter for the inbound Gmail history-expiry gap without changing current ingestion                                                                 | Codex                              | `codex/nc-20260817-005-gmail-gap-reconciliation` @ `fc1fdb32` (local implementation)                                                           | `complete`            | C2    | Committed pure/injected inbound Gmail source, gap and capped full-snapshot reconciliation proposals; synthetic negative/positive tests; dedicated contract and Company OS continuity. No runtime import, source row, Google call, database/cursor write, message recovery, task, agent, or action. Label-poll remains separate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for this local milestone. Durable candidate receipts, large-mailbox resumability, a real read-only Google wrapper, production source registration/bootstrap, shadow proof, cursor/runtime wiring, watermark-age attention, and label-poll recovery require separate tracked gates.                                                                                 | 2026-08-17T19:26Z |
| `NC-20260817-004` | Apply migration 122 and deploy the trigger-source/watermark foundation dark with no source rows, adapter wiring, or task/action authority                                                              | Codex                              | `codex/nc-20260817-004-trigger-source-dark-deploy` @ deployed `070cde38`                                                                       | `complete`            | C2    | Exact release `070cde38` is live after a prolonged natural drain, mode-0600 backup, one-file migration 122, structural/permission verification, and recovery-safe activation. The three new tables remain empty/admin-only, no runtime entry point imports the store, and the prior occurrence plus schedule/job/channel definitions are unchanged. One ordinary approved email completed during the drain and is separately attributable to SQLite/Gmail receipts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None for this dark deployment milestone. Source registration, cursor bootstrap, Gmail bounded reconciliation, any adapter wiring, and every task create/resume or action authority require separate tracked gates.                                                                                                                                                      | 2026-08-17T18:17Z |
| `NC-20260817-003` | Add a durable Company OS trigger-source inventory and fail-closed watermark/reconciliation contract before any second source adapter                                                                   | Codex                              | `codex/nc-20260817-003-trigger-source-watermarks` @ `070e781a` (local implementation)                                                          | `complete`            | C2    | Committed local dark foundation: content-free immutable source registration, versioned cursor head, append-only checkpoint/gap history, compare-and-swap and replay/conflict semantics, migration/rollback/tests, and Company OS/project/data continuity. Existing Gmail, webhook, scheduler, topic, condition, group, daemon, production database/config, tasks, messages, and action paths remain read-only/unwired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None for this local milestone. Production migration, source registration, daemon wiring, a source-specific bounded recovery adapter, and any task/action authority require separately tracked gates.                                                                                                                                                                    | 2026-08-17T16:11Z |
| `NC-20260817-002` | Apply the normalized-trigger schema and live-prove one bounded, source-read-only scheduled-task occurrence observer without granting task or action authority                                          | Codex                              | `codex/nc-20260817-002-time-trigger-activation` @ deployed `baed66d`                                                                           | `complete`            | C2    | Migration 121 and exact release `baed66d` are live. A drained, disabled deployment produced zero rows; one exact existing task's natural `2026-08-17T14:00:00.000Z` claim then inserted one `time` occurrence at 14:00:11Z, and exact release-bound replay was duplicate-only. The one-boundary config was expired back to disabled with daemon health retaining 1 matched/1 applied/0 failures. No task was created/resumed and no prompt, agent, capability, approval, message, or action authority was granted. Ambient email/work-ledger changes and the existing exception loop's restart brief were separately attributed; no push or merge occurred.                                                                                                                                                                                                                                                                                                                                | None for this activation milestone. Other trigger families, loss-recovery watermarks, recurring definitions, or task create/resume authority require separate tracked gates.                                                                                                                                                                                            | 2026-08-17T14:04Z |
| `NC-20260817-001` | Establish one durable, replay-safe Company OS trigger-occurrence contract for time, Gmail, webhook, topic, and business-condition sources without wiring production behavior                           | Codex                              | `codex/nc-20260817-001-trigger-contract` @ `ec49ac68` (local implementation)                                                                   | `complete`            | C2    | Committed local dark foundation: a content-free normalized trigger type, stable definition/occurrence/fingerprint identities, exact replay/conflict semantics, additive unapplied migration 121 plus history-preserving rollback, injected host store, focused tests, and Company OS/project/data continuity. The daemon does not import the module. Production schema/data/config, schedules/channels/adapters, task creation/resume, agent/skill/prompt/capability changes, external messages/actions, push, and merge remain unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None for this local milestone. Production backup/migration, disabled-adapter deployment, source inventory/watermarks, one bounded source adapter, and any task create/resume authority require separately tracked activation work.                                                                                                                                      | 2026-08-17T12:17Z |
| `NC-20260816-018` | Give the two proven Company OS pilots one host-owned, deduplicated Chief-channel exception loop with named-operator acknowledgment and source-derived resolution                                       | Codex                              | `codex/nc-20260816-018-company-work-exception-loop` @ deployed `a2e6d35`                                                                       | `deployed_unverified` | C5    | Exact release `a2e6d35` is healthy on `mini-claw.local`; the dedicated config has one owner-confirmed operator and the one-use UID file was removed after redacted verification. The first bounded run posted one durably bound Chief brief for three exact reasons on one naturally present exception. Alex's exact check reaction acknowledged all three current cases and the threaded receipt is durably posted. Source Company Work, email, job, task, and channel-definition fingerprints stayed unchanged; zero containers or queued work appeared.                                                                                                                                                                                                                                                                                                                                                                                                                                 | Passively observe a later complete report where an exact source reason disappears and require source-derived resolution with no workflow mutation. Do not manufacture or alter the source exception; R3 trigger normalization can proceed as a separate task.                                                                                                           | 2026-08-17T11:56Z |
| `NC-20260816-017` | Activate the Campanero host-job work-ledger pilot with bounded shadow projection and workflow-specific read-only reporting while leaving SQLite and the scheduler authoritative                        | Codex                              | `codex/nc-20260816-017-campanero-ledger-activation` @ deployed `999f2a4`                                                                       | `complete`            | C2    | Migration 119 and exact release `999f2a4` are live. One explicitly invoked five-run closed window produced exactly 5 items/15 events/5 receipts; exact replay was duplicate-only; the job report showed 5 completed/0 exceptions. All source/job/task/email hashes and channel/queue boundaries remained unchanged. SQLite and the scheduler remain authority; the observer is unscheduled/default-off. No job, schedule, prompt/capability, recurring message, push, or merge occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | None for this activation milestone. Recurring delivery, exception acknowledgment/resolution, scheduler-source normalization, or authority promotion require separate tasks and approval.                                                                                                                                                                                | 2026-08-17T01:55Z |
| `NC-20260816-016` | Establish Campanero host-job runs as the second Company OS work-ledger pilot without changing scheduler behavior or applying production schema                                                         | Codex                              | `codex/nc-20260816-016-campanero-ledger-shadow` @ `9fb0437`                                                                                    | `complete`            | C2    | Local-only migration 119/rollback, host-only typed job-run transitions, privacy-minimized injected projection, tests, and Company OS/data/project continuity are committed. SQLite remains authority; the migration/projector are unapplied and unwired. No job, schedule, Campanero prompt/capability, production data, service, deployment, or external-message state changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None for this local milestone. Production migration, a default-off bounded observer, historical/live parity proof, and workflow-specific report widening require a separate activation task and authority.                                                                                                                                                              | 2026-08-17T00:36Z |
| `NC-20260816-015` | Deploy the exact read-only Company OS exception brief and prove one bounded production read without changing workflow or email state                                                                   | Codex                              | `codex/nc-20260816-015-work-ledger-report-deploy` @ deployed `cf96258`                                                                         | `complete`            | C2    | Exact release `cf96258` is live with one listener, healthy Slack/Gmail, empty runtime/email queues, and the daemon-disconnected report. One bounded production read classified 3 completed items and one known critical stale source gap. Before/after fingerprints remained 4 work items, version sum 25, 29 events, 13 receipts, 61 confirmed/6 blocked email actions, and 334 email events. No task-authored message or production-data write occurred; one later ambient Booking Slack output is not NC-015 evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None for this deployment/read-proof milestone. Recurring delivery, operator acknowledgment/resolution, workflow authority, and a second pilot process require separate tasks and authority.                                                                                                                                                                             | 2026-08-16T23:58Z |
| `NC-20260816-014` | Turn the Mailman/Sales shadow ledger into a read-only reconciliation and compact exception brief without changing email behavior                                                                       | Codex                              | `codex/nc-20260816-014-work-ledger-exceptions` @ `7ee3f67` from deployed `02ce48f`                                                             | `complete`            | C2    | Existing host-only Company OS ledger projection, metadata-only exception classification/reporting, focused tests, and ledger/project/roadmap continuity. Excludes Sales scheduled-task continuation files, agent prompts, email approval/draft/send/retry/closure behavior, production writes, deployment, Slack/Gmail posts, push, and merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | None for this local milestone. Deployment, production read proof, recurring Slack delivery, operator resolution, or workflow dependency require separate tasks and authority.                                                                                                                                                                                           | 2026-08-16T23:29Z |
| `NC-20260816-013` | Cut canceled/rescheduled Booking activity over to the durable host Plutio boundary and remove raw Plutio access from the Booking container                                                             | Codex                              | `codex/nc-20260816-013-booking-plutio-cutover` @ deployed `02ce48f`                                                                            | `deployed_unverified` | C5    | Booking is constrained to `business_db`; direct Plutio/toolbox mounts and credentials are absent. The authorized canary created inbox `4469`, party `11333`, interaction `3034`, two Booking notices, party-sync row `1311`, and activity row `1312`, exposing and containing scheduled-task exit, receipt-cast, and mutable-checkout launcher defects. Exact release `02ce48f` is healthy with all three repaired. The real scheduled launcher replayed only row `1312` to terminal `already_recorded` with durable receipts and no second activity; the authorized duplicate webhook returned 200 with stable counts.                                                                                                                                                                                                                                                                                                                                                                    | Observe the next fresh natural canceled/rescheduled event and require one agent turn, one Booking notice, automatic durable enqueue/receipt, and no operator recovery. No synthetic distinct webhook, email, or Trafft mutation is authorized.                                                                                                                          | 2026-08-16T22:55Z |
| `NC-20260816-012` | Repair shared Trafft reschedule identity and empirically prove the dark Booking host adapter's remote Plutio replay marker before any cutover                                                          | Codex                              | `codex/nc-20260816-012-booking-plutio-marker` @ deployed `13ca192`                                                                             | `complete`            | C5    | Shared reschedule identity and the visible digest marker are live. The retained synthetic note contains the original negative entry plus the authorized correction, exactly one visible marker, and immediate replay returned `already_recorded` without a second corrective write. Natural ingress/outbox, Booking prompt/manifest/mount, credential removal/rotation, Trafft, production DB, customer/Slack, push, and merge remained excluded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None; this prerequisite milestone is complete.                                                                                                                                                                                                                                                                                                                          | 2026-08-16T21:24Z |
| `NC-20260816-011` | Build and deploy the dark host-owned Booking-to-Plutio lifecycle adapter without invoking Plutio or changing Booking's current capability                                                              | Codex                              | `codex/nc-20260816-011-booking-plutio-host` @ deployed `63ed4aa`                                                                               | `complete`            | C5    | Exact release `63ed4aa` contains the typed archived-event parser, opaque durable outbox path, host-derived dispatch, action-safety enforcement, replay marker/receipt, and Booking-only stale reclaim. The installed injected canary proves first pass, replay, and booked-event denial with zero DB/child/network calls; live email/task/Plutio aggregates are unchanged and Booking-specific outbox rows remain zero. Natural ingress, the Booking prompt/manifest, and container Plutio access are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None for this dark milestone. Next separately fix/canary shared reschedule identity, prove remote marker persistence on an authorized business-path canary, wire ingress, then remove Booking's Plutio credential/mount only if those gates pass.                                                                                                                       | 2026-08-16T20:49Z |
| `NC-20260816-010` | Remove raw Trafft credentials from an enforced Booking container while preserving the separately identified legacy Plutio path                                                                         | Codex                              | `codex/nc-20260816-010-booking-credential-boundary` @ deployed `ba5fe74`                                                                       | `complete`            | C5    | Exact release `ba5fe74` projects declared credential families and selectively enforces Campanero plus Booking. The installed no-network verifier proved all three configured Trafft names absent from Booking and the required DB/Plutio names present. The discovered non-booked-event Plutio path remains explicitly declared until a host-owned replacement is proven. No external or business-row write occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for this milestone. Next replace Booking's non-booked Plutio path with a host-owned adapter, then separately gate Plutio credential removal; destination-scoped egress remains a later control.                                                                                                                                                                    | 2026-08-16T20:06Z |
| `NC-20260816-009` | Extend the common external-write brake to the Things HTTP bridge without creating a real to-do                                                                                                         | Codex                              | `codex/nc-20260816-009-things-safety` @ deployed `47019c9`                                                                                     | `complete`            | C5    | Exact release `47019c9` denies the host Things `/add-todo` POST before fetch; the Slack-facing caller returns false/no success reaction; the live bundled drill returned all eight denials with no tripwire, exact config restoration, and unchanged aggregates. Excludes any real Things task, Slack message/reaction, bridge credential/config change, other integration coverage, envelope enforcement, push, and merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None for this milestone. Next extend the controller to a non-overlapping container-exposed write boundary or add separately gated ceilings/demotion.                                                                                                                                                                                                                    | 2026-08-16T19:40Z |
| `NC-20260816-008` | Extend the common external-write brake to Hive/Firestore without consuming retry budget or performing a real write                                                                                     | Codex                              | `codex/nc-20260816-008-hive-safety` @ deployed `d32fda08`                                                                                      | `complete`            | C5    | Exact release `d32fda08` denies Hive composite/direct mutations before Firebase initialization; inline work remains retryable; reaper denial is held without attempt/dead-letter/alert; live bundled drill returned all seven denials with no tripwire, exact config restoration, and unchanged aggregates. Excludes any real external write, classification/schema change, Chaos overlap, other integration coverage, envelope enforcement, push, and merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None for this milestone. Next extend the controller to Things or a container-exposed write boundary without overlapping active Chaos work.                                                                                                                                                                                                                              | 2026-08-16T19:14Z |
| `NC-20260816-007` | Deploy and live-drill the common external-write safety brake without performing an external write                                                                                                      | Codex                              | `codex/nc-20260816-007-action-safety-drill` @ deployed `ab2ace1`                                                                               | `complete`            | C5    | Exact release `ab2ace1` live-verifies the dry-run-first, hostname-confirmed, backup-producing global safe-mode transaction across actual Gmail send/reply, Slack, Courses SMTP projection, Plutio, and Stripe boundaries. All six calls denied before invocation; config restored byte-for-byte; queues, jobs/tasks, email evidence, and Plutio/Chaos outboxes remained unchanged. Excludes envelope enforcement, real external writes, other-system coverage, ceilings/demotion, push, and merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None for this milestone. Extend coverage to standalone and remaining integration surfaces, then add ceilings/demotion as separately gated Company OS slices.                                                                                                                                                                                                            | 2026-08-16T18:19Z |
| `NC-20260816-006` | Deploy the capability-manifest release dark, then activate and prove one low-risk Campanero canary without exposing any other agent                                                                    | Codex                              | `codex/nc-20260816-006-campanero-canary` @ deployed `2987070`                                                                                  | `complete`            | C5    | Combined immutable release preserves live Stripe lineage `a67e081`; global manifest enforcement remains off; only Campanero is selected and live-verified with no Claude tools, only the `jobs` MCP tool, read-only declared mounts, and a read-only 22-job inventory canary. Bash and undeclared MCP surfaces were absent. Zero active/waiting work, outgoing Slack queue, actionable email sends, or job/task mutations appeared. Excludes customer email, job mutation, production database writes, global/all-agent activation, prompt changes, publication/mainline merge, and push.                                                                                                                                                                                                                                                                                                                                                                                                  | None for this milestone. Any second agent, global activation, egress restriction, credential removal, or action-safety activation requires a separately tracked gate.                                                                                                                                                                                                   | 2026-08-16T17:31Z |
| `NC-20260816-005` | Make every authoritative Stripe purchase reach Chaos with a canonical product attribution, preserve one-row Checkout accounting, and repair the four unmapped lifecycle receipts                       | Codex + Claude Code owner/reviewer | `codex/nc-20260816-005-stripe-attribution` @ implementation `9f8f6a1` from exact live `55c97d5`                                                | `ready_for_deploy`    | C5    | Exact-live-lineage NanoClaw Stripe processor and Chaos lifecycle outbox; focused tests; historical correction of four already-received Chaos lifecycle rows only after reviewed mapping proof. Excludes Stripe charges/refunds, fulfillment, Encharge automation, customer messaging, and unrelated NanoClaw changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Build and independently verify the clean immutable release, preflight and activate it, then correct only the four proven historical rows with pre/post aggregate proof. The full suite baseline remains 2381/2382 because of one pre-existing unrelated CNPC prompt-contract failure.                                                                                   | 2026-08-16T17:14Z |
| `NC-20260816-004` | Establish tracked per-agent capability manifests and make stale warm/adopted containers ineligible for reuse without activating the control in production                                              | Codex                              | `codex/nc-20260816-004-capability-manifests` @ `72b21db` (local implementation)                                                                | `complete`            | C5    | Strict manifests for all 17 tracked operative groups; deterministic matrix; default-off launch/MCP/recognized-host-operation/mount/runtime projection; launch/sidecar fingerprints; and next-turn warm/adoption revocation. Existing domain controls remain cumulative. Excludes production config/deploy/restart, external writes, raw-secret extraction, egress enforcement, push, and merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for this local source milestone. Production activation requires a separate authorized drain/recycle and group-by-group negative, launch, revocation, and business-path canary task.                                                                                                                                                                                | 2026-08-16T16:20Z |
| `NC-20260816-002` | Add one host-owned action-envelope contract and a global/per-system external-write safe mode without activating or widening any live capability                                                        | Codex                              | `codex/nc-20260816-002-action-safety-control` @ `092b5b9` (local implementation)                                                               | `complete`            | C5    | Implement the dark contract/controller across the first drill systems: Gmail, Slack, Courses SMTP launch, Plutio runtime tools, and Stripe processing. Default behavior and all production configuration remain unchanged; other runtime/container/script writes remain explicit P0.3/P0.5 follow-ups.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None for this local milestone. Production activation and broader capability coverage require separately authorized tasks.                                                                                                                                                                                                                                               | 2026-08-16T15:09Z |
| `NC-20260816-001` | Apply the Company OS ledger schema in production and deploy a non-authoritative, default-off Mailman/Sales shadow projection                                                                           | Codex                              | `codex/nc-20260816-001-company-os-shadow` @ deployed `55c97d5`                                                                                 | `complete`            | C5    | Migration 118 is backed up, applied, minimized, append-only, and host-admin-only. Exact Node 22.23.2 release `55c97d5` is live with a bounded shadow since 2026-08-14: 4 eligible items reconcile as 3 completed plus 1 named source gap; the next pass was duplicate-only. SQLite stayed authoritative with 67 actions, 61 confirmed, 6 blocked, and zero actionable sends; Gmail/Slack stayed connected and no deployment send/post occurred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for this milestone. Any ledger authority, workflow dependency, wider history, or second-workflow projection requires a new separately authorized task.                                                                                                                                                                                                             | 2026-08-16T14:21Z |
| `NC-20260815-010` | Establish the first durable Company OS work-ledger foundation for the Mailman/Sales approved-email pilot without activating it in production                                                           | Codex                              | `codex/nc-20260815-010-company-os-ledger` @ `6e281f0` from `38810d3`                                                                           | `complete`            | C2    | Focused design/ADR, additive migration 118 plus history-preserving rollback, host-only typed state/receipt store, 16 focused tests, and data/project/roadmap authorities passed review through the separately authorized NC-20260816-001 activation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | None. Production application and non-authoritative shadow evidence are recorded under `NC-20260816-001`; promotion remains separate.                                                                                                                                                                                                                                    | 2026-08-16T14:21Z |
| `NC-20260815-007` | Reactivate the Company OS plan against the current NanoClaw baseline and make it the single strategic roadmap for separately gated implementation slices                                               | Codex                              | `codex/nc-20260815-007-company-os-reactivation` @ `b7bb65d` from `9e4977a`                                                                     | `complete`            | C1    | `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, this register, and `docs/ENGINEERING-CHANGELOG.md`; documentation and prioritization only; no source, schema, prompt, configuration, deployment, production, or external-system change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None — R0 is recovered and continuity-verified; subsequent slices use separate task IDs and isolated branches.                                                                                                                                                                                                                                                          | 2026-08-16T04:46Z |
| `NC-20260815-009` | Make the normal approved-email fallback executable and bind every operator-visible recipient header into the immutable action                                                                          | Codex                              | `codex/nc-20260815-009-email-fallback-headers` @ deployed lineage `12c2b049`                                                                   | `complete`            | C5    | Release/artifact/health/listener/drain evidence was followed by natural action `996a9d1c-e193-4fa3-9fe4-340a438e0f8d`: approval, fallback handoff, Mailman start, claim, Gmail confirmation, and exactly one original-thread closure completed without manual repair.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None. Keep the incident corpus release-blocking and continue normal receipt monitoring.                                                                                                                                                                                                                                                                                 | 2026-08-16T14:21Z |
| `NC-20260815-008` | Prove approved Sales-email delivery without customer traffic or manual operator rescue by reconciling the live lineage and gating releases on deterministic historical replay                          | Codex                              | `codex/nc-20260815-008-email-replay-gate` @ deployed lineage `cfcfaae`                                                                         | `complete`            | C5    | The replay gate is release-blocking; NC-20260815-009 repaired and deployed the two natural-path defects; natural action `996a9d1c-e193-4fa3-9fe4-340a438e0f8d` then reached an exact Gmail receipt and one original-thread closure without manual recovery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None. Preserve the incident corpus and email-critical gate in every descendant release.                                                                                                                                                                                                                                                                                 | 2026-08-16T14:21Z |
| `NC-20260812-001` | Give Chaos durable, account-aware purchase and refund events from both Stripe accounts without duplicating fulfillment or Encharge's native Stripe automation                                          | Codex + Claude Code owner/reviewer | `codex/chaos-lifecycle-release` @ `b4d85b2` (exact live lineage)                                                                               | `ready_for_deploy`    | C5    | Existing n8n Stripe ingress, canonicalized NanoClaw dual-account payment/refund processing, PII-free lifecycle outbox/reaper with chief dead-letter alerting, Chaos authenticated lifecycle ingestion, aggregate 7/30/90 reconciliation, focused tests, and release documentation. Excludes customer email/contact creation, customer messaging, and payment/refund action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Apply migration 117, update the live n8n workflow from a private backup, configure default-off secrets/coverage start, build and deploy one immutable artifact, then prove aggregate receipts before enabling the producer. Encharge and Heartbeat producers remain separate subsequent slices.                                                                         | 2026-08-13T03:05Z |
| `NC-20260811-002` | Restore daily Sales lead follow-ups by keeping exact scheduled-task Gmail and approval-card continuations alive with host-validated completion                                                         | Codex                              | `codex/nc-20260811-002-sales-followup-continuation` @ `a33bed1`                                                                                | `in_progress`         | C5    | Exact Gmail delivery, runner drain-before-close, and final-state completion validation are live; the bounded recovery posted all five cards without sending email, then exposed that rejected cards return asynchronously while accepted cards receive no exact-container acknowledgement, leaving the task unable to emit its receipt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Return `[approval_card ACCEPTED]` to the exact originating container after Slack persists the reviewed card, validate focused/broad/release gates, deploy one superseding immutable release with the reviewed Sales workflow, and prove the callback/receipt contract without duplicating Lead #472 or sending customer email                                           | 2026-08-11T22:04Z |
| `NC-20260811-001` | Allow Sales to use an exact human-authorized commercial term in the same work thread without weakening the global invented-discount guard                                                              | Codex                              | `codex/nc-20260811-001-human-commercial-terms` @ `194f848`                                                                                     | `ready_for_deploy`    | C5    | Exact-thread human authorization for numeric commercial terms; approval-card and final Gmail guard parity; reply-scoped Gmail participant alias proof; focused adversarial tests; immutable release and live outcome verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Commit the reviewed implementation, build and independently verify one immutable release, deploy only after active work drains, then prove the natural Tom approval-to-Gmail path                                                                                                                                                                                       | 2026-08-11T20:12Z |
| `NC-20260810-002` | Automate CNPC intake, deterministic eligibility/pricing, capacity-bounded coach matching, and approval-gated follow-through                                                                            | Codex                              | `codex/cnpc-intake-release` @ `0b35539`                                                                                                        | `validating`          | C5    | Public Gravity Forms-to-n8n authentication and allowlist normalization; private durable NanoClaw intake; canonical coach/capacity ledger; host-bounded matching; `#gru-cnpc`; external email, Plutio, capacity commitment, and ready-to-begin actions remain disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Complete exact-lineage tests and immutable release; apply migration 116, register channel `C0BPG0408BW`, install a fresh private secret, deploy and verify health; then connect n8n and run a sanitized no-capacity canary                                                                                                                                              | 2026-08-11T02:40Z |
| `NC-20260809-004` | Make Sales responses request-first, relationship-aware, and able to abstain instead of forcing a program pitch                                                                                         | Codex implementer + Claude owner   | `codex/nc-20260809-004-sales-request-first` @ `4437ee3`                                                                                        | `ready_for_deploy`    | C5    | Request-first Sales authority; pre-inbound relationship evidence gate; seven response routes; transaction-only commercial material; no-draft escalation; non-binding website path; compatible autonomy marker; nine-case contract fixture; immutable release from exact live lineage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Build and deploy the isolated commit, verify exact release and prompt hashes on the Mini, and run a non-customer behavior canary; then observe blinded historical and natural-response outcomes before claiming response-quality validation                                                                                                                             | 2026-08-10T06:52Z |
| `NC-20260809-001` | Recalibrate Foundation grading while making student-visible AI/process traces a fail-closed release boundary                                                                                           | Codex + Claude validator           | `codex/grader-release-20260810-v3` @ `bc93125`                                                                                                 | `deployed_unverified` | C5    | Host-only output gate; current read-only Heartbeat assignment context; exact per-turn proof; raw final-text suppression; no automatic Heartbeat result-write path; immutable Mini release and installed-artifact canary verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep Heartbeat result posting manual and disabled; complete the scrubbed-corpus and blind human voice-panel work before claiming autonomous student-facing grading is fully validated                                                                                                                                                                                   | 2026-08-10T01:18Z |
| `NC-20260809-003` | Make Procurement a stable, observable opportunity-to-decision-to-proposal-ready system before adding sources                                                                                           | Codex + Claude owner               | `codex/nc-20260809-003-procurement-integration` @ `d583631` + R22 GO                                                                           | `ready_for_deploy`    | C5    | Migration 115 and immutable `d583631` are live but every collection/review gate remains off; shadow 1 proved the portal keeps a stale visible zero marker after Clear; R21/R22 approved the response-only-zero repair; exact Node 22.23.2 passes the complete 165-file / 2,219-test root suite and every release gate; Bonfire/container browsing is retired and proposals/source activation/submission remain off/manual                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Commit and deploy one superseding immutable release, then restart three consecutive 9/9 shadows under the replacement evidence gates before one receipt-bound live collection                                                                                                                                                                                           | 2026-08-10T04:59Z |
| `NC-20260806-001` | A host-rejected Sales approval card returns the exact failure to its originating agent session and cannot be reported as successfully posted                                                           | Codex + Claude validator           | `codex/nc-20260806-001-approval-rejection-loop` @ `aff14c8`                                                                                    | `ready_for_deploy`    | C5    | Recover Marina Lead #1047's rejected card without redrafting; return malformed, content-invalid, and overlong cards to the exact originating container; preserve work-thread isolation; prevent pure posted/awaiting-approval recaps without hiding blocked progress; extend the release gate and validate with Claude                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Commit and build the immutable release, rebuild and refresh the runner before host activation, copy the reviewed Sales instructions, activate and verify exact health, recycle only idle Sales containers, then run a non-customer exact-session rejection/repost canary                                                                                                | 2026-08-06T22:30Z |
| `NC-20260804-004` | Approved customer replies accept canonical Tandem booking, meeting, and payment links instead of failing on a stale content-guard whitelist                                                            | Codex + Claude validator           | `codex/nc-20260804-003-host-owned-email-bytes` @ `8ae6993`                                                                                     | `deployed_unverified` | C5    | Recover Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` exactly once; reconcile its Gmail receipt; audit canonical Sales link sources against the host whitelist; add narrow owned/transactional domains and adversarial lookalike tests; deploy the converged immutable release and verify its exact identity and guards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Observe the next natural approved email containing a canonical Sales link pass the normal approval-to-Gmail path; no synthetic customer send is needed                                                                                                                                                                                                                  | 2026-08-06T01:43Z |
| `NC-20260804-003` | Approved email bytes come only from host-owned approval state, never from Mailman's regenerated tool arguments                                                                                         | Codex + Claude validator           | `codex/nc-20260804-003-host-owned-email-bytes` @ `8ae6993`                                                                                     | `deployed_unverified` | C5    | Recover stranded approved actions exactly once; rehydrate every Mailman execution field; add exact scheduled-follow-up cards to the ledger; converge proposal follow-ups on one-time Gmail receipts; correct pre-Gmail status wording; pass focused/full tests and six Claude rounds; deploy immutable release; verify exact health and a live confirmed replay with no Gmail change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Observe the next natural approved customer email end to end through the normal Sales-to-Mailman watcher path; recovered sends and the live no-duplicate replay prove execution and replay mechanics but do not substitute for that business outcome                                                                                                                     | 2026-08-06T01:43Z |
| `NC-20260804-002` | Sales drafts use bounded relevant context and necessary database checks instead of rereading an oversized standard corpus on every handoff                                                             | unassigned                         | pending                                                                                                                                        | `planned`             | C3    | Profile Sales tool turns and canonical context dependencies; replace blanket 159k-character reads with measured targeted retrieval or a generated authoritative brief; preserve pricing, schedule, learned-correction, voice, approval, Entry ID, and threading safeguards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Design a representative replay/eval set, establish current latency/quality baselines, then test a bounded retrieval plan before changing the Sales prompt or runtime                                                                                                                                                                                                    | 2026-08-04T12:54Z |
| `NC-20260804-001` | Every accepted Sales work item immediately receives an in-thread host acknowledgment before model generation                                                                                           | Codex                              | `codex/nc-20260804-001-sales-generating-ack` @ `fa817a1`                                                                                       | `deployed_unverified` | C3    | Enforce Sales `processingMessage` at startup; guarantee the dispatch acknowledgment is attempted before enqueue and remains retryable after a channel failure; align the Sales prompt and shared runtime documentation; inspect generation timing/model selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Observe the next natural Sales handoff post exactly one in-thread `[PROCESSING] Generating response…` before its draft; no synthetic lead or email is needed                                                                                                                                                                                                            | 2026-08-04T12:54Z |
| `NC-20260803-003` | A forwarded human inquiry keeps its source text and Gmail identity through classification, routing, and exact downstream recovery                                                                      | Codex + Claude validator           | `codex/nc-20260803-003-forwarded-email-recovery` @ `21d5430`                                                                                   | `complete`            | C5    | Stop actionable sender-wide auto-rules; treat forwarded subjects as human conversations; retain forwarded text; durably store early-routed inbound email; reset stale route state across classifier changes and atomically retry an unrouted same-version result; 156 unsafe live auto-rules disabled reversibly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-04T01:16Z |
| `NC-20260803-002` | A model-supplied Entry ID cannot override the host-resolved Party for an exact approved email                                                                                                          | Codex                              | `codex/nc-20260803-002-email-party-hint` @ `69bbdf7`                                                                                           | `complete`            | C5    | Colleen Entry 985 recipient-guard false positive fixed; immutable host/runner/prompt release deployed; unchanged approved card recovered once with Gmail-confirmed receipt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-03T20:06Z |
| `NC-20260803-001` | One approved Sales reply stays in one Slack work thread, reaches the exact Mailman session, and produces one correctly attributed Gmail result                                                         | Codex + Claude validator           | `codex/nc-20260803-001-email-session-threading` @ `5b76a2a`                                                                                    | `complete`            | C5    | Exact-session/card/thread repair deployed; runner/prompts/Sales config updated; Justin Entry 600 exact recipient/body Gmail-confirmed once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-03T16:10Z |
| `NC-20260802-011` | Make every additive SQLite migration mechanically convergent against its predecessor schema before release                                                                                             | Unassigned                         | pending                                                                                                                                        | `planned`             | C3    | CI audit for initial indexes over later-migrated columns; predecessor-schema startup fixtures beyond pending_sends; split ALTER/backfill recovery; test-only DB initializer guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Build a schema-migration contract test that executes each predecessor fixture through repeated and partially completed initialization; then repair pre-existing ALTER-plus-backfill try blocks without changing live data semantics                                                                                                                                     | 2026-08-02T23:28Z |
| `NC-20260802-010` | Make typed approval resolution card-specific, visibly fail-closed, and consistent across every approval-driven email path                                                                              | Unassigned                         | pending                                                                                                                                        | `planned`             | C5    | card-filtered typed approval resolution and visible no-op; explicit listener scope; proposal-email action-ledger convergence; subject/boundary parsing hardening; canary header hygiene; blocked test-routing recovery wording; explicit canary environment binding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Choose whether typed approval remains global or becomes email-card-specific; implement and adversarially test N1-N6, including a first-class read-only canary environment/manifest binding that does not mutate or place secrets inside an immutable release                                                                                                            | 2026-08-02T23:35Z |
| `NC-20260802-009` | Every approved customer email is one durable, exact, Gmail-receipted action that cannot silently disappear or automatically duplicate                                                                  | Codex + Claude validator           | `codex/nc-20260802-009-email-assurance` @ `e1fa93e`                                                                                            | `deployed_unverified` | C5    | host-issued email action ID; immutable approved content hash; append-only send stages; one-time execution claim; guard/uncertain result in approval thread; tracked Mailman procedure; release-blocking email suite; controlled internal canary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Observe the next naturally approved customer email end to end; verify its exact Action-ID, approval-thread status, append-only events, Gmail receipt, and confirmed replay without creating a synthetic customer send. The internal transport/OAuth canary is complete but does not validate this business outcome                                                      | 2026-08-02T23:35Z |
| `NC-20260802-008` | Close remaining low-risk Sales routing observability, lookup, and retry debt without changing the one-root operator contract                                                                           | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`                                                                                        | `deployed_unverified` | C3    | rejection matrix; process-lifetime health diagnostics; bounded connected-send retry; per-resolved-lead routing serialization; six-hour scheduled revision window; active work-unit provenance; fail-closed cross-channel thread stripping; remainder-only chunk retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Observe the next natural inbound handoff/draft/operator-revision cycle and scheduled work card; confirm each work item has one channel root and all later activity remains in-thread                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-007` | Close remaining release-activation diagnostics and real-plist integration coverage before broadening the activation surface                                                                            | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`                                                                                        | `complete`            | C5    | atomic `shlock` claim with explicit operator stale-lock recovery; owner-safe cleanup; dry-run tool probes; pruned/same-directory diagnostics; healthy rollback proof; real `plutil` XML round-trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-006` | Every new Sales work item is the only channel-root post for its cycle; drafts, revisions, approvals, and later handoffs stay inside that thread                                                        | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`                                                                                        | `deployed_unverified` | C3    | host work-unit thread provenance, Slack lead-anchor lifecycle and broadcast policy; concurrent same-lead roots; reconnect/partial retry; Sales/Inbox instructions; exact prompt deployed with reviewed runtime                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Observe one natural handoff → draft → operator feedback → revision cycle entirely inside one root; idle health verifies deployment, not the business outcome                                                                                                                                                                                                            | 2026-08-02T20:40Z |
| `NC-20260802-005` | One deterministic grading coordinator drains Modules 1-5 with five-way concurrency and opens Module 6 only from live verified prerequisites                                                            | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `0f20224`                                                                                        | `blocked`             | C3    | host-side grading plan/transition engine; bounded Slack-root polling projection; global Phase 1 gate; per-student Module 6 prerequisite gate; no autonomous Heartbeat write, certificate issue, or learner communication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Resolve NC-004 submission identity first; exact course titles are now observed, but the planner must not create a second identity or infer completion from Slack                                                                                                                                                                                                        | 2026-08-02T18:15Z |
| `NC-20260802-004` | Every Heartbeat submission has one durable host record keyed by the actual Heartbeat submission ID                                                                                                     | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `0f20224`                                                                                        | `blocked`             | C3    | additive SQLite submission index and transition history; Slack root/file, grader verdict, Heartbeat writeback, latest observed source state; no submission body, feedback, attachment URL, or student message persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner decision: authorize bounded read-only discovery of Heartbeat's backing record ID, accept a collision-detecting derived key, or keep the index dark; visible UI exposes no submission ID                                                                                                                                                                           | 2026-08-02T18:15Z |
| `NC-20260802-003` | Preserve the deployed lineage and make release activation update the code root and expected commit as one validated operation                                                                          | Codex + Claude validator           | `codex/nc-20260802-003-company-os-sequence` @ `aa1c821`                                                                                        | `complete`            | C5    | production lineage `23ffb07` → `aa1c821`; exact-three-field activation; stale-safe exclusive lock; dry-run prerequisites; health-verified switch/rollback; runtime code-root proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-02T20:40Z |
| `NC-20260802-002` | A healthy heartbeat cannot keep a stale Sales or other agent container alive beyond its configured runtime                                                                                             | Codex                              | `codex/nc-20260802-001-release` @ `3368831`                                                                                                    | `deployed_unverified` | C3    | absolute container lifetime for normal and daemon-adopted runs; focused regression; exact follow-up release; the specifically identified stale Sales container exited before the follow-up restart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Observe one naturally long-running container stop at its configured wall-clock cap; code/release identity and idle production health are verified, but a second intentionally stale live container was not created                                                                                                                                                      | 2026-08-02T17:29Z |
| `NC-20260802-001` | Give MrGru a host-owned, idempotent grader file-upload path so Heartbeat grading no longer depends on visual Slack upload                                                                              | Codex                              | `codex/nc-20260802-001-release` @ `0a39380`                                                                                                    | `complete`            | C5    | grader-only container MCP and per-group staged attachments; host path/hash/source enforcement and durable receipts; Slack root plus threaded file upload and grader wake; tracked five-way grader registration/30-second idle defaults; toolbox adapter; pinned-Node regression and production canaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Resume the Module 1-5 queue through the adapter; preserve one root and one ledger row per real submission, and use only explicit terminal grader markers for Heartbeat writeback                                                                                                                                                                                        | 2026-08-02T17:29Z |
| `NC-20260731-003` | Production runs one real Node 22 build instead of hand patches, and per-lead status lines stop leaking to the channel root                                                                             | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                                                                                                  | `deployed_unverified` | C3    | `src/lead-thread-key.ts` (`deriveLeadEntryRef`), `src/lead-email-resolver.ts` (new), `src/channels/slack.ts`, `src/channels/registry.ts`, `src/index.ts`, three test files; Mac Mini `src/` reconciled with the Studio worktree; Node 22.23.2 installed and pinned in launchd; `better-sqlite3` rebuilt; every hand-patched `dist/` file replaced by one compiled artifact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Watch the next per-lead status line ("Lead #N …") land in that lead's thread, and the next unaided approval complete end-to-end. Decide whether to prune the ~118 stale `.test.js` artifacts left in production `dist/`                                                                                                                                                 | 2026-07-31T18:05Z |
| `NC-20260731-002` | Lead detail stays inside the lead's thread instead of leaking into the channel                                                                                                                         | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                                                                                                  | `deployed_unverified` | C2    | `src/channels/slack.ts` (host lead anchor outranks agent-supplied `thread_ts`), `src/channels/slack.test.ts`; one hand-patched production `dist/channels/slack.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Watch the next lead's draft/update cycle post entirely in-thread. The hand patch was replaced by a compiled artifact and the per-lead status-line gap was closed under `NC-20260731-003`                                                                                                                                                                                | 2026-07-31T18:05Z |
| `NC-20260731-001` | A cross-group handoff wakes its target group on every channel, not just the ones that happened to work                                                                                                 | Claude Code                        | `codex/continuity-reconciliation` @ `0a39380`                                                                                                  | `deployed_unverified` | C3    | `src/db.ts` (`getNewMessages` wake rule), `src/index.ts` (owner map), `src/ipc.ts` (producer flag reverted to uniform), `src/db.test.ts`, `src/ipc-handoff-echo.test.ts`; one hand-patched production `dist/db.js`; one `store/messages.db` row flip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Observe the next mailman→sales and sales→mailman handoff waking their targets unaided. The hand-patched `dist/` was replaced by a real build and the Mini's `src`/`dist` divergence resolved under `NC-20260731-003`                                                                                                                                                    | 2026-07-31T18:05Z |
| `NC-20260730-006` | Make email delivery observable and NanoClaw releases traceable and pinned to Node 22                                                                                                                   | Codex                              | `codex/continuity-reconciliation` @ `0a39380`                                                                                                  | `validating`          | C5    | Sales/Mailman handoff contract and tests; handoff-without-spawn alerting; release identity in health; source/artifact mismatch refusal; package/runtime/launchd/release operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Run Claude adversarial review over the preserved composite diff, reconcile findings, isolate commits from unrelated dirty files, then build and deploy one exact artifact                                                                                                                                                                                               | 2026-07-31T01:52Z |
| `NC-20260730-005` | Approved sales email actually reaches the customer again                                                                                                                                               | Codex (picked up from Claude Code) | `codex/continuity-reconciliation` @ `0a39380`                                                                                                  | `validating`          | C3    | `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-policy.ts`, `src/ipc.ts`, two test files; production hand patches; one customer email; three `store/messages.db` mutations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Review and commit the reconciled source under NC-006, replace the production hand patches with that exact release, then observe the next unaided approval end-to-end                                                                                                                                                                                                    | 2026-07-31T01:52Z |
| `NC-20260730-004` | Connect the Procurement review loop without trusting portal content or model-supplied human identity                                                                                                   | Codex                              | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                  | `deployed_unverified` | C5    | migration 114; RLS-contained Bonfire legacy lane; default-off CaleProcure intake; host review cards; isolated host/runner/prompt dark deployment; no schedule, browser, live card, decision, or submission                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Name primary/backup Slack operators and action epoch, then separately approve a gates-on sanitized fixture and named-human review canary; do not claim business outcome validation                                                                                                                                                                                      | 2026-07-30T21:53Z |
| `NC-20260730-003` | Restore a trustworthy Procurement intake and review queue for CaleProcure and exact-resource email                                                                                                     | Codex                              | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                  | `deployed_unverified` | C2    | migration 114; host-owned typed intake; deterministic CaleProcure normalization; exact-message email handoff; bounded queue IPC; deployed gates-off with NC-004; no Bonfire/schedule cutover or production intake row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Continue under `NC-20260730-004`: separately authorize one sanitized gates-on fixture and named-human review canary                                                                                                                                                                                                                                                     | 2026-07-30T21:53Z |
| `NC-20260730-002` | Make healer remediation fail closed before completing the wider self-healing system                                                                                                                    | Codex + Claude validator           | `codex/continuity-reconciliation` @ `bc8a71b`                                                                                                  | `deployed_unverified` | C5    | healer action/approval authority, separate deterministic restart control, pending-proposal safety, focused tests, self-healing authority docs; exact healer-only production release; no model action, implementation, operator/epoch configuration, main-daemon restart, or database migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Observe scheduled healer cycles and separately authorize a controlled daemon-down recovery canary before claiming deterministic restart live-verified. Gate B diagnosis separation and Gate C typed actions still precede autonomy                                                                                                                                      | 2026-07-30T21:38Z |
| `NC-20260730-001` | Reconstruct and safely resurrect the Procurement Scout as a closed opportunity-to-outcome process                                                                                                      | Codex                              | `codex/continuity-reconciliation` @ `1689527`                                                                                                  | `ready_for_review`    | C1    | read-only repository/live audit; target design and phased implementation brief; no prompt, runtime, database, browser, schedule, or production change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Human resolves the seven leadership gates in `docs/PROCUREMENT-RESURRECTION-PLAN.md`; accepted implementation phases receive separate C2-C5 task IDs                                                                                                                                                                                                                    | 2026-07-30T17:48Z |
| `NC-20260728-007` | Redesign the OneDrive Drop ingestion subsystem                                                                                                                                                         | human                              | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                  | `planned`             | C2    | all four `scripts/copiers/*.py`, their launchd jobs, and the upstream Solera export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner is redesigning the subsystem. Do not re-enable the existing copiers; establish first whether the upstream export is coming back                                                                                                                                                                                                                                   | 2026-07-28T23:09Z |
| `NC-20260728-006` | Chat/people drops ingest instead of retrying forever and pinning `fileproviderd`                                                                                                                       | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                  | `complete`            | C2    | `scripts/copiers/copy_chat.py`, `scripts/copiers/copy_people.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None. Fix verified live (66 COPIED / 0 FAILED under launchd) before the subsystem was stopped under NC-20260728-007                                                                                                                                                                                                                                                     | 2026-07-28T23:09Z |
| `NC-20260728-005` | Restore a truthful green Node 22 test baseline                                                                                                                                                         | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b`                                                                                                  | `validating`          | C2    | Node 22 baseline repaired: 124 files / 1,595 tests pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the review branch                                                                                                                                                                                                                                                            | 2026-07-28T12:34Z |
| `NC-20260728-004` | Reconcile Claude changes with the shared company-OS protocol                                                                                                                                           | Codex + Claude validator           | `codex/continuity-reconciliation` @ `157cb1b`                                                                                                  | `validating`          | C2    | committed review checkpoint; tracking rules; continuity records/checker; authoritative docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Obtain explicit approval for the sanitized Claude API review, reconcile findings, and push the durable handoff                                                                                                                                                                                                                                                          | 2026-07-28T12:34Z |
| `NC-20260729-004` | Close the highest-risk outbound-email and healer implementation gaps before broader Company-OS work                                                                                                    | Codex + Claude validator           | `codex/continuity-reconciliation` @ `1689527`                                                                                                  | `deployed_unverified` | C3    | Gmail IPC authorization and final-boundary recipient/thread controls; durable approval grant reissue; denied-call acknowledgements; installed and tracked healer default; focused tests; Company-OS/security/project-map reconciliation; `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Production host artifact and SQLite migration are deployed; both Gmail denial and restart-grant canaries passed; installed fast-healer implementation is off. Observe the first explicitly approved real/test-routed send before claiming outcome validation. Track Node 22 enforcement, prompt/source convergence, and disposable healer worktree isolation separately | 2026-07-30T17:50Z |
| `NC-20260729-003` | A guard-blocked or failed send can no longer look identical to a delivered one                                                                                                                         | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                  | `deployed_unverified` | C3    | `src/send-watchdog.ts`, `src/db.ts`, `src/ipc.ts`, `src/gmail-ipc-handlers.ts`, `src/index.ts`, `tsconfig.json`, three test files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Watch for a `[SEND NOT OBSERVED]` alert on the next genuinely blocked send; decide whether to also post the `[EMAIL BLOCKED]` line into the draft thread for instant notice                                                                                                                                                                                             | 2026-07-30T00:12Z |
| `NC-20260729-002` | Sales/inbox knowledge states the real Coaching Supervision Mastery offer instead of "pre-launch, no price"                                                                                             | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                  | `ready_for_review`    | C2    | `knowledge/agents/sales/KNOWLEDGE.md`, `knowledge/agents/inbox/KNOWLEDGE.md`, `knowledge/shared/KNOWLEDGE.md`, `knowledge/agents/sales/LEARNED.md`, `knowledge/shared/LEARNED-sales.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Operator supplies the unpublished attendance/missed-session and refund/deferral policy, then answer Lead #611 Q1; separately decide the `LEARNED-sales.md` 73-vs-51 lesson divergence                                                                                                                                                                                   | 2026-07-29T21:55Z |
| `NC-20260729-001` | Adversarial Claude validation of the Company-OS v2 upgrade plan                                                                                                                                        | Claude Code                        | `codex/continuity-reconciliation` @ `cd78ad2`                                                                                                  | `ready_for_review`    | C1    | `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new), `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Human/Codex read the report, decide the five blocking questions in §11, then reconcile accepted findings into `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` under a separate task ID                                                                                                                                                                                            | 2026-07-29T13:05Z |

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

### NC-20260830-001

- Incident: two exact Foundation discrepancy runs produced valid operator
  decisions but no usable result in their submission threads. One model tool
  call omitted `thread_ts`, so the operator notice posted at the channel root;
  the other model called no staging tool and left its decision only in
  suppressed final text.
- Student recovery: the matching development plan was approved with a
  non-blocking six-session-format note. The different-recording document
  received its first Retry for the required Recording A submission. Both
  Heartbeat receipts and tracker cells were read back; no certificate was
  issued.
- Implementation: `getGraderRunBinding` resolves one unexpired exact
  run/JID/thread. Grader IPC uses that host thread when the model omits or
  conflicts on `thread_ts`; missing, expired, wrong-JID, restart, adoption,
  duplicate-copy, cross-group, and certifier behavior remain unchanged. The
  grader prompt now requires discrepancy notices to use the thread-bound
  message tool rather than suppressed final text.
- Verification: pinned Node 22.23.2 focused 4 files / 74 tests, typecheck,
  format, and build pass. Full root is 3,387 pass / 32 skip with only the same
  CNPC wrapper and date-stale Trafft fixture failures recorded on the exact
  live base.
- Review: Claude Sonnet/high attempt R1 was interrupted before artifact
  creation after exceeding the bounded drift threshold. Fresh narrow R1B used
  four model calls, max context 56,729, and returned `NO MATERIAL FINDINGS`.
- External state: Heartbeat and the completion tracker changed only for the two
  recovered grading records. Exact release `8df61d98` is live with backup
  `NC-20260830-001-20260831T030454Z` and rollback to `d834cb2f` retained. The
  operational grader prompt hash matches the release.
- Live canary: sanitized root `1788145594.661179` received one operator-only
  discrepancy notice in that exact thread. The run ended with no generic
  missing-output notice, no student verdict, no grading record/ledger row,
  connected channels, empty queues, and exact release identity.
- Next: none. Treat any recurrence as a new incident and use the retained
  release/prompt backups for rollback if necessary.

### NC-20260829-002

- Trigger: Lead #1276's natural narrative coaching inquiry produced an
  unapproved `ANSWER/HIGH/YES` card whose opening recycled the person's wording,
  asserted the situation was exactly what the service was built for, and
  generalized the person's medication history into an unsupported “most
  clients” claim. Read-only thread evidence shows no approval or Gmail receipt.
- Root cause: the route policy did not explicitly classify a narrative “I
  believe I need coaching” message as orientation, so the model treated keyword
  program matching as answerability and fit authority. Existing voice guidance
  prohibited restatement but did not bind synthesis, customer-prevalence claims,
  or custom-engagement uncertainty in the request-scope audit.
- Implementation: `ORIENT/MEDIUM/PARTIAL` for narrative custom-engagement fit;
  candidate-service-only matching; calibrated synthesis, verified mechanics,
  and one no-obligation fit conversation; no replayed biography/symptom list,
  unsupported prevalence/medication history, confirmed-fit, or outcome promise.
- Review: Claude Sonnet/high R1 found that the new fit conversation conflicted
  with an older blanket discovery-call ban. Codex narrowed that ban to fixed-
  information training programs and added an explicit Executive/ADHD Executive
  exception; focused 12/12 passed and Claude R2 returned no material findings.
- External boundary: deploy only the reviewed prompt/release, then replace the
  existing Slack approval card in its current thread. Do not approve it, send a
  customer email, create a second lead/thread, alter pipeline state, or expose
  private lead content in tracked artifacts.

### NC-20260829-001

- Program: `program:company-os` charter 1.0.0, work item
  `work:checkout-failure-customer-recovery`, accepted authorization
  `decision:checkout-failure-customer-recovery-2026-08-29`; primary program
  state was validation-repaired and claimed at revision 153 with commitment
  continuity attached at revision 154.
- Live incident: one identified returning Party and two distinct failed Stripe
  PaymentIntents produced six provider failure events, two immediate cryptic
  Slack lines, and two later `shadow_ready` lines. Stripe retained the customer,
  $299 product, card summary, and `do_not_honor` guidance while NanoClaw cases
  30/31 retained none of those fields and had no Party link.
- Root cause A: the website producer is active at deployed Tandemweb
  `bed21735`, but exact-body HMACs fail after parsed n8n reserialization changes
  escaped URL bytes. The WordPress queue now contains 99 facts, 57 exhausted,
  from 2026-08-24 onward. Secrets, configured path fingerprints, and endpoint
  health match; the transport contract is the defect.
- Root cause B: the live Stripe Code nodes extract email/product/amount fields,
  but the downstream HTTP node reconstructs a seven-field ID-only body. No
  end-to-end relay test or live field-shape readback caught that loss. The live
  Code nodes also omit decline/advice/payment-method context.
- Safety: preserve the historical queue in a protected backup and do not replay
  it into customer sends; no retrospective message to the affected customer,
  no payment retry, no identity inference from timing/name/card, and no broad
  Party Context/minion activation. New identity linkage must use exact provider
  references or unique verified email evidence and fail closed on ambiguity.
- Required completion: reviewed design, multi-repository implementation,
  focused/full/release verification, independent implementation review,
  guarded website/n8n/NanoClaw deployment, exact source/live readback, one safe
  non-customer structural canary or natural evidence, rollback, and program
  reconciliation.

### NC-20260827-004

- Trigger: the NC-003 parity activation left one runtime JSONL file inside the
  immutable release. The Plutio reaper's full-bundle preflight then failed every
  15 minutes before executing, leaving six durable outbox rows pending.
- Live recovery: preserve the exact contaminant outside the release, require the
  unchanged 1,016-file bundle to verify, execute the established reaper once,
  and read back all six rows as processed with zero retry/dead-letter results.
- Source boundary: an implicit structured logger sink must remain under the
  operational checkout and must be disabled when a diagnostic runs from an
  inventory-bearing release root or descendant. An explicit outside path
  remains allowed for bounded diagnostics. Inventory diagnostics must describe
  unlisted runtime files truthfully.
- Completion: focused/full pinned-Node verification and release gates passed;
  independent bounded Sonnet/high review produced one corrected runbook
  finding; implementation `2773def5` was pushed, packaged, activated, and
  live-verified. The natural cron returned exit 0, the new release-root logger
  canary created no file, the exact bundle still verifies, channels/parity are
  healthy, and zero actionable Plutio rows remain.

### NC-20260827-003

- Program alignment: `program:company-os` charter `1.0.0`, revision 146,
  selected candidate `work:stripe-payment-ingress-parity`. The owner's
  keep-going instruction follows the explicitly named sequence after the
  terminal-state correction.
- Trigger: two distinct same-course payments succeeded on 2026-08-27. The
  later payment reached the exact host and completed; the earlier one has no
  Stripe webhook-inbox row, fulfillment case, or `public.payments` row despite
  the n8n workflow/event destination being active at readback.
- Contribution: compare bounded recent succeeded Payment Intents from both
  fixed Stripe accounts against exact host inbox/case authority and persist an
  owned, content-minimized missing-ingress exception. Natural later delivery
  may enter the ordinary ledger; this slice never replays it.
- Prohibited: provider/event replay, Stripe/n8n mutation, Payment Log/roster/
  payment processing, refund closure, customer communication, product/student
  redesign, accounting/QuickBooks, broad history, names/emails/raw payloads,
  or unrelated live-system changes.
- Completion: reviewed release enabled through a separate flag; one bounded
  stable scan captures the known missed payment exactly once, replay is no-op,
  present/terminal cases are skipped, provider/API/rate/privacy failures hold
  safely, and live channels/queues/checkout/lifecycle/context/watchdog state is
  preserved.
- Result: exact release `d11e949b` is live. The first complete scan captured the
  known missed payment once; the exact second run created zero. Final delta is
  one `needs_review` case, six receipts, and one alias, with Stripe inbox and
  `public.payments` unchanged. The item is complete; payment repair and refund
  review remain separate.

### NC-20260827-001

- Trigger: after the 2026-08-26 23:17 local deployment restart, the last stored
  Slack diagnostic heartbeat was 23:08:54. The watchdog crossed its 900-second
  stale threshold at 23:24, restarted the healthy daemon at 23:26, and then
  repeated every roughly eight minutes before the daemon's configured
  600-second first heartbeat could run.
- Exact defect: the stale-heartbeat check had no deployment-aware startup
  grace. Each stale observation added two failure points, so two checks were
  reported as four failures despite healthy daemon/channel/queue state.
- Review/live: focused Bash timing tests pass; Claude Sonnet/high returned no
  material findings. Exact script SHA-256 `ec488448` is installed with rollback
  retained. Natural grace/fresh-heartbeat/plain-OK ticks passed without a
  daemon or watchdog-service restart.
- Merge boundary: NC-20260823-006 incorporates the reviewed source/tests/docs
  into its exact release lineage but does not reinstall or otherwise change the
  already-live external watchdog artifact.

### NC-20260827-002

- Program alignment: `program:company-os` charter `1.0.0`, observed revision
  134, selected candidate
  `work:relationship-context-plutio-client-ref-coverage`; the current owner
  directs this final bounded pass and rejects a historical assignment or
  reassignment campaign as low value.
- Exact lineage: isolated from NC-009 final evidence `c813879d`; production is
  exact release `6a978328`, healthy with 11 In-progress coaching projects, one
  mapped active engagement, and zero-change replay. The separately deployed
  NC-20260827-001 external-watchdog script is out of scope and preserved.
- Useful scope: inspect current In-progress project client links and already-
  existing exact provider identifiers. Bind only a source-authoritative exact
  person/company reference that requires no Plutio cleanup or identity guess.
- Stop rule: if current links have no such zero-touch source, keep them held,
  record the truthful coverage ceiling, close the Plutio mapping lane, and
  return to higher-value Company OS roadmap work.
- Result: all nine current person and two distinct current company objects
  exist in Plutio, but only one person already has an authoritative ledger/ref
  bridge. Eight people and both companies expose no populated exact external-
  ID field or host ledger entry; conflicts are zero. No mapping mutation is
  justified, so the lane closes with explicit holds.
- Verification: stable double-read provider object counts, identical aggregate
  PostgreSQL reads, and live health/replay prove release `6a978328`, 1,444/
  1,444 client projection coverage, one active/one historical engagement, zero
  changed projections, query off/zero grants, connected channels, and empty
  queues.
- Program reconciliation: revision 138 closes the item and all eight
  commitments. No active or eligible work remains. The first dependency-
  complete roadmap candidate is the separately unselected Bizmgr payables
  visibility queue; the higher nominal Contador identity candidates remain
  blocked on a natural payment/refund case.
- Prohibited work: historical project/client assignment or reassignment,
  Plutio/provider mutation, name/email similarity, contact-presence promotion,
  Party merge, role/ref rewrite without accepted exact authority, customer
  communication, minion/query activation, or checkout/lifecycle/Sales/watchdog
  change.

### NC-20260826-009

- Program alignment: `program:company-os` charter `1.0.0`, state revision 133,
  active item `work:relationship-context-plutio-engagement-enrichment`,
  authorized by
  `.program/decisions/decision-relationship-context-plutio-engagement-enrichment-2026-08-26.json`.
- Exact lineage: current live verified merge
  `55efd52fb9919c98e75d41d7a6f200fa4ef87ef2`; NC-006 relationship projection
  remains healthy at 1,437/1,437 with zero-change replay. The isolated worktree
  preserves concurrent NC-007 and the dirty primary checkout.
- Trigger: NC-006 proved 62 paid customers but could not establish active
  coaching engagement. Existing Plutio contact refs are identity evidence only;
  the shared Plutio read path first failed on shell-parsed unrelated `.env`
  literals and then lacked project-local Plutio credentials.
- Tool repair boundary: preserve byte-identical credential/config values,
  introduce no new secret, and keep all Plutio calls behind the shared toolbox.
  The NanoClaw environment may point to the existing Bizmgr credential file by
  non-secret path; shared auth must parse only the required Plutio keys without
  evaluating unrelated shell content.
- Evidence boundary: only native Plutio object IDs/status/times plus exact
  client links to an existing scoped Plutio person ref may contribute. Contact
  presence, labels, titles, price, invoice/proposal/task/note/activity, email,
  or name alone cannot declare active coaching engagement. Unsupported and
  ambiguous objects remain unknown or legacy.
- Review/release: Codex implements and independently verifies. Claude
  Sonnet/high performs bounded review. Any production release remains off-first
  and must preserve query/minion disablement, providers, channels, queues,
  checkout, lifecycle, Circle, Sales support, and legacy receivers.
### NC-20260826-008

- Trigger: the owner stated that simple email responses should take seconds,
  not hours. Ari's case showed a one-fact reply expanding into CRM lookup,
  forbidden attachment read, disabled context query, technical escalation, and
  repeated retry instructions.
- Narrow fast-path boundary: only an exact Alex/Cherie fact or decision in the
  current `[SOURCE: email-active-client]`/`SERVICE` work thread after the
  missing answer is known. Sales must reuse the existing request, recipient,
  and Thread-ID and post one support approval card in the same model turn.
- Forbidden fast-path work: psql/CRM, Gmail and attachment tools, Party Context,
  Chaos, Plutio, other minions, re-escalation, pipeline creation/transition,
  approval, or send. If the operator fact does not actually answer every
  material ask, the ordinary answerability/HUMAN boundary still applies.
- Protected behavior: complex sales inquiries, unsupported support questions,
  exact approval/action/Gmail execution, visible-recipient rules, and the
  deterministic NC-007 card-semantic host gate remain unchanged.
- Completion proof: static prompt contract, independent Claude review, full
  release gates, exact deployment, prompt hashes, and a sanitized no-send
  response canary or equivalent live evidence.
- Review/verification: Claude Sonnet/high R1 found that the loaded prompt had
  nested the shortcut under a pending-draft-only heading and omitted the
  explicit SERVICE gate. Both were corrected; R2 reports no material findings
  remaining. The shared review session reached 150,846 context tokens (above
  the bounded-review threshold), so Codex independently checked the findings
  and final diff. Focused Sales/email tests pass (92/92), email replay passes
  (13/13), email-critical passes (748/748 host plus 45/45 runner), and
  typecheck, format, and documentation continuity pass. Full `npm test` is
  3,325 passed / 30 skipped with the unchanged unrelated CNPC wrapper-literal
  assertion as its sole failure.
### NC-20260826-007

- Trigger: an active-client/student assignment-feedback inquiry arrived in
  Sales with no pipeline row. The operator supplied the exact prerequisite
  fact in the work thread, but Sales followed stale direct-DML instructions and
  blocked instead of drafting.
- Exact lineage: implementation commit `371e6e0a` began from exact live
  `d5375964`. The activation dry run detected a concurrent move to
  `f8595966` before daemon mutation, so the latest live lineage was merged and
  must be rebuilt as one exact release. The dirty primary remains untouched.
- Behavior boundary: evidence-supported `SERVICE` work uses the host-supported
  `[CLIENT SUPPORT REVIEW]` card with no Lead/Entry ID or pipeline mutation.
  Approval, Action-ID, exact recipient/subject/body binding, Gmail execution,
  one-time receipt, and customer-send approval remain unchanged.
- Genuine-lead correction: resolve open work from `v_active_pipeline` and call
  `fn_create_pipeline_entry` only for real sales inquiries. Direct base-table
  access remains forbidden and no grant/schema change is required.
- Files: Sales runtime/compatibility/workflow prompts, prompt contract test,
  approved-handoff explanatory comment/test, project map, review artifacts,
  active work, and engineering changelog.
- Review: bounded Claude Sonnet/high R1 found an unconditioned support `Party
  ID` handoff line and missing assertions for post-approval no-mutation. Both
  were corrected; focused tests pass. No second review is required because the
  corrections are explicit prompt annotations with direct static coverage.
- Side effects: no customer email, approval, database row, permission, schema,
  credential, Gmail policy, or Relationship Context activation. After exact
  reviewed deployment, post one instruction to the existing Sales thread and
  verify a draft-only support card while leaving it unapproved.
- Natural canary correction: before the host reprocess landed, the operator's
  generic retry produced an invalid but parseable `[SALES REVIEW] Lead #(none)`
  with `Route: SERVICE`; the operator approved it and Gmail confirmed one send.
  The later host reprocess produced the correct `[CLIENT SUPPORT REVIEW]`,
  followed by a host stop. There is one confirmed action, the support card is
  unapproved, and Ari still has zero open pipeline entries.
- Enforcement follow-up: new approval-card semantic validation rejects
  SERVICE-as-Sales, a Sales card without one numeric Lead ID, and a support card
  without exactly one SERVICE route at IPC admission, Slack defense in depth,
  and approval arming. Historical exact-card parsing remains available for
  confirmed-action reconciliation. Focused enforcement tests pass 222/222.

### NC-20260826-006

- Program alignment: `program:company-os` charter `1.0.0`, state revision 126,
  active item `work:relationship-context-client-relationship-projection`,
  authorized by
  `.program/decisions/decision-relationship-context-client-relationship-projection-2026-08-26.json`.
- Live aggregate baseline: 1,430 active canonical people; 1,418 have at least
  one active source reference and 1,362 span at least two providers. Exact
  current evidence proves 62 distinct paid-customer Parties from succeeded
  Stripe PaymentIntents; five also have an active subscription. Nine Parties
  carry active `client` role rows, but all nine rows have empty metadata and no
  source/decision receipt, so they remain separately visible as unproven
  recorded roles rather than positive client authority. The same provenance
  gap applies to both `student` and all 1,317 `prospect` role rows.
- Correctness boundary: a succeeded payment proves paid-customer history, not
  a current coaching engagement. Recorded client/student/prospect roles, paid
  history, active subscription, and unknown engagement remain separate fields
  with source watermarks. Contact forms, Chaos activity,
  appointments, provider labels, display names, and email alone cannot declare
  a client.
- Provider evidence: Plutio contract/project/invoice discovery is currently
  unavailable because the shared toolbox rejects its environment file before
  provider access. No Plutio fact is inferred, and no credential or environment
  file is inspected or changed in this task.
- Isolation: the implementation worktree is based on the clean pushed NC-005
  final-evidence commit `13c855db8db0dc61b2e652609d21569c7d75d742`.
  The shared dirty primary checkout and unrelated operational changes remain
  untouched except for canonical Company OS program-control state.
- Review/release: Codex implements and verifies; Claude Sonnet/high performs
  bounded independent review. After material findings are corrected, use the
  immutable release, backup, off-first activation, live aggregate readback,
  duplicate-only replay, and non-interference workflow established by NC-005.

### NC-20260826-005

- Authority: accepted decision
  `.program/decisions/decision-relationship-context-stripe-contact-chaos-enrichment-2026-08-26.json`;
  Company OS item `work:relationship-context-stripe-contact-chaos-enrichment`
  is active at revision 122.
- Exact lineage: isolated from pushed `5c02acd3`, which directly contains
  exact live implementation `1a381e48`; the heavily dirty primary remains
  untouched.
- Aggregate discovery: Stripe has 173 Heartbeat and 624 Tandem customers,
  412/1,013 payment intents, and 14/32 subscriptions. No Stripe Party refs
  exist. Unique Party matches are 55/43 before refusing account-local duplicate
  customer emails; unmatched, ambiguous, and duplicate identities remain
  legacy.
- Contact-form discovery: 191 immutable ingress rows have no provider event or
  submission ID and no Party binding; 208 current form interactions have no
  source ID. The adapter therefore uses the exact archived inbox row as its
  source reference and binds only one unique submitted identity. It never
  persists the submitted email, name, company, or message.
- Chaos discovery: 1,331 stable visitor interactions cover 1,225 Parties with
  zero visitor-ID multi-Party interaction conflicts. Verified inbox evidence
  has 38 missing interaction links and three canonical Party mismatches; only
  complete, agreeing links may bind and every remainder stays legacy.
- Live preflight: release `1a381e48` remains healthy with query off and
  duplicate-only Trafft replay. Plutio refs grew naturally from 1,364 to 1,365;
  Trafft exact/legacy totals remain 159/358 and 14/66.

### NC-20260826-004

- Owner direction: connect everything possible using best available evidence;
  explicitly call whatever remains unresolved `legacy`.
- Program: authorized decision recorded; item claimed at Company OS revision
  115 and ten separate continuity commitments attached at revision 116.
- Evidence tiers: source-created exact first; unique Trafft customer plus unique
  Plutio/stable-provider corroboration next; multiply mapped/conflicting or
  uncorroborated identities remain legacy. Tier and provenance must be durable.
- Encharge: shared integration exists but NanoClaw was not opted in. Add only
  bounded read access/person lookup and consent facts; do not expose or enable
  contact, campaign, consent, event, unsubscribe, archive, or send mutation.
- Boundary: provider-neutral adapter addition, no Party-core rearchitecture,
  no provider or customer mutation, and no broad context/minion activation.
- Review: Claude Sonnet/high R1 found four material collision/coverage/
  durability/merge defects plus scale/test gaps. Per-row conflict isolation,
  complete legacy classification, durable out-of-window exceptions,
  canonical reads, steady-state skip, and 1,400-row scale proof corrected them;
  R2 returned `NO MATERIAL FINDINGS`.
- Verification: focused 31/31, PostgreSQL 3/3 including the 1,400-row path,
  toolbox bulk-read 6/6 and registry 24/24, format/typecheck/build/continuity,
  and runner 45/45 pass. Full root is 3,304 pass / 28 skip with the sole CNPC
  wrapper assertion reproduced at exact base `416384fc`/prior task.
- Live: pushed `1a381e48`; 996-file artifact `d53636b1…`, archive
  `f44c1cb2…`, retained `adc0c5d8` rollback, exact verified Node 22.23.2.
  Durable refs are 1,364 Plutio, 1,242 Encharge, 159 Trafft customer, and 358
  Trafft appointment, all verified with zero conflicts.
- Context: 358 appointment projections (7 current/351 stale) and 1,242 consent
  projections (63 current/1,179 stale). All 424 original held observations
  remain immutable; 358 exact observations were appended. Exceptions are 358
  resolved and 66 terminal legacy.
- Cross-provider canaries: an exact Encharge person ref resolved one consent
  projection and delivered receipt 2; an exact Plutio person ref resolved two
  Trafft appointment projections and delivered receipt 3. Both truthfully
  reported stale and returned no identity or context values.
- Replay/cleanup: Encharge 1,242/1,242 and Trafft 424/424 duplicates, zero new
  observations/projection changes. Raw Party-email/provider files, sanitized
  transfer snapshot, and transfer archives were deleted after readback.
- Non-interference: sole listener PID 34401, Gmail/Slack healthy, queues empty,
  checkout production sends preserved, Community lifecycle healthy with
  consumers/Circle off, global context query off/zero grants.
- Scheduled health: the daemon's own 22:24 UTC pass reports the final 1,364/
  1,242/159/358 refs, 14/66 legacy, 424/424 duplicates, zero changes/conflicts,
  and healthy status. One later natural task is active with no waiting group.

### NC-20260826-003

- Owner direction: proceed with maximum implementation and stop only for an
  absolute blocker. Exact-live branch starts at `416384fc`.
- Natural evidence: six new eligible appointments reached the shadow; three
  customers, one newly seen/two returning, zero multi-Party ID collisions.
- Rule: bind only a single Trafft customer in a five-minute source-created Party
  window after adapter registration; bind later appointments only when the
  ledger Party agrees with the exact customer ref. All other identities hold.
- Implementation: transaction-atomic refs, exact-first Booking resolution,
  current projections only after exact refs, conflict health, and a one-shot
  content-minimized exact-read canary.
- Review: Claude Sonnet/high R1 found merge-lineage ref re-canonicalization and
  failed-canary receipt finalization defects. Both were fixed and tested; R2
  returned `NO MATERIAL FINDINGS`.
- Verification: focused context/canary suites, format, typecheck, build,
  continuity/capability checks, runner build plus 45/45, and disposable
  PostgreSQL 2/2 pass. Full root is 3,298 pass / 27 skip with the sole CNPC
  wrapper assertion reproduced at exact base `416384fc`.
- Release/live: pushed `adc0c5d8`; verified 992-file artifact
  `a00926c5…`, archive `0de7334f…`, exact Mini activation with retained
  `416384fc` rollback. Startup reconciled 2 exact customers/4 appointments,
  appended 4 exact observations/projections, and left 418 current-row holds.
- Canary/replay: receipt 1 delivered a current appointments section with two
  projections and no context/identity output; direct replay was 422/422
  duplicates, zero projection changes, and zero conflicts.
- Non-interference: one listener on PID 28275, exact tree/artifact/code root,
  Gmail/Slack healthy, queues empty, checkout production sends preserved, and
  Community lifecycle healthy with consumers/Circle still off.

### NC-20260826-001

- Owner decision: Tandem OS owns relationship-owner authority; the explicit
  generic organizational principal is `team:tandem` / `Tandem Team`.
- Semantics: ownership is accountability/routing only and has
  `action_authority='none'`. It cannot choose a sender, approve content,
  activate follow-up, grant a minion, or authorize any external action.
- Local implementation: migration/rollback 138, three exact append-only lane
  assignments, as-of host resolution, policy `2026-08-26.1`, shadow/review
  v2, and lane-bound durable case provenance.
- Verification so far: focused 56/56, enabled PostgreSQL integration 6/6,
  format/typecheck/build/continuity/capability/diff, PostgreSQL 16.15
  apply/seed/append-only/lane/concurrency/permissions, populated rollback
  refusal, and empty rollback all pass. Full root is 3,291 pass / 27 skip with
  three failures reproduced unchanged at exact base `460a51c7`.
- Independent review: R1's one material ownerless-waiting mismatch is fixed;
  R2 and the bounded concurrency-hardening R3 returned
  `NO MATERIAL FINDINGS`.
- External boundary: no production migration, projection, draft, approval,
  send, schedule, provider/customer/Plutio write, credential/payment/contract
  action, minion grant, deployment, or restart.

### NC-20260825-004

- Owner direction: get as much of Relationship Context up and running as
  possible. Decision
  `.program/decisions/decision-relationship-context-production-rollout-2026-08-25.json`
  authorizes migration 137, read-only Trafft shadow context writes, immutable
  deployment, and live verification while query/minion access stays gated by
  exact identity.
- Live preflight: exact healthy `8e475e03`; migration 137 absent; 419 Trafft
  interactions/170 Parties; 170 observed customer IDs have no historical
  multi-Party collision, but all 1,420 Party emails are unverified. The adapter
  therefore records exact appointment references with null Party identity,
  `needs_identity`, and zero projections.
- Implementation: core-SHA-256 portable migration; minimized credential-free
  host-ledger adapter; default-off startup plus 15-minute transaction-atomic,
  bounded, non-overlapping shadow; truthful health; explicit query-disabled
  configuration templates.
- Review: Claude Sonnet/high R1 found a startup-blocking/unref issue. It was
  corrected with fire-and-forget startup, `.unref()`, and a `finally`-released
  in-flight guard. R2 returned no material findings.
- Verification: focused/typecheck and no-`pgcrypto` disposable PostgreSQL pass;
  full root passes 3,280 with 25 skips and only the unchanged unrelated CNPC
  wrapper assertion. Runner 45/45, continuity, capability, diff, secret, target
  archive, migration, and live checks pass.
- Live: exact `e97c9f87`, migration 137 with 39 compatibility refs, healthy
  complete 414-row shadow, 414 null-Party observations/identity holds, zero
  projections/queries/grants, 414/414 replay duplicates, one listener,
  Gmail/Slack connected, checkout sends and Community lifecycle preserved.
- Boundary: no guessed identity, provider/customer/Plutio/credential/payment/
  contract write, broad minion access, Circle/lifecycle/checkout/legacy change,
  or destructive rollback.

### NC-20260825-003

- Owner direction: proceed with the accepted Relationship Context plan and
  implementation. Decision
  `.program/decisions/decision-relationship-context-dark-foundation-2026-08-25.json`
  authorizes local source/tests/docs/commit/push only and excludes every
  production/provider/customer/Plutio/minion/deployment boundary.
- Isolation: clean worktree `/private/tmp/nanoclaw-relationship-context-dark`
  and branch `codex/relationship-context-dark-foundation-20260825` from exact
  current reviewed/live lineage `683d61208e1c`. Dirty primary and all unrelated
  worktrees remain unchanged.
- Plan review: Sonnet/high R1 found missing legacy source backfill, JSON bounds,
  merge proof specificity, and host-derived work binding. Corrections add a
  conflict-refusing/idempotent backfill, 8,192-byte DB/validator bounds,
  explicit seven-surface merge tests, and remove work ID from the model schema.
  R2 closed three findings and left one minor named-test gap, fixed mechanically
  before source edits.
- Implementation review: Sonnet/high R1 found four material issues: false
  query-delivery success, unresolved-observation lineage drift, collapsed
  query ambiguity, and an underspecified rollback/registry proof packet. The
  implementation now records one-way pending-to-delivered/failed transport,
  links late-resolved observations exactly once while refusing Party conflict,
  distinguishes `ambiguous`/`needs_identity`/`not_found`, and proves guarded
  rollback. R2 closed those load-bearing findings. Its remaining source-packet
  ambiguity was mechanically audited: semantic versions were already checked;
  privacy/identity declarations and source-ref scopes are now explicitly
  validated, and valid multi-fact batches use a separate 256-KiB envelope while
  every persistable value remains capped at 8 KiB.
- Source: migration/rollback 137 plus provider-neutral contracts, registry,
  fixture-only LMS adapter, identity/store/service, policy/grants, IPC handler,
  dry-run Plutio planner, container tool, tests, and release packaging.
- Safety: global feature defaults off; migration grants only admin; no group
  gets a context grant; exact one-shot host grant binds directory group, run,
  container, host-derived work, subject, purpose, sections, max age, and expiry;
  context grants no action. No real adapter has a credential/network surface.
- Disposable PostgreSQL: apply, legacy backfill/replay/conflict refusal,
  oversized JSON refusal, merge lineage, store/projection/query behavior, zero
  non-admin grants, populated rollback refusal, and empty rollback pass. Both
  disposable databases were removed.
- Current verification: relationship-focused 9 files / 30 tests pass; the
  opt-in PostgreSQL store test passes 1/1; container runner build and all 45
  tests pass; root format/typecheck/build, docs continuity, capability matrix,
  and diff checks pass. Full root has 298 files / 3,274 tests pass and 10 files /
  24 tests skipped, with only the pre-existing unrelated CNPC wrapper contract
  failure.
- External state: none. No production database/provider/credential/customer/
  Plutio/Booking/minion/configuration/deployment/communication mutation.

### NC-20260824-010

- Trigger: owner-reported repeated `#gru-chief` errors after lifecycle
  activation.
- Diagnosis: 16 shared-error executions all identify the lifecycle workflow,
  normalization node, and `unsupported_heartbeat_action`. Real Heartbeat bodies
  omit the registered action name; the single callback lacked deterministic
  field inference. The host also required privacy-discarded `name` and
  `courseName` fields.
- Containment: exact deletion/readback removed only the four new provider rows,
  restored the protected 18-row baseline, and disabled only the lifecycle
  workflow. n8n stayed healthy with zero active executions and no alert increase
  across the bounded post-disable observation.
- Correction: infer only one of the four mutually exclusive minimal shapes,
  reject ambiguous/explicit-mismatch payloads, accept minimized `USER_JOIN` and
  `COURSE_COMPLETED`, and execute every relay output through the host parser in
  tests. The reviewed change is rebased onto exact live `61b12648`, preserving
  the concurrent prospective checkout-send boundary.
- Verification/review: focused 103/103, typecheck/build/format/diff, full root
  3,213 pass / 19 skip with only the unchanged CNPC failure, runner 43/43, and
  bounded Claude Sonnet/high R1 `NO MATERIAL FINDINGS` in six calls / 91,943
  maximum context tokens with no warning.
- Boundary: providers stay absent and the workflow stays inactive until exact
  release deployment, four direct canaries, and no-error proof. Those gates now
  pass; the same four rows are restored with exact readback and registry receipt
  4. Circle, legacy receivers, lifecycle consumers, and student/provider
  mutations remain excluded.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260824-010-student-lifecycle-relay-correction.md`.

### NC-20260824-009

- Authorization: accepted Growth decision
  `decision:abandoned-checkout-two-reminder-activation-2026-08-24` authorizes
  a prospective two-reminder system, provider assets, pilot canary, and normal
  reviewed release. Historical and already shadow-ready cases are excluded.
- Claude plan R1: `CHANGES REQUIRED`. It found expired-transient consent
  erasure, stale sibling-case touch-two risk after reopening checkout, missing
  independent per-touch scheduling, and missing locale propagation. The R2
  implementation plan incorporates all four.
- Contribution: extend the proven shadow ledger with policy-v2 consent,
  locale/safe return URL/product context, separate migration-136 send intents
  and append-only receipts, exact current/sibling purchase suppression, and a
  minimized Encharge event handoff.
- Review: implementation R2 found ambiguous lease replay and a missing
  touch-one prerequisite. Expired leases now enter receipted `held`; touch two
  waits for accepted touch one or suppresses after terminal non-acceptance.
  Disposable PostgreSQL proves both paths and correction R3 returned
  `NO MATERIAL FINDINGS`.
- Provider design: eight locale/touch branches, reply tracking on touch one,
  reply/category suppression before touch two, pilot-only canary first, then
  legacy trigger retirement while existing entrants drain.
- Boundary: no pre-cutoff/current-case send, historical replay, synthetic
  purchase, required-student-message coupling, or payment/accounting/CRM/
  booking/roster/access mutation.

### NC-20260824-008

- Trigger: the owner directed Claude Code and Codex to converge and implement
  one grading routine for the English, French, Japanese, and Spanish Mentor
  Coaching Foundation variants, with faculty-quality feedback in the course
  language and no separate routine command per locale.
- Initial release baseline: `7a36d79ca787`, which already contains
  the accepted grader output/live-assignment/materiality foundation. The dirty
  primary checkout is not a release input. Standalone grading authority is
  committed locally at `85243f136d0d68d28d9b03210fe8ec5301bc58f9` and has no
  remote by privacy design.
- NanoClaw source commit: `1576762a` on
  `codex/grader-multilingual-variants-20260824`.
- Live-lineage revalidation found production at `a055ea05705d`; merge
  `20e6dad8` preserves that deployed multilingual facts/knowledge release before
  any grader activation. The older `5af503cc` archive was rejected before
  transfer/deployment and will be rebuilt from the combined descendant.
- Implementation: 24 live written registry mappings, four separate completion
  variants, 18 localized snapshots/packs, four locale profiles, shared decision
  precedent marked `precedent_shared`, exact course-source verification,
  variant/locale/language exact-turn context, conservative locale/name/output
  gates, and the manifest-driven four-course operator workflow.
- Review: Claude Sonnet/high R2 found one P1 Japanese `さん`/`様` false positive
  plus two P2 calibration/source-integrity issues. Codex fixed all three;
  correction review R3 returned `ACCEPT` with no remaining material finding.
- Release boundary: English behavior remains enabled. French, Japanese, and
  Spanish may stage/review Slack feedback only; manifest flags keep Heartbeat
  writeback, completion-tracker mutation, certificate readiness, issuance, and
  notification disabled pending locale calibration and a later release gate.
- Verification before isolated release: focused grader suites/typecheck,
  standalone grading validators/packs/source comparison, personal skill/
  manifest/ledger validators, full root suite with any unchanged baseline
  failure separately evidenced, continuity, build, and release integrity.
- Pre-merge isolated verification: focused 8 files / 215 tests. Combined-live-
  lineage verification: focused 10 files / 243 tests; typecheck, build,
  formatting, documentation continuity, capability matrix, and diff checks
  pass. Full root is 3,230 pass / 19 skip with only the unchanged CNPC wrapper-
  contract failure; its source/test files are byte-identical to exact base.
- External state: no private submission, grading record/ledger, provider,
  Slack, Heartbeat, certificate, runtime, deployment, restart, or customer
  action occurred during implementation/review.
- Deployment: clean combined commit `44298a9f03d7d3215b48ad2f0ae4bdda9dcea097`
  built under Node `22.23.2` as a 944-file artifact with source tree
  `4ca8d27ae40921cdb90c05b16db1c4299073fac7`, artifact digest
  `88d1a4c7f40e939e9b56a377f2bb2ed3b4c462bbd69c0d8c192d1a126e6712ae`,
  and archive digest
  `ed8eccf564d6445c83fe6ecb76f42abbf24514ba77b70ca4db6e7cc6884829b1`.
  Studio and Mini independently verified the archive. The queue drained to
  zero, pending sends were zero, WAL-safe and grader-authority backups were
  captured, and the three-pointer activator moved production from `a055ea05`
  to `44298a9f` with health verification and rollback plist
  `com.nanoclaw.plist.rollback-a055ea05705d-2026-08-24T21-59-00-490Z`.
- Live verification: release identity, code-root match, Node pin, Gmail, Slack,
  empty waiting/outgoing queues, task-critical grading aggregate hash
  `26ee76be4351af6f108d663ff21da49dfd03137aca0d1c04436308df009694a5`,
  and release/operational grader-prompt hash
  `cf8cf3c0b63d5d4953ae003269da6f3764437dc4a4f55af8e1f9bb52ed12dfcd`
  all pass. A content-free check in the activated release loaded 32 assignments,
  proved 24 live written mappings as six each for `en-US`, `fr-FR`, `ja-JP`,
  and `es-419`, accepted one compliant sample per locale, and rejected the
  tested locale failure per non-English language. It created zero Slack posts
  and zero student records; an actual localized model-feedback outcome awaits
  the first natural submission and blind faculty review.

### NC-20260824-003

- Authorization: accepted owner instruction and
  `decision:mcs-localization-knowledge-repair` cover this internal knowledge
  correction and its normal reviewed release.
- Verified gap: Sales knowledge names only the English Foundations product.
  Current versioned course records show Spanish 25/25 Published, Japanese
  25/25 Published, and French 27/27 Published; all three localized sales pages
  return HTTP 200 with dedicated checkout product keys.
- Contribution: one source-controlled language catalog and exact generated KB
  block survive generic regeneration and make drift visible before Sales can
  deny an available localized product again.
- Boundaries: no reply to the current prospect; no provider, course,
  enrollment, payment, translation, entitlement, price, customer, or message
  mutation; do not imply the live Standard Path cohort is localized or that
  ICF itself issued translated MCS recognition.
- Required completion: every tracked minion KB contains the exact pack;
  injection/replacement/drift tests pass; independent Sonnet/high review has no
  unresolved material finding; exact release is deployed; live Sales KB bytes
  and healthy service/queues are read back.
- Review: Sonnet 5/high R1 found a non-array `locales` crash, missing malformed
  Python cases, and decoded/re-encoded rather than raw-byte TS hashing. The
  correction guards every JSON shape, tests all validator branches, and hashes
  the production Buffer. Focused R2 returned `NO MATERIAL FINDINGS`.
- Verification: Python 5/5, focused TypeScript 29/29, all 13 exact KB blocks,
  typecheck/build/shell/continuity/capability/diff pass. Full root is 3,210
  passed / 19 skipped / the unchanged CNPC wrapper failure.

### NC-20260824-007

- Authorization: accepted Community-only provider decision permits stages 2-4
  after the dark foundation. The initial manifest is exactly `USER_JOIN`,
  `USER_UPDATE`, `GROUP_JOIN`, and `COURSE_COMPLETED`, all with empty filters.
- Implementation: exact MCF cohort catalog and protected 18-registration
  baseline; fail-closed catalog/provider/reconciliation CLIs; aggregate-only
  health; disabled-first n8n relay; same-key conflict refusal; guarded shared
  Heartbeat/n8n inventory, configuration, import, activation, backup, readback,
  and rollback operations.
- Review and verification: the earlier source-lineage review returned no
  material findings. The combined lineage passes 83 focused and four
  production-shape integration tests, typecheck/build/format/continuity/
  capability gates, full root 3,206 pass / 19 skip with only the unchanged CNPC
  wrapper failure, and runner 43/43. Fresh bounded Sonnet/high R2 returned
  `NO MATERIAL FINDINGS`; its 10 calls reached 110,334 context tokens, recorded
  as a slight bounded-review threshold warning. The earlier release candidate
  was rejected without deployment.
- Live preflight: main Community still matches the exact 18-row protected
  registration baseline. n8n advanced independently to 25 workflows / 24 active
  while the lifecycle target remains absent; zero n8n executions were active.
  Protected n8n and NanoClaw backups were taken before any provider mutation.
- First inactive import: n8n 2.9.4 refused the 37-character reviewed workflow
  ID at its `varchar(36)` boundary before creating any workflow. The source ID
  is shortened to 34 characters, the static contract now enforces `<= 36`, and
  the shared guarded toolbox validator/test are corrected in `71f35cf`. Focused
  source/toolbox tests pass and bounded Sonnet/high correction R3 returned
  `NO MATERIAL FINDINGS` in four calls / 47,028 maximum context tokens.
- Boundary: no lifecycle provider, workflow, configuration, secret, catalog,
  event, action, message, certificate, or Circle state has changed under this
  task. Cohort progress remains fail-closed on HTTP 401 and shadow completion
  still requires 14 days plus two complete progress scans.

### NC-20260824-006

- Authorization: accepted decision
  `decision-abandoned-checkout-recovery-implementation-2026-08-24` permits the
  normal reviewed source/provider/deployment path only in shadow mode. Customer
  recovery sends, historical outreach, Encharge activation/category mutation,
  spending, synthetic purchases, and adjacent business actions remain excluded.
- Design validation: Claude Sonnet/high R1 required explicit account-specific
  timing and the complete NanoClaw release-integrity protocol. The implementation
  uses Tandem capture plus a 45-minute timeout (or five-minute payment-failure
  fast path), while Heartbeat remains event-driven for failure and expiry.
- Implementation: migration 135 adds separate admin-only cases, aliases, events,
  and receipts; strict HMAC ingress and fixed-account Stripe facts converge with
  terminal purchase precedence; reports and transition-only internal projections
  are content-minimized and explicitly state that no customer message was sent.
  Tandemweb adds a server producer and versioned unchecked reminder consent. The
  shared Stripe toolbox adds read-only inventory and confirm-gated additive event
  destination reconciliation.
- Review: Claude Sonnet/high implementation R1 found terminal-precedence,
  archive-minimization, registry-evidence, and timeout-documentation issues.
  Codex fixed the three verified defects and clarified the false-positive
  registry claim; fresh correction R2 returned `NO MATERIAL FINDINGS`.
- Verification: focused checkout tests, disposable PostgreSQL store 3/3,
  migration apply/replay/permissions/rollback lifecycle, Tandemweb PHP/JS/static
  contracts, and toolbox shell/registry contracts pass. The full NanoClaw suite
  passes 3,187 with 17 skips and only the unchanged CNPC wrapper-contract
  baseline failure; typecheck, build, format, capability, and diff checks pass.
- Boundary: source is ready for deployment. No production schema/config, n8n,
  Stripe destination, WordPress runtime, customer message, Encharge flow, CRM,
  booking, roster/access, accounting, or payment state has changed yet.
- Deployment: exact merged release `7a36d79ca787…` is live after protected
  backup, migration 135, a handled concurrent-lineage collision, and a clean
  three-pointer activation from `cf05bca3`. Tandemweb `0d09278fb`, the
  retention-free downstream-acknowledged n8n relay, and two durable five-event
  Stripe triggers are live. One signed consent-denied non-customer canary
  returned HTTP 200 after NanoClaw acceptance and appears in owner readback as
  one `captured/denied/ineligible` Tandem case with
  `customer_sends=false`.
- Remaining outcome: wait for the first natural eligible case and exact
  completion/suppression/owner-notification receipt. No historical replay,
  manufactured Stripe event, or customer recovery send is authorized.

### NC-20260824-005

- Scope: the exact reviewed Community foundation only. Provider activation,
  legacy cutover, credentials, actions/messages/certificates, minion authority,
  and Circle were excluded.
- Release: exact source `7364accd53aed9e1808dc0882592312a0e1ac5ae`,
  verified 904-file artifact and archive under Node 22.23.2.
- Production: protected PostgreSQL/SQLite/plist backups; additive migration 134;
  one three-pointer activation with retained rollback to `778545b3…`.
- Live proof: exact release/tree/artifact/code root, one listener, Gmail/Slack,
  zero waiting/outbound backlog, lifecycle disabled, zero lifecycle config
  keys/rows, admin-only schema, and unchanged 273-line error baseline.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260824-005-student-lifecycle-community-dark-deploy.md`.
- Boundary: natural existing work ran after restart without queue buildup; it
  was not interrupted to manufacture an empty-active sample. Provider ingestion
  and natural student-lifecycle outcomes remain untested and unauthorized.

### NC-20260824-004

- Trigger: the owner directed implementation of the accepted student-lifecycle
  design for Community only and explicitly deferred Circle until Community is
  ready.
- Authority: accepted decision
  `.program/decisions/decision-student-lifecycle-community-dark-foundation-2026-08-24.json`
  permits isolated local source/tests/migration design/inactive n8n export. It
  excludes production/provider/runtime/deployment/credential/action/message/
  certificate/minion changes.
- Plan review: Claude Sonnet/high R1 returned `APPROVED WITH MATERIAL
CORRECTIONS`. The plan now includes the missing fixtures-only reconciliation
  runner, archive-before-identity ordering, streaming byte limit, and explicit
  no-agent reaper branch/tests.
- Local implementation: migration/rollback 134; Community parser/minimizer and
  HMAC contract; admin-only identity/catalog/event/projection/history/run/
  exception store; fixtures-only reconciliation; dedicated default-off route;
  mechanical replay; inactive no-credential n8n template; structure/security/
  reliability/release-package updates.
- Evidence so far: focused 129/129 pass with two opt-in integration tests
  skipped in the ordinary run; the opt-in store suite passes 2/2 on disposable
  PostgreSQL. Migration apply, zero non-admin grants, empty rollback, reapply,
  and populated-history rollback refusal pass.
- Boundary: Circle was not accessed. No production database, Heartbeat/n8n/
  WordPress/Pabbly/Encharge, credential, runtime, deployment, schedule,
  message, certificate, action, student record, or minion state changed.
- Full repository evidence: 3,161 pass / 14 skip with the sole unchanged
  pre-existing CNPC wrapper-contract failure. Build, format, continuity,
  capability, diff, secret/Circle, migration, and disposable store gates pass.
- Implementation review: Sonnet/high R1 found one P1 unstable
  ABANDONED_CART/MENTION redelivery key and one P2 shared relay/identity secret.
  Both are fixed and mechanically verified; Sonnet/high correction R2 returned
  `NO MATERIAL FINDINGS`.
- Completion: implementation commits `9155ad9d` and `7364accd` were pushed.
  The separately governed dark deployment is complete under
  `NC-20260824-005`; provider activation and Circle remain separate.

### NC-20260824-001

- Authorization: accepted owner instruction and
  `decision:human-first-slack-notifications` authorize a presentation-only
  correction and the normal reviewed release path.
- Contribution: internal Slack previews state the actual business event before
  implementation tags, identifiers, dispositions, or debug output.
- Scope: Contador payment summaries, Chaos website activity, and the adjacent
  verified-form notification identified by the bounded audit. Payment
  processing, lead classification, routing, customer messages, provider
  events, schema, credentials, and schedules remain unchanged.
- Implementation: add pure formatters and focused tests, retain operational
  metadata below the human-readable first line, then independently review and
  deploy without manufacturing a payment or website event.
- Verification: focused notification/host regression, TypeScript typecheck,
  build, full root suite with any unchanged baseline failure identified, docs
  continuity, Claude Sonnet/high review, immutable release, and exact live
  health/readback.

### NC-20260823-006

- Correction pickup 2026-08-27: the owner said to keep going after the natural
  audit identified two expired admission-only cases and dead-lettered
  `invalid_charge_alias`. This authorizes the smallest schema/runtime repair,
  exact two-case host-only terminalization, normal independent review/release,
  and live proof. It does not authorize event/provider replay, repair of the
  separate missed-ingress payment, product/student mapping, refund closure,
  accounting, or communication.
- Intended correction: extend the provider charge-alias contract to every
  legitimate Stripe charge-object prefix confirmed by current provider
  tooling; make failure terminalization independent of a malformed optional
  alias; provide a default-dry-run exact-case repair that refuses nonexpired,
  nonprocessing, or version-mismatched state and writes failed stage/final
  receipts without calling any external system.

- Pickup 2026-08-27: the owner reported a course payment today and noted that
  refund validation may remain blocked. Company OS revision 138 has no active
  item; this existing authorized waiting item is resumed only to verify the
  natural payment gate.
- Natural payment evidence: the later of two distinct same-course charges today
  reached exact live `6a978328`, created one version-0 case, completed in one
  attempt, appended charge/event/payment-intent aliases, recorded all six
  verified stage receipts, and bound one handled n8n webhook row.
- Adjacent ingress finding: an earlier distinct same-course charge today has no
  webhook-inbox row, fulfillment case, or PostgreSQL payment row. It did not
  enter the host-admitted case boundary and cannot be repaired or replayed
  under this task. Preserve it as a separate ingress-parity incident.
- Refund scope: no natural refund is required to validate the admitted payment
  path. Refund/roster closure remains the separately proposed operational slice.
- Ledger-wide readback: six cases are complete, two `needs_product`, one
  `write_failed`, one refund `needs_review`, and two remain `processing` since
  August 25–26. Both processing leases are expired; cases have four/three
  admission-only attempts and no later stage receipt.
- Terminalization defect: the two source inbox rows are dead-lettered after
  five attempts with bounded error `invalid_charge_alias`. The tracked alias
  constraint and host validator accept `ch_` charge aliases, while Stripe's
  current charge surface also supports `py_`; exact offending values were not
  retained in evidence, so that compatibility cause is an evidence-backed
  inference pending implementation review.
- Disposition: the natural happy path is validated, but the work item remains
  waiting because expired `processing` is neither complete nor an owned
  terminal exception. Fixing compatibility and terminalizing existing rows
  without external replay requires a bounded correction/data decision.
- Program reconciliation: revision 142 leaves the item `waiting`, registers
  `work:stripe-payment-ingress-parity` as a separate unauthorized candidate,
  and keeps product/student identity dependency-blocked. Refund closure remains
  its own candidate and is not required for the admitted-payment proof.
- Final program reconciliation: revision 146 marks the host-admitted ledger
  done with all correction commitments closed. No active/eligible item remains.
  Ingress parity is the first priority candidate; product/student identity is
  dependency-complete but still unselected, and refund closure stays separate.

- Authorization: accepted decision
  `decision:contador-fulfillment-case-ledger-authority` covers this C4
  implementation and normal reviewed release path.
- Contribution: each host-admitted Stripe payment/refund must either reach
  verified operational completion or remain in a durable, replayable owned
  exception instead of disappearing after a script exit or Slack summary.
- Boundary: Contador remains the Stripe-to-student operational bridge. Bizmgr
  owns accounting; QuickBooks remains manual. Historical repair, product-ID
  mapping, payer/student redesign, payable work, customer communication,
  schedules, and credentials are separate work.
- Immediate action: inspect the exact webhook acknowledgement, processor exit,
  Payment Log/PostgreSQL/roster readback, migration conventions, and live
  aggregate baseline before choosing the smallest schema/host seam.
- Required completion: focused/full tests, disposable migration/rollback,
  Claude Sonnet/high review and material corrections, immutable build,
  production backup/migration/deployment, structural/health/non-interference
  proof, and only natural future payment observation.
- Deployment: exact release `b131071c74fc…` is live after a natural zero-work
  drain, custom-format PostgreSQL plus WAL-safe SQLite/plist backups, migration
  133, and exact three-pointer fast/main activation. Three tables are empty,
  admin-only, and structurally verified; protected payment/webhook aggregates
  remain 261/249 with zero active Stripe inbox rows; channels/queues/listener
  and 273/24 error baselines pass. The first natural typed Stripe event remains
  the outcome gate.

### NC-20260822-011

- Authorization: accepted decision
  `decision:gmail-attachment-processing-authority` permits the complete
  host-owned processing boundary and its normal release path.
- Implementation: exact authorized Gmail message reads keep attachment IDs and
  bytes host-private; enforce traversal, item/message byte, type/magic,
  archive, encryption, OCR, output, and retention limits; and persist minimized
  terminal receipts without raw or extracted customer content.
- Review: Claude Sonnet 5/high found three material boundary defects. Codex
  reproduced and fixed malformed ODF false-ready state, non-terminal ZIP
  inspection rejection, and decoded-byte total-limit bypass. The focused
  correction review returned no material findings.
- Verification: Node 22.23.2 focused suites are 170/170 and 284/284; typecheck,
  build, agent-runner build, and 43/43 runner tests pass. Full root suite is
  3,050 passed / 12 skipped / the unchanged CNPC wrapper-literal failure.
- Deployment boundary: use the immutable release workflow, rebuild/sync the
  changed agent runner before host activation, retain rollback and a WAL-safe
  SQLite backup, and prove schema, service, channels, queues, and
  non-interference. Do not manufacture an email or scan the mailbox broadly.
- Deployment: exact `195dd3b3664…` is live after archive verification,
  runner-image/snapshot refresh, required converter installation, zero-work
  drain, WAL-safe backup, three-pointer fast/main activations, and rollback
  retention. Exact health, channels, listener, queues, schema, empty receipt
  count, dependencies, and unchanged error baselines pass.
- Outcome gate: after deployment, observe only natural supported and held
  attachments before claiming workflow outcome validation.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260822-011-gmail-attachment-processing.md`.

### NC-20260823-005

- Authorization: accepted decision
  `decision:self-healing-sequential-expansion-pilot` permits exactly three
  sequential admissions while `MAX_ITEMS=1` remains unchanged.
- Source one: `healer:d0ca940a103136d3`; correct the verified internal timeout
  logging defect, review/release it normally, then rotate configuration and
  require terminal receipt plus exact replay.
- Source two: `healer:d3c78b967b64588f`; verify its claimed self-healing runner
  sync outcome and close only from current evidence.
- Source three: `healer:458c0d2b7dc15d5b`; investigate intended CaleProcure
  operating state. Feature enablement is not authorized by this pilot alone.
- Boundaries: no parallel sources, concurrent-cap increase, bulk backlog,
  automatic healer action, customer communication, schedule/credential change,
  or substituted source order.
- Progress: reviewed release `d4f428912679…` is live. Sources one and two are
  each `resolved/verified_fixed` with completed version-2 work, three
  observations, three events, one receipt, and duplicate-only replay.
- Decision gate: source three's daily job is enabled while collector, ingest,
  and review gates are off; historical three-shadow proof is incomplete.
  Owner accepted the safe state: all gates remain off and only the
  contradictory daily job was disabled after backup. Registry and SQLite
  scheduler both read disabled; all other registry content is unchanged.
- Source-three closure: `healer:458c0d2b7dc15d5b` records Alex Kudinov's named
  no-action decision and is completed version 2 with two observations, three
  events, one bound decision receipt, and duplicate-only replay. It does not
  claim a successful collection outcome.
- Final boundary: all four admitted healer work items are terminal. Any next
  source, concurrency increase, or CaleProcure reactivation needs a new
  accepted decision.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260823-005-sequential-healer-pilot.md`.

### NC-20260823-004

- Authorization: accepted decision
  `decision:self-healing-first-resolution-remediation` covers only incident
  `563834` / source `healer:16963ebd92091e9f` and its existing Company Work
  projection.
- Root cause: the original PostgreSQL error was emitted by a one-off Node
  `[eval1]` diagnostic query. No runtime source references singular
  `work_type`; current contracts use `workflow_type` or `work_types`.
- Remediation boundary: do not run the proposed generic Knex/Prisma command or
  invent a migration. Record the evidence-backed operator correction, verify
  recovery, let the one-source adapter close the bound work item, and prove
  replay/non-interference.
- Result: source is `resolved/verified_fixed`; the existing work item is
  `outcome_validated/completed` version 2 with three observations, three events,
  and one bound recovery receipt. The next fast cycle was duplicate-only.
- Verification artifact: one bad Codex read-only SELECT emitted an operator
  `[eval1]` error. Its exact pending log range contained no other error; the log
  was preserved and a guarded cursor advance plus unique suppression receipt
  prevented a fabricated second incident/alert.
- Expansion recommendation: keep `MAX_ITEMS=1` and rotate only after terminal
  receipt/replay. Start with `healer:d0ca940a103136d3` (46-occurrence expected
  timeout logged as error), then verify `healer:d3c78b967b64588f`, then make a
  separate feature-activation decision for `healer:458c0d2b7dc15d5b`.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260823-004-first-healer-resolution.md`.

### NC-20260823-003

- Authorization: accepted decision
  `decision:self-healing-owner-presentation-canary` permitted one bounded daemon
  restart and one existing exception-loop packet/pickup/attempt.
- Result: startup tick posted one healer packet, suppressed two unchanged
  packets, and created one dispatch with events
  `posted,picked_up,attempt_succeeded` and state `attempted/1/posted`.
- Truth boundary: the healer work remains `accepted/blocked/1`; the Chief
  attempt is not source resolution or remediation.
- Non-interference: no second source, duplicate packet, failed attempt,
  customer communication, schedule, credential, or new daemon error.
- Next action: none for presentation/pickup. The named owner decision and any
  remediation remain separately authorized.

### NC-20260823-002

- Trigger: after the dark deployment completed, the owner said to deploy and
  keep moving. A live read-only catalog aggregate found 146 current incidents:
  137 pending decisions and nine verified recoveries. Unbounded activation is
  therefore rejected as an unsafe backlog burst.
- Authorization: accepted decision
  `decision:self-healing-bounded-natural-projection` and program revision 38
  permit one exact naturally existing source only, with implementation,
  commit/push/release, dark deployment, one-source configuration, projection,
  exact replay, report readback, and non-interference evidence.
- Required controls: adapter defaults off; exact source key allowlist is
  required when enabled; maximum items is exactly one; unknown/missing/duplicate
  source identity fails closed; the host cycle isolates projection failure from
  observation/diagnosis and exposes content-free health.
- Exclusions: no second source, manufactured incident, Slack post or owner-work
  presentation, remediation/action, schedule change, credential change, or
  other external mutation.
- Review/release closure: updated Claude token rotation completed the bounded
  Sonnet/high review. One stale `decision_actor` invariant defect was fixed;
  the targeted correction review returned `NO MATERIAL FINDINGS`. Exact
  release `883f375f5ceb…` is live on main and fast-healer services, and the
  natural fast cycle remains duplicate-only with 1 item / 1 observation / 2
  events.
- Next action: none for this one-source milestone. Expansion, owner resolution,
  and remediation remain separately authorized.
- Implementation: the adapter reads no catalog while disabled; active mode
  requires one valid exact source and `MAX_ITEMS=1`; missing/invalid source
  fails before a transaction. The fast collector consumes only content-free
  status and isolates projection failure. Release-bound helpers update `.env`
  and the separately managed fast-healer plist through dry-run, exact-host,
  exclusive backup/lock, atomic mutation, rollback, and one-cycle verification.
- Verification: focused bounded-control set 58/58; healer plus report set
  284/284; pinned Node 22.23.2 typecheck/build, formatting, documentation
  continuity, script syntax, and diff checks pass. Broad suite passes 3,019 of
  3,020 with 12 skips; the only failure is the unchanged CNPC wrapper assertion.
- First dark fast-healer activation: the target release verified and one cycle
  exited zero, but launchd reset `runs` from the predecessor's 6,489 to one on
  unload/load. The helper incorrectly required the new counter to exceed the
  old counter, timed out, and automatically restored the prior plist. The main
  daemon remained healthy on `0ddb8794`; no projection/configuration occurred.
  The correction now requires at least one clean post-load run and retains the
  state/exit checks.
- Final result: corrected release `d39bc073…` is live on both main and
  fast-healer services. One natural critical `needs_human` source projected to
  one `accepted/blocked` work item with one observation and two events. Exact
  replay remained 1/1/2. The healer report returns one attention item without
  contradictory state, event gap, missing receipt, or source gap. Non-healer
  work/event fingerprints and all 76 receipts remain unchanged; main/fast error
  line counts stayed 273/24; Gmail/Slack and queues are healthy.

### NC-20260823-001

- Trigger: after reviewing the completed local NC-017 milestone, the owner
  explicitly instructed deployment.
- Authorization: accepted decision
  `decision:self-healing-resolution-dark-deploy` permits the reviewed branch
  commit/push, immutable release construction, production drain and affected-
  state backup, additive migration 132, exact release activation, and
  structural/non-interference verification.
- Required dark state: `COMPANY_HEALER_WORK_ENABLED=0`; the adapter remains
  absent from daemon/scheduler/Slack/action wiring. Migration and release
  presence grant no live projection or remediation authority.
- Exclusions: no live healer incident projection, owner-work presentation,
  Slack post, remediation/action, shell rerun, code implementation, schedule
  change, credential change, or adapter enablement.
- Rollback: preserve the prior immutable release/plist and affected PostgreSQL
  backup. An additive populated migration remains dormant on host rollback;
  never erase healer-resolution history.
- Immediate next action: commit/push the deployment authority record and build
  one clean immutable artifact before production preflight.
- Result: implementation `e7ddaf9e` plus authority/continuity commit `97026492`
  were pushed. The 876-file artifact and archive independently verified
  locally and on the Mini. Production drained to zero active work; migration
  132 applied after a mode-0600 `business_v2`/plist backup; activation changed
  only the three permitted release pointers and retained rollback to
  `1f474f90`.
- Live proof: exact release/code root/Node identity, one listener, Gmail/Slack,
  empty active/outgoing queues, disabled healer adapter, empty healer report,
  admin-only empty schema, append-only trigger, zero non-admin grants, unchanged
  error-log line count, and unchanged 25-item/164-event/76-receipt fingerprints.
- External state: migration 132 and the exact immutable host release are live.
  No incident projection, Slack post, owner-work presentation, remediation,
  schedule, credential, or adapter activation occurred.

### NC-20260822-017

- Trigger/base: the owner continued directly from committed dry-run checkpoint
  `502bf5a5`; program revision 34 claims the still-eligible healer item.
- Schema finding: existing Company Work events/receipts already cover blocked,
  reopened, outcome-validated, and cancellation lifecycles. The missing pieces
  are a truthful `healer_resolution` workflow/completion contract and an
  append-only minimized observation source.
- Result: migration/rollback 132 add those constraints and the
  observation table with catalog version, resolution/evidence hashes,
  disposition, decision code, explicit owner key, hashed named-decision actor,
  and observation time only. Rollback refuses any item or observation history.
  Both files are bound into immutable release construction.
- The healer-specific writer supports blocked evidence updates, exact verified
  or named-no-action receipts, recurrence reopening, and append-only minimized
  observations. Anonymous rejection remains pending. The adapter defaults off
  and has no daemon, scheduler, Slack, collector, approval, remediation, or
  implementation import.
- Boundary: local source only. No production database/provider read or write,
  migration application, Company Work projection, Slack post, healer action,
  configuration, deployment, restart, credential, or external state change.
- Verification: pinned Node 22.23.2; healer 26 files / 230 tests; focused
  ledger/report set 86/86; typecheck, build, formatting, and diff checks pass.
  Disposable PostgreSQL proves open/replay/update/verified-close/reopen/named-
  no-action closure, append-only refusal, zero non-admin grants, populated
  rollback refusal, and empty rollback success. The broad suite passes 3,009
  tests with 12 skips; its sole failure is the unchanged base CNPC wrapper-
  literal assertion.

### NC-20260822-016

- Trigger/base: the owner continued the now-eligible healer work after the
  read-only catalog checkpoint `6703de6e`. Program revision 32 claims the item
  for this projection milestone.
- Compatibility result: current Company Work constraints accept only Sales,
  host-job, and program-facts workflows with fixed completion semantics. Healer
  decisions cannot reuse one without corrupting reports and receipts; the core
  item also has no general owner field.
- Implementation: a pure reconciler declares the required future
  `healer_resolution` workflow and plans stable ensure/update/reopen/verified
  close/named-no-action close/verification hold/no-op behavior from catalog and
  existing projection snapshots. Exact replay is no-op and changed evidence
  stays on the same source identity. The standalone CLI is dry-run-only and
  rejects `--apply`.
- State boundary: source, tests, package command, and documentation only. No
  migration, database/provider read or write, Company Work row, trigger,
  observation, receipt, Slack post, healer action, configuration, deployment,
  restart, credential, or external state change.
- Verification: projection/CLI tests pass 9/9; complete healer suite passes 24
  files / 218 tests; pinned Node 22.23.2 typecheck and production build pass;
  documentation continuity and diff checks pass. Broad suite passes 2,993
  tests with ten skips; its sole failure is the unchanged base CNPC
  wrapper-literal assertion.

### NC-20260822-015

- Trigger/base: the owner rejected a roadmap with no executable work and selected
  `work:self-healing-visible-resolution-loop`. Program revision 30 claims the
  item for this task. Implementation starts from exact live release `1f474f90`
  in an isolated worktree; the dirty primary and the older healer action slice
  remain untouched.
- Root cause: diagnoses and proposed fixes are durable in
  `business_v2.incidents`, but operator visibility is split across a terse
  source/severity digest, Slack threads, and direct JSONB inspection.
  `needs_human` has no owner/decision/closure contract; automatically assigned
  `wont_fix` is excluded from the digest; and a crash can leave diagnosis or an
  intermediate lifecycle state stored but not routed.
- Implementation: `src/healer/resolution-catalog.ts` selects only minimized
  fields, chooses one current incarnation per stable incident fingerprint, and
  classifies monitoring, verified recovery, named rejection, or one of the
  explicit pending-decision reasons. Visible diagnosis/proposed-resolution text
  is redacted and bounded; evidence is count plus SHA-256. Raw context,
  commands, diffs, Slack/thread identities, and investigation-log paths are
  neither queried nor emitted. `resolution-catalog-cli.ts` provides a standalone
  human/JSON view and has no write mode.
- State boundary: source, tests, package command, and authoritative docs only.
  No migration, production read/write, Company Work item, Slack post, daemon or
  scheduler wiring, action enablement, shell rerun, code implementation,
  configuration, deployment, restart, credential, or external state change.
- Verification: focused catalog/CLI tests pass 12/12; the complete healer suite
  passes 22 files / 209 tests; pinned Node 22.23.2 typecheck and production
  build compilation pass; documentation continuity and diff checks pass. The
  broad suite passes 2,984 tests with ten skips; its sole failure is the
  unchanged base CNPC wrapper-literal assertion.

### NC-20260822-013

- Trigger/base: Growth/SEO corrected bad Practitioner Series accreditation
  claims on public pages, exposing that course repositories, presentations,
  video descriptions, brochures, certificates, and NanoClaw minion knowledge
  could preserve conflicting copies. This release starts from exact live
  NanoClaw commit `db174c1b` in an isolated worktree; the dirty operational
  checkout and the older review-only `000d1797` branch remain untouched.
- Accepted authority: provider evidence, then accepted owner decisions, then
  the canonical `alex-kudinov/practitioner-series/program-facts` catalog, then
  course mirrors, then every derived surface. Stripe checkout is still price
  and active-sale authority, Heartbeat is learner-state authority, and
  Sertifier is issued certificate/template-state authority.
- Implementation: pin catalog revision 2/hash
  `d84b3b06db50d74eb38d4a55b55acf0a9d5d654d66aaa791d3dc935fe117af00`
  and its generated minion pack; inject the exact generated block into all 13
  tracked knowledge files; make both ordinary validation and regeneration
  fail closed on drift; extend the deployed version-1 detector while retaining
  its durable evidence schema and Company Work policy.
- Operational boundary: this task may publish and deploy the exact reviewed
  release and run one exact detector closure receipt. It does not alter price,
  product activation, learner state, certificate issuance, customer messages,
  credentials, migrations, schedules, or unrelated Company Work records.
- Verification/deployment: focused release-path tests pass 29/29 and Python sync tests pass
  2/2. Exact source, broad tests, release artifact, activation, live detector
  receipt, and rollback evidence will be appended before closure.

### NC-20260821-007

- Trigger/base: after exact release `8c4e3c2b` repaired invoice payment evidence
  and live-classified eight overdue invoices as ready only for internal
  Contador review, the operator directed continued Company OS work. This task
  starts from pushed closeout `c0d1f0dd` in a new isolated worktree.
- Intended outcome: produce one deterministic, bounded, source-bound review
  packet for exact `receivable` cases whose next action is `internal_review`,
  with a stable fingerprint and explicit decision vocabulary. The first slice
  is non-posting and default-dry-run so the operator can review the actual
  packet contract before any durable projection or channel activation.
- Initial boundary: source/report reads, pure packet code, focused tests, and
  authoritative documentation. No case projection, PostgreSQL write or
  migration, Slack post/reaction, Contador agent run, collection decision,
  customer draft/send, Plutio/payment mutation, schedule, or legacy-task
  restart is authorized.
- Overlap: NC-006 remains live and awaits a natural exact Sales receipt. This
  task consumes its read-only shadow contract but does not change that release,
  the dirty operational checkout, the active proposal loop, or any owner
  assignment source.
- Implemented candidate: `src/followup-review.ts` creates a deterministic,
  due-date-ordered packet of only exact policy-ready Plutio receivables. It
  defaults to ten items, caps at 25, binds the complete source snapshot plus
  per-item source/decision evidence, and exposes six non-executing Contador
  choices. `src/followup-review-cli.ts` is dry-run only; apply/post flags do not
  exist. Focused tests, typecheck, build, and documentation continuity pass
  under pinned Node 22.23.2. The broad suite passes 2,965 tests with ten skips;
  its sole failure is the unchanged baseline CNPC wrapper-literal assertion,
  present at base `c0d1f0dd`.
- Fail-closed canary: running the compiled candidate from the local operational
  checkout returned no packet because Business v2, SQLite-action, and identity
  reads failed, even though Plutio returned records. This is expected safety
  behavior, not clean-source/live-Mini proof.

### NC-20260821-006

- Trigger/base: after the full NC-005 Mini shadow returned zero ready work and
  named 111 unverified Sales thread identities, 42 Sales identity conflicts,
  four unresolved proposal owners, and eight unreconciled overdue invoices,
  the operator directed continued Company OS implementation. Base is the
  pushed milestone commit `b292b407` in a new isolated worktree.
- Intended outcome: make exact conversation lineage, accountable commercial
  ownership, and payment truth available as typed source evidence so the
  deterministic follow-up policy can distinguish genuinely eligible work from
  missing or contradictory facts. The source system remains authority; the
  adapter must block rather than infer.
- Initial boundary: repository/schema/current-source discovery and focused
  local tests. External reads may inspect aggregate/structure-only source
  behavior. No migration, historical backfill, case projection, operator
  presentation, draft, approval, source mutation, scheduler, or customer action
  is authorized by this task entry.
- Overlap: this continues NC-002/005's follow-up files and Plutio read surface.
  The legacy Sales task stays paused, the legacy proposal loop stays unchanged,
  migrations 130-131 stay empty/admin-only, and the operational checkout's
  unrelated dirty work is not touched.

### NC-20260821-005

- Trigger/base: after confirming the Company OS should improve business
  outcomes, automation, and minion intelligence together, the operator directed
  continued work. NC-002 left the broken daily Sales task paused and deployed
  only an empty/unwired policy and case store; its rollout sequence names
  source shadow and operator-reviewed backlog disposition as the next gate.
- Intended boundary: one-shot, host-owned, read-only source observation across
  exact Sales conversation, Plutio proposal, and Plutio invoice identities;
  content-free deterministic evidence; dry-run by default; exact confirmed
  projection only after source review; report newly ready/materially changed
  cases separately from unchanged waiting/blocked health.
- Exclusions: no customer prose or identity in the case ledger; no broad Gmail
  search; no Slack presentation, agent run, draft, approval, pipeline change,
  Plutio/payment action, scheduler/daemon wiring, legacy task resume, proposal
  loop retirement, or email.
- Implemented locally: policy `2026-08-21.3` adds fail-closed source-evidence,
  source-identity, and exact-thread-binding gates. The one-shot CLI defaults to
  dry-run; apply requires a reviewed SHA-256 snapshot plus exact confirmation
  and refuses source errors or source drift. The report details only new or
  materially changed work and aggregates unchanged health.
- Live read evidence: exact release `e01c9228` completed one full content-free
  Mini dry-run at snapshot fingerprint
  `4ed1974bcbc68bf3d8c92bee279e576acd07d1e95dd1982ac298eba798f9b3bf`.
  It observed 189 cases: 164 Sales, five proposals, and 20 invoices. Zero were
  ready; 165 were blocked, 12 waiting, and 12 terminal. The blocked set is 111
  unverified Sales thread identities, 42 Sales source-identity conflicts, four
  unresolved proposal owners, and eight invoices requiring payment
  reconciliation. The 12 waiting invoices represent USD 88,176.60 outstanding;
  this is an observed balance, not a collection authorization.
- Source repair: the first deployed dry-run failed closed after observing all
  189 records because the source adapter performed one Plutio people read per
  proposal/invoice and exhausted the bounded child-process window. Commit
  `e01c9228` replaced that N+1 path with one bounded `$in` recipient batch and
  isolates source completeness per lane. The corrected rerun had zero source
  errors and zero newly ready work.
- Verification: exact Node 22.23.2 typecheck and 63 focused tests pass;
  the unrestricted suite is 2,935 pass, ten skipped, and only the unchanged
  CNPC wrapper-literal assertion fails. Four production-PostgreSQL integration
  cases are skipped locally. The local
  initial toolbox Plutio read refused on an unrelated environment-file shell
  syntax error, and the Studio has no production PostgreSQL route by design.
  The verified Mini release path succeeded. Release commit `e01c9228` passes
  the 731-test email-critical gate and all 43 independent runner tests. Its
  daemon health was live-verified with one listener, connected Gmail/Slack,
  empty active queues, and exact Node 22.23.2. No projection was applied.

### NC-20260821-004

- Trigger/base: the operator asked why NanoClaw work repeatedly alternates
  among Node 22, 26, and other versions and directed continued implementation.
  Exact production release `3de6707d` already runs Node 22.23.2, but this
  non-interactive authoring shell starts on Node 26.7.0; three skill workflows
  still selected Node 20, version bump had no setup step, and the container
  floated on `node:22-slim`.
- Intended boundary: standardize NanoClaw itself on exact 22.23.2 without
  changing the workstation's global Node or touching the dirty operational
  checkout. A repository-owned launcher must hand ambient shells to the pin;
  dependency installation must fail closed on another engine; every workflow,
  package, image, release, startup, and health authority must agree.
- Scope/exclusions: repository/CI/container/runtime-contract files plus the
  later operator-authorized release/image deployment. No database, schedule,
  channel, customer action, or global Node mutation belongs to this task.
- Validation hazard: `scripts/validate-all-skills.ts` resets the current
  worktree while replaying skills. Running it before the task commit erased the
  uncommitted isolated patch. The operational checkout and production were not
  touched; the patch was recovered in the same disposable worktree. Do not run
  that validator against uncommitted work.
- Verification: an ambient Node 26.7.0 `npm run runtime:doctor` executes exact
  Node 22.23.2/ABI 127 and reports five aligned setup steps plus the exact image.
  Typecheck, build, format, continuity, capabilities, 29 focused runtime and
  release tests, and runner build/43 tests pass. The full root run is 2,919
  pass/one unchanged CNPC wrapper assertion/ten skipped. The official registry
  lists `node:22.23.2-slim`; a direct Docker CLI registry lookup timed out.
- Deployment: exact release `e01c9228` is live and health-reported Node 22.23.2.
  The prior `nanoclaw-agent:latest` ran 22.22.0 and is retained as
  `nanoclaw-agent:rollback-20260821-e01c9228-node22.22.0`. Rebuilding
  `nanoclaw-agent:latest` initially failed because the persistent Apple
  Container builder lacked DNS; restarting only the idle builder with
  `--dns 192.168.1.1` restored package resolution. The replacement build
  completed from exact release `e01c9228` with OCI manifest-list digest
  `sha256:8de63770c3b3c750e39a09f36f3c28a13f5044e61fb913678b8eec20a01d88f3`.
  The completed build session proved the exact base and compiled runner, but a
  fresh shell could not reacquire the Apple `container` CLI for a second launch
  smoke; verify exact Node on the next natural minion launch before deleting
  the rollback tag.

### NC-20260821-003

- Trigger: a customer asked Tandem to copy the visible participants in an
  inbound email, but the downstream minion received neither the visible
  envelope nor a bounded reply-all option and attempted a separately denied
  Gmail search.
- Business/automation/intelligence gain: eliminate the manual thread-ID/header
  lookup for this case; preserve source-bound participant context through
  routing; teach Sales and Chief when to propose, omit, or abstain from CC;
  retain deterministic host enforcement instead of widening Gmail access.
- Host boundary: Gmail parsing derives maximum-ten normalized candidates from
  the exact current message. It excludes the reply target, configured Tandem
  mailboxes, duplicates, BCC, and the internal envelope of forwarded inquiries.
  Direct and classifier-continuation routes pass the same context to Inbox,
  Sales, or Chief.
- Approval/execution boundary: latest-sender or exact-work-thread operator
  intent is required before a candidate can appear on a card. The exact Cc is
  operator-visible and immutable. Mailman passes it verbatim; the host re-reads
  the Gmail thread and blocks any out-of-Party address not still visible on the
  latest external message.
- Verification state: Node 22.23.2 typecheck passes; 287 focused recipient and
  prompt-contract tests pass; the 731-test email-critical gate including the
  43-test independent runner passes. The unrestricted suite remains at its
  unchanged one pre-existing CNPC wrapper assertion failure with 2,919 passing
  and ten skipped tests. Deployment and natural multi-recipient observation
  remain separate gates; no synthetic customer send will be used.
- Deployment proof: immutable release `3de6707d` is active on one Node 22.23.2
  listener with verified code/source/artifact identity, connected Gmail/Slack,
  and empty queues/containers. Pre/post action evidence is identical at six
  blocked, 85 confirmed, and 450 email events; `task-followup-daily` remains
  paused. Six operational prompts byte-match the release; Chief's independent
  grader customization was preserved in a reviewed merged prompt. No customer
  action or synthetic multi-recipient canary occurred.
- Strategic reset: the roadmap now prioritizes inbox-to-resolution, revenue
  follow-up, and management-by-exception. Every slice must name business,
  automation, and minion-intelligence gains; generic horizontal substrate and
  R5 depth are deferred unless a lane proves they are the smallest blocker.

### NC-20260821-002

- Root cause: the weekday scheduled task is not merely failing to run. It has
  no durable exact-case claim or attempt transition, reads a party-global
  thread/count from a per-pipeline-entry queue, omits pending-draft and true
  ball-in-court checks, and repeatedly selects the oldest five after an
  asynchronous Gmail read fails to yield a complete artifact set.
- Containment: a WAL-safe SQLite backup named
  `NC-20260821-002-20260821T144453Z` passed `quick_check`; one guarded update
  paused only `task-followup-daily`. The task remains historical evidence and
  must not be repaired or resumed as the replacement.
- Process authority: `docs/SALES-FOLLOWUP-OPERATING-MODEL.md` defines three
  exact-case lanes. Sales owns conversation and signature work; Contador owns
  receivable truth and collection review; a relationship owner supplies
  proposal/receivable context; Mailman alone sends exact approved bytes.
- Current source baseline: 128 legacy Sales queue rows represent 108 parties.
  Plutio has five pending proposals; four are stuck behind expired sequence
  rows. It also has eight overdue invoices, while twelve additional unpaid
  invoices are future-due and are not collection work. These are read-only
  findings, not contact or backfill authority.
- Dark slice: `src/followup-policy.ts`, its adversarial tests, live
  migration/rollback 130, and `src/followup-case-store.ts` establish stable
  source identities, lane-specific eligibility, canonical fingerprints,
  unchanged-observation no-op behavior, and versioned changed-evidence events.
  The code is absent from daemon/scheduler/IPC/agent composition.
- Completed checkpoint: exact release `6b9b5f27` is active under Node 22.23.2;
  the secured live backup and migrations 130-131 checks passed, both new tables
  remain empty/admin-only, and the task, proposal ledger, email-action ledger,
  and protected Company Work core aggregates show no action delta. Source
  adapters, presentation, approval, and sending remain later gates.
- Resumed correction (2026-08-21T15:57Z): the operator clarified that the
  historical failure was repeated presentation of the same unapproved email,
  not repeated sending. An explicit rejection must durably cancel the exact
  Sales follow-up case and close the associated opportunity through the
  canonical, read-back-verified pipeline transition. An ignored/expired
  approval remains suppressed from duplicate daily presentation; neither path
  may regenerate identical approval work.
- Deployment proof (2026-08-21T17:00Z): release `6b9b5f27` and migration 131
  are live. The migration is empty, append-only, and admin-only; the legacy
  task remains paused. SQLite is healthy with zero active email actions, and
  the proposal ledger and protected Company Work core aggregates are unchanged.
  No decision adapter or source/action wiring exists, so this milestone changes
  the contract and durable evidence vocabulary without acting on a customer.

### NC-20260821-001

- Trigger/base: continue the Company OS roadmap after exact release `288105cb`.
  The first natural post-NC-003 brief delivered three source-bound packets and
  woke Chief, but the summary also launched a redundant root run and no durable
  packet-level attempt outcome was visible.
- Intended boundary: migration 129 stores only work/brief versions,
  fingerprints, Slack message identities, lifecycle codes, and timestamps.
  Bind exact packet delivery, claim router pickup before Chief execution,
  record the first bounded turn outcome, and post one threaded receipt that
  explicitly is not source resolution or business action.
- Repeat safety: an exact completed packet replay is cursor-consumed without a
  second Chief run. A later daily brief suppresses a successfully attempted
  unchanged work-version/reason fingerprint while still showing the unresolved
  source case in its operator summary. Mixed/new batches tell Chief exactly
  which work IDs are newly eligible.
- Validation so far: pinned Node 22.23.2 focused tests pass 37/37. Disposable
  PostgreSQL 16 proves schema lifecycle, append-only event enforcement, zero
  Chief SELECT, populated rollback refusal, and empty rollback. Typecheck
  and build pass with an isolated complete dependency install. The
  email-critical gate passes 722/722 and the independent runner passes 43/43.
  The unrestricted root suite passes 2,871/2,872 with six skips; its sole CNPC
  wrapper-literal assertion is unchanged from the task base and both implicated
  files are untouched.
- Exclusions: no Gmail search/read, customer email, work/fact/source mutation,
  automatic remediation, customer or agent prose in PostgreSQL, manufactured
  source work, push, or merge. A later natural packet is outcome evidence; a
  build, migration, restart, or synthetic work item is not.
- Natural outcome proof (2026-08-21T17:00Z): a real startup exception cycle
  posted three source-bound work packets. All three have exact `posted`,
  `picked_up`, and `attempt_succeeded` trails plus posted receipts; there are
  zero failed attempts. The core work ledger stayed at 23 items/version sum
  124, 147 events, and 67 receipts, so this proves dispatch/attempt behavior
  without manufacturing or mutating source work. Source correction remains a
  separate outcome.

### NC-20260820-009

- Trigger/base: the operator explicitly said to proceed from NC-008's verified
  dark milestone. Exact release `6f40b1da` is live with migration 127, review
  disabled, zero configured reviewers/runs/packets/events/quality receipts,
  and 0/13 assessment coverage.
- Activation contract: resolve exactly one already-authorized Company Work
  operator UID from production configuration without printing or copying its
  value into tracked files. The release-bound configuration helper is dry-run
  first, source-allowlisted, value-redacted, runtime-bounds-checked, exact-host/
  release-confirmed, atomic, backed up, and exactly restorable. Rehearse
  candidate/evidence assembly on copied live SQLite plus read-only production
  PostgreSQL, then set only the five documented outcome-review environment
  keys. Keep the existing 24-hour interval, 30-day window, and candidate limit 25. A drained restart may run once immediately and post at most one complete
  private Chief packet.
- Rehearsal so far: production exposes one valid reusable Company Work operator
  and remains disabled with empty packet/quality ledgers. A WAL-safe SQLite copy
  plus read-only production PostgreSQL found 13 candidates, reconstructed all
  13, and rendered all 13 completely below the single-message cap (maximum
  2,937 characters), with zero claim, post, or Gmail calls. Pinned Node 22
  focused helper/outcome tests pass 40 with one integration test skipped;
  email-critical passes 721/721 and the independent runner passes 43/43.
  Typecheck/build/diff checks pass. The full suite is 2,849 pass, one known CNPC
  wrapper-contract failure, and six skipped; both implicated CNPC files are
  byte-identical to base.
- Stop/acceptance boundary: require one packet row with exact posted Slack
  binding and one claimed/posted lifecycle, zero quality receipts, no decision,
  and no second packet. Verify protected PostgreSQL/SQLite state, active release,
  channel/queue health, and current-process logs. Stop for the operator's explicit
  exact reaction; activation never supplies or infers a quality value.
- Live activation finding: release `963317a9` posted one exact packet, but its
  `from_group=company-os` provenance correctly matched the generic cross-group
  handoff rule and woke Chief. Chief did not classify or create an assessment,
  but it emitted one additional reply and changed one internal `open_items`
  memory entry. The same packet and reaction acknowledgments must instead be
  stored as Chief's own host echoes so they remain human-visible and
  reaction-bound without entering the generic agent dispatch path. Exception
  briefs/work packets retain their existing cross-group wake behavior.
- Restart safety: an undecided `pending`, `posted`, or `delivery_uncertain`
  packet globally suppresses further candidates. Claims repeat that check
  under a transaction-scoped advisory lock, so a corrective restart or
  overlapping host process cannot create a second outstanding human review.
- Exclusions: no Gmail API/search/read, raw identity persistence, historical
  bulk/backfill, typed approval, model classification, default clean, customer
  email, remediation, work-item mutation, unrelated config, push, or merge.

### NC-20260820-008

- Trigger/base: continue NC-20260820-007 from exact live release `265622bd` and
  its deployed but manually parameterized single-assessment producer. The live
  quality table remains empty at 0 assessed / 13 required. Operators should not
  have to search Gmail, reconstruct the approved response, or manually hash an
  evidence package before they can review an outcome.
- Intended boundary: migration 127 records only packet identity, delivery/
  decision state, hashes, exact internal work/event references, bounded status
  codes, and Slack message receipts. A default-off host service selects at most
  one eligible completed Sales-email outcome per run, resolves the immutable
  action ID into the exact stored inbound request and exact operator-approved
  outbound subject/body, verifies the Gmail and outcome receipts, and posts one
  bounded operator-only packet. Customer prose is transient in the existing
  private Chief Slack surface and is never stored in PostgreSQL.
- Decision boundary: only a configured operator UID reacting to that exact
  durably bound bot message may choose ✅ `clean`, 🐛
  `customer_visible_defect`, ↩️ `customer_visible_reversal`, or 🚨
  `customer_visible_defect_and_reversal`. The host hashes the UID and reuses the
  NC-007 dry-run/plan/apply contract. A model, agent message, typed approval,
  unconfigured reactor, generic check reaction, or absence of a complaint is
  never a classification. Receipt creation precedes packet decision binding so
  crash replay is duplicate-only rather than lossy.
- Exclusions: no Gmail API/search/read, inbox/thread guessing, agent/container
  capability, autonomous classifier, default-clean value, multi-item post,
  historical backfill, customer message, remediation, work-item mutation,
  external business action, or activation as part of source presence. Dark
  deployment must retain zero packet and quality-receipt rows; first live packet
  and any operator reaction remain a separately evidenced activation/outcome
  gate.
- Release/deployment: exact release
  `6f40b1da7742a28a583c5e43d3109b2ed8c52358` is live on PID 69300 after a
  guarded zero-work drain, final-drained SQLite/PostgreSQL backups, transaction
  migration 127, and verified three-path launchd activation. Live review health
  is disabled with zero operators/runs/packets/events/assessments; protected
  Company Work and exception fingerprints match. The 30-day quality indicator
  remains unavailable at 0 assessed / 13 required. No packet, Gmail read/search,
  classification, customer message, remediation, or external action occurred.

### NC-20260820-007

- Trigger/base: continue NC-20260820-006 from its deployed, empty, admin-only
  migration-126 receipt contract. Branch base `e5e1a595` documents exact live
  release `09bc2408`; no receipt exists and the 30-day quality indicator remains
  unavailable at 0 assessed / 13 required.
- Intended boundary: one standalone host CLI accepts only an exact work-item ID,
  exact delivery-event version, bounded assessment, canonical timestamps, and
  lowercase SHA-256 source/evidence/operator keys. A read-only preview derives
  the current receipt-chain head, next revision, and exact plan fingerprint.
  Apply must re-plan inside one transaction and match that fingerprint plus
  exact host, immutable release, and task-specific confirmation before insert.
- Exclusions: no Gmail/Slack/API/content read, no agent/container access, no
  automatic or model classification, no daemon/scheduler import, no bulk mode,
  no default clean value, no historical backfill, no customer message, no
  remediation, and no external action authority. Deployment of the command is
  not authorization to create a real assessment; that requires separately
  supplied operator-reviewed evidence and the exact apply gate.
- Validation so far: pinned Node 22.23.2 producer/boundary tests pass 15/15,
  indicator tests pass 10/10, and typecheck/build/format/documentation continuity
  pass. Email-critical tests pass 719/719 plus the independent runner build and
  43/43 tests. The unrestricted root suite is 2,821/2,822 passing with five
  skips; its sole failure is the unchanged pre-existing CNPC source-wrapper
  literal assertion, and the implicated CNPC files match the task base.
  Disposable PostgreSQL 16.15 with the real migrations 118-126
  proves initial insert, lost-response duplicate replay, append-only operator
  correction, one current chain head, an intervening host-rule revision making
  the prior fingerprint fail `plan_changed`, fresh re-preview/revision 4, and
  update rejection. The real indicator becomes available at 0/1 only after the
  final disposable clean correction. The first rehearsal exposed and fixed an
  idempotency defect: execution-only insert/duplicate state is now excluded
  from the fingerprint while target, evidence, timestamps, revision, and
  predecessor remain bound. The disposable server is stopped; at that
  validation boundary production data was untouched and remained at zero
  receipts.
- Release/deployment: exact commit
  `265622bd7cc4632f517dd1e5beb0c22f6ba688e4` binds source tree
  `7981389ea49a06ba8c8a60e8db162871baa96bf6`, 808 compiled files, artifact
  SHA-256 `ae858926595894ff062f68cdcd9d5aea3be2724e1c1ba4fedd26d6d70a4457e6`,
  and archive SHA-256
  `19612afd867013a9ad5fb8e05eb8700b4d7c8c321a406f57eb7162a0ded0aef4`.
  Local and Mini verification pass under Node 22.23.2. The owner-only backup is
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-007-20260821T001109Z`;
  its WAL-safe SQLite copy and installed plist pass integrity checks. Dry-run
  named exactly the three release-pointer paths, apply retained rollback plist
  `com.nanoclaw.plist.rollback-09bc24081654-2026-08-21T00-11-31-245Z`, and
  health/launchd/the sole listener converged on PID 63259.
- Live boundary: protected work-item/event/receipt, exception-brief/event, and
  quality-receipt fingerprints match immediately before/after; quality receipts
  remain zero. The normal startup exception loop returned `duplicate_brief`
  and refreshed only active cases' `last_seen_at`, with zero opened, reopened,
  resolved, posted, or lifecycle-event changes. The read-only indicator remains
  15 accepted, 13 completed, two incomplete, and 0 assessed / 13 required.
  Default and incomplete-apply invocations refuse at argument validation. No
  real work item was previewed because rollout is not evidence or authority for
  a customer-outcome classification.

### NC-20260820-006

- Trigger/base: continue the Company OS roadmap from NC-005's live, truthful
  two-indicator baseline. The isolated branch starts at documentation commit
  `2320e189`; active production remains exact release `a02abaca`.
- Root cause: an incident-only table would make an empty numerator look like
  zero defects even when nobody or nothing assessed the completed outcomes.
  The third indicator therefore needs explicit denominator coverage, not just
  an append-only place to record adverse events.
- Contract boundary: one immutable assessment per completed Sales-email work
  item and exact terminal version. Allowed outcomes are `clean`,
  `customer_visible_defect`, and `customer_visible_reversal`; every row binds
  an opaque source-system/key identity plus SHA-256 evidence and occurrence
  time. The aggregate is available only when every completed cohort item has
  exactly one valid assessment. Partial or contradictory coverage fails closed
  without exposing work-item, Party, pipeline, Gmail, Slack, or customer data.
- Authority boundary: migration and report remain host-admin-only and are not
  imported by the daemon, agents, email path, exception loop, or scheduler.
  No producer or write CLI is added in this slice, so repository or schema
  presence cannot create an assessment. No natural receipt will be fabricated
  to make the metric available.
- Validation so far: focused TypeScript/migration tests pass 15/15; pinned Node
  typecheck/build and documentation continuity pass. Disposable PostgreSQL 16
  applies the exact migration, accepts revision 1 plus one superseding adverse
  revision, rejects branching, a non-delivery event, and an update, and leaves
  exactly one current head. The real TypeScript aggregate over that database
  reports one assessed adverse outcome at rate 1. A separate empty rehearsal
  applies and cleanly rolls back migration 126. Temporary clusters were
  stopped and left inert under `/tmp/nc006-pg.*`; production is untouched.
- Release-grade validation: email-critical tests pass 719/719 plus the
  independent runner build and 43/43 tests. The unrestricted root suite is
  2,806/2,807 passing with five skips; the sole failure is the unchanged
  `cnpc-prompt-contract.test.ts` source-wrapper literal assertion already
  recorded at the base, and neither implicated CNPC file differs here.
- Pre-release commit boundary: implementation commit `c461e11e` contains the additive
  migration/rollback, contract-version-2 report, tests, release binding, and
  authoritative documentation. At that review boundary production remained
  exact release `a02abaca`; migration 126 was not yet applied and the table did
  not yet exist there.
- Release/deployment: exact commit `09bc2408` binds source tree `82a6b1f4`,
  800 compiled files, artifact SHA-256 `59781d61…`, and archive SHA-256
  `598de975…`. The verified bundle was staged on the Mini. A zero-work drain
  preceded a private WAL-safe SQLite/plist plus full custom-format PostgreSQL
  backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-006-20260820T201436Z`.
  Migration SHA-256 is `d3cd74c3…`; migration 126 applied cleanly before
  activation. The activator retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-a02abacaf469-2026-08-20T20-16-05-621Z`.
- Live schema/result: the table has zero rows, 17 constraints, six indexes, two
  enabled triggers, admin table/sequence/function ownership, zero non-admin
  table/sequence grants, and zero forbidden content columns. Both staged and
  active exact reads report 15 accepted, 13 completed, 13 customer-visible,
  zero assessed, and 13 missing; the adverse rate remains unavailable with
  `outcome_quality_receipt_coverage_incomplete`. Immediate before/after reads
  preserve 21 work items/version sum 110, 131 work events, 59 work receipts,
  zero quality receipts, seven cases, six briefs, and 40 exception events.
- Live service: after a transient first post-activation PID observation,
  health, launchd, and the sole port-8088 listener converged on PID 82117 with
  exact commit/tree/artifact/code root, Node 22.23.2, connected Gmail/Slack,
  zero containers/waiters/outgoing Slack/active email actions, SQLite
  `quick_check=ok`, and no current-process stderr or post-release-marker
  WARN/ERROR/FATAL headline. Startup's normal exception loop returned
  `duplicate_brief`; it did not create a message or mutate the work ledger.

### NC-20260820-005

- Trigger/base: continue the Company OS roadmap after deploying the contact
  context slice. NanoClaw is isolated at `3e843235`; the shared operational
  checkout remains untouched.
- Root cause: the durable Company Work ledger and exception report can show
  individual Sales email items and source gaps, but they do not provide one
  consistent aggregate outcome baseline. The ledger already records exact
  `accepted` and `outcome_validated` events, while no canonical receipt yet
  proves a customer-visible defect or reversal. Treating an internal
  blocked/failed/source-gap state as that missing outcome would manufacture
  evidence.
- Implementation boundary: add a standalone, bounded, aggregate-only
  `sales_email` report and CLI. The cohort is exact accepted events within the
  requested window; completion is an exact outcome-validated event; latency is
  measured between those two events. The customer-visible defect/reversal
  indicator must remain explicitly unavailable until a canonical receipt is
  designed and deployed. The command is not imported by the daemon and does
  not change source authority or workflow behavior.
- Privacy/safety boundary: output contains no work-item/source/message/person
  identifiers or customer content. No database/schema mutation, source read,
  Gmail search, Slack/email post, threshold/SLO, schedule, prompt/capability,
  approval, send, or other action authority is in scope. Query or ledger
  quality failures fail closed as an unavailable report.
- Acceptance: focused tests cover arithmetic, empty windows, malformed ledger
  aggregates, bounded arguments, privacy-minimized output, and query failure;
  pinned Node typecheck/tests/release verification pass; an immutable release
  is activated only after the ordinary drain/backup/preflight; one bounded
  production read returns aggregates while protected state fingerprints stay
  unchanged.
- Release/live evidence: implementation `b71bfae2` and release candidate
  `a02abaca` bind source tree `99ac2ebd`, 800 compiled files, artifact SHA-256
  `1fe90d00…`, and archive SHA-256 `d0a77be6…`. Fresh local and Mini bundle
  verification passed. The drained deployment preserved a WAL-safe SQLite and
  plist backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-005-20260820T194200Z`
  and rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-eb5fbaa171e6-2026-08-20T19-42-11-271Z`.
  PID 10617 is healthy on exact release `a02abaca` with one listener,
  connected Gmail/Slack, and empty runtime/email queues.
- Baseline outcome: the exact active 30-day read reports 15 accepted, 13
  completed, two incomplete, and 86.67% completion. Accepted-to-outcome p50 is
  29m01.725s, p95 is 6h16m18.994s, and maximum is 9h25m12.618s across 13
  completed samples. Customer-visible defect/reversal remains unavailable for
  the recorded reason. Company Work and exception aggregates are identical
  before/after the command; SQLite remains 87 actions and 430 events with zero
  active actions and `quick_check=ok`. Startup's ordinary exception-loop
  re-observation updated case `last_seen_at` before the active read; the
  active command itself made no change.

### NC-20260820-004

- Trigger/base: the owner showed a vague contact-form inquiry that required an
  avoidable "what do you mean?" hop and asked that the person's route into the
  form accompany the submission. NanoClaw is isolated at `3e76a19e`; the
  paired Tandem website worktree is isolated at `cbe7e64ea`. Both shared dirty
  operational checkouts remain untouched.
- Root cause: the contact page already captures `document.referrer` at page
  load, and WordPress already persists that value in the durable contact row.
  Both the immediate WordPress to n8n request and the retry sweep omitted it;
  n8n then allowlisted only name/email/company/message/time, the NanoClaw
  contact prompt had no context field, and Inbox's handoff schema could not
  preserve one. Sales' older generated knowledge also instructed a later
  email-keyed Chaos lookup while its current workflow correctly prohibited
  browsing-path lookup, leaving drift and needless manual reconstruction.
- Implementation boundary: WordPress reduces the stored referrer to an
  internal path or external hostname, strips queries/fragments, suppresses the
  known `/contact-us/` self-referrer fallback, and uses one payload builder for
  both immediate delivery and durable replay. The tracked n8n mapper validates
  that bounded `entry_page`; both tracked webhook definitions attach it to the
  Inbox packet; Inbox forwards only a non-empty host value. Sales may use it
  solely to resolve one explicit page-relative reference such as "this
  program" when the path maps unambiguously to an official page. It cannot
  create relationship, intent, answerability, fact, recommendation, price,
  cohort, route, CTA, approval, or send authority. Sales must not augment it
  with a Chaos lookup.
- Failure/privacy boundary: an absent, stale-client, external-tracker-blocked,
  malformed, generic, or ambiguous entry page becomes empty and the inquiry
  continues normally. No raw referrer, query, fragment, Chaos history, IP,
  fingerprint, new tracking, schema/database mutation, synthetic submission,
  customer email, or autonomous action is in scope.
- Current verification: all 26 Tandem plugin PHP harnesses on the rebased
  production candidate pass, including the
  new seven-case contact context suite and the existing 13-case referrer suite;
  PHP syntax and both worktree diff checks pass. NanoClaw's focused n8n,
  webhook, Inbox, Sales, and extractor contracts pass 47/47 on pinned Node
  22.23.2; format, typecheck, production build, and documentation continuity
  pass. The unrestricted suite passes 2,791/2,792 with five skips; its sole
  failure is the unchanged CNPC source-wrapper literal assertion in
  `cnpc-prompt-contract.test.ts`. Website commit `bdf8fd9b3`, active n8n
  workflow 1, and exact NanoClaw release `eb5fbaa1` are live-verified with
  rollback. A natural post-deploy contact submission remains pending; no lead
  or customer email was manufactured for proof.

### NC-20260820-003

- Trigger/base: the owner observed Chief attempting a denied `gmail_search`
  while drafting a support confirmation from a Company OS/Slack item and asked
  why the original email had not arrived attached, then explicitly said to fix
  it. This isolated worktree starts from cumulative deployed/documented commit
  `0a967c66`; the shared dirty operational checkout remains untouched.
- Root cause: trusted Gmail ingress already supplies Message-ID, Thread-ID,
  sender, subject, bounded body, and an exact process-local resource grant.
  The privacy-minimized Company Work projection/exception brief intentionally
  retains only opaque work/action identifiers and hashes, however, and exposes
  no host hydration path when the operator later asks Chief to act on that
  work. Chief therefore received operator intent without the source package,
  guessed from historical database context, and attempted mailbox search.
  The denial notice additionally hard-codes "another Mailman session" for
  every group.
- Implementation: fresh Mailman→Sales lead roots preserve their exact
  `Message-ID`. Approval observation copies that content-free ID into the
  existing authoritative SQLite action; the PostgreSQL ledger still stores
  only its opaque action source key. On a complete exception run the host
  resolves that exact key back to the exact Sales root, posts one bounded
  `[COMPANY OS WORK PACKET]` beneath the brief with `from_group=company-os`,
  and binds the brief only after every visible packet is delivered. That
  cross-group packet wakes Chief and carries the original routed source.
  Missing/conflicting context is visible and forbids search or guessing.
- Restart/resource boundary: Chief retains only `gmail_read`. The durable
  fallback authorizes only a message ID present on a Sales action whose opaque
  action ID is also a `sales_email` Company Work item with a still-active
  exception case. Search, thread listing, send, reply, and unrelated exact
  reads remain denied. The denial notice now names the requesting group and
  says no other agent session received it.
- Verification: exact source hydration/split-root reconstruction, message and
  thread identity conflict, SQLite migration/binding, Chief durable-scope
  negatives, Company OS packet delivery/fail-closed behavior, Slack
  cross-group persistence, lead Message-ID preservation, and Chief denial
  attribution are covered by 303/303 focused tests. Exact Node 22.23.2
  typecheck, build, formatting, 719/719 email-critical tests, and the
  independent runner build plus 43/43 tests pass. The unrestricted suite is
  2,781/2,782 passing with five skips; its sole failure is the unchanged CNPC
  source-wrapper literal assertion in `cnpc-prompt-contract.test.ts`.
- Production evidence: exact release
  `bab154cbdadf76962373272d6a4960cb926d3794` (source tree
  `e31362d8c8b858f420144d3d6777dde079b51c94`, artifact SHA-256
  `3fdd305c62ba449bb526b792f0d052251c35fcfceb1dc256f5e0f95597347e75`)
  independently verified on the Mini and activated from `8344524c` after one
  natural Procurement run drained. The post-run SQLite/plist backup is
  `NC-20260820-003-20260820T181520Z`; SQLite SHA-256 is
  `c0c529fe3958bc030aa1fa60b081500e7d73c1926714924fc25294a60024d3b5`
  and `quick_check=ok`. The activator retained rollback plist
  `com.nanoclaw.plist.rollback-8344524cf4a4-2026-08-20T18-15-35-331Z`.
- Live boundary: PID 73082 reports the exact release/code root, Node 22.23.2,
  connected Gmail/Slack, one listener, and empty runtime/outgoing queues. The
  new SQLite column and index each exist once; pending sends remain 80
  confirmed/6 blocked with zero active. PostgreSQL remains 3 acknowledged + 4
  open cases, 6 posted briefs with maximum ID 10, and 5 `host_job_run` + 1
  `program_facts_drift` + 15 `sales_email` work items. Startup returned
  `duplicate_brief`, as expected for today's unchanged fingerprint, and posted
  zero work packets. Natural packet/Chief pickup and email-source hydration are
  therefore still outcome-unverified. No customer email, manufactured work,
  push, or merge occurred.

### NC-20260820-002

- Trigger/base: the owner observed that durable program-facts drift alerts were
  reaching Slack but no backend path appeared to pick them up and drive them
  toward resolution, then asked to keep moving. The task uses an isolated
  worktree from cumulative Company OS/Gmail documentation commit `91d28fea`;
  the shared dirty operational checkout is untouched.
- Root cause: `scripts/run-program-facts-drift.ts` directly posted detector
  text to Sales. The normalized trigger store, shared Company Work ledger, and
  recurring Chief exception loop all existed, but the detector wrote none of
  them. Slack was therefore the terminal sink rather than a notification over
  durable source work.
- Design: a compiled default-off job derives canonical detector/source
  digests, then one PostgreSQL transaction records the exact scheduled-run
  `business_condition` occurrence, ensures one stable
  `program_facts_drift` item, appends content-minimized observation evidence,
  and places drift in `accepted/blocked` with
  `fact_authority:owner_review_required`. The common report/Chief loop can pick
  up that named reason without parsing Slack. Unchanged drift is durable but
  notification-suppressed; changed evidence alerts again; an exact clean rerun
  is the only completion receipt; recurrence explicitly reopens the same item.
- Authority boundary: the adapter and healer cannot decide which facts source
  is correct and cannot edit facts, Sales knowledge, products, website content,
  email, or another system. Migration 125, active mode, the compiled production
  job, and exact release `8344524c` are promoted; owner source correction and
  an exact clean detector receipt remain unpromoted.
- Files: migration/rollback 125, `src/program-facts-drift.ts`,
  `src/program-facts-company-work.ts`, `src/program-facts-drift-job.ts`,
  Company Work ledger/report/exception types and tests, job-run identity,
  release packaging, environment template, compatibility wrapper, and the
  Company OS authority documents.
- Verification: 58 focused tests, exact Node 22.23.2 typecheck/build,
  formatting, documentation continuity, and capability parity pass. A real
  disposable PostgreSQL 16 run applied 118 -> 119 -> 121 -> 125 and proved one
  stable item across open, exact replay, changed finding, clean close, and
  recurrence; append-only mutation refusal, zero non-admin grants, populated
  rollback refusal, and clean empty rollback also passed. The full suite is
  green except the unchanged CNPC source-wrapper literal assertion; final
  counts and release evidence are recorded in the changelog.
- Release evidence: implementation commit
  `8344524cf4a439b84eb792cdf7b4a16b65178a6a` produced source tree
  `fac86f42aebcaf2e765ec16024fc679e9fa8aca1`, a 788-file compiled artifact
  with SHA-256
  `e257edaab70dfe7fc05b4f5b9a21068aa39ffd8351e385620e0610021a4729b3`,
  and archive SHA-256
  `5c40601869f7f13df3b0394965214d0a3aa711b1d90a1f4ab98bbdc7f1873f9e`.
  Fresh-directory runtime verification of the extracted archive passed under
  Node 22.23.2.
- Production evidence: the Mini reached zero active containers, active email
  states, waiting tasks, running jobs, and queued Slack messages before the
  change. A mode-0600 custom-format `business_v2` backup with SHA-256
  `50e1903768db96fb82f9b2d502c249d4df2373cfa1aea5e26043a5330adf522a`
  passed `pg_restore --list`; migration 125 then applied from the verified
  release with the expected admin-only table, 14 constraints, one enabled
  append-only trigger, and zero non-admin table/sequence grants. The release
  activator retained rollback plist
  `com.nanoclaw.plist.rollback-64f1421e4650-2026-08-20T15-57-27-096Z` and
  converged to healthy PID 38712 on exact release `8344524c`. Active mode and
  the compiled job are installed without changing its 08:00 CT schedule.
- Live proof: direct canary `nc002-canary-20260820T155614Z` created item 21 in
  `accepted/blocked` for `fact_authority:owner_review_required`, observation 1,
  one Sales alert, exception case 7, and Chief brief 10. Campanero then invoked
  the same installed job through the host IPC scheduler as run
  `4d63f2dd-d0f6-4eeb-836d-a4f76418282a`; it exited 0 in 224 ms and added
  observation 2 without another Sales alert. Post-checks show PostgreSQL 21
  work items / 131 events / 59 receipts / 3 trigger occurrences / 7 cases / 6
  briefs / 2 program-fact observations, SQLite `quick_check=ok`, no active
  email or job work, connected Gmail/Slack, empty queues, and no new daemon
  error lines. Source correction, exact clean closure, push, and merge remain
  pending.

### NC-20260818-003

- Trigger/base: after NC-20260818-002 completed the stable live mailbox audit,
  the owner said to proceed. This isolated worktree starts from exact closeout
  `de3eeb47ca9d06bdd1e1ebb062e26675c39cc301`; the shared dirty operational
  checkout and previous worktrees remain untouched.
- Root cause: the current `GmailChannel.processPush()` catches a natural
  `HistoryExpiredError`, overwrites SQLite `gmail_history_id` with the incoming
  notification cursor, and accepts the loss window. Merely replacing that line
  with a PostgreSQL gap event is insufficient: the generic watermark must first
  mirror every receipt-closed ordinary cursor advance, or its prior cursor may
  be stale when a later 404 arrives.
- Outcome: bind ordinary fully accounted deltas to a content-free generic
  `advance` event before SQLite moves; recover only the exact crash case where
  that durable event committed but the SQLite cursor did not; and on natural
  history 404 record exactly one `gap_detected` event while retaining the prior
  SQLite and generic cursor. An already-open gap blocks further history calls.
- Safety boundary: exact registered source only; accepted/rejected terminal
  receipt evidence only; no message content in PostgreSQL; no auto-baseline,
  unknown conversion, mailbox snapshot, candidate recovery/routing,
  `gap_reconciled`, advancement across a gap, task/work/action authority,
  synthetic production email or expiry, external message, push, or merge.
- Promotion gate: exact cursor equality before activation, injected unit and
  real PostgreSQL transaction/crash/replay/drift proof, full Node-22/email/
  runner/release checks, zero active/waiting/outgoing work, WAL-safe SQLite plus
  complete `business_v2` backups, exact config/release manifests, service and
  channel verification, and natural-path observation only if Gmail supplies a
  real 404. Absence of a natural 404 is deployed-unverified, not proof.

### NC-20260818-002

- Trigger/base: after NC-20260818-001 completed exactly one source/bootstrap
  state, the owner said to proceed with the next milestone. This isolated
  worktree starts from exact closeout `fb1cfd209079350c6736a7b01cfe827df650e05d`;
  the shared dirty operational checkout and earlier worktrees remain untouched.
- Outcome: run one real, bounded, unfiltered, read-only Gmail mailbox shadow
  without waiting for or manufacturing a history 404. The shadow must make
  Gmail-only IDs and host-known accepted/rejected IDs truthfully distinguishable;
  `unknown` is evidence of missing authority, never an invented rejection.
- Safety boundary: only `users.getProfile` and `users.messages.list` with
  `includeSpamTrash: true` are eligible. No `q`, label filter, `messages.get`,
  modify/send/reply, SQLite write, generic watermark event/state update,
  current-ingestion cursor change, recovered/routed message, daemon wiring or
  restart, task/work/action authority, external message, push, or merge.
- Production gate: exact Node 22 validation, real disposable PostgreSQL proof,
  immutable release verification, zero active/waiting/outgoing work, zero
  active email actions, complete unfiltered affected-schema backup, explicit
  one-migration/one-shadow confirmations, exact pre/post protected fingerprints,
  privacy/token cleanup, bounded API/runtime/cost evidence, and an explicit
  stop before any natural-404 recovery or cursor authority.
- Production outcome: implementation commit
  `2328c7e1ac15ae99f38dc3f102feacec8018e30b` binds source tree
  `52af229a391d8262667c49071122ff0a7006ac09`, 764 compiled files, artifact
  digest `5b22a024e8ac8dd25ecf66706c126c73c09a6448f5d7fc34bbdd47b7a5836fd1`,
  and archive SHA-256
  `99d465ecfb2119384d7ba6f4f32f4cb1ccae8feb9b20561e8a4059759bce2ecd`.
  The exact candidate is installed read-only beside, but not activated over,
  daemon release `dc3e5f0d`.
- Backup/migration: the zero-work gate found zero active/waiting Company Work,
  zero active email actions, zero containers/waiting groups/outgoing Slack,
  and connected Gmail/Slack. Complete custom-format `business_v2` backup
  `~/.local/share/nanoclaw-backups/NC-20260818-002-20260818T174439Z/business_v2.pre-migration-124.dump`
  is mode 0600, 2,052,817 bytes, has 728 catalog lines, and SHA-256
  `0751e0d09c2eb40a54c431213bb440a168620495c8d3da1fc11d8bd4b2f2f1f1`.
  Exact migration-124 SHA-256
  `f0bb33ce61bd8dd980f45699bc59621fd3cfee86f52eb4ed2fb2011c6037dbad`
  produced three empty `nanoclaw_admin` tables, zero non-admin grants, and two
  append-only evidence triggers before the audit began.
- Live proof: one attempt completed within the 20-minute freshness budget over
  171 pages and 85,076 unfiltered Spam/Trash-inclusive Gmail IDs. Closed
  accounting is 67 accepted + 39 rejected + 84,970 unknown; completion
  evidence is
  `38e0e0c035cdfc7df3a55e9851fe0953203d3bc449a5c1d199cea3a556a25680`.
  The terminal audit retains no continuation token. Missing host evidence is
  still unknown and grants no recovery or action authority.
- Non-interference: source/event/state remain 1/1/1 at version 1/current;
  migration-123 remains 0/0/0; exact Company Work, trigger occurrence, source,
  watermark, SQLite cursor, Gmail receipt, message, pending-send, and email-
  event aggregates/fingerprints match preflight. PID 47982 remains on verified
  `dc3e5f0d` with connected Gmail/Slack and empty queues. No daemon activation,
  restart/import, content read, cursor/generic-watermark/SQLite write, gap/404,
  recovery/routing, work/task/action authority, or external message occurred.

### NC-20260818-001

- Trigger/base: after NC-013 closed the empty/admin-only migration-123 gate,
  the owner explicitly authorized the next milestone. This isolated worktree
  starts at exact NC-013 closeout
  `dd9925375c8792461799e7122325364b330ce803`; the shared dirty operational
  checkout and all earlier worktrees remain untouched.
- Outcome: register exactly the pure NC-005 inbound source definition
  (`mailbox:primary:inbound-v1`, `gmail_inbound_full_snapshot` `1.0.0`, uint
  cursor, full-snapshot recovery, eight-day window, 20-minute freshness,
  owner `core:gmail`, alert route `group:chief`) and atomically bootstrap its
  host-owned watermark from the already-authoritative SQLite
  `gmail_history_id`. Registration and bootstrap grant fixed
  `actionAuthority: none`.
- Implementation boundary: add a default-refuse CLI with exact confirmation,
  an explicit expected-cursor SHA-256 fingerprint and observation time,
  read-only pre/transaction/
  post SQLite cursor checks, one PostgreSQL transaction using the existing
  validated source/watermark stores, sanitized output, and exact replay. It
  must never place the raw cursor in process arguments or output, import Gmail
  auth/client code, or write SQLite.
- Production boundary: only after a clean candidate, zero active/waiting/
  outgoing work, zero active approved-email actions, and a verified backup,
  run one atomic source/bootstrap transaction. A separately installed verified
  CLI artifact may be used without activating it as the daemon release.
- Exclusions: no Gmail API/profile/list/read, current `gmail_history_id` write,
  service config/restart, daemon import, reconciliation snapshot/page/candidate
  row, gap/advance/reconciliation event, 404 behavior, message recovery,
  task/work/action authority, customer/internal message, push, or merge.
- Acceptance: deterministic source/event identity; invalid/drift/duplicate-
  conflict/replay tests; exact Node 22.23.2 validation; independent release
  verification; zero-work mutation gate; mode-0600 backup; exact pre/post
  SQLite cursor equality; one source, one current version-1 watermark, and one
  bootstrap event with zero observed/accepted/rejected counts; migration-123
  rows remain 0/0/0; protected aggregates and live service stay unchanged;
  documentation continuity; and an explicit stop before any Gmail shadow run.
- Production outcome: clean candidate `1b70de94fca6da7f0368c452aa9d8f6f3b0eb55b`
  (source tree `8ac3fc8afbb07fb13fa7bf3be83b736db0a2c5a0`, artifact
  `d4f166e122ba330376e3376a3183a2ba5099f88cc67b9e8fe6fd606099ae73de`,
  748 files) is independently verified and installed read-only beside the
  active release. It was not activated. A clean zero-work gate found no active
  email action. Dry-run opened no PostgreSQL transaction; the one confirmed
  apply created source/event/state 1/1/1 and exact replay reported duplicate/
  duplicate at the same version-1 current state.
- Recovery: the complete unfiltered affected-schema backup is
  `NC-20260818-001-20260818T132631Z/` (directory 0700). Its mode-0600 custom
  dump is 2,040,161 bytes with SHA-256
  `3123afef31f42c9a6833b23915a2ffa649c924e072d731273ad2b42a3d7af578`;
  the mode-0600 713-entry restore catalog is 58,392 bytes with SHA-256
  `ec3a3c68a49a7394893b6f1e6622e5711e9d848bbdf17f3cd0b87b2ea1465ea8`.
  Whole-database attempts failed safely on unrelated public-schema
  Procurement row-level security; their three incomplete partial dumps were
  deleted and are not recovery artifacts.
- Live proof: definition
  `9e039880e01c26ad73186807e97380982190ea0c58ea0970f6052f33fe3af109`
  is the exact Gmail/full-snapshot contract; bootstrap event ID 1 has zero
  observed/accepted/rejected counts; the current state is version 1 with no
  open gap. Its redacted cursor digest matches the unchanged query-only SQLite
  cursor. All six source/shadow tables remain `nanoclaw_admin`-owned with zero
  non-admin grants; shadow rows remain 0/0/0; Company Work stays 16/97/43 and
  occurrences stay 1 with identical protected fingerprints. PID 47982 still
  serves exact verified release `dc3e5f0d` under Node 22.23.2 with connected
  Gmail/Slack and zero active/waiting/outgoing work. Stop before live shadow.

### NC-20260817-013

- Trigger/base: after NC-010 closed retained-host coverage, the owner said to
  proceed with the named next gate. This isolated branch starts from NC-012's
  current live-release evidence commit
  `db8e47bb401a1a02615cbc35b81e7f10233e8211`; merge
  `3ee10533cd8682a65f32e51351f799913ecdb949` reconciles completed NC-010
  commit `801ea497ff8887ec42596740e553afe72fadf01b` before production mutation,
  preserving both the Slack-image and Gmail histories.
- Outcome: apply only tracked migration 123 to production PostgreSQL as a dark,
  empty, host-admin-only inventory target. Prove its three tables, constraints,
  indexes, append-only triggers, owner/grants, and zero rows without importing
  or executing the shadow store.
- Authority boundary: read-only discovery and drain monitoring; an exact
  mode-0600 PostgreSQL backup; one transaction-bound application of migration
  123; structure/permission/row-count verification; and documentation. No
  source registration/bootstrap, Gmail API/profile/list call, snapshot/page/
  candidate row, runtime import/config/service activation, 404 handling,
  history cursor, message recovery, task/work/action, external message, push,
  or merge.
- Recovery: migration 123's tracked rollback may be considered only while all
  three tables are empty and no dependency exists. The authoritative recovery
  artifact is the verified pre-migration custom-format backup; never erase
  evidence after any later source or shadow row exists.
- Acceptance: current live release and exact migration bytes verified; no
  overlapping production mutation; zero active/waiting containers, zero Slack
  outgoing queue, and zero active approved-email actions at each mutation
  boundary; backup list/restore readability and SHA-256; one-file apply;
  expected owner/grants/constraints/triggers/indexes and zero rows; unchanged
  live release/service/channels/cursors/receipts/pending sends; continuity
  checks; and an explicit stop before source registration.
- Validation: exact Node 22.23.2 passes typecheck, build, 197 focused tests,
  706 email-critical tests, the independent runner build and 43/43 tests, and
  documentation continuity. The full root suite passes 2,690/2,691; the sole
  CNPC wrapper-literal assertion is the unchanged baseline failure.
- Drain/backup: one ordinary Sales container was allowed to finish naturally;
  no process was interrupted. Backup and migration gates each found zero
  active/waiting containers, zero outgoing Slack queue, connected Gmail/Slack,
  and zero active email actions. Mode-0600 dump
  `NC-20260817-013-20260818T042031Z/nanoclaw_business_pre_123.dump` is
  2,720,522 bytes with SHA-256
  `793e4a673bcb42fa2a97f656ba3f371ffc9265438df62eab7e57c3c54caf17a4`;
  its mode-0600, 1,023-entry restore catalog is 80,883 bytes with SHA-256
  `53136bc7312d424defcf49a1136fc46a25357a2767d1e2005dd8a6e5c5c1fec6`.
- Migration/schema: only exact release-bound migration 123 (SHA-256
  `e9d2b7bb384d4ead97ee1b9b0b6b17c564c0b21ba2944a5818e977de90f15062`)
  was applied; rollback SHA-256 is
  `ec71364d003294d80d8d15daccb0d45cfd99fa4bd15646f100c99b8cb6fcb9b9`.
  Snapshot/page/candidate tables are 27/9/8 columns, zero rows, admin-owned,
  and zero non-admin grants, with zero forbidden content/action columns, the
  expected constraints and six indexes, plus page/candidate append-only
  triggers.
- Non-interference: Company Work remains 16 items/97 events/43 receipts;
  trigger occurrence/source/event/state remains 1/0/0/0; public
  classifications remain 7,251; all protected PostgreSQL hashes match exactly.
  SQLite quick-check is `ok`; Gmail messages remain 3,026, email actions 76,
  email events 377, tasks/jobs/groups 11/22/20, and active email actions zero.
  One normal `rejected/own_outbound` receipt arrived at
  `2026-08-18T04:30:37.489Z` during post-check and routine Gmail cursor/job
  liveness advanced; those ambient changes are separate from the schema-only
  transaction.
- Live boundary: the 2026-08-18T04:38:21Z stability read finds all three target
  tables still empty/admin-only and the backup hashes unchanged. PID 47982
  continues exact verified release `dc3e5f0d` under
  Node 22.23.2 with connected Gmail/Slack and empty active/waiting/outgoing
  queues. No restart/deploy, source row/bootstrap, Gmail profile/list/read,
  shadow row, 404/cursor behavior, recovered message, work/task/action,
  external message, push, or merge occurred. Stop before source registration.

### NC-20260817-012

- Trigger/base: the owner directed NanoClaw work to continue through deployment
  milestones. This isolated release branch starts from NC-011's committed local
  handoff `8c6be32c`, whose implementation is `9abdf2fd`; the dirty operational
  checkout, paused NC-010 source, and NC-011 implementation worktree remain
  untouched.
- Scope: build and verify one immutable artifact, establish live preflight and
  rollback facts, activate only after all warm containers drain, then verify
  exact service/channel health plus a host-created disposable file that is
  readable but not writable through `/workspace/ipc/inbound`. Do not post or
  replay Slack content and do not transmit the operator screenshot to another
  model.
- Stop boundary: code/mount deployment and non-message canaries are authorized
  by the continuing deployment instruction. A real Slack screenshot event or
  model interpretation is separate visible business-path evidence and must use
  a user-resubmitted attachment or separately authorized sanitized canary.
- Release evidence: clean commit
  `dc3e5f0da18576094c4c9e1af95c064d2c2b17d4`, source tree
  `c7e45b9522dc6cbf0dac4134c02d1f3450bbad25`, artifact hash
  `da9438b27cfafe772a8ac22c6c5491e38e77be3ebd5c2baab42ac49cf2143b75`,
  728 files, and Node pin 22.23.2 independently verified from a fresh local
  extraction and again after transfer to Mini. The transfer archive SHA-256 is
  `3563844763a0708f7b3170c8a44fc199ab56bd53d2631d9af25febd9d5ced510`.
- Activation evidence: preflight required one healthy `263ac7c4` listener,
  connected Gmail/Slack, zero active/waiting containers, empty outgoing Slack
  queue, no Apple containers, and pending-email aggregate 69 confirmed/6
  blocked with no active execution state. The dry run named exactly the three
  allowed plist changes. Exact-host activation retained rollback plist
  `com.nanoclaw.plist.rollback-263ac7c4a25a-2026-08-18T02-51-22-029Z` and
  converged to fresh PID 47982 with exact release/code-root identity.
- Prompt/mount evidence: the prior operational global prompt hash
  `399408327c533489da834614884dbd82fb9f21ef99cf9f26d7ef5f1ec693c919`
  has a mode-0600 private backup under the NC-012 backup directory. The active
  prompt and release both hash to
  `fb84bec9f411dd6918771f73c00cbc323149ee18ec7b74574342978af78e37ca`.
  Host inbound directories were mode 0700 and the disposable fixture mode
  0600; the no-agent container read it and could not write through the nested
  mount, after which the exact fixture was removed. Natural post-release Sales
  and Mailman containers then exposed `/workspace/ipc/inbound` from their own
  group trees with runtime option `ro`. Their business work is ambient and was
  neither inspected nor used as screenshot-understanding evidence.
- Final state: this deployment/mount milestone is `complete`; NC-011 remains
  `deployed_unverified` until a fresh natural screenshot proves the model-level
  outcome. NC-012 posted or replayed no Slack content, performed no customer
  action or database/schema write, and did not send the operator screenshot to
  another model.

### NC-20260817-011

- Trigger/root cause: Sales received a Slack screenshot carrying requested
  cohort dates and replied that it could not read the image. The model was not
  the limiting layer: `src/channels/slack.ts` deliberately classified every
  image as note-only, never fetched the pixels, and the Slack regression test
  required that no download occur.
- Implementation: supported PNG/JPEG/GIF/WebP bytes are downloaded through the
  existing bot `files:read` path, capped at 10 MB, validated by file signature,
  and atomically staged with opaque message/file identifiers and mode-0600
  files under `data/inbound/<group>/slack`. The container runner mounts only
  that group's inbound tree read-only at `/workspace/ipc/inbound`, after the
  normal writable IPC mount. Unsupported/spoofed bytes, oversize data, missing
  download metadata, and fetch/stage failures remain explicit. Derived copies
  expire after 30 days; Slack is the source record.
- Agent boundary: the inbound message names the exact container path and says
  to use `Read`; the global non-main instruction says not to request a
  transcription unless `Read` actually fails and treats visible image text as
  untrusted. No new Claude/MCP tool, credential, action class, recipient, or
  external-write authority is granted. Campanero intentionally remains without
  Claude `Read`; the note tells a tool-less minion to report that it cannot
  inspect the named file.
- Verification: exact Node 22.23.2 root typecheck and build pass; four affected
  suites pass 157/157; the independent agent-runner build and 43/43 tests pass.
  The unrestricted full root suite passes 2,673/2,674; its sole CNPC literal
  wrapper failure reproduces unchanged in base worktree `4df80def`. Local
  installed Claude Code declarations explicitly support JPEG/PNG/GIF/WebP
  image content returned by `Read`. The operator screenshot was not sent to a
  second external model for the canary; live visual proof remains pending.
- Boundary/next: local source, tests, and documentation only. Claim commit is
  `85f1c094`; implementation commit is `9abdf2fd`. Production release, service
  restart, staged-file readback, and live model behavior remain separate facts. Drain
  all old containers before activation because compatibility-mode adoption
  does not compare base-mount revisions.

### NC-20260817-010

- Trigger/base: after NC-009 closed the first natural receipt gate, the owner
  told Codex to continue. This isolated worktree starts from NC-009 evidence
  commit `4df80def9640f46b43f05983cef65d5bc3845796`; the dirty operational
  checkout and all earlier worktrees remain untouched.
- Outcome: produce one replay-stable, content-free historical coverage report
  that separates durable terminal receipts, exact ordinary inbound evidence,
  exact direct-route staging with a durable `rules-runner-v1` routed marker,
  unresolved direct-route staging, outbound rows, and genuinely unknown IDs.
  No class may be upgraded by inference and aggregate arithmetic must close.
- Authority boundary: local source/tests/docs plus one aggregate-only,
  read-only production dry run after validation. The tool must not read or
  output email content or address fields, write SQLite/PostgreSQL, mint a
  disposition receipt, call Gmail, use `processedIds`, change either history
  cursor, apply migration 123, register/bootstrap a source, run the shadow,
  recover a message, create/resume work, grant action authority, deploy, push,
  or merge.
- Likely files: a pure/injected coverage contract, a host read-only adapter and
  CLI, focused tests, `package.json`, and Company OS/project/data continuity.
  Schema files are inputs only unless a verified structural drift requires a
  separately explained structure-only refresh.
- Acceptance: deterministic ordering and report fingerprint, duplicate-ID and
  contradictory-evidence refusal, exact closed arithmetic, no content-bearing
  fields in types/output, disposable tests that prove no write path, exact Node
  22.23.2 focused/typecheck/build/email-critical/runner/continuity gates, and a
  production report whose before/after protected-state fingerprints are
  identical. Any unknown remains unknown and blocks later reconciliation
  promotion; migration 123 remains a separate gate.
- Local implementation: `gmail-historical-coverage.ts` owns the pure
  aggregate/fingerprint/refusal contract; the source opens the authoritative
  SQLite file read-only and uses an explicit rolled-back PostgreSQL read-only
  transaction; the confirmation-gated CLI is packaged as
  `company-gmail:coverage`. The report explicitly limits itself to retained
  host evidence and cannot discover IDs present only in Gmail.
- Local verification: exact Node 22.23.2 passes 47/47 focused
  audit/disposition/reconciliation tests, typecheck, root build, 704/704
  email-critical tests, the independent runner build plus 43/43 tests, and
  documentation continuity. The unrestricted full baseline passes
  2,678/2,679; only the unchanged CNPC literal wrapper assertion fails.
- Exact audit artifact: implementation
  `6bc9da26a7a6a2c48b4e3ea3e538cf669ebdcd18`, source tree
  `d3be1c6e26ea546f5c22c5f7e2321a081a7ffe6d`, 736-file artifact SHA-256
  `e76bf1cddafa7a429ad87a0901dac097b7634990f2d0aa38004f62606a4c3f6b`,
  and archive SHA-256
  `9ed3fe1da44b81bc18a0fb5054b1a3b4dffec0c4725de2af440e362f9fff81b5`
  verify locally and in a private Mini audit directory. The artifact was not
  activated and live release `dc3e5f0d` did not change.
- Production result: 3,041 retained IDs account exactly as 23 terminal
  receipts, 1,675 recoverable IDs, and 1,343 unknown IDs. The unknown split is
  36 unresolved staged routes, 517 outbound rows without receipts, and 790
  unsupported retained inbound rows. Report fingerprint is
  `3be9a997fd64dcafff3e301e7e4c66dc7a6344825afec0e00081a1a45f9600a9`.
  Exit 2 is the expected incomplete-coverage result.
- Non-interference: pre/post protected-state fingerprint
  `2935c1914e97419f380b927b14efe84870619fb4d09c11fac16c357d5c7d5f5f`
  is identical across SQLite integrity, Gmail rows, receipts, selected router
  state, pending sends, PostgreSQL classifications, and migration-123 absence.
  No Gmail API, receipt, cursor, database, source/shadow, work/action, service,
  deployment, push, or merge change occurred. NC-010 is complete; migration
  123 remains the next separate gate.

### NC-20260817-009

- Trigger/base: the owner approved the next production gate after NC-008's
  local receipt producer closed at `b9d55485`. The isolated branch starts from
  that exact commit over live release `de815e1d`; the shared dirty operational
  checkout and earlier worktrees remain untouched. Claim commit is `2d994656`.
- Outcome: deploy the current-ingestion disposition producer as one immutable
  release, allowing normal startup to create its additive content-free SQLite
  table and append-only triggers, then prove service/channel health and natural
  receipt/cursor non-interference without manufacturing a Gmail event.
- Read-only production preflight: exact release `de815e1d` remains healthy on
  `mini-claw.local` under Node 22.23.2 with one listener, connected Gmail/Slack,
  empty runtime/outgoing queues, and zero critical pending email actions.
  SQLite `quick_check` is `ok`; the receipt table/triggers are absent; selected
  Gmail cursor state hashes to
  `cfe9db8b9cd36e880e16a5ef63538b100d35621beb381c6ed19591db46cb7705`;
  no WAL/SHM sidecar existed at the snapshot.
- Compatibility finding: 57 legacy exact Gmail/Mailman direct-route staging
  rows exist. Twenty-one have one matching `rules-runner-v1` classification
  with `routed_at`; 36 have no matching classification; none is duplicate,
  mixed, or unrouted-only. Those 36 are unknown and cannot be accepted by
  inference. NC-009 locally isolates their failure per candidate in recurring
  cursorless label/thread scans so unrelated messages continue and the unknown
  row remains available to a later catch-up. Push retains the stricter whole-
  batch history-cursor hold.
- Authority boundary: exact build/archive/transfer/install, drained WAL-safe
  mode-0600 SQLite backup, release-bundled dry-run/apply, startup schema
  creation, aggregate/structural readback, and bounded natural observation.
  No synthetic/customer/internal email, send/reply, classification or message
  fabrication, action/task creation, historical receipt backfill, migration
  123, source registration/bootstrap, live reconciliation shadow, 404 change,
  push, or merge.
- Recovery: the activator must retain the prior exact release plist and
  health-check automatic rollback. A runtime failure returns to `de815e1d`.
  The new SQLite table is additive and append-only; leave it dormant on service
  rollback. Restore the WAL-safe backup only for a proven database/startup
  failure before ambient writes, never merely to erase valid receipt history.
- Acceptance: exact Node 22.23.2 focused starvation regressions, typecheck,
  build, 687-test email-critical gate, independent runner build/43 tests,
  documentation/capability continuity, clean immutable archive plus fresh
  extraction, final drain, verified backup, dry-run/apply, one exact listener,
  connected Gmail/Slack, expected table/triggers, stable critical queues and
  cursors except attributable natural input, and honest `deployed_unverified`
  status if no natural candidate appears in the bounded observation window.
- Implementation/release: claim `2d994656`; implementation and immutable
  release commit `263ac7c4a25a6033adef13e4085c147d1237b559`; source tree
  `bac62eea397f944033c79b74f79e29e2b6c13378`; 724-file artifact SHA-256
  `b12416a44839ddb08092566f81e9a4fd1568ddf597bf194b091fbf295f3bbef2`;
  archive SHA-256
  `74e282695eeff312e544e23f933c00a8a547f158747c74da49c04a09df21d622`.
  Fresh local and production extraction both verified.
- Recovery evidence: final drain was green. WAL-safe SQLite backup
  `~/.local/share/nanoclaw-backups/NC-20260817-009-2026-08-17T23-36-26Z/messages.db.sqlite3`
  is an owner-only mode-0600 regular file, passes `quick_check`, and hashes to
  `6b23f4d9329865cae93bc86dbc98f87383079ba34441ed524bbf4c7b5eec8996`.
  Recovery-safe activation retained
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-de815e1dfb1f-2026-08-17T23-37-22-828Z`.
- Live structural/service proof: exact release/tree/artifact and Node 22.23.2
  read back correctly. SQLite `quick_check` is `ok`; the receipt table and both
  no-update/no-delete triggers exist. One launchd
  listener and the health heartbeat converged to PID 58925 after the expected
  30-second heartbeat refresh. Gmail and Slack remain connected, runtime and
  outgoing queues are empty, pending email state remains 66 confirmed/6
  blocked with zero critical actions, and migration 123's three tables remain
  absent.
- Natural observation: more than ten minutes produced one successful Gmail
  safety poll with zero message candidates, no Gmail errors or cursor holds,
  no Gmail-row change, and no receipt. Two new message rows and two allowed
  action-safety decisions were attributable to ambient Slack activity only.
  Watch expiry changed on ordinary restart renewal; history/liveness advanced
  on the successful empty safety poll; `last_check` remained unchanged. No
  customer/internal/synthetic email or Gmail write was manufactured.
- Milestone boundary: schema, recovery, service, and non-interference proof are
  complete. Later aggregate-only natural proof contains 18 receipts with 18
  distinct message IDs and fingerprints: three ordinary inbound persists, ten
  completed rule auto-archives, and five own-outbound rejections. All three
  persisted receipts have their matching SQLite message row. Receipt timestamps
  span 2026-08-18T00:01:04Z through 2026-08-18T01:58:53Z. The current process
  completed 67 push/safety cycles with zero receipt, processing, safety-poll, or
  cursor-hold failures; two recent one-candidate scans each recorded one new
  message and advanced monotonically. SQLite `quick_check` and exact
  release/channel health remain green. Status is `complete`. Historical unknown
  analysis, migration 123, source registration/bootstrap, live shadow work, and
  404/cursor-authority promotion remain separately tracked gates.

### NC-20260817-008

- Trigger/base: the owner told Codex to deploy and proceed with the next steps.
  NC-007 deployed exact release `de815e1d` dark and closed out at `7f889cbe`;
  migration 123 remains absent and no live Gmail read/source/shadow producer
  exists. This isolated worktree starts from that exact closeout, while the
  shared dirty operational checkout and every earlier worktree remain
  untouched. The claim is local-only until explicitly pushed.
- Verified current gap: `GmailChannel` uses an in-memory `processedIds` set as
  its fast duplicate guard. Terminal paths include ordinary SQLite persistence,
  direct classified routing, rule-based auto-archive, own-outbound exclusion,
  Spam/Trash exclusion, empty-content exclusion, and hard-filter exclusion.
  Several exclusions add only the in-memory ID; fetch/process errors are logged
  while the push loop still advances the global history cursor. Existing
  `messages` rows prove some accepted candidates but do not provide one closed,
  content-free disposition/evidence contract for reconciliation.
- Outcome: add one host-owned append-only SQLite receipt per terminal candidate,
  with a closed accepted/rejected reason vocabulary, semantic fingerprint,
  source-evidence hash, exact replay convergence, and changed-replay refusal.
  Refactor the current Gmail processing boundary so a history delta advances
  only when every candidate is already durably receipted or produces one exact
  terminal receipt; an error/unknown leaves the prior cursor fixed for replay.
  Expose a read-only receipt lookup compatible with the NC-006 reconciliation
  accounting port. Do not store sender, recipient, address, subject, body,
  header, label text, prompt, task, approval, action, or arbitrary metadata.
- Authority boundary: local source/schema/tests/documentation only. No
  production SQLite/PostgreSQL write, migration-123 apply, source registration
  or bootstrap, live Gmail/profile/list/get call, current history-cursor change,
  404 interception, message delivery/classification, task/agent/action/send,
  service restart/deployment, push, or merge is authorized. Historical receipt
  backfill is explicitly out of scope and must remain dry-run-first under a
  separate task.
- Acceptance: SQLite schema creation/reopen, append-only triggers, exact
  replay/conflict, malformed/privacy-negative, and read-only accounting tests;
  executable tests for every current Gmail terminal decision, duplicate/restart
  behavior, partial-batch failure with no cursor advance, complete-batch
  advance, and ordinary poll non-regression. Run exact Node 22.23.2 focused,
  Company OS/Gmail, typecheck/build, 638-test email-critical plus independent
  runner, full-suite baseline, formatting, schema/documentation continuity, and
  diff checks. Deployment is not applicable to this milestone.
- Implementation: `gmail_inbound_disposition_receipts` is a content-free,
  append-only SQLite terminal ledger keyed by immutable Gmail message ID. The
  channel records one bounded accepted/rejected reason only after the matching
  durable path completes. An existing receipt skips refetch after restart; an
  exact ordinary inbound (`is_from_me = 0`, `is_bot_message = 0`) row can bridge
  a missing receipt after a split write. A direct-route staging row additionally
  requires the exact PostgreSQL `routed_at` marker; an in-memory marker,
  outbound row, or ambiguous staged route cannot bridge.
  Push processing retains the prior cursor when any candidate lacks a receipt.
  `processHistoryDelta()` now also fails before processing when page 20 remains
  non-terminal instead of returning a truncated delta.
- Verification: exact Node 22.23.2 typecheck and independent root build pass.
  The focused receipt/channel/history/database/classification set passes 5
  files / 143 tests, including
  executable update/delete refusal, semantic replay/conflict, every current
  terminal reason, split-write/restart convergence, partial candidate failure,
  existing-receipt replay, complete advance, and non-terminal page-20 hold.
  Combined Company OS/Gmail passes 32 files / 405 tests. The expanded
  email-critical gate passes 27 files / 685 tests plus independent runner build
  and 43/43 tests. Source formatting, schema sanitizer, documentation
  continuity, capability parity, and diff checks pass. The unrestricted full
  baseline passes 2,659/2,660; its sole failure is the unchanged CNPC literal
  wrapper assertion in `src/cnpc-prompt-contract.test.ts`.
- Commit/boundary: implementation commit `77dda13d` is local on the isolated
  branch. No production SQLite/PostgreSQL write, Gmail request, cursor change,
  service restart, deployment, external message/action, push, or merge occurred.

### NC-20260817-007

- Trigger/base: after NC-006 completed the isolated, unwired reconciliation
  shadow, the owner explicitly said to deploy and proceed with the next steps.
  This isolated worktree starts from exact closeout
  `6ccc836855afb1395c21c99e1105c0fde766355f`; the shared dirty operational
  checkout and prior worktrees remain untouched. The claim is local-only until
  explicitly pushed.
- Outcome: build and independently verify one exact immutable release that
  contains the NC-006 read-only wrapper, unwired orchestrator/store, and
  migration/rollback 123; activate that release through the recovery-safe
  exact-three-field service transaction; prove health, channel connectivity,
  drain, and non-interference while leaving migration 123 unapplied.
- Authority boundary: deployment changes only the immutable release directory
  and the three launchd release-pointer fields through the reviewed activator.
  It may not apply migration 123, register/bootstrap a trigger source, call the
  Gmail wrapper, create a shadow snapshot/page/candidate, import the shadow
  into a runtime entry point, alter either SQLite Gmail history cursor, handle
  a 404, create/resume work, change a prompt/skill/capability/approval, or send
  any Slack/Gmail/external message or action. No push or merge is authorized.
- Acceptance: exact Node 22.23.2 clean release gate; fresh local and production
  archive verification with recorded SHA-256; production preflight and final
  drain proving one healthy exact-current listener, connected Gmail/Slack,
  empty active/waiting/outgoing queues, and zero active approved-email actions;
  migration-122 tables present with migration-123 tables absent; activator dry
  run naming only the exact three documented paths; bounded apply with retained
  rollback plist; final exact-release/code-root/runtime/channel/listener proof;
  unchanged protected aggregate state apart from independently attributable
  ambient work. Any disagreement stops before mutation or triggers the
  activator's automatic rollback.
- Release: exact commit `de815e1dfb1fa4c709ebf67b1974f5c0411395e5`
  binds source tree `c2594e33d8e08dc98b6f6047f104947253f0d26f`, a
  720-file artifact with digest
  `a17328de31c82e78db6e001b11ae58710238b4dc7cae20461fbd453aeb784cb3`,
  Node 22.23.2, and archive SHA-256
  `23c00a50c8f6ff69ed876410a003bcc87cc5431d86692b39209754899bcb54d5`.
  The release gate passed 638/638 email-critical tests plus independent runner
  build and 43/43 tests; focused reconciliation passed 29/29 and typecheck
  passed. Fresh local and production extraction independently verified the
  archive and both migration-123 files.
- Preflight/activation: production began on exact `070cde38` with one listener,
  connected Gmail/Slack, zero active/waiting/outgoing work, zero active email
  actions, valid disabled action-safety/time-observer configuration, and the
  selective Booking/Campanero capability configuration unchanged. The dry run
  named only code root, expected commit, and daemon path. One bounded apply at
  `2026-08-17T22:03:56Z` retained rollback plist
  `com.nanoclaw.plist.rollback-070cde380242-2026-08-17T22-03-56-272Z` and
  health-verified the target.
- Live/non-interference proof: launchd PID 60236 owns the sole port-8088
  listener and executes the exact immutable release under Node 22.23.2.
  Independent runtime verification, release/code-root health, connected
  Gmail/Slack, and zero active/waiting/outgoing work pass. Pending-email state
  remains 66 confirmed/6 blocked/0 active; tasks/jobs/groups remain 11/22/20;
  both Gmail history cursors are byte-identical; trigger occurrence/source/
  event/state counts remain 1/0/0/0. All three migration-123 tables remain
  absent. No deployment-authored message, Gmail call, business row, or source
  event occurred; the transferred temporary archive was removed after install.
- Boundary/rollback: immutable release installation and one service restart
  occurred. Migration 123 was not applied and the shadow remains unwired, so
  database rollback is not applicable. Runtime rollback is the retained prior
  plist and exact `070cde38` release. No source/cursor/recovery, task, prompt,
  skill, capability, approval, action, send, push, or merge changed.

### NC-20260817-006

- Trigger/base: the owner said to continue after NC-005 completed the local
  proposal contract. This isolated worktree starts from exact NC-005 closeout
  `5c81a37b625cd067d1dfd229b607367e3e0948c3`; the shared dirty operational
  checkout and all earlier worktrees remain untouched. The claim is local-only
  until explicitly pushed.
- Outcome: implement the next read-only shadow prerequisite: an exact Google
  Gmail profile/full-mailbox-list wrapper and a host-owned, content-free,
  resumable snapshot ledger that can account more than 10,000 immutable
  message IDs across bounded invocations. Resume must retain exact source/gap
  binding, candidate uniqueness, accepted/rejected receipts, terminality, and
  stable before/after history-head proof without storing message content or
  addresses.
- Authority boundary: Gmail access is read-only and limited to profile plus
  unfiltered `users.messages.list` pages including Spam and Trash. Local shadow
  writes may target only the new disposable/unapplied reconciliation ledger.
  No production source registration/bootstrap, generic watermark write,
  current SQLite Gmail cursor, inbound 404 path, message fetch/recovery,
  classification, label, task, group, prompt, skill, capability, approval,
  Company Work, action, send, deploy, push, or merge is authorized.
- Fail-closed requirements: opaque page cursors and snapshot state are
  admin-only; exact replays converge while conflicting receipts fail; a head
  change, expired freshness/window, invalid/repeated candidate, pagination
  cycle, source/storage error, unknown disposition, non-terminal scan, or
  incomplete arithmetic cannot produce `gap_reconciled`. Interrupted and
  over-10,000-message scans remain pending rather than resetting or advancing
  the durable Gmail cursor.
- Acceptance: focused contract/wrapper/store tests include a resumable
  over-10,000-message success case and negative source/replay/drift/privacy
  cases. Rehearse additive schema, permissions, exact replay/conflict,
  append-only receipts, populated rollback refusal, and empty rollback in
  disposable PostgreSQL 16. Run exact Node 22.23.2 Company OS/Gmail regression,
  typecheck/build, email-critical and independent runner gates, formatting,
  schema sanitizer, documentation continuity, and diff checks. Deployment and
  live Gmail reads are not applicable to this local milestone.
- Implementation: the exact read-only wrapper, resumable orchestrator,
  PostgreSQL store, migration 123/rollback, release packaging, tests, and
  authoritative documentation are staged. The orchestrator consumes at most
  20 pages per invocation, accepts more than 10,000 IDs across resumes, checks
  a stable profile head before every continuation and after the terminal page,
  and reconstructs the NC-005 proposal only from complete durable accounting.
- Verification: disposable PostgreSQL 16 applied migrations 122 and 123 and
  completed 10,001 candidates over 21 pages in two advances with 5,001
  accepted, 5,000 rejected, exact replay, append-only refusal, admin-only ACL,
  populated rollback refusal, and successful empty rollback. Exact Node
  22.23.2 passes 29/29 focused, 219/219 combined Company OS/Gmail, 638/638
  email-critical, runner build plus 43/43, typecheck, root build, formatting,
  schema sanitizer, and documentation/capability continuity. The unrestricted
  full suite is 2,638/2,639; the sole failure is the unchanged unrelated CNPC
  wrapper-string assertion.
- Boundary proof: no production schema, source, gap/watermark, Gmail request,
  SQLite cursor, runtime import, message, task, action, send, deployment, push,
  or merge changed. The disposable database was stopped and removed; the
  migration remains unapplied and the shadow remains unwired.
- Commit/handoff: claim `4ec32bf4`; verified implementation `67870546` on the
  isolated local branch. Another client can resume from tracked code, tests,
  contracts, verification evidence, and the remaining-gates list without this
  conversation. No PR, push, merge, migration, deployment, or live proof was
  performed.

### NC-20260817-005

- Trigger/base: the owner said to proceed after the NC-004 dark deployment.
  This isolated worktree starts from exact NC-004 closeout `70ff5acb`; the
  shared dirty operational checkout and all earlier worktrees remain untouched.
  The claim is local-only until explicitly pushed.
- Verified current mechanics: inbound Gmail push persists
  `gmail_history_id`; the separate label-correction job persists
  `gmail_label_poll_history_id`. Both re-bootstrap after a Gmail history 404.
  The inbound push path explicitly moves to the notification cursor and accepts
  an unmeasured loss window. The two purposes and side effects are different,
  so this task covers inbound push only and must not claim label-poll recovery.
- Outcome: add one pure, injected adapter that maps an inbound history 404 to a
  content-free `gap_detected` proposal and can construct `gap_reconciled` only
  from a bounded Gmail message snapshot with a stable before/after profile
  history head, terminal pagination, unique immutable message IDs, and exact
  accepted/rejected accounting for every candidate. Unknown disposition,
  duplicate/invalid IDs, head drift, source failure, reversed or over-budget
  windows, and a residual page token must fail closed with no reconciliation
  proposal.
- Authority boundary: the adapter may produce validated source and watermark
  inputs but does not register a source or write PostgreSQL, SQLite, Gmail,
  Company Work, trigger occurrences, tasks, groups, prompts, skills,
  capabilities, approvals, messages, or actions. No runtime entry point may
  import it in this milestone; existing Gmail cursors and behavior remain
  unchanged.
- Acceptance: synthetic tests prove deterministic source identity, strict gap
  proposal semantics, terminal/stable/exact reconciliation, replay-stable
  evidence, and every fail-closed path above. Run exact Node 22.23.2 focused and
  combined Company OS/Gmail tests, typecheck/build, email-critical and runner
  gates, formatting, documentation continuity, and diff checks. Deployment,
  production source registration/bootstrap, real Gmail reads, and live gap
  forcing are not applicable to this local milestone.
- Implementation: `src/company-gmail-reconciliation.ts` creates a
  deterministic full-snapshot source and validated proposal-only 404/recovery
  events. The recovery port exposes only clock, profile head, unfiltered page
  listing, and read-only per-ID accounting; it has no write/delivery callback.
  Twenty 500-ID pages, eight days of gap age, and twenty minutes of attempt age
  are hard bounds. A stable before/after profile head and exact unique-ID
  accepted/rejected evidence are mandatory. `docs/COMPANY-OS-GMAIL-RECONCILIATION.md`
  records why recent-date search is insufficient and names the activation
  blockers.
- Verification: exact Node 22.23.2 passes 61/61 focused Gmail/source tests,
  172/172 combined Company OS tests, typecheck, root build, 638/638
  email-critical tests, and independent runner build plus 43/43 tests. The
  ordinary unrestricted full suite is 2,624/2,625; its sole failure is the
  unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. Root formatting, schema sanitizer, documentation/capability
  continuity, and staged/final diff checks pass.
- Boundary: implementation commit `fc1fdb32` is local and unwired. No Google
  API call, production schema/data/config/service, source registration or
  cursor, existing Gmail code/router state, work ledger, task, group, agent,
  prompt, skill, capability, approval, message, action, push, or merge changed.

### NC-20260817-004

- Trigger/base: after NC-003 completed the local trigger-source/watermark
  foundation, the owner said to proceed with the explicitly named next dark
  production milestone. This isolated worktree starts from exact NC-003
  closeout `c60dc6cf`; the shared dirty operational checkout and all prior
  worktrees remain untouched. The claim is local-only until explicitly pushed.
- Initial production preflight: `mini-claw.local` serves exact verified release
  `baed66dba21dd35edf4d472c537a1d69c5fa867a` from one listener under the
  plist-pinned Node 22.23.2 runtime and matching immutable code root. Slack and
  Gmail are connected, the outgoing Slack queue is empty, the normalized time
  observer is disabled, and capability/action-safety configuration is valid.
  Two ordinary containers were active, so no drain, backup, migration, transfer,
  or activation has begun. Migration 121 is present; all three migration-122
  tables are absent.
- Outcome: produce and independently verify one clean immutable release that
  binds migration/rollback 122, create a narrow mode-0600 database backup, apply
  exactly that release-bound migration, prove its three tables are structurally
  correct, empty, append-only where required, and admin-only, then activate the
  same release through the recovery-safe exact-three-field service transaction.
  Health must prove the full commit/code root, one listener, connected required
  channels, empty waiting/outgoing queues, and no source/watermark rows.
- Authority boundary: schema presence is inventory capacity only. This task may
  not register a source, initialize a cursor, detect or reconcile a live gap,
  import the NC-003 module into the daemon, enable or change any source adapter,
  create/resume a task, select an agent/skill, change a capability or approval,
  or send a Slack/Gmail/external message or action. Existing time-occurrence,
  schedule, job, channel, Company Work, email-action, and source-cursor facts
  remain authority and must be compared only through content-free aggregates.
- Acceptance: exact Node 22.23.2 clean build and release gate; fresh local and
  production archive verification with recorded SHA-256; zero active/waiting
  containers, zero outgoing queue, and zero active email actions before schema
  or service mutation; backup validation; single-file migration application;
  table/constraint/owner/grant/row-count proof; bounded activator dry-run/apply;
  exact `/health` release/channel/listener proof; unchanged protected aggregates
  apart from attributable ambient work; documentation continuity and a
  recoverable prior plist/release. Stop before source registration or adapter
  implementation.
- Release: exact commit `070cde380242767d281641bdba34f525a33f650b`
  binds source tree `c1af83c9035b75b630a7d71c2c7d861ebf652ea7`, a
  708-file compiled artifact with digest
  `00394081299e1258b2ac7098aebd510b0b6fe8ecd6ca3ed602282133c114ce27`,
  Node 22.23.2, and archive SHA-256
  `24baf0e8912501520dc02d85d332fb4d0dd2a2eaa55c413191ae0d746b07c1b1`.
  The clean builder's email-critical 638/638 and independent runner build plus
  43/43 tests passed; fresh local and production extraction verified the same
  archive. Focused trigger tests pass 58/58, combined Company OS tests 157/157,
  and exact-runtime typecheck passes. Formatting, schema-sanitizer,
  documentation-continuity/capability, and diff checks pass.
- Drain/backup/migration: ordinary Chief, Sales, Mailman, and Courses work was
  allowed to finish naturally; no container was interrupted. The final three
  mutation gates each required zero active/waiting containers, zero outgoing
  Slack queue, and zero active approved-email actions. Mode-0600 custom backup
  `company-trigger-before-122-2026-08-17T18-14-16Z.dump` is 9,046 bytes,
  contains 28 listed entries, and has SHA-256
  `b9d232ccc4439783f3ff7d4719e251added3db625c2f6c666957db42d670adcb`.
  Only release-bound migration 122 (SHA-256
  `bb4ebfa8cde9c54a62bb8f11a60abab0096bbfd0ccb5599a3519b45037d4f6a7`)
  was applied.
- Schema proof: `company_trigger_sources`,
  `company_trigger_watermark_events`, and `company_trigger_watermark_state`
  are owned by `nanoclaw_admin`; table/sequence grants to non-admin roles are
  zero, both immutable-table append-only triggers exist, and forbidden
  raw/message/prompt/action columns are zero. Source, event, and state row
  counts are all zero; the existing occurrence count remains one.
- Activation/live proof: the activator dry-run named only the exact three
  documented plist paths. Applied activation moved exact release `baed66d` to
  `070cde38`, retained rollback plist
  `com.nanoclaw.plist.rollback-baed66dba21d-2026-08-17T18-15-44-734Z`, and
  health-verified the target. Independent readback found one listener, exact
  Node 22.23.2 release/code-root identity, connected Gmail/Slack, empty active,
  waiting, and outgoing queues, disabled time observer with zero new calls,
  valid capability/action-safety configuration, and all new tables still empty.
  A later stability read at `2026-08-17T18:20:54Z` again found one exact-release
  listener, connected channels, zero outgoing queue, disabled observer with
  zero calls, and 0/0/0 source/event/state rows.
- Ambient attribution/non-interference: one ordinary approved email completed
  during the prolonged drain, moving confirmed actions 65 to 66 and Company
  Work from 12 items/version sum 53/65 events/27 receipts to 13/60/73/31. The
  new item is independently classified as completed `sales_email` from
  `sqlite_email_action` with approval, action-claim, Gmail-delivery, and
  outcome receipts. Scheduled tasks remain 11, jobs 22 (17 enabled), groups
  20, blocked email actions 6, the normalized time occurrence one, and every
  migration-122 table zero. No NC-004 message or action occurred.
- Boundary: production backup, additive schema application, immutable release
  installation, and one bounded service restart did occur. No source was
  registered or bootstrapped; no cursor/gap event was written; no source
  adapter, current source cursor, task, prompt, agent, capability, approval,
  customer/internal message, or action path changed. No push or merge occurred.

### NC-20260817-003

- Trigger/base: the owner said to continue the Company OS roadmap after the
  completed NC-002 activation milestone. The isolated worktree starts from
  exact closeout `7aaf7caa`; the shared dirty operational checkout and prior
  worktrees remain untouched. This claim is local-only until explicitly
  pushed.
- Verified source inventory at claim time: the one normalized adapter is the
  now-disabled exact-boundary scheduled-task observer. Gmail push and Gmail
  label correction each persist independent history IDs in mutable SQLite
  `router_state`; both currently re-bootstrap after history expiry, and the
  inbound push path explicitly accepts an unmeasured data-loss window.
  Generic webhooks archive provider event IDs when extractors can supply them,
  but some sources legitimately or provisionally use NULL IDs; only the
  Trafft sweeper has the older mutable PostgreSQL watermark implementation.
  Gmail Pub/Sub is a transport, not a generic topic adapter. No normalized
  topic or business-condition adapter exists.
- Outcome: establish a versioned, content-free source definition registry and
  durable watermark state machine before any other trigger family can be
  promoted. Exact registration replay must converge; changed facts under the
  same definition must conflict. Watermark events must use optimistic state
  versions, preserve append-only history, advance only across a source-specific
  monotonic cursor with complete `observed = accepted + rejected` accounting,
  freeze on a durable gap, and resume only through an event bound to that exact
  open gap. Registration or watermark state grants no task, skill, capability,
  approval, message, or action authority.
- Scope/risk: C2 reversible local source/schema/documentation work with no
  production application. Likely files are a focused typed host module/test,
  additive migration/rollback 122, structure-only schema/data docs, trigger
  contract, project map, roadmap, changelog, and this register. Existing
  source adapters and cursor stores are evidence only and will not be changed
  or wired. No active task claims the new module or migration; documentation
  overlap is controlled in this isolated branch.
- Acceptance: focused contract and migration tests plus disposable PostgreSQL
  rehearsal prove registration replay/conflict, monotonic and CAS refusal,
  exact checkpoint replay, gap freeze, explicit gap reconciliation,
  accounting checks, append-only history, history-preserving rollback, and
  zero agent grants. Then run pinned Node typecheck/build, applicable Company
  OS/email/runner/full tests, formatting, continuity, and diff checks. No live
  schema/config/service/source/task/channel/message/action state may change.
- Implementation: the new host-only module accepts immutable, content-free
  source definitions and records versioned `bootstrap`, `advance`,
  `gap_detected`, and `gap_reconciled` events. Cursor kinds are explicitly
  `none`, unsigned integer, or UTC timestamp; recovery is explicitly
  not-applicable, bounded scan, full snapshot, or unsupported. Ordinary
  advancement is blocked while a gap is open, and reconciliation must bind to
  that exact gap. Every successful result retains fixed
  `actionAuthority: none`; no daemon or group imports the module.
- Durable target and rehearsal: unapplied migration 122 adds an admin-only
  immutable source registry, append-only watermark history, and mutable
  compare-and-swap state head. PostgreSQL 16 rehearsal applied migrations 121
  and 122, converged exact registration/event replay, refused changed facts,
  stale versions and backward cursors, froze at a gap, reconciled only the
  exact open gap to cursor 500, enforced append-only history, exposed zero
  non-admin grants, refused populated rollback, and removed an empty install.
  The disposable cluster and scripts were removed.
- Verification: 58/58 focused source/trigger tests and 157/157 combined
  Company OS tests pass. Exact Node 22.23.2 typecheck and build pass;
  email-critical passes 638/638 plus the independent runner build and 43/43
  tests. The unrestricted full root suite is 2,609/2,610; its sole failure is
  the unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. Formatting, documentation continuity/capability, and diff
  checks pass; the capability check required its ordinary unrestricted IPC
  environment after the sandbox refused the local `tsx` socket.
- Boundary: migration 122 is local, unapplied, and unseeded. No runtime entry
  point imports the module. No production schema/data/config/service, source
  registration or cursor, adapter, schedule, task, work-ledger state, agent,
  skill, capability, approval, message, action, push, or merge changed.

### NC-20260817-002

- Trigger/base: the owner approved NC-001's next production-gated milestone.
  This isolated worktree starts from exact local closeout `2d256cd8`; the main
  operational checkout and the completed NC-001 worktree remain untouched.
- Outcome: make migration 121 live, deploy the normalized-trigger code with all
  adapters disabled, then enable one source-read-only observer for one existing
  scheduled-task ID and one closed intended-boundary window. The observer runs
  only after the scheduler's existing compare-and-swap claim, hashes bounded
  schedule facts without prompt/chat/result content, and records no task,
  Company Work, agent, approval, capability, message, or action state.
- Initial live preflight: `mini-claw.local` served exact verified release
  `a2e6d35` from sole PID 4213 under Node 22.23.2 with connected Slack/Gmail,
  zero waiting groups, empty outgoing Slack queue, and zero active email
  actions. One ordinary Sales container was active during the read-only check,
  so migration/deployment drain has not begun. Migrations 118-120 are present;
  migration 121 is absent. SQLite has 11 task definitions: one active cron,
  two paused cron, eight completed once; 207 task-run rows; and 22 jobs/17
  enabled. The sole active cron is the existing Sales daily-followup task with
  its next natural intended boundary at `2026-08-17T14:00:00.000Z`.
- Authority and failure boundary: normal scheduler claim/execution remains
  authoritative. Observer refusal or PostgreSQL failure must be visible in
  aggregate health but cannot undo, retry, delay materially, or prevent the
  already-claimed task. The canary must not manufacture a task occurrence,
  widen the source ID/window, inspect raw prompt/result content, or treat the
  trigger row as permission to create/resume work.
- Acceptance: exact Node 22 focused/type/full/email/runner/docs/release gates;
  disposable PostgreSQL insert/replay/conflict/append-only/rollback evidence;
  clean immutable archive and fresh local/production verification; production
  backup and explicit one-file migration apply; one healthy dark deployment;
  one value-redacted config dry-run/apply; exactly one naturally sourced row
  for the allowlisted intended boundary plus duplicate-only replay; and
  unchanged schedule definitions, protected Company Work/email/job/channel
  facts apart from ordinary ambient execution. Any natural task output is
  baseline scheduler behavior, not adapter outcome evidence.
- Local candidate: the observer is wired only after the existing SQLite
  compare-and-swap claim and invoked fire-and-forget. It resolves configuration
  dynamically, requires one exact task and boundary, hashes task/schedule facts
  into content-free aliases/evidence, records through the normalized-trigger
  store, and exposes aggregate health without the task ID. The release helper
  is value-redacted, release-bound, dry-run-first, exact-host confirmed,
  backup-producing, atomic, and restorable.
- Commits: local implementation `96e93494` contains the observer, scheduler
  isolation, dynamic aggregate health, release-bound config transaction,
  release inventory, tests, and authoritative documentation. Ready-for-deploy
  continuity commit `baed66db` is the exact deployed release source.
- Local evidence: 49/49 focused trigger/scheduler tests, exact Node 22.23.2
  typecheck, root build, 105/105 combined Company OS tests, 638/638
  email-critical tests, independent runner build plus 43/43 tests, formatting,
  documentation continuity/capability checks, and diff checks pass. The
  unrestricted full root suite is 2,580/2,581; its sole failure is the
  unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. A
  disposable PostgreSQL 16 cluster applied only migration 121 over the required
  host-only prerequisite, recorded one exact time occurrence, returned exact
  replay as duplicate, refused schedule-semantic drift, rejected wrong
  task/boundary before the store, enforced append-only history, exposed zero
  non-admin grants, refused populated rollback with the row intact, and removed
  an empty table in a second database. The cluster and smoke script were
  stopped and removed.
- Immutable release: clean commit
  `baed66dba21dd35edf4d472c537a1d69c5fa867a` binds source tree
  `b27b68cf572ac5b4945239b8233fb9d8967223a2`, 704 artifact files with digest
  `db45a60a58d5be706e5c02bfd87347e44cf03f9abeeac25fd39a2a660597143f`,
  Node 22.23.2, and archive digest
  `47796922cd7bb45e942c8fb8ae1af3bf44c148bb8188f12a9bc95cfb63aa27a6`.
  Fresh local extraction and the transferred archive independently verified.
- Drain/backup/migration: after ambient work fell from five active containers
  to zero without intervention, the final gate had zero active/waiting work,
  outbound queue depth zero, and zero active email actions. The mode-0600,
  54,091-byte custom-format backup
  `company-trigger-before-121-2026-08-17T13-24-49Z.dump` contains 79 selected
  catalog entries and has SHA-256
  `03bb242b240f0b7202330b1774626c9f4691030049ebbff63ecedab13ce8175b`.
  Only bundled migration 121, digest
  `c8f06c5642965557c02a37c4a47d82b42246bc278a197bbb4aef133fe2b394a1`,
  was applied. The empty table was admin-owned, append-only, had zero
  non-admin table/sequence grants, and exposed zero forbidden raw/authority
  columns.
- Dark deployment: recovery-safe activation moved exact release `a2e6d35` to
  `baed66d` and retained
  `com.nanoclaw.plist.rollback-a2e6d35c3d50-2026-08-17T13-27-07-780Z`.
  One listener under Node 22.23.2 proved the exact commit/tree/artifact and code
  root, connected Slack/Gmail, empty active/waiting/outgoing queues, zero active
  email actions, observer `disabled` with zero calls, and zero trigger rows.
- Natural canary/replay/expiry: value-redacted apply selected the existing
  active weekday cron and its exact `2026-08-17T14:00:00.000Z` intended
  boundary, retaining
  `.env.rollback-company-time-trigger-2026-08-17T13-28-07-142Z`. The scheduler
  naturally claimed it at `2026-08-17T14:00:11.382Z`; daemon health recorded
  one call, one match, one applied row, and zero failures. PostgreSQL contains
  exactly one `time`/`scheduled_task` occurrence with valid content-free hashes
  and fixed `create` intent; the existing task advanced to the next natural
  boundary without definition or status change, then completed under scheduler
  authority at `2026-08-17T14:02:30.772Z` as task-run row 208. Result content
  was not inspected and is not trigger evidence. An exact activated-release
  replay returned `duplicate` and left row count one. The config was then
  expired to disabled, retaining
  `.env.rollback-company-time-trigger-2026-08-17T14-01-54-108Z`; daemon health
  preserves the 1 matched/1 applied/0 failures evidence while exposing zero
  configured tasks.
- Non-interference/ambient attribution: task, job, and channel definition counts
  remained 11, 22 (17 enabled), and 20; active email-action count remained zero.
  During the long natural wait, three ordinary approved-email actions completed,
  adding exactly three each of approved, routed, Mailman-started, executing,
  and Gmail-confirmed events. The existing Company Work shadow independently
  projected the two eligible Sales-email actions as 2 items/16 events/8
  receipts, moving aggregate state from 9/35 versions/44/18 to
  11/49/60/26. The already-active exception loop's expected post-restart daily
  run posted Chief brief 2 for the same three cases and added three `briefed`
  events, moving attention counts from 3 cases/1 brief/9 events to 3/2/12.
  Those baseline producers are named in their rows and health; the trigger
  adapter wrote only the single separate occurrence. The natural task's one
  added run row is scheduler evidence, not trigger outcome evidence.
- Boundary: production schema, release, one natural occurrence, exact replay,
  and config expiry occurred. No synthetic task run, task create/resume,
  schedule definition/prompt, agent/skill/capability, trigger-created approval,
  trigger-driven customer or Slack/Gmail message, Company Work transition, action authority,
  push, or merge occurred. Gmail, webhook, topic, business-condition adapters,
  recurring time definitions, source watermarks, and loss recovery remain
  separate gates.

### NC-20260817-001

- Trigger/base: after exact release `a2e6d35` live-proved the first Company OS
  exception brief, named acknowledgment, threaded receipt, and source
  non-interference, the standing roadmap instruction advances to R3 trigger
  normalization. This task starts from NC-018 evidence closeout `4528a7f2` in
  an isolated worktree; the main operational checkout remains untouched.
- Outcome: define one host-owned normalized occurrence contract shared by
  time/schedule, Gmail, webhook, topic, and business-condition sources. One
  immutable source occurrence receives stable definition, occurrence, and
  semantic fingerprint identities. Exact replay converges; same-identity
  semantic drift fails closed; trigger acceptance grants no task, skill,
  capability, approval, or action authority.
- Scope/risk: C2 local dark foundation. Likely files are a focused typed
  module/test, additive migration/rollback 121, the structure-only business
  schema reference, a trigger-contract design, and Company OS/project/data
  continuity. No current active task claims those new files. Existing
  scheduler, Gmail, webhook, reaper, work-ledger, group, and runtime files are
  read-only evidence and will not be wired or changed under this task.
- Acceptance: runtime validation rejects unknown/raw fields, invalid hashes,
  malformed identities and clocks; all five trigger families normalize;
  replay, conflict, and new-occurrence paths are deterministic; a disposable
  PostgreSQL 16 run proves insert, exact duplicate, semantic conflict,
  append-only history, admin-only grants, and populated rollback refusal.
  Exact Node 22 focused/type/full/email/runner/data/docs gates must pass. Stop
  at a committed local milestone with production schema, daemon behavior,
  schedules, channels, tasks, work items, and external systems unchanged.
- Local implementation: commit `ec49ac68` adds the strict v1 runtime envelope,
  stable definition/occurrence/semantic SHA-256 identities, exact replay and
  split/drift conflict handling, an injected host PostgreSQL store, migration
  121 and guarded rollback, immutable-release bundling, 29 focused tests, and
  the normalized-trigger design/data/project/roadmap authorities. At NC-001's
  local closeout no runtime entry point imported the module and migration 121
  was unapplied; NC-002 records the later production activation above.
- Disposable database evidence: PostgreSQL 16 recorded all five trigger kinds
  as five rows, classified exact replay as duplicate, refused same-identity
  semantic drift, refused UPDATE/DELETE through the append-only trigger, and
  exposed zero non-admin grants or forbidden raw/action columns. Populated
  rollback refused with all five rows intact; a separate empty database proved
  rollback removes the empty table. The ordered fresh fixture applied the
  applicable migration chain through 121; legacy migrations 17 and 91 could
  not run because that deliberately empty fixture lacks their pre-v2 public
  tables. The disposable cluster and smoke script were stopped/removed.
- Validation: exact Node 22.23.2 passes 29/29 focused tests, 100/100 combined
  Company OS tests, typecheck, root build, 637/637 email-critical tests,
  independent runner build plus 43/43 tests, formatting, documentation
  continuity/capability checks, and diff checks. The unrestricted full root
  suite is 2,567/2,568; its sole failure is the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`.
- Boundary: this is a committed local dark-foundation milestone only. No
  production database, daemon, config, schedule, Gmail/webhook/topic/condition
  source, channel, task/work item, agent/skill/capability, external action,
  push, or merge changed. Production activation and any task create/resume
  wiring require a separate claimed task and explicit state-change gates.

### NC-20260816-018

- Trigger/base: after NC-017 deployed and live-verified the second bounded
  work-ledger source, the owner instructed Codex to continue to the next named
  Company OS milestone, previously identified as the operator exception loop.
  This task starts from NC-017 evidence closeout `9f1f576`; current production
  state must be re-read before any external-state change.
- Outcome: turn the two privacy-minimized pilot projections into one small
  operator attention loop. A complete, non-truncated ledger read opens or
  re-observes exact exception cases, resolves a case only when that exception is
  absent from a later complete read, and posts only a new/due bounded brief to
  the registered Chief channel. A named operator's check reaction acknowledges
  the cases bound to that exact posted brief and receives a mechanical receipt.
- Authority boundary: acknowledgment means only "a named operator has seen
  these exceptions." It cannot resolve, cancel, retry, approve, dispatch, send,
  pause/resume, or advance a work item. Source disappearance is the only
  resolution authority. Unavailable or truncated reports, ambiguous Slack
  delivery, unknown message timestamps, unnamed users, and stale/replayed
  callbacks fail closed.
- Scope/risk: C5 because Slack UID becomes an operator-identity boundary, plus
  C3 internal Slack delivery and C2 host-only PostgreSQL state. Likely files are
  migration/rollback 120, the structure-only schema reference, a focused
  exception-loop module/tests, the minimal Slack UID callback plumbing,
  composition/health/config wiring, and Company OS/project/release continuity.
  The active `NC-20260811-002` row also names Slack approval callbacks; this
  isolated branch will not alter approval-card semantics and will limit shared
  Slack changes to backward-compatible UID provenance for exact host listeners.
- Activation gate: implementation ships default off. Before enabling, require
  exact Node 22 focused/full/email/runner/release gates, disposable PostgreSQL
  migration/reconciliation/replay/rollback proof, a production backup and
  explicit one-migration apply, exact release/drain/health proof, a configured
  non-empty named-operator allowlist, and one bounded Chief-channel canary.
  No customer message, email/job action, workflow promotion, push, or merge is
  authorized.
- Local implementation: migration 120 creates separate current case and brief
  state plus append-only lifecycle events, all admin-only and content-minimized.
  The host loop accepts only complete reports, claims a daily/change
  fingerprint before Slack, never retries ambiguous delivery, and resolves a
  case only from source absence. Exact check reactions carry Slack UID/source
  provenance; typed approval and unnamed users receive visible refusal without
  falling through to a workflow agent. Health exposes counts and state, never
  UID values. The bundled activation helper is release-bound, dry-run-first,
  hostname-confirmed, backup-producing, atomic, and copies only an approved
  existing named-operator source.
- Disposable evidence: PostgreSQL 16 applied migrations 118 -> 119 -> 120 and
  exercised one deadline exception through open, daily dedupe, source-derived
  resolution, reopen occurrence 2, refusal of an old brief to acknowledge that
  occurrence, exact current-brief acknowledgment/receipt, and append-only event
  rejection. Source work cardinality stayed 1 item/1 event/0 receipts while
  attention state reached 1 case/2 briefs/6 events; populated rollback refused.
  A second empty cluster proved clean rollback removes all three tables. Both
  disposable clusters were stopped.
- Release evidence: clean release commit
  `0d2c8ecfab96311db18c58db66cd277a6cb92c68` binds source-tree hash
  `f8d83fe7c1690c546f13cd800b9aa0036562343a`, 692-file artifact digest
  `d42825ce1af42e5ec589f7fdda0fafbcde056cdf441f3c90b5a5b9a4fd40f7a5`,
  and archive digest
  `d1a38fe69e4ce3316704978e1b98b07af0461e1f18f8522f1bdd12e46b5b64ad`.
  Fresh local and production extraction both passed before activation.
- Production migration: the exact preflight found release `999f2a4`, one
  healthy Node 22.23.2 listener, connected Slack/Gmail, empty queues, zero
  active containers/actions, one Chief target, live migrations 118/119, and
  migration 120 absent. Backup
  `company-work-before-120-2026-08-17T02-46-42-864Z.dump` is mode 0600, has 56
  catalog entries, and hashes to
  `c3454457d9802706ee5037427c679923c8b807d773cb99c22e6b5f72172d1799`.
  Only migration 120 was applied. All three new tables are admin-owned with
  zero non-admin grants, append-only history enforcement, no raw-content
  columns, and zero rows.
- Dark deployment: `mini-claw.local` now serves exact release `0d2c8ec` from
  sole PID 92811 under Node 22.23.2; Slack/Gmail are connected, queues and
  active containers/actions remain empty, and the shadow observer is
  duplicate-only healthy. Exception-loop health is exactly disabled with zero
  configured operators, zero attempts, and no result. The 9 work items/version
  sum 35, 44 events, 18 receipts, 334 email events, and their recorded hashes
  are unchanged. Attention tables remain 0/0/0. Ordinary host scheduling added
  four run-log rows during the window, while 22 job definitions/17 enabled and
  11 task definitions remained stable; the disabled loop did not run.
- Rollback/activation gate: the prior `999f2a4` launchd plist is retained at
  `com.nanoclaw.plist.rollback-999f2a44f773-2026-08-17T02-47-05-260Z`.
  No approved named-operator source key exists in production configuration.
  Privacy-minimized Chief membership metadata identifies Alex Kudinov as the
  sole human participant, but membership is not an authority grant. Owner
  confirmation and a dedicated Company-only allowlist path are required before
  restart or the first natural Chief canary; no Slack message was posted.
- Operator decision: at 2026-08-17T02:57Z the owner explicitly confirmed Alex
  Kudinov as the sole Company Work exception operator. This grants only the
  exact attention-acknowledgment authority defined here. Because no approved
  existing operator source key exists, the activation candidate adds a narrow
  value-redacted bootstrap from an owner-only regular file; it does not inherit
  or create Procurement, Healer, approval, email, or workflow authority.
- Activation-delta verification: the restrictive-file path rejects symlinks,
  group/other permissions, wrong-owner files, multiple or malformed IDs, and
  ambiguous sources while returning only a redacted operator count. Exact Node
  22.23.2 passes typecheck, 28 focused tests, 637/637 email-critical tests, and
  the independent runner build plus 43/43 tests. The unrestricted full root
  suite is 2,538/2,539 with only the unchanged CNPC wrapper-literal assertion.

### NC-20260816-017

- Trigger/base: the owner approved NC-016's separately gated production
  activation milestone after its dark schema/projector foundation was committed
  and locally verified. This task starts from exact NC-016 closeout `d8f198d`
  and must re-read current production state rather than infer it from NC-015.
- Outcome: apply the compatible ledger schema, project a bounded set of exact
  SQLite host-job run facts into PostgreSQL, and make host-job exceptions
  visible through the read-only Company OS report without allowing the ledger
  or Campanero to control execution.
- Scope/authority: C2 production schema/write plus reversible service
  activation. Add a default-off observer with required lower-bound timestamp
  and batch ceiling, workflow-specific report rules, tests, release and
  rollback evidence; explicitly apply only migration 119; deploy the exact
  verified release; run one bounded projection/report; compare before/after
  job definitions, run logs, schedules, channels, email state, and ledger
  fingerprints. No job run/pause/resume, job definition/schedule mutation,
  agent prompt/capability change, recurring task, Slack/Gmail/customer message,
  other external write, push, or merge is authorized.
- Acceptance: reconcile the then-live schema/release first; historical
  success/failure/timeout/dispatch/source-gap/running rows and exact retries are
  covered; the observer is disabled by default and cannot accept raw output or
  error content; report validation is workflow-specific; exact Node 22.23.2
  focused/full/email/runner/data/docs gates pass; deployment converges to one
  healthy listener; and the bounded production proof changes only the expected
  PostgreSQL work-ledger rows while SQLite job/schedule/run fingerprints and
  channel/email state remain unchanged.
- Production preflight: exact live release `cf9625847bb2...` is healthy on one
  Node 22.23.2 listener with connected Slack/Gmail, empty queues, no active
  containers/actions, migration 118 constraints, and no migration-119 or
  observer configuration. The privacy-minimized cutoff fingerprints are
  recorded in `docs/ENGINEERING-CHANGELOG.md`.
- Candidate verification: exact Node 22.23.2 passes 125 focused tests,
  typecheck/build/formatting, 636 email-critical tests, and the independent
  runner build plus 43 tests. The unrestricted root suite is 2,508/2,509 with
  only the unchanged CNPC wrapper-literal assertion failing. Disposable
  PostgreSQL 16.15 proved 118 -> 119, one compiled-CLI successful projection,
  duplicate-only exact replay, and a zero-exception job-filtered report.
- Production result: backup `company-work-before-119-2026-08-17T01-50-18Z.dump`
  was validated before only migration 119 was applied. Exact release `999f2a4`
  is healthy on sole PID `74446`. A five-run closed window applied exactly 15
  transitions/5 receipts; exact replay was 15 duplicates/0 applies. The
  job-only report is 5 complete/0 exceptions, while the combined report retains
  only the known email source gap. Source-window, job-definition,
  task-definition, and all Mailman/Sales hashes are unchanged; email remains 0
  active/334 events.
- Rollback: restore the retained `cf96258` release/plist and leave projected
  history dormant. Five host-job rows now intentionally block the schema
  rollback; never delete history to force it.

### NC-20260816-016

- Trigger/base: the owner approved the next Company OS milestone after the
  read-only Mailman/Sales brief was deployed and live read-verified. This task
  uses an isolated worktree from documentation head `b4712bd`; it does not
  assume that a local candidate is active production code.
- Outcome: establish Campanero host-job executions as the second work-ledger
  pilot while keeping the existing SQLite job registry and `job_run_logs` as
  execution authority.
- Scope/authority: C2 local, reversible, dark implementation only. It may add
  an unapplied additive migration/rollback, host-only typed transition policy,
  privacy-minimized injected projector, tests, and continuity documentation.
  It must not apply schema, read or write production, import the projector into
  the daemon/scheduler, change a job or schedule, alter Campanero's prompt or
  capability, deploy, send a message, push, or merge.
- Implementation: migration 119 adds the `host_job_run` workflow and exact
  start/terminal-failure facts while retaining every migration-118 append-only,
  ownership, version, idempotency, and no-agent-grant control. One
  `job_run_logs.id` maps to one non-Party work item. The unwired single-run
  projector accepts structural run fields only and records exact terminal
  receipts; contradictory or incomplete facts become named source gaps without
  an invented receipt. Existing email APIs remain workflow-guarded and the
  read-only report remains explicitly `sales_email`-only.
- Verification: exact Node 22.23.2 passes 35/35 focused ledger/shadow tests,
  typecheck, build, source formatting, 635/635 email-critical tests, and the
  independent runner build plus 43/43 tests. The unrestricted full root suite
  passes 2,501/2,502; the sole failure is the unchanged unrelated CNPC wrapper
  string assertion. Disposable PostgreSQL 16.15 proved 118 -> 119 preserves an
  email row, accepts a receipt-bound host terminal failure, rejects Party-bound
  job work, and refuses rollback with host history; a separate 118 -> 119 ->
  rollback run restored the email-only NOT NULL contract without data loss.
- Known gap: `already_running` has no durable `job_run_logs` row and therefore
  cannot be projected. Source durability/trigger normalization belongs to a
  later scheduler-owned task; it is not inferred from mutable job state here.
- Rollback: revert this local branch. Migration 119 is not applied and the
  projector is not runtime-wired, so no database, job, schedule, service,
  channel, or external-state recovery applies.

### NC-20260816-015

- Trigger/base: the owner approved NC-014's separately gated next milestone
  after the read-only report was committed and documented. This task starts
  from exact NC-014 closeout `5f607fe`; current production identity must be
  re-read rather than inferred from that task's earlier snapshot.
- Outcome: package and activate the exact committed report, prove production
  service/channel health, run one bounded metadata-only report, and compare
  before/after aggregates so release activation or observation cannot be
  mistaken for workflow promotion.
- Scope/authority: C2 reversible production service activation and a C0
  PostgreSQL read. The report remains disconnected from the daemon, scheduler,
  Slack, Gmail, approval, transition, and send paths. No schema migration,
  environment toggle, group prompt, customer traffic, production write,
  external message, push, or merge is authorized.
- Acceptance: a clean exact-Node immutable artifact is independently verified;
  preflight records current release, service, listener, channels, pending email
  states, Company OS table aggregates, and rollback; dry-run and applied
  activation prove the target full commit and code root; the compiled CLI emits
  one bounded sanitized report; postflight proves the same channels and
  unchanged email/work-ledger aggregates.
- Release: clean commit `cf9625847bb2cbb0faa167f68a0f842d645e1807`,
  source tree `0edd192cc8bb073fc028c05645727a1554ea164e`, 676-file
  artifact `02627f90816dd80657a92cc17e89b2eea8bf8d3f721b5997c771081ecdcdb960`,
  and archive SHA-256
  `f2ecf9e81d76a94a695d1afd94d37ea463f0db9b388c925139f448299153b6d5`
  independently verified locally and on `mini-claw.local` under Node 22.23.2.
- Deployment: preflight found exact release `02ce48f`, one listener, connected
  Slack/Gmail, empty daemon/outgoing queues, and zero active email actions. The
  dry run named exactly the code-root, expected-commit, and program-argument
  pointer changes. Activation produced rollback plist
  `com.nanoclaw.plist.rollback-02ce48f5564c-2026-08-16T23-49-36-282Z` and
  health-verified `cf96258`; fresh PID `16616` is both the sole `:8088`
  listener and launchd/heartbeat PID.
- Production read: the compiled CLI scanned all four items without truncation:
  three completed, zero healthy-open, and one critical failed/stale
  `source_gap:mailman_dispatch_missing`; contradiction, event-chain, duplicate,
  receipt-gap, overdue, waiting-approval, and outcome-missing counts were zero.
- No-write proof: before and after remained four work items, version sum 25,
  29 events, 13 receipts, and identical maximum item/event/receipt timestamps.
  SQLite remained 61 confirmed plus 6 blocked actions, 334 events, and zero
  active actions. Slack/Gmail stayed connected, queues stayed empty, and the
  shadow observer continued duplicate-only with zero transitions.
- Ambient activity: after the 23:50Z report/comparison window, the normally
  running service recorded one Booking-group outbound Slack row at
  23:56:54Z. Its content was not inspected, it was not task-authored, and it is
  not treated as report, deployment, or NC-013 outcome evidence.
- Continuity evidence commit: `360b0ae`.
- Rollback: the release activator's exclusive saved plist restores the exact
  prior immutable release, followed by one bounded reload and health proof. No
  database rollback applies because this task performs no migration or write.

### NC-20260816-014

- Trigger/base: the owner approved the next Company OS milestone after the
  bounded Mailman/Sales ledger foundation and shadow projection were
  live-verified. This task uses an isolated worktree from documentation head
  `ec18d6f`, whose source tree matches exact active release `02ce48f`.
- Outcome: expose a deterministic, privacy-minimized reconciliation summary
  and compact exception brief from existing Company OS work-item facts so an
  operator can see what needs attention without reading raw logs or allowing
  the ledger to control email.
- Scope/authority: C2 local reversible implementation. The report may read the
  host-only PostgreSQL ledger and derive named exception classes, ages, and
  aggregate counts. It must not mutate the ledger, SQLite email authority,
  Sales/Mailman state, Slack, Gmail, or any external system. Production
  deployment and any workflow dependency require a later explicit gate.
- Overlap: `NC-20260811-002` owns Sales scheduled follow-up continuation and
  exact approval-card callbacks. This task will not change its source, prompt,
  workflow, task state, or completion contract. Existing email replay and
  approved-send boundaries remain authoritative and unchanged.
- Acceptance: exact stage/disposition/receipt facts classify waiting approval,
  blocked, failed, stale, source-gap, and outcome-missing work; completed and
  healthy open work remain distinguishable; output contains only opaque IDs,
  named codes, timestamps/ages, and counts; invalid or unavailable ledger data
  fails open and cannot affect email; focused exact-runtime and continuity
  gates pass.
- Implementation: `src/company-work-report.ts` performs one static bounded
  SELECT over the host-only items/events/receipts and reconciles event versions,
  current-versus-latest state, milestone and receipt presence, duplicate facts,
  deadlines, age, disposition, source gaps, and missing outcome closure. The
  separate compiled CLI emits compact text or JSON, accepts only read bounds,
  and returns a content-free unavailable result on database failure. It is not
  imported by `src/index.ts` or `src/company-work-shadow.ts`.
- Verification: exact Node 22.23.2 passes 28/28 focused ledger/shadow/report
  tests, typecheck, build, source formatting, 635/635 email-critical root tests,
  and the independent runner build plus 43/43 tests. The full root suite passes
  2,484/2,485 after its 48 permission-sensitive cases pass in an unrestricted
  rerun; the sole failure is the unchanged unrelated CNPC wrapper-string
  assertion. Schema sanitization, documentation continuity, and capability-
  matrix checks pass. Implementation commit: `7ee3f67`.
- Rollback: revert the local report/source/docs changes. No schema, production,
  message, email, or other external recovery applies at this milestone.

### NC-20260816-013

- Trigger/base: after the owner instructed Codex to continue the Company OS
  roadmap and explicitly authorized NC-012's one corrective canary entry, that
  prerequisite passed and was sealed at `f10c572`. NC-013 uses a fresh isolated
  worktree and branch from that exact checkpoint; production remains exact
  release `13ca192` at task start.
- Overlap: no active task owns Booking webhook completion, the Booking lifecycle
  adapter, Booking prompt/procedure/manifest, or Booking registration mounts.
  Active Stripe/Chaos, email, CNPC, Procurement, grader, and other agent work is
  excluded.
- Discovery: the current receiver and inbox reaper both mark an agent-dispatched
  webhook handled even when `runAgent` returns `status='error'`. A naive
  enqueue-after-return would therefore create a Plutio action without proof that
  Booking persisted its database row. The cutover must reject errored runs and
  require the archived appointment's matching Booking interaction before enqueue
  on both paths.
- Scope/authority: local implementation, negative/replay tests, Booking behavior
  documentation, capability/registration source, and continuity evidence only.
  No production deployment/config/data change, webhook delivery, external
  Plutio or Trafft request, Slack/customer message, credential rotation, push,
  or merge is authorized by this claim.
- Acceptance: only an archived `trafft` `canceled`/`rescheduled` event whose
  agent run succeeded and whose matching Booking interaction is persisted can
  enqueue one opaque `booking_activity:*` outbox row; receiver and reaper share
  the same rule; duplicate enqueue stays no-op; error/missing archive/missing
  interaction/booked events fail closed; and the Booking container receives no
  Plutio credentials, Plutio mount, toolbox-lib mount, or direct-Plutio
  procedure. Deployment and natural receipt/replay proof remain a separately
  recorded promotion boundary.
- Implementation checkpoint: receiver and reaper now reject returned container
  errors and gate enqueue on the exact persisted lifecycle interaction. Booking
  uses archive-derived canceled/rescheduled interaction keys and no longer
  declares or documents direct Plutio access. The pure registered-group
  transform removes only `plutio` and `toolbox-lib`, rejects partial legacy
  state, and is exposed by a dry-run-first exact-host/release helper included in
  the release inventory.
- Local verification: exact Node 22.23.2 passes typecheck, build, formatting,
  documentation continuity, 144/144 focused tests, the 635/635 email-critical
  root gate, and the independent runner build plus 40/40 tests. The full root
  suite passes 2,472/2,473; its sole failure is the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`. No production or
  external call occurred.
- Release checkpoint: immutable candidate
  `77064e99c4dc2e1342993ba8659a820fd2a1bf05` has source tree
  `f83601b26773952947ba54d7efc647e22f7c913c`, 664-file artifact hash
  `88b2de9c56af4326b6e88592e022cc17c8f4a3f6f7e9528e752b81eeb14b545f`,
  and archive SHA-256
  `2aebc8f4490a6d34affcd1eefcf5efa802fd2495fb257db8dda381212edffc24`.
  Fresh extraction independently verified. From a separate disposable
  operational root, the installed helper rejected wrong host/release confirms,
  removed exactly `plutio` and `toolbox-lib`, preserved other config, returned
  an idempotent no-change plan on replay, created a mode-0600 backup in the
  operational data root, and restored the original registration exactly.
- Deployment checkpoint: exact release
  `77064e99c4dc2e1342993ba8659a820fd2a1bf05` is live on
  `mini-claw.local` under Node 22.23.2. Booking drained with zero active or
  waiting containers. The exact-host/release transaction removed only
  `plutio` and `toolbox-lib` and created rollback snapshot
  `data/backups/booking-capability/booking-2026-08-16T22-05-35.942Z.json`.
  The prior prompt/procedure were preserved under
  `backups/NC-20260816-013-booking-prompt-20260816T220503Z`, and activation
  preserved the prior LaunchAgent as
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-13ca192e56f8-2026-08-16T22-05-57-058Z`.
- Live boundary proof: one healthy listener serves exact verified release
  `77064e9`; Gmail and Slack remain connected; active/waiting work and outgoing
  Slack are zero. Booking's registered mounts are exactly `knowledge` and
  `agent_docs`; helper replay is a no-change plan; and the installed
  no-network verifier proves only the `business_db` credential family is
  projected, with every configured Trafft and Plutio source name absent. No
  retryable Booking lifecycle row or `booking_activity:*` outbox row exists.
- Outcome boundary: the normal-ingress canary was blocked before execution by
  the external-action approval gate. No webhook was sent and no synthetic
  production party, Booking interaction, Slack notice, durable Plutio outbox
  work, or Plutio activity was created. State is therefore
  `deployed_unverified`, not outcome-validated. The remaining gate requires
  explicit authority naming those effects plus one immediate duplicate replay;
  it excludes email and Trafft mutation.
- Authorized canary incident: after the owner supplied the exact side-effect
  authority, one sanitized rescheduled event was accepted as inbox `4469`.
  The first agent turn created synthetic party `11333`, exact lifecycle
  interaction `3034`, automatic party-sync outbox `1311`, and a Booking notice.
  Claude returned success, but the scheduled-task wrapper remained warm; the
  liveness cleanup converted that completed turn into a host error. An
  overlapping inbox-reaper attempt produced the same successful result and
  additional Booking notice activity before its output was lost to the same
  task-lifecycle race. A targeted close stopped the container, and the exact
  deployed completion gate then verified the archived event plus interaction,
  enqueued Booking activity row `1312`, and marked inbox `4469` handled so no
  further agent retry can occur.
- Plutio incident: the scheduled reaper processed party-sync row `1311`. The
  exact one-row Booking reaper invocation reached the authorized remote
  activity boundary, then failed on the post-write interaction update with
  SQLSTATE `42P18` (`could not determine data type of parameter $1`). The
  remote marker makes retry no-write, but row `1312` remains failed until the
  query uses an explicit text cast. NC-013 is `validating`, not complete. The
  authorized duplicate replay is deferred until both blockers are repaired and
  deployed; no distinct webhook event, email, or Trafft mutation is authorized.
- Corrective release `67f16d5` is live with the scheduled-task exit and receipt
  cast fixes, rebuilt image `sha256:0618fbecf88cc0298fa9665db1c0c2c0ad368da37d471d148fb984e310ca835e`,
  and 18 runner snapshots at source hash `94cd1d978f34de9195c659e21d251b05`.
  Before the controlled replay, the existing 15-minute Plutio job proved it
  still invokes `npx tsx` from the operational checkout rather than the active
  immutable release. That local dispatch rejected row `1312` as unsupported,
  incrementing it to attempt 2 without reaching Plutio. NC-013 now also owns an
  immutable compiled CLI and a release-resolving launcher repair.
- Final corrective deployment: immutable release
  `02ce48f5564cb88e59c23fdb7178719772899645` is live with source tree
  `81ca79bb7b474eafdbc80bb5f2380aa502478d42`, 668-file artifact hash
  `186369904b851f05c1a87dcc36712631132cbeee407aef67bf25b658bf220858`,
  and archive SHA-256
  `c53b925a1301affdc6545971a82f33f7ce1272c0f610480f7bce56eb06a93009`.
  LaunchAgent rollback
  `com.nanoclaw.plist.rollback-67f16d5a412e-2026-08-16T22-52-25-594Z`
  is retained. The operational launcher hash is
  `eaf515bdca5ae3d94c2539278e9d9327333c052107532ec4b4d3ba6879acbec3`;
  its exact prior copy remains as
  `tools/plutio/run-reaper.sh.rollback-nc013-2026-08-16T22-52Z`.
- Recovery outcome: the real operational launcher resolved and verified
  release `02ce48f`, processed only row `1312`, and returned one success with
  no retry or dead letter. Row `1312` is terminal `processed`; its receipt is
  `already_recorded` with marker, person, and note IDs present; interaction
  `3034` now has its opaque Plutio person reference; and the active outbox is
  empty. The authorized duplicate webhook returned HTTP 200 for inbox `4469`
  with inbox/party/interaction/outbox counts unchanged. The production image's
  focused one-shot runner suite passes 5/5 without mounts or credentials, and
  final health reports exact release `02ce48f`, Node 22.23.2, connected
  Gmail/Slack, and empty container/work queues.
- Automatic scheduler proof: the first post-fix cron cycle started at
  `2026-08-16T23:00:29Z`, exited 0, and durably recorded `ok`. Its compiled
  reaper receipt reports processed/succeeded/retried/dead-lettered all zero,
  with the next run scheduled for `23:15Z`.
- Final local gates: exact Node 22.23.2 passes the 16/16 focused
  Booking/Plutio/compiled-CLI set, root typecheck/build, shell syntax,
  documentation continuity, the 635/635 email-critical release gate, and the
  independent runner's 43/43 suite. The unrestricted root suite passes
  2,474/2,475; the sole failure remains the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`.
- Outcome boundary: the cutover, capability removal, durable remote receipt,
  no-write Plutio replay, and ingress duplicate replay are live-verified. The
  original normal-ingress event required operator recovery and produced two
  Booking notices before the fixes, so NC-013 remains `deployed_unverified`
  rather than claiming a pristine outcome. The next fresh natural lifecycle
  event is the observation gate; no further synthetic distinct event is needed
  or authorized.

### NC-20260816-012

- Trigger: after `NC-20260816-011` deployed the unwired host adapter, the owner
  instructed Codex to continue with the named promotion prerequisites.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-012` branches from NC-011 evidence commit
  `d954639a90f845aa91924863fdbc951e51c9320f`; exact production release is
  `63ed4aacf41e3026037912ed3f5ffccfbdc95e59` at task start.
- Overlap decision: no active entry owns `src/webhook-extractors.ts`,
  `src/booking-plutio-host.ts`, or an installed Booking marker canary. Existing
  Sales, Procurement, CNPC, grader, Stripe/Chaos, Gmail, and proposal/invoice
  behavior remains excluded.
- Scope/authority: C5 release plus one explicitly bounded real integration
  canary. Authority covers local source/tests/docs, an immutable dark release,
  and one stable synthetic Plutio person/activity record whose sole purpose is
  to prove that the idempotency marker survives a real round trip. The canary
  must be dry-run by default, bind apply to the exact hostname and full release
  commit, contain no customer data, and immediately replay through the same
  adapter. Natural webhook/outbox wiring, Booking prompt/manifest/mount change,
  Plutio credential removal/rotation, Trafft calls, production business-row
  writes, customer/Slack messages, push, and merge are excluded.
- Acceptance: the shared Trafft extractor includes flattened
  `appointmentStartDateTime` for reschedules and the Booking adapter no longer
  carries a divergent local repair; existing event-key variants remain stable;
  local/release gates pass; the installed canary refuses mutation without exact
  host/release confirmation; the applied synthetic first pass records or finds
  exactly one marker and the immediate replay returns `already_recorded`
  without a second activity write; production health and database/email/task
  aggregates remain unchanged.
- Claim: commit `65c6d1b` registered this task and authority before the first
  source edit.
- Implementation: the shared extractor now accepts the flattened
  `appointmentStartDateTime` value as its final reschedule-start variant and
  the Booking adapter uses that extractor without a local repair. The bundled
  canary uses one stable `.invalid` synthetic identity, requires exact runtime
  release integrity plus full host/release confirmation for apply, reads back
  exactly one marker before replay, and injects a replay tripwire that refuses
  `log-activity.sh`. Booking's prompt, procedure, manifest, mounts, and current
  Plutio projection intentionally remain unchanged until the separate cutover.
- Local verification: exact Node 22.23.2 passes typecheck and source format;
  54/54 focused extractor/adapter/Plutio/reaper tests; 179/179 broader boundary
  tests; 635/635 email-critical tests; and the independent runner build plus
  40/40 tests. The unrestricted root suite passes 2,461/2,462; the sole failure
  is the unchanged unrelated CNPC prompt-wrapper assertion. No external or
  production-database call occurred.
- Release/deployment: implementation/release commit
  `ed957d35877a33b0258d4af00362e54d63705e08` has source tree `60f1fb0`, a
  660-file artifact hash `ff8bcf0`, and archive SHA-256 `9cbff2f`. Fresh local
  extraction and the installed Mini release independently verified under Node
  22.23.2. Activation from exact `63ed4aa` changed only the two release pointers
  and executable and retained rollback plist
  `com.nanoclaw.plist.rollback-63ed4aacf41e-2026-08-16T21-08-37-509Z`.
- Canary result/root cause: the installed wrong-host and wrong-release gates
  failed before Plutio and the dry run reported only the bounded synthetic
  plan. The applied first pass created the stable synthetic person and appended
  one Activity Log entry. Plutio persisted its visible activity text but
  removed the `<!-- nanoclaw-booking:... -->` HTML comment. The explicit
  readback therefore found zero marker occurrences and refused replay; the
  duplicate-write tripwire was never reached and no second activity was added.
- Production non-interference: the exact release remains healthy at one
  launchd-owned listener with Gmail/Slack connected, 17/17 manifests, selected
  groups `booking,campanero`, and no active/waiting/outgoing work. Email actions
  remain 61 confirmed/6 blocked, send events 334, Campanero one completed task,
  Booking zero tasks, Plutio outbox 1,259 processed/15 dead, and
  `booking_activity:%` zero. The transferred temporary archive was removed;
  the installed release, rollback, and synthetic Plutio evidence remain.
- Blocker/next sequence: replace the HTML comment with a visible text-safe
  digest marker and repeat local/release gates. The task's single external
  activity-write authority is consumed, so a second corrective synthetic
  Activity Log entry requires explicit owner authorization. Do not wire ingress
  or remove Booking's Plutio capability before a corrected readback and
  no-write replay pass.
- Authority extension (2026-08-16T21:17Z): the owner explicitly approved one
  additional synthetic Activity Log mutation on the same retained canary
  contact. This does not authorize a third entry, customer data, deletion or
  in-place rewriting of the first negative result, natural ingress, production
  database mutation, or Booking capability removal. Rebuild and redeploy the
  visible-marker correction before consuming this final canary write.
- Corrective implementation: `bookingPlutioMarker()` now emits a visible,
  text-only `[nanoclaw-booking:<sha256>]` receipt bound to the same canonical
  event ID. It contains no HTML control characters and remains inside the
  host-derived activity entry. The same exact-one readback and replay
  write-tripwire are unchanged.
- Corrective local verification: exact Node 22.23.2 passes typecheck and source
  formatting; 55/55 focused tests, 635/635 email-critical tests, and the
  independent runner build plus 40/40 tests pass. The unrestricted root suite
  passes 2,462/2,463 with only the unchanged unrelated CNPC wrapper-string
  assertion failing. No external call occurred during correction validation.
- Corrective release/deployment: exact release
  `13ca192e56f8860cc961e5178a73fd4e809aa6c9` has source tree `0c9e4d6`, a
  660-file artifact hash `fcfb7b6`, and archive SHA-256 `c9dcc39`. Fresh local
  extraction and the installed Mini release independently verified. Activation
  from `ed957d3` changed only the two release pointers and executable and
  retained rollback plist
  `com.nanoclaw.plist.rollback-ed957d35877a-2026-08-16T21-22-00-130Z`.
- Corrective live proof: immediately before apply, the one synthetic Activity
  Log note had one entry and zero visible markers. The authorized apply found
  the existing person, appended the visible marker once, read it back exactly
  once, then replayed through only `upsert-person.sh` and `list-notes.sh` and
  returned `already_recorded`; `log-activity.sh` was absent from replay. An
  independent read found one note, two retained entries, and exactly one
  visible marker.
- Final non-interference: refreshed heartbeat PID `84353` owns the sole listener
  and reports exact release/code-root integrity, Gmail/Slack connected, 17/17
  manifests, selected groups `booking,campanero`, and no active/waiting/outgoing
  work. Email actions remain 61 confirmed/6 blocked, send events 334, Campanero
  one completed task, Booking zero tasks, Plutio outbox 1,259 processed/15 dead,
  and `booking_activity:%` zero. The transferred archive was removed; installed
  releases, rollbacks, and the synthetic evidence remain.
- Milestone boundary: shared identity and remote marker persistence are now
  proven. NC-013 remains a separate task for natural ingress/outbox wiring,
  Booking prompt/procedure/manifest/mount changes, Plutio capability removal,
  immutable deployment, and a sanitized natural archived-event receipt/replay
  canary. Nothing in NC-012 performs or authorizes that cutover by itself.

### NC-20260816-011

- Trigger: after `NC-20260816-010` removed Trafft from Booking's enforced
  credential projection, the owner instructed Codex to proceed with the next
  Company OS milestone.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-011` branches from clean NC-010 evidence
  commit `61d440e5f70522fd981f104e0836214ef6d03f04`; exact production release is
  `ba5fe74e93e7d58582079a153d85aaf30a651c86` at task start.
- Overlap decision: no active entry owns `src/plutio-cli.ts`,
  `src/plutio-outbox-reaper.ts`, or a Booking lifecycle adapter. Existing
  proposal, CNPC, Sales, Inbox, Stripe/Chaos, Gmail, Procurement, and grader
  behavior stays excluded.
- Scope/authority: C5 dark external-write boundary. Authority covers local
  source/tests/docs, the existing Plutio outbox dispatch vocabulary, immutable
  release/deployment, and an installed injected canary that makes no database
  or child-process call. It excludes natural-path wiring, Booking prompt or
  manifest changes, Plutio credential removal, any Trafft/Plutio request,
  production business-row write, customer/Slack message, credential rotation,
  push, and merge.
- Acceptance: only an archived Trafft `canceled` or `rescheduled` event can
  form a Booking lifecycle action; the host derives every customer/action
  value from the archived body; enqueue is durable and replay-safe; dispatch
  is covered by the common Plutio safety brake; a stable marker prevents a
  crash-after-write replay from duplicating the activity; the installed
  release proves allowed, denied, and replay behavior with injected fakes; and
  production remains behaviorally unchanged until a separate promotion gate.
- Discovery correction: the shared Trafft extractor currently omits the
  flattened `appointmentStartDateTime` field from rescheduled event identity,
  although the archived fixture and host parser contain it. This dark adapter
  derives and validates the canonical reschedule identity locally. Changing
  the shared extractor would alter live webhook deduplication, so that change
  and its production canary are explicit prerequisites of the later promotion
  gate rather than being smuggled into this dark release.
- Implementation: `src/booking-plutio-host.ts` validates archived Trafft
  lifecycle rows, persists only opaque inbox/event identifiers in the existing
  Plutio outbox, re-loads the archive at dispatch, derives all external values
  host-side, routes Plutio writes through the common safety controller, records
  a stable remote marker, and returns an opaque receipt. The existing reaper
  reclaims only stale Booking-specific in-flight rows; legacy proposal/invoice
  behavior is unchanged. `list-notes.sh` is classified as read-only while
  upsert/activity mutation remains safety-gated.
- Local evidence: exact Node 22.23.2 passes typecheck; 58/58 focused tests;
  182/182 broader action-safety, Booking, Plutio, webhook, manifest, and runner
  tests; 635/635 email-critical tests; and the independent runner build plus
  40/40 tests. The unrestricted root suite passes 2,456/2,457; the sole failure
  is the unchanged unrelated CNPC source-wrapper assertion. No real external
  or database call occurred. Formatting, continuity, capability, release, and
  installed-canary gates remain before deployment.
- Next sequence: commit the candidate and docs, build and independently verify
  one immutable artifact, deploy it without natural-path activation, execute
  only the injected canary, and record exact health, non-interference, and
  rollback evidence.
- Release/deployment evidence: claim `3bdb6e4`, implementation and exact
  release `63ed4aacf41e3026037912ed3f5ffccfbdc95e59`, source tree
  `0c5545b392456d8fbb6e9d805a967012569bb446`, 656-file artifact hash
  `8f82da2c9b9439ff9486249a2259807c2ca51da3530d9ae485f61444b2f01917`,
  and archive SHA-256
  `247c62f7c7a64c394165924f7ddea04c59fcbf4ef532967157d92e7f1dd9399a`
  independently verified locally and on `mini-claw.local` under Node 22.23.2.
  Dry-run and activation changed only the two release environment pointers and
  executable path; rollback plist
  `com.nanoclaw.plist.rollback-ba5fe74e93e7-2026-08-16T20-48-32-586Z`
  is retained.
- Installed/live evidence: the bundled injected verifier returned `recorded`
  for first pass, `already_recorded` for replay, denied `booked`, called only
  the named fake scripts, and reported zero database, child-process, and
  network calls. `/health` proves the exact release/code root, one listener,
  connected Gmail/Slack, 17/17 valid manifests, global enforcement false,
  selected groups `booking,campanero`, zero active/waiting/outgoing work, and
  unchanged action-safety configuration. Email actions remain 61 confirmed/6
  blocked, send events 334, Campanero one completed task, legacy Plutio outbox
  1,259 processed/15 dead, and Booking-specific outbox rows zero. No Trafft or
  Plutio request, production business-row write, customer/Slack message,
  credential/configuration change, push, or merge occurred.
- Final state: complete as a deployed dark foundation, not promoted or
  outcome-validated. The next task must separately repair/canary shared
  rescheduled-event identity and empirically prove remote marker persistence
  before connecting ingress or removing Booking's Plutio capability.

### NC-20260816-010

- Trigger: after `NC-20260816-009` live-verified the Things boundary, the owner
  instructed Codex to continue the Company OS roadmap.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-010` branches from clean NC-009 evidence
  commit `2f6473a03125bc79116552824ecebd07bd9b2ecd`; exact production release
  remains `47019c937d38e9346813f6058484e12e3d577ef5` at task start.
- Overlap decision: no active task owns `src/container-runner.ts`,
  `src/capability-manifest.ts`, `capabilities/booking.json`, or
  `groups/booking/CLAUDE.md`. The active Stripe/Chaos lineage and all Chaos,
  Stripe, Gmail, Sales, Mailman, CNPC, Procurement, and grader behavior remain
  excluded.
- Discovery correction: the tracked Booking prompt references an ignored
  `groups/booking/EXECUTION-STEPS.md`. That live procedure still uses Plutio
  directly for non-booked events. This task will make that authority
  Git-trackable and leave Plutio declared; retiring it without a host-owned
  replacement would silently remove existing behavior.
- Scope/authority: C5 credential-boundary change. Authority covers local
  source/tests/docs, immutable release/deployment, selective Booking manifest
  activation, idle-container recycling if required, and aggregate-only or
  injected side-effect-free evidence. It excludes Trafft or Plutio mutation,
  any synthetic or live booking/customer creation, customer or Slack messages,
  production business-row writes, global manifest activation, credential
  rotation, push, and merge.
- Acceptance: manifests declare credential families; selective enforcement
  projects only declared families while compatibility mode stays byte-for-byte
  behavior-compatible; Booking receives its Claude runtime, least-privilege
  business DB connection, and the explicitly retained Plutio family but no
  Trafft credentials; the host Trafft sweeper and webhook ingestion remain
  unchanged; production selects only Campanero and Booking; the installed
  release proves all three Trafft secret names absent without invoking Trafft
  or Plutio and without changing booking data.
- Planned sequence: commit the claim; implement projection and negative tests;
  update Booking and capability authorities; run exact Node 22 focused, broad,
  release, runner, and continuity gates; build and independently verify one
  immutable artifact; preflight, deploy, recycle only idle Booking state if
  necessary, run the no-side-effect canary, and record exact evidence.
- Local implementation evidence: all 17 strict manifests now declare credential
  families and the final runner projection fails closed for unknown secret
  names. Booking declares `business_db` and the retained `plutio`, not
  `trafft`; its prompt and newly tracked procedure state the same boundary.
  The release bundles a verifier that reads the real host configuration but
  emits only names/counts and performs no network/database call. Exact Node
  22.23.2 passes typecheck, source formatting, 73/73 focused tests, 635/635
  email-critical tests, independent runner build plus 40/40 tests, capability
  generation/check, schema sanitizer, and continuity. The unrestricted suite
  passes 2,446/2,447; the sole failure is the unchanged unrelated CNPC
  source-wrapper assertion.
- Release/live proof: claim `b4c3afc`, implementation `a36fce7`, and immutable
  release `ba5fe74e93e7d58582079a153d85aaf30a651c86` are committed on the
  isolated branch. The 652-file artifact has source tree `a17f27e7`, artifact
  hash `96c23295`, and archive SHA-256 `d6b8bd54`; it independently verified
  locally and on `mini-claw.local` under Node 22.23.2. Activation from exact
  `47019c9` changed only the permitted plist paths and retained rollback
  `com.nanoclaw.plist.rollback-47019c937d38-2026-08-16T20-03-24-541Z`.
- Selective activation/live proof: the bundled helper changed only
  `CAPABILITY_MANIFEST_ENFORCED_GROUPS` from `campanero` to
  `booking,campanero`, retained environment backup
  `.env.rollback-capabilities-2026-08-16T20-03-55-585Z`, and left global
  enforcement false. Final health reports exact release `ba5fe74`, one matching
  Node 22 listener, 17/17 valid manifests, connected Gmail/Slack, and zero
  active/waiting/outgoing work. The installed verifier found three configured
  Trafft source names, projected zero of them, and found all five required
  DB/Plutio names in the eight-name Booking payload. It performed no network or
  database call and printed no values.
- Non-interference: email evidence remained 61 confirmed/6 blocked actions and
  334 send events; Campanero remained one completed scheduled task; Booking had
  no scheduled-task rows. No Trafft/Plutio request, booking/customer creation,
  customer or Slack message, production business-row write, credential
  rotation, push, or merge occurred.

### NC-20260816-009

- Trigger: after `NC-20260816-008` live-verified the Hive boundary, the owner
  instructed Codex to continue the Company OS roadmap.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-009` branches from clean evidence commit
  `8e2844eace147123fad148184a369d2eb2a02348`; exact production release remains
  `d32fda08e818bb803463f7006484abd19291b9e6` at task start.
- Overlap decision: no active task owns `src/brief-promote.ts`. The existing
  Slack reaction caller is verified but deliberately left untouched, and the
  active Stripe/Chaos lineage remains excluded.
- Scope/authority: C5 safety-boundary change. Authority covers local
  source/tests/docs, immutable release/deployment, one bounded auto-restored
  global-safe-mode window, a synthetic injected-fetch Things denial canary,
  and aggregate-only health evidence. It excludes a real Things task, Slack
  message or reaction, bridge configuration/credential changes, other
  integrations, action-envelope enforcement, push, and merge.
- Acceptance: the direct Things POST rejects with a typed denial before fetch
  under global or Things-only safe mode; default-off behavior and the existing
  missing-key/non-OK handling remain compatible; the Slack-facing promotion
  wrapper returns false on denial so no success reaction follows; the installed
  release drill reports an eighth denial with the Things fetch tripwire false;
  production configuration restores byte-for-byte and observed work/outbound
  aggregates remain unchanged.
- Executed sequence: registered and committed the claim; implemented the
  boundary plus focused injection/denial tests; passed the Node 22 focused,
  broad, release, and continuity gates; built and independently verified one
  immutable artifact; preflighted, deployed, live-drilled, restored, and
  recorded exact evidence.
- Validation so far: exact Node 22.23.2 typecheck and source formatting pass.
  The direct parser/boundary/controller/config/drill set passes 31/31, and the
  expanded action-safety plus Slack regression set passes 152/152. The
  installed drill returns eight denials across seven systems with every
  client/child/outbox/Firestore/Things-fetch tripwire false. Email-critical
  tests pass 635/635, the independent runner passes build plus 40/40 tests, and
  continuity/capability checks pass. The unrestricted root suite passes
  2,441/2,442; its sole failure is the unchanged, unrelated
  `src/cnpc-prompt-contract.test.ts` source-wrapper assertion.
- Release/live proof: immutable release
  `47019c937d38e9346813f6058484e12e3d577ef5` (source tree `fa2e10c9`,
  652-file artifact hash `f4dec12c`, archive SHA-256 `c4fd47a6`) was
  independently verified locally and on `mini-claw.local`, then activated from
  `d32fda08` with rollback plist
  `com.nanoclaw.plist.rollback-d32fda08e818-2026-08-16T19-39-11-903Z`.
  The apply drill retained backup
  `.env.rollback-action-safety-2026-08-16T19-40-01-708Z`, returned eight
  `global_safe_mode` denials, crossed no tripwire, and restored the environment
  to exact matching hash `0c95d71d`. Final health has one matching Node 22
  listener, connected Gmail/Slack, zero active/waiting/outgoing work, controls
  default-off, and only Campanero selected. Pre/post evidence remained 61
  confirmed/6 blocked email actions, 334 events, one completed Campanero task,
  jobs hash `b3fc5040565d`; Hive 110/0/0/0; Plutio 1,259 processed/15
  dead; and Chaos 5 sent. No Things fetch, real task, Slack reaction, outbound
  action, or production business-row mutation occurred.

### NC-20260816-008

- Trigger: after `NC-20260816-007` live-verified the first five-system brake,
  the owner instructed Codex to proceed with the next Company OS milestone.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-008` branches from clean evidence commit
  `919fa5900f426dc60e4e5e9fb50e02b142f5e842`; exact production release is now
  `d32fda08e818bb803463f7006484abd19291b9e6`. Production action controls are
  valid and restored default-off; Campanero is the only selectively enforced
  capability group.
- Overlap decision: the active Stripe/Chaos lineage owns
  `src/chaos-lifecycle-outbox.ts`, so this task will not modify or deploy Chaos
  delivery code. Hive/Firestore has no active source owner in the work register
  and exposes one host-owned merge boundary plus a durable retry path.
- Scope/authority: C5 safety-boundary change. Authority covers local
  source/tests/docs, immutable release/deployment, one bounded auto-restored
  global-safe-mode window, synthetic Hive denial canaries, and aggregate-only
  health/classification evidence. It excludes a real Firestore mutation,
  Gmail/Slack communication, schema or taxonomy changes, consuming a Hive
  retry/dead-letter attempt during safe mode, other integration changes,
  envelope enforcement, push, and merge.
- Acceptance: every Hive conversation mutation denies before Firebase SDK or
  credential initialization under global or Hive-only safe mode; normal
  default-off behavior remains compatible; the inline classifier leaves the
  row retryable; the reaper records a held result without updating attempts or
  sending dead-letter alerts; the installed drill adds a seventh no-network
  denial; exact environment restoration and unchanged aggregate evidence are
  live-verified before completion.
- Implementation/verification progress: the common system registry and sample
  config include `hive_firestore`; composite/direct writes fail at entry;
  inline denial leaves `hive_synced` false; reaper denial reports `held`
  without another database query or chief alert; and the installed release
  drill uses an injected Firestore tripwire. Focused Hive/classifier/drill tests
  pass 51/51; the broader controller/webhook/job set passes 102/102 when the
  webhook tests are allowed to bind a loopback port. Exact Node 22.23.2
  typecheck, source formatting, schema sanitization, capability matrix, docs
  continuity, 635/635 email-critical tests, and the independent runner build
  plus 40/40 tests pass. The full root suite is 2,435/2,436 with only the
  unchanged CNPC source-wrapper assertion failing. Immutable release
  `d32fda08e818bb803463f7006484abd19291b9e6` was independently verified locally
  and on `mini-claw.local`, activated with rollback, and live-drilled. Seven
  guarded calls denied, every tripwire stayed false, `.env` restored exactly,
  and email/job/Hive/Plutio/Chaos aggregates remained unchanged. No external or
  production business-row write occurred.

### NC-20260816-007

- Trigger: after the Campanero-only capability checkpoint completed, the owner
  instructed Codex to move on to the next Company OS milestone.
- Base/live lineage: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-007` branches from evidence commit
  `4abe369`, whose deployed source ancestor is combined release `2987070`.
  That release already contains the dark `NC-20260816-002` controller and
  reports valid action-safety configuration with enforcement false, global safe
  mode false, and no disabled systems. Campanero remains the only selectively
  enforced capability group.
- Scope/authority: C5 production security-control drill. Authority covers local
  source/tests/docs, immutable release/deployment, a same-mode environment
  backup, one bounded global safe-mode window, synthetic denial canaries at the
  five already-guarded boundaries, exact config restoration, and read-only
  health/action/job checks. It excludes enabling envelope enforcement, any real
  email/Slack/Courses/Plutio/Stripe action, production data mutation, expansion
  to unguarded systems, prompt/group changes, push, and merge.
- Safety design: the production drill must be dry-run by default, require exact
  hostname confirmation, verify a drained service and default-off starting
  state, atomically back up and enable the brake, observe live health, call the
  installed boundary functions only with synthetic inputs, assert every call
  is refused before its external client/child process, and restore the exact
  prior environment in `finally`. A failed drill is not retried while any
  external action is ambiguous.
- Acceptance: all five actual runtime boundaries return the expected safe-mode
  denial; Slack queues nothing; Courses exposes neither SMTP secret/tool nor
  raw email mount; Gmail never constructs/sends a message; Plutio and Stripe
  never invoke a child; health/evidence reads remain available; the live config
  returns to its exact pre-drill state; queues, email actions, jobs/tasks, and
  release identity remain unchanged; rollback evidence is recorded.
- Completion: first release `c2c2158` proved the brake and exact restoration,
  but its synthetic Slack object constructed the SDK and asynchronously made a
  fake-token `auth.test`; it made no authenticated account action or write, but
  the attempt was rejected as milestone proof. Superseding commit/release
  `ab2ace1a658111131a2519e1cd7257fe8a207ffb` instantiates only the installed
  `sendMessage` prototype and local queue state, so the canary has no SDK or
  network owner.
- Deployment/evidence: source tree
  `72dd932b92e79497e89d8170a547e027d64e42e4`, 652-file artifact
  `cfbf6d3846a9a7c7748011ecd5d3fac109fee842b5e101e7b1056307d1e343b8`,
  and archive SHA-256
  `a7b8ab3aaa4d82bcc4b0bcc745af3c495473ee33a47e260d586708fb975f3f31`
  independently verified locally and on the host. Activation changed only the
  three permitted plist paths and retained rollback
  `com.nanoclaw.plist.rollback-c2c21585e086-2026-08-16T18-15-27-825Z`.
  Dry-run passed; apply backup
  `.env.rollback-action-safety-2026-08-16T18-18-24-265Z` matched the restored
  `.env` byte-for-byte. The running daemon observed the brake, all six calls
  returned `global_safe_mode`, tripwires stayed false, Slack queued zero, and
  Courses projected no SMTP secret/mount.
- Final state: exact `ab2ace1` health under Node 22.23.2, one listener,
  connected Gmail/Slack, zero active/waiting/outgoing work, default-off valid
  action safety, and Campanero-only capability selection. Pre/post aggregates
  matched: 61 confirmed/6 blocked email actions, 334 send events, one completed
  Campanero task, unchanged jobs hash `b3fc5040565d`, Plutio 1,257
  processed/15 dead, and Chaos 5 sent. The clean run emitted no Slack auth
  error and performed no real external write.

### NC-20260816-006

- Trigger: the owner explicitly authorized deployment and instructed Codex to
  proceed with one low-risk agent after `NC-20260816-004` completed locally.
- Preflight: production release `55c97d5` is verified under Node 22.23.2 with
  one listener, connected Slack/Gmail, zero active/waiting containers, zero
  actionable email sends, and a healthy non-authoritative Company OS shadow.
  Manifest enforcement is absent/default-off. The live registry also contains
  legacy dynamic group folders without tracked manifests, so enabling the
  existing global-only switch would fail startup and violate the one-agent
  rollout boundary.
- Canary choice: Campanero has no active scheduled agent tasks, its last channel
  activity predates the activation window, and its live additional mount targets
  (`knowledge`, `agent_docs`) already match the tracked declaration. Its
  authoritative prompt says to use only the host `jobs` MCP tool; the broad
  initial inventory manifest must therefore be narrowed before activation.
- Scope/authority: C5 production release and capability-boundary activation.
  Authority covers a strict group allowlist, Campanero manifest/tests, release
  build/transfer/activation, runner image and recoverably backed-up runner
  snapshots, one operational environment-key change, a Campanero-only recycle,
  read-only/denied internal canaries, rollback, health verification, and the
  relevant security/project/roadmap/continuity documents. It excludes global
  activation, customer communication, job run/pause/resume, database mutation,
  other group prompts/configuration, credentials, push, and merge.
- Acceptance: an absent allowlist preserves compatibility; a malformed or
  unknown allowlist fails startup; only listed tracked groups receive manifest
  projection; Campanero receives only the `jobs` MCP tool and no Bash or shared
  MCP wildcard; other groups preserve compatibility; the exact release is live
  and healthy; allowed jobs inventory succeeds without mutation; Bash and an
  undeclared MCP tool are unavailable; no queued work, email action, or job
  state changes appear; rollback artifacts and exact evidence are recorded.
- Rollback: remove the Campanero allowlist key, verify health returns to
  compatibility mode, and recycle any affected container. If release health
  itself fails, use the
  activator's rollback plist to restore verified release `a67e081`. Never retry
  an ambiguous external action; the canary intentionally performs none.
- Local verification: exact Node 22.23.2 passes 15/15 focused staged-config
  tests, the broader 172/172 capability/container/IPC/scheduler/reaper set,
  634/634 email-critical tests, root and independent-runner builds, and all
  40/40 runner tests. After the Stripe-lineage integration, the combined 74/74
  capability/action/Stripe tests and 2,418/2,419 unrestricted root suite pass;
  the sole failure is the unchanged CNPC source-wrapper assertion already
  present in the deployed lineage.
- Concurrent-release reconciliation: production advanced from `55c97d5` to
  separately verified Stripe release `a67e081` while the first Campanero image
  build was running. No container launched in the interval. The image was
  immediately rebuilt from `a67e081`; health then showed that exact release,
  zero active/waiting containers, and all 18 runner snapshots at its exact
  `42f3674fef40cc63312d5e8c45c76de6` source hash. The Campanero branch now
  integrates `a67e081` in merge commit `2987070`, preserving both lineages.
- Deployment: immutable release
  `29870706dc495cab59d42e7568b842f8c2994182` is live and health-verified with
  source tree `9849885305366c62e5a2b9f8cc2226a2093c84ce`, artifact
  `8a82dd1a718762bef0cfa16ed20750ea242dd526c2264fef12d6f8a2f9930802`,
  Node 22.23.2, and one listener. The combined image digest is
  `sha256:06d1c7db5476596103c97a803b1ff3035318bcceeb2c190eb1d8fe0f1f5e0982`.
  All 18 runner snapshots now carry source hash
  `6bb4d7bbaaf0bda23118b79e639502ac`; 18 recoverable pre-change directories
  remain alongside them. The activator rollback plist is
  `com.nanoclaw.plist.rollback-a67e08106c87-2026-08-16T17-23-00-067Z`.
- Selective activation: the release-bundled helper changed only
  `CAPABILITY_MANIFEST_ENFORCED_GROUPS=campanero`, retained same-mode backup
  `.env.rollback-capabilities-2026-08-16T17-24-03-525Z`, and left the global
  switch false. Config is loaded at each projection/health read; an unsupported
  `launchctl kickstart` attempt returned 125 without changing the healthy
  listener, and no restart was needed. No Campanero container was live or warm,
  so the next launch cannot reuse a pre-manifest projection.
- Live canary: the exact production registration resolved to an enforced
  projection with no Claude tools, MCP `jobs` only, host operation
  `jobs_mutate` only, and read-only `knowledge`/`agent_docs` mounts. A disposable
  production-image canary mounted Campanero IPC read-only, exposed only
  `mcp__nanoclaw__jobs`, confirmed Bash absent, and returned the exact live
  22-job inventory without requesting a mutation. Afterward health remained on
  `2987070` with zero active/waiting containers and outgoing queue depth zero;
  jobs remained 22 total/17 enabled, Campanero remained one inactive scheduled
  task with its unchanged 2026-03-29 last run, and email actions remained 61
  confirmed/6 blocked/zero actionable.

### NC-20260816-004

- Trigger: after `NC-20260816-002` completed the dark common action-safety
  contract, the owner instructed Codex to continue to the next Company OS
  milestone.
- Outcome: create a tracked versioned manifest for every operative group in the
  current source tree, a host compiler/validator and reviewable permissions
  matrix, and a launch/reuse contract that can mechanically project the
  declared Claude/MCP tool surface and refuse stale warm/adopted containers.
- Branch/base: isolated worktree `/private/tmp/nanoclaw-nc-20260816-004` on
  `codex/nc-20260816-004-capability-manifests`, based on descendant commit
  `ac21fde213000f29a9cc79140153cb49281289cd`. That base includes the completed
  `NC-20260816-002` control plus a later isolated grader prompt refinement. The
  dirty operational checkout and the other session's worktree remain untouched.
- Scope/authority: C5 because manifest projection and warm-container revocation
  change the agent capability boundary. Authority covers local source,
  container-runner source/protocol, tests, tracked manifest and matrix files,
  `.env.example`, release packaging inputs, and relevant
  security/project/roadmap/continuity documents. It excludes production
  configuration, deployment, restart, live container termination, database or
  external-system writes, credential rotation, action-envelope activation,
  push, and merge.
- Compatibility boundary: enforcement remains explicitly default-off. Existing
  Gmail/resource checks, Procurement/grader host authorization, mount allowlist,
  action-safety controller, prompts, and registered-group configuration remain
  independently authoritative. Manifest projection may narrow but never widen
  those controls.
- Acceptance: every tracked operative group has one schema-valid manifest; the
  generated matrix is deterministic and contains no secret values or host
  paths; unknown/malformed manifests and undeclared tools/mounts fail closed in
  enforcement mode; selected MCP registration and Claude allowed-tools come
  from the manifest; fingerprints bind the launch and sidecar; stale or
  pre-manifest warm/adopted containers cannot receive another turn when
  enforcement is enabled; compatibility mode preserves the current surface;
  focused negative tests, exact Node typecheck, root and independent-runner
  gates, continuity, formatting, and diff checks pass.
- Residual scope: least-privilege reduction is constrained to declared tool and
  mount surfaces in this milestone. Raw business credentials, default-deny
  network egress, per-action volume/money ceilings, immediate termination of an
  in-flight container, production activation/drill, and dynamic untracked group
  onboarding remain separate gates.
- Implementation: strict manifests now cover all 17 tracked operative folders;
  a deterministic compiler/matrix projects exact Claude and MCP tools,
  recognized host operations, configured mount targets/access, and runtime
  ceilings when enforcement is enabled. Launch input and adoption sidecars carry
  the projection fingerprint. Message, task, and job IPC fail closed outside the
  declared host-operation set, while warm/adopted containers with missing or
  stale fingerprints are closed before another turn.
- Verification to review boundary: exact Node 22.23.2 passes 113/113 focused
  host tests, root typecheck, 634/634 email-critical tests, source formatting,
  build typecheck, schema sanitizer, deterministic capability-matrix check,
  documentation continuity, and the independent runner build plus 40/40 tests.
  The complete root suite passes 2,388/2,389; the sole failure is the unchanged
  baseline `src/cnpc-prompt-contract.test.ts` assertion against its older
  inline-registration source shape. `git diff --check` passes. No production
  configuration, container, message, data, deployment, push, or merge changed.
- Commit/release-package boundary: implementation commit
  `72b21db43d1270a3d0994ca525f0137262f54409` has source tree
  `4717c4f3d5a66bf22c93dc373e3f2dbc08a2fda2`. The clean pinned-Node release
  gate reran 634/634 email-critical tests and the runner build plus 40/40 tests,
  verified a 636-file artifact with SHA-256
  `3e5dfec313bec49092f56f89f6c506587970ac40dac1d9d43ffcf032cde2f64b`,
  and produced a local archive with SHA-256
  `8ea90b587e0ba157212042d580c729de473f098259a96d2ff4094f07a5162564`.
  Archive inspection confirms all 17 tracked manifest files are packaged.
  Release packaging is local build evidence only; nothing was deployed.

### NC-20260816-002

- Trigger: after the bounded Company OS ledger shadow reached its verified
  milestone, the owner instructed Codex to proceed to the next roadmap gate.
- Outcome: create one versioned host-owned action-envelope contract and one
  deterministic global/per-system external-write safety controller. The
  control must deny before a side effect when explicitly engaged, preserve
  evidence collection, expose aggregate health, and bind decisions to exact
  action/policy identities without granting any new action authority.
- Branch/base: isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-002` on
  `codex/nc-20260816-002-action-safety-control`, based on completed Company OS
  evidence commit `f1ffd5c7ef10334cdb64919282dcd231d80b57ea`. The dirty
  operational checkout and all other worktrees remain untouched. Claim commit
  `37c6353` and implementation commit `092b5b9b8d96d4ac474dce33ae173ecc44799b62`
  are local and have not been pushed.
- Scope/authority: C5 because this changes a security boundary for external
  writes. Authority covers local source, tests, `.env.example`, and the
  security/project/roadmap/continuity authorities. It excludes production
  configuration, deployment, restart, database migration/write, Slack/Gmail or
  other external actions, action approval, ledger promotion, push, and merge.
- Overlap: existing Gmail final-boundary checks, Procurement action cards,
  CNPC holds, grader delivery, autonomy policy/holds, and healer typed-action
  plans remain authoritative for their domains. This task must compose with
  them and must not replace, weaken, or activate unfinished overlapping work.
- Acceptance: exact envelope mutation/replay is rejected; global and
  per-system brakes use documented precedence and deny before invocation at
  the five named first-drill runtime boundaries;
  evidence/health reads continue; disabled/default configuration preserves
  current behavior; unknown action classes/systems fail closed when enforcement
  is enabled; focused negative and safe-mode drill tests, exact Node typecheck,
  relevant broad gates, continuity, formatting, and diff checks pass.
- Deployment boundary: implementation is dark and local only. Any production
  configuration or activation requires a separate C5 task with immutable
  release, live safe-mode drill, rollback, and non-interference evidence.
- Residual scope: this is the P0.4/P0.5 control-layer foundation, not a claim of
  universal repository coverage. Warm Courses containers, Trafft,
  Hive/Firebase, Chaos lifecycle delivery, Things, Sertifier, other
  container-held capabilities, standalone scripts, ceilings/demotion, and
  per-agent manifest generation remain later gates.

### NC-20260816-005

- Trigger: live Chaos reconciliation shows both account-bound producers are
  delivering, but four `stripe-tandem` purchases arrived as
  `unmapped-stripe-product`: three $299 Mentor Coaching Foundations purchases
  and one $999 Coaching Supervision Mastery inaugural purchase. The same people
  and timestamps have nearby browser-side product slugs, so receipt delivery is
  intact and canonical product attribution is the failed boundary.
- Exact live base: immutable release `55c97d5`; health reports verified release
  identity, Node 22.23.2, connected Slack/Gmail, and no active containers.
- Related defect boundary: NC-20260815-004's one-row Checkout/PaymentIntent and
  literal product-name fixes exist only in the dirty operational checkout and
  are not ancestors of the live release. This task must port only the reviewed
  payment-identity/product-preservation mechanics needed by lifecycle accuracy,
  not the unrelated roster cleanup or operational checkout state.
- Safety contract: Stripe remains authoritative for money; this change cannot
  create charges, refunds, fulfillment, Encharge traffic, or customer messages.
  Chaos remains downstream and retryable. Historical repair is restricted to
  the four already-proven source events and requires pre/post aggregate reads.
- Claude Code implementation round (2026-08-16T16:45Z): `tools/contador/process-payment.cjs`
  now extracts and validates `metadata.product` from the PaymentIntent for
  both Checkout and PaymentIntent event shapes, carries it as
  `canonical_product_slug` in the `__CHAOS_LIFECYCLE__` sentinel, ports only
  the reviewed product-name-preservation guard (Payment Log column read-back +
  Postgres `CASE` guard) and removes the shell from the Postgres write
  (`execFileSync` + `psql -v NAME=value` + `:'var'` + `-f -`, no
  string-concatenated SQL). `src/chaos-lifecycle-outbox.ts` persists the
  slug (re-validated, fail-closed) into the outbox's `properties` jsonb and
  prefers it at Chaos send time, falling back to the existing name-derived
  slug for Heartbeat/off-site rows. Did not port `NOT_A_STUDENT` /
  `resolveRosterTargets` from the dirty-checkout evidence file — out of this
  task's scope (roster-policy expansion). `src/stripe-payment-host.ts` and its
  test were left unchanged: the new field is optional and flows through the
  existing generic JSON parse with no contract change.
- Claude Code R2 review-response round (2026-08-16T17:05Z): Codex R2 review
  (`docs/reports/NC-20260816-005-CODEX-REQUEST-R2.md`) required two fixes
  before commit/deploy, both closed in this round:
  1. `enqueueStripeLifecycleFact`'s `ON CONFLICT` update previously never
     touched `properties`, so a first enqueue without a valid slug (or an
     earlier arrival of the Checkout/PaymentIntent twin) permanently froze
     the row without a canonical slug even after a later call carried a
     valid one. `properties` is now merged with an upgrade-only `CASE` +
     `jsonb_set`: only when the incoming call's `properties` carries the
     `canonical_product_slug` key (i.e. `validCanonicalProductSlug` passed
     in JS) does the stored slug get set/overwritten; otherwise the
     existing row's `properties` — including any previously-stored valid
     slug — is left completely untouched. A new test asserts both the
     upgrade path and the non-erasure path against the actual SQL text and
     parameter shape (two sequential `enqueueStripeLifecycleFact` calls on
     the same canonical id, one with a valid slug and one without).
  2. `tools/**/*.test.ts` added to `vitest.config.ts`'s `include` (R2
     explicitly allowed/required this edit) so
     `tools/contador/process-payment.test.ts` runs under the tracked
     `npm test` with no local override needed.
- Verification (both rounds combined, local-only): 49 focused tests pass (12
  outbox + 20 host + 17 process-payment) via the exact tracked command
  `npm test -- --run src/chaos-lifecycle-outbox.test.ts
src/stripe-payment-host.test.ts tools/contador/process-payment.test.ts`
  under pinned Node 22.23.2; `tsc --noEmit` clean; `docs:continuity-check`
  passes; `git diff --check` clean. No commit, push, deploy, or external
  write occurred in either round.
- Codex independent verification (2026-08-16T17:10Z): accepted the R2
  upgrade-only jsonb merge and tracked test-glob change after direct diff
  review. Re-ran the 49 focused tests, typecheck, documentation continuity,
  and `git diff --check`; all pass under Node 22.23.2. The unrestricted full
  repository suite passes 2381/2382 tests; its sole failure is the pre-existing
  unrelated `src/cnpc-prompt-contract.test.ts` assertion against the already
  refactored `scripts/cnpc-register.ts` wrapper. No NC-20260816-005 file touches
  that boundary. This baseline failure is recorded rather than folded into the
  Stripe release.
- Commit boundary (2026-08-16T17:14Z): reviewed implementation and evidence
  committed as `9f8f6a1`. The commit hook formatted one test file after the
  index snapshot; that formatting-only delta is included in the subsequent
  release-candidate documentation commit before building, leaving a clean
  provenance-bearing release source tree.

### NC-20260816-001

- Trigger: the owner explicitly authorized the production-migration plus
  default-off shadow-projection milestone after reviewing the dark
  `NC-20260815-010` foundation.
- Outcome: make migration 118 a verified, dormant production schema and ship a
  host-owned projection that can observe the existing Mailman/Sales approved-
  email facts without blocking, retrying, sending, closing, or otherwise
  controlling that path.
- Branch/base: `codex/nc-20260816-001-company-os-shadow` from ledger evidence
  commit `3479305ba947ade6f4eaed478acd8fdc8a6f631c` in isolated worktree
  `/private/tmp/nanoclaw-nc-20260816-001`. The dirty operational checkout and
  prior milestone worktrees remain untouched.
- Scope/authority: C5 because this applies production DDL and instruments the
  customer-email control path. Authority includes read-only live discovery;
  reviewed backup/apply/validate of migration 118; local source, tests,
  default-off configuration, release, activation, health, and sanitized shadow
  evidence. It excludes customer email, Slack messages, action-state mutation,
  ledger-driven workflow decisions, schema rollback that deletes history,
  feature promotion, push, and merge.
- Overlap: migration 117 belongs to `NC-20260812-001` Chaos work and migration
  116 belongs to CNPC. Repository numbering is not proof of live application;
  the running PostgreSQL migration history and object definitions must be
  inspected before 118. Existing SQLite `pending_sends` and
  `email_send_events` remain exact approved-email execution authority.
- Acceptance: production migration is backed up and structurally validated;
  no non-admin ledger grants exist; shadow writes are disabled by default and
  fail open with bounded diagnostics when enabled; exact source/action/receipt
  identities converge without raw customer content; projection retry,
  restart, duplicate, blocked, failure, and success tests pass; immutable
  release health is exact; a sanitized reconciliation proves shadow facts do
  not change or duplicate the live email path.
- Result: production backup
  `NC-20260816-001-20260816T1405Z/nanoclaw_business_pre_118.dump` is 2,574,495
  bytes with SHA-256 `932a9aea3e96a2befca8a5f335d04bc9db46d7bd7229b350216834d9ab5510dd`
  and an 899-line restore catalog. Migration 118 SHA-256
  `7aa14b087335b11afe7d637aba07c47268f0a1c8d9ec475091478e5c12f65d4a`
  was applied alone. The three tables are owned by `nanoclaw_admin`, expose no
  raw-content columns or non-admin grants, and retain enabled append-only
  event/receipt triggers.
- Release/live evidence: initial release `052fb0222cea` exposed a historical
  confirmed action missing its required Mailman-dispatch event. The observer
  failed open and did not infer the gap. Corrective immutable release
  `55c97d5e1bd072dab1c3000f3b715134c3ccc336` (source tree `00f62467`,
  artifact SHA-256 `0b2c090b`, archive SHA-256 `f93d4109`) records
  `source_gap:mailman_dispatch_missing` at the last verified stage and is live
  on Node 22.23.2 with one listener and exact launchd/code-root identity.
  First corrective reconciliation scanned seven bounded actions, excluded
  three non-Mailman roots, projected four items, applied one gap transition,
  and completed three. A later cycle applied zero transitions and deduplicated
  all 29 facts with no errors. PostgreSQL contains 4 items, 29 events, and 13
  exact receipts: 3 `outcome_validated/completed` and 1 `approved/failed` source
  gap. SQLite remained at 67 bound actions, 334 events, 61 confirmed, 6
  blocked, and zero actionable actions; Gmail/Slack stayed connected with an
  empty outgoing queue. Projection activation sent no email and posted no
  Slack message.
- Rollback: disable shadow projection first and return to the prior immutable
  release. Leave additive host-only tables dormant. The tracked destructive
  rollback remains forbidden once any ledger history exists.

### NC-20260815-010

- Trigger: after the Company OS reactivation and deployed approved-email repair,
  the owner authorized continued roadmap implementation while stopping only at
  large milestones. The first ledger work must not put Sales/Mailman or the
  owner back into a live integration-test loop.
- Outcome: define and implement the default-off persistence/domain foundation
  for one Mailman → Sales → approval → Mailman → Gmail-receipt work item. The
  foundation must make stage, exception disposition, exact source event,
  action/receipt evidence, version, and idempotency explicit without inferring
  progress from agent prose.
- Branch/base: implementation commit
  `6e281f0c7627bbe5c8579befa649057732ac55b6` on
  `codex/nc-20260815-010-company-os-ledger`, from recovered roadmap commit
  `38810d3` in isolated worktree
  `/private/tmp/nanoclaw-nc-20260815-010`. The dirty operational checkout and
  the deployed `NC-20260815-009` worktree remain untouched.
- Scope/authority: C2 local reversible implementation work only. Expected files
  are a focused Company OS ledger design/ADR, ordered migration 118 and a
  non-auto-discovered rollback, a host-only typed store/state machine, focused
  tests, and structure-only data/project/roadmap continuity docs. No runtime
  integration, group prompt change, live migration, production DB write,
  deployment, restart, Slack/Gmail action, push, or merge.
- Overlap: migration 117 belongs to active Chaos work and remains unapplied;
  migration 116 belongs to CNPC; this task allocates 118 and does not change
  either file or workflow. `pending_sends`/`email_send_events` remain SQLite
  action authority; this task references them by opaque identifiers and does
  not replace or mutate them. Natural-path validation for `NC-20260815-009`
  remains separately pending.
- Acceptance: schema and types contain no raw message body, email address, or
  approval content; only the host admin can write; duplicate source/event and
  idempotency identities converge or conflict visibly; optimistic versions
  reject stale transitions; blocked/failed dispositions preserve stage;
  external acknowledgment and outcome validation require exact receipts;
  restart/retry/duplicate/blocked/success tests pass. No stage is derived from
  agent text.
- Migration/activation: migration 118 remains Git-tracked and unapplied in this
  task. A later task must inspect the live schema, reconcile 116/117 deployment
  state, apply in order, and separately wire shadow event projection before any
  workflow can depend on this ledger.
- Result: the focused design, migration/rollback, typed host store/state
  machine, tests, and authoritative documentation are `ready_for_review`.
  Migration 118 applied cleanly to a throwaway PostgreSQL 16 cluster. Synthetic
  create → dispatch → block → retry → resume → approval → claim → Gmail receipt
  → outcome validation ended `outcome_validated/completed` at version 9 with
  exactly 10 events and 4 receipts. A stale version failed, an exact committed
  retry converged, non-admin table grants were zero, and rollback refused to
  erase the populated history. The cluster and temporary smoke script were
  removed afterward.
- Subsequent acceptance: the owner authorized the separate
  `NC-20260816-001` milestone; that task applied migration 118 and proved the
  bounded non-authoritative production shadow. This closes the foundation
  review without changing this task's original no-activation boundary.
- Verification: exact Node 22.23.2 focused tests pass 2 files / 16 tests;
  typecheck, full-source formatting, documentation continuity (58 active/ready
  rows and 54 changelog entries), and diff checks pass. The sandbox root suite
  passes 2,304/2,350 and reports 46 failures: all 45 permission-sensitive
  webhook/CNPC/child-migration cases pass in their required unrestricted rerun;
  the sole remaining failure is the pre-existing CNPC wrapper assertion on
  unchanged base files. The first install intentionally skipped lifecycle
  scripts; the native binding failure was corrected by rebuilding
  `better-sqlite3` under pinned Node 22 before interpreting root results.
- Rollback: before activation, revert the branch. After a later migration-only
  activation, use the tracked rollback only if no dependent rows/objects exist;
  otherwise leave the additive host-only tables dormant and roll back runtime
  wiring.

### NC-20260815-007

- Trigger: the owner chose to resurrect the Company OS plan and incorporate the
  always-on agent/control ideas into that strategy while keeping implementation
  changes separately reviewable.
- Outcome: reactivate `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` as the one strategic
  roadmap; reconcile program items conservatively against tracked task and
  changelog evidence; define Task, Trigger, Skill, Action Envelope, and Receipt
  as separate contracts; and sequence implementation through dependency-gated
  slices rather than a parallel plan or one large implementation branch.
- Branch/base: `codex/nc-20260815-007-company-os-reactivation` from verified
  documentation/deployment lineage `9e4977ac339ff9ef149f33ea11dbd6faf2d54dc7`
  in isolated worktree `/private/tmp/nanoclaw-nc-20260815-007-recovery`. The
  dirty operational checkout remains untouched.
- Scope: this plan, this active-work entry, and the factual changelog record.
  No source, test, schema, migration, prompt, configuration, service,
  deployment, browser, database, Slack, Gmail, or external-system change.
- Overlap: the task links the then-current release, healer, Procurement, CNPC,
  grader, Sales, and Contador evidence but does not alter their status, files,
  or external systems. `NC-20260815-009` later closed its natural-path gate;
  that subsequent evidence does not change this documentation task's scope.
- Decisions: one Company OS roadmap; separately allocated implementation task
  IDs; safety prerequisites before live ledger activation; normalized triggers
  and versioned skills after ledger semantics; operator exception UX after
  trustworthy transitions/receipts; execution profiles and parent/child work
  only after evaluations, telemetry, cancellation, and joins.
- Verification: exact Node 22.23.2 documentation continuity passed with 57
  active/ready task rows and 53 changelog entries; focused `git diff --check`
  passed. No product/runtime suite is required for this C1 documentation task.
- Result: roadmap recovery commit
  `b7bb65d9b3aec003a0e507b3c0831effcbfca3a1` is complete. The owner had already
  selected the separately gated implementation approach, so the next ledger
  foundation starts under a new task rather than extending this branch.
- Rollback: revert only the `NC-20260815-007` edits in the plan, active-work
  register, and changelog. No production or data recovery is applicable.

### NC-20260815-009

- Trigger: after the NC-20260815-008 replay-gate deployment, the next real
  approval exposed two normal-path defects. The watchdog fallback routed the
  exact action without Mailman's required `[APPROVED-REPLY]` marker, and the
  host-owned rehydration discarded a visible operator-approved CC because the
  immutable action records only one recipient.
- Outcome: define one host-owned approved-email envelope whose executable
  marker and every visible recipient header are parsed from approval authority,
  hashed, stored, reloaded, authorized, and rendered consistently. The model
  may request execution but cannot add, remove, or rewrite recipients.
- Branch/base: isolated worktree
  `/private/tmp/nanoclaw-nc-20260815-009` on
  `codex/nc-20260815-009-email-fallback-headers` at documentation head
  `334e15b`; the implemented/runtime predecessor and deployed release are
  `cfcfaae`. The dirty operational checkout is not an implementation input.
- Overlap: `NC-20260811-002` owns scheduled-task continuation and exact
  approval-card acknowledgement, but this task does not change those mechanics.
  It may touch the shared release-blocking email test registry only to add the
  two incident regressions. `NC-20260815-008` remains the replay-gate and
  recovery record and is not reopened.
- Class and side effects: C5 because the change protects a customer-email
  identity and authorization boundary. Local implementation and tests are
  non-sending. The owner authorized deployment, but queue drain, immutable
  artifact verification, exact activation, rollback capture, and live health
  are separate gates. No synthetic customer email is authorized or needed.
- Required evidence: focused red/green tests for marker omission and CC drift;
  rejection coverage for added, removed, reordered, duplicated, malformed, and
  unauthorized headers; Node 22 typecheck; email replay and critical gates;
  independent runner tests; full relevant suite; continuity check; clean
  immutable build; target artifact verification; activation health; and the
  next natural approval's normal-path receipt before outcome validation.
- Local validation at 2026-08-16T04:07Z under exact Node 22.23.2: focused
  coverage passes 7 files / 257 tests; replay passes 13/13; email-critical
  passes 24 files / 628 tests including the raw Gmail header builder; the
  independent runner builds and passes 6 files / 36 tests; typecheck,
  formatting, documentation continuity, and diff checks pass. The unrestricted
  root suite passes 2,333/2,334 tests; the sole CNPC wrapper assertion fails
  identically on unchanged base `334e15b` and no CNPC file is in this task.
- Commit/artifact: implementation commit
  `12c2b049a27aadf88b2e0517e830ba91e232adc4`; source tree
  `31c8fd4e033396fa4df567474a9384011d90af16`; compiled artifact
  `33bb2801a68479cc16563d4904d671f564eb3c40b768ea7f8170519e2f964aaa`
  across 620 files; archive SHA-256
  `c4e96cd0ce971331d5860d94a2ca9af0719451afe3d2f5441cd9230f08802508`.
  Clean-build and fresh-directory/installed-host verification passed under
  Node 22.23.2.
- Deployment at 2026-08-16T04:35Z: current Tailscale state corrected the stale
  `.204` SSH alias to the authenticated Mini at `.206` for this connection
  only. Activation waited for a real Mailman/Sales run to drain, then proved
  zero active containers, zero waiting groups, and zero actionable email
  states. The reviewed Mailman files were backed up recoverably and copied with
  hashes `5345e060...75e5` and `acd4b69d...76df`. The activator changed only
  the expected three launchd paths and captured rollback plist
  `com.nanoclaw.plist.rollback-cfcfaae03b6b-2026-08-16T04-35-16-950Z`.
  Stable health shows sole listener PID 40936, exact release `12c2b049`,
  matching code root, Node 22.23.2, connected Gmail/Slack, no active/queued
  work, and exactly one `approved_cc` schema column. The first transitional
  health read preceded predecessor-PID exit; release acceptance waited for the
  new PID/uptime boundary. No email was sent for deployment proof.
- Natural outcome validation at 2026-08-16T13:59Z: action
  `996a9d1c-e193-4fa3-9fe4-340a438e0f8d` traversed approval, the normal
  fallback handoff, Mailman start, one-time execution, and Gmail confirmation,
  then produced exactly one completion in its original Slack thread. No manual
  repair or synthetic customer send was used. The durable SQLite outcome is
  `confirmed`; the later Company OS shadow independently reconciles the same
  opaque action as `outcome_validated/completed` without controlling it.
- Rollback: restore the activation-captured launchd plist and verify the prior
  `cfcfaae` release. Any additive local schema change must remain backward
  compatible; uncertain or executing actions are never automatically retried.

### NC-20260815-008

- Trigger: the owner approved implementation after the prior Sales/Mailman
  rollout required roughly two weeks of manual email pushing. The owner must
  not be used as the integration harness again.
- Verified base: read-only `/health` at 2026-08-16T00:59Z reported immutable
  release `84607fd2ac4bcc0dd87fdc2d80d79635a69f0a6d`, source tree
  `c9c1eb843c6463da8d3c5a4671335dd06b7a5040`, artifact hash
  `f706b9eb47794f38445234d17bd02a98d8dceca34242c2a32dd3018da3b8a670`,
  Node 22.23.2, matching code root, Slack/Gmail connected, zero active
  containers, and no queued group. This inspection made no production change.
- Isolation: branch `codex/nc-20260815-008-email-replay-gate` and worktree
  `/private/tmp/nanoclaw-nc-20260815-008` were created from exact live commit
  `84607fd`. The dirty operational checkout is not an implementation or release
  input.
- Outcome: make approval-to-Gmail execution deterministic and host-owned;
  encode every known failure as a scrubbed fixture; and make a non-sending
  replay gate mandatory before any later canary or rollout.
- Overlap: live `84607fd` already contains the accepted-card callback and exact
  host-approved email lineage from `aff14c8`, plus Sales follow-up and human-
  terms work. This task must preserve those behaviors and must not change the
  active Chaos, CNPC, grader, Procurement, or unrelated Sales scopes.
- Required cases: dropped/prose-only handoff; missing/mutated Action ID;
  recipient/subject/body mutation including entity escaping; wrong-session
  callback; missing Party/Entry/Thread identity; predecessor-schema migration;
  restart/interruption around execution; guard block; ambiguous Gmail
  acceptance; replay/duplicate; and exact-thread terminal status.
- Scope/authority: C5 because this local assurance change protects the
  customer-email action boundary. Authority remains limited to local source,
  tests, scrubbed fixtures, scripts, and continuity documentation. Gmail is
  stubbed/disabled. No customer email, production
  database write/migration, deployment, restart, schedule/config change, Slack
  post, commit, or push.
- Acceptance: exact approved bytes and host identity reach one action; every
  case ends sent-simulated, blocked, held, or uncertain with an exact-thread
  receipt; duplicate execution is impossible; no agent prose or queued result
  counts as delivery; the focused gate, typecheck, relevant full tests,
  continuity, formatting, and diff checks pass under Node 22.23.2.
- Implemented decision: live `84607fd` already makes Mailman's Gmail payload
  execution intent rather than customer-content authority, so this slice does
  not introduce another executor. It makes that existing host contract
  continuously provable: eight synthetic fixture cases execute the production
  approval parser/rehydration functions, and thirteen stateful regressions are
  pinned by file and contract marker into the same release-blocking gate.
- Files: `evals/email-delivery/{README.md,incidents.json}`;
  `src/email-delivery-incident-replay.test.ts`;
  `scripts/run-email-critical-tests.{mjs,d.mts}`; `package.json`; and the
  Company OS, project map, release-integrity, active-work, and changelog docs.
- Local verification at 2026-08-16T01:13Z under Node 22.23.2: replay 11/11;
  email-critical 23 files/571 tests; independent runner 6 files/36 tests;
  typecheck and formatting pass. The root sandbox run passed 2,270/2,316;
  all 45 permission-sensitive failures passed in the required unrestricted
  rerun. The only remaining root failure is the unrelated pre-existing CNPC
  wrapper contract on this exact base; this task changes no CNPC file.
- Commit/build: implementation commit
  `253996b43d7ffb49d95102d2f8fb906058f885fd` was created locally. Its clean
  release build reran email-critical 571/571 and runner 36/36, then produced
  source tree `ea5938c2938630ad6268c62b58790a0362472e60`, compiled artifact
  `f706b9eb47794f38445234d17bd02a98d8dceca34242c2a32dd3018da3b8a670`
  across 620 files, and archive SHA-256
  `20a776b78413a7cb76a90e954ab2eaf1a98f7d48f3359d606e69561711103d30`.
  A fresh-directory `verify-release --runtime` independently passed under Node
  22.23.2.
- Pre-deployment state: `ready_for_review`, committed locally but not pushed or
  merged. The
  compiled runtime hash is intentionally identical to live `84607fd` because
  this slice changes tests, the release gate, and documentation rather than
  production execution code. At this checkpoint no Gmail, Slack, production
  database, deployment, restart, schedule, or configuration mutation had
  occurred.
- Rollback: after activation, restore the activation-captured launchd plist for
  `84607fd`, then reverify prior-release health. Preserve the contamination
  archive and exact Gmail receipt; never roll back or resend the confirmed
  customer action.
- Deployment attempt at 2026-08-16T02:45Z: the owner explicitly requested
  deployment. Exact head `cfcfaae03b6b51ae13a481d32ea1476d3dc9345e`
  rebuilt under Node 22.23.2; email-critical 571/571 and runner 36/36 passed.
  Archive SHA-256
  `d6a14dc90257e2948d9b7238a54c5cb79d1c98b06c30dc080dfc6c3266cf71b5`
  matched after transfer. The target was installed at
  `~/.local/share/nanoclaw-releases/cfcfaae03b6b51ae13a481d32ea1476d3dc9345e`
  on the Mini and independently verified. The activation dry run reports only
  the three allowed plist changes and passes.
- Live-release recovery: the first dry run correctly rejected current release
  `84607fd` after runtime writes changed 18 tracked knowledge files and added
  92 unmanifested knowledge/backup files. Every changed/extra byte was moved
  or copied recoverably under
  `~/.local/share/nanoclaw-release-contamination/84607fd2ac4bcc0dd87fdc2d80d79635a69f0a6d/`;
  the manifest-attested files were restored from the verified target, and the
  current release then passed bundled runtime verification. The matching
  writable operational knowledge remains in the state checkout. This is live
  evidence for the still-open `NC-20260815-006` state-root separation defect.
- Activation hold at 2026-08-16T02:45Z: aggregate preflight found 59 confirmed,
  6 blocked, and 1
  `attention_required` email action. Action
  `30a42d6d-437f-45b4-a089-e931ae308a86` progressed through approved,
  handoff-routed, and Mailman-started states but never entered execution; it has
  `send_not_confirmed`, no Gmail receipt, and an operator alert. A bounded
  read-only Gmail recipient/subject/thread/time-window check found zero
  candidate or exact sent messages. No customer content was printed and no
  action state changed. The documented drain gate prohibited activation until
  the owner separately chose re-execution or block/cancel for this approved
  customer action.
- At the deployment hold, production remained healthy on verified `84607fd`,
  with Slack and Gmail connected, zero active containers, an empty runtime
  queue, and one launchd-owned listener. No restart or activation had yet
  occurred.
- Approved-action recovery (owner authorized, 2026-08-16T03:10Z): production
  logs established why the email was not sent. The Chief watchdog generated a
  fallback after approval, but that handoff omitted Mailman's required
  `[APPROVED-REPLY]` marker. Mailman explicitly refused it, never called Gmail,
  and the watchdog later moved the action to `attention_required`. A second
  contract gap was found before recovery: the exact card included a visible CC,
  while `buildHostApprovedEmailExecution` deletes `cc` and the ordinary Party
  guard does not treat the team mailbox as a customer Party address.
- The owner then explicitly authorized the exact stored card. A bounded
  recovery revalidated Action-ID `30a42d6d-437f-45b4-a089-e931ae308a86`, exact
  recipient/subject/body hash, card CC, canonical Party 10136, content policy,
  disabled test routing, and zero prior Sent candidates before atomically
  claiming execution. Gmail accepted exactly one message with receipt
  `1a0088cd49ec9664`; an independent metadata read confirmed `SENT` plus the
  approved To, visible CC, and subject. A full-message re-read then matched the
  570-byte normalized Sent body to the approved-card/ledger hash without
  printing its content. The ledger appended `executing` and `confirmed`, the
  outbound interaction was recorded, and mechanical receipt
  `1786850009.589809` was posted to the original Slack approval thread. This is
  successful manual recovery, not proof that the natural path is fixed.
- Activation (2026-08-16T03:12Z): after the action was confirmed, the aggregate
  drain contained no `approved`, `handoff_routed`, `mailman_started`,
  `executing`, or `attention_required` actions; health showed zero active
  containers and an empty queue. The host activated exact release
  `cfcfaae03b6b51ae13a481d32ea1476d3dc9345e`, changing only the expected three
  launchd paths. Rollback plist:
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-84607fd2ac4b-2026-08-16T03-12-03-722Z`.
  New PID 18232 owns the sole port-8088 listener; `/health` reports the exact
  commit/source tree/artifact, matching code root, Node 22.23.2, connected
  Gmail/Slack, and zero active/queued work. The installed 620-file bundle also
  passes independent verification.
- Subsequent closure: `NC-20260815-009` repaired both observed handoff/header
  defects and deployed them through the same release-blocking replay gate. At
  2026-08-16T13:59Z, later natural action
  `996a9d1c-e193-4fa3-9fe4-340a438e0f8d` completed approval, normal fallback,
  Mailman execution, exact Gmail acknowledgment, and one original-thread
  closure without manual recovery. The replay assurance and its named natural
  business-path gate are therefore complete; keep the corpus in every
  descendant email release.

### NC-20260812-001

- Trigger: Chaos can receive authenticated lifecycle facts, but the production
  Stripe path does not yet preserve the provider event identity, event time,
  account, or exact refund identity needed for durable purchase/refund
  attribution and cross-system reconciliation.
- Release base: exact live immutable production commit `b4d85b2`; the shared
  operational checkout and its unrelated dirty state are not release inputs.
- Safety contract: Stripe remains authoritative for payment and refund facts;
  accounting completion never depends on Chaos; lifecycle publication is
  default-off, PII-free at rest, retryable, idempotent, and dead-letters alert
  the chief. Existing fulfillment and Encharge Stripe automation are unchanged.
- Implemented source: fixed account-bound n8n extraction for Heartbeat and
  Tandem; canonical `pi_*` purchase identity; exact `re_*` partial-refund
  identity; additive migration 117; durable outbox, reaper, chief alerting, and
  Chaos publisher; aggregate-only 7/30/90 reconciliation; release-root-safe
  Contador wrappers; authenticated Chaos purchase/refund ingestion and cohort
  counters.
- Verification: Claude R1/R2 findings are fixed and Claude R3 returned `SHIP`.
  On pinned Node 22.23.2, typecheck passes, 55 focused tests pass, and the
  release gate passes 22 files / 560 tests plus 6 runner files / 36 tests. The
  complete suite passes 2,304 tests with one unrelated pre-existing CNPC prompt
  contract failure; CNPC source is unchanged from the live base. Production
  migration, private n8n backup/update, immutable activation, and aggregate
  receipt proof remain pending.

### NC-20260811-002

- Trigger: no daily Sales follow-up approval card was produced from 2026-08-03
  through 2026-08-11 even though the weekday task continued to run.
- Live evidence: seven runs were recorded as `success`, but every result says it
  queued Gmail thread reads and was waiting. Thirty-two exact Gmail results were
  subsequently held because the originating scheduled-task container could not
  accept targeted asynchronous input. Late July produced follow-up cards
  normally; August produced zero.
- Root cause: the exact-session hardening correctly prevented asynchronous
  Gmail results from falling into a sibling session, but `GroupQueue` also
  excluded every scheduled-task container from exact source-container delivery.
  The generic scheduler then closed the task ten seconds after its first model
  result and treated "waiting for Gmail" prose as completion.
- Backlog: the live deterministic queue currently has 108 eligible rows: 101
  first follow-ups, five second follow-ups, and two cold transitions. This is
  the current eligible population, not an attribution of all 108 rows to the
  one-week outage.
- Safety contract: only an active container whose exact name and directory-owned
  group match the Gmail request may receive its result; ordinary chat input must
  remain excluded from task containers. A daily Sales run is not successful
  merely because the model exits zero: for a non-empty queue its final receipt
  must name each selected pipeline ID and the host must observe a visible card
  for all of them; an empty queue requires the exact empty-queue result. Backlog
  recovery creates approval cards only and never sends customer email without
  human approval.
- Implementation/verification: exact task-container source delivery, resettable
  60-second continuation windows, and the counted Sales completion validator are
  implemented. The Sales workflow now forbids ending on queued/waiting prose and
  defines the exact receipt. Pinned Node 22.23.2 typecheck, formatting,
  documentation continuity, and diff checks pass; five focused files pass 112
  tests; the expanded release gate passes 22 files / 558 tests plus the
  independent runner's 5 files / 34 tests. The complete host suite accounts for
  2,287/2,288 tests after the required permission-sensitive rerun; only the
  unrelated, exact-base CNPC source-wrapper assertion remains. Immutable
  `7981928` built and independently verified (612 compiled files; archive
  SHA-256 `d5dfef80ea23ff1a99cc54e431228fa87aa26306bfe542cab7c11d48ec536120`).
  Staging, activation, and backlog recovery await explicit production approval;
  production is unchanged. The 2026-08-11T20:49Z read-only preflight confirms
  live `194f8486` is healthy with Slack/Gmail connected, seven false-success
  August task logs remain, zero nonterminal email sends are in flight, and one
  unrelated Certifier container is active; wait for it to drain before any
  approved activation.

### NC-20260811-001

- Trigger: Sales rejected Alex's exact in-thread instruction that Velera may use
  a 5% company discount because the host guard treats all numeric discounts as
  invented, then incorrectly told the operator to send the response manually.
- Recovery: a corrected complete draft for Tom Olney, Lead #1098, is posted in
  the original Sales work thread and passes the currently deployed content
  guard. It remains approval-gated and has not been emailed.
- Release base: exact live immutable production commit `194f8486e737d387f5b69b1f88db711bebc06659`;
  the shared operational checkout and its unrelated dirty state are not release
  inputs.
- Safety contract: only a numeric commercial term stated by a human in the exact
  Sales work thread may satisfy the discount guard for that thread. Bot/customer
  handoffs, sibling threads, self-asserted card text, mismatched values, and all
  other content or recipient violations remain blocked.
- Alias preflight: Party 11274 and Gmail thread `19ff239122ff27cc` resolve to
  Tom, but `Tom.Olney@velera.com` is not in the CRM allowlist. No CRM write was
  made. The implementation instead permits that exact Gmail-derived participant
  for this approved reply only; standalone sends and unapproved aliases remain
  blocked.
- Release boundary: pre-approval and final Gmail enforcement must resolve the
  same durable authorization. Deployment waits for active containers to drain,
  and success requires the natural approved Tom action to receive an exact Gmail
  receipt; tests and Slack posting alone are not outcome proof.
- Verification: Node 22.23.2 typecheck, formatting, documentation continuity,
  runner build/tests, and the 523-test email-critical suite pass. The broad
  sandbox run passed 2,233/2,279 tests; all 45 permission-sensitive listener and
  migration cases passed when rerun outside the restricted sandbox. The sole
  remaining failure is the pre-existing CNPC prompt-contract assertion in the
  exact live base; neither that test nor its wrapper differs on this branch.

### NC-20260810-002

- Trigger: reduce the EA's manual CNPC application copy/paste, coach matching,
  availability checking, and chemistry-session coordination to a narrow human
  review boundary.
- Release base: exact live immutable production commit `0b35539`; the shared
  operational checkout and its unrelated dirty state are not release inputs.
- Public ingress: n8n workflow `cnpc-coaching-intake` is published at
  `POST https://webhooks.tandemcoach.co/webhook/cnpc-coaching-intake`. It
  authenticates Gravity Forms, allowlists the established form-1 mapping, and
  currently has no downstream node.
- Implemented source: typed and bounded intake validation; stable entry
  identity; host-owned identity/intake write; deterministic eligibility and
  price; migration 116 for canonical roster, capacity, matching, chemistry,
  engagement, and action-outbox state; bounded active-capacity match pool;
  model-result validation and host persistence; CNPC prompt, knowledge, and
  registration script.
- Channel: `#gru-cnpc`, Slack ID `C0BPG0408BW`.
- Safety boundary: no client or coach email, Plutio document, hard capacity
  commitment, or ready-to-begin action is implemented or authorized in this
  release. The disclosed CNPC Plutio secret must be rotated before future use.
- Deployment state: public capture/normalization is live and verified; private
  forwarding, migration 116, CNPC registration, immutable release, and
  end-to-end canary are pending the current release sequence.
- Detailed contract and phase plan: `docs/CNPC-AUTOMATION.md`.

### NC-20260809-001

- Trigger: re-evaluate grading quality against newer submissions, preserve a
  human-authored student experience, and deploy the resulting safeguards while
  keeping Heartbeat result posting disabled.
- Release base: exact live immutable commit `ec62c30`; the shared dirty
  operational checkout is not a release input.
- Included: strict host output boundary, current read-only assignment fetch,
  explicit identity check, per-turn run proof, and normal/adopted final-text
  suppression.
- External-write boundary: NanoClaw stages a verdict and feedback in Slack. It
  has no automatic Heartbeat result-write route in this release.
- Deployed release: `bc9312522aba8a584fdce6af26a9b0434862bf59`, exact
  installed process and manifest verified on the Mac Mini; both grader final
  text suppression flags are live.
- Installed-artifact canary: concrete feedback passed; stock praise blocked;
  Heartbeat assignment access remained GET-only; no Slack student post or
  Heartbeat write occurred.
- Evidence: `docs/reports/NC-20260809-001-GRADER-RELEASE.md`.

### NC-20260809-004

- Trigger: the owner authorized implementation and then explicitly ordered deployment of the converged request-first Sales redesign.
- Owner/reviewer: Codex implementation with Claude Code reviewing in the exact NanoClaw project session. Claude R3 verdict: `ACCEPT`.
- Isolation: deployment starts from the exact live immutable release `4437ee3a47dac2dc69357bcd160f410efe467fc7`; the shared operational and Studio worktrees remain dirty and are not release inputs.
- Behavior: determine relationship only from evidence predating the inbound; enumerate the current request; assess answerability; select one of `SERVICE`, `TRANSACT`, `ANSWER`, `ORIENT`, `CLARIFY`, `HUMAN`, or `DECLINE`; treat browsing path as non-binding.
- Commercial boundary: price, cohort, booking, enrollment, signup, and free-module material is omitted unless the current message supports `TRANSACT`; `TRANSACT` requires a verbatim current-message `Route-Basis` of at most 15 words.
- Abstention: `LOW` confidence and `HUMAN` produce `[SALES ESCALATION]` with no customer draft and cannot enter the approved-send watcher.
- Evidence before release: final focused pair passed 2 files / 17 tests; the exact live-lineage root suite accounted for 166 files / 2,227 tests (2,184 in-sandbox plus the 43 permission-sensitive tests rerun 43/43); typecheck, build, formatting, continuity, and diff checks passed; local marker replay over 2,322 Sales bot rows changed zero classifications.
- Quality boundary: the nine-case fixture validates prompt/contract structure, not real-response quality. Blinded historical scoring and natural-response observation remain outcome validation after deployment.
- Review record: `docs/reports/NC-20260809-004-CLAUDE-FINAL-REVIEW-R3.md`.

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
- Immutable release `ec62c3003aaa` is live with archive SHA-256
  `f52e2f57e9e5214e01d1e08451ab3f15f29604115212cc4dd2818069f212619f`,
  source tree `a8b4c7bd1efc5da7c7ab227a600bc01acc4bfeb5`, artifact
  `38a5df15cea7352e12bb889c276f040d7c237a1cccd1d5d2e8a74135b7d0ec93`,
  and rollback plist
  `com.nanoclaw.plist.rollback-ba726e7cbda0-2026-08-10T00-51-16-106Z`.
  Refreshed health reports the new PID, Node 22.23.2, exact code root match,
  Slack/Gmail connected, and zero containers; collection is `1`, review `0`.
  The live packaged procedure hash is
  `e7d355cfe5a7e95197ffb308a8d30ad60ed98f072502dab065d92d2314e74a9f`.
- Fourth natural task `nc-20260809-003-caleprocure-canary-4` was atomically
  claimed once but produced no result and no source-run receipt. Its single run
  ended `error` after 1,235,396 ms with the bounded classification
  `container_timeout=true`; no task payload was read. This also exposed that
  `effectiveContainerTimeoutMs` floors the configured 900,000 ms timeout at
  `IDLE_TIMEOUT + 30,000` (1,230,000 ms in production), contradicting the
  documented 15-minute bound. Four natural attempts now isolate the unstable
  layer to model-driven browser orchestration: direct public browsing and the
  operator-assisted host adapter both find/accept the positive control, while
  natural scans do not deliver it. Do not extend the timeout and retry again;
  converge a deterministic host-owned collector first.
- Deterministic acquisition implementation: CaleProcure collection now runs as
  a host job from the immutable release, connects only to the dedicated
  `127.0.0.1:9250` Chrome debugging origin, and calls the existing typed
  `ingestCaleProcureRows` boundary directly. It establishes a non-empty
  unfiltered baseline, reads the portal's business-unit directory, executes
  each of the nine release-owned searches with a proved clear/search busy
  transition, reconciles visible totals and rows, verifies exact detail-page
  identity, and emits bounded public diagnostics. Per-unit row-budget,
  reconciliation, and identity failures remain visible without discarding
  other independently proven units; transport, baseline, query-transition,
  malformed-metadata, and abort failures remain fail-closed. The job writes a
  partial source receipt on a failed live collection, closes its two owned
  tabs, resets the business pool, and has an internal abort deadline below the
  outer scheduler timeout.
- Runtime cutover implementation: internal `dist/*.js` jobs resolve from the
  immutable `NANOCLAW_CODE_ROOT` and execute under the daemon's exact Node
  binary while retaining the operational working directory. The scheduler
  passes the configured job timeout. The old container-owned Procurement CDP,
  credential, bridge, and browser-config path is removed; the dedicated Chrome
  launch script binds loopback only. The new daily 08:00 America/Chicago job is
  registered default-off. Bonfire and missing-attachment acquisition are
  paused until separately designed deterministic host adapters exist.
- Claude R12 approved this architecture. R13 then found six concrete defects:
  stale result-state races, abort-without-receipt/tab leakage, post-navigation
  row limits, whole-run identity abort, residual Bonfire bridge wiring, and
  forced-exit flush risk. All six were corrected and covered. Claude R14
  returned `GO for commit and shadow deployment`, accepted those repairs, and
  identified one additional pre-live reliability improvement: isolate a
  count/row reconciliation mismatch per unit and continue later units. That
  change is implemented; the six focused files pass 47/47 under exact Node
  22.23.2. R14 requires empirical proof that the CDP client disconnects and the
  process exits without terminating launchd Chrome; three consecutive shadow
  runs must complete in under half the timeout with nine diagnostics, differing
  query totals, event `0000039985` / BU `3820`, and no tab growth. Only then may
  one live collection run with review still disabled. Review activation still
  requires two scheduled live runs on different days, including truthful zero
  results, plus a separate owner decision.
- Claude R15 reviewed the exact M-6 delta and returned `GO for commit and
immutable shadow deployment`, with no blocker or high regression. It traced
  the failed unit through migration 115: the unit enters diagnostics but not
  coverage, so the live receipt remains `partial` and the job exits nonzero.
  Exact Node 22.23.2 verification on the final candidate passes the host build,
  typecheck, formatting, documentation continuity, `git diff --check`, the
  complete 157-file / 2,006-test root suite, and the independent runner build
  plus 4-file / 29-test suite. Deployment and empirical gates remain pending.
- Integration deployment preserved the intervening Grader lineage by replaying
  Procurement on `7451834`; exact Node 22.23.2 then passed 165 files / 2,206
  tests and the combined runner passed 5 files / 34 tests. Immutable release
  `f3c423c52f62` activated with exact health. The reviewed Procurement prompt
  and browser launcher are installed byte-identical; CDP listens only on
  `127.0.0.1:9250`, the old bridge is unreachable, the legacy scan is paused,
  and container ingest, deterministic collector, and review gates are all `0`.
  A literal trailing `\\n` that made `data/jobs.json` invalid JSON was backed
  up and repaired before the new daily job was registered disabled.
- First shadow gate exposed R14 H-4 exactly: the collector truthfully failed on
  the `coaching` search, returned its two owned tabs to the two-tab baseline,
  and left launchd Chrome healthy, but Node remained alive after flushing the
  error because the `connectOverCDP` transport was still open. The hung shadow
  process alone was interrupted. `close()` now closes both owned pages and then
  awaits Playwright `Browser.close()`, whose connect-over-CDP implementation
  closes the client transport rather than the external Chrome process. A new
  regression verifies both pages and the browser client close exactly once.
  Claude R16 independently traced the pinned Playwright implementation and
  returned `GO`: `Browser.close()` closes only the CDP transport and connection
  temp state for this externally attached browser, not the launchd Chrome or
  unrelated tabs. Its Medium M-9 observation is also repaired: the disconnect
  is bounded at 10 seconds with an unreferenced, cleared timer so a wedged socket
  cannot recreate H-4. Exact Node 22.23.2 passes 3 focused files / 15 tests,
  typecheck, build, formatting, continuity, `git diff --check`, the complete
  165-file / 2,208-test suite, and the independent runner's 5 files / 34 tests.
  A new immutable release and repeat shadow gate 1 precede any live collection.
- Immutable repair release `4053bf89867b` was built and transferred with
  archive SHA-256
  `f7f73df4757ca2cb4ee73e9c31b11c4b5cf2aa769c4e5c64b84c20173870a660`;
  its bundled remote verifier matched source tree
  `b147c5d090450d9c66ef216b3ce05a91fa16c6d6` and artifact
  `92d1efc4915a985a63959970e98e2dff6b35a4a84f16606086e35638205d1ca6`
  across 592 files. The dry run showed exactly three release-identity changes.
  It was not activated because unrelated live Sales work had not drained, and
  it is now superseded by the acquisition repair below.
- Two direct shadows from the verified `4053bf8` release independently prove
  the R16 gate: Node exits on its own, launchd Chrome remains healthy, and tabs
  return from four to the two-tab baseline. The captured repeat ran
  2026-08-10T03:17:07Z–03:18:22Z and failed truthfully on `coaching` with exit
  1. Bounded no-write diagnostics then repeated a reconciled 320-row baseline
     and 300-entry department directory. The exact `coaching` search POST returned
     HTTP 200 JSON with the exact query and no-result result at
     `CaptureResults.eventName[0].Properties.value` and
     `CaptureResults.box_error_items[0].Properties.text`, but the UI kept all
     result markers hidden. The same response structure for `facilitation` had no
     no-results field and the visible UI returned exactly one row. The candidate
     parser accepts only the exact query-bound no-results tuple, rejects malformed
     or mismatched responses, and rejects any simultaneous visible result grid or
     summary. Claude R17 returned `GO` and its two requested repairs are applied:
     diagnostics preserve `visible | response` result provenance, malformed
     response URLs are skipped, and tests cover unrelated error text plus duplicate
     query captures. Exact Node 22.23.2 passes 3 focused files / 16 tests, build,
     typecheck, formatting, documentation continuity, `git diff --check`, the full
     165-file / 2,209-test root suite, and the runner's 5 files / 34 tests. A
     superseding immutable release remains before the live shadow gates.
- The official-source refresh adds UC CalUsource, CSU CSUBUY, Los Angeles
  County, San Diego BuyNet/forecast, Orange County OpenGov, and federal agency
  forecasts as gated candidates. Forecasts remain intelligence, not open
  opportunities; no account, alert, or feed was activated. SAM.gov remains the
  first new deterministic adapter after the current closure canary.
- Immutable release `a69f0ff1a372` activated on the production Mac Mini with
  source tree `ca6e0b3c278538d70ef8c1f414318340d574f3dc`, artifact
  `cb89cf09981aa2e071a4c21d1d2b3b1c7e4d1c49592afdefbcf7640802fd50c7`,
  archive SHA-256
  `e3cc8e00cfccc294607e5a8bd27e017d6b8bfd9065fe4bec0d552d9fe7cb6803`,
  and exact Node 22.23.2 health after the launchd heartbeat converged to the new
  listener PID. Slack/Gmail remained connected, active containers stayed zero,
  Chrome returned to its two-tab baseline, and all three Procurement gates
  remained `0`.
- The first `a69f0ff` shadow exited on its own and preserved Chrome/tabs but
  still failed on `coaching`. Claude R18 returned `NO-GO` on the proposed async
  response predicate because the live response cardinality/shape premise was
  not yet established, the captured payload could race, and CLI failures lost
  their cause chain and shadow partial summary. Bounded public-source
  diagnostics then proved exactly one same-path POST for each of `coaching` and
  `facilitation`, both HTTP 200 JSON with one exact echoed query. The zero query
  returns the full terminal string `No event met your search criteria. Please
change your search criteria and try again`; the old parser accepted only the
  shorter UI label. The positive control returns one visible reconciled row and
  its single `box_error_items` capture has no text property.
- The R18 repair candidate matches only the exact query-bound full terminal
  string, observes responses through a removable listener, and feeds a bounded
  loop that independently accepts reconciled visible results or the response
  zero proof while rejecting a simultaneous visible/zero contradiction. It no
  longer has a mutable resolved-payload race or a losing response timeout.
  Shadow collection failures now become `CaleProcureJobError` with a public
  partial summary and an eight-level cycle-safe cause chain. Exact Node 22.23.2
  focused verification passes 3 files / 19 tests, including `search()` itself,
  cheap response gates, listener cleanup, terminal-zero selection, visible
  positive reconciliation, and shadow evidence. Full verification, Claude
  convergence, immutable release, and production shadows remain pending.
- Claude R19 returned `NO-GO` on one introduced regression: the outcome loop
  treated a visible no-results marker as contradicting a response-proven zero,
  even though those signals agree. It also found the response flag was sampled
  after DOM counts and required coverage for contradiction, timeout,
  visible-zero, and cross-keyword response paths. A bounded read-only diagnostic
  then searched `executive coaching` and observed exactly one visible normalized
  DOM message: `No event met your search criteria. Please change your search
criteria and try again`, identical to the terminal response text. The four
  exact DOM call sites now use that verified full string.
- The post-R19 candidate samples the response-zero flag before DOM counts,
  rejects only a simultaneous visible results summary/grid, prefers visible
  evidence when the page renders an agreeing zero, and otherwise returns the
  response proof for the known hidden-zero portal defect. The four requested
  paths are executable: visible zero returns `visible`/0/[], contradiction
  throws, absent evidence times out fail-closed, and a terminal tuple for a
  different keyword cannot suppress a reconciled positive row. Cause output no
  longer duplicates the collection error at the first two links. Exact Node
  22.23.2 focused verification passes 3 files / 22 tests plus typecheck,
  formatting, and `git diff --check`; final Claude convergence and complete
  verification remain pending.
- Claude R20 returned `GO for commit, immutable deployment, and the unchanged
three-shadow gate`, with no blocker or high issue. Its one Medium is an
  empirical gate rather than a code defect: the now-correct full empty marker
  must disappear after Clear Criteria before the following keyword, or the run
  will fail loudly instead of accepting a stale zero. Shadow 1 will exercise
  that path naturally. Its low CI-flake observation is applied by giving the
  synthetic no-evidence timeout 50 ms instead of 1 ms. Exact Node 22.23.2 final
  verification passes the focused 3-file / 22-test Procurement slice, root
  build, typecheck, formatting, documentation continuity, `git diff --check`,
  the complete 165-file / 2,215-test root suite, and the independent runner
  build plus 5 files / 34 tests. An initial sandboxed complete-suite attempt was
  rejected as evidence because the sandbox denied the webhook bind and a
  migration child process; the complete suite was rerun outside that sandbox
  and passed.
- Immutable release `d5836318ce36` activated with verified source tree
  `4b169c0201c680ad4659c8bdf91946e20d06a8df`, artifact
  `7542dea1bcdc5b4b2134797063397bab723396486434a680e5d00982ab1def43`,
  and archive SHA-256
  `292e2384fcdf353b6b576443d53cbaf3f33c9421f954a597b86a5028b0e47f53`.
  Health converged to listener PID 48776 with exact Node 22.23.2; Slack/Gmail
  stayed connected, active containers and in-flight send states were zero,
  Chrome stayed at two tabs, and all three Procurement gates stayed `0`.
- Restarted shadow 1 self-exited in 74.75 seconds with tabs 2 -> 2 and no write,
  but correctly stopped after `coaching` because the full visible no-results
  marker survived Clear Criteria before `leadership development`. A bounded
  public-source diagnostic proved Clear empties the query, summary, and grid
  while leaving that message visible; a following `facilitation` search removes
  it and renders one reconciled row. This retires the earlier hidden-UI premise:
  the response path is required because the marker is stale and not query-bound.
- Claude R21 returned `GO FOR R21 IMPLEMENTATION` with one same-change High:
  remove the unscoped marker from result-total parsing as well as clear/outcome
  decisions. The candidate now accepts zeros only from the exact query-bound
  response tuple, positives only from a visible summary plus reconciliation,
  records marker visibility as non-authoritative diagnostics, and cannot form a
  false marker/summary contradiction. Claude R22 returned `GO FOR COMMIT AND
SUPERSEDING IMMUTABLE SHADOW RELEASE`, with no blocker/high code issue. Exact
  Node 22.23.2 passes 3 focused files / 26 tests, the complete 165-file / 2,219-
  test root suite, typecheck, build, formatting, documentation continuity,
  `git diff --check`, and the independent runner build plus 5 files / 34 tests.
- The restarted shadow gate replaces the now-degenerate "both provenance values"
  check with these assertions before every live write: every zero is `response`;
  every positive is `visible` and reconciled; no contradiction fires; at least
  one positive immediately follows a zero; and `coaching` is specifically
  `response` / 0 / `visibleEmptyMarker: true`. The remaining gates stay: 9/9,
  baseline nonzero/reconciled, different units yield different totals, the
  `facilitation` positive control is identity-verified, runtime stays below half
  the scheduler timeout, self-exit succeeds, and Chrome has no tab growth.
  Immutable superseding release and production shadow evidence remain pending.

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
