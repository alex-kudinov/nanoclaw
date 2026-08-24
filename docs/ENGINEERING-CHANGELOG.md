# NanoClaw engineering changelog

This is the shared, append-only engineering and operations record for Claude
Code, Codex, and human collaborators. It records change evidence, not product
marketing.

Protocol: `docs/CHANGE-PROTOCOL.md`

## Unreleased

### NC-20260824-009 — Prospective two-reminder checkout recovery

- Date: 2026-08-24T22:20:00Z
- Owner/client: Codex implementer + Claude Sonnet/high reviewer
- State: ready_for_deploy; reviewed source only, customer delivery disabled
- Authority: accepted Growth decision
  `decision:abandoned-checkout-two-reminder-activation-2026-08-24`
- Plan review: Claude R1 returned `CHANGES REQUIRED` and found late-webhook
  consent erasure, stale sibling-case touch-two risk, missing independent touch
  scheduling, and missing locale propagation. The corrected R2 plan fixes all
  four before provider activation.
- Local implementation: migration/rollback 136; policy-v2 locale/return/product
  context; per-touch intents and append-only receipts; prospective cutoff/pilot
  allowlist; exact current/sibling purchase suppression; Encharge event
  handoff; eight localized touch templates; guarded flow administration.
- Implementation review: Claude R2 found ambiguous lease-expiry replay and a
  missing touch-one prerequisite for touch two. Expired leases now fail closed
  to receipted `held`, and touch two waits for touch-one provider acceptance or
  suppresses after a terminal non-acceptance. Disposable PostgreSQL proves both
  paths; bounded Sonnet/high correction R3 returned `NO MATERIAL FINDINGS`.
- Boundary: no production migration/config/restart, Encharge template/flow,
  legacy trigger, customer event/email, historical replay, payment,
  accounting, CRM, booking, roster/access, or required-student-message state
  has changed.

### NC-20260824-008 — Multilingual Foundation grader variants

- Date: 2026-08-24T21:30:00Z
- Owner/client: Codex implementer/orchestrator; Claude Code Sonnet/high reviewer
- State: ready_for_deploy on isolated exact-live branch; combined-live-lineage
  source is verified but not yet committed, pushed, release-built, deployed, or
  live-canaried
- Branch/base: `codex/grader-multilingual-variants-20260824`; grader source
  `1576762a`, then merge `20e6dad8` preserving exact current live
  `a055ea05705d600bcf7244f38ba81c01808d0d01` and its multilingual facts/KB
  release.
- Source commit: `1576762a` (implementation/review/verification evidence before
  this continuity addendum).
- Rebase safety: the first clean artifact at `5af503cc` was rejected before
  transfer or deployment when read-only health showed production had advanced
  from `7a36d79c` to `a055ea05`. The current branch explicitly merges that live
  commit; combined verification and a replacement artifact are required.
- Change class: C3 because the released host may stage customer-facing grader
  feedback in Slack; localized provider writeback and certificates remain off.
- Outcome: one default operator routine covers English, French, Japanese, and
  Spanish Foundation courses sequentially while preserving one isolated grader
  root/container per written submission. The standalone grading authority has
  24 exact live written mappings, four collision-free completion variants, 18
  localized assignment snapshots/packs, and four locale/register/terminology
  profiles over six shared logical decision standards.
- Host enforcement: data-driven live-assignment requirement; exact course/
  lesson/title validation; host-bound logical code/variant/locale/language in
  per-turn proof; conservative French/Spanish/Japanese process/template rules;
  Japanese/English script mismatch; locale-aware wrong-name protection; strict
  no-byte-leak output boundary unchanged.
- Operator enforcement: maintained four-variant manifest, separate course
  ledger/cache/approval index/idempotency, exact variant grader code on Slack
  roots, schema-version-3 release flags, localized submission-in-hand feedback
  review, and `not_applicable` certificate sweep for disabled variants.
- Release flags: English retains existing writeback/tracker/certificate
  behavior. French, Japanese, and Spanish may stage/review feedback only;
  Heartbeat writeback, completion-tracker mutation, certificate readiness,
  issuance, and notification are disabled pending locale calibration and a
  later recorded release gate.
- Grading authority: local privacy-preserving commit
  `85243f136d0d68d28d9b03210fe8ec5301bc58f9`; no remote by design. The source-
  host verifier confirms all 18 localized course/lesson/title mappings and
  snapshot bytes against the current course dossiers.
- Review: Claude R2 found one P1 Japanese honorific false positive and two P2
  calibration/source-integrity issues. All were fixed; bounded correction R3
  returned `ACCEPT` with no remaining material finding.
- Verification at review boundary: pre-merge isolated focused 8 files / 215
  tests; combined-live-lineage focused 10 files / 243 tests; typecheck, build,
  formatting, documentation continuity, capability matrix, and diff checks
  pass. Full root is 3,230 pass / 19 skip with only the unchanged CNPC wrapper-
  contract failure; its two surfaces are unchanged from exact base.
  Standalone validator callables, pack build/freshness, source comparison, and
  personal skill/manifest/ledger validation pass. The standalone validator retains only the
  pre-existing unrelated `acc-bars-standard.json` schema-dispatch error and PCC
  held warning.
- External/deployment state: no private submission, grading record/ledger,
  provider, Slack, Heartbeat, certificate, runtime, restart, deployment, or
  customer action occurred.
- Rollback: immutable NanoClaw release rollback plus standalone grading commit
  `d514fab` and the prior personal skill revision. Never roll back by rewriting
  student attempt history.
- Documentation: `groups/grader/CLAUDE.md`, `docs/PROJECT-MAP.md`,
  `docs/GRADER-MULTILINGUAL-VARIANTS.md`, active work, review artifacts, grading
  README/schema, and the personal Heartbeat grading skill.

### NC-20260824-003 — Multilingual Foundations facts in every minion KB

- Date: 2026-08-24T20:34Z
- Owner/client: Codex
- State: ready_for_deploy; implementation and independent review complete
- Authorization: accepted owner instruction and
  `decision:mcs-localization-knowledge-repair`; no customer reply, provider or
  course mutation, translation, enrollment, payment, entitlement, price,
  customer-record, or message action is authorized.
- Failure: the release-owned Sales KB described only the English Mentor
  Coaching Foundations product. Sales therefore denied French availability to
  a French-speaking prospect despite a complete localized product journey.
- Current evidence: exact versioned course records show Spanish 25/25
  Published, Japanese 25/25 Published, and French 27/27 Published. The French,
  Japanese, and Spanish public sales pages returned HTTP 200 on 2026-08-24 and
  exposed their dedicated checkout product keys. This proves current localized
  self-paced Foundations availability, not localized Standard Path delivery or
  official translated ICF MCS recognition.
- Implementation: a revisioned JSON catalog is byte-hash-bound to a canonical
  minion pack. `sync-program-facts.py` injects/replaces that exact block in all
  13 tracked KBs after generic propagation; `validate-knowledge.sh` excludes
  higher-authority canonical blocks from generic site-text heuristics and no
  longer exits silently when an older KB lacks `llms-full-hash`. The runtime
  detector checks catalog ID/revision/hash/exact language set and the exact
  Sales KB block; its evidence fingerprint now includes both new source files.
- Safety wording: the pack directly affirms English, French, Japanese, and
  Spanish, links each localized page, refuses claims that the live Standard
  Path cohort is localized, and refuses any implication of translated ICF
  recognition.
- Independent review: Claude Sonnet 5/high R1 session
  `25d7fee1-4a9a-43da-8b0a-25d0f739b245` found one medium fail-closed defect
  plus two low coverage/hash issues: non-array `locales` could throw, Python
  malformed-shape coverage was incomplete, and TypeScript hashed decoded text
  rather than the raw catalog bytes. Codex corrected all three. Focused R2
  session `8336ab3a-8677-452e-ae59-bbbfdd33cb46` returned
  `NO MATERIAL FINDINGS`.
- Review usage: R1 was 4 model calls / 74,973 cache-create / 136,905
  cache-read / 20,526 output / 81,747 max context; R2 was 4 calls / 57,953
  cache-create / 131,642 cache-read / 7,688 output / 64,727 max context. Both
  stayed below bounded-review warning thresholds.
- Verification: Python sync/injection tests 5/5; TypeScript focused
  program-facts suites 29/29; idempotent injection/check across 13 KBs,
  typecheck, build, shell syntax, and diff check pass. Generic KB validation
  reaches the canonical-facts check and accepts both exact packs; its existing
  unrelated baseline still reports four stale/non-site prices, six taxonomy
  path strings, and a missing historical llms-full hash.
- Full root suite: 3,210 passed / 19 skipped / the unchanged CNPC
  source-wrapper literal failure.

### NC-20260824-007 — Community lifecycle shadow provider capture

- Date: 2026-08-24T19:35:00Z
- Owner/client: Codex
- State: ready_for_deploy after one load-bearing live correction; no provider/runtime
  mutation yet
- Branch: `codex/student-lifecycle-community-shadow-live-20260824`, based on
  exact live checkout-recovery release `ab3124a0312d459e287857d81a95246a6a591759`.
- Scope: Community stages 2-4 only: protected provider baseline, exact
  four-action manifest/catalog, disabled-first n8n relay, guarded runtime
  configuration, catalog/registry/reconciliation receipts, and sanitized
  transport duplicate/identity-hold proof.
- Excluded: Circle, seven non-core actions, legacy receiver cutover/deletion,
  lifecycle actions/messages/certificates, Encharge, Heartbeat user/group/course
  mutation, manufactured provider student events, and minion authority.
- Rebase safety: production advanced from lifecycle base `7364accd` to
  checkout-recovery release `ab3124a0` during preflight. The older verified
  lifecycle archive was rejected before deployment; this combined lineage
  preserves the concurrent migration 135/checkout-recovery work.
- Preflight: the main Community registration inventory still matches all 18
  protected rows exactly. n8n independently advanced to 25 workflows / 24
  active while the lifecycle target remains absent; active executions were
  zero. Protected n8n PostgreSQL/workflow/env/compose and NanoClaw
  lifecycle-PostgreSQL/SQLite/plist/env backups were verified.
- Review: prior bounded Claude Sonnet/high R1B returned
  `NO MATERIAL FINDINGS`. Fresh live-lineage R2 independently confirmed the
  checkout-recovery composition, idempotency conflicts, provider baseline,
  catalog lock, and inactive relay with `NO MATERIAL FINDINGS`; 10 calls reached
  110,334 maximum context tokens, a slight bounded-review threshold warning.
- Verification: lifecycle 83/83; disposable production-shape PostgreSQL 4/4;
  typecheck/build/format/continuity/capabilities/diff pass; full root 3,206 pass
  / 19 skip with only the unchanged CNPC wrapper-contract failure; runner
  43/43; toolbox 14/14 + 9/9 + 65/65.
- External effects: backups and read-only inventories only. No lifecycle
  workflow import, provider registration, secret/runtime configuration,
  catalog/event/action/message/certificate, legacy receiver, or Circle change.
- Inactive-import correction: n8n 2.9.4 rejected the reviewed 37-character
  workflow ID because its live column is `varchar(36)`. The target remained
  absent. Source now uses 34-character `student-lifecycle-community-shadow`,
  the static contract asserts the live limit, and toolbox commit `71f35cf`
  narrows the guarded ID validator with a passing regression. This correction
  passes 10 focused source tests, 10/10 toolbox contract tests, typecheck/build,
  and bounded Sonnet/high correction R3 with `NO MATERIAL FINDINGS` in four
  calls / 47,028 maximum context tokens and no warning.

### NC-20260824-006 — Durable abandoned-checkout shadow control

- Date: 2026-08-24T19:45:00Z
- Owner/client: Codex
- State: ready_for_deploy; implementation converged, provider deployment pending
- Commit/PR: `codex/checkout-recovery-shadow-20260824` from `a06b0549b6aa`; companion Tandemweb/toolbox branches remain isolated
- Change class: C3 host/provider/internal Slack shadow; no customer communication
- Affected systems: NanoClaw host/PostgreSQL/webhook/reaper/report/release; Tandemweb checkout producer/consent; n8n Stripe and website relay templates; shared Stripe toolbox
- Outcome so far: migration 135 adds separate admin-only recovery cases/aliases/events/receipts; strict HMAC website intake and fixed-account Stripe failure/expiry/completion handling converge out of order with purchase precedence; Tandem cases receive a 45-minute timeout, Heartbeat cases remain provider-event-only; one content-minimized Inbox projection and aggregate report explicitly state no customer message was sent.
- Review: Claude Sonnet/high plan review found two material omissions. Implementation review R1 then found terminal-precedence, archive-minimization, registry-evidence, and timeout-documentation issues. Codex fixed the three verified defects and clarified the false-positive registry claim; fresh correction R2 returned `NO MATERIAL FINDINGS`.
- Verification so far: checkout parser/signature/state/migration/n8n/config/webhook focused surface passes; disposable PostgreSQL store 3/3 passes after a clean migration chain; replay fails closed without changing the case fingerprint; populated rollback refuses; empty rollback succeeds; zero non-admin grants. The full NanoClaw suite passes 3,187 with 17 skips and only the unchanged CNPC wrapper-contract baseline failure; typecheck, build, format, capability, and diff checks pass. Tandemweb PHP lint, JS parse, regional/installment, JSON, and static shadow contracts pass; toolbox shell/registry/static contracts pass.
- Deployment/migration: migration 135 and exact merged release `7a36d79ca787…` are live after protected backup and a clean final three-pointer activation from the concurrently deployed `cf05bca3` student-lifecycle line. Tandemweb `0d09278fb`, shared toolbox discovery, the downstream-acknowledged retention-free website relay, and both durable five-event Stripe triggers are live.
- Rollback/recovery: isolated branches/worktrees only. Revert task commits; migration rollback is empty-only. Provider/runtime rollback will disable website and event ingress before any release rollback.
- Documentation: `docs/CHECKOUT-RECOVERY-CONTROL.md`, project map, migration README, structure-only schema, active work, and this entry.
- Live proof: one signed consent-denied non-customer canary returned HTTP 200 only after NanoClaw acceptance. Owner readback shows one Tandem `captured/denied/ineligible` case, zero shadow-ready/unnotified cases, and `customer_sends=false`. Exact release/source/artifact/Node, one listener, connected channels, empty queues, unchanged 273-line error baseline, provider event readback, and preserved concurrent student-lifecycle health pass. Evidence: `docs/reports/NC-20260824-006-CHECKOUT-RECOVERY-DEPLOYMENT.md`.
- Follow-ups: observe only the next natural eligible checkout and exact later-purchase suppression/owner projection. Do not manufacture a Stripe event, bulk-work history, or send recovery.

### NC-20260824-005 — Deploy Community student-lifecycle dark foundation

- Date: 2026-08-24T17:45:00Z
- Owner/client: Codex
- State: complete dark deployment; provider ingestion and natural lifecycle
  outcomes unvalidated
- Release: exact reviewed source
  `7364accd53aed9e1808dc0882592312a0e1ac5ae`, source tree
  `6601c60fda4294bf379ca31720c894e3d4158cdd`, 904-file artifact
  `4639355f…`, archive `162f05e2…`, Node 22.23.2.
- Backup/migration: mode-0700 PostgreSQL/SQLite/plist backup directory
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-005-20260824T1712Z`;
  migration 134 applied from the verified release. Seven tables remain empty,
  all 16 relations/sequences are admin-owned, non-admin grants are zero, and
  three triggers are enabled.
- Activation: a natural zero-work drain preceded migration/restart. Dry-run and
  applied activation changed only the two release environment pointers plus
  executable path and retained rollback plist
  `com.nanoclaw.plist.rollback-778545b353b2-2026-08-24T17-15-41-620Z`.
- Live verification: PID 24053, exact release/tree/artifact/code root, one
  listener, Gmail/Slack connected, zero waiting groups and Slack outbound
  backlog, unchanged 273-line error baseline. Existing natural work ran on the
  release without queue buildup or new errors.
- Dark boundary: `studentLifecycle.enabled=false`, `actionConsumers=false`,
  `circle=false`, zero lifecycle environment keys and rows. No n8n import/
  activation, Heartbeat or legacy receiver change, Circle access, credential,
  lifecycle action/message/certificate, manufactured event, or minion change.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260824-005-student-lifecycle-community-dark-deploy.md`.

### NC-20260824-004 — Community student-lifecycle dark foundation

- Date: 2026-08-24T16:10:00Z
- Owner/client: Codex
- State: complete; local implementation, full verification, Claude convergence,
  commit, and push complete
- Commit/PR: `9155ad9d` plus formatting-only `7364accd`, pushed on
  `codex/student-lifecycle-dark-foundation-20260824` from verified-live
  `778545b3`
- Change class: C2 local source/schema design; highest future operational class
  remains externally gated
- Authority: accepted Community-only decision; Circle and all production,
  provider, deployment, credential, action, message, certificate, and minion
  boundaries remain excluded
- Implementation: ordered migration/rollback 134; seven admin-only lifecycle
  relations and two aggregate views; pure Community parser/minimizer/HMAC/
  projection contract; deterministic store and exceptions; fixtures-only
  reconciliation; dedicated default-off bounded webhook; mechanical reaper;
  inactive credential-reference n8n template; release packaging and authority
  documentation.
- Claude plan review: Sonnet/high R1 found four material gaps. The reconciled
  plan adds the reconciliation runner, archives before identity lookup, enforces
  a streaming 64 KiB limit, and proves reaper replay never reaches group/agent
  dispatch.
- Verification: focused 129/129; disposable store integration 2/2;
  migration apply, zero non-admin grants, empty rollback, reapply, and populated
  rollback refusal pass; typecheck/build/format/continuity/capability/diff pass;
  full suite 3,161 pass / 14 skip with only the unchanged pre-existing CNPC
  wrapper-contract failure.
- Claude implementation review: Sonnet/high R1 confirmed HMAC/body-bound order,
  privacy minimization, no-agent paths, migration/rollback/privileges, n8n
  parity, and Community-only fail-closed controls. It found a P1 unstable
  ABANDONED_CART/MENTION redelivery key and P2 relay/identity secret coupling.
  Corrections now use content/window-derived keys and a distinct host-only
  identity secret. Sonnet/high correction R2 returned `NO MATERIAL FINDINGS`;
  focused and full gates retain the same result.
- Deployment/migration: separately recorded as `NC-20260824-005`. The n8n
  export remains inactive/unimported and provider/Circle boundaries remain off.
- Rollback/recovery: source commits are pushed; production rollback belongs to
  the separately recorded dark deployment.
- Documentation: implementation plan/design/review artifacts, project map,
  webhook reliability, security, structure-only schema, active work, and this
  entry.
- Follow-ups: provider activation remains under the broader separately gated
  control-plane release; Circle remains under its own candidate only after
  Community readiness and a new owner authorization.

### NC-20260824-001 — Human-first internal Slack notifications

- Date: 2026-08-24T13:20Z
- Owner/client: Codex
- State: ready_for_deploy; independently reviewed and not yet deployed
- Authorization: accepted owner instruction and
  `decision:human-first-slack-notifications` authorize this presentation-only
  implementation and normal reviewed release.
- Trigger: Contador payment notifications led with `(v3-debug)` account-key
  fallback metadata, while Inbox received opaque Chaos/form slugs and CRM
  dispositions before any explanation of what happened.
- Implementation: Contador now leads with customer, product, and amount, then
  keeps processing results, Stripe identity, and optional diagnostics below.
  Chaos activity maps the already-computed disposition to a human heading and
  uses the bounded intent summary or conservative form/page wording before the
  CRM Party line. The adjacent verified-form notification now describes the
  form action before page/identity detail. Payment/fulfillment mechanics,
  lead classification, routing, customer communication, provider state,
  schema, schedules, and credentials are unchanged.
- Bounded audit: booking, dead-letter, send-failure, and scheduled-task alerts
  already lead with their outcome and were left unchanged. The verified-form
  ping was the only adjacent instance of the same slug-first defect included
  in this release.
- Independent review: the first Sonnet 5/high review was stopped without a
  verdict after 13 model calls and a 110,723-token maximum context exceeded the
  bounded target. A fresh changed-lines-only Sonnet 5/high review session
  `a5129d53-9db5-492b-8904-89bbe06c71bc` completed in four calls at a 56,227
  maximum context and returned `NO MATERIAL FINDINGS`; one raw-subtype
  diagnostic-log correction was noted as non-blocking.
- Verification: Node 22.23.2 focused notification/host regression 105/105,
  typecheck, build, CommonJS syntax, diff check, and documentation continuity
  pass. Full root suite is 3,088 passed / 12 skipped / the unchanged CNPC
  wrapper-literal failure.
- Evidence:
  `docs/reports/NC-20260824-001-CLAUDE-REVIEW-RESPONSE-R1B.md`.

### NC-20260823-006 — Durable Contador payment-fulfillment cases

- Date: 2026-08-24T03:35Z
- Owner/client: Codex
- State: deployed_unverified; migration and host boundary live-verified,
  natural payment/refund outcome pending
- Authorization: accepted
  `decision:contador-fulfillment-case-ledger-authority` for the C4
  implementation and normal reviewed release. Historical replay/repair,
  manufactured Stripe events, customer communication, accounting/QuickBooks/
  payable work, product-ID mapping, payer/student redesign, schedules, and
  credentials remain excluded.
- Gap: `webhook_inbox` previously became handled after a successful child exit
  even when Payment Log, roster, or PostgreSQL stages were only error strings
  in the summary. Slack was presentation, not ownership or closure.
- Implementation: migration 133 creates one admin-only current case per Stripe
  account/payment-intent pair plus append-only opaque aliases and minimized
  stage receipts. Host admission precedes external writes; exact Payment Log,
  `public.payments`, and mapped-roster readback is required for completion.
  Missing identity/product, write failures, and refunds become durable owned
  exceptions. Complete replay skips external writes and webhook handling binds
  the exact case/version.
- Independent review: initial Claude Sonnet 5/high session
  `de963310-c9aa-44ff-ac83-0833508359d5` found one material concurrency defect:
  the admission transaction lock ended before the processor, permitting a
  second delivery to run another child and invalidate the first version. Codex
  fixed it with a five-minute persisted lease, retryable `inFlight` refusal,
  expired-lease version takeover, and exact lease-token finalization. Narrow
  correction session `ab45e390-129a-421c-a571-ad74c4bca24f` returned
  `NO MATERIAL FINDINGS`.
- Review usage: interrupted first round 19 calls / 38 input / 121,382
  cache-create / 1,657,061 cache-read / 16,978 output / max context 129,948,
  with a bounded-context warning; correction round 6 calls / 12 input / 97,052
  cache-create / 270,604 cache-read / 24,702 output / max context 97,054,
  with no warning.
- Privacy/authority: no names, email, product text, amount/card data, raw
  webhook, Slack content, or accounting facts enter the ledger. Bizmgr remains
  accounting owner and QuickBooks stays manual.
- Live read-only baseline: 249 Stripe inbox rows (248 handled, one dead-letter)
  and 261 public payment rows; target tables absent. A separate existing
  `payments.cohort` source/migration drift is explicitly out of scope.
- Verification: focused 115/115; typecheck, build, both CommonJS syntax
  checks, and independent agent-runner build/43 tests pass. Full root suite is
  3,081 passed / 12 skipped / the unchanged CNPC wrapper-literal failure.
  Schema-only production-shape rehearsal proves three tables, zero non-admin
  grants, append-only receipts, empty rollback, and populated rollback refusal.
  No production schema/event/provider/business mutation occurred.
- Release preflight: the first `d46d52dc…` archive verified its own manifest
  but omitted migration 133 because the builder's explicit migration allowlist
  stopped at 132. The production `psql` step failed before opening the file, so
  no schema or service state changed. `build-release.mjs` now packages both 133
  files and the migration contract test asserts their exact paths; deploy only
  the replacement commit/artifact.
- Release: exact replacement commit
  `b131071c74fcaa5395e40b31e45f7f1a886db481`, source tree
  `2ac5a754f01070376d287b937a0ff7e3c457458d`, 892-file artifact
  SHA-256
  `d1f7adf3504b02c1d3a563b4aa587c539fe590a30a99b920fbcb213d2721f373`,
  archive SHA-256
  `6c66db75900b5a31c18d8ddc74fdf6c44c6a2c64525799a3db3a7d45c4e4b764`.
  Fresh local/Mini verification proves Node 22.23.2 and both exact migration
  files in the archive.
- Backup/migration: protected backup directory
  `~/.local/share/nanoclaw-deploy-backups/NC-20260823-006-20260824T0403Z`
  contains custom-format PostgreSQL, WAL-safe SQLite, and both launchd plists.
  SHA-256 values are respectively `5aa8c34c…`, `7e5f1e55…`, `aa613c45…`,
  and `f3e57f38…`. Migration 133 applied after a natural zero-work drain; all
  three tables/sequences are owned by `nanoclaw_admin`, aliases/receipts have
  enabled append-only triggers, non-admin grants and rows are zero.
- Deployment: fast/main activations changed only three release pointers and
  retained rollback plists
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-24T04-28-04-019Z`
  and
  `com.nanoclaw.plist.rollback-195dd3b3664a-2026-08-24T04-28-05-067Z`.
  PID/listener converged to 87358; exact release/tree/artifact/code root,
  Gmail/Slack, and empty containers/queues pass. Main/fast error baselines
  remain 273/24. Protected payment/Stripe-inbox aggregates remain 261/249 with
  248 handled, one historical dead-letter, and zero active rows.
- Outcome boundary: no historical or manufactured Stripe event was processed.
  The new case/alias/receipt tables remain empty; the first natural typed
  payment/refund and its downstream complete/held readback remain the outcome
  gate.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260823-006-contador-payment-fulfillment-cases.md`.

### NC-20260822-011 — Host-owned Gmail attachment processing

- Date: 2026-08-23T20:18Z
- Owner/client: Codex
- State: deployed_unverified; release and host boundary live-verified, natural
  provider outcome pending
- Authorization: accepted
  `decision:gmail-attachment-processing-authority`; no manufactured customer
  email, broad mailbox scan, customer reply, accounting action, schedule,
  credential, or unrelated production write is authorized.
- Implementation: exact authorized `gmail_read` now keeps Gmail attachment IDs
  and bytes host-private while enforcing MIME depth/count, decoded item/message
  size, magic/type, archive, encryption, OCR-page, extraction-output, and
  temporary-retention bounds. SHA-256 and minimized SQLite receipts record
  terminal ready/held outcomes without raw bytes or extracted content.
- Extraction: shared text/PDF/Office/ODF/iWork conversion plus bounded image and
  scanned-PDF OCR. Missing converters and unsupported, encrypted, suspicious,
  malformed, or oversized content end in explicit held states. Five receiving
  groups now treat a required held attachment as unfinished work.
- Independent review: Claude Sonnet 5/high session
  `c98a5b20-c5a2-4246-b024-778775f54b34` found one high and two medium/low
  material defects: malformed/encrypted ODF could be marked ready, ZIP
  inspection rejection could strand a downloading receipt, and absent Gmail
  reported size could bypass the message limit. Codex reproduced and corrected
  all three. Focused correction session
  `5bcb8160-4a61-49e4-b175-ce1364f18383` returned
  `NO MATERIAL FINDINGS`.
- Review usage: first round 12 model calls, 24 input, 137,646 cache-create,
  893,021 cache-read, 36,666 output, maximum context 137,648; correction round
  8 model calls, 16 input, 59,238 cache-create, 370,922 cache-read, 7,764
  output, maximum context 67,804. The first audit warns that the bounded review
  context threshold was exceeded; the correction audit has no warning.
- Verification: pinned Node 22.23.2; focused attachment boundary 170/170;
  focused Gmail/API/IPC/channel/Slack regression 284/284; typecheck and build
  pass; independent agent-runner build and 43/43 tests pass. Full root suite is
  3,050 passed / 12 skipped / the unchanged unrelated CNPC wrapper-literal
  failure.
- Release: exact commit `195dd3b3664a63651db16256b247ee7cda5a4a97`,
  source tree `14f2d87bcf918c8a1f3a1eddfa9d705a5bb71559`, 884-file
  artifact SHA-256
  `b4b8b0ac989502a7e8f83cd9ecc7a03ec15976489c1e4d15e4ddd785a146745f`,
  archive SHA-256
  `b27463e7e68aad8938c36e1622544852192acab68ba9ecdd8145c33f83cfbf65`.
  Fresh local and Mini extraction verified the same release under Node
  22.23.2.
- Runner/dependencies: the prior `nanoclaw-agent:latest` is retained as
  `nanoclaw-agent:rollback-NC-20260822-011-195dd3b3`; the rebuilt image is
  `sha256:ed06f269df3adbf2a87e04053ed384190cd3d39e8d351037bf2be0a0753f572c`
  on Node 22.23.2. Eighteen per-group runner snapshots match source hash
  `52cc140dfdbd163f7b37db703b9d9f27`; their mode-0600 backup SHA-256 is
  `1098d8f4ef747e9c78d1e0b5427cb3690d945c8455b1cef95894cb6b2c197cd7`.
  The host has Tesseract 5.5.3, Poppler 26.03.0, and markitdown 0.0.2.
- Deployment: zero active containers, waiting groups, outgoing messages, or
  executable pending-send states preceded backup and activation. The WAL-safe
  SQLite backup passed `quick_check` with SHA-256
  `11bd390d8a001febf66ce490732d40be87b96fec1a6f752b96b7b53314f9a0ea`;
  the plist backup SHA-256 is
  `8ad75cccb312b9bc5274aaab0dfc90eb6da3d16eb7d8d74421fbc9452b52c38d`.
  Fast/main activations changed exactly three release pointers and retained
  rollback plists
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-24T01-09-11-008Z`
  and
  `com.nanoclaw.plist.rollback-d4f428912679-2026-08-24T01-09-12-816Z`.
- Live verification: PID 82252 is the sole `:8088` listener; health reports the
  exact commit/tree/artifact/code root, Node 22.23.2, connected Gmail/Slack,
  and empty containers/queues. The attachment table and message index are
  structurally present, `quick_check` is clean, receipt count remains zero,
  and main/fast error-line baselines remain 273/24. No Gmail attachment was
  downloaded or processed for deployment proof; the next natural supported and
  held receipts remain the outcome gate.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260822-011-gmail-attachment-processing.md`.

### NC-20260823-005 — Sequential healer expansion pilot

- Date: 2026-08-23T22:33Z
- Owner/client: Codex
- State: complete; all three sequential sources terminal and live-verified
- Authorization: accepted
  `decision:self-healing-sequential-expansion-pilot`; concurrency remained
  `MAX_ITEMS=1` and sources rotated only after terminal replay.
- Source-one implementation: `killOnTimeout` now logs expected post-output
  cleanup at info while preserving error logging and error result for a true
  no-output hard timeout. Stop commands, durations, and lifecycle state are
  unchanged. Tests cover both branches.
- Independent review: Claude Sonnet 5/high session
  `ca3bcffa-9278-45a1-8ea7-631f197d2068` returned
  `NO MATERIAL FINDINGS` in one bounded round. Usage was 5 model calls, 10
  input, 84,751 cache-create, 247,866 cache-read, 14,681 output tokens,
  maximum context 93,317, cost $0.8031108.
- Verification: focused 86/86, typecheck, documentation continuity,
  agent-runner build and 43/43 tests pass. Full suite is 3,021 passed / 12
  skipped / the unchanged unrelated CNPC wrapper-literal failure.
- Release: exact commit `d4f4289126797b07dd3731ff6bffe755ef2277bd`,
  source tree `a9e2928a4cf126efd9a6c68a466a59b78a992393`, 880-file artifact
  SHA-256 `fe8ceefce60e2ca507f3676dba7dbe37db320765f2364e1c23500b197387d79f`,
  archive SHA-256
  `e6f3a189b01809a58301e30bb4f8e3ee125d14fe94a1d4498a0814f50e21b7c8`.
  Local and fresh Mini runtime verification pass under Node 22.23.2.
- Deployment: fast/main activations changed only three release pointers and
  retained rollback plists
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T22-12-00-255Z`
  and `com.nanoclaw.plist.rollback-883f375f5ceb-2026-08-23T22-12-01-938Z`.
  PID/listener/health/code-root converge; Gmail/Slack are connected, queues are
  empty, and main/fast error logs remain 273/24.
- Source one result: config backup
  `.env.rollback-company-healer-work-2026-08-23T22-12-38-647Z`; reviewed
  release bound as remediation; internal correction receipt posted; source
  `resolved/verified_fixed`; work completed version 2 with 3 observations / 3
  events / 1 receipt; replay duplicate-only.
- Source two result: config backup
  `.env.rollback-company-healer-work-2026-08-23T22-23-53-241Z`; tracked/live
  `ipc-turn-policy.ts` SHA-256
  `027c092b22169eb3382038a503120118aadde28584bbd565af9f3ac9b5a2d974`;
  runner build/tests green; no recurrence; identical terminal receipt/replay.
- Source-three finding: `procurement-caleprocure-collector` is enabled daily at
  08:00 CT while collector/ingest/review flags are all off, so it fails by
  design. Historical deterministic-collector three-shadow evidence remains
  incomplete. Proposed decision `decision:caleprocure-safe-disabled-state`
  keeps gates off and disables only the contradictory job. No schedule or gate
  changed before owner acceptance.
- Source-three accepted outcome: the owner accepted
  `decision:caleprocure-safe-disabled-state`. Pre-change registry SHA-256
  `526e253bee05a1edeafdf648dc934dcb7921882da3fb27f78f44949d7235e324`
  is retained in mode-preserving backup
  `data/jobs.json.rollback-caleprocure-safe-state-2026-08-23T19-10-21-CT`.
  The release-owned helper changed only the target job to disabled; the
  projects-plus-other-jobs hash remained
  `e370f5c24cfac0e4acd61fff714bd235cf71f96186f512a7946af446c07fcf86`.
  Registry and SQLite scheduler both read disabled; cron/timezone/timeout are
  unchanged; collector, ingest, and review flags remain off.
- Source-three receipt: allowlist backup
  `.env.rollback-company-healer-work-2026-08-24T00-12-12-795Z`; incident
  `563146` records named `proposal_rejected` by Alex Kudinov and remains
  truthfully `wont_fix`, not successful. Company Work is completed version 2
  with two observations, three events, and one bound
  `healer_named_decision` receipt. Replay returned one duplicate with no write
  or error.
- Final aggregate: catalog is 133 pending / 12 verified fixed / 1 decided
  no-action. All four admitted healer work items are terminal; main/fast error
  logs remain 273/24 and service/channel/queue health is unchanged.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260823-005-sequential-healer-pilot.md`.

### NC-20260823-004 — Resolve the first healer item and bound expansion

- Date: 2026-08-23T21:25Z
- Owner/client: Codex
- State: complete; source and Company Work closure live-verified
- Change class: C3 exact production incident/Company Work correction; no code,
  migration, schedule, credential, customer, or second-source change
- Authorization: accepted decisions
  `decision:self-healing-first-resolution-remediation` and the exact
  operator-diagnostic suppression addendum.
- Diagnosis: incident `563834` / `healer:16963ebd92091e9f` came from a one-off
  Node `[eval1]` SELECT using nonexistent singular `work_type`; it was not a
  NanoClaw runtime query or missing migration. Current source has no singular
  reference, current contracts use `workflow_type`/`work_types`, and the event
  occurred once with no recurrence.
- Remediation: rejected the generic Knex/Prisma command, wrote a guarded
  content-minimized correction with `operator_verified_recovery` and
  `command_ran=false`, disarmed the stale proposal, and posted one correction
  receipt to its existing internal thread. No remediation command ran.
- Live closure: the existing six-minute verifier recorded
  `resolved/verified_fixed`; the one-source adapter transitioned the same work
  item to `outcome_validated/completed` version 2. Durable state is three
  observations, events `accepted,blocked,outcome_validated`, and one bound
  `healer_verified_recovery` receipt. The next cycle returned one duplicate,
  zero transitions/observations, and no error.
- Verification correction: Codex's first receipt SELECT used nonexistent
  `to_version`, emitting one operator `[eval1]` JSONL error but no database
  write. Read-only parsing proved pending bytes `30043084..30059871` contained
  exactly fingerprint `d93dec4d0d90a53c` and no other error. The source log was
  preserved; a guarded cursor compare-and-swap plus unique suppression receipt
  prevented a fabricated second incident/Slack alert. Error-line counts remain
  273 main / 24 fast.
- Expansion analysis: 146 current catalog items contain 136 pending decisions,
  104 older than seven days, 64 generic daemon sources, and 27 legacy
  `wont_fix` rows without named receipts. Only five pass the initial recent,
  non-daemon, high/medium-confidence root-cause admission filter.
- Recommendation: retain `MAX_ITEMS=1` and rotate sequentially after terminal
  receipt/replay. First fix `healer:d0ca940a103136d3` (46-occurrence expected
  timeout cleanup logged as error), then verify the one-occurrence Chief sync
  race, then separately decide whether to enable the CaleProcure feature flag.
  No expansion was activated.
- Evidence:
  `docs/programs/company-os/evidence/NC-20260823-004-first-healer-resolution.md`.

### NC-20260823-003 — Present one healer exception to Chief

- Date: 2026-08-23T15:24Z
- Owner/client: Codex
- State: complete; one packet/pickup/attempt live-verified
- Change class: C3 internal Slack presentation and Chief pickup/attempt
- Authorization: accepted decision
  `decision:self-healing-owner-presentation-canary` permits one bounded daemon
  restart and one existing-loop packet/attempt for the sole healer work item.
- Boundary: no second source, repeated manual trigger, remediation, source
  correction, customer communication, schedule, credential, or unrelated write.
- Result: one bounded restart kept exact release `d39bc073…` healthy and the
  startup exception tick posted one healer work packet while suppressing two
  unchanged packets. One Chief container picked it up and completed one bounded
  attempt.
- Durable receipt: exactly one healer dispatch is
  `attempted/1/posted`; append-only events are exactly
  `posted,picked_up,attempt_succeeded`. The work remains
  `accepted/blocked/1` with one minimized observation—attempt is not source
  correction or remediation.
- Non-interference: zero failed attempts, zero waiting/outgoing queue, no second
  healer item, no new daemon error lines, and no source/customer/schedule/
  credential mutation.
- Evidence: `docs/programs/company-os/evidence/NC-20260823-003-healer-owner-presentation.md`.

### NC-20260823-002 — Prove one bounded natural healer projection

- Date: 2026-08-23T15:02Z
- Owner/client: Codex
- State: complete; deployed and one natural source live-verified
- Change class: C3-capable production source/write path constrained to one
  internal Company Work projection; no message or remediation authority
- Authorization: accepted decision
  `decision:self-healing-bounded-natural-projection`; program item
  `work:self-healing-bounded-natural-projection` claimed at revision 38.
- Finding: the live read-only catalog contains 146 current incidents—137
  pending decisions and nine verified recoveries. The current boolean adapter
  gate would apply the whole catalog, so enabling it is unsafe.
- Planned result: exact-source allowlist, maximum-one cap, default-off host-cycle
  wiring, content-free health, dark release, then one natural projection plus
  exact replay/report/non-interference receipts.
- Boundary: no second source, manufactured incident, Slack post/presentation,
  remediation/action, schedule, credential, or unrelated external mutation.
- Implementation: disabled mode performs no catalog read. Active mode requires
  exactly one valid `healer:<fingerprint>` and `MAX_ITEMS=1`; missing or invalid
  source fails before a transaction. The fast cycle logs only aggregate status
  and cannot be failed by projection. Direct healer execution verifies an
  immutable release when a release identity is configured.
- Operations: release-bound helpers provide value-redacted `.env` dry-run/
  apply/restore and a separately locked fast-healer plist activation with exact
  Node/bundle verification, backup, atomic reload, rollback, and one clean-cycle
  receipt.
- Verification: focused controls 58/58; healer/report 284/284; pinned Node
  22.23.2 typecheck/build, formatting, continuity, script syntax, and diff
  checks pass. After the review correction, the focused catalog/adapter/ledger/
  projection set passes 31/31, the healer suite passes 241/241 with two skips,
  and the full suite is 3,020 passed / 12 skipped / one unchanged CNPC
  wrapper-literal failure.
- Dark activation attempt 1: main daemon activation to exact `0ddb8794` passed.
  The fast-healer target verified and one disabled cycle exited zero, but the
  new helper compared launchd's reset post-load `runs=1` with predecessor
  `runs=6489`, timed out, and automatically restored the prior plist. No
  projection/configuration occurred. The helper now accepts one or more clean
  post-load runs while still requiring idle state and exit zero.
- Corrected release: commit `d39bc0733e2d6840f69a43361c654b7734973170`,
  source tree `2bb0413c17b62caa7b32c1903db24441504a7306`, unchanged
  880-file artifact SHA-256
  `e0a27abc075cd6924cebb9f153af86e1291958aa08e420043adb8e02df12459a`,
  archive SHA-256
  `6b4f082e3322964308c5450ca04af2a511d52572d82adebbf192a332f2ed769c`.
- Deployment: main activator retained rollback to `0ddb8794`; corrected
  fast-healer activator retained
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T15-17-25-731Z`.
  Its first disabled target cycle exited zero. Value-redacted config dry-run/
  apply then created backup
  `.env.rollback-company-healer-work-2026-08-23T15-17-48-670Z` and enabled one
  exact natural source with `MAX_ITEMS=1`.
- Natural proof: source `healer:16963ebd92091e9f` was selected from the live
  catalog by opaque identity/status only; no diagnosis or solution text was
  read. Cycle one created one `accepted/blocked` item, one minimized
  observation, and two versioned events. Cycle two returned exact replay with
  counts unchanged. The bounded report shows one attention item with blocked/
  stale reasons and no contradictory state, event gap, missing receipt, or
  source gap.
- Non-interference: non-healer items/events remain exactly 25/164 with hashes
  `f33bc212ff651de5ca4008492d4333ff` and
  `5dcba1f05ba82584b6ed4e3f314b6e20`; receipts remain 76. Main release health,
  Gmail/Slack, outgoing/active/waiting queues, and fast-healer exit are healthy;
  main/fast error logs remain 273/24 lines. No second source, manufactured
  incident, Slack post/presentation, remediation/action, schedule, or
  credential change occurred.
- Evidence: `docs/programs/company-os/evidence/NC-20260823-002-bounded-healer-projection.md`.
- Review closure: the updated token-rotation runner selected the fallback
  account and completed bounded Claude Sonnet/high session
  `517ad838-cac3-41b6-bee0-20de63c971b6`. It found one high material defect:
  raw stale `decision_actor` metadata on an incident that re-entered monitoring
  could violate the ledger's actor/disposition invariant and wedge the one
  configured source. Codex independently verified the finding, gated the hash
  on `decided_no_action`, added the required recurrence regression, and reran
  focused/full verification. Targeted Sonnet/high correction review session
  `5f305047-a927-48ed-80e8-2dc3508fdc1f` returned
  `NO MATERIAL FINDINGS`. Review artifacts are
  `docs/reports/NC-20260823-003-CLAUDE-BOUNDED-REVIEW-RESPONSE.md` and the paired
  correction request/response.
- Final release: commit `883f375f5ceb8ab9c357ce16499cc2ddf9f7511f`,
  source tree `dc44be31bbbe412c0f00f2ae8780aba99ae86ac1`, 880-file artifact SHA-256
  `98592441bd9ae04174604433d3221c3f93391afaf421b2a5b30248262090c100`,
  archive SHA-256
  `e4c64391d16169f3342f38811adabf17526ea3e3848be3a2deb66d55ab4e1a80`.
  The archive verified locally and from a fresh Mini extraction on Node 22.23.2.
- Final deployment: fast-healer activation changed only its three release
  pointers, retained
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T20-06-41-634Z`,
  and verified a clean cycle. Main activation waited for a natural zero-work
  drain, changed only its three release pointers, and retained
  `com.nanoclaw.plist.rollback-d39bc0733e2d-2026-08-23T20-17-04-146Z`.
  PID 20493, the port-8088 listener, launchd, `/health`, release root, and Node
  identity all converge on `883f375f…`; Gmail/Slack are connected and active,
  waiting, and outbound queues are empty. Error-log counts remain 273 main / 24
  fast.
- Final live proof: the latest natural fast cycle selected exactly one source
  and returned one duplicate with zero transitions, observations, or errors.
  The database remains exactly 1 healer item / 1 observation / 2 events, with
  the original `accepted/blocked/1` state and `attempted/1/posted` Chief
  dispatch plus `posted,picked_up,attempt_succeeded`. No Company Work item,
  event, or healer observation was recorded after the main activation boundary.

### NC-20260823-001 — Deploy dark healer-resolution schema and host release

- Date: 2026-08-23T14:10Z
- Owner/client: Codex
- State: complete; deployed and live-verified dark, adapter disabled
- Change class: C3 production schema/service release; adapter remains disabled
- Authorization: accepted owner decision
  `decision:self-healing-resolution-dark-deploy` authorizes commit/push,
  immutable release construction, affected-state backup, additive migration
  132, exact host activation, and structural/non-interference verification.
- Boundary: keep `COMPANY_HEALER_WORK_ENABLED=0`. Do not project live healer
  incidents, post Slack, present owner work, execute remediation/actions,
  change schedules, rotate credentials, or enable another capability.
- Planned evidence: reviewed commits, archive/tree/artifact digests, fresh
  extraction verification, production preflight/drain, affected PostgreSQL and
  service rollback receipts, exact migration/permissions/trigger readback,
  activator dry-run/apply output, `/health`, listener/channel/queue/log checks,
  and protected Company Work aggregate comparison.
- Commits/push: implementation `e7ddaf9e`; deployment authority/continuity and
  exact release commit `97026492b85e1fe86ea9387d2bb3c9dc74019546`; branch
  pushed to `origin/codex/self-healing-visible-resolution-20260823`.
- Artifact: source tree
  `f8e9ddb4f4d4338f7eb7f537a00876aeb20b01ad`; 876-file compiled artifact
  SHA-256 `fe170e94ceca79cd3b67f9a8bd5bd1fd6a32811000c554d475710aa073d09fc3`;
  archive SHA-256
  `c840ee53a8157534c2337e8fe5c592e28f35d3d4ccfc0f4951848ac6556c44d0`.
  Fresh local and Mini extraction/runtime verification passed under Node
  22.23.2.
- Preflight: prior exact release `1f474f90` was healthy with one listener,
  Gmail/Slack connected, zero active containers/waiting groups/active approved
  sends, empty outgoing Slack queue, SQLite `quick_check=ok`, adapter disabled
  or absent, migration 132 absent, and zero healer work.
- Backup/migration: mode-0600 backup
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260823-001-20260823T141637Z`
  retains a valid custom-format `business_v2` dump SHA-256
  `f28c21f8b5381331b56b1b01e5a25057728fdf110238c2329ccb53f521051acc`
  plus prior plist SHA-256
  `1c2b8494df435c9bcfc4e76828f046b5236eabdffb1c7e05729cfdaa970a5743`.
  Exact migration 132 then produced one empty admin-owned observation table,
  one enabled append-only trigger, zero non-admin grants, and zero healer items.
- Activation: dry-run named exactly `NANOCLAW_CODE_ROOT`,
  `NANOCLAW_EXPECTED_RELEASE_COMMIT`, and `ProgramArguments.1`. One applied
  transaction retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-1f474f908484-2026-08-23T14-17-15-477Z`
  and converged to PID 83080 on exact release `97026492…`.
- Independent live proof: release mode/manifest/code-root/Node identity all
  match; one TCP listener; Gmail and Slack connected; zero active containers,
  active queue, waiting groups, outgoing Slack queue, or active approved sends;
  SQLite `quick_check=ok`; Company Work exception loop has zero consecutive
  failures; error-log line count remained 273. The release-owned
  `healer_resolution` report returns zero rows/exceptions. Migration 132 remains
  empty/admin-only/append-only with zero non-admin grants.
- Non-interference: protected Company Work stayed exactly 25 items / 164 events
  / 76 receipts with hashes `f33bc212ff651de5ca4008492d4333ff`,
  `5dcba1f05ba82584b6ed4e3f314b6e20`, and
  `b81eb8e144fa274d5f7421e16ac0d4e2` before migration, after migration, and
  after activation.
- External effects: additive migration 132 and exact host release only. No
  healer incident projection, owner-work presentation, Slack post,
  remediation/action, schedule, credential, or adapter activation occurred.

### NC-20260822-017 — Add dark healer-resolution Company Work schema

- Date: 2026-08-23
- Owner/client: Codex
- State: ready_for_deploy committed schema/adapter milestone; not deployed
- Commit/PR: committed `e7ddaf9e` on
  `codex/self-healing-visible-resolution-20260823`; not yet pushed or deployed
- Change class: C3-capable schema source kept dark; no live mutation
- Outcome: ordered migration/rollback 132 add the truthful
  `healer_resolution` workflow, `healer_resolution_receipt` completion, and an
  append-only minimized observation table. Stored fields are opaque identity,
  catalog version, resolution/evidence hashes, disposition, decision code,
  explicit owner key, hashed named-decision actor, and timestamps only.
- Recovery: rollback refuses when any healer work item or observation exists;
  it never deletes or truncates history. Empty rollback restores the exact
  migration-125 workflow/completion constraint set.
- Release boundary: migration and rollback paths are included in immutable
  release construction.
- Adapter/report: a healer-specific host writer defaults off, is absent from
  daemon/scheduler/Slack/action wiring, updates changed blocked evidence,
  refuses anonymous no-action closure, emits exact verified or hashed named-
  decision receipts, and reopens recurrence. The shared Company Work report
  validates healer event/receipt/observation consistency and exposes a bounded
  `healer_resolution` filter.
- Verification: pinned Node 22.23.2; healer 26 files / 230 tests; focused
  ledger/report set 86/86; typecheck, production build, formatting, and diff
  checks pass. Disposable PostgreSQL proves open, exact replay, changed-
  evidence update, verified close, recurrence reopen, named no-action close,
  append-only refusal, zero non-admin grants, populated rollback refusal, and
  empty rollback success. The broad suite passes 3,009 tests with 12 skips;
  its only failure is the unchanged base CNPC wrapper-literal assertion.
- Review finding: the database rehearsal caught and repaired an invalid
  PostgreSQL `{0,499}` regex bound plus observation/event idempotency mistakes
  that the static migration tests did not expose.
- Evidence: `docs/programs/company-os/evidence/NC-20260822-017-healer-company-work-adapter.md`.
- Remaining: owner-authorized dark migration/service deployment continues under
  `NC-20260823-001`. Adapter activation, live projection, presentation, and
  remediation remain separately gated.

- 2026-08-23T14:12Z addendum: owner-authorized deployment continues under
  `NC-20260823-001`; local state advances to `ready_for_deploy` at commit
  `e7ddaf9e`. No production mutation had started at this boundary.
- 2026-08-23T14:18Z addendum: migration 132 and exact release `97026492b85e`
  are live and independently verified dark under `NC-20260823-001`. NC-017 is
  complete at its stated boundary; live projection and activation remain
  separately unauthorized.
- Deployment: none; no production/provider read or write, projection, message,
  action, configuration, restart, or external state change.

### NC-20260822-016 — Plan truthful healer-to-Company-Work projection

- Date: 2026-08-23
- Owner/client: Codex
- State: ready_for_review local dry-run candidate; not deployed
- Commit/PR: `codex/self-healing-visible-resolution-20260823` after read-only
  checkpoint `6703de6e`; implementation commit pending
- Change class: C2 reversible internal source; no database or runtime mutation
- Finding: current Company Work workflow and completion constraints cannot
  represent individual healer-resolution decisions. Reusing Sales, host-job,
  or program-facts semantics would make identity, report, and closure receipts
  false. The existing core item also has no general owner field.
- Outcome: a pure projection contract declares the future
  `healer_resolution` / `healer_resolution_receipt` schema and plans stable
  ensure, update, reopen, verified close, named-no-action close, verification
  hold, and no-op operations. It binds only catalog identity, resolution
  fingerprint, normalized decision block code, explicit unassigned owner, and
  closure condition.
- Safety: exact replay is no-op; changed evidence updates the same source; a
  terminal item reopens on recurrence; monitoring never closes decision work
  without verified evidence. The CLI has no apply flag and no ledger writer is
  imported or wired.
- Verification: focused projection/CLI tests pass 9/9; complete healer suite
  passes 24 files / 218 tests; pinned Node 22.23.2 typecheck and production
  build pass; documentation continuity and diff checks pass. Broad suite passes
  2,993 tests with ten skips; its sole failure is the unchanged base CNPC
  wrapper-literal assertion.
- Deployment/migration: none. Migration, observation persistence, owner source,
  decision receipts, report support, default-off adapter, PostgreSQL rehearsal,
  deployment, and activation remain separate.
- Documentation: self-healing completion authority, project map, active work,
  `docs/programs/company-os/evidence/NC-20260822-016-healer-company-work-plan.md`,
  and this entry.

### NC-20260822-015 — Expose hidden healer resolutions as a read-only catalog

- Date: 2026-08-23
- Owner/client: Codex
- State: ready_for_review local candidate; not committed or deployed
- Commit/PR: isolated branch
  `codex/self-healing-visible-resolution-20260823`, based on exact live release
  `1f474f90848452969e1e49db8c976f3f3b3d74e3`; implementation commit pending
- Change class: C2 reversible internal source; highest affected operational
  class remains C5 because the adjacent healer action boundary is unchanged and
  explicitly out of scope
- Root cause: incident diagnoses and proposed fixes are persisted, but the
  existing digest exposes mostly source/severity and the solution otherwise
  lives in a Slack thread or JSONB row. `needs_human` lacks a canonical owner,
  decision, blocker, and closure condition; non-human `wont_fix` rows disappear
  from the digest; and stored intermediate/unrouted states can become invisible.
- Outcome: a pure catalog emits one current item per stable incident
  fingerprint and distinguishes active monitoring, `verified_fixed`, named
  rejection, and explicit pending-decision reasons for approval, low-trust or
  manual fixes, recurrence, external/no-fix disposition, unverified terminal,
  unrouted diagnosis, stale lifecycle, and unknown state. Repeated rows and
  resolved-then-reopened history converge deterministically on the current open
  item.
- Privacy/safety: the source query omits raw context, commands, diffs,
  investigation-log paths, and Slack/thread identity. Diagnosis and proposed
  resolution are redacted and capped; evidence becomes count plus SHA-256. The
  standalone CLI has no write/apply/post flag and is absent from daemon,
  scheduler, Slack, Company Work, and action composition.
- Verification: focused catalog/CLI tests pass 12/12; complete healer suite
  passes 22 files / 209 tests; pinned Node 22.23.2 typecheck and production
  build compilation pass; documentation continuity and diff checks pass. The
  broad suite passes 2,984 tests with ten skips; its sole failure is the
  unchanged base CNPC wrapper-literal assertion.
- Deployment/migration: none; no runtime or database state was read or changed.
- Documentation: `docs/SELF-HEALING-COMPLETION-PLAN.md`,
  `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
  `docs/programs/company-os/evidence/NC-20260822-015-healer-resolution-catalog.md`,
  and this entry.
- Follow-up: after review, a separate milestone may project only the minimized
  catalog into Company Work with ownership and exact decision receipts. Do not
  make Slack or `.program/state.json` the runtime incident queue.

### NC-20260822-013 — Bind Practitioner facts into every NanoClaw knowledge consumer

- Date: 2026-08-23
- Owner/client: Codex
- State: deployed_unverified `acd0206f`; corrected replacement ready_for_deploy
- Commit/PR: isolated branch `codex/program-facts-live-release-20260823`,
  based on exact live release `db174c1b`; implementation commits `a70d6c5d`
  and `ca05f6df`; release-inventory correction `553cc94c`
- Change class: C3 knowledge/release closure with no customer communication,
  certificate issuance, price/product, learner-state, schedule, migration, or
  credential change
- Source decision: canonical catalog revision 2/hash
  `d84b3b06db50d74eb38d4a55b55acf0a9d5d654d66aaa791d3dc935fe117af00`
  in `alex-kudinov/practitioner-series` owns Practitioner identity and
  accreditation after provider evidence and accepted owner decisions. Stripe,
  Heartbeat, and Sertifier retain their narrower runtime authority.
- Implementation: a source-controlled sync command pins the catalog web export
  and generated minion pack and injects its exact marker-bound block into all
  13 tracked knowledge files. Generic KB update/regeneration reapplies it;
  validation refuses missing/stale blocks and catalog-superseded claims.
  The existing version-1 program-facts detector adds fail-closed catalog,
  pack, exact-Sales-block, and superseded-claim findings while binding both
  snapshot files into the existing `factsSha256`; its durable Company Work
  evidence schema and closure policy are unchanged.
- Release-input boundary: production jobs retain the operational checkout as
  cwd for `.env`, data, and logs, so all tracked detector inputs now resolve
  from immutable `NANOCLAW_CODE_ROOT`. This prevents a dirty operational facts
  or knowledge copy from passing or failing a release-owned detector run.
- Verification: catalog sync/check reports all 13 knowledge files current;
  focused release-path TypeScript tests pass 29/29 and Python sync tests pass
  2/2. Pinned
  Node 22.23.2 typecheck, documentation continuity, email replay 13/13,
  email-critical 732/732, and independent runner build/tests 43/43 pass. The
  broad suite passes 2,969 tests with ten skips; its sole failure is the
  unchanged baseline CNPC wrapper-literal assertion present at base
  `db174c1b`. `tools/validate-knowledge.sh` itself still exits before reporting
  because the ignored local `llms-full.txt` snapshot lacks its expected stored
  hash marker; the new source-controlled sync check passes independently.
- Deployment/rollback: pending immutable build and activation. No migration or
  data rollback applies; runtime rollback is the retained prior release plist.
  Candidate `a9235381` was transferred and verified on the Mini but deliberately
  not activated after preflight exposed its cwd-owned tracked-input resolution;
  `ca05f6df` corrects that boundary before the final build.
- First activation/readback: exact release `acd0206f` activated with rollback
  to `db174c1b` and healthy channel/listener identity, but the read-only
  detector canary refused because the historical release inventory omitted
  tracked `facts/`. No detector/Company Work run or alert occurred. The
  release builder now packages and attests `facts/` plus the sync/check command,
  with a source-contract regression test; `acd0206f` will be replaced before
  closure is attempted.
- Documentation: `docs/ACTIVE-WORK.md`, `docs/PROJECT-MAP.md`,
  `knowledge/README.md`, generated knowledge files, and this entry.

### NC-20260821-007 — Bound the internal receivables review packet

- Date: 2026-08-21
- Owner/client: Codex
- State: ready_for_review local candidate; not deployed
- Commit/PR: isolated branch
  `codex/nc-20260821-007-followup-review`; implementation commit pending
- Change class: C3 operator-review contract with no projection, presentation,
  decision, agent, accounting, customer, scheduler, or send action
- Outcome: a pure builder selects only exact Plutio receivables that policy
  `2026-08-21.3` already marks ready for internal Contador review. It orders by
  due date and invoice identity, defaults to ten items, caps at 25, and emits
  only opaque invoice/party identity, business dates, balance/currency, policy
  routing, and SHA-256 evidence bindings.
- Fail-closed behavior: any source error, observation-clock mismatch,
  source-fingerprint drift, malformed Plutio invoice identity, duplicate source
  identity, or invalid cap refuses the entire packet. The fixed review
  vocabulary is guidance only; the command has no apply/post flag and no code
  consumes a choice.
- Verification: focused tests pass 7/7; pinned Node 22.23.2 typecheck, build,
  documentation continuity, and diff checks pass. The broad suite passes 2,965
  tests with ten skips; its sole failure is the unchanged baseline CNPC
  wrapper-literal assertion already present at base `c0d1f0dd`. A local
  cross-source canary correctly emitted no packet when Business v2,
  SQLite-action, and identity reads failed even though Plutio returned records.
- Deployment/migration: none. No schema, PostgreSQL/SQLite row, Slack message,
  Contador run, Plutio/payment state, draft, customer email, or scheduler state
  changed.
- Documentation: `docs/ACTIVE-WORK.md`, `docs/PROJECT-MAP.md`,
  `docs/SALES-FOLLOWUP-OPERATING-MODEL.md`, the Company OS roadmap, and this
  entry.
- Follow-up: commit/push and build the exact release artifact. A clean Mini
  packet run requires an authorized release. Durable projection,
  one bounded private review presentation, exact decision receipts, and every
  customer-action path remain separately reviewed gates.

### NC-20260821-006 — Bind follow-up thread and payment evidence

- Date: 2026-08-21
- Owner/client: Codex
- State: deployed_unverified; the exact release and payment-source dry run are
  live-verified; a natural pipeline-bound Sales send receipt remains pending
- Commit/PR: isolated branch
  `codex/nc-20260821-006-followup-evidence`; implementation commit
  `1dbc15dff2b57c0ca35a0d1e09c1fa93480e96ff`; deployed release
  `8c4e3c2b8d78104421b6bf17cf21ff05359b4b3c`
- Change class: C3 operational evidence path; dark release, with no customer,
  Slack, pipeline, Plutio, payment, projection, scheduler, or email action
- Outcome: the host derives an exact pipeline entry from the durable approved
  Sales action, overwrites any container claim, and logs that identity with the
  Gmail-confirmed outbound interaction. New invoice-scoped Plutio transaction
  reads aggregate only paid inbound amount/currency/count evidence and reconcile
  it against invoice total, amount paid, outstanding amount, and currency.
- Fail-closed behavior: missing receipt ID/currency, malformed, contradictory,
  cross-invoice, duplicate-page, mixed-currency, or over-cap transaction
  evidence throws and marks the invoice source incomplete. No paid transaction
  is positive evidence only after the exact
  bounded read completes and the invoice itself reports zero paid. Historical
  Sales interactions are not backfilled or guessed.
- Live read-only evidence: the Plutio account returned 172 paid inbound
  transactions, all with exact invoice IDs, and the exact invoice-ID filter was
  verified without exposing transaction/customer content. The candidate Mini
  dry run completed with zero source errors across 191 current observations:
  166 Sales, five proposals, and 20 invoices; eight overdue invoices are now
  ready only for internal Contador collection review, 12 future-due invoices
  remain waiting, 159 cases are blocked, and 12 are terminal. No apply ran.
- Owner finding: Plutio proposal/person payloads provide `createdBy` but no
  assigned relationship owner. A sanitized PostgreSQL audit found zero owner
  values across 1,163 pipeline entries; all five pending proposals resolve to a
  Party, only two resolve to exactly one active pipeline entry, and none has an
  owner. The candidate keeps four unsuppressed proposals blocked rather than
  inventing an owner. `docs/DATA-MODEL.md` described an `assigned_to` column
  that running migration 07 never implemented; the drift is now explicit.
- Verification: exact Node 22.23.2 typecheck and build pass. The final focused
  gate passes 94 tests across the affected approval, Gmail receipt, interaction,
  invoice, transaction, source-reconciliation, and shadow-report paths. The
  unrestricted suite passes 2,958 with ten skips and the sole failure is the
  unchanged pre-existing CNPC wrapper-literal assertion. The first sandboxed
  suite additionally failed listener/child-process tests from execution-policy
  restrictions; the unrestricted rerun cleared all but that baseline failure.
- Deployment/migration: no schema migration. Immutable release `8c4e3c2b` binds
  source tree `5511342c361e8841ecef9cb41530424521b176b4`, 844 compiled files,
  artifact SHA-256 `f3da264f381008e7a58094e8acb9391237d6ab6cb6fafecaa95113093583fb73`,
  and archive SHA-256
  `06b89c37e9360028fdcf1cf3db68a2a8c2e8eea91c98bfc43c8fbd87c42c3e20`.
  Fresh local and Mini extraction both verified under Node 22.23.2. The drained
  activation changed only the three release-pointer plist paths. PID 53945 now
  reports the exact release/code root, one listener, connected Gmail/Slack,
  empty queues/containers, and zero active sends. The broken daily task remains
  paused. The activated release's dry run completed with zero source errors and
  the same 191 observations, eight internal-review-ready receivables, 159
  blocked, 12 waiting, and 12 terminal; no projection apply ran.
- Rollback/recovery: owner-only backup
  `NC-20260821-006-20260822T023900Z` contains a WAL-safe SQLite copy (SHA-256
  `ac0c67a80db0fa167c05c1020098da6bda0753cdda61b7d50d1b4c75de3a635a`)
  and installed plist (SHA-256
  `958b35a486d3bbd72c36368eb0d16bd6bb09e908e500253cb75d5edfc09e5b81`),
  both mode 0600 and integrity-checked. Activation retained rollback plist
  `com.nanoclaw.plist.rollback-e01c92289eef-2026-08-22T02-39-15-750Z`.
  Restoring it returns the host to `e01c9228`; no data rollback is required
  because this release wrote no follow-up cases or external-system state.
- Documentation: `docs/ACTIVE-WORK.md`, `docs/PROJECT-MAP.md`,
  `docs/SALES-FOLLOWUP-OPERATING-MODEL.md`, `docs/DATA-MODEL.md`, the Company OS
  roadmap, `docs/RELEASE-INTEGRITY.md`, and this entry.
- Follow-up: observe the next natural approved Sales send for an exact
  pipeline-bound Gmail interaction receipt. Create an explicit owner-assignment
  source and assignments before proposal/customer activation; projection,
  internal review workflow, drafting, sending, and scheduling remain later
  gates.

### NC-20260821-005 — Reconcile the revenue follow-up shadow

- Date: 2026-08-21
- Owner/client: Codex
- State: complete for the read-only source-shadow milestone; exact release is
  deployed and live-verified, while projection and all action surfaces remain
  deliberately excluded
- Commit/PR: isolated branch `codex/nc-20260821-005-followup-shadow` based on
  implementation commits `403513b2` and `e01c9228`; no PR yet
- Change class: C3 operational policy surface, C2 dark internal projection;
  no customer, Slack, pipeline, Plutio, payment, scheduler, or email action
- Outcome: one default-dry-run host command now reads exact Sales pipeline
  entries, current pending proposals, current pending/overdue invoices, the
  legacy proposal ledger, the approved-email ledger, and existing follow-up
  cases. It emits only opaque identities, deterministic decisions, hashes, and
  aggregate receivable value. New/materially changed work is separated from
  aggregate unchanged health, so an unchanged daily read cannot mint another
  operator card.
- Fail-closed reconciliation: required source failure blocks affected Sales
  cases instead of assuming there is no open proposal. Multiple active entries
  block exact identity. Party-global Gmail threads block unless their metadata
  names the exact pipeline entry. Plutio `createdAt` never substitutes for
  `pendingAt`; proposal conversion markers close stale `pending` rows. Expired
  proposal presentations affect cooldown but are not sent attempts. Invoice
  arithmetic is not treated as transaction reconciliation.
- Live source finding: the corrected full Mini dry-run completed with snapshot
  fingerprint
  `4ed1974bcbc68bf3d8c92bee279e576acd07d1e95dd1982ac298eba798f9b3bf`,
  zero source errors, and 189 observations: 164 Sales, five proposals, and 20
  invoices. It classified zero ready, 165 blocked, 12 waiting, and 12 terminal.
  The named blocks are 111 unverified Sales thread identities, 42 Sales
  source-identity conflicts, four unresolved proposal owners, and eight
  payment-reconciliation requirements. The 12 waiting invoices carry USD
  88,176.60 outstanding; that aggregate is evidence for review, not collection
  authority.
- Deployed repair: the first full run failed closed after all 189 observations
  because per-record Plutio recipient reads exhausted the bounded child-process
  window. One live bounded `$in` query proved the source could return the
  identities in a single batch. Commit `e01c9228` implements that batch,
  preserves source-completeness per lane, and prevents one identity-read
  failure from contaminating later cases. The corrected run exited zero.
- Apply boundary: `--apply` requires the exact reviewed dry-run snapshot
  fingerprint plus `COMPANY-FOLLOWUP-SHADOW-APPLY`, refuses any source-read
  error or changed snapshot, and projects only through the existing admin-only
  transactional store. No apply has been run.
- Verification: exact Node 22.23.2 typecheck passes. Sixty-three focused policy,
  source, parser, report, CLI, Plutio-boundary, and store tests pass; four live
  PostgreSQL integration cases remain intentionally skipped in the local gate.
  The complete unrestricted suite is 2,935 pass, ten skipped, and the sole
  failure is the unchanged pre-existing CNPC wrapper-literal assertion. The
  731-test email-critical gate and all 43 independent runner tests pass under
  the exact runtime contract.
- Deployment/migration: verified release
  `e01c92289eef381d443e5bd7358e26e6b734bd08` is live under exact Node 22.23.2
  with one listener, connected Gmail/Slack, and empty active queues. Source-tree
  digest is `df835fa29d0b6f0414e024a27bd18239f96bc6eb`; artifact digest is
  `57a8e641fd3cdb26a054d4c1550930bcc5030c4f96fd22475b5d5e3a2fdd95d0`.
  No schema migration is added. Migrations 130-131 remain live and
  empty/admin-only, `task-followup-daily` remains paused, and the legacy
  proposal loop is unchanged.
- No-action proof: the report was written only to an owner-mode temporary file
  and removed after aggregate capture. No projection, case row, Slack card,
  draft, approval, pipeline/Plutio/payment mutation, schedule, task run, or
  customer email occurred. `pending_sends` remained 91 and
  `email_send_events` remained 450 across the dry-run/redeploy boundary.
- Rollback/recovery: restore the retained exact plist
  `com.nanoclaw.plist.rollback-f0c2815e3833-2026-08-21T22-11-38-029Z` to
  return to the prior release. Shadow rollback remains source-only because no
  projection or operational data write occurred.
- Documentation: `docs/ACTIVE-WORK.md`, `docs/PROJECT-MAP.md`,
  `docs/SALES-FOLLOWUP-OPERATING-MODEL.md`, and the Company OS roadmap record
  the shadow boundary and the newly proven source gaps.

### NC-20260821-004 — Enforce one exact Node runtime contract

- Date: 2026-08-21
- Owner/client: Codex
- State: deployed_unverified for the minion-image activation; repository, CI,
  release, host-daemon, and image-build contracts are complete, while one
  natural minion-launch version observation remains open
- Commit/PR: implementation commit
  `68af34bf52653b19a724a1ec7d8615b6b7463d3a` on isolated branch
  `codex/nc-20260821-004-runtime-contract`; no PR
- Change class: C2 — developer/CI/container/release runtime contract; no
  business-system or customer action
- Trigger: the operator challenged the recurring Node 22/26/version churn.
  Production already ran exact 22.23.2, but this authoring shell starts on
  26.7.0, three workflow steps still selected Node 20, version bump inherited
  the runner default, and the agent image floated on a Node 22 major tag.
- Contract: `.nvmrc`, both package engines, engine-strict installs, all five
  GitHub setup steps, CI push/PR triggers, the exact `node:22.23.2-slim` agent
  image and skill template, release inputs, production startup refusal, and
  health now agree. `scripts/with-pinned-node.sh` hands an ambient shell to the
  exact installed pin without changing the workstation's global Node.
- Operator evidence: `npm run runtime:doctor`, launched by ambient Node 26.7.0,
  reports Node 22.23.2, native ABI 127, matching package engine, five aligned
  workflow steps, and the exact image. The official image registry lists the
  exact slim tag; the direct local Docker registry lookup timed out before a
  manifest response.
- Verification: exact typecheck, build, formatting, documentation continuity,
  capability generation check, 29 focused runtime/release tests, and the
  independent runner build plus 43/43 tests pass. The complete root suite is
  2,919 pass, ten skipped, and only the unchanged pre-existing CNPC wrapper
  literal assertion fails.
- Validation hazard: the repository all-skill validator resets its current
  worktree between replays and erased this patch while it was uncommitted in
  the isolated worktree. The patch was recovered; operational source and
  production were untouched. The interrupted replay separately exposed
  pre-existing add-gmail dependency and add-slack typecheck drift; neither was
  folded into this task.
- Deployment: exact release `e01c9228` is live and health-reported Node 22.23.2.
  The prior minion image reported 22.22.0 and is retained as
  `nanoclaw-agent:rollback-20260821-e01c9228-node22.22.0`. A replacement
  `nanoclaw-agent:latest` built successfully from the verified release with OCI
  manifest-list digest
  `sha256:8de63770c3b3c750e39a09f36f3c28a13f5044e61fb913678b8eec20a01d88f3`.
  The first two pulls failed because the persistent Apple Container builder
  lacked DNS even when the build command supplied it; restarting only the idle
  builder with `--dns 192.168.1.1` repaired resolution. A post-build shell lost
  access to the Apple CLI before a separate runtime smoke, so retain the
  rollback image until a natural minion reports exact 22.23.2.
- Rollback: restore the retained image tag for minion launches and the retained
  prior release plist for the host daemon. No database, schedule, channel,
  customer, or global Node state changed as part of runtime standardization.
- Documentation: `AGENTS.md`, `CLAUDE.md`, `docs/RELEASE-INTEGRITY.md`,
  `docs/PROJECT-MAP.md`, and `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` now name
  exact Node 22.23.2 as the sole NanoClaw runtime contract.

### NC-20260821-003 — Preserve inbound visible recipients and bound reply-all

- Date: 2026-08-21
- Owner/client: Codex
- State: deployed_unverified; exact runtime and non-interference are verified,
  while natural multi-recipient outcome evidence remains pending
- Commit/PR: isolated branch `codex/nc-20260821-003-recipient-context`; no PR
- Change class: C3 — inbound context plus approval-bound outbound recipient
  authorization; no autonomous send
- Trigger: a live customer thread asked Tandem to copy other visible
  participants, but Chief received neither the original recipient envelope nor
  a safe reply-all option and fell back to a denied Gmail search. The operator
  also required the Company OS roadmap to keep driving more/better automation
  and smarter minions rather than accumulate platform work.
- Architecture: `gmail-parser` now extracts bounded visible To/Cc headers and a
  normalized maximum-ten candidate list. Direct and classifier-continuation
  routes preserve that host-derived context to Inbox, Sales, and Chief. Owned
  mailboxes, the primary recipient, duplicates, and forwarded-inquiry internal
  envelopes are excluded; BCC is never available to a minion.
- Decision boundary: Sales or Chief may include an exact `Cc:` only when the
  latest external sender explicitly asks to copy/reply-all/keep named visible
  participants, or Alex/Cherie explicitly directs reply-all in that exact Slack
  work thread. Every address must come from the current host candidate list,
  remain operator-visible on every revision, and stay immutable after approval.
- Execution boundary: Mailman passes only the exact approved CC. Before Gmail,
  the host reloads the exact thread and permits an approved out-of-Party CC only
  while it remains visible on the latest external message. Invented, stale,
  standalone, hidden-copy, duplicate, primary-recipient, and more-than-ten paths
  fail closed before send.
- Roadmap reset: the Company OS plan now names three outcome lanes — inbox to
  resolution, revenue follow-up, and management by exception — plus a dual
  delivery gate requiring business-outcome, automation, and minion-intelligence
  gains. The autonomy ladder is observe, recommend, approval-execute, bounded
  low-risk autonomy, then evidence-led adaptation. Generic horizontal substrate
  and R5 execution depth are deferred unless a lane proves them necessary.
- Verification: Node 22.23.2 typecheck and the focused parser, direct-route,
  classifier-route, approval, Gmail-thread, execution-guard, and four-group
  prompt contracts pass. Full release/build/deployment evidence follows at the
  release boundary.
- Release: immutable commit `3de6707dff0e6309ad141e087428c0803dedd145`
  binds source tree `4d9d45aa6a742a7eaece56c622c9cc651c1278ae`, 824
  compiled artifacts, artifact SHA-256
  `53fcce93729af24a13eb952d676c64bf1c9f3f5e2ce2d57b1b1023dea3686f75`,
  and archive SHA-256
  `84a6734f0d5512a8d761adccc3ea8216295e7fdb4a01fb84ec8055709f71f57a`.
  The release-critical gate passes 731/731 including the independent runner's
  43/43 tests. The unrestricted suite passes 2,919 with ten skips and only the
  unchanged pre-existing CNPC wrapper-literal assertion failing.
- Backup/activation: owner-only backup
  `NC-20260821-003-20260821T203457Z` contains a WAL-safe SQLite copy (SHA-256
  `c91b723a0272af412a90f29957ee05ac3d4a33aa3826d49e7cc309d5ab2118e9`),
  exact plist (SHA-256
  `4afc65ff2f967bd246d16e707f20c804f443f005442a86e28c829b8ccd26283d`),
  and all seven affected operational prompts. Activation changed only code
  root, expected release commit, and executable; rollback plist
  `com.nanoclaw.plist.rollback-6b9b5f272d60-2026-08-21T20-36-13-788Z` is
  retained.
- Prompt reconciliation: six operational files matched the prior release and
  now byte-match the new release. Chief's prompt had one independent grader
  customization, so deployment preserved it and inserted only the reviewed
  recipient-context rule; the merged operational SHA-256 is
  `6cd3abf3db27f88d3ee79fd42bfc279d84845fdb9a74a00b83b9544e27f733ff`.
- Live proof: one listener, PID 6524, runs exact release `3de6707d` under Node
  22.23.2 with verified code-root/source/artifact identity; Gmail and Slack are
  connected; queues and containers are empty. Pre/post SQLite evidence is
  identical at six blocked and 85 confirmed actions plus 450 events; the
  broken daily Sales follow-up remains paused. No customer email, approval,
  action mutation, or synthetic multi-recipient canary occurred. A natural
  inbound message with multiple visible recipients must still prove context,
  card behavior, approved execution, and exact Gmail receipt before outcome
  validation.

### NC-20260821-002 — Redesign Sales, proposal, and receivables follow-up

- Date: 2026-08-21
- Owner/client: Codex
- State: complete for the process/dark-foundation correction; the replacement
  remains intentionally unwired and the broken task remains paused
- Commit/PR: isolated branch `codex/nc-20260821-002-followup-process`; exact
  release `6b9b5f272d602b7e0f20fd5959c7be6fe5835a1c`; no PR
- Change class: C3 — one reversible scheduler pause plus an unwired, no-send
  Company OS policy/schema foundation
- Trigger: the operator reported that the daily Sales follow-up no longer
  completed and, when it did run, recycled the same leads. They requested a
  process-first redesign spanning leads, unsigned Plutio proposals, and unpaid
  invoices.
- Operator correction (2026-08-21T15:57Z): the harmful repetition was the same
  proposed email returning for approval after rejection, not repeated customer
  sends. Canonical pipeline terminal is `lost`, not `dead`; explicit rejection
  must durably cancel the exact case and require read-back-verified `lost`,
  while silence or expiry must not regenerate an identical daily card.
- Live finding: `task-followup-daily` was active at 09:00 CT weekdays, not off.
  Its ten 2026-08-12 through 2026-08-21 runs all failed the completion contract.
  Recent runs repeatedly selected the oldest five, queued Gmail thread reads,
  and ended without a complete artifact set. The deterministic view currently
  returns 128 rows for 108 parties: 120/100 at attempt count zero, five/five at
  one, and three/three at two. Counts and thread identity are party-global while
  rows are per pipeline entry; pending drafts are not excluded and the view
  does not prove our outbound is the latest conversation event.
- Containment: after WAL-safe backup
  `NC-20260821-002-20260821T144453Z` (SHA-256
  `9c7b498c4a8d7f9ae2a7a612250bcb30748f0fd646d87a0e58f604d077d1f262`),
  a guarded one-row update changed only `task-followup-daily` from active to
  paused. SQLite `quick_check` passed before and after. No run, draft, or send
  was triggered.
- Adjacent-system finding: the host proposal loop is default-on. Plutio has five
  genuine pending proposals totaling $38,300 with no conversion markers. Four
  are permanently stuck behind an expired sequence row; the fifth has two sent
  touches. Today's pass scanned five, drafted zero, and skipped five. The
  proposal ledger holds 12 sent, seven expired, and two cancelled rows.
- Receivables finding: Plutio has eight overdue invoices totaling $23,793.50
  outstanding and twelve future-due pending invoices totaling $64,383.10.
  NanoClaw has no customer receivables follow-up workflow; future-due invoices
  are not collection work.
- Process authority: `docs/SALES-FOLLOWUP-OPERATING-MODEL.md` defines one stable
  case per exact conversation/proposal/invoice, Sales vs Contador ownership,
  lane-specific business-day cadence, ball-in-court and current-source checks,
  approval-time revalidation, attempt receipts, stop rules, and unchanged-case
  presentation suppression. It caps Sales at two customer follow-ups,
  proposals at three plus internal close review, and receivables at two only
  after Contador's explicit collection review.
- Dark implementation: `src/followup-policy.ts` is a pure, content-free
  deterministic evaluator and canonical decision fingerprint. Live migration
  130 plus `src/followup-case-store.ts` add an admin-only current
  case projection and append-only changed-evidence events. They are unwired:
  there is no source adapter, scheduler, daemon call, agent grant, report,
  presentation, draft, approval, Plutio mutation, or send path.
- Resumed correction: policy version `2026-08-21.2` adds the explicit
  `operator_declined_followup` terminal decision. Live migration 131 adds
  only `operator_decision=declined` plus a SHA-256 operator fingerprint to the
  existing append-only event ledger. It remains unwired: no Slack
  decision consumer, case/pipeline mutation, presentation, draft, or send path
  exists. Focused policy/migration/Sales-contract tests pass 38/38 under Node
  22.23.2; the full suite passes 2,906/2,917 with only the pre-existing CNPC
  wrapper assertion failing and 10 integration tests skipped. Disposable
  PostgreSQL 16 proves apply, empty rollback, valid declined receipt, and
  populated rollback refusal.
- Focused verification: 24 policy tests pass under Node 22.23.2. Disposable
  PostgreSQL 16 runs four store/lifecycle tests covering initial projection,
  exact replay, unchanged-next-day no-op, versioned evidence change, stale and
  conflicting evidence refusal, append-only enforcement, and zero non-admin
  grants. Four static migration/release-authority tests pass. Populated
  rollback refuses; empty rollback succeeds.
- Release gates: typecheck, build, formatting, documentation continuity, and
  diff checks pass. The email-critical suite passes 722/722 and the independent
  agent runner passes 43/43 under pinned Node 22.23.2. The unrestricted root
  suite passes 2,899/2,900 with ten skips; its sole CNPC wrapper-literal
  assertion and both implicated files are unchanged from this task's base.
- Release: immutable commit `a939af5a500f0484a8f2c805d72e4b2a49f9655e`
  binds source tree `706e59ec82530ecf91cc82d8cf44fa87eb73b098`, 824
  compiled artifacts, artifact SHA-256
  `8b2846f11b49bceec40ee5345a9752728b24933179aff71ddec068ba26c36852`,
  and archive SHA-256
  `dd2de00f539fb1d53722aabf1fd6480ef129ac8641e89fcf4f6613bfe43ba912`.
  Local and Mini runtime verification pass under Node 22.23.2. The activation
  dry run and apply changed only code root, expected commit, and executable,
  retaining rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-f6089cce30ca-2026-08-21T15-30-03-484Z`.
- Correction release: immutable commit
  `6b9b5f272d602b7e0f20fd5959c7be6fe5835a1c` binds source tree
  `beca00883cd08ca90e0892277fe576865c3e9968`, artifact SHA-256
  `d674adba26588cfb32ec494f040776999d24cb5d5318a4ce5b08e4a0fd1f8466`,
  and archive SHA-256
  `b7d044b799fd6f537c0e9d7600a35575c7249b3eab7accd3904059b7cfe5e87d`.
  Local, archive, and Mini verification pass under Node 22.23.2; the activation
  changed only the three allowlisted launchd paths and retained an exact
  rollback plist.
- Drain/backup: two real Sales conversations were allowed to finish naturally;
  the final gate proved zero containers, waiting groups, outgoing Slack work,
  and active email actions. Owner-only backup
  `NC-20260821-002-20260821T152918Z` contains WAL-safe SQLite, exact plist, and
  complete custom-format `business_v2` artifacts. SQLite `quick_check` and
  `pg_restore --list` pass. Their SHA-256s are respectively
  `37410c8eababff97eeb1dcc8b0a177b82b8e2ee35e2600727ccf4e308698296d`,
  `256f69c20c553d0635a8b3ff6f57d81cab5cb80bba9d6e9f7de3404665a80e85`,
  and `b2ca8cebdc48dddb587002a800818f2bf39e55cfd3218e43e4ccda3a8320fad1`.
  An initial `pg_dump -X` invocation failed before writing the PostgreSQL
  artifact; the corrected invocation completed while the daemon remained
  stopped and before migration.
- Live schema: exact migration SHA-256
  `5444f10a765f25c43c22a0c6ea10fe1035d45c784acfb51f66e4330bfe2e1964`
  is applied. Both new tables are empty, owned by `nanoclaw_admin`, have zero
  non-admin table/sequence grants and zero forbidden content columns, and the
  events table has its enabled append-only trigger.
- Correction backup/schema: owner-only backup
  `NC-20260821-002-20260821T162203Z` passed SQLite `quick_check` and
  `pg_restore --list`. Migration 131 SHA-256
  `40015e6b4a166ef47ab906fa52bc3b82857b98b7d57c2368f91b31c43782ca58`
  is live with the expected columns, constraints, and append-only trigger; it
  has zero rows and zero non-admin grants. The three operational Sales prompt
  files matched the prior active release before their reviewed sync and match
  the correction release afterward.
- Live non-interference: PID 82111 serves the exact verified release with
  matching code root, Node 22.23.2, connected Gmail/Slack, one listener, and
  empty runtime/outgoing queues. `task-followup-daily` remains paused. The
  proposal ledger is unchanged at 21 rows (12 sent, seven expired, two
  cancelled); SQLite is unchanged at 90 send actions (84 confirmed, six
  blocked) and 445 events. Protected PostgreSQL aggregates remain 22 work
  items/version sum 117, 139 events, 63 receipts, seven cases, seven briefs,
  47 exception events, and zero dispatches/events. Startup returned
  `duplicate_brief` and started no packet attempt.
- Boundary: this completes the process and dark-foundation milestone,
  not the customer-follow-up replacement. No source candidate was projected,
  no backlog was imported, and no presentation, draft, approval, pipeline,
  Plutio/payment, or customer action was created. A strategic Company OS
  checkpoint now precedes any source shadow or activation work; the legacy
  Sales task stays paused.
- Correction live proof: PID 13872 serves exact release `6b9b5f27` with matching
  code root, source tree, artifact, Node 22.23.2, one port-8088 listener, and
  connected Gmail/Slack. `task-followup-daily` remains paused. SQLite
  `quick_check` passes with 85 confirmed and six blocked historical actions and
  zero active actions. The proposal ledger remains 12 sent, seven expired, and
  two cancelled; both follow-up tables remain empty. Protected Company Work
  core aggregates remain exactly 23 items/version sum 124, 147 events, and 67
  receipts. No follow-up presentation, decision, pipeline transition, draft,
  Plutio/payment action, or customer send occurred.

### NC-20260821-001 — Bind Company Work packet pickup and bounded attempts

- Date: 2026-08-21
- Owner/client: Codex
- State: complete; exact release and migration are live and a natural packet
  cycle proved three durable pickup/attempt/receipt trails
- Commit/PR: isolated branch
  `codex/nc-20260821-001-exception-attempt-receipts`; no PR
- Change class: C3 — internal Chief work dispatch/receipt behavior plus an
  additive admin-only schema; no customer message or source/work mutation
- Trigger/authority: after the operator asked the Company OS roadmap to keep
  moving, live inspection of the first natural exception packets showed the
  backend did wake Chief but left no durable packet-level attempt result.
- Finding: daily brief 19 posted three exact packets. One summary-level Chief
  run emitted an unbound "logged quietly" root message, while the packet-thread
  run recorded its conclusion privately and emitted no operator-visible packet
  result. Notification and agent startup therefore did not prove operational
  closure.
- Implementation: migration 129 binds brief/work-version/fingerprint to exact
  Slack packet delivery and append-only posted/picked-up/attempt outcome events.
  Chief routing claims exact packets before execution, records the first
  bounded turn success/failure, posts one threaded receipt that explicitly is
  not resolution, skips exact completed replays, scopes mixed/new batches to
  newly eligible work, and suppresses later dispatch of an unchanged completed
  fingerprint. The summary now uses Chief own-echo provenance and no longer
  starts a redundant root run.
- Safety boundary: tables contain no customer or agent output text and grant no
  agent access. A successful turn does not resolve source work, approve, retry,
  send, edit facts, or create business authority. Failed/unbound lifecycle
  writes fail closed before or during agent dispatch.
- Verification: pinned Node 22.23.2 focused tests pass 37/37. Disposable
  PostgreSQL 16 proves the full posted-to-receipted lifecycle, append-only event
  enforcement, zero Chief SELECT, populated rollback refusal, and empty
  rollback. Typecheck, build, formatting, documentation continuity, and diff
  checks pass. The email-critical gate passes 722/722 and the independent
  runner passes 43/43. The unrestricted root suite passes 2,871/2,872 with six
  skips; the sole failing CNPC wrapper-literal assertion and both implicated
  files are unchanged from the task base.
- Release: immutable commit
  `f6089cce30ca484cd0f2aa4706722e9904cad408` is active from its verified
  release directory under Node 22.23.2. Source tree
  `61b0ad3e64cd76432adee94baae69cc213465e63` and artifact SHA-256
  `85838393f931f4968ea93ef892c01a2009b984414fa0377e00d373fce94bd899`
  match the release manifest. The activation helper changed only the code
  root, expected commit, and program path, and retained the exact prior plist
  at its reported rollback path.
- Live migration and backup: after a zero-work drain and service stop, the
  owner-only `NC-20260821-001-20260821T142957Z` backup passed SQLite
  `quick_check` and `pg_restore --list`. Migration 129 is live: both tables are
  owned by `nanoclaw_admin`, have zero non-admin table grants, and the event
  table has its append-only trigger.
- Live verification: launchd, the sole port-8088 listener, and `/health` agree
  on PID 78264 and exact commit `f6089cce`; release integrity, code-root match,
  Node pin, Gmail, and Slack all pass with zero active/waiting/outgoing work.
  Startup returned `duplicate_brief` for today's already-claimed brief, so it
  posted no synthetic work packet and the new dispatch/event tables remain
  empty. Protected PostgreSQL aggregates remain 22 work items/version sum 117,
  139 work events, 63 work receipts, seven cases, seven briefs, and 47
  exception events. SQLite remains healthy at 90 pending-send rows and 445
  email-send events. The error log was not modified by this deployment.
- Former outcome boundary: deployment mechanics and dark schema were initially
  live-verified while the first genuine changed fingerprint remained pending.
  No source work was manufactured for proof.
- Natural outcome addendum: the later activation of exact release `6b9b5f27`
  encountered genuine changed source work and posted three packets. Production
  records show three `posted`, three `picked_up`, three `attempt_succeeded`,
  three posted receipts, and zero failed attempts. Company Work core aggregates
  remained 23 items/version sum 124, 147 events, and 67 receipts, and no
  customer email or source mutation occurred. This closes the packet pickup and
  bounded-attempt gate; it does not claim the underlying source issues are
  resolved.
- Roadmap follow-on: keep the reported broken daily Sales follow-up task off.
  Redesign policy and ownership first across active leads, unsigned Plutio
  proposals, and unpaid invoices, then implement one durable eligibility and
  next-action queue that cannot resurface unchanged work as new every day.

### NC-20260820-009 — Activate one exact outcome-review packet

- Date: 2026-08-20
- Owner/client: Codex
- State: complete; packet activation, two live corrections, exact operator
  decision, durable quality receipt, and non-interference proof pass
- Commit/PR: isolated branch
  `codex/nc-20260820-009-outcome-review-activation` from dark-deployment handoff
  `a656915b`; no PR
- Change class: C3 — exactly one private internal Slack review packet plus C2
  production configuration; no customer communication or business action
- Trigger/authority: the operator explicitly said to proceed after NC-008's
  dark-deployment milestone and the described one-packet activation boundary.
- Intended change: reuse exactly one already-authorized Company Work operator
  UID without disclosing it, enable the installed default-off service with its
  24-hour interval/30-day window/candidate limit 25, and allow one immediate
  run to post at most one complete packet to Chief.
- Implementation: a release-bundled configuration transaction is dry-run by
  default, permits only the existing Company Work operator source or an
  owner-only single-UID file, exposes only counts, validates the runtime bounds,
  requires exact host/release confirmation for apply, atomically backs up and
  writes the environment, and restores the exact prior bytes. The release
  inventory explicitly includes the helper.
- Live correction: the first exact packet exposed that `from_group=company-os`
  is intentionally a cross-group handoff provenance and therefore woke Chief's
  generic dispatcher. Chief declined classification but emitted one extra
  message and updated one internal `open_items` memory entry. Outcome-review
  packet and reaction-ack posts are now tagged as Chief's own host echoes, so
  humans still see/react to the exact Slack message while the established own-
  group echo gate suppresses agent pickup. Exception briefs/work packets retain
  their actionable `company-os` provenance.
- Restart/concurrency correction: candidate selection returns nothing while any
  packet is not `decided`; claim repeats the global open-packet check under a
  transaction-scoped advisory lock. This prevents the corrective restart or
  overlapping host processes from advancing to packet two before the operator
  decides packet one.
- Acceptance: copied-data candidate/evidence rehearsal; exact live release and
  empty-ledger preflight; zero-work drain and owner-only backups; one config-only
  restart; one posted packet with claimed/posted events; zero decision/quality
  receipt/second packet; protected-state, health, and log proof.
- Safety boundary: no Gmail API/search/read, raw identity storage, backfill,
  model/agent classification, inferred/default clean, typed approval, customer
  email, remediation, work mutation, unrelated configuration, push, or merge.
  The operator's exact bound reaction is a later human decision.
- Rollback: disable the service and restore the owner-only pre-activation env/
  plist backup. A posted packet and lifecycle remain append-only evidence; never
  delete them to roll back configuration.
- Verification so far: pinned Node 22 helper/outcome focused tests pass 40 with
  one explicit integration skip; email-critical passes 721/721, the independent
  runner passes 43/43, and typecheck/build/diff checks pass. The full suite is
  2,849 pass, one known CNPC wrapper-contract failure, and six skipped; both
  implicated CNPC files are byte-identical to base. Production has exactly one
  valid reusable Company Work operator and remains disabled/empty on exact
  release `6f40b1da`. Copied-live SQLite plus read-only production PostgreSQL
  found 13 candidates, reconstructed 13, and rendered all within one Slack
  message (maximum 2,937 characters), with zero claims, posts, or Gmail calls.
- First activation evidence: owner-only backup
  `NC-20260820-009-20260821T031530Z` passed SQLite quick-check and
  `pg_restore --list`; exact release `963317a9` posted one 2,482-character
  packet with one claimed and one posted event. Outcome review reported one
  successful run/no error; review decision fields and quality receipts stayed
  empty, and SQLite email state remained exactly 88 actions/435 events/zero
  active with an unchanged SHA-256 fingerprint. The generic Chief pickup above
  was the sole unexpected side effect and is the reason this task remains in
  progress pending corrected-release deployment and reaction proof.

#### Addendum 2026-08-21T03:39Z — corrected operator-only release live

- Release identity: exact commit
  `dbe5016cfdd7106c76064969a9cfcd50c3c479f2` binds source tree
  `ce82587382362ea0371e34cf05372a9cc8c0954e`, 816 compiled files,
  artifact SHA-256
  `8a44161940992a1b573ec4a033c1d2273115f0a2b8ba04ca86b3d0d164c88e2e`,
  and archive SHA-256
  `6431f3fecb232c5a9b0379c25443a28151cc25e81873c72538d7612f92c27392`.
  Local release gates and independent Mini verification pass on Node 22.23.2.
- Correction: only outcome-review packet and reaction-ack writes now use
  Chief's own host-echo provenance. Exception briefs and work packets retain
  their existing cross-group provenance and agent pickup. Candidate selection
  globally suppresses work while any packet is undecided; claim repeats that
  check under a transaction-scoped advisory lock. Focused outcome/database/
  wiring tests pass 86/86; email-critical passes 721/721 and the independent
  runner passes 43/43. The final full suite is 2,851 pass, one known CNPC
  wrapper-contract failure, and six skipped; both implicated CNPC files are
  byte-identical to base.
- Drain/backup/rollback: correction backup
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-009-correction-20260821T033227Z`
  is owner-only; SQLite quick-check and `pg_restore --list` pass. The retained
  rollback plist is
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-963317a9af9f-2026-08-21T03-32-44-574Z`.
- Activation/health: launchd, the sole port-8088 listener, and health agree on
  PID 24079, exact verified release `dbe5016c`, matching release code root, and
  Node 22.23.2. Gmail and Slack are connected; queues and active containers are
  empty. Outcome review is active for one operator, ran once, and returned
  `no_candidates` because packet #1 remains open. Post-release logs contain 40
  INFO headlines, zero WARN/ERROR/FATAL headlines, and zero container spawns.
- Durable proof: PostgreSQL has exactly one posted/open packet, one claimed and
  one posted event, zero decisions, zero assessment bindings, zero decision
  receipts, and zero quality receipts. No review, quality, work, receipt,
  exception-brief, or exception-event row was appended after corrected
  activation; the eligible candidate query returns zero. Protected counts stay
  21 work items/version sum 110, 131 work events, 59 receipts, seven exception
  cases, six briefs, and 40 exception events.
- SQLite proof: live `pending_sends` and `email_send_events` have zero rows in
  either direction under `EXCEPT` comparison with the correction backup. They
  remain 88 actions/435 events with zero active action, `quick_check=ok`, and
  the same 68,272 messages/max rowid 68,871 as the backup; no message arrived
  after corrected activation. The original packet remains truthful immutable
  history with its initial `company-os` provenance. Future packet/ack posts use
  Chief-owned provenance and cannot enter generic cross-group dispatch.
- Human gate: packet #1 remains undecided. Only the configured operator's exact
  bound ✅/🐛/↩️/🚨 reaction may record one quality receipt. No reaction has
  been supplied or inferred, and no Gmail read/search, email, customer action,
  remediation, workflow mutation, second packet, or post-correction agent run
  occurred.

#### Addendum 2026-08-21T11:38Z — thumbs-up reconciliation repair

- Live finding: after receiving the exact packet permalink, the configured
  operator reacted 👍 on packet #1. Slack reports that emoji as `+1`, but the
  deployed closed vocabulary recognizes only check-mark variants for `clean`.
  Packet #1 therefore correctly remained posted/undecided with two lifecycle
  events and zero quality receipts. Because `+1` was not claimed by the exact
  packet listener, it also fell through the existing generic approval path and
  woke Chief; this is the second operator-friction defect in the activation and
  must be corrected rather than asking for a third click.
- Candidate correction: migration 128 widens only the bounded
  `decision_reaction` constraint to include Slack `+1`; rollback refuses once
  any durable `+1` decision exists. The map treats `+1` as an explicit `clean`
  reaction, never as absence/default evidence. Packet instructions expose both
  ✅ and 👍 for clean.
- Reconciliation boundary: on startup/daily run, the host projects only
  reaction names and reactor UIDs from the one exact open packet. Slack's API
  returns a message envelope, but the channel helper discards its content
  without inspecting, logging, persisting, or exposing it to the review
  service. The service proceeds only when exactly one supported reaction
  belongs to a configured operator, records the host observation time because
  Slack exposes no click timestamp, and returns without posting packet two.
  Zero or multiple matches fail closed. No channel search, model/agent
  interpretation, Gmail access, customer action, remediation, or work mutation
  is introduced.
- Verification so far: pinned Node 22.23.2 focused outcome-review, migration,
  Slack-channel, wire-up, and SQLite tests pass 208/208; email-critical passes
  722/722, the email incident replay passes 13/13, and the independent runner
  passes 43/43. Typecheck, build, format, and diff checks pass. The full suite
  is 2,858 pass, one unchanged known CNPC wrapper-contract failure, and six
  skipped; both implicated CNPC files remain byte-identical to the deployed
  base. The following addendum records the completed production migration,
  release, restart reconciliation, receipt/ack, and protected-side-effect
  proof.

#### Addendum 2026-08-21T12:13Z — exact thumbs-up decision live

- Release identity: exact commit
  `288105cb32fdacab3640326264499d9df15babb0` binds source tree
  `2447bd7e58c5f2464ce991b59edbe4cbb0714751`, 816 compiled files,
  artifact SHA-256
  `04fa483ef39176d89c1345cd2fc6643c29b9a074d0f170b81ce45c96223bfc8e`,
  and archive SHA-256
  `83228365a6f8a4269082bdf5ccb3a7eacfadcb5d26223795babe207321ca9c2b`.
  The archive independently verifies locally and on the Mini under Node
  22.23.2; activation dry-run named exactly the three release-pointer paths.
- Drain/backup: two real Chief/Sales runs were allowed to finish naturally.
  The final gate proved zero containers, active/waiting groups, outgoing Slack
  work, and active email actions before launchd stopped. The owner-only backup
  at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-009-plus-one-20260821T120902Z`
  contains mode-0600 WAL-safe SQLite, `business_v2`, plist, and environment
  copies; SQLite `quick_check` and `pg_restore --list` pass. The initial full-
  database dump failed closed on the known RLS-protected legacy Procurement
  table; its incomplete archive was removed immediately, no RLS changed, and
  the established complete affected-schema dump succeeded. SQLite and
  `business_v2` backup SHA-256s are respectively
  `121c55c0a7a5d4dd87068b4d8c24c186d24124f0ae0e1f534cb66abb3fa2bd9c`
  and
  `7ba6eec3e50b9aa4d0f4227028b4a5277591a8365b09710acbd96680f82fd201`.
- Migration/activation: exact migration-128 SHA-256
  `919b8aa59050fffc4e46ddcfbc94d5104a1f241c2a6f9b80db3aef9a7567c5d0`
  applied transactionally while stopped. The live constraint contains exactly
  `+1` plus the six prior reactions and had zero `+1` decision rows before
  startup. Recovery-safe activation retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-dbe5016cfdd7-2026-08-21T12-10-41-481Z`.
  Launchd, the sole listener, and fresh health converge on PID 78177, exact
  verified release `288105cb`, matching code root, Node 22.23.2, and connected
  Gmail/Slack.
- Decision proof: exact packet #1 still has one Slack `+1` reaction from the
  sole configured operator. Startup returned `decision_reconciled` with no
  error, recorded packet assessment/reaction `clean`/`+1`, actor binding,
  quality receipt #1, and posted receipt timestamp `1787314249.843879`. The
  packet has exactly one each of claimed, posted, decision-recorded, and
  decision-receipt-posted events. Slack exposes exactly the root plus one bot
  thread acknowledgment, and SQLite binds that same acknowledgment to the
  original thread with `from_group=chief`. There is still exactly one packet.
- Non-interference: Company Work remains 22 items/version sum 117, 139 events,
  and 63 receipts, with zero event or receipt appended after activation.
  SQLite `pending_sends` and `email_send_events` compare empty in both `EXCEPT`
  directions against the stopped backup: 90 actions (84 confirmed, six
  blocked), 445 events, and `quick_check=ok`. Current-process logs have 36 INFO
  headlines and zero WARN/ERROR/FATAL or stderr records. Two Chief container
  spawns are attributable to the separately established startup exception
  brief/work-packet loop; their health snippets are not the outcome packet or
  its acknowledgment. The review reconciliation spawned no agent, called no
  Gmail API/search/read, sent no email/customer message, posted no second
  packet, and changed no work/action/remediation state.

### NC-20260820-008 — Add exact operator-review packets for outcome quality

- Date: 2026-08-20
- Owner/client: Codex
- State: complete for the dark deployment milestone; implementation, immutable
  release, migration, live disabled-mode proof, and protected-state parity pass
- Commit/PR: isolated branch `codex/nc-20260820-008-outcome-review` from
  deployed-lineage documentation handoff `ee71ffe6`; no PR
- Change class: C3 — default-off internal Slack review packet plus C2
  append-only packet/assessment records; no customer communication or business
  workflow action
- Root cause: NC-007 safely creates one explicit assessment but still makes an
  operator locate the exact work/event/action, reconstruct the request and
  approved response, verify delivery/outcome receipts, and assemble hashes and
  timestamps by hand. That is error-prone friction rather than a usable review
  loop.
- Implementation: migration 127 provides a content-free, admin-only packet
  delivery/decision ledger with immutable posted/decision bindings and an
  append-only lifecycle. The default-off host service selects at most one
  eligible outcome per run and requires exact agreement across the PostgreSQL
  work events/receipts, SQLite action/approval card, routed Mailman source,
  Gmail confirmation event, and exact outcome receipt. Source hydration is
  explicitly read-only. Identity headers are removed, email literals are
  redacted, and a packet that cannot fit one complete Slack message is refused
  instead of truncated. Only a configured UID's exact bound reaction may reuse
  NC-007's plan/apply producer; operator identity and evidence are hashed.
- Reaction boundary: host reaction listeners run before generic check-mark
  approval. The exact packet must be durably found before a reaction is
  claimed; after that binding, storage/assessment errors remain claimed and
  fail closed rather than waking Chief as an agent approval. ✅/🐛/↩️/🚨 map
  only to the four bounded quality values. Decision receipt posting is tracked
  separately from the assessment receipt.
- Safety boundary: no model/agent classification, typed approval, default
  clean, absence-as-evidence, Gmail search/read, list/bulk post, historical
  backfill, customer message, remediation, work mutation, or external action.
  Schema/code deployment is not packet-post or assessment authority.
- Verification/deployment: pinned Node 22.23.2 typecheck and 133 focused
  tests pass; the 721-test email-critical suite and independent 43-test runner
  suite pass. The full root suite is 2,841 pass / one known CNPC contract
  failure / six skipped; both failing CNPC inputs have byte-identical blobs to
  base `ee71ffe6` and are outside this change. Formatting, build, diff check,
  capability matrix, and documentation continuity pass. Disposable PostgreSQL
  16 applies migrations 1-14/118/126/127 and
  proves one candidate, claim, exact replay no-op, Slack binding, quality FK,
  decision, decision receipt, four lifecycle events, immutable decision state,
  and populated rollback refusal. Immutable release `6f40b1da` passed the same
  721-test email-critical and 43-test runner gates, independently verified on
  the Mini, and is live with migration 127. Outcome review is disabled with
  zero runs, packets, events, or quality receipts.
- Rollback: before production data, revert source and use the guarded empty-only
  migration rollback. After any packet/decision exists, retain history and
  deactivate the service; never delete review or assessment evidence to roll
  back code.
- Documentation: active work and changelog claimed before runtime/schema edits;
  project map, Company Work ledger, Company OS plan, data guide, schema guide,
  configuration, and release evidence updated.

#### Addendum 2026-08-21T01:32Z — exact outcome review dark deployment live

- Release identity: exact commit
  `6f40b1da7742a28a583c5e43d3109b2ed8c52358` binds source tree
  `08d9a4b04bec9fc4bab375c72f6056b76452d296`, 812 compiled files,
  artifact SHA-256
  `883cd019d8f0a2a261f879a382909651d2d312ae861f26004140f9a1b5571031`,
  and archive SHA-256
  `6c578902b40693f25a22f95e171a1b1e98a78f9babe232f5226df48dbcccf04a`.
  Local release gates and independent Mini bundle/runtime verification pass on
  Node 22.23.2.
- Drain/backup: a first final guard refused before any mutation when a new real
  Slack task arrived after the initial drain. Both observed tasks were allowed
  to finish. The successful guard then proved zero containers, active/waiting
  groups, outgoing Slack work, and active email actions before launchd was
  stopped. Owner-only backup directory
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-008-20260821T011714Z`
  contains final-drained WAL-safe SQLite and full custom-format PostgreSQL
  backups with SHA-256 `de166207…` and `6464534d…`; both are mode 0600 and
  pass SQLite quick-check / `pg_restore --list`.
- Migration: exact SHA-256
  `a8f821ae3d6287bbc982ca20284be363a10ddadcea717ed6e4287775dabfc4b2`
  applied transactionally. Live review tables have 28 constraints, nine
  indexes, two enabled user triggers, admin table/sequence/function ownership,
  zero non-admin table grants, zero forbidden content columns, and zero packet
  or lifecycle-event rows. Quality receipts remain zero.
- Activation/health: the retained rollback plist is
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-265622bd7cc4-2026-08-21T01-26-05-316Z`.
  Health, launchd, and the sole port-8088 listener agree on PID 69300, exact
  verified release `6f40b1da`, and Node 22.23.2. Gmail and Slack are connected;
  queues are empty. Outcome review reports `mode=disabled`, zero operators,
  zero runs, no attempt/result/error, and `running=false`. Current-PID JSON logs
  contain 37 lines with zero WARN/ERROR/FATAL records.
- Non-mutation proof: protected PostgreSQL counts/fingerprints remain exactly 21
  work items/version sum 110, 131 work events, 59 receipts, seven exception
  cases, six briefs, 40 exception events, and zero quality receipts. SQLite is
  healthy at 88 email actions / 435 events with zero active actions; five normal
  Slack message rows arrived around the drain/deployment window. The ordinary
  startup exception loop returned `duplicate_brief`, opened/reopened/resolved/
  posted nothing, and only refreshed the active case projection's expected
  `last_seen_at` field. The active 30-day indicator remains 15 accepted, 13
  completed, two incomplete, and 0 assessed / 13 required.
- Authority boundary: dark deployment did not post a review packet, read or
  search Gmail, create an assessment, classify an outcome, send a customer
  message, remediate work, or grant an agent/action path. Configuring one named
  operator and posting the first single packet remain a separate C3 activation
  gate.

### NC-20260820-007 — Add an exact review-gated outcome assessment producer

- Date: 2026-08-20
- Owner/client: Codex
- State: complete; implementation, disposable database proof, immutable release,
  deployment, live default-off refusal, and protected-state proof pass; no real
  assessment receipt was created
- Commit/PR: isolated branch
  `codex/nc-20260820-007-outcome-assessment` from `e5e1a595`; task claim
  `265062f7`; implementation
  `343ae19382add6ff70a08950c6bf721182dcaaec`; release
  `265622bd7cc4632f517dd1e5beb0c22f6ba688e4`; no PR
- Change class: C2 — one explicit admin-only PostgreSQL receipt insert behind a
  standalone CLI; no external communication/action, agent, daemon, scheduler,
  or customer-content path
- Root cause: migration 126 can represent reviewed quality evidence but has no
  bounded way to create a receipt. Direct SQL would lack a stable preview,
  stale-state protection, exact-release proof, and duplicate-response recovery.
- Implementation: `company-work:assess-outcome` accepts one exact work item and
  delivery-event version, one explicit bounded assessment, canonical evidence/
  assessment timestamps, and already-hashed source/evidence/operator keys. Its
  default dry-run verifies the exact Sales external-acknowledgement event,
  validates the complete append-only chain, derives the next revision and
  predecessor, enforces a 15-minute window, and emits a content-free plan
  fingerprint. Apply re-plans inside one transaction and requires that
  fingerprint plus exact hostname, full immutable release commit, and the
  task-specific confirmation before insert.
- Idempotency/correction: the fingerprint binds target, assessment, hashes,
  timestamps, revision, and predecessor while excluding only insert-versus-
  identical-duplicate execution state and its resulting row ID. A retry after
  a lost response is therefore duplicate-only; any intervening correction
  changes the plan. Corrections append/supersede, and the schema still rejects
  update/delete, branch, skipped revision, wrong event, and source reuse.
- Privacy/authority: source system and assessor kind are fixed to
  `operator_review`/`operator`; no raw source key, evidence, operator identity,
  customer address/identity/content, or model output is accepted. There is no
  list, bulk, default-clean, backfill, Gmail/Slack/SQLite read, daemon import,
  agent grant, classifier, message, remediation, or external action authority.
- Verification so far: pinned Node 22.23.2 producer/boundary tests pass 15/15,
  indicator tests pass 10/10, and typecheck/build/format/documentation
  continuity pass. Email-critical tests pass 719/719 plus the independent
  runner build and 43/43 tests. The unrestricted root suite is 2,821/2,822
  passing with five skips; the sole failure is the unchanged pre-existing CNPC
  source-wrapper literal assertion, and all implicated CNPC files match the task
  base. Disposable PostgreSQL 16.15 with exact migrations
  118-126 proves initial apply, identical replay without insert, operator
  revision, intervening-revision stale-plan rejection, fresh revision 4,
  append-only update rejection, one chain head, and the real indicator becoming
  available only after full disposable coverage. The first rehearsal found the
  insert-versus-duplicate fingerprint bug; the corrected contract and a new
  regression test now pass. The disposable server is stopped.
- Deployment/external state: exact release `265622bd` is active with zero
  quality receipts and 0/13 coverage. No Gmail/Slack/content read, assessment,
  message, push, or merge occurred.
- Rollback: before deployment, revert the implementation commit. After
  deployment, activate the retained prior immutable release; no schema/data
  rollback is needed. Any future real receipt remains append-only history and
  is never deleted as code rollback.
- Documentation: active work, Company Work ledger, Company OS plan, project
  map, business data guide, and structure-only schema guide updated.

#### Addendum 2026-08-21T00:14Z — exact default-off producer live

- Release identity: exact commit
  `265622bd7cc4632f517dd1e5beb0c22f6ba688e4` binds source tree
  `7981389ea49a06ba8c8a60e8db162871baa96bf6`, 808 compiled files,
  artifact SHA-256
  `ae858926595894ff062f68cdcd9d5aea3be2724e1c1ba4fedd26d6d70a4457e6`,
  and archive SHA-256
  `19612afd867013a9ad5fb8e05eb8700b4d7c8c321a406f57eb7162a0ded0aef4`.
  The archive independently verifies locally and on the Mini under Node
  22.23.2.
- Drain/backup: preflight proved one healthy listener, zero containers/runtime
  work/outgoing Slack/active email actions, SQLite `quick_check=ok`, and zero
  quality receipts. The owner-only backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-007-20260821T001109Z`
  contains a WAL-safe SQLite copy (SHA-256 `2094a3aa…`) and installed plist
  (`11b69d90…`), both mode 0600; SQLite and plist integrity checks pass. No
  PostgreSQL backup or migration was needed because this activation changes no
  schema and the producer was not applied.
- Activation: dry-run named only code root, expected commit, and executable.
  Apply retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-09bc24081654-2026-08-21T00-11-31-245Z`.
  After the normal brief handoff, health, launchd, and the sole listener agree
  on PID 63259, the exact release identity/code root, and Node 22.23.2. Gmail
  and Slack are connected; runtime/waiting/outgoing queues and active email
  actions are empty; SQLite remains 88 actions/435 events with
  `quick_check=ok`; current-PID stdout/stderr have zero error headlines.
- Non-mutation/refusal proof: work items remain 21/version sum 110, work events
  131, receipts 59, exception briefs/events 6/40, and quality receipts zero,
  with identical pre/post fingerprints. The startup loop returned
  `duplicate_brief` and changed only the seven-row case projection's expected
  `last_seen_at`; it opened, reopened, resolved, posted, and appended zero
  cases/briefs/events. The active 30-day indicator remains 15 accepted, 13
  completed, two incomplete, and 0 assessed / 13 required. An empty producer
  invocation refuses `--work-item-id is required`; `--apply` without its plan
  gate refuses `--expected-plan-sha256 is required with --apply`. Neither can
  reach a business query or write.
- Authority boundary: deployment installs a host-admin tool; it does not
  authorize a customer-outcome classification. No real item was previewed, no
  receipt was inserted, and no Gmail/Slack/customer content, message,
  remediation, bulk/default-clean/backfill, or external action path ran.

### NC-20260820-006 — Add coverage-aware outcome-quality receipts

- Date: 2026-08-20
- Owner/client: Codex
- State: complete for the dark receipt/indicator contract; exact release,
  migration, service health, empty-schema state, coverage gap, and non-mutation
  proof are live-verified; a producer and natural assessment coverage remain a
  separately gated task
- Commit/PR: isolated branch `codex/nc-20260820-006-outcome-quality` from
  `2320e189`; local-only task claim `bb037d0d`; implementation
  `c461e11e5181f868d44dbdd842c481dd75774d72`; no PR
- Change class: C2 — additive admin-only PostgreSQL schema plus a standalone
  aggregate-only read; no daemon, agent, message, approval, or action path
- Root cause: an incident-only receipt would make an empty numerator look like
  zero defects even when no completed customer-visible outcomes were assessed.
  The service indicator needs explicit quality-review coverage and append-only
  corrections before it can publish a rate.
- Implementation: migration 126 adds
  `company_work_outcome_quality_receipts`. Every assessment binds one exact
  `sales_email` `external_acknowledged` event/version and stores only one
  bounded clean/defect/reversal classification, opaque source/evidence/
  assessor SHA-256 keys, assessor kind, and timestamps. A later receipt may
  supersede its immediate predecessor; uniqueness plus a validation trigger
  prevent parallel chains, skipped revisions, non-delivery binding, or time
  travel, and the existing append-only trigger prevents update/delete.
- Indicator contract: contract version 2 counts exact external acknowledgments
  in the accepted-window cohort and selects the one current assessment-chain
  head. It exposes the adverse numerator/denominator/rate only with full
  coverage. Partial coverage returns only aggregate assessed/required/missing
  counts and `outcome_quality_receipt_coverage_incomplete`; malformed evidence
  fails the entire read closed. Internal failure/exception state remains
  ineligible.
- Privacy/authority: the table and function are owned by `nanoclaw_admin` with
  no non-admin grant. No raw customer identity, address, subject, message,
  prompt, or source key is stored. No producer, write CLI, classifier,
  scheduler, daemon import, Gmail/Slack read, message, remediation, threshold,
  SLO, approval, or action authority is added.
- Verification so far: pinned Node 22.23.2 focused tests pass 15/15; typecheck,
  build, diff check, and documentation continuity pass. Disposable PostgreSQL
  16 proves exact migration apply, initial assessment, superseding correction,
  branch/wrong-event/update rejection, one current head, and an available 1/1
  adverse aggregate through the real TypeScript query. A separate empty
  rehearsal proves the guarded rollback removes table/function; assessment
  history would block rollback. Email-critical tests pass 719/719 plus the
  independent runner build and 43/43 tests. The unrestricted suite is
  2,806/2,807 passing with five skips; its sole failure is the unchanged,
  pre-existing CNPC source-wrapper literal assertion, and neither implicated
  CNPC file differs from the task base.
- Deployment/external state at the pre-release review boundary: no production
  migration, release build, activation, restart, assessment receipt, customer
  incident, Gmail/Slack read/write, message, push, or merge had occurred under
  NC-006.
- Rollback: before migration, revert the implementation commit. After an empty
  migration, use the guarded rollback. After any receipt exists, leave the
  additive table dormant or use a separately reviewed archival migration; do
  not delete assessment history.

#### Addendum 2026-08-20T20:17Z — migration 126 and exact release live

- Release identity: exact commit
  `09bc2408165449edc32a2cb29868b2bc5b628666` binds source tree
  `82a6b1f490d0e0cbc32535b396e7926a9e760016`, 800 compiled files,
  artifact SHA-256
  `59781d6126200739fb6f6ef1080b90aef5e7de656b104cc2008d92dbf8c5c593`,
  and archive SHA-256
  `598de975e561b3374a66fb79d2cfab37849661f42823fe41efff7040fd3b550a`.
  Local release gates and Mini bundle/runtime verification pass on Node
  22.23.2.
- Drain/backup: zero containers, active/waiting groups, outgoing Slack work,
  and active email actions plus SQLite `quick_check=ok` preceded mutation. The
  private backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-006-20260820T201436Z`
  contains a WAL-safe SQLite copy (SHA-256 `5ee58c34…`), installed plist
  (`53b1db41…`), and full custom-format PostgreSQL dump (`0a484a7e…`); SQLite
  quick-check and `pg_restore --list` pass.
- Migration: exact SHA-256
  `d3cd74c37a73b6a5645efc8a79b49c554e545d8ec9be34f6c15a5450449c8962`
  applied transactionally before activation. Live structure has zero rows, 17
  constraints, six indexes, two enabled triggers, admin table/sequence/
  function ownership, zero non-admin table/sequence grants, and zero forbidden
  content columns. Existing protected counts remain 21 work items/version sum
  110, 131 events, 59 receipts, seven cases, six briefs, and 40 case events.
- Staged and active proof: both exact 30-day reads return 15 accepted, 13
  completed, two incomplete, 86.67% completion, and unchanged p50/p95/max
  latency of 29m01.725s/6h16m18.994s/9h25m12.618s. They find 13 exact
  customer-visible outcomes, zero assessed, and 13 missing, and withhold the
  adverse numerator/denominator/rate with
  `outcome_quality_receipt_coverage_incomplete`. Immediate before/after
  PostgreSQL fingerprints are identical.
- Activation/health: dry-run and apply changed only code root, expected commit,
  and executable. The retained rollback plist is
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-a02abacaf469-2026-08-20T20-16-05-621Z`.
  After one transient first PID observation, health, launchd, and the sole
  listener converged on PID 82117 with exact release identity, connected
  Gmail/Slack, empty queues, zero active email actions, SQLite 87 actions/430
  events and `quick_check=ok`, and no current-process stderr or post-marker
  WARN/ERROR/FATAL headline.
- Attribution/boundary: startup's ordinary exception loop re-observed current
  cases and returned `duplicate_brief`; it created no brief/message and did not
  mutate the Company Work ledger. NC-006 created no assessment receipt,
  customer incident, Gmail/Slack source read, external message, remediation,
  threshold/SLO, approval, or action authority. Zero receipts means missing
  coverage, never zero defects.

### NC-20260820-005 — Add truthful Sales service-indicator baseline

- Date: 2026-08-20
- Owner/client: Codex
- State: complete; exact release, service health, bounded production read, and
  non-mutation proof are live-verified
- Commit/PR: isolated branch
  `codex/nc-20260820-005-service-indicators`; implementation commit
  `b71bfae2fd48cbd5a7e64419b1d20b0311a0a34a`; no PR
- Change class: C2 — standalone aggregate-only PostgreSQL read; no schema,
  daemon path, workflow, customer message, approval, or action change
- Root cause: the durable Company Work ledger and exception report expose
  individual Sales email state, but no consistent aggregate baseline for
  accepted/completed work or completion latency. The system also has no
  canonical receipt proving a customer-visible defect or reversal; treating
  an internal blocked/failed/source-gap state as that outcome would invent
  evidence.
- Implementation: one static, bounded aggregate `SELECT` cohorts exact
  `sales_email` accepted events, requires one matching later
  `outcome_validated` event and terminal state for completion, and returns
  accepted/completed/incomplete counts, completion rate, and p50/p95/maximum
  accepted-to-completed latency. Duplicate or contradictory cohort evidence
  makes the whole result `ledger_quality_failed`.
- Evidence gap: customer-visible defect/reversal rate is explicitly
  unavailable with `no_canonical_customer_visible_defect_receipt`. No
  objective, SLO, threshold, alert, or proxy is guessed from internal
  exceptions.
- Privacy/authority: JSON and text output contain only aggregate counts,
  rates, latency, window timestamps, and closed reason codes. The command is
  not imported by the daemon, projector, exception loop, or email path and has
  no identifier/content selection, Gmail/Slack source read, database write,
  schedule, post, send, approval, or resolution capability.
- Verification: pinned Node 22.23.2 focused tests pass 7/7; typecheck,
  production build, source formatting, diff check, and documentation
  continuity pass. Email-critical tests pass 719/719 plus the independent
  runner build and 43/43 tests. The unrestricted suite is 2,798/2,799 passing
  with five skips; its sole failure is the unchanged CNPC source-wrapper
  literal assertion in `cnpc-prompt-contract.test.ts`.
- Deployment/external state: no deployment, restart, database/schema write,
  message, email, approval, schedule, push, or merge has occurred under
  NC-005 at this review boundary.
- Rollback: before deployment, revert the implementation commit. After
  deployment, activate the retained prior immutable release; no data rollback
  or migration is required.

#### Addendum 2026-08-20T19:44Z — immutable release and live baseline

- Release identity: exact commit
  `a02abacaf4690f696cc6135fc46ca758588e6515` binds source tree
  `99ac2ebd5a7c144c1bad00613d0e961f35b2ec98`, 800 compiled files,
  artifact SHA-256
  `1fe90d001ac0d5850fd7d5db00ea5bc76a5fc3d5511cc4f50107c785405a0228`,
  and archive SHA-256
  `d0a77be6a4390697713ac2b1ac8f354825bf70e3d8dad2b0f565c7274e0b8ce7`.
  Fresh local extraction and Mini bundle/runtime verification passed on Node
  22.23.2.
- Staged proof: before activation, the compiled candidate ran one exact
  30-day production read from the operational working directory. It returned
  15 accepted, 13 completed, two incomplete, 86.67% completion, p50
  29m01.725s, p95 6h16m18.994s, and maximum 9h25m12.618s. Company Work and
  exception counts, version sum, and maximum timestamps were identical before
  and after.
- Drain/backup: activation required zero containers, active/waiting groups,
  outgoing Slack work, and active email actions plus SQLite `quick_check=ok`.
  The mode-0600 WAL-safe backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-005-20260820T194200Z`
  has SQLite SHA-256
  `90041df997f60d2eb95129c2665be267667fd9b273e7bba3edd2f1742740b9bc`.
  The activator retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-eb5fbaa171e6-2026-08-20T19-42-11-271Z`.
- Activation/health: dry-run and apply changed exactly code root, expected
  release commit, and executable. PID 10617 reports exact commit/tree/artifact
  and code-root match under Node 22.23.2. Gmail and Slack are connected; one
  listener, zero containers/groups/waiters/outgoing Slack/active email actions,
  and no WARN/ERROR/FATAL headline after the release-integrity marker are
  verified.
- Active proof: the same exact 30-day command from the active release
  reproduced the staged baseline. Its immediate before/after fingerprint is
  unchanged at 21 work items, version sum 110, 131 events, 59 receipts, seven
  exception cases, six briefs, and 40 exception events with identical maximum
  timestamps. SQLite remains 87 actions (81 confirmed, six blocked), 430
  events, zero active actions, and `quick_check=ok`.
- Attribution/boundary: the ordinary startup exception loop re-observed seven
  current cases and advanced their `last_seen_at` before the active command;
  work-item/event/receipt state did not change, and the command's own
  before/after fingerprint is identical. No customer content/identifier,
  Gmail or Slack source read, message, email, approval, schema, workflow,
  schedule, threshold/SLO, or action authority was created. The unavailable
  customer-visible defect/reversal field is an evidence gap, not a zero-defect
  claim.

### NC-20260820-004 — Attach bounded contact-form entry context at ingress

- Date: 2026-08-20
- Owner/client: Codex
- State: deployed_unverified; exact website, n8n, NanoClaw release, prompts,
  channels, and queues are live-verified, while a natural contact submission
  remains pending
- Commit/PR: NanoClaw implementation
  `eb5fbaa171e66996dd1dda300dc4f11717e768af` on isolated branch
  `codex/nc-20260820-004-contact-context`; Tandem website production commit
  `bdf8fd9b39de8070f28cd1139055c8a657ef492a`; no PR
- Change class: C2 — additive, privacy-reduced source context across the
  existing WordPress, n8n, Inbox, and Sales path; no new tracking, database
  schema, mailbox/search, approval, or send authority
- Root cause: WordPress already captured and persisted the contact page's
  referrer, but omitted it from both immediate webhook delivery and retry.
  The live n8n workflow then allowlisted no page context, the Inbox packet and
  handoff had no context field, and Sales' generated knowledge still suggested
  a later email-keyed Chaos lookup. Vague page-relative questions therefore
  required an avoidable clarification or manual reconstruction.
- Website contract: both immediate delivery and durable retry use one payload
  builder. It reduces an internal Tandem referrer to a path, strips query and
  fragment, reduces an external referrer to `external:<hostname>`, suppresses
  the known `/contact-us/` self-referrer, and emits no raw referrer.
- Ingress and agent contract: the tracked n8n mapper validates the bounded
  `entry_page`; the contact webhook attaches it to the Inbox packet; Inbox
  preserves only a non-empty host value. Sales may use it only to resolve an
  explicit page-relative reference when the official page is unambiguous. It
  may not infer relationship, intent, facts, price, cohort, recommendation,
  route, CTA, approval, or send authority and may not augment it with Chaos.
- Failure/privacy boundary: missing, stale, malformed, generic, or ambiguous
  context becomes empty and the contact continues through the existing path.
  No raw query, fragment, journey history, IP, fingerprint, synthetic contact,
  customer email, or autonomous action is introduced.
- Verification: all 26 Tandem plugin PHP harnesses on the rebased production
  candidate pass, including the new
  seven-case context suite and existing 13-case referrer suite; PHP syntax and
  diff checks pass. NanoClaw's focused contracts pass 47/47 on pinned Node
  22.23.2, along with format, typecheck, production build, and documentation
  continuity. The unrestricted suite is 2,791/2,792 passing with five skips;
  its sole failure is the unchanged CNPC source-wrapper literal assertion in
  `cnpc-prompt-contract.test.ts`.

#### Addendum 2026-08-20T19:19Z — three-system production rollout

- Website: Tandem website commit `bdf8fd9b3` was rebased onto current
  `origin/main`, all 26 plugin harnesses and PHP syntax passed, and the commit
  was pushed to `main`. The production webhook deployed that exact commit,
  purged LiteSpeed and Cloudflare successfully, left the plugin active, and
  installed a byte-identical contact handler.
- n8n: active workflow `1`, `Contact Form → Gru Inbox`, was exported before
  mutation to a mode-0600 backup with SHA-256
  `05e823cfc8121a3502f6b00f1d5db9381eba8895e366def34337d578cab276eb`.
  Import changed only the `Sanitize & Extract` Code node, then the workflow was
  explicitly republished and n8n restarted. Final export proves `active=true`,
  exact equality with the tracked sanitizer, and no other workflow structural
  change. The container is running and startup activated workflow `1`.
- NanoClaw release: exact commit `eb5fbaa171e66996dd1dda300dc4f11717e768af`
  binds source tree `15517a28157181b1b60bd556bec362a2cbef2ada`, 792
  compiled files, artifact SHA-256
  `3fdd305c62ba449bb526b792f0d052251c35fcfceb1dc256f5e0f95597347e75`,
  and archive SHA-256
  `d7255a51b99726fa9f3ca085c7878aa8b221e948860b6f2282dabd033922a938`.
  Fresh local and Mini extraction/runtime verification passed on Node 22.23.2.
- Drain and rollback: one real Sales container was allowed to finish rather
  than being killed. Activation waited for zero containers, active groups,
  waiting groups, Slack outgoing work, and active email actions. The WAL-safe
  backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-004-20260820T190413Z`
  passed `quick_check`; its SQLite SHA-256 is
  `e727ac48eb72456cd0cd9d986260e60a78508ce23e60734c94e75d601fe76849`.
  It also preserves the plist, four operational prompt files, and exact prior
  webhook definitions. Activation retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-bab154cbdadf-2026-08-20T19-17-04-069Z`.
- Operational inputs: Inbox and all three Sales instruction files were
  installed only after their live hashes matched the prior immutable release.
  The machine-local webhook definition retained its CNPC entry and secret and
  changed only the contact prompt. Final hashes match the reviewed release or
  bounded merged definition, and the loaded contact prompt contains
  `Entry-Page: {{payload.entry_page}}`.
- Live proof: PID 2211 reports the exact commit/tree/artifact/code root under
  Node 22.23.2 with release verification and code-root match. Gmail and Slack
  are connected; one listener, zero containers/groups/waiters, zero Slack
  outgoing work, zero active email actions, and SQLite `quick_check=ok` are
  verified. No WARN, ERROR, or FATAL headline follows the release-integrity
  marker. The webhook server started with the installed definitions.
- Outcome boundary: no synthetic contact or customer email was created. The
  next genuine contact submission must prove a bounded `Entry-Page` reaches
  Inbox and Sales, or fails open when missing, without a Chaos search or
  unnecessary clarification. Until then the business outcome remains
  `deployed_unverified`.

### NC-20260820-003 — Deliver source-bound Company OS work to Chief

- Date: 2026-08-20
- Owner/client: Codex
- State: deployed_unverified; exact runtime, schema, channels, queues, prompt
  installation, and protected aggregates are verified, while a natural new
  work packet and Chief pickup remain pending
- Commit/PR: implementation `8543c1b8a6a0863e7e62eace06fc5f530fca7b4d`
  and deployment candidate `bab154cbdadf76962373272d6a4960cb926d3794`
  on isolated branch `codex/nc-20260820-003-source-bound-work`; no PR
- Change class: C2 — additive host routing, local SQLite identity, Chief
  behavior, and exception-loop delivery; no broadened mailbox, send, approval,
  or workflow authority
- Root cause: the recurring Company Work loop posted an untagged bot brief.
  Slack's host router correctly filtered that as bot noise, so Chief did not
  wake to own the exceptions. When an operator later asked Chief to act, the
  privacy-minimized ledger contained only an opaque Sales action key; no host
  path reattached the original Mailman handoff. Chief therefore lacked the
  source email and attempted a correctly denied `gmail_search`.
- Ingress identity: matched direct Mailman-to-Sales handoffs now preserve both
  inbound Thread-ID and Message-ID. Approval capture records that exact Gmail
  Message-ID on the authoritative SQLite email action; startup adds only the
  nullable `pending_sends.source_gmail_message_id` column and its index.
  Binding is fill-once and rejects conflicting identity.
- Source hydration: the host resolves only `sales_email` Company Work items
  whose PostgreSQL `source_key` names an exact SQLite email action. It follows
  that action to the exact Sales Slack root, accepts only consecutive
  Mailman-authored inbound fragments, validates Thread-ID/Message-ID, caps the
  attached source, and fails closed on missing or conflicting lineage. Legacy
  actions may be backfilled only from that trusted root. Customer text is
  labeled untrusted evidence in the packet.
- Actionable delivery: after the bounded Chief brief, the loop posts one
  tracked `[HANDOFF: company-os→chief]` packet per visible exception with
  `from_group=company-os`, exact work identity, reasons, and source status.
  The brief is durably bound only after every packet receives a tracked Slack
  receipt; partial delivery is marked uncertain and cannot be acknowledged.
- Gmail containment: a complete packet needs no Gmail call. A truncated packet
  permits at most one exact `gmail_read(messageId)`. After restart that read is
  authorized only when SQLite maps the same message to a Sales action and
  PostgreSQL maps that action to a `sales_email` Company Work item with a
  still-active exception case. Chief still cannot search, discover threads,
  reply, or send through this path. Denial receipts now name the requesting
  group and accurately state that no other agent received the result.
- Agent contract: Chief must immediately triage Company OS work packets, use
  attached source when complete, perform one exact read only when explicitly
  truncated, and report a named source-context failure instead of searching or
  guessing. Triage is not resolution and does not bypass operator approval.
- Verification: exact Node 22.23.2 typecheck, production build, source
  formatting, and 303/303 focused tests pass. The email-critical gate passes
  719/719 plus the independent runner build and 43/43 tests. The unrestricted
  suite is 2,781/2,782 passing with five skips; its sole failure is the
  unchanged CNPC source-wrapper literal assertion in
  `cnpc-prompt-contract.test.ts`. Documentation continuity passes after these
  records are reconciled.
- Deployment authorization: the owner authorized production deployment at
  2026-08-20T17:49Z. Customer email, manufactured work, push, and merge remained
  excluded.

#### Addendum 2026-08-20T18:21Z — immutable production activation

- Drain and backup: production began on exact release `8344524c`, PID 38712,
  Node 22.23.2, one listener, connected Gmail/Slack, zero active email actions,
  and empty outgoing/runtime queues. A natural Procurement container started
  before activation and was allowed to finish; the apply gate did not pass
  until containers, active groups, queue work, outgoing Slack, child processes,
  and active email actions all returned zero. A fresh WAL-safe SQLite/plist
  backup at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-003-20260820T181520Z`
  has mode-0600 SQLite SHA-256
  `c0c529fe3958bc030aa1fa60b081500e7d73c1926714924fc25294a60024d3b5`,
  size 118,702,080 bytes, and `quick_check=ok`; the predeploy plist SHA-256 is
  `2c097f122e13a4209efb4072e438efceb7047ed3c4162e69571a16dba7ba5105`.
- Release: candidate `bab154cbdadf76962373272d6a4960cb926d3794`
  binds source tree `e31362d8c8b858f420144d3d6777dde079b51c94`, 792
  compiled files, artifact SHA-256
  `3fdd305c62ba449bb526b792f0d052251c35fcfceb1dc256f5e0f95597347e75`,
  and archive SHA-256
  `c340087fe532a0df711a2fa344e9c13a080ae6b77f4cf5bc79c3f19deeb8aa5`.
  Fresh local and Mini extraction/runtime verification passed under exact Node
  22.23.2. Dry-run reported only `NANOCLAW_CODE_ROOT`,
  `NANOCLAW_EXPECTED_RELEASE_COMMIT`, and `ProgramArguments[1]` changing.
- Activation: the recovery-safe helper moved `8344524c` to `bab154cb` and
  retained rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-8344524cf4a4-2026-08-20T18-15-35-331Z`.
  Launchd and the sole TCP listener converge on PID 73082. Health reports the
  exact commit/tree/artifact/code root, Node 22.23.2, connected Gmail/Slack,
  zero active containers/groups/queue items, and zero outgoing Slack work.
  No WARN, ERROR, or FATAL headline occurs after the new release-integrity
  startup marker.
- Operational inputs: the Chief prompt was merged rather than overwritten so
  its pre-existing exact grader-file text rule remained intact. Installed
  SHA-256 is
  `5ca4a71725ccf4ba635f16bbd5a8f4812b87631ed96eb85e88503eba9423abf0`;
  the exact prior file is backed up with SHA-256
  `b0465f6f0a7edd83e7b094cd753cafee37b33ddf314846be54c4c63443e5f677`.
  The mounted business guide and structure-only SQLite schema were backed up
  and installed from the reviewed candidate at SHA-256s
  `28de24a32c4133ba9314317a7cf3fbd17090cd7d197614e1a0405d12c40e1e5b`
  and `31246c4ecfc27a378095fe22b42c2561a0409f227a2d36cfdce55982c69faf12`.
- State invariants: live SQLite has `quick_check=ok`, exactly one
  `source_gmail_message_id` column and one
  `idx_pending_sends_source_gmail_message` index, 80 confirmed/6 blocked
  actions, and zero active actions. PostgreSQL remains 3 acknowledged + 4 open
  exception cases, 6 posted briefs with maximum ID 10, and 5 `host_job_run` +
  1 `program_facts_drift` + 15 `sales_email` work items.
- Natural-proof boundary: the startup loop ran successfully and returned
  `duplicate_brief` for today's already-posted unchanged fingerprint (21 items
  scanned, 3 visible exceptions, 7 active cases). It posted zero work packets,
  which is correct deduplication but not business-path proof. Await the next
  natural new/change-fingerprint brief; do not alter work state or send an email
  to manufacture it. This deployment sent no customer email and performed no
  PostgreSQL write, approval, push, or merge.

### NC-20260820-002 — Route program-facts drift into durable Company Work

- Date: 2026-08-20
- Owner/client: Codex
- State: deployed_unverified; detector and Chief pickup are live-verified,
  while owner source correction and exact clean closure remain pending
- Commit/PR: implementation
  `8344524cf4a439b84eb792cdf7b4a16b65178a6a` on
  `codex/nc-20260820-002-program-facts-work`; no PR
- Change class: C2 — additive host-owned schema and scheduled-job behavior,
  with separately authorized production migration, activation, and bounded
  detector/Chief proof
- Root cause: the deterministic program-facts job posted its finding directly
  to Sales Slack and stopped. The normalized trigger store, Company Work
  ledger, report, and recurring Chief exception loop therefore had no source
  record to discover, deduplicate, route, or source-resolve.
- Detector evidence: the source job now binds detector version, canonical
  order-independent finding fingerprint, source-file SHA-256s, checked count,
  and payload digest. The legacy result API remains compatible.
- Atomic pickup: active mode uses one PostgreSQL transaction to record the exact
  scheduled job's `business_condition` occurrence, ensure one stable
  `program_facts_drift` item, append one minimized observation, and route drift
  to `accepted/blocked` with
  `fact_authority:owner_review_required`. It never parses Slack.
- Lifecycle: exact run replay converges; unchanged later findings remain durable
  without repeating the Sales alert; changed findings alert again; a clean
  detector rerun with a matching outcome receipt is the only closure; a later
  recurrence explicitly reopens and re-blocks the same source item. The report
  validates the recurrence/event/receipt counts rather than accepting repeated
  lifecycle facts blindly.
- Schema: migration 125 widens only the typed workflow/completion/event values
  and creates append-only `company_program_fact_observations`. It stores opaque
  occurrence/work IDs, version, timestamps, counts, and SHA-256 evidence—no
  raw finding, fact, knowledge, product, customer, prompt, or action payload.
  Ownership is `nanoclaw_admin` with zero non-admin grants.
- Runtime boundary: `PROGRAM_FACTS_COMPANY_WORK_MODE=off` is tracked. Off mode
  preserves the legacy notify-only behavior; invalid values refuse; active mode
  applies durable state before posting. The host job runner now passes its exact
  durable run UUID and start time to every child. The installed job definition
  is unchanged and still uses the legacy source wrapper.
- Resolution boundary: the existing complete Company Work report and recurring
  Chief loop can pick up the new named block on their next tick if this slice is
  promoted. Chief acknowledgment remains attention-only. The detector and
  healer cannot choose fact authority or edit facts, Sales knowledge, products,
  website content, email, or another source system.
- Focused verification: exact Node 22.23.2 runs 58/58 detector, job-mode,
  trigger/work adapter, state-policy, migration, report, and exception-loop
  tests; typecheck, production build, formatting, documentation continuity,
  schema sanitizer, and capability parity pass.
- Database proof: a real disposable PostgreSQL 16 cluster applied migrations
  118 -> 119 -> 121 -> 125 and executably proved one stable item across open,
  exact replay, changed finding, clean close, and recurrence (four occurrences,
  four observations, one reopen). Append-only mutation failed, non-admin grants
  were zero, populated rollback refused without data loss, and empty rollback
  restored the prior constraints and removed only the empty additive table.
- Regression evidence: the email-critical gate passes 715/715 plus the
  independent runner build and 43/43 tests. The unrestricted root suite is
  2,768/2,769 passing with five skips; its sole failure is the unchanged CNPC
  source-wrapper literal assertion in `cnpc-prompt-contract.test.ts`.
- Release evidence: the exact implementation commit produced source tree
  `fac86f42aebcaf2e765ec16024fc679e9fa8aca1`, a 788-file compiled artifact
  with SHA-256
  `e257edaab70dfe7fc05b4f5b9a21068aa39ffd8351e385620e0610021a4729b3`,
  and archive SHA-256
  `5c40601869f7f13df3b0394965214d0a3aa711b1d90a1f4ab98bbdc7f1873f9e`.
  Fresh-directory `verify-release --runtime` independently passed under the
  pinned Node 22.23.2.
- Pre-deployment boundary: no production database, job definition, environment,
  daemon, Slack message, fact/knowledge file, action, release, push, or merge was
  changed. Backup, migration 125 apply, compiled-job cutover, active-mode
  canary, natural Chief pickup, owner correction, and clean-rerun closure are a
  separately authorized deployment milestone.

#### Addendum 2026-08-20T16:03:47Z — production activation and detector-to-Chief proof

- Preflight and drain: the authenticated Mini was `mini-claw.local` at current
  Tailscale peer `100.115.115.206`; the saved SSH alias still pointed at stale
  `.204` and was bypassed without modifying user configuration. Production
  naturally drained from two active Sales/Procurement containers to zero.
  SQLite `quick_check` was `ok`; active email states, waiting tasks, running
  jobs, scheduler work, and outgoing Slack queue were all zero before mutation.
- Backup: an initial full-database `pg_dump` failed closed on the existing
  RLS-protected legacy `public.procurement_opportunities` table. Its incomplete
  archive and exact directory were immediately removed; no RLS was weakened.
  The established complete affected-schema backup then succeeded at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260820-002-20260820T155533Z`.
  Its mode-0600 custom-format `business_v2.dump` is 9,721,974 bytes, has
  SHA-256 `50e1903768db96fb82f9b2d502c249d4df2373cfa1aea5e26043a5330adf522a`,
  and passes `pg_restore --list`; owner-only environment and job-definition
  snapshots have SHA-256s
  `a9c09900cb66450106ace7f52488460cdc5358a88189ac23fc0efc39f42160e6`
  and `b3fc5040565df2ff2f2bcdc962320a7ff27a69df9b56176b19de365da6ab164c`.
- Schema: exact migration-125 SHA-256
  `74b46ba274c2637a7409b49dc4c9da9a02f64be57011fa3b5456f55d62fd8ee9`
  applied transactionally from the verified release. Live structure has the
  expected observation columns, 14 constraints, one enabled append-only
  trigger, `nanoclaw_admin` ownership, and zero non-admin table or sequence
  grants. It was empty before activation.
- Release and configuration: archive SHA-256
  `5c40601869f7f13df3b0394965214d0a3aa711b1d90a1f4ab98bbdc7f1873f9e`
  verified again on the Mini, and the activator moved from `64f1421e` to exact
  release `8344524cf4a439b84eb792cdf7b4a16b65178a6a`, retaining rollback plist
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-64f1421e4650-2026-08-20T15-57-27-096Z`.
  Healthy PID 38712 reports matching release/code root, Node 22.23.2, connected
  Gmail/Slack, and empty queues. The production mode is `active`; the existing
  `program-facts-drift` job now uses `dist/program-facts-drift-job.js` while
  retaining `0 8 * * *`, `America/Chicago`, and its timeout. Post-cutover
  environment/jobs SHA-256s are
  `ab578eb530db8545cfab3998b54ab5931dd2d6ba8cac060dfb427bafafe0352c`
  and `526e253bee05a1edeafdf648dc934dcb7921882da3fb27f78f44949d7235e324`.
- Live detector proof: direct exact-release canary
  `nc002-canary-20260820T155614Z` checked three programs, found two drift
  issues, created stable Company Work item 21 at version 1 in
  `accepted/blocked`, appended observation 1, and posted one backend-enabled
  Sales alert. The restarted recurring exception loop scanned 21 items, opened
  the exact owner-review case, and posted Chief brief 10 at Slack timestamp
  `1787241455.313609` with no source-work mutation.
- Real scheduler proof: one exact Campanero `jobs_mutate` IPC request produced
  job-run `4d63f2dd-d0f6-4eeb-836d-a4f76418282a`, triggered by `campanero`,
  exit 0 in 224 ms. It added observation 2 to the same item without reopening
  or posting a duplicate Sales alert. Read-only Slack evidence found exactly
  one matching Sales alert and one matching Chief brief in the bounded window.
- Final state: PostgreSQL has 21 work items, 131 work events, 59 work receipts,
  3 trigger occurrences, 7 exception cases, 6 briefs, and one program-facts
  item with two drift observations and zero reopens. SQLite `quick_check=ok`;
  active email states, waiting tasks, running jobs, and queued Slack messages
  are zero; the daemon has no new error lines. The open case is intentional:
  the owner must decide fact authority and correct the conflicting sources,
  after which an exact clean scheduled rerun must complete item 21 and
  source-resolve its case. No fact/knowledge/product/site/email source was
  edited, and no branch push or merge occurred.

### NC-20260818-003 — Freeze natural inbound Gmail history gaps

- Date: 2026-08-18
- Owner/client: Codex
- State: deployed_unverified; normal cursor mirroring and the exact-message-404
  repair are live-verified, while a natural history-list expiry remains pending
- Commit/PR: claim `a85def4a` on
  `codex/nc-20260818-003-gmail-gap-freeze`; initial implementation
  `b7aab9b7ef6baa6e41a9227723ecbd8fb39fe5df`; repair
  `64f1421e4650c64b2f9a173cc4e8c51a2dc8c36b`; no PR
- Change class: C2 — host-owned cursor/watermark behavior plus one separately
  confirmed, receipt-backed Gmail metadata read and internal PostgreSQL advance
- Initial release: source tree
  `30d95ec00032c8dfd8031769311dcefbf4ae13a2`, 780 compiled files, artifact
  SHA-256 `d8e47691c9b9330f10451dc9f7a9c7856123e79f1c45f490cb2fc3b686ba037b`,
  and archive SHA-256
  `ad541d8cd8a8977baa365c82976348cc429cb92f076c0b09850fd69e9120b6a2`
  independently verified locally and on the Mini.
- Implementation: `COMPANY_GMAIL_RUNTIME_WATERMARK_MODE` defaults to
  `freeze_only`, which retains the exact SQLite cursor on 404. After an exact
  separately confirmed alignment, `active` preflights source/state/SQLite,
  records a content-free generic normal advance before SQLite moves, permits
  SQLite catch-up only across the exact last committed advance, records one
  natural `history_expired` gap, and stops before calling Gmail while the gap
  remains open. Missing receipts, cursor/source/state drift, page overflow,
  PostgreSQL failure, and unaccounted candidates all retain SQLite.
- Alignment boundary: `company-gmail:align-runtime` accepts cursor SHA-256
  fingerprints rather than raw cursor arguments, opens SQLite read-only and
  query-only, calls only chronological `users.history.list` for
  `messageAdded`, filters at the fixed SQLite target, caps at 20 pages, and
  requires immutable accepted/rejected receipts for every in-range candidate.
  Apply rechecks both authorities and SQLite stability inside the PostgreSQL
  transaction; reports contain only counts, fingerprints, and fixed
  `actionAuthority: none`.
- Initial local verification: exact Node 22.23.2 typecheck/build and 118 focused
  Company OS/Gmail tests passed; email-critical was 712/712; the independent
  runner build and 43/43 tests, formatting, schema sanitizer, documentation
  continuity, and capability parity passed. A real disposable PostgreSQL 16
  cluster applied
  migration 122, committed one receipt-backed alignment, allowed only the
  exact SQLite crash catch-up, recorded one gap with the prior cursor fixed,
  and rejected ordinary advancement while open. The stopped temporary cluster
  was removed. The unrestricted suite is 2,743/2,744 with four skips; its sole
  failure is the unchanged CNPC wrapper-literal assertion.
- Pre-activation safety: Procurement drained naturally before the prior daemon
  stopped. Mode-0600 dual backups at
  `~/.local/share/nanoclaw-backups/NC-20260818-003-20260818T201125Z` include a
  WAL-safe 116,154,368-byte SQLite database with `quick_check` `ok` and SHA-256
  `2a9ab60bf61b535cc678bda4ac2a313feb5e617f1859ef101a6d7f945fa91f9d`,
  plus a 9,620,996-byte PostgreSQL custom dump with 733 catalog entries and
  SHA-256 `4148afc7135d8b9d11d8818e57ee238cc2cd1bb3398e2892c672becd53f8785b`.
- Alignment/activation: a fixed one-page chronological walk accounted for all
  60 candidates as 34 accepted and 26 rejected, zero unknown. Apply advanced
  the generic source exactly once to version 2/current with event fingerprint
  `4a36c191387324c7f556aab003516692aedd60dfd49ca37849ae0d36f15f004d`
  while SQLite remained query-only. Active mode was then armed and exact
  release `b7aab9b7` started as fresh PID 65196 under Node 22.23.2 with Gmail
  and Slack connected. Its rollback plist is
  `com.nanoclaw.plist.rollback-dc3e5f0da185-2026-08-18T20-13-26-998Z`.
- Separately attributed restart effect: one existing Procurement source
  exception caused the Company Work loop to post a source-derived Chief brief.
  The Gmail bridge itself created no task, action, email, or external message.
- Natural finding: the first ordinary ten-minute Gmail safety poll scanned 11
  candidates and held its cursor with two unaccounted IDs. Exact logs prove
  `history.list(messageAdded)` returned both IDs and
  `users.messages.get(format=full)` returned exact HTTP 404 for each. The
  deployed bridge correctly kept SQLite and the generic version-2 watermark
  equal/current, recorded no gap, and caused no work/action side effect, but
  the original closed receipt vocabulary had no honest terminal for this case.
- Repair: exact full-message 404 now writes immutable
  `rejected/message_unavailable` with content-free evidence and lets ordinary
  accounting continue; all non-404 fetch failures still throw and hold. Startup
  transactionally widens the SQLite reason constraint while preserving rows
  and recreating both append-only refusal triggers. Focused tests are 51/51,
  email-critical is 715/715, the independent runner build and 43/43 tests and
  typecheck pass. The unrestricted suite is 2,746/2,747 with four skips; its
  sole failure is the unchanged CNPC wrapper-literal assertion.
- Repair artifact: source tree
  `f45c6c10fc653f3ece45778e705bc6100917d471`, 780 compiled files, artifact
  SHA-256 `27038b4919572d2cd3952df36d219d2d29495754a6ba65aedfbfcac1a34d5a1b`,
  and archive SHA-256
  `d346e49ef4c751df61e2a274d416cce83f07aa8777be057feef4da4b83d87136`
  independently verified after fresh local and production extraction.
- Copied-live migration: a WAL-consistent temporary copy preserved all 133
  receipt rows at aggregate SHA-256
  `6779093a457dbb265583355715aba2f6474fc53bc623bdd6be1df055e2ac0905`,
  added the exact reason constraint, recreated both named append-only triggers,
  executably refused update/delete, and retained `quick_check` `ok`.
- Repair drain/backup: the guarded helper refused until attempt 3, then stopped
  exact prior PID 65196 only with zero containers, active/waiting queues, Slack
  outgoing messages, or active email actions. The fresh owner-only dual backup
  at `~/.local/share/nanoclaw-backups/NC-20260818-003-20260818T204301Z`
  contains a 116,174,848-byte SQLite backup with `quick_check` `ok` and SHA-256
  `33ca21cf8c20ef7ffbec967695d8907b0e7f0438cc84597a7cff10fa4b116774`,
  plus a 9,622,465-byte PostgreSQL custom dump with 733 catalog entries and
  SHA-256 `ef738c22783c78d91dfbe0f74e62e148944ad7376391a1e309c4bc6df2130017`.
- Live schema/activation: the startup migration preserved all 136 pre-cutover
  receipt rows at aggregate SHA-256
  `069b075ac1f8f8e6831fbcb1949d615e6381aba9209950229b0ee30b78644cc9`,
  widened only the reason constraint, retained both executable triggers, and
  passed `quick_check`. Recovery-safe activation changed only the three release
  pointers, retained rollback plist
  `com.nanoclaw.plist.rollback-b7aab9b7ef6b-2026-08-18T20-44-20-160Z`, and
  started exact fresh listener PID 10482 with Gmail/Slack connected.
- Natural normal-delta proof: an unmanufactured Gmail push retried the stalled
  range, recorded exactly two `rejected/message_unavailable` receipts, and
  committed version 3 as 17 observed = 10 accepted + 7 rejected. Two more
  natural pushes committed 2 = 2 + 0 and 0 = 0 + 0, leaving version 5/current,
  no open gap, and both cursors equal. Receipt count moved 136 to 142 from two
  unavailable, two rule-auto-archive, one own-outbound, and one Spam/Trash
  terminal. Gmail messages, email actions/events, Company Work items/events/
  receipts, scheduled tasks, groups, and trigger occurrences are unchanged;
  two new classifications are attributable ambient inbound processing. Queues
  are empty and the production error log is unchanged since 2026-08-15.
- Boundary/next gate: normal mirroring is live-verified, but a message-get 404
  is not a history-list expiry and did not create a gap or recover content.
  Observe one natural `users.history.list` expiry and require one
  `history_expired` gap with both cursors frozen before any separately approved
  snapshot/reconciliation work. Do not manufacture expiry or skip a cursor.
  Full-snapshot recovery, `gap_reconciled`, and label-poll expiry remain later
  gates.

### NC-20260818-002 — Prove a gap-independent live Gmail mailbox shadow

- Date: 2026-08-18
- Owner/client: Codex
- State: complete; migration 124 is live and one gap-independent read-only
  mailbox audit reached a stable terminal page without changing ingestion
- Commit/PR: claim `3c0cfa18`; implementation
  `2328c7e1ac15ae99f38dc3f102feacec8018e30b` on
  `codex/nc-20260818-002-gmail-live-shadow`; no PR
- Change class: C2 — bounded Gmail metadata reads plus reversible internal
  content-free audit state; no external communication or action authority
- Implementation: migration 124 and guarded empty-only rollback add a separate
  host-admin resumable audit plus append-only page and per-ID evidence with
  closed accepted/rejected/unknown accounting. The store binds the exact
  registered source, watermark version, and a cursor digest before each page
  and completion; it cannot write a watermark or recovery proposal. The raw
  continuation token exists only on an active host-admin attempt.
- Read boundary: the default-refuse `company-gmail:audit` CLI requires exact
  NC-002 confirmation and one-to-twenty pages. Its wrapper calls only profile
  and unfiltered, Spam/Trash-inclusive ID listing; no query, label, content,
  modify, archive, send, or reply method is reachable. SQLite opens read-only,
  file-required, and query-only and selects only terminal receipt fields.
  Missing receipts become `unknown/receipt_missing`, never rejection.
- Local evidence: exact Node 22.23.2 typecheck/build, 15 focused tests, 706/706
  email-critical tests, independent runner build plus 43/43 tests, schema
  sanitizer, documentation continuity, and capability parity pass. A real
  disposable PostgreSQL 16 cluster accepted migration 124; two transaction
  tests prove one closed 1 accepted / 0 rejected / 1 unknown terminal audit,
  raw-token cleanup, exact durable counts, and rollback with zero page/candidate
  rows after source/version/cursor drift. The temporary cluster was stopped and
  removed. The unrestricted root suite passes 2,723/2,724 with three skips; its
  sole failure is the unchanged CNPC wrapper-literal assertion.
- Exact release/install: source tree
  `52af229a391d8262667c49071122ff0a7006ac09`, 764 compiled files, artifact
  digest `5b22a024e8ac8dd25ecf66706c126c73c09a6448f5d7fc34bbdd47b7a5836fd1`,
  and archive SHA-256
  `99d465ecfb2119384d7ba6f4f32f4cb1ccae8feb9b20561e8a4059759bce2ecd`
  independently verify. The candidate is installed read-only on the Mini
  beside the daemon and was not activated.
- Production gate/backup: immediately before migration, verified release
  `dc3e5f0d` PID 47982 had connected Gmail/Slack, zero containers, waiting
  groups, outgoing Slack, active/waiting Company Work, or active email actions.
  The complete custom-format `business_v2` backup at
  `~/.local/share/nanoclaw-backups/NC-20260818-002-20260818T174439Z/business_v2.pre-migration-124.dump`
  is mode 0600, 2,052,817 bytes, has 728 catalog lines, and SHA-256
  `0751e0d09c2eb40a54c431213bb440a168620495c8d3da1fc11d8bd4b2f2f1f1`.
- Migration/live audit: exact migration SHA-256
  `f0bb33ce61bd8dd980f45699bc59621fd3cfee86f52eb4ed2fb2011c6037dbad`
  created three empty `nanoclaw_admin` tables with zero non-admin grants and
  two append-only evidence triggers. One resumable attempt then reached a
  stable terminal page within its 20-minute freshness budget: 171 pages and
  85,076 unfiltered Spam/Trash-inclusive IDs account exactly as 67 accepted,
  39 rejected, and 84,970 unknown. Evidence SHA-256 is
  `38e0e0c035cdfc7df3a55e9851fe0953203d3bc449a5c1d199cea3a556a25680`;
  no continuation token remains.
- Non-interference/boundary: source/event/state remain 1/1/1 at version
  1/current, migration-123 remains 0/0/0, and exact pre/post Company Work,
  trigger occurrence/source/watermark, SQLite cursor/message/receipt/pending-
  send/email-event aggregates and fingerprints match. PID 47982 still runs
  verified `dc3e5f0d` with connected channels and empty queues. The audit read
  no message content and wrote neither Gmail nor SQLite nor the generic
  watermark. It created no gap/404, recovery/routing, work/task/action
  authority, external message, push, or merge. The 84,970 unknowns remain
  non-authoritative and cannot be treated as rejected or recovered.

### NC-20260818-001 — Gate one inbound Gmail source bootstrap

- Date: 2026-08-18
- Owner/client: Codex
- State: complete; exactly one production source/bootstrap/current state is
  live, while Gmail shadow and runtime wiring remain absent
- Commit/PR: claim `0d7f8e7a` on
  `codex/nc-20260818-001-gmail-source-bootstrap`; implementation `5ed917c2`;
  self-contained installed candidate `1b70de94`; no PR
- Change class: C2 — one separately invoked, reversible internal inventory/
  watermark write with no Gmail, daemon, cursor, shadow, work, or action path
- Implementation: `company-gmail:bootstrap` binds only
  `mailbox:primary:inbound-v1`, rejects raw cursor arguments in favor of a
  lowercase SHA-256 fingerprint, requires a canonical fresh observation and
  exact apply confirmation, opens SQLite read-only/query-only, and performs
  source registration plus one zero-count bootstrap event in one PostgreSQL
  transaction. Reports omit the raw cursor and expose fixed
  `actionAuthority: none`.
- Local evidence: exact Node 22.23.2 typecheck/build pass; 64 focused generic-
  source/Gmail tests pass. A real synthetic SQLite CLI dry run preserved the
  database SHA-256, emitted no raw cursor, opened no PostgreSQL transaction,
  and called neither Gmail nor the shadow. PostgreSQL 16.15 disposable proof
  first exposed and drove correction of a derived-field/store-boundary
  mismatch, then passed real drift rollback, first apply, exact replay, and
  durable 1 source / 1 event / 1 current version-1 state assertions. The 706
  email-critical tests, independent runner build plus 43/43 tests, and
  documentation continuity pass. The unrestricted root suite passes
  2,707/2,709 with one separately green integration test skipped by default;
  its sole failure is the unchanged CNPC wrapper-literal assertion.
- Release/install: archive SHA-256
  `16bd31ea9b6036bdb7ed179d91e8a2d78fa51c06bb98abc98e8376e766b16f49`
  independently verified on Mini as commit `1b70de94fca6da7f0368c452aa9d8f6f3b0eb55b`,
  source tree `8ac3fc8afbb07fb13fa7bf3be83b736db0a2c5a0`, artifact
  `d4f166e122ba330376e3376a3183a2ba5099f88cc67b9e8fe6fd606099ae73de`,
  748 files, Node 22.23.2. The installed directory is read-only and was never
  activated; the daemon stayed on `dc3e5f0d`.
- Recovery: a complete unfiltered `business_v2` custom dump in mode-0700
  `NC-20260818-001-20260818T132631Z/` is 2,040,161 bytes, mode 0600, SHA-256
  `3123afef31f42c9a6833b23915a2ffa649c924e072d731273ad2b42a3d7af578`.
  Its mode-0600 713-entry restore catalog is 58,392 bytes with SHA-256
  `ec3a3c68a49a7394893b6f1e6622e5711e9d848bbdf17f3cd0b87b2ea1465ea8`.
  Whole-database attempts failed before mutation because an unrelated public
  Procurement table enforces row-level security. The platform correctly
  rejected a filtered whole-database dump; three invalid partial dumps were
  deleted, and only the complete affected-schema backup remains.
- Production apply/replay: the final gate had zero active/waiting/outgoing
  work, no active email action, connected Gmail/Slack, source/event/state and
  shadow counts 0/0/0, and an unchanged contextual SQLite cursor SHA-256. The
  dry-run opened no PostgreSQL transaction. One exact confirmed transaction
  registered definition
  `9e039880e01c26ad73186807e97380982190ea0c58ea0970f6052f33fe3af109`
  and bootstrap event ID 1 with zero observed/accepted/rejected counts; the
  current state is version 1/current with no gap. Immediate exact replay was
  duplicate-only for both source and event.
- Non-interference/boundary: post-state counts are source/event/state 1/1/1
  and shadow 0/0/0. The redacted PostgreSQL cursor digest equals the unchanged
  SQLite digest; quick-check is `ok`; email actions/events remain 76/377 with
  zero active states; Company Work stays 16/97/43 and occurrences 1 with all
  four protected fingerprints identical. PID 47982 still serves exact verified
  release `dc3e5f0d` under Node 22.23.2 with connected channels and empty
  queues. No Gmail API/profile/list/read, SQLite write, daemon activation/
  restart/import, shadow row, 404/gap/reconciliation behavior, recovered
  message, work/task/action authority, external message, push, or merge
  occurred. Stop before live shadow.

### NC-20260817-013 — Apply the Gmail reconciliation shadow schema dark

- Date: 2026-08-18T04:31Z
- Owner/client: Codex
- State: complete; migration 123 is live, empty, admin-only, and unwired
- Commit/PR: claim `6d15280c`; NC-010/NC-012 convergence merge `3ee10533` on
  `codex/nc-20260817-013-gmail-shadow-schema`; no PR
- Change class: C2 — additive production schema with verified recovery and no
  runtime, source, Gmail, cursor, message, work, or action activation
- Candidate verification: live release `dc3e5f0d` and the reconciled branch
  carry byte-identical migration SHA-256
  `e9d2b7bb384d4ead97ee1b9b0b6b17c564c0b21ba2944a5818e977de90f15062`
  and rollback SHA-256
  `ec71364d003294d80d8d15daccb0d45cfd99fa4bd15646f100c99b8cb6fcb9b9`.
  PostgreSQL 16.13, admin membership, migration-122 dependencies, empty
  0/0/0 source/event/state tables, one prior occurrence, and absent
  migration-123 targets were independently verified read-only.
- Local validation: exact Node 22.23.2 typecheck/build pass; 197 focused tests,
  706 email-critical tests, runner build/43 tests, and documentation continuity
  pass. The full root suite passes 2,690/2,691; the sole CNPC wrapper-string
  assertion is the unchanged baseline failure.
- Drain: one ordinary Sales container and its approved email were allowed to
  finish naturally. No process was interrupted. Backup and migration gates
  each found zero active/waiting work, zero outgoing Slack queue, connected
  Gmail/Slack, and zero email actions in approved/handoff/Mailman/executing/
  attention states.
- Recovery: mode-0600 custom dump
  `NC-20260817-013-20260818T042031Z/nanoclaw_business_pre_123.dump` is
  2,720,522 bytes with SHA-256
  `793e4a673bcb42fa2a97f656ba3f371ffc9265438df62eab7e57c3c54caf17a4`.
  Its mode-0600 restore catalog is 80,883 bytes, lists 1,023 entries, and has
  SHA-256
  `53136bc7312d424defcf49a1136fc46a25357a2767d1e2005dd8a6e5c5c1fec6`.
  The containing directory is mode 0700. The tracked DDL rollback remains safe
  only while all three tables are empty; the dump is the authoritative
  pre-migration recovery artifact.
- Migration/schema proof: only the exact release-bound migration was applied,
  as one transaction. Snapshot/page/candidate tables have 27/9/8 columns and
  zero rows; each is owned by `nanoclaw_admin`, exposes all seven admin table
  privileges and zero non-admin grants, and contains zero forbidden content,
  address, prompt, task, approval, or action columns. Expected constraints and
  six indexes exist; page and candidate rows have UPDATE/DELETE append-only
  triggers.
- Non-interference: Company Work remains 16 items/97 events/43 receipts;
  occurrence/source/watermark counts remain 1/0/0/0; classifications remain
  7,251; every protected PostgreSQL fingerprint is identical pre/post. SQLite
  quick-check is `ok`; Gmail messages remain 3,026, email actions 76, email
  events 377, tasks/jobs/groups 11/22/20, and active email actions zero. One
  ambient `rejected/own_outbound` receipt recorded at
  `2026-08-18T04:30:37.489Z` during post-check; Gmail message and email-action/
  event fingerprints stayed fixed, while normal cursor/job liveness changed.
- Live boundary: a 2026-08-18T04:38:21Z stability read finds all target rows
  0/0/0, all three admin owners, zero non-admin grants, and unchanged backup
  hashes. PID 47982 continues exact verified release `dc3e5f0d` under Node
  22.23.2 with matching code root, connected Gmail/Slack, and empty active/
  waiting/outgoing queues. No restart/deploy, source row/bootstrap,
  Gmail API/profile/list/read, snapshot/page/candidate row, 404/cursor change,
  message recovery, work/task/action, external message, push, or merge
  occurred. The next separately tracked gate is source registration/bootstrap.

### NC-20260817-012 — Deploy the Slack screenshot-reading boundary

- Date: 2026-08-17
- Owner/client: Codex
- State: complete for exact deployment and mount proof; model-level screenshot
  interpretation remains pending under NC-011
- Commit/PR: exact release
  `dc3e5f0da18576094c4c9e1af95c064d2c2b17d4` on
  `codex/nc-20260817-012-slack-image-release`; no PR
- Change class: C2 — reversible release, global prompt, and host mount
  activation without external communication or action authority
- Build/transfer: clean source tree
  `c7e45b9522dc6cbf0dac4134c02d1f3450bbad25`, artifact
  `da9438b27cfafe772a8ac22c6c5491e38e77be3ebd5c2baab42ac49cf2143b75`
  across 728 files, and Node 22.23.2 were verified from a fresh local
  extraction and again on Mini. The transferred archive independently matched
  SHA-256
  `3563844763a0708f7b3170c8a44fc199ab56bd53d2631d9af25febd9d5ced510`.
- Drain/activation: the exact prior `263ac7c4` release had one listener,
  connected Gmail/Slack, zero active/waiting containers, an empty outgoing
  Slack queue, no Apple containers, and only 69 confirmed/6 blocked pending
  email rows. The activator dry run named exactly the permitted three plist
  fields. Exact-host activation health-verified `dc3e5f0d` at its matching code
  root under Node 22.23.2 and retained rollback plist
  `com.nanoclaw.plist.rollback-263ac7c4a25a-2026-08-18T02-51-22-029Z`.
- Prompt/rollback: the operational global prompt was privately backed up at
  mode 0600 with hash
  `399408327c533489da834614884dbd82fb9f21ef99cf9f26d7ef5f1ec693c919`,
  then atomically replaced from the verified release. Active/release hashes
  both equal
  `fb84bec9f411dd6918771f73c00cbc323149ee18ec7b74574342978af78e37ca`.
- Mount proof: a host-created mode-0600 empty fixture under mode-0700 inbound
  directories was readable through `/workspace/ipc/inbound` in a disposable
  no-agent container and a write attempt failed. The exact fixture was
  removed. Two ambient, naturally launched post-release Sales/Mailman
  containers independently reported group-specific inbound mounts with option
  `ro`; their business content was not inspected.
- Boundaries: NC-012 caused no Slack post/replay, operator-image export,
  customer message, Gmail action, schema/data write, OAuth change, task/action
  authority, push, or merge. This proves delivery and confinement, not that a
  minion understood a real screenshot; use a fresh user-resubmitted image for
  that outcome.

### NC-20260817-011 — Give Slack screenshots to image-capable minions

- Date: 2026-08-17
- Owner/client: Codex
- State: deployed_unverified; exact service and mount behavior are live, but a
  real screenshot has not yet been interpreted
- Commit/PR: claim `85f1c094`; implementation `9abdf2fd` on
  `codex/nc-20260817-011-slack-image-vision`; no PR
- Change class: C2 — reversible host channel/mount and agent-instruction change;
  no new action authority or external communication
- Root cause: Slack already supplied file metadata and the bot already held
  `files:read`, but `downloadAndInlineFiles` deliberately skipped downloads for
  every image and generated a note saying the attachment was not readable as
  text. Its regression test asserted that `fetch` must not run. Sales therefore
  never received the screenshot bytes even though Claude Code's `Read` tool
  supports raster image content.
- Implementation: adds `slack-image-stage.ts` for 10 MB bounded
  PNG/JPEG/GIF/WebP signature validation, opaque identifiers, atomic mode-0600
  writes, and 30-day derived-copy retention. Slack stages into a host-owned
  per-group tree and sends the exact container path; missing metadata,
  unsupported/spoofed bytes, oversize files, and download/stage failures remain
  explicit. `container-runner.ts` overlays that group tree read-only at
  `/workspace/ipc/inbound` after the writable IPC mount, so the inspecting
  minion cannot replace the evidence. Global minion guidance requires an exact
  `Read` before asking for transcription and keeps image text untrusted.
- Verification: exact Node 22.23.2 root typecheck and build pass. Affected
  group-folder, mount, Slack, and staging suites pass 157/157. The independent
  agent-runner builds and passes 43/43 tests. Outside sandbox restrictions, the
  full root suite passes 2,673/2,674; the sole CNPC wrapper-literal failure is
  reproduced unchanged at base `4df80def`. Local installed Claude Code type
  declarations enumerate JPEG/PNG/GIF/WebP image results from `Read`; no
  operator screenshot was transmitted to a second model for this validation.
- Security/retention: raw Slack names and IDs do not become paths; signature,
  actual size, group-folder confinement, private file mode, atomic rename, and
  a nested read-only mount fail closed before model access. Slack remains the
  source of truth and derived copies expire after 30 days. Image text is data,
  never approval or authority.
- Deployment/rollback: NC-012 activated exact release `dc3e5f0d` from a
  zero-container drain, installed the reviewed global prompt with a private
  rollback copy, and proved the nested mount read-only both in a disposable
  container and on two later natural group containers. Rollback release
  `263ac7c4` remains available. No OAuth mutation, Slack post, model canary,
  database/schema write, push, or merge occurred; staged copies are inert local
  runtime data and may age out normally.
- Documentation: `docs/ARCHITECTURE.md`, `docs/PROJECT-MAP.md`,
  `docs/SECURITY.md`, `docs/MINION-FRAMEWORK.md`, global minion instructions,
  active work, and this changelog.

### NC-20260817-010 — Measure retained Gmail disposition coverage read-only

- Date: 2026-08-17
- Owner/client: Codex
- State: complete; retained-host coverage is measured read-only with identical
  before/after protected-state fingerprints
- Commit/PR: claim `ddc5a7c9` on
  `codex/nc-20260817-010-gmail-historical-coverage`; implementation
  `6bc9da26a7a6a2c48b4e3ea3e538cf669ebdcd18`; no PR
- Change class: C2 — local default-off audit code with a separately gated
  read-only production execution; no Gmail, cursor, schema, message, or action
  authority
- Scope/contract: the auditor measures only IDs durably retained in the live
  receipt table or the configured Gmail channel's SQLite message rows. It
  separates validated terminal receipts, exact ordinary rows, direct-route
  rows with one exact routed `rules-runner-v1` marker, unresolved direct-route
  rows, outbound rows without receipts, and unsupported retained rows.
  Duplicate IDs, receipt/row contradictions, ambiguous markers, source drift,
  unavailable storage, and an explicit-bound overflow refuse the report.
- Read-only/privacy boundary: SQLite opens `readonly`, `fileMustExist`, and
  `query_only`; its bounded query selects no sender/address/subject/content
  column. PostgreSQL begins `TRANSACTION READ ONLY`, selects grouped marker
  counts for only staged IDs, and always rolls back. Both sources are read
  twice. Output contains aggregates and SHA-256 fingerprints only, with
  `basis=retained_host_evidence`, `mailboxComplete=false`, and
  `gmailQueried=false`; raw IDs and mailbox identity are never printed.
- Verification: exact Node 22.23.2 passes 47/47 focused
  audit/disposition/reconciliation tests, typecheck, root build, 704/704
  email-critical tests, independent runner build plus 43/43 tests, and
  documentation continuity. The unrestricted full baseline passes
  2,678/2,679; its sole failure is the unchanged CNPC literal wrapper
  assertion in `src/cnpc-prompt-contract.test.ts`.
- Exact audit artifact: source tree
  `d3be1c6e26ea546f5c22c5f7e2321a081a7ffe6d`; 736-file compiled artifact
  SHA-256 `e76bf1cddafa7a429ad87a0901dac097b7634990f2d0aa38004f62606a4c3f6b`;
  archive SHA-256
  `9ed3fe1da44b81bc18a0fb5054b1a3b4dffec0c4725de2af440e362f9fff81b5`.
  The archive verified locally and from the private one-off production audit
  directory without activation.
- Production aggregate proof: the closed 3,041-ID retained-host inventory has
  23 terminal receipts, 1,675 recoverable IDs, and 1,343 unknown IDs. Terminal
  receipts are 14 accepted and 9 rejected: four ordinary inbound persists, ten
  completed rule auto-archives, eight own-outbound rejections, and one
  Spam/Trash rejection. Recoverable evidence is 1,654 exact ordinary rows plus
  21 exact single-marker routed rows. Unknown evidence is 36 unresolved staged
  routes, 517 outbound rows without receipts, and 790 unsupported retained
  inbound rows. The report fingerprint is
  `3be9a997fd64dcafff3e301e7e4c66dc7a6344825afec0e00081a1a45f9600a9`;
  it exits 2 by contract because unknowns remain.
- Non-interference proof: before and after both hash to protected-state
  fingerprint
  `2935c1914e97419f380b927b14efe84870619fb4d09c11fac16c357d5c7d5f5f`.
  SQLite `quick_check`, 3,026 Gmail-channel rows, 23 receipts, four selected
  router-state values, 76 pending-send rows (70 confirmed/6 blocked), 7,247
  classification rows, and all corresponding content-free fingerprints are
  identical. Migration 123's three tables remain absent. The live service
  remains verified release `dc3e5f0d` under Node 22.23.2 with one listener and
  connected Gmail/Slack; it was not restarted or activated.
- Deployment/migration: not performed. No Gmail API request, receipt mint,
  SQLite/PostgreSQL business write, history cursor, migration 123,
  source/bootstrap, shadow, 404 behavior, task/work/action, service, push, or
  merge changed.
- Limitation/follow-up: this gate cannot discover IDs present only in Gmail;
  mailbox completeness remains a later full-snapshot proof. The 1,343 unknown
  retained IDs remain unknown and cannot authorize recovery or cursor advance.
  NC-010 closes here; migration 123 is the next separate dark-schema gate.
- Documentation: Gmail reconciliation contract, project map, Company OS plan,
  active work, package script, email-critical gate, and this changelog.

### NC-20260817-009 — Activate durable Gmail disposition receipts

- Date: 2026-08-17
- Owner/client: Codex
- State: complete; exact schema/service activation, bounded non-interference,
  and natural disposition-receipt behavior live-verified
- Commit/PR: claim `2d994656`; implementation/release
  `263ac7c4a25a6033adef13e4085c147d1237b559` on
  `codex/nc-20260817-009-gmail-receipt-activation`; no PR
- Change class: C2 — additive production SQLite schema and recovery-safe exact
  release activation without manufactured Gmail traffic or action authority
- Preflight: `mini-claw.local` remains on verified exact release `de815e1d`
  under Node 22.23.2 with one listener, matching code root, connected
  Gmail/Slack, zero active/waiting/outgoing work, and zero critical pending
  email actions. SQLite `quick_check` is `ok`; the receipt table/triggers are
  absent; pending email state is 66 confirmed/6 blocked; the selected Gmail
  cursor fingerprint is
  `cfe9db8b9cd36e880e16a5ef63538b100d35621beb381c6ed19591db46cb7705`.
  The operational database has no WAL/SHM sidecars at this snapshot.
- Compatibility finding and repair: aggregate-only reconciliation found 57
  exact Gmail/Mailman direct-route staging rows. Twenty-one have one matching
  `rules-runner-v1` classification with `routed_at`; 36 have no matching
  classification; none is duplicate, mixed, or unrouted-only. NC-008 already
  refuses to invent receipts for the 36 unresolved rows, but a recurring
  label/thread scan could abort on the first refusal and starve unrelated
  mail. NC-009 catches that exact per-candidate hold in cursorless scans,
  continues unrelated candidates, and leaves the row for later catch-up.
  Push history keeps its stricter whole-batch cursor hold.
- Local verification: exact Node 22.23.2 focused Gmail/disposition,
  classification, and pagination tests pass 75/75, including new label- and
  thread-scan starvation regressions. Typecheck and root build pass. The
  email-critical gate passes 687/687 plus the independent runner build and
  43/43 tests. Documentation/capability continuity, formatting, and diff checks
  pass. The unrestricted full baseline passes 2,661/2,662; its sole failure is
  the unchanged CNPC literal wrapper assertion in
  `src/cnpc-prompt-contract.test.ts`.
- Exact release: source tree
  `bac62eea397f944033c79b74f79e29e2b6c13378`; 724-file artifact SHA-256
  `b12416a44839ddb08092566f81e9a4fd1568ddf597bf194b091fbf295f3bbef2`;
  archive SHA-256
  `74e282695eeff312e544e23f933c00a8a547f158747c74da49c04a09df21d622`.
  Clean construction plus fresh local and production extraction verified.
  Migration 123 and its rollback are present as verified release files but
  remain unapplied.
- Recovery: after a final green drain, SQLite's online backup wrote the
  owner-only mode-0600 file
  `~/.local/share/nanoclaw-backups/NC-20260817-009-2026-08-17T23-36-26Z/messages.db.sqlite3`.
  It passes `quick_check`, preserved the pre-schema 66 confirmed/6 blocked and
  zero-critical state, and hashes to
  `6b23f4d9329865cae93bc86dbc98f87383079ba34441ed524bbf4c7b5eec8996`.
  The activator retained rollback plist
  `com.nanoclaw.plist.rollback-de815e1dfb1f-2026-08-17T23-37-22-828Z`.
- Activation/live structure: redacted dry-run named only the three expected
  release-pointer paths; recovery-safe apply converged to exact release
  `263ac7c4` under Node 22.23.2. Independent readback proves one listener,
  connected Gmail/Slack, empty runtime/outgoing queues, SQLite `quick_check`
  `ok`, the receipt table plus its no-update/no-delete triggers,
  unchanged critical pending state, and absent migration-123 tables. The
  health heartbeat and sole listener converged to PID 58925 after its expected
  30-second file refresh; the initial old PID was stale heartbeat data, not a
  second listener.
- Bounded natural observation: after more than ten minutes, one successful
  Gmail safety poll reported zero candidates, zero Gmail errors/holds, zero
  Gmail-row change, and zero receipts. Two ambient new message rows and two
  allowed action-safety decisions were Slack-only. Normal watch renewal
  explains the lease change; the successful empty safety poll explains the
  history/liveness advance; `last_check` remained unchanged. Critical pending
  state remained 66 confirmed/6 blocked and zero active/critical.
- Natural producer proof: later aggregate-only readback contains 18 terminal
  receipts with 18 distinct Gmail message IDs and 18 distinct receipt
  fingerprints. Three are `accepted/inbound_message_persisted`, each with its
  matching SQLite message row; ten are
  `accepted/rule_auto_archive_completed`; five are
  `rejected/own_outbound`. Timestamps span 2026-08-18T00:01:04Z through
  2026-08-18T01:58:53Z. The same PID 58925 completed 67 push/safety cycles with
  zero receipt, processing, safety-poll, or cursor-hold failures. Two recent
  one-candidate cycles each reported `newCount: 1` and advanced the history
  cursor monotonically. SQLite `quick_check` remains `ok`; exact release,
  listener, and channel health remain green.
- Boundary/follow-up: production writes were limited to the recovery backup,
  immutable release install/pointer activation, startup's additive SQLite
  schema, normal Gmail watch renewal/history/liveness, and ambient Slack state.
  No synthetic/customer/internal email, Gmail send/reply, historical receipt,
  PostgreSQL schema/row, migration 123, source registration/bootstrap, shadow
  read, 404 change, classification, task, approved-email action, push, or merge
  occurred during activation. Natural Gmail traffic later exercised the normal
  inbound disposition path; no synthetic traffic or historical backfill was
  used. NC-009 is complete. Historical unknown accounting is the next separate
  read-only milestone; migration 123, source bootstrap, live shadow, and 404
  handling remain later gates.

### NC-20260817-008 — Add durable Gmail inbound disposition receipts

- Date: 2026-08-17
- Owner/client: Codex
- State: complete; local implementation only, not deployed or applied to
  production SQLite
- Commit/PR: claim `db6850eb` on
  `codex/nc-20260817-008-gmail-disposition-receipts`; implementation
  `77dda13d`; no PR
- Change class: C2 — additive local SQLite schema and fail-closed inbound cursor
  behavior with no live Gmail, production database, message, or action write
- Implementation: adds an append-only, content-free receipt keyed by immutable
  Gmail message ID, with bounded accepted/rejected reasons, exact semantic
  replay, changed-replay conflict, source-evidence and receipt hashes, and a
  read-only Company OS accounting adapter. Current ordinary persistence,
  classified routing, rule auto-archive, own outbound, Spam/Trash, empty,
  hard-filter, and thread-outbound terminals now receipt only after their
  matching durable path completes.
- Retry/cursor safety: an existing receipt survives restart and skips refetch.
  An exact ordinary inbound SQLite row can bridge a receipt lost after message
  persistence. A direct-route staging row additionally requires the exact
  PostgreSQL `routed_at` marker; an in-memory marker, outbound row, or ambiguous
  staged route cannot bridge. Any unaccounted history candidate retains the prior cursor. A history delta still
  carrying a page token after page 20 now fails before any candidate processing
  or cursor write rather than returning truncated success.
- Verification: exact Node 22.23.2 typecheck and root build pass; 5 focused
  files / 143 tests and 32 combined Company OS/Gmail files / 405 tests pass.
  The expanded email-critical gate passes 27 files / 685 tests plus the
  independent runner build and 43/43 tests. Formatting, schema sanitizer,
  documentation continuity, capability parity, and diff checks pass. The
  unrestricted full baseline passes 2,659/2,660; its sole failure is the
  unchanged CNPC literal wrapper assertion in
  `src/cnpc-prompt-contract.test.ts`.
- Boundary: no production SQLite/PostgreSQL change, migration-123 application,
  source registration/bootstrap, live Gmail request, current cursor change,
  404 behavior change, message classification/delivery, task, action, service
  restart, deployment, push, or merge occurred. Deploying these bytes later
  will create the additive SQLite table at startup and therefore requires a
  separate backup, drain, activation, and live non-interference task.

### NC-20260817-007 — Deploy the Gmail reconciliation shadow dark

- Date: 2026-08-17T22:04Z
- Owner/client: Codex
- State: complete; exact release is live-verified while migration 123 and every
  Gmail/source producer remain inactive
- Commit/PR: deployed release
  `de815e1dfb1fa4c709ebf67b1974f5c0411395e5` on
  `codex/nc-20260817-007-gmail-shadow-dark-deploy`; no PR
- Change class: C2 — recovery-safe immutable service deployment with no schema,
  source, Gmail, message, task, or action write
- Preflight: `mini-claw.local` served exact verified release `070cde38` from one
  Node 22.23.2 listener with matching code root, connected Gmail/Slack, zero
  active/waiting/outgoing work, and zero active approved-email actions. Pending
  email state was 66 confirmed/6 blocked; tasks/jobs/groups were 11/22/20;
  trigger occurrence/source/event/state counts were 1/0/0/0; both Gmail history
  cursors matched; all three migration-123 tables were absent.
- Release verification: exact-runtime typecheck and 29/29 focused Gmail-shadow
  tests pass. The clean release gate passes 638/638 email-critical tests plus
  independent runner build and 43/43 tests. Exact commit `de815e1d` binds
  source tree `c2594e33d8e08dc98b6f6047f104947253f0d26f`, 720 artifact files,
  artifact digest
  `a17328de31c82e78db6e001b11ae58710238b4dc7cae20461fbd453aeb784cb3`,
  Node 22.23.2, and archive SHA-256
  `23c00a50c8f6ff69ed876410a003bcc87cc5431d86692b39209754899bcb54d5`.
  Fresh local and production extractions independently verified the archive
  and its release-bound migration/rollback 123 files.
- Activation: the final drain repeated zero active/waiting/outgoing work, zero
  active email actions, and absent migration-123 tables. The release-bundled
  dry run named only code root, expected commit, and daemon path. The bounded
  apply at `2026-08-17T22:03:56Z` retained rollback plist
  `com.nanoclaw.plist.rollback-070cde380242-2026-08-17T22-03-56-272Z` and
  health-verified the target.
- Live proof: launchd PID 60236 owns the sole listener and runs exact release
  `de815e1d` under Node 22.23.2. Independent installed-bundle verification,
  release/code-root health, connected Gmail/Slack, empty queues, disabled time
  observer, and unchanged action/capability configuration pass. Pending email,
  task/job/group, Gmail-cursor, and trigger aggregates are unchanged; all three
  migration-123 tables remain absent.
- Boundary/rollback: one immutable release directory and one recovery-safe
  service restart occurred. No migration, PostgreSQL/SQLite row, source
  registration/bootstrap, live Gmail request, shadow evidence, 404 handling,
  cursor change, message, task, group, prompt, skill, capability, approval,
  action, send, push, or merge occurred. Restore the retained prior plist to
  return to exact release `070cde38`; no database rollback is needed.
- Documentation: updated release integrity, the Gmail/trigger contracts,
  project map, Company OS roadmap, active work, and this changelog.
- Follow-ups: implement durable accepted/rejected evidence for real current
  ingestion locally. Applying migration 123, registering/bootstrapping the
  source, any live read-only shadow, and natural-404 recovery remain separately
  tracked promotion gates.

### NC-20260817-006 — Add resumable inbound Gmail reconciliation shadow

- Date: 2026-08-17T20:19Z
- Owner/client: Codex
- State: complete; the local unwired implementation, disposable-database
  rehearsal, and verification evidence are committed and verified
- Commit/PR: claim `4ec32bf4` on
  `codex/nc-20260817-006-gmail-reconciliation-shadow`; implementation
  `67870546`; no PR
- Change class: C2 — additive local host-only schema and exact read-only Gmail
  wrapper with no production or external write
- Implementation: an exact `users.getProfile` plus unfiltered,
  Spam/Trash-inclusive `users.messages.list` port now feeds a host-owned
  resumable shadow orchestrator. Each invocation consumes at most 20 pages;
  the attempt cap is 10,000 pages. Content-free candidate receipts, page
  hashes, counts, source/gap identity, and before/after history heads survive
  restarts without granting message-read, classification, task, action, or
  cursor authority. Terminal completion reuses the NC-005 immutable proposal
  contract and marks only the shadow ledger complete.
- Fail-closed proof: exact begin/page/completion replays converge; changed or
  stale state, head drift, invalid/repeated IDs, repeated page tokens,
  freshness expiry, unknown accepted/rejected accounting, non-terminal scans,
  and count mismatches invalidate or remain pending without producing
  `gap_reconciled`. Raw continuation tokens are admin-only and are cleared at
  terminal completion or invalidation; progress output exposes hashes only.
- Schema/store: unapplied migration 123 adds admin-only snapshot, page, and
  candidate tables. Page/candidate history is append-only, snapshot progress
  uses compare-and-swap, one active attempt is enforced, and populated rollback
  refuses destructive removal. The release builder includes both migration and
  rollback, but no runtime entry point imports the new orchestrator or store.
- Disposable PostgreSQL proof: migration 122 then 123 applied on PostgreSQL 16.
  The real store completed one synthetic 10,001-candidate snapshot in 21 pages
  across two bounded advances: 5,001 accepted, 5,000 rejected, stable head,
  exact completed replay, and cleared token. Candidate mutation was refused;
  only `nanoclaw_admin` held table privileges; populated rollback exited 3 and
  refused; exact-table truncation followed by empty rollback succeeded. The
  disposable cluster was stopped and removed.
- Verification: exact Node 22.23.2 passes 29/29 focused reconciliation and
  migration tests, 219/219 combined Company OS/Gmail tests, typecheck, root
  build, 638/638 email-critical tests, and independent runner build plus 43/43
  tests. Formatting, schema-sanitizer self-test, documentation/capability
  continuity, and diff checks pass. The unrestricted full suite is
  2,638/2,639 across 208 files; its sole failure is the unchanged unrelated
  CNPC wrapper-string assertion expecting literal `folder: 'cnpc'`.
- Deployment/migration: not performed. No production schema/data/config,
  trigger source, gap/watermark, Gmail request, SQLite cursor, runtime import,
  service, message, task, group, prompt, skill, capability, approval, action,
  send, push, or merge changed. The current history-404 reset path remains live
  and unmodified.
- Rollback/recovery: before activation, revert/remove the local module, store,
  tests, and unapplied migration. If migration 123 is later applied, its
  rollback is intentionally empty-only; populated evidence must be retained or
  explicitly migrated under a separately reviewed task.
- Documentation: updated the Gmail reconciliation contract, trigger contract,
  Company OS roadmap, project/data maps, business-data guide, migration index,
  active work, and this changelog.
- Follow-ups: durable real accepted/rejected ingestion receipts, a separately
  authorized dark migration/source bootstrap, bounded live read-only shadow
  proof, and only then production 404 interception or cursor advancement. The
  label-correction source remains separate; neither live reads nor forced
  expiry/synthetic customer mail are authorized here.

### NC-20260817-005 — Add dark inbound Gmail gap-reconciliation proposals

- Date: 2026-08-17T19:23Z
- Owner/client: Codex
- State: complete; local proposal-only adapter, tests, authoritative contract,
  and continuity evidence are committed and verified
- Commit/PR: claim `10945e94`; implementation `fc1fdb32` on
  `codex/nc-20260817-005-gmail-gap-reconciliation`; no PR
- Change class: C2 — local reversible source/contract addition with no external
  or production write
- Source reconciliation: inbound push owns SQLite `gmail_history_id`; the
  label-correction job independently owns `gmail_label_poll_history_id`. Both
  still re-bootstrap on history 404, and inbound push explicitly accepts an
  unmeasured loss window. Gmail's history API directs stale-ID callers to a full
  sync, so the adapter does not use a recent-date or label-filtered shortcut.
- Implementation: `src/company-gmail-reconciliation.ts` derives one immutable,
  non-address inbound source with no authority; maps a 404 to a deterministic
  `gap_detected` proposal; and constructs `gap_reconciled` only for the exact
  durable gap after an unfiltered, Spam/Trash-inclusive full snapshot reaches a
  terminal page within 20 x 500 IDs. Every ID must be valid, unique, and
  durably accepted/rejected; the before/after profile head must be identical;
  the gap must be at most eight days old and the attempt at most twenty minutes.
  The injected port exposes no write, delivery, task, agent, or action method.
- Fail-closed proof: wrong source/state/gap, stale target, over-age/freshness,
  unavailable source, head behind/drift, oversized/non-terminal/cyclic pages,
  invalid/duplicate IDs, and unknown/malformed accounting all throw before a
  reconciliation proposal exists. Deterministic replay yields the same event
  and evidence digest for the same closed snapshot.
- Verification: exact Node 22.23.2 passes 61/61 focused Gmail/source tests,
  172/172 combined Company OS tests, typecheck, root build, 638/638
  email-critical tests, and independent runner build plus 43/43 tests. The
  ordinary unrestricted full suite is 2,624/2,625; its sole failure is the
  unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. Root formatting, schema-sanitizer self-test,
  documentation/capability continuity, and staged/final diff checks pass.
- Deployment/migration: not applicable. No production schema/data/config,
  source row, watermark event/state, Gmail call, SQLite cursor, service,
  channel, message, task, group, prompt, skill, capability, approval, action,
  push, or merge changed. The current 404 reset remains live and unmodified.
- Rollback/recovery: remove the new pure module/test and documentation updates;
  there is no runtime, database, or external state to restore.
- Documentation: added `docs/COMPANY-OS-GMAIL-RECONCILIATION.md`; updated the
  trigger contract, project map, Company OS roadmap, active work, and this
  changelog.
- Follow-ups: a separate production-facing task must define durable per-message
  accounting, large-mailbox resumability, the exact read-only Google wrapper,
  source registration/bootstrap, bounded shadow proof, and only then runtime
  gap/recovery wiring plus watermark-age attention. Label-correction recovery
  remains a separate source. A forced expiry or synthetic production email is
  not authorized.

### NC-20260817-004 — Deploy the trigger-source watermark foundation dark

- Date: 2026-08-17T18:17Z
- Owner/client: Codex
- State: complete; migration 122 and exact release are live-verified dark with
  zero source, watermark-event, and watermark-state rows
- Commit/PR: claim and deployed release
  `070cde380242767d281641bdba34f525a33f650b` on
  `codex/nc-20260817-004-trigger-source-dark-deploy`; no PR
- Change class: C2 — additive production schema and recovery-safe exact-release
  service deployment without source or action activation
- Preflight: `mini-claw.local` began on exact verified release `baed66d` with
  one Node 22.23.2 listener, matching code root, connected Gmail/Slack, empty
  outgoing/waiting queues, disabled time observer, migration 121 present, and
  all migration-122 tables absent. Two ordinary containers were active, so no
  mutation began.
- Local/release verification: exact-runtime typecheck, 58/58 focused trigger
  tests, and 157/157 combined Company OS tests pass. The clean release gate
  passes 638/638 email-critical tests plus the independent runner build and
  43/43 tests. Exact commit `070cde38` binds source tree
  `c1af83c9035b75b630a7d71c2c7d861ebf652ea7`, a 708-file artifact digest
  `00394081299e1258b2ac7098aebd510b0b6fe8ecd6ca3ed602282133c114ce27`,
  Node 22.23.2, and archive SHA-256
  `24baf0e8912501520dc02d85d332fb4d0dd2a2eaa55c413191ae0d746b07c1b1`.
  Fresh local and production extraction independently verified the archive.
  Formatting, schema-sanitizer, documentation-continuity/capability, and diff
  checks pass.
- Drain: Chief, Sales, Mailman, and Courses work was allowed to finish
  naturally across the busy window. No container was interrupted. Backup,
  migration, and activation each rechecked zero active/waiting containers,
  zero outgoing Slack queue, connected required channels, and zero email
  actions in approved, handoff, Mailman, executing, or attention states.
- Backup/migration: mode-0600 custom backup
  `company-trigger-before-122-2026-08-17T18-14-16Z.dump` is 9,046 bytes with
  28 listed entries and SHA-256
  `b9d232ccc4439783f3ff7d4719e251added3db625c2f6c666957db42d670adcb`.
  Only release-bound migration 122, SHA-256
  `bb4ebfa8cde9c54a62bb8f11a60abab0096bbfd0ccb5599a3519b45037d4f6a7`,
  was applied. Its rollback is bound at SHA-256
  `32a94f452182cc5273586321d882376396e176c4fb5336fb8c8c9f8541503b06`.
- Schema proof: all three new tables are owned by `nanoclaw_admin`, have zero
  non-admin table/sequence grants and zero forbidden raw/message/prompt/action
  columns, and both immutable tables have their append-only triggers. Source,
  event, and state counts remain 0/0/0; the prior trigger-occurrence count
  remains one.
- Activation: the release-bundled dry-run named only code root, expected
  commit, and daemon path. Applied activation moved `baed66d` to `070cde38`,
  retaining rollback plist
  `com.nanoclaw.plist.rollback-baed66dba21d-2026-08-17T18-15-44-734Z`.
  Independent readback found one PID 81347 listener, exact verified
  release/code-root/Node identity, connected Gmail/Slack, empty queues,
  disabled time observer with zero new calls, valid capability/action-safety
  configuration, and all migration-122 tables still empty.
  A later `2026-08-17T18:20:54Z` stability read again found one exact-release
  listener, connected channels, zero outgoing queue, disabled observer with
  zero calls, and 0/0/0 source/event/state rows.
- Ambient attribution: one ordinary approved email completed during the long
  drain, moving confirmed actions 65 to 66 and Company Work from 12
  items/version sum 53/65 events/27 receipts to 13/60/73/31. The new row is
  independently attributable to completed `sales_email` source
  `sqlite_email_action` plus approval, action-claim, Gmail-delivery, and outcome
  receipts. Tasks stayed 11, jobs 22 (17 enabled), groups 20, blocked email
  actions 6, and the normalized occurrence count one.
- Boundary/rollback: backup, additive schema application, immutable release
  installation, and one service restart occurred. Runtime rollback is the
  retained prior plist/release; the additive empty schema may remain dormant,
  while DDL rollback is separately reviewed. No source registration/cursor,
  adapter wiring, Gmail/webhook/scheduler/topic/condition change, task
  create/resume, prompt/skill/capability/approval, NC-004 message/action, push,
  or merge occurred.

### NC-20260817-003 — Add durable trigger-source watermarks and gap recovery

- Date: 2026-08-17T16:08Z
- Owner/client: Codex
- State: complete; local dark foundation implemented, rehearsed, and committed,
  not deployed or activated
- Commit/PR: claim `917497d8`; implementation `070e781a` on
  `codex/nc-20260817-003-trigger-source-watermarks`; no PR
- Change class: C2 — additive local contract and unapplied host-only schema
- Source reconciliation: the existing exact-boundary scheduled-task observer
  is the only normalized adapter and is disabled. Gmail push and label-poll
  paths keep separate SQLite history IDs and currently re-bootstrap on expiry;
  the push path explicitly accepts an unmeasured loss window. Generic webhooks
  deduplicate non-null provider IDs, while some extractors produce NULL; only
  the Trafft sweeper has an older source-specific PostgreSQL watermark. Gmail
  Pub/Sub is transport, not a generic topic adapter, and no normalized topic
  or business-condition adapter exists.
- Implementation: a host-only typed contract registers immutable,
  content-free source definitions and maintains a versioned cursor head backed
  by append-only `bootstrap`, `advance`, `gap_detected`, and `gap_reconciled`
  events. Cursor and reconciliation modes are explicit. Exact replay converges;
  same-key drift, stale versions, backward movement, invalid accounting, and
  ordinary advancement across an open gap fail closed. Gap reconciliation must
  bind to the exact open gap. Results have fixed `actionAuthority: none`.
- Durable target: unapplied migration 122 adds admin-only source, watermark
  event, and state tables. Composite constraints bind current/open-gap events
  to the same source, immutable triggers protect source and history rows, and
  the state head changes only through host-admin compare-and-swap. Immutable
  release construction binds migration and rollback bytes. Populated rollback
  refuses history deletion; empty rollback removes the three tables.
- Disposable PostgreSQL evidence: PostgreSQL 16 applied migrations 121 and
  122, returned applied then duplicate registration, refused changed source
  facts, froze cursor 100 at a durable gap, reconciled that exact gap to cursor
  500, made late exact replay duplicate-only, refused a stale version, enforced
  append-only history, and exposed zero non-admin grants. Final state was one
  source, three events, state version 3, status current, cursor 500. Populated
  rollback exited 3 with all rows intact; empty rollback succeeded. The
  disposable cluster, smoke script, and temporary environment were removed.
- Verification: exact Node 22.23.2 passes 58/58 focused source/trigger tests,
  157/157 combined Company OS tests, typecheck, root build, 638/638
  email-critical tests, and the independent runner build plus 43/43 tests. The
  unrestricted full root suite is 2,609/2,610; its sole failure is the
  unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. Formatting, documentation continuity/capability, and diff
  checks pass; the capability check required its ordinary unrestricted IPC
  environment after the sandbox refused the local `tsx` socket.
- Boundary: no runtime entry point imports the module; migration 122 remains
  unapplied and unseeded. No existing Gmail/webhook/scheduler cursor or adapter
  changed. No production schema/data/config/deploy, source registration,
  schedule, channel, task create/resume, work-ledger write, agent/skill/prompt/
  capability, approval, message/action, push, or merge occurred. Production
  migration and any source-specific bounded recovery adapter remain separate
  gates.

### NC-20260817-002 — Activate one bounded scheduled-time trigger source

- Date: 2026-08-17T14:04Z
- Owner/client: Codex
- State: complete; exact release, migration, natural one-boundary occurrence,
  duplicate-only replay, config expiry, and non-interference attribution verified
- Commit/PR: claim `5561cfe6`; implementation `96e93494`; deployed release
  `baed66dba21dd35edf4d472c537a1d69c5fa867a` on
  `codex/nc-20260817-002-time-trigger-activation`; no PR
- Change class: C2 — additive production schema target, exact-release service
  deployment, and one append-only internal trigger occurrence
- Implementation: a default-off observer receives only the already-loaded task
  ID, schedule type/value, and exact pre-claim `next_run` after the scheduler's
  successful SQLite compare-and-swap. One exact configured task/boundary maps
  to hashed definition/work aliases and a versioned schedule-evidence digest.
  The observer is fire-and-forget, so refusal, conflict, or PostgreSQL failure
  cannot block, retry, or roll back the task. Aggregate health omits task ID.
- Configuration/recovery: the release-bound helper defaults to value-redacted
  dry-run, changes only three dedicated keys, selects one exact task and
  boundary, requires exact-host confirmation for apply/restore, creates an
  exclusive same-mode backup, and writes atomically. Dynamic configuration
  does not require a restart. Recording grants no task create/resume, agent,
  skill, capability, approval, message, or action authority.
- Local verification: 49/49 focused trigger/scheduler tests, exact Node
  22.23.2 typecheck, root build, 105/105 combined Company OS tests, 638/638
  email-critical tests, independent runner build plus 43/43 tests, formatting,
  documentation continuity/capability checks, and diff checks pass. The
  unrestricted full root suite is 2,580/2,581; its sole failure is the
  unchanged unrelated CNPC wrapper-string assertion expecting literal
  `folder: 'cnpc'`. A
  disposable PostgreSQL 16 cluster applied migration 121, recorded one time
  occurrence, converged exact replay, refused changed schedule semantics,
  rejected wrong task/boundary before the store, enforced append-only history,
  exposed zero non-admin grants, refused populated rollback with the row
  intact, and removed an empty table in a second database. The cluster and
  smoke script were removed.
- Production preflight: initial read-only discovery found exact release
  `a2e6d35`, sole PID 4213, connected Slack/Gmail, empty outgoing/waiting and
  active-email queues, one ambient Sales container, migrations 118-120 live,
  and migration 121 absent. SQLite has one active cron whose next natural
  boundary is `2026-08-17T14:00:00.000Z`. No drain, backup, migration, release,
  config, task, message, or production trigger row changed during preflight.
- Release: exact commit `baed66d` binds source tree
  `b27b68cf572ac5b4945239b8233fb9d8967223a2`, 704-file artifact digest
  `db45a60a58d5be706e5c02bfd87347e44cf03f9abeeac25fd39a2a660597143f`,
  Node 22.23.2, and archive SHA-256
  `47796922cd7bb45e942c8fb8ae1af3bf44c148bb8188f12a9bc95cfb63aa27a6`.
  Clean build plus fresh local and production extraction passed the bundled
  verifier.
- Drain/backup/migration: ambient work was allowed to finish naturally from a
  peak of five containers. The final gate had zero active/waiting containers,
  outgoing queue depth zero, and zero active email actions. Mode-0600 backup
  `company-trigger-before-121-2026-08-17T13-24-49Z.dump` is 54,091 bytes,
  contains 79 selected catalog entries, and has SHA-256
  `03bb242b240f0b7202330b1774626c9f4691030049ebbff63ecedab13ce8175b`.
  Only release-bound migration 121 (SHA-256
  `c8f06c5642965557c02a37c4a47d82b42246bc278a197bbb4aef133fe2b394a1`)
  was applied. Its empty table was admin-owned and append-only with zero
  non-admin table/sequence grants and zero forbidden raw/authority columns.
- Dark deployment: recovery-safe activation moved exact release `a2e6d35` to
  `baed66d`, retaining rollback plist
  `com.nanoclaw.plist.rollback-a2e6d35c3d50-2026-08-17T13-27-07-780Z`.
  One Node 22.23.2 listener proved exact release/code-root identity, connected
  Gmail/Slack, empty queues, disabled observer with zero calls, zero active
  email actions, and zero trigger rows.
- Natural canary and replay: value-redacted configuration selected the one
  existing active weekday task and exact intended boundary
  `2026-08-17T14:00:00.000Z`, retaining
  `.env.rollback-company-time-trigger-2026-08-17T13-28-07-142Z`. Its natural
  SQLite claim at `2026-08-17T14:00:11.382Z` produced daemon health of one
  call/one match/one apply/zero failures and exactly one admin-only
  `time`/`scheduled_task` row. The task advanced to its next natural boundary;
  it then completed under scheduler authority at
  `2026-08-17T14:02:30.772Z`, moving task-run count 207 to 208. Result content
  was not inspected and remains separate scheduler evidence. An exact release-bound
  replay returned duplicate and row count stayed one. The one-boundary config
  was then expired to disabled, retaining
  `.env.rollback-company-time-trigger-2026-08-17T14-01-54-108Z`; health keeps
  the 1/1/1/0 counters while exposing zero configured tasks.
- Non-interference and ambient attribution: task/job/channel definition counts
  remained 11, 22 (17 enabled), and 20, and active email actions stayed zero.
  Three ordinary approved-email actions completed during the wait, adding 15
  correctly staged events. The pre-existing shadow projected the two eligible
  Sales-email actions as 2 items/16 events/8 receipts; Company Work moved from
  9 items/version sum 35/44 events/18 receipts to 11/49/60/26. The existing
  exception loop's post-restart daily run posted Chief brief 2 for the same
  three cases and added three `briefed` events, moving attention state from
  3 cases/1 brief/9 events to 3/2/12. Those rows name their existing producers;
  the new observer wrote only the separate trigger occurrence and has no work,
  message, or action path.
- Boundary: production migration/deploy/configuration and one natural internal
  occurrence did occur. No synthetic task run, task create/resume, schedule
  definition/prompt, agent/skill/capability, trigger-created approval,
  trigger-driven customer or internal message, Company Work transition,
  action authority, push, or merge
  occurred. Other trigger families, recurring definitions, source watermarks,
  loss recovery, and every task/action promotion remain separately gated.

### NC-20260817-001 — Add the normalized Company OS trigger contract

- Date: 2026-08-17T12:17Z
- Owner/client: Codex
- State: complete local dark foundation; not deployed or activated
- Commit/PR: claim `79d18921`; implementation `ec49ac68` on
  `codex/nc-20260817-001-trigger-contract`; no PR
- Change class: C2 — additive local contract and unapplied host-only schema
- Implementation: a strict content-free v1 envelope normalizes `time`, `gmail`,
  `webhook`, `topic`, and `business_condition` occurrences. Versioned
  definition, occurrence, and semantic SHA-256 identities make exact replay
  duplicate-only and same-identity drift or split identities fail closed.
  Unknown/raw/authority/skill fields, malformed identities, non-SHA-256
  evidence, and invalid clocks are rejected. Accepted occurrences have fixed
  `actionAuthority: none`.
- Durable target: unapplied migration 121 adds one admin-only append-only table
  containing opaque keys, hashes, normalized work intent, and timestamps only.
  The injected host store inserts once and accepts a uniqueness winner as a
  duplicate only when occurrence identity and semantic fingerprint both match.
  Populated rollback refuses history deletion; immutable releases now bind the
  migration and rollback bytes.
- Disposable PostgreSQL evidence: PostgreSQL 16 inserted exactly five rows
  across all five kinds, returned exact replay as duplicate, refused semantic
  drift and UPDATE/DELETE, exposed zero non-admin grants and zero forbidden
  raw/action columns, retained all five rows after populated rollback refusal,
  and removed the table in a separate empty-database rollback. The applicable
  ordered fresh fixture chain reached migration 121; legacy migrations 17 and
  91 were skipped because the deliberately empty fixture lacks their expected
  pre-v2 public tables. The disposable cluster and smoke script were removed.
- Verification: exact Node 22.23.2 passes 29/29 focused tests, the 100/100
  combined Company OS suite, typecheck, root build, 637/637 email-critical
  tests, independent runner build plus 43/43 tests, formatting, documentation
  continuity/capability checks, and diff checks. The unrestricted full root
  suite is 2,567/2,568; its sole failure is the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`.
- Boundary: no runtime entry point imports the module; migration 121 remains
  unapplied. No production data/schema/config/deploy, source adapter, schedule,
  channel, task creation/resume, work-ledger write, agent/skill/prompt/
  capability, external message/action, push, or merge occurred. Backup and
  explicit migration apply, disabled-adapter deployment, source inventory and
  watermarks, one bounded source proof, and every work/action authority remain
  separately gated.

### NC-20260816-018 — Add the default-off Company Work operator exception loop

- Date: 2026-08-17T03:03Z
- Owner/client: Codex
- State: deployed_unverified; exact release, schema, one-operator configuration,
  naturally sourced Chief brief, named check-reaction acknowledgment, and
  threaded receipt are live-verified; later source-derived resolution remains
  pending
- Commit/PR: claim `a036f5a`; implementation `bb417fb`; dark release
  `0d2c8ecfab96311db18c58db66cd277a6cb92c68`; activation release
  `a2e6d35c3d50fe562bafd10b848b2cedecf8df34` on
  `codex/nc-20260816-018-company-work-exception-loop`; no PR
- Change class: C5 — exact Slack UID operator identity, C3 internal Slack
  delivery, and C2 host-only PostgreSQL attention state
- Implementation: migration 120 adds admin-only current reason cases, exact
  Slack brief/delivery state, and append-only lifecycle events separate from
  Company Work workflow state. The default-off host loop refuses unavailable or
  truncated reports, claims Chicago-day/change fingerprints before Slack,
  never retries ambiguous delivery, bounds visible content, and source-resolves
  a case only when a later complete report omits the exact reason.
- Acknowledgment boundary: the Slack callback now supplies exact UID and
  reaction/text provenance to backward-compatible host listeners. Only a
  configured UID's check reaction on the exact durably bound brief acknowledges
  current occurrences. Typed approval, unnamed users, old briefs, and unbound
  delivered messages fail closed with best-effort visible receipts. Nothing in
  this path resolves, approves, retries, sends, pauses/resumes, or advances a
  work item.
- Configuration/recovery: tracked defaults are off. Enabled mode fails closed
  on empty/malformed operator identity or invalid numeric bounds. The bundled
  release-bound helper defaults to redacted dry-run, copies only an approved
  existing named-operator source, requires exact hostname for apply/restore,
  backs up the env file, and writes atomically. Recorded schema history is left
  dormant on runtime rollback; the DDL rollback refuses populated tables.
- Verification so far: exact Node 22.23.2 typecheck, 131 focused boundary tests,
  the 85-test combined Company Work suite, 637/637 email-critical tests, and the
  independent runner build plus 43/43 tests pass. The unrestricted full root
  suite is 2,536/2,537; its sole failure is the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`.
  A disposable PostgreSQL 16 run applied migrations 118 -> 119 -> 120 and
  proved open/dedupe/source-resolution/reopen, old-brief occurrence isolation,
  exact acknowledgment/receipt, append-only rejection, populated rollback
  refusal, and unchanged source-ledger cardinality (1 item/1 event/0 receipts;
  1 case/2 briefs/6 attention events). A second empty cluster proved the
  guarded rollback removes all three empty tables. Both disposable clusters
  were stopped.
- Release artifact: the clean commit binds source-tree hash
  `f8d83fe7c1690c546f13cd800b9aa0036562343a`, 692-file artifact digest
  `d42825ce1af42e5ec589f7fdda0fafbcde056cdf441f3c90b5a5b9a4fd40f7a5`,
  and `.release/nanoclaw-0d2c8ecfab96.tar.gz` digest
  `d1a38fe69e4ce3316704978e1b98b07af0461e1f18f8522f1bdd12e46b5b64ad`.
  Fresh local and production extraction both verified the archive.
- Production preflight/migration: `mini-claw.local` began on exact release
  `999f2a44f7737d624e4c588f8a057a17ff5ca783`, one Node 22.23.2 listener,
  connected Slack/Gmail, empty queues, zero active containers/actions, one
  Chief target, migrations 118/119 live, and migration 120 absent. The mode-0600
  custom-format backup
  `company-work-before-120-2026-08-17T02-46-42-864Z.dump` has 56 catalog
  entries and SHA-256
  `c3454457d9802706ee5037427c679923c8b807d773cb99c22e6b5f72172d1799`.
  Only migration 120 was applied. Its three empty tables are owned by the admin
  role, have zero non-admin grants, include the append-only event trigger, and
  expose zero raw-content columns.
- Dark activation: the host now serves exact release `0d2c8ec` from sole PID
  92811 under Node 22.23.2 with Slack/Gmail connected, zero active containers,
  empty runtime/outgoing queues, duplicate-only Company Work shadow health,
  and zero active email actions. Exception-loop health is `disabled`, with zero
  configured operators, interval 86,400,000 ms, report limit 100, stale bound
  24 hours, target `chief`, no running tick, zero attempts, and no last result.
  All attention tables remain empty. Company Work stayed at 9 items/version sum
  35, 44 events, and 18 receipts with hashes
  `39f56d8e4c3d75bac9497e83a6d0f0c8377f5a378effc64b09339c6161214d7d`,
  `b2304b3af1d608259ae4ebf7261ff49844168f9198df71576c70cc8439c41502`,
  and `ff29662cb0faa53ab882f03e59c6721a17b7178d7b86dbf13d5a9697dfd1d56d`.
  Email actions/events retained hashes
  `fbe8540f66f84cf2426387bca1708a6dd80c716752b1d54f9624589884e4bcc7`
  and `82ba3d894e4a665e91db1dd1aa6ea36fe7b618a77100a1f83452d0cb37f30bcc`.
  Four ordinary scheduler run rows appeared during the deployment window;
  job-definition/task counts remained 22/11 and the disabled loop never ran.
- Operator gate and rollback: none of the approved named-operator source keys
  exists in production configuration. Privacy-minimized Chief membership
  metadata identifies Alex Kudinov as the sole human participant, but this is
  discovery evidence, not a C5 authority grant. No allowlist was manufactured
  and no Slack canary was posted. The prior launchd plist is retained as
  `com.nanoclaw.plist.rollback-999f2a44f773-2026-08-17T02-47-05-260Z`.
- Operator decision: at 2026-08-17T02:57Z the owner explicitly confirmed Alex
  Kudinov as the sole Company Work exception operator. That confirmation grants
  attention acknowledgment only; it does not confer Procurement, Healer,
  approval, email, job, or workflow authority. The activation candidate adds a
  dedicated, value-redacted bootstrap from one owner-only regular file because
  no approved existing source key contains this identity. It rejects symlinks,
  permissive or wrong-owner files, multiple/malformed IDs, and ambiguous source
  selection; public results contain only the operator count.
- Activation-delta verification: exact Node 22.23.2 typecheck and 28 focused
  tests pass; the email-critical suite remains 637/637 and the independent
  runner build plus 43/43 tests pass. The unrestricted full root suite is
  2,538/2,539 with only the unchanged unrelated CNPC wrapper-string assertion
  expecting literal `folder: 'cnpc'`.
- Activation artifact: clean commit
  `a2e6d35c3d50fe562bafd10b848b2cedecf8df34` binds source tree
  `a1b746d8ca8e0dac7a9bba8638b83e87682acc5e`, a 692-file artifact with
  SHA-256 `641555c5eb41ae703539cb3b036cae9c0b3987d7370b348376106dedb6682264`,
  and archive `.release/nanoclaw-a2e6d35c3d50.tar.gz` with SHA-256
  `0875c982ab5ae60d11e38bb487f65dea79321b691aa45e67c31684b76e230c54`.
  Fresh local and production extraction passed the bundled verifier. The
  recovery-safe activation moved exact release `0d2c8ec` to `a2e6d35` and
  retained
  `com.nanoclaw.plist.rollback-0d2c8ecfab96-2026-08-17T03-10-57-251Z`.
- Operator configuration: the value-redacted resolver found exactly one Slack
  UID for the owner-confirmed Alex Kudinov identity from 128 human Chief
  messages. Dry-run showed disabled/zero operators to active/one operator.
  Apply created
  `.env.rollback-company-work-exceptions-2026-08-17T03-15-38-698Z`; a second
  redacted pass reported the active one-operator configuration unchanged. The
  exact temporary UID file and resolver were then removed. This grant remains
  attention acknowledgment only.
- Live canary: a bounded restart moved PID 2035 to sole PID 4213. Exact release
  `a2e6d35` is verified with a matching code root, connected Slack/Gmail, zero
  active containers, and empty active/waiting queues. The first loop run at
  `2026-08-17T03:17:16Z` succeeded: 9 items scanned, one naturally present
  critical exception item, three exact reason cases opened, and brief 1 posted
  and durably bound in Chief. The complete report remained 8 completed, zero
  healthy open, one exception across 4 Sales-email and 5 host-job items; its
  exact reasons were one each of source gap, failed, and stale. Attention state
  began as 3 open cases, 1 posted brief, and 6 append-only events (3 opened and
  3 briefed).
- Named acknowledgment: at `2026-08-17T11:54:24.096Z`, Alex's exact check
  reaction on brief 1 acknowledged all three current occurrences in one
  transaction. The brief and all three cases carry the same acknowledgment
  instant; three append-only `acknowledged` events were added, and the threaded
  acknowledgment receipt is durably `posted`. Current attention state is 3
  acknowledged cases, 1 posted/acknowledged brief, and 9 events split exactly
  3 opened, 3 briefed, and 3 acknowledged. Operator identity remained redacted
  from operational evidence.
- Non-interference proof: one value-redacted verifier captured identical before
  and post-canary hashes for 9 Company Work items
  (`2294c17e...`), 44 events (`d6e62606...`), 18 receipts (`c139a6fa...`),
  67 email action rows (`511a0b96...`), 334 email events (`4f3f3b66...`),
  22 job definitions/17 enabled (`9834e713...`), 11 task definitions
  (`ae9c5caf...`), and 20 channel definitions (`58e3a0ba...`). The only writes
  were the expected separate attention records, Chief brief, acknowledgment,
  and threaded receipt. Final health remains exact release `a2e6d35` on sole
  PID 4213 with connected Slack/Gmail, zero active containers, empty
  active/waiting queues, active one-operator loop, one successful run, and zero
  loop failures.
- Boundary: production migration 120 and exact dark release activation did
  occur, followed by the explicitly authorized one-operator configuration,
  restart, and one naturally sourced Chief brief. No customer message,
  email/job/workflow action, container wake, prompt, capability, push, or merge
  occurred. Named check-reaction acknowledgment and its threaded receipt are
  verified; later natural source resolution remains unverified and must not be
  manufactured by changing source work.

### NC-20260816-017 — Activate bounded Campanero host-job ledger observation

- Date: 2026-08-17T01:55Z
- Owner/client: Codex
- State: complete; deployed and live-verified
- Commit/PR: claim `8d209e5`; implementation and immutable release
  `999f2a44f7737d624e4c588f8a057a17ff5ca783` on
  `codex/nc-20260816-017-campanero-ledger-activation`; no PR
- Change class: C2 — production schema/write plus reversible service activation
- Production preflight: `mini-claw.local` serves exact verified release
  `cf9625847bb2cbb0faa167f68a0f842d645e1807` from one Node 22.23.2 listener
  with connected Slack/Gmail, zero active containers, empty runtime/outgoing
  queues, and zero active email actions. Migration 118 is live and migration
  119 is absent. The existing ledger has 4 `sales_email` items/version sum 25,
  29 events, and 13 receipts. No `COMPANY_JOB_WORK_SHADOW_*` configuration is
  present.
- Source parity baseline: SQLite has 22 job definitions/17 enabled and 106,497
  run rows through cutoff `2026-08-17T01:22:35.120Z`. Privacy-minimized job
  definition, job runtime, and run-history hashes are respectively
  `9834e713831290e3f221b1efbf5c441e0c8e71509b96e8dbb04f730bd9d03cdd`,
  `d2d6ca5cf9e6717d3b4789fbb6ae1c9c67d7cbd89295d0b5c8a1516eb4bb4e51`,
  and `1f03094cfbb35f88ee333d94a1058d1bf9826c0aa031bcebb1be55252518ff1c`.
  The 11 scheduled-task definitions hash to
  `0a6378eba45332dafee2aa979b353707a25b4a5696127deb890aec82c39baed5`.
- Implementation: the explicit projection CLI opens SQLite read-only, requires
  an inclusive lower timestamp, closed inclusive upper timestamp, 1-250 batch
  ceiling, and exact `NC-017-HOST-JOB-SHADOW` confirmation. A truncated window,
  missing job definition, or any malformed structural row is rejected before
  the first ledger write. It selects no output, error text, log path, script,
  arguments, environment, prompt, or customer content and is not imported by
  the daemon/scheduler. Migration 119 plus its guarded rollback are bound into
  the verified release. The existing read-only report now applies distinct
  email/job milestone, identity, failure, and receipt rules and can filter
  either workflow or both.
- Verification: exact Node 22.23.2 passes 125/125 focused tests, typecheck,
  build, source formatting, 636/636 email-critical tests, and the independent
  runner build plus 43/43 tests. The unrestricted full root suite passes
  2,508/2,509; the sole failure is the unchanged unrelated CNPC wrapper-string
  assertion expecting literal `folder: 'cnpc'`.
- Data proof: disposable PostgreSQL 16.15 proved migration 118 -> 119, then the
  compiled CLI projected one exact successful SQLite fixture as three
  transitions plus one terminal receipt. Exact-window replay applied zero
  transitions and classified all three facts as duplicates. The real
  job-filtered PostgreSQL report returned one completed item and zero
  exceptions. The disposable cluster and fixture were stopped and removed.
- Release: exact Node 22.23.2 built clean commit `999f2a4` with source tree
  `7f484757f9db890165110536b83966d97fd6da6d`, 684-file artifact
  `e2056f328630a2f4383f129a22ac9c38dcce97869d97ccda808803a0346accfb`,
  and archive SHA-256
  `e1c929ccd59f0e527fd6956c9f63ee372159975cd9e1a0d639de93a6db63a0ce`.
  Fresh local extraction and production extraction independently passed the
  bundled verifier. Dry-run activation reported exactly the three permitted
  plist pointer changes.
- Migration/backup: after drain and explicit service stop, a mode-0600,
  27,993-byte custom-format backup of the three Company OS tables was validated
  at
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/company-work-before-119-2026-08-17T01-50-18Z.dump`
  with SHA-256
  `4a75642e2215e983a9d8cac5c2f9258d7589c3986de7eea32c08d1b7488628c5`.
  Only bundled migration 119 (SHA-256
  `b02ba2bd51e19dab5c2b48eb90628e5f41cbff1ac428f143954623c330e20283`)
  was applied. Four required constraints, three admin-owned tables, zero PUBLIC
  grants, and the unchanged 4-item/25-version/29-event/13-receipt email ledger
  were verified before restart.
- Deployment: recovery-safe activation moved `cf96258` to exact release
  `999f2a4`, retained rollback plist
  `com.nanoclaw.plist.rollback-cf9625847bb2-2026-08-17T01-51-57-754Z`, and
  converged launchd, the sole port-8088 listener, and heartbeat to PID `74446`.
  Health proves the exact commit/tree/artifact and Node pin, connected
  Slack/Gmail, zero active containers, empty runtime/outgoing queues, and a
  healthy unchanged email shadow. No job-observer environment key exists.
- Production proof: the closed inclusive window
  `2026-08-17T01:45:40.000Z` -> `2026-08-17T01:48:41.000Z` contained exactly
  five complete successful runs below batch limit 10. First pass applied 15
  transitions and five receipts with no error/truncation; exact replay applied
  zero and recognized all 15 facts as duplicates. The job-only report returned
  5 completed/0 exceptions. The combined report returned 9 items, 8 completed,
  and only the unchanged critical/stale
  `source_gap:mailman_dispatch_missing` email exception.
- Parity: source-window SHA-256
  `31209131f0d271b4f32d6d1c1654e2e78d1974df8d166dff9445605ac9470eca`,
  22-job definition SHA-256
  `f469526d807786e44a5c66c54d90c70eb3cea3cab8a5d7c8e1d497d02dc00e7e`,
  11-task definition SHA-256
  `20baa943f07bff839edbe7eb78e1cf4a599e356c465a4936023b6df9d8e314a8`,
  and all three Mailman/Sales table hashes were byte-for-value unchanged. Email
  state remained zero active actions/334 events. PostgreSQL changed by exactly
  the expected five items/version sum 10, 15 events, and five receipts.
- Boundary: SQLite and the scheduler remain authoritative. The CLI is
  default-off and unscheduled. No job run/pause/resume, definition/schedule,
  Campanero prompt/capability, recurring task, Slack/Gmail/customer message,
  other external write, push, or merge occurred.
- Rollback: restore the retained `cf96258` plist/release and leave the new
  append-only rows dormant. Because five `host_job_run` rows now exist, the
  guarded schema rollback correctly must not run; never delete history to force
  it.

### NC-20260816-016 — Add a dark Campanero host-job ledger pilot

- Date: 2026-08-17T00:36Z
- Owner/client: Codex
- State: complete; local dark milestone only
- Commit/PR: claim `496c9d3`; implementation `9fb0437` on
  `codex/nc-20260816-016-campanero-ledger-shadow`; no PR
- Change class: C2 — local, reversible schema and host-only projection
- Intended outcome: establish host-job executions managed through Campanero as
  the second Company OS work-ledger pilot without changing scheduler behavior
  or displacing the SQLite job registry/`job_run_logs` authority.
- Schema: unapplied migration 119 adds the non-Party `host_job_run` workflow,
  `execution_started`/receipt-bound `execution_failed` facts, and a
  workflow-specific identity/completion constraint while preserving migration
  118's append-only events/receipts, optimistic versions, idempotency, unique
  source identity, ownership, and no-agent-grant controls. Its tracked rollback
  refuses to discard or narrow any host-job history.
- Projection: a new injected single-run projector accepts only structural
  job/run identity, timestamps, status, duration, exit/PID presence, retry, and
  timeout facts. One immutable `job_run_logs.id` becomes one work item. Exact
  success/failure rows receive terminal receipts; contradictory or incomplete
  facts fail closed as named source gaps without an invented receipt. It has no
  SQLite reader, timer, daemon/scheduler import, channel dependency, or job
  mutation. Existing email APIs are workflow-guarded, and the deployed report
  remains explicitly `sales_email`-only.
- Verification: exact Node 22.23.2 passes 35/35 focused ledger/shadow tests,
  typecheck, build, source formatting, 635/635 email-critical tests, and the
  independent runner build plus 43/43 tests. The unrestricted full root suite
  passes 2,501/2,502; the sole failure is the unchanged unrelated CNPC wrapper
  assertion expecting literal `folder: 'cnpc'`. Schema sanitization,
  capability-matrix verification, diff checks, and documentation continuity
  pass.
- Data proof: disposable PostgreSQL 16.15 proved migration 118 -> 119 preserves
  existing `sales_email` history, accepts one exact receipt-bound failed host
  run, rejects Party/pipeline binding on a host run, and refuses rollback while
  host history exists. A separate 118 -> 119 -> rollback rehearsal with no host
  history preserved the email row and restored both Party/pipeline columns to
  NOT NULL.
- Boundary: migration 119 was not applied; no production read/write, runtime
  import, job run/pause/resume, schedule change, Campanero prompt/capability
  change, deployment, Slack/Gmail message, push, or merge occurred. The known
  `already_running` path still has no durable run row and is not inferred.
- Rollback: revert the local commits. No database, service, scheduler, channel,
  job, message, or external-state recovery applies.

### NC-20260816-015 — Deploy and prove the read-only Company OS brief

- Date: 2026-08-16T23:51Z
- Owner/client: Codex
- State: complete; deployed and live read-verified
- Commit/PR: deployment claim/release `cf9625847bb2cbb0faa167f68a0f842d645e1807`;
  evidence `360b0ae` on
  `codex/nc-20260816-015-work-ledger-report-deploy`; no PR
- Change class: C2 reversible service activation plus C0 production read
- Preflight: `mini-claw.local` served verified release `02ce48f` from one
  listener with connected Slack/Gmail, zero active containers, empty runtime
  and outgoing queues, zero active email actions, 61 confirmed/6 blocked email
  actions, 334 email events, and Company OS fingerprint 4 items/version sum
  25/29 events/13 receipts.
- Release: exact Node 22.23.2 built clean commit `cf962584` with source tree
  `0edd192cc8bb073fc028c05645727a1554ea164e`, 676-file artifact
  `02627f90816dd80657a92cc17e89b2eea8bf8d3f721b5997c771081ecdcdb960`,
  and archive SHA-256
  `f2ecf9e81d76a94a695d1afd94d37ea463f0db9b388c925139f448299153b6d5`.
  The archive and compiled report CLI independently verified both locally and
  after fresh extraction on production. The release build passed 635/635
  email-critical tests and the independent runner build plus 43/43 tests.
- Deployment: the bundled dry run verified the exact current/target releases,
  interpreter, bundles, health, listener tools, candidate plist, and exactly
  three pointer changes. Applied activation moved `02ce48f` to `cf96258`,
  created rollback plist
  `com.nanoclaw.plist.rollback-02ce48f5564c-2026-08-16T23-49-36-282Z`, and
  converged to sole listener/launchd/heartbeat PID `16616`. Health reports the
  exact commit, source tree, artifact, Node pin, code root match, connected
  Slack/Gmail, empty queues, and a healthy duplicate-only shadow cycle.
- Production read: one compiled `--json --limit 100 --stale-after-hours 24`
  invocation scanned all four work items without truncation. It reported three
  completed items and one known critical failed/stale
  `source_gap:mailman_dispatch_missing`; all contradiction, event-chain,
  duplicate, receipt-gap, overdue, waiting-approval, and outcome-missing counts
  were zero.
- No-write proof: the Company OS count/version/timestamp fingerprint and SQLite
  email counts were byte-for-value identical after the report. No task-authored
  message, migration, configuration, prompt, workflow transition, email,
  production data write, push, or merge occurred.
- Ambient activity addendum, 2026-08-16T23:58Z: after the 23:50Z bounded
  report/comparison window, the normally running service recorded one
  Booking-group outbound Slack row at 23:56:54Z (two allowed Slack boundary
  checks). Its content was not inspected, it was not task-authored, and it is
  not counted as NC-015 or NC-013 outcome evidence.
- Rollback: restore the retained exact plist and health-verify release
  `02ce48f`; no database rollback or external side-effect recovery applies.

### NC-20260816-014 — Add a read-only Company OS exception brief

- Date: 2026-08-16T23:27Z
- Owner/client: Codex
- State: complete; local milestone only
- Commit/PR: implementation `7ee3f67` on
  `codex/nc-20260816-014-work-ledger-exceptions`; no PR
- Change class: C2 — local, reversible, read-only operator tooling
- Intended outcome: turn the live-verified Mailman/Sales shadow ledger into a
  privacy-minimized reconciliation summary and compact exception brief without
  allowing the ledger to control email.
- Implementation: one static bounded PostgreSQL `SELECT` reconciles work-item,
  event-version, milestone, receipt, deadline, source-gap, disposition, and
  outcome-closure facts. The compiled CLI exposes text or JSON output with
  read bounds only and returns a content-free `ledger_query_failed` result when
  the read boundary is unavailable. It is not imported by the daemon or shadow
  observer.
- Safety: output is limited to opaque work/source/Party/pipeline identities,
  state, timestamps/ages, codes, and aggregate counts. The change does not
  alter schema, agent prompts, SQLite email authority, approval/send/retry/
  closure behavior, schedules, Slack, Gmail, or any external system. It was
  not deployed and was not run against production under this task.
- Verification: exact Node 22.23.2 passes 28/28 focused ledger/shadow/report
  tests, typecheck, build, source formatting, 635/635 email-critical root tests,
  and the independent runner build plus 43/43 tests. The full root suite passes
  2,484/2,485 after the 48 permission-sensitive tests pass in an unrestricted
  rerun; the sole failure is the unchanged unrelated CNPC wrapper-string
  assertion expecting literal `folder: 'cnpc'`. Schema sanitization,
  capability-matrix verification, and continuity checks pass.
- Rollback: revert the report, CLI, test, package script, and documentation
  changes. No database, deployment, message, email, or external-state recovery
  applies.

### NC-20260816-013 — Cut Booking lifecycle Plutio writes over to the host

- Date: 2026-08-16T22:55Z
- Owner/client: Codex
- State: deployed_unverified; capability and replay boundaries verified, one
  fresh post-fix natural lifecycle observation remains
- Commit/PR: claim `58778d9`; implementation `08cbb9b`; release-path correction
  and immutable release `77064e9`; scheduled-task/receipt correction `67f16d5`;
  immutable reaper boundary `02ce48f` on
  `codex/nc-20260816-013-booking-plutio-cutover` from `f10c572`; no PR
- Change class: C5 — external-write capability cutover
- Intended outcome: enqueue canceled/rescheduled Booking activity through the
  durable, replay-safe host Plutio adapter and remove raw Plutio secrets/tools
  from the Booking container.
- Discovery: receiver and inbox-reaper agent paths currently treat a returned
  `status='error'` as handled. Enqueue after `runAgent` alone is insufficient;
  both paths must also require successful completion and a matching persisted
  Booking interaction derived from the archived Trafft event.
- Scope/safety: source, tests, Booking prompt/procedure, capability and
  registration source, architecture/roadmap evidence, exact-release
  installation, Booking drain, registered-mount transaction, prompt activation,
  and side-effect-free live boundary verification. The approved deployment did
  not authorize customer traffic, email, Trafft mutation, credential rotation,
  push, or merge. The owner later authorized exactly one synthetic
  normal-ingress event, its Booking/Slack/outbox/Plutio effects, and one
  duplicate replay. That duplicate is deferred until the discovered release
  blockers are repaired and deployed; no distinct webhook event is authorized.
- Implementation: canceled/rescheduled Booking interactions now use the exact
  archive-derived event id. Initial receiver and inbox replay both reject a
  resolved container error, require the persisted interaction's event id,
  appointment id, and event type, and only then insert or reuse the opaque
  durable Plutio action. Booking's direct Plutio procedure, credential family,
  and `plutio`/`toolbox-lib` mounts are removed together. The installed
  registration cutover is dry-run-first, exact-host/release-bound for apply,
  fail-closed on partial legacy state, and backup/restore capable; its inclusion
  in the immutable release inventory has a source contract test.
- Verification: exact Node 22.23.2 passes typecheck, build, formatting,
  documentation continuity, 144/144 focused tests, 635/635 email-critical root
  tests, and the independent runner build plus 40/40 tests. The full root suite
  passes 2,472/2,473; the sole failure is the unchanged unrelated CNPC
  wrapper-string assertion expecting literal `folder: 'cnpc'`. No production
  database, webhook, Slack, Trafft, or Plutio action occurred.
- Canary incident: one sanitized rescheduled event was accepted as inbox
  `4469`. It created synthetic party `11333`, exact lifecycle interaction
  `3034`, processed party-sync row `1311`, and two exact Booking notices rather
  than the intended one. Both agent turns emitted successful results, but the
  scheduled-task runner remained warm until liveness/spawn cleanup converted
  those results to host errors. The deployed completion gate was recovered
  against the exact archived event and interaction, producing Booking activity
  row `1312` and marking the inbox handled before any further retry.
- Plutio incident: exact row `1312` reached the authorized remote activity
  step, then the post-write metadata update failed with SQLSTATE `42P18`
  because `$1` inside `jsonb_build_object` lacked a text cast. The marker makes
  the next attempt no-write. Row `1312` remains failed and retryable; no email
  or Trafft mutation occurred.
- Corrective implementation: scheduled tasks now retain their one-shot identity
  across credential retries, receive the scheduled prefix idempotently, and
  exit immediately after emitting one result. The Booking receipt metadata
  update now binds `$1::text`. Focused receiver/inbox/Booking/reaper checks pass
  59/59; the full independent runner passes 43/43; both packages build and root
  typecheck passes. A read-only production PostgreSQL probe confirms the cast.
- Corrective deployment: immutable release `67f16d5a412e6b96312c9bf41d6ac068ef229347`
  is live with source tree `990b1f3bea03afc34d2b1b96aa293e891cb7b2d0`,
  artifact hash `bc18e6c165a6d14e725c7ed49c36e63a4aeeeb29ddfc538cf1a00d8d02cbf2d4`,
  rebuilt runner image `sha256:0618fbecf88cc0298fa9665db1c0c2c0ad368da37d471d148fb984e310ca835e`,
  and 18 refreshed runner snapshots at source hash
  `94cd1d978f34de9195c659e21d251b05`. Fresh launchd PID `17509` serves the
  exact verified release with connected Gmail/Slack and an empty container
  queue; rollback plist
  `com.nanoclaw.plist.rollback-77064e99c4dc-2026-08-16T22-45-35-278Z`
  remains available.
- Third canary blocker: before the controlled retry, the existing scheduled
  Plutio job invoked `tools/plutio/run-reaper.sh`, which still runs `npx tsx`
  against the operational checkout rather than the active release. Its
  local-only dispatch did not recognize the Booking kind and moved row `1312`
  to failed attempt 2 without a Plutio call. The repair adds a compiled release
  CLI, includes the Plutio launcher in immutable bundles, and makes the
  operational launcher verify and execute the code root and Node interpreter
  named by the installed launchd service.
- Final corrective release: `02ce48f5564cb88e59c23fdb7178719772899645`
  has source tree `81ca79bb7b474eafdbc80bb5f2380aa502478d42`,
  668-file artifact hash
  `186369904b851f05c1a87dcc36712631132cbeee407aef67bf25b658bf220858`,
  and archive SHA-256
  `c53b925a1301affdc6545971a82f33f7ce1272c0f610480f7bce56eb06a93009`.
  Fresh extraction verified the compiled CLI and byte-identical bundled
  launcher. Production activation retained rollback plist
  `com.nanoclaw.plist.rollback-67f16d5a412e-2026-08-16T22-52-25-594Z`.
  The operational launcher is hash-bound to the release copy, with its prior
  file retained as `run-reaper.sh.rollback-nc013-2026-08-16T22-52Z`.
- Release artifact:
  `77064e99c4dc2e1342993ba8659a820fd2a1bf05` has source tree
  `f83601b26773952947ba54d7efc647e22f7c913c`, 664-file artifact hash
  `88b2de9c56af4326b6e88592e022cc17c8f4a3f6f7e9528e752b81eeb14b545f`,
  and archive SHA-256
  `2aebc8f4490a6d34affcd1eefcf5efa802fd2495fb257db8dda381212edffc24`.
  Fresh extraction verified the entire bundle. A separate disposable
  operational root proved release-root/data-root separation, wrong host and
  release denial, exact two-mount removal, no-change replay, mode-0600 backup,
  and exact restore without touching production.
- Deployment: the archive independently verified on `mini-claw.local`, then
  installed at exact release `77064e9`. Booking drained with zero active or
  waiting containers. The registration helper removed only `plutio` and
  `toolbox-lib`, preserved an exclusive rollback snapshot, and returned a
  no-change plan on replay. The two live Booking procedure files match the
  release, and activation preserved the prior `13ca192` LaunchAgent.
- Live boundary verification: one healthy Node 22.23.2 listener reports exact
  verified release `77064e9`; Gmail and Slack are connected; work and outgoing
  Slack queues are empty. Booking mounts are exactly `knowledge` and
  `agent_docs`. The installed verifier reports only `business_db`, all
  configured Trafft and Plutio source names absent, and all required DB inputs
  present. No retryable lifecycle row or `booking_activity:*` outbox row exists.
- Recovery and replay outcome: the real operational launcher verified and ran
  release `02ce48f`, processed only row `1312`, and reported one success with
  zero retries/dead letters. The row is terminal `processed`; its durable
  receipt says `already_recorded` and contains marker/person/note evidence;
  interaction `3034` carries its opaque Plutio person reference; and the active
  outbox is empty. The one authorized duplicate webhook returned HTTP 200 for
  inbox `4469` with inbox, party, interaction, and outbox counts unchanged.
  The exact production image passes the focused 5/5 one-shot runner suite
  without mounts or credentials. Final health reports release `02ce48f`, Node
  22.23.2, connected Gmail/Slack, and empty work queues.
- Automatic scheduler verification: the first post-fix cron cycle began at
  `2026-08-16T23:00:29Z`, exited 0, and recorded `ok`; its compiled reaper
  receipt reports zero processed, succeeded, retried, or dead-lettered rows.
- Final local verification: exact Node 22.23.2 passes the 16/16 focused
  Booking/Plutio/compiled-CLI set, root typecheck/build, shell syntax,
  documentation continuity, the 635/635 email-critical release gate, and the
  independent runner's 43/43 suite. The unrestricted root suite passes
  2,474/2,475; its sole failure is the unchanged unrelated CNPC wrapper-string
  assertion expecting literal `folder: 'cnpc'`.
- Outcome boundary: capability removal, durable receipt, remote no-write replay,
  and duplicate ingress are live-verified. The original normal event required
  operator recovery and produced two Booking notices before the fixes, so this
  remains `deployed_unverified` pending one fresh post-fix natural lifecycle
  observation. No distinct synthetic webhook, email, or Trafft mutation is
  authorized.

### NC-20260816-012 — Prove Booking reschedule identity and the real Plutio marker

- Date: 2026-08-16T20:55Z
- Owner/client: Codex
- State: complete; corrected release deployed and real marker readback plus
  immediate no-write replay verified
- Commit/PR: claim `65c6d1b`; initial implementation/release `ed957d3`;
  corrective implementation/release `13ca192` on
  `codex/nc-20260816-012-booking-plutio-marker`; no PR
- Change class: C5 — shared webhook identity plus bounded external canary
- Intended outcome: make the shared Trafft reschedule key correct for the
  flattened production payload and empirically prove that the NC-011 replay
  marker survives a real Plutio write/read cycle before any Booking cutover.
- Scope/safety: shared extractor and adapter tests, a dry-run-first exact-host
  and exact-release-bound canary, immutable release/deployment, and one stable
  synthetic Plutio person/activity plus immediate replay. Natural ingress,
  outbox enqueue, Booking prompt/manifest/mount changes, Plutio credential
  removal/rotation, Trafft calls, production DB writes, customer/Slack messages,
  push, and merge remain excluded.
- Implementation: add flattened `appointmentStartDateTime` to the shared
  Trafft reschedule identity and remove NC-011's divergent Booking-only repair.
  Bundle a stable synthetic marker canary that verifies exact installed release
  integrity, requires full host/release confirmation for apply, requires exactly
  one read-back marker before replay, and blocks a replay activity call at the
  injected caller. Booking behavior, procedure, prompt, manifest, mounts, and
  credential projection remain unchanged.
- Verification: exact Node 22.23.2 passes typecheck and source formatting;
  54/54 focused tests; 179/179 broader tests; 635/635 email-critical tests; and
  independent runner build plus 40/40 tests. The unrestricted root suite passes
  2,461/2,462; its sole failure is the unchanged unrelated CNPC wrapper-string
  assertion. No external or production-database call occurred.
- Release/deployment: exact release
  `ed957d35877a33b0258d4af00362e54d63705e08` has source tree
  `60f1fb02dd640d9cb127267efbd3e358888e82eb`, 660-file artifact hash
  `ff8bcf0c1f779e6ec2640ebb35938fb3c30029d84302e3b09da48f02c65585da`,
  and archive SHA-256
  `9cbff2f953ca691139d78a299ff6e29eff821e591c10deff5ff646c5a08127d4`.
  Fresh local extraction and the installed Mini bundle independently verified.
  Activation from `63ed4aa` changed only the expected three plist values;
  rollback is
  `com.nanoclaw.plist.rollback-63ed4aacf41e-2026-08-16T21-08-37-509Z`.
- Live canary: wrong-host and wrong-release apply both failed before Plutio, and
  the dry run was side-effect-free. The one authorized apply created the stable
  synthetic person and appended exactly one Activity Log entry. A read-only
  lookup proved Plutio preserved the visible entry but stripped the HTML-comment
  digest marker. The canary saw zero marker occurrences and refused replay,
  adding no second activity. Root cause is therefore the remote representation,
  not identity extraction or replay control flow.
- Non-interference/rollback: exact `ed957d3` is healthy with one listener,
  Gmail/Slack connected, 17/17 manifests, `booking,campanero` selected, and no
  active/waiting/outgoing work. Email, task, and Plutio-outbox aggregates are
  unchanged at 61 confirmed/6 blocked, 334 send events, one completed Campanero
  task/no Booking task, 1,259 processed/15 dead, and zero
  `booking_activity:%`. The transferred archive was removed. The installed
  release and rollback remain, and the synthetic Plutio evidence is retained.
- Follow-up gate: use a visible text-safe digest marker, then obtain explicit
  authority for one additional corrective synthetic Activity Log mutation and
  prove exact-one readback plus immediate no-write replay. Natural ingress and
  Plutio capability removal remain prohibited until that succeeds.
- Authority extension (2026-08-16T21:17Z): the owner approved that one
  additional mutation on the existing synthetic contact. A third entry,
  deletion/rewriting of the negative evidence, customer data, natural ingress,
  database mutation, and Booking capability removal remain outside scope.
- Correction: replace the stripped HTML comment with visible text-only
  `[nanoclaw-booking:<sha256>]`, preserving the same canonical event binding,
  exact-one remote readback, and replay activity-write tripwire. Exact Node
  22.23.2 passes typecheck, source formatting, 55/55 focused tests, 635/635
  email-critical tests, runner build plus 40/40 tests, and 2,462/2,463 root
  tests; the sole failure remains the unrelated CNPC wrapper-string baseline.
- Corrective release: exact commit
  `13ca192e56f8860cc961e5178a73fd4e809aa6c9`, source tree
  `0c9e4d696b00571058a3ec10ab9b62b26a6b36ad`, 660-file artifact hash
  `fcfb7b6ae45d45d50500125babdde7a7d62587d1cf1442164fedce9979837152`,
  and archive SHA-256
  `c9dcc39f607b2d8bbfa6d3b4cb090361de789fa05bdfdeb5f2003436bea81296`
  independently verified locally and on the Mini. Activation from `ed957d3`
  changed only the expected three plist values; rollback is
  `com.nanoclaw.plist.rollback-ed957d35877a-2026-08-16T21-22-00-130Z`.
- Corrective canary: pre-read showed one note, one entry, and zero visible
  markers. The final authorized apply appended the visible digest once,
  confirmed exactly one occurrence, and returned `already_recorded` on replay
  after only person upsert and note read; replay never called the activity
  writer. Independent post-read showed one note, two retained evidence entries,
  and exactly one visible marker.
- Final live evidence: refreshed PID `84353` owns the sole listener and reports
  exact `13ca192`, Node 22.23.2, connected Gmail/Slack, 17/17 valid manifests,
  selected groups `booking,campanero`, and zero active/waiting/outgoing work.
  Email actions remain 61 confirmed/6 blocked, send events 334, selected task
  counts unchanged, Plutio outbox 1,259 processed/15 dead, and zero
  `booking_activity:%`. The remote transfer archive was removed. No customer
  data/message, Trafft call, or NanoClaw production-database write occurred.
- Follow-up: NC-013 must separately wire the host path, change Booking's
  procedure/prompt/manifest/mounts, remove container Plutio access, deploy, and
  prove a sanitized natural archived-event durable receipt and replay. NC-012
  does not authorize or claim that cutover.

### NC-20260816-011 — Build the dark Booking-to-Plutio host boundary

- Date: 2026-08-16T20:26Z
- Owner/client: Codex
- State: complete; immutable dark release deployed and installed injected
  canary plus production non-interference evidence verified
- Commit/PR: claim `3bdb6e4`, implementation and release
  `63ed4aacf41e3026037912ed3f5ffccfbdc95e59` on
  `codex/nc-20260816-011-booking-plutio-host`; no PR
- Change class: C5 — dark host-owned external-write boundary
- Intended outcome: give the host a typed, durable, replay-safe path for
  canceled/rescheduled Booking activity so a later gate can remove Plutio
  credentials from the Booking container.
- Scope: archived Trafft-event validation, existing Plutio-outbox
  enqueue/dispatch, stable remote idempotency markers, common action-safety
  enforcement, tests, immutable deployment, and an injected installed canary.
  Natural webhook wiring, prompt/manifest change, credential removal, every
  real Trafft/Plutio call, production business-row write, customer/Slack
  message, credential rotation, push, and merge remain excluded.
- Discovery correction: the shared extractor does not include the flattened
  `appointmentStartDateTime` value in rescheduled event identity. The dark
  adapter reconstructs and verifies that canonical key locally; changing the
  live dedup extractor is deferred to the separately canaried promotion gate.
- Implementation: add the typed Booking lifecycle parser; an opaque,
  advisory-locked enqueue using the existing outbox; archive-reloading host
  dispatch; Plutio ID validation and HTML escaping; action-safety-gated person
  upsert/activity write; a stable remote marker and opaque receipt; and
  Booking-only stale in-flight reclaim. Classify `list-notes.sh` as a read while
  retaining mutation guards, and bundle an installed injected verifier.
- Verification: exact Node 22.23.2 passes typecheck; 58/58 focused tests;
  182/182 broader boundary, Booking, Plutio, webhook, manifest, and runner
  tests; 635/635 email-critical tests; and independent runner build plus 40/40
  tests. The unrestricted root suite passes 2,456/2,457; its sole failure is the
  unchanged unrelated CNPC source-wrapper assertion. No real external or
  database call occurred. Final documentation/release gates remain pending.
- Release/deployment evidence: clean immutable release `63ed4aa` has source
  tree `0c5545b392456d8fbb6e9d805a967012569bb446`, 656-file artifact hash
  `8f82da2c9b9439ff9486249a2259807c2ca51da3530d9ae485f61444b2f01917`,
  and archive SHA-256
  `247c62f7c7a64c394165924f7ddea04c59fcbf4ef532967157d92e7f1dd9399a`.
  Local extraction and remote installation independently verified under Node
  22.23.2. The dry-run and applied transaction changed only the two release
  environment pointers and executable; rollback plist
  `com.nanoclaw.plist.rollback-ba5fe74e93e7-2026-08-16T20-48-32-586Z`
  retains the prior exact `ba5fe74` release.
- Installed/live proof: the bundled synthetic verifier returned a recorded
  first pass, an already-recorded replay without the fake write, and booked
  denial while reporting zero database, child-process, and network calls.
  Health proves exact `63ed4aa`, matching code root, Node 22.23.2, one listener,
  connected Gmail/Slack, 17/17 manifests, `booking,campanero` selected, and zero
  active/waiting/outgoing work. Email actions remain 61 confirmed/6 blocked,
  send events 334, Campanero one completed task, legacy Plutio outbox 1,259
  processed/15 dead, and Booking-specific outbox rows zero. No Trafft/Plutio
  request, production business-row write, customer/Slack message,
  credential/configuration change, push, or merge occurred.
- Final boundary: this is a deployed dark foundation, not a natural Booking
  lifecycle outcome. Promotion requires a separate shared reschedule-identity
  repair/canary and empirical proof that Plutio preserves the remote marker
  before ingress wiring or container Plutio removal.

### NC-20260816-010 — Project business credential families and remove Trafft from Booking

- Date: 2026-08-16T20:06Z
- Owner/client: Codex
- State: complete; immutable release deployed and the side-effect-free
  production Booking credential-projection canary live-verified
- Commit/PR: claim `b4c3afc`, implementation `a36fce7`, and release
  `ba5fe74e93e7d58582079a153d85aaf30a651c86` on
  `codex/nc-20260816-010-booking-credential-boundary`; no PR
- Change class: C5 — container credential and selective capability boundary
- Intended outcome: prevent an enforced Booking container from receiving raw
  Trafft credentials while keeping host-owned webhook persistence and
  reconciliation unchanged.
- Discovery correction: Booking's tracked prompt referenced an ignored
  `groups/booking/EXECUTION-STEPS.md` that still performs direct Plutio work for
  canceled/rescheduled events. The procedure is now Git-trackable and aligned
  with the host-owned booked path. Plutio remains explicitly declared until a
  separate host-owned replacement is proved; silently removing it would be a
  workflow regression.
- Implementation: add a strict eight-family credential vocabulary to all 17
  manifests and the generated matrix; bind families into launch/adoption
  fingerprints; preserve compatibility-mode inputs; apply a final fail-closed
  name allowlist before container stdin; export the same read path to a bundled
  Booking verifier; and remove `trafft` from the enforced Booking declaration
  while retaining `business_db` and `plutio`.
- Safety boundary: no Trafft or Plutio request, booking/customer creation,
  Slack/customer message, production business-row write, global enforcement,
  credential rotation, push, or merge is authorized. Claude runtime auth is a
  documented platform exception; Booking egress and Bash remain open residuals.
- Verification: exact Node 22.23.2 passes typecheck, source formatting, 73/73
  focused capability/runner/Booking/Trafft tests, 635/635 email-critical tests,
  independent runner build plus 40/40 tests, capability matrix generation and
  check, schema sanitizer, documentation continuity, script syntax, and
  `git diff --check`. The unrestricted suite passes 2,446/2,447; its sole
  failure is the unchanged unrelated CNPC source-wrapper assertion.
- Release/deployment evidence: the immutable 652-file release
  `ba5fe74e93e7d58582079a153d85aaf30a651c86` has source tree
  `a17f27e7dc07a574d69b21a437db1f4fd58ffe49`, artifact hash
  `96c23295615459de76c37afd5b6fbe97d2c354d840a993134e34323e035f1f6e`,
  and archive SHA-256
  `d6b8bd54560409f11008a7ef2330fdebce19fd5362452ebf0ebea18e5a5682bb`.
  It independently verified locally and on `mini-claw.local` under Node
  22.23.2. Activation from exact `47019c9` changed only the three permitted
  plist values, left zero active/waiting containers, and retained rollback
  `com.nanoclaw.plist.rollback-47019c937d38-2026-08-16T20-03-24-541Z`.
- Live proof: the bundled dry-run-first helper changed only
  `CAPABILITY_MANIFEST_ENFORCED_GROUPS` from `campanero` to
  `booking,campanero`, retained backup
  `.env.rollback-capabilities-2026-08-16T20-03-55-585Z`, and left global
  enforcement false. The backup hash is
  `0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`;
  the activated environment hash is
  `a302579aae2916d898ea03dff8328d080b2e0cb3d88e01c66b06ec4d5c39f7d3`.
  Health reports exact `ba5fe74`, one matching listener,
  17/17 valid manifests, connected Gmail/Slack, and zero
  active/waiting/outgoing work. The installed verifier observed all three
  Trafft source credential names configured, projected zero into Booking, and
  found all five required DB/Plutio names in its eight-name payload; it emitted
  names/counts only, returned manifest fingerprint
  `00cf489fe0ff70d638e32d696711722507b3095ef70290947af14ed49979b186`,
  and performed no network or database call.
- Final production evidence: email actions remained 61 confirmed/6 blocked,
  send events remained 334, Campanero retained one completed scheduled task,
  and Booking had no scheduled-task rows. No Trafft/Plutio request,
  booking/customer creation, customer or Slack message, production business-row
  write, credential rotation, push, or merge occurred. Configuration rollback
  restores the exact environment backup or removes Booking with the same
  helper; release rollback restores the retained prior plist.

### NC-20260816-009 — Extend the common external-write brake to Things

- Date: 2026-08-16T19:27Z
- Owner/client: Codex
- State: complete; immutable release deployed and the eight-call no-write drill
  live-verified with exact restoration and unchanged evidence aggregates
- Commit/PR: claim commit `16dbc22` plus implementation/release commit
  `47019c937d38e9346813f6058484e12e3d577ef5` on
  `codex/nc-20260816-009-things-safety`; no PR
- Change class: C5 — extend a common production external-write safety boundary
- Intended outcome: stop decision-brief promotion at the host Things HTTP
  boundary under global or Things-only safe mode without creating a to-do or
  misleadingly adding a Slack success reaction.
- Implementation: register `things`; split the parsed-item POST into an
  injectable host function; assert the C2 boundary immediately before fetch;
  preserve missing-key, non-OK, and transport-failure behavior; return false to
  the existing Slack-facing wrapper on a typed denial; and add an injected
  Things-fetch tripwire as the eighth operation in the installed refusal drill.
- Safety boundary: no real Things task, Slack message/reaction, bridge
  credential/configuration change, other integration change, envelope
  enforcement, push, or merge is authorized.
- Verification: 31/31 focused parser/boundary/controller/config/drill
  tests, 152/152 expanded action-safety/Slack regressions, 635/635
  email-critical tests, exact Node 22.23.2 typecheck/source formatting,
  independent runner build plus 40/40 tests, and continuity/capability checks
  pass. The unrestricted root suite passes 2,441/2,442; its sole failure is the
  unchanged, unrelated `src/cnpc-prompt-contract.test.ts` source-wrapper
  assertion.
- Release/deployment evidence: immutable release
  `47019c937d38e9346813f6058484e12e3d577ef5` has source tree
  `fa2e10c998aadfc8e00320b459c8b82902849c38`, 652-file artifact hash
  `f4dec12cb563929536f4f9dc883c7dd27ead215535ed0e13a8bda13daf75bb1c`,
  and archive SHA-256
  `c4fd47a61e9cdc898a3c39ed53b411c87c6281ed25518e53f4437d1cb187cae4`.
  It independently verified locally and on `mini-claw.local`; activation from
  exact `d32fda08e818bb803463f7006484abd19291b9e6` changed only the three
  permitted plist paths and retained rollback
  `com.nanoclaw.plist.rollback-d32fda08e818-2026-08-16T19-39-11-903Z`.
- Live proof: dry-run and apply passed. Apply retained environment backup
  `.env.rollback-action-safety-2026-08-16T19-40-01-708Z`, observed the live
  daemon in global safe mode, and returned `global_safe_mode` from Gmail
  new-send/reply, Slack, Courses SMTP, Plutio, Stripe, Hive, and Things. Every
  client/child/outbox/Firestore/Things-fetch tripwire stayed false; Slack
  queued zero; and Courses projected no SMTP secret/mount. The restored `.env`
  and backup both hash to
  `0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`.
- Final production evidence: one listener on exact `47019c9` under Node
  22.23.2; Gmail/Slack connected; zero active/waiting/outgoing work; action
  safety restored enforcement/global false with no disabled systems;
  Campanero remained the only selected capability group. Pre/post evidence
  matched: 61 confirmed/6 blocked pending sends, 334 email events, one
  completed Campanero task, jobs hash `b3fc5040565d`; Hive 110 eligible/0
  unsynced/0 retry attempts/0 dead letters; Plutio 1,259 processed/15 dead; and
  Chaos 5 sent. No real Things task, Slack reaction, outbound action, or
  production business-row mutation occurred.
- Residuals/rollback: the controller still does not interrupt an already
  in-flight fetch. Use the retained plist to return to `d32fda08`; the
  environment remained byte-identical to its retained backup. Chaos,
  Booking/Trafft, Certifier/Sertifier,
  container-exposed writes, and standalone tools remain outside universal
  coverage; envelope adoption, ceilings, and automatic demotion remain open.

### NC-20260816-008 — Extend the common external-write brake to Hive/Firestore

- Date: 2026-08-16T19:01Z
- Owner/client: Codex
- State: complete; immutable release deployed and the seven-call no-write drill
  live-verified with exact restoration and unchanged evidence aggregates
- Commit/PR: claim commit `2fcc570` plus implementation/release commit
  `d32fda08e818bb803463f7006484abd19291b9e6` on
  `codex/nc-20260816-008-hive-safety`; no PR
- Change class: C5 — extend a common production external-write safety boundary
- Intended outcome: stop Hive conversation mutations through the same dynamic
  global/per-system brake without initializing Firebase, consuming retry
  budget, dead-lettering, alerting, or performing a real Firestore write.
- Implementation: register `hive_firestore`; reject both the composite
  classification operation and direct assignment/status/tag merges before
  Firebase initialization; preserve standalone read helpers; treat the typed
  denial as `held` in the Hive reaper before any attempt/dead-letter update or
  chief alert; and add an injected Firestore tripwire as the seventh operation
  in the installed no-network refusal drill. Inventory records Things, Chaos,
  Booking/Trafft, Certifier/Sertifier, Contador/Sheets, and standalone tools as
  explicit remaining perimeter rather than implying universal coverage.
- Safety boundary: no real Gmail, Slack, Firestore, Plutio, Stripe, SMTP, or
  other external write is authorized. No schema/taxonomy change, Chaos overlap,
  envelope enforcement, push, or merge is included. Production controls were
  enabled only for the bounded safe-mode window and restored exactly afterward.
- Verification to this boundary: focused Hive/classifier/installed-drill tests
  pass 51/51. The broader action-safety, Hive, classifier, webhook, and job set
  passes 102/102 outside the network-bind sandbox; the sandbox-only run's 35
  webhook failures were all `listen EPERM`, while its other 67 tests passed.
  Exact Node 22.23.2 typecheck, source formatting, schema sanitizer, capability
  matrix, docs continuity, 635/635 email-critical tests, and independent runner
  build plus 40/40 tests pass. The unrestricted root suite passes 2,435/2,436;
  its sole failure is the unchanged `src/cnpc-prompt-contract.test.ts`
  source-wrapper assertion.
- Release/deployment evidence: immutable release
  `d32fda08e818bb803463f7006484abd19291b9e6` has source tree
  `cff19fb332bac875d37e3a2ffa0e64bf86174005`, 652-file artifact hash
  `d2b872659baaff5a51aba1f49401cfddd1340cb963452d5476561a47f41530a6`,
  and archive SHA-256
  `4c02b02b7f2664e7d2c3de34c86af225effb7e9738e860d2ee8bbfc36a09db1f`.
  It independently verified locally and on `mini-claw.local`; activation from
  exact `ab2ace1a658111131a2519e1cd7257fe8a207ffb` changed only the three
  permitted plist paths and retained rollback
  `com.nanoclaw.plist.rollback-ab2ace1a6581-2026-08-16T19-11-54-990Z`.
- Live proof: dry-run and apply passed. Apply retained environment backup
  `.env.rollback-action-safety-2026-08-16T19-12-32-233Z`, observed the live
  daemon in global safe mode, and returned `global_safe_mode` from Gmail
  new-send/reply, Slack, Courses SMTP, Plutio, Stripe, and Hive. Every
  client/child/outbox/Firestore tripwire stayed false; Slack queued zero; and
  Courses projected no SMTP secret/mount. The restored `.env` and backup both
  hash to `0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`.
- Final production evidence: one listener on exact `d32fda08` under Node
  22.23.2; Gmail/Slack connected; zero active/waiting/outgoing work; action
  safety restored enforcement/global false with no disabled systems; Campanero
  remained the only selected capability group. Pre/post evidence matched:
  61 confirmed/6 blocked pending sends, 334 email events, one completed
  Campanero task, jobs hash `b3fc5040565d`; Hive 110 eligible/0 unsynced/0
  retry attempts/0 dead letters; Plutio 1,258 processed/15 dead; and Chaos 5
  sent. No real outbound action or production business-row mutation occurred.
- Residuals/rollback: use the retained plist to return to `ab2ace1`; the
  environment remained byte-identical to its retained backup. An
  already-in-flight write can complete. Standalone scripts and remaining
  integrations are outside the controller; envelope adoption, ceilings, and
  automatic demotion remain open.

### NC-20260816-007 — Package a fail-safe production drill for the common external-write brake

- Date: 2026-08-16T18:00Z
- Owner/client: Codex
- State: complete; superseding release deployed and the clean no-write drill
  live-verified with exact restoration and unchanged evidence aggregates
- Commit/PR: implementation `c2c21585e086476de6092d3892a8bb44584517d4`
  plus offline-canary fix `ab2ace1a658111131a2519e1cd7257fe8a207ffb`
  on `codex/nc-20260816-007-action-safety-drill`; no PR
- Change class: C5 — temporary production activation of a common outbound
  safety control
- Intended outcome: prove an operator can engage one global brake across the
  five already-guarded runtime systems while inbound/read evidence remains
  available, without causing any external write, queued retry, or durable
  business mutation, then restore the exact prior state.
- Implementation: add a strict, dry-run-first environment transaction with
  exclusive same-mode backup, atomic write/readback, exact-host apply/restore,
  and envelope-enforcement refusal; add an exact-release/drained-service health
  orchestrator that always restores in `finally`; package both CLIs in the
  immutable release. The installed drill calls the real Gmail, Slack, Courses
  SMTP projection, Plutio, and Stripe boundaries using synthetic inputs in an
  isolated configuration. Both Gmail new-send and reply-send are exercised;
  the reply's prerequisite read comes from a synthetic client. Injectable Gmail
  send, Plutio/Stripe child, and Stripe-outbox tripwires make any guard bypass
  fail before a network, child process, or durable enqueue; Slack is
  disconnected and must queue nothing.
- Safety boundary: the wrapper requires valid exact-release/code-root health,
  connected Gmail/Slack, zero active containers, an empty execution/Slack
  outbound queue, default-off envelope/safe-mode configuration, and unchanged
  valid capability-manifest health. It prints the rollback path immediately
  after arming. Caught failures restore exactly; an abrupt process death leaves
  the brake engaged for explicit recovery. No envelope enforcement, customer
  communication, Plutio/Stripe action, production database write, uncovered
  integration, push, or merge is included.
- Verification to this boundary: exact Node 22.23.2 passes root typecheck;
  242/242 focused controller, transaction, Gmail, Slack, Courses, Plutio, and
  Stripe tests; 634/634 email-critical tests; independent runner build plus
  40/40 tests; source formatting; schema sanitizer; capability matrix; and
  documentation continuity. The unrestricted root suite passes 2,429/2,430;
  its sole failure is the unchanged baseline
  `src/cnpc-prompt-contract.test.ts` inline-registration source assertion. All
  five external-client/child/outbox tripwires remain false, Slack queue depth
  is zero, Courses projects no SMTP secrets or email mount, and
  `git diff --check` passes.
- First deployment/live attempt: implementation commit and immutable release
  `c2c21585e086476de6092d3892a8bb44584517d4` (source tree
  `6bb1c9fa507ee3287b95a393a5283fbde4599c0d`, 652-file artifact
  `f857d14e7089f0d9cd6206cf08b9d32157ab45b5edef04062e96fa9f9cf5527d`,
  archive SHA-256
  `1d6fed5d6ecae62b36c4a951deeafa154dd7f10f4a8ca8d021903123face00a2`)
  was independently verified, transferred, re-verified, and activated from
  exact live `2987070`; rollback plist is
  `com.nanoclaw.plist.rollback-29870706dc49-2026-08-16T18-08-08-224Z`.
  The dry run passed, the live daemon observed global safe mode, all six
  Gmail-send/Gmail-reply/Slack/Courses/Plutio/Stripe mutations returned
  `global_safe_mode`, every write tripwire remained false, Slack queued zero,
  Courses projected no SMTP secret/mount, and the helper restored the exact
  environment backup
  `.env.rollback-action-safety-2026-08-16T18-09-04-285Z` with default-off
  health restored.
- Live defect and containment: constructing `SlackChannel` also constructs the
  Slack SDK, which asynchronously issued `auth.test` with the deliberately fake
  token and logged `invalid_auth` after the otherwise successful drill. It made
  no Slack post or queue entry and no authenticated account call; all email,
  send-event, task, jobs-file, Plutio-outbox, and Chaos-outbox aggregates were
  unchanged. The daemon remains healthy on `c2c2158` with controls default-off.
  The canary now bypasses the SDK-owning constructor and instantiates only the
  installed `sendMessage` prototype plus local queue fields; this turns any
  missed guard into a local queue failure with no SDK/network initialization.
  The superseding release and accepted clean repeat are recorded below.
- Superseding release/clean proof: exact release
  `ab2ace1a658111131a2519e1cd7257fe8a207ffb` (source tree
  `72dd932b92e79497e89d8170a547e027d64e42e4`, 652-file artifact
  `cfbf6d3846a9a7c7748011ecd5d3fac109fee842b5e101e7b1056307d1e343b8`,
  archive SHA-256
  `a7b8ab3aaa4d82bcc4b0bcc745af3c495473ee33a47e260d586708fb975f3f31`)
  independently verified locally and on `mini-claw.local`. Activation from
  `c2c2158` changed only the three permitted plist paths and retained rollback
  `com.nanoclaw.plist.rollback-c2c21585e086-2026-08-16T18-15-27-825Z`.
  Dry-run and apply both passed. Apply retained environment backup
  `.env.rollback-action-safety-2026-08-16T18-18-24-265Z`; its SHA-256 exactly
  matched the restored `.env`. Live health observed the armed brake, all six
  installed calls denied with `global_safe_mode`, all client/child/outbox
  tripwires stayed false, Slack queued zero, and Courses projected no SMTP
  secret/mount. The command emitted no asynchronous auth error.
- Final production evidence: one listener on exact `ab2ace1` under Node
  22.23.2; Gmail/Slack connected; zero active/waiting/outgoing work; valid
  action safety restored to enforcement false, global false, and no disabled
  systems; Campanero remained the only selected capability group. Pre/post
  evidence matched exactly: 61 confirmed/6 blocked pending sends, 334 email
  events, one completed Campanero task, jobs hash `b3fc5040565d`, Plutio outbox
  1,257 processed/15 dead, Chaos outbox 5 sent, and zero service-log
  `invalid_auth` matches. No external write or production business-row
  mutation was performed by the drill.
- Residuals/rollback: this proves only the five named boundaries at invocation
  time. Already-in-flight actions, standalone scripts, Trafft, Hive/Firebase,
  Chaos delivery, Things, Sertifier, and other container-exposed tools remain
  outside the controller. Envelope adoption, per-agent/class circuit breakers,
  volume/value/retry ceilings, and automatic autonomy demotion remain open.

### NC-20260816-006 — Stage one jobs-only Campanero capability canary

- Date: 2026-08-16T17:31Z
- Owner/client: Codex
- State: complete; combined release deployed and Campanero-only canary
  live-verified
- Commit/PR: claim commit `f620b1b328597264871dfe25a6fa880fe5462eca`
  and implementation commit `4db813c52aa4714d1e2ecff6cd6c87adf4289f03`
  on `codex/nc-20260816-006-campanero-canary`; merge commit
  `29870706dc495cab59d42e7568b842f8c2994182` integrates the concurrently
  deployed `a67e081` Stripe release; no PR
- Change class: C5 — production release and one-agent capability-boundary
  activation
- Intended outcome: install the default-off capability-manifest release, then
  enforce and prove only the low-risk Campanero agent without changing any
  other registered agent.
- Implementation: add strict `CAPABILITY_MANIFEST_ENFORCED_GROUPS` parsing and
  startup validation; project manifests, host operations, warm fingerprints,
  and sidecar adoption per selected folder; preserve compatibility for all
  other groups; add a release-bundled dry-run/hostname-confirmed/backup-producing
  atomic environment editor; and reconcile Campanero to its authoritative
  `jobs`-only MCP role with no general Claude tools.
- Safety boundary: unknown, malformed, duplicate, or unregistered selections
  fail closed. Global enforcement remains off. The production canary is limited
  to read-only job inventory plus structural proof that Bash and undeclared MCP
  tools are absent; it excludes customer communication, email, job mutation,
  business-database writes, other agent activation, prompt changes, push, and
  merge.
- Verification so far: exact Node 22.23.2 passes 15/15 focused selective-config
  tests, the broader 172/172 capability/container/IPC/scheduler/reaper set,
  634/634 email-critical tests, root and independent-runner builds, and all
  40/40 runner tests. The combined Company OS/action/Stripe integration passes
  74/74 focused tests and the unrestricted root suite passes 2,418/2,419; the
  sole failure is the unchanged baseline `src/cnpc-prompt-contract.test.ts`
  source-wrapper assertion. `git diff --check` passes.
- Concurrent deployment handling: production advanced from `55c97d5` to
  verified Stripe release `a67e081` during the first candidate's image build.
  No container launched. The image was immediately rebuilt from `a67e081`, and
  health then showed that release with zero active/waiting work while all 18
  runner snapshots retained its exact source hash. The first Campanero archive
  was verified and extracted but never activated. This branch now integrates
  `a67e081`; the combined tree then passed a fresh immutable build with 634/634
  release-gate tests and 40/40 independent runner tests.
- Immutable release: commit
  `29870706dc495cab59d42e7568b842f8c2994182`, source tree
  `9849885305366c62e5a2b9f8cc2226a2093c84ce`, artifact
  `8a82dd1a718762bef0cfa16ed20750ea242dd526c2264fef12d6f8a2f9930802`,
  and archive SHA-256
  `2048cb76451b29cb324667ccb89012d3cb5e7da6660010d22c26d141f1870d88`
  were independently verified before transfer and again on the host. The
  rebuilt `nanoclaw-agent:latest` digest is
  `sha256:06d1c7db5476596103c97a803b1ff3035318bcceeb2c190eb1d8fe0f1f5e0982`.
- Runner/release deployment: the final preflight showed release `a67e081`, one
  listener, connected Slack/Gmail, zero active/waiting containers, outgoing
  depth zero, and zero actionable email sends. All 18 runner snapshots were
  atomically replaced with hash `6bb4d7bbaaf0bda23118b79e639502ac`
  after retaining 18 `rollback-a67e081-before-2987070` directories. The release
  activator switched only the expected plist paths and health-verified
  `2987070` under Node 22.23.2. Rollback plist:
  `com.nanoclaw.plist.rollback-a67e08106c87-2026-08-16T17-23-00-067Z`.
- Selective activation: the bundled helper dry-run resolved no current groups,
  global enforcement false, and target `campanero`; apply changed only the
  staged-group key and retained same-mode backup
  `.env.rollback-capabilities-2026-08-16T17-24-03-525Z`. Health reports a valid
  17/17 manifest catalog, global enforcement false, and only Campanero selected.
  Config is loaded dynamically at projection and health reads. A direct
  `launchctl kickstart` returned unsupported-action code 125 without changing
  the healthy listener; restart was unnecessary, and no Campanero warm/live
  container existed to recycle.
- Live canary: the exact production registration resolved to an enforced
  Campanero projection with no Claude tools, MCP `jobs` only, host operation
  `jobs_mutate` only, and read-only `knowledge`/`agent_docs` mounts. A disposable
  deployed-image canary mounted live Campanero IPC read-only, exposed only
  `mcp__nanoclaw__jobs`, proved Bash absent, and returned the exact 22-job
  inventory without requesting mutation. It self-removed. Final health remained
  exact `2987070`, one listener, Slack/Gmail connected, zero active/waiting and
  outgoing depth zero. Jobs remained 22 total/17 enabled; the sole Campanero
  scheduled task remained inactive with its unchanged 2026-03-29 last run;
  pending sends remained 61 confirmed/6 blocked/zero actionable. No customer
  email, Slack post, job mutation, task mutation, or production business-row
  write occurred.
- Rollback: remove the staged group key with the same helper or restore the
  exact environment backup to return the installed release to compatibility;
  restore the exact plist backup for release rollback to `a67e081`. All prior
  runner snapshot directories remain available until the observation window is
  deliberately closed.

### NC-20260816-004 — Add dark per-agent capability manifests and stale-container revocation

- Date: 2026-08-16T16:18Z
- Owner/client: Codex
- State: complete for the local source and release-package milestone; not
  pushed, deployed, or activated. Deployment is explicitly not applicable to
  this default-off milestone and requires a separate authorized task.
- Commit/PR: claim commit `d40913e` and implementation commit
  `72b21db43d1270a3d0994ca525f0137262f54409` on
  `codex/nc-20260816-004-capability-manifests`; no PR
- Change class: C5 — per-agent tool, mount, IPC, runtime, and container-reuse
  security boundary
- Intended outcome: make each operative agent's current capability surface
  explicit and reviewable, then enable a separately gated fail-closed mode that
  cannot silently widen tools or reuse a container launched under stale policy.
- Implementation: added strict versioned manifests for all 17 tracked group
  folders, a deterministic validator/fingerprint and path-free generated matrix,
  exact Claude/MCP tool projection, recognized host-operation checks for
  message/task/job IPC, declared additional-mount and runtime-ceiling checks,
  release packaging, health aggregation, and launch/sidecar fingerprinting.
  Warm or adopted containers with a missing or stale fingerprint are closed
  before another turn when enforcement is enabled.
- Compatibility and safety boundary: enforcement defaults off, so the installed
  source preserves the legacy tool/MCP/mount surface. Existing resource grants,
  mount allowlists, domain approvals, action-safety checks, idempotency, and
  receipts remain cumulative host authority. Invalid enablement fails closed.
  This milestone performs no production config change, deployment, restart,
  live container termination, external message/write, push, or merge.
- Verification: exact Node 22.23.2 passes 113/113 focused manifest, queue,
  container, IPC, scheduler, webhook, and reaper tests; 634/634 email-critical
  tests; root and build typechecks; source formatting; schema sanitizer;
  deterministic matrix and documentation-continuity checks; and the independent
  runner build plus 40/40 tests. The complete root suite passes 2,388/2,389; its
  sole failure is the unchanged baseline `src/cnpc-prompt-contract.test.ts`
  inline-registration source assertion. `git diff --check` passes.
- Release-package evidence: the clean committed source tree
  `4717c4f3d5a66bf22c93dc373e3f2dbc08a2fda2` passed the exact Node 22.23.2
  release gate, including another 634/634 email-critical tests and runner build
  plus 40/40 tests. The verified 636-file artifact SHA-256 is
  `3e5dfec313bec49092f56f89f6c506587970ac40dac1d9d43ffcf032cde2f64b`;
  the local archive SHA-256 is
  `8ea90b587e0ba157212042d580c729de473f098259a96d2ff4094f07a5162564`.
  Archive inspection confirms all 17 capability JSON files are present. This
  is packaging evidence, not deployment or live behavior proof.
- Residuals/rollback: production activation requires an authorized drain/recycle
  and group-by-group negative, launch, warm-revocation, and business-path
  canaries. Destination-scoped egress, raw-secret retirement, action-value/rate
  ceilings, immediate in-flight interruption, dynamic group onboarding, and
  automatic autonomy demotion remain open. If later activated, rollback is to
  restore `CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0` and recycle affected
  containers; source verification alone is not rollback evidence.
- Documentation: added `docs/CAPABILITY-MANIFESTS.md` and the generated matrix;
  updated environment, security, architecture, action-safety, Company OS,
  release-packaging, active-work, and changelog authorities.

### NC-20260816-002 — Add the dark Company OS action safety control

- Date: 2026-08-16T15:00Z
- Owner/client: Codex
- State: complete for the local source milestone; not pushed, deployed, or
  activated
- Commit/PR: claim commit `37c6353` and implementation commit
  `092b5b9b8d96d4ac474dce33ae173ecc44799b62` on
  `codex/nc-20260816-002-action-safety-control`; no PR
- Change class: C5 — common security boundary for external writes
- Intended outcome: define one content-free host action envelope and one
  default-off global/per-system brake without changing current live behavior or
  granting any capability.
- Implementation: `src/action-safety.ts` provides dynamic strict configuration,
  deterministic precedence, exact envelope fingerprint/expiry/approval/claim
  validation, typed denials, and aggregate health. Guards cover Gmail IPC/final
  sends, Slack runtime/digest/healer output, new Courses SMTP mounts/secrets,
  Plutio runtime mutation tools, and the Stripe payment/refund processor.
- Critical ordering: Gmail safe-mode refusal occurs before
  `claimEmailActionExecution`, so a held action is blocked rather than marked as
  an uncertain attempt. Slack safety denials bypass reconnect/retry queues.
  Plutio reads remain available.
- Boundaries: existing domain approvals/claims/receipts remain authoritative;
  envelope enforcement is off; production config/restart/deployment, external
  messages/writes, push, merge, and ledger promotion are excluded. Warm Courses
  containers and standalone scripts remain explicit activation/follow-up gaps.
- Verification: exact Node 22.23.2 passes 219/219 focused safety/boundary
  tests, 632/632 email-critical tests, root typecheck, source formatting,
  schema sanitizer self-test, documentation continuity, and the independent
  agent-runner build plus 36/36 tests. The root sandbox run passes
  2,332/2,378; all 45 permission-sensitive webhook/migration tests pass
  unrestricted, leaving only the unchanged base CNPC source-wrapper assertion.
  `git diff --check` passes.

### NC-20260816-005 — Carry the canonical website product slug into Chaos and stop degrading Checkout product identity

- Date: 2026-08-16T16:45Z
- Owner/client: Codex + Claude Code owner/reviewer
- State: ready_for_review
- Commit/PR: local implementation on
  `codex/nc-20260816-005-stripe-attribution` from exact live lineage
  `55c97d5`; uncommitted
- Change class: C5 — the live payment pipeline and the Chaos lifecycle
  attribution feeding it
- Affected systems: `tools/contador/process-payment.cjs`,
  `tools/contador/process-payment.test.ts` (new),
  `src/chaos-lifecycle-outbox.ts`, `src/chaos-lifecycle-outbox.test.ts`
- Outcome: Tandem's checkout writes the canonical website product slug into
  the underlying PaymentIntent's `metadata.product` key
  (`class-stripe-checkout.php`). `process-payment.cjs` now reads and validates
  that metadata for both the Checkout and PaymentIntent event shapes
  (kebab-case shape check, fail-closed to `null` on anything else — including
  HTML, SQL/shell metacharacters, and literal Stripe product-name junk) and
  carries it as `canonical_product_slug` in the existing `__CHAOS_LIFECYCLE__`
  sentinel. `chaos-lifecycle-outbox.ts` re-validates on both write and read,
  persists it into the outbox's PII-free `properties` jsonb (no new column;
  migration 117 already provides it), and prefers it at Chaos send time,
  falling back to the existing name-derived `safeProductSlug` for
  Heartbeat/off-site payments that carry no Tandem metadata. Ported, from the
  reviewed but uncommitted NC-20260815-004 evidence, only the
  product-name-preservation guard (Payment Log column-E read-back before
  overwrite; a Postgres `ON CONFLICT` `CASE` guard) and the removal of the
  shell from the Postgres write (`execFileSync` + `psql -v NAME=value` +
  `:'var'` + `-f -`, replacing the `execSync` shell command that let the
  SHELL — not psql — expand `$999`/`$(...)`/backticks before psql ever saw
  the value). Did not port `NOT_A_STUDENT` / `resolveRosterTargets` — that is
  unrelated roster-policy expansion, out of this task's scope. One-row
  Checkout/PaymentIntent convergence on a shared `pi_*` id was already present
  in the live lineage and is unchanged. `src/stripe-payment-host.ts` and its
  test are unchanged: `canonical_product_slug` is an additive optional field
  that flows through the existing generic JSON parse with no contract change.
- Verification: 48 focused tests pass under pinned Node 22.23.2 (11
  `chaos-lifecycle-outbox.test.ts`, 20 `stripe-payment-host.test.ts`, 17 new
  `process-payment.test.ts`, covering valid/invalid canonical slugs, Chaos
  send-time precedence and fail-closed fallback, Heartbeat fallback,
  checkout-then-intent and intent-then-checkout product preservation, and
  literal `$`/quotes/command-substitution-shaped product names surviving
  `buildPsqlVarArgs` unmodified as discrete argv elements). `tsc --noEmit`
  clean. `tools/contador/process-payment.test.ts` does not run under the
  tracked `npm test` yet: this worktree's `vitest.config.ts` `include` glob
  has no `tools/**` entry (present in the live NanoClaw checkout's config but
  not in this immutable-lineage worktree, and `vitest.config.ts` is outside
  this task's allowed edit paths) — verified locally with a temporary include
  addition, reverted before finishing; see the NC-20260816-005 task-detail
  note in `docs/ACTIVE-WORK.md`. `npm run docs:continuity-check` passes.
- Deployment/migration: none. No build, commit, migration, or deploy
  occurred; no Stripe, Postgres, Sheets, or Chaos write occurred (all
  verification was static/typecheck/unit-test only).
- Rollback/recovery: no state changed; discard the worktree diff to revert.
- Documentation: this entry and the `docs/ACTIVE-WORK.md` NC-20260816-005 row
  and task-detail section; response artifact at
  `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md`.
- Follow-ups: Codex review/commit/build/deploy per the original task's
  Authority section; after deploy, the four already-proven historical
  `unmapped-stripe-product` rows remain to be corrected per the original
  task's historical-repair scope. (The `vitest.config.ts` test-glob follow-up
  below this line at R1 time is resolved — see the 2026-08-16T17:05Z addendum.)

**Addendum (2026-08-16T17:05Z — R2 review-response round, Claude Code):**
Codex R2 review (`docs/reports/NC-20260816-005-CODEX-REQUEST-R2.md`) returned
`CHANGES_REQUIRED` on two integration gaps in the R1 diff, both fixed here:

1. `enqueueStripeLifecycleFact`'s `ON CONFLICT` update never touched
   `properties`, so a first enqueue without a valid slug — or the earlier
   arrival of the Checkout/PaymentIntent twin, which collide on the same
   `(source_system, source_event_id)` — permanently froze the row without a
   canonical slug even after a later call carried a valid one. Fixed with an
   upgrade-only `properties = CASE WHEN EXCLUDED.properties ? 'canonical_product_slug'
THEN jsonb_set(...) ELSE <unchanged> END`: a call whose (already
   JS-validated) `properties` carries the slug key upgrades the stored value;
   a call without it leaves every existing property, including a
   previously-stored valid slug, untouched — never a blind
   `properties = EXCLUDED.properties` overwrite. A new
   `chaos-lifecycle-outbox.test.ts` case asserts both the upgrade and the
   non-erasure path against the actual SQL text and parameter shape across two
   sequential calls on the same canonical id.
2. Added `tools/**/*.test.ts` to `vitest.config.ts`'s `include` (R2 explicitly
   allowed this edit), so `tools/contador/process-payment.test.ts` now runs
   under the tracked `npm test` with no local override — the R1 follow-up
   item above is resolved, not deferred.
   Verification: 49 focused tests pass (12 outbox + 20 host + 17
   process-payment, up from 48/11 at R1) via the exact tracked command
   `npm test -- --run src/chaos-lifecycle-outbox.test.ts
src/stripe-payment-host.test.ts tools/contador/process-payment.test.ts`
   under pinned Node 22.23.2; `tsc --noEmit` clean; `npm run
docs:continuity-check` passes; `git diff --check` clean. No commit, push,
   deploy, or external write occurred. Response artifact:
   `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R2.md`.

**Addendum (2026-08-16T17:10Z — independent Codex verification):** Codex
accepted the R2 implementation after reviewing the exact source and SQL
contract, including upgrade-only/non-erasing jsonb behavior. The 49 focused
tests, `tsc --noEmit`, documentation continuity, and `git diff --check` pass
under Node 22.23.2. The unrestricted repository suite passes 2381/2382 tests;
the only failure is the pre-existing, unrelated CNPC prompt-contract assertion
against the already-refactored `scripts/cnpc-register.ts` wrapper. None of this
task's changed files intersects that boundary. Claude session usage was also
audited: 169 model calls, 88,715 output tokens, and a 326,943-token maximum
context, exceeding every bounded-review warning threshold; future reviews of
this size must use narrower rounds or a native handoff instead of one prolonged
session. No production or external write occurred during verification.

**Addendum (2026-08-16T17:14Z — commit boundary):** The reviewed implementation
and evidence were committed as `9f8f6a1` on
`codex/nc-20260816-005-stripe-attribution`, directly descended from the exact
live `55c97d5` lineage. The commit hook left one formatting-only test delta
outside the index; it is incorporated with this release-candidate documentation
update before packaging so the immutable builder receives a clean tree. State
advanced to `ready_for_deploy`; no production state changed at this boundary.

### NC-20260816-001 — Activate the bounded Company OS email shadow

- Date: 2026-08-16T13:54Z
- Owner/client: Codex
- State: complete for the migration and non-authoritative shadow milestone;
  ledger authority/promotion remains a separate task
- Commit/PR: implementation commits `052fb0222ceadab3f99d99e551b9e19d2c6a879f`
  and corrective `55c97d5e1bd072dab1c3000f3b715134c3ccc336` on
  `codex/nc-20260816-001-company-os-shadow`; no PR
- Change class: C5 — production PostgreSQL migration, host configuration,
  immutable release activation, and non-authoritative shadow writes
- Intended outcome: apply migration 118 with a verified PostgreSQL backup and
  deploy a bounded, default-off observer that reconciles exact Mailman/Sales
  approved-email facts into the host-only work ledger without changing the
  existing email path.
- Safety boundary: SQLite remains approved-email action authority. No customer
  email, Slack post, approval, retry, action-state write, ledger-driven
  decision, workflow dependency, migration rollback, push, or promotion is in
  scope.
- Read-only production preflight: exact release `12c2b049a27aadf88b2e0517e830ba91e232adc4`
  is healthy under Node 22.23.2; Slack and Gmail are connected; active
  containers, wait queues, and actionable approved/handoff/executing actions
  are zero. Migration-116 and migration-117 anchor objects exist while all
  three migration-118 tables are absent. The explicit shadow lower bound
  `2026-08-14T00:00:00.000Z` selects three confirmed Sales actions, each with
  one exact original-thread Gmail closure.
- Implementation: added `src/company-work-shadow.ts`, a bounded metadata-only
  SQLite scan, exact original-thread closure receipt lookup, host-ledger retry
  identity readers, aggregate health state, and daemon lifecycle wiring. The
  observer is disabled unless both its enable flag and a valid lower bound are
  present; all failures stay outside the email action path.
- Privacy/authority: PostgreSQL calls receive only Party/pipeline/action/event
  IDs, timestamps, named exception codes, and SHA-256 evidence. No recipient,
  subject, body, approval-card text, customer action mutation, Slack post, or
  Gmail call is part of the projector.
- Verification: exact Node 22.23.2 typecheck passes; 25 focused
  ledger/projector/SQLite tests pass, including full success, exact replay,
  terminal restart convergence, block/fail/resume, per-action failure
  isolation, default-off/misconfiguration, metadata privacy, exact-thread
  closure, and aggregate fail-open health. The release-blocking email gate
  passes 628/628 and the independent runner passes 36/36. The root sandbox run
  passes 2,311/2,357; all 45 permission-sensitive failures pass unrestricted,
  leaving only the unchanged base CNPC wrapper assertion.
- First production boundary: custom-format PostgreSQL backup
  `NC-20260816-001-20260816T1405Z/nanoclaw_business_pre_118.dump` is 2,574,495
  bytes, has SHA-256 `932a9aea3e96a2befca8a5f335d04bc9db46d7bd7229b350216834d9ab5510dd`,
  and yields an 899-line `pg_restore --list` catalog. Exact migration 118 SHA-256
  `7aa14b087335b11afe7d637aba07c47268f0a1c8d9ec475091478e5c12f65d4a`
  applied alone. Production then had three empty admin-owned tables, two enabled
  append-only triggers, zero non-admin grants, and zero raw-content columns.
- First release boundary: immutable `052fb0222ceadab3f99d99e551b9e19d2c6a879f`
  (source tree `5f0f82d1`, artifact SHA-256 `63d225fd`, archive SHA-256
  `ffb01719`) activated with automatic rollback health verification. The
  bounded observer was healthy and failed open: its first pass completed three
  exact cases, excluded three non-Mailman origins, and surfaced one historical
  confirmed action whose source event history skips Mailman dispatch.
- Live defect response: the missing mandatory source fact is not permission to
  infer progress from the later Gmail receipt. The corrective implementation
  records `source_gap:mailman_dispatch_missing` at the last verified stage and
  refuses later promotion. Exact Node 22 typecheck and 25 focused tests pass.
- Corrective production boundary: immutable release
  `55c97d5e1bd072dab1c3000f3b715134c3ccc336` (source tree `00f62467`, artifact
  SHA-256 `0b2c090b`, archive SHA-256 `f93d4109`) activated with rollback plist
  `com.nanoclaw.plist.rollback-052fb0222cea-2026-08-16T14-17-03-352Z`.
  Stable health reports one listener, exact launchd/code-root identity, Node
  22.23.2, connected Gmail/Slack, and an empty outgoing queue.
- Live reconciliation: the first corrective pass scanned seven bounded source
  actions, excluded three non-Mailman roots, projected four items, applied one
  named source-gap transition, and completed three. A later pass applied zero
  transitions and deduplicated all 29 facts with no errors. PostgreSQL contains
  4 items, 29 events, and 13 receipts: 3
  `outcome_validated/completed` and 1 `approved/failed` with
  `source_gap:mailman_dispatch_missing`. All three tables are admin-owned;
  append-only event/receipt triggers are enabled; non-admin grants and
  raw-content columns are zero.
- Non-interference/outcome evidence: SQLite remains at 67 bound actions and
  334 events: 61 confirmed, 6 blocked, and zero actionable. Projection
  activation itself sent no email and posted no Slack message. During the
  preflight window, an independently natural approved action completed normal
  fallback, Mailman execution, exact Gmail confirmation, and exactly one
  original-thread closure without manual repair, closing `NC-20260815-009`'s
  customer-path gate while remaining independent of ledger authority.

### NC-20260815-010 — Establish the dark Company OS work-ledger foundation

- Date: 2026-08-16T04:48Z
- Owner/client: Codex
- State: complete; the owner authorized and `NC-20260816-001` completed the
  separate production/shadow milestone.
- Commit/PR: implementation commit
  `6e281f0c7627bbe5c8579befa649057732ac55b6` on local branch
  `codex/nc-20260815-010-company-os-ledger`, based on recovered roadmap commit
  `38810d3`; no PR
- Change class: C2 — local, additive, default-off persistence/domain work; no
  external communication or live database write
- Intended outcome: add the focused design/ADR, unapplied migration 118,
  non-auto-discovered rollback, host-only typed work-item transition/receipt
  store, and focused contract tests for the Mailman/Sales approved-email pilot.
- Safety boundary: do not wire runtime producers/consumers, change group
  behavior, apply the migration, deploy, restart, or write Slack/Gmail/production
  data. Existing SQLite approved-email action state remains authoritative.
- Acceptance: local schema/domain evidence must cover restart, retry, duplicate,
  stale-version, invalid-transition, blocked, failure, exact receipt, and full
  success semantics without storing raw customer content or trusting agent
  prose.
- Outcome: added `docs/COMPANY-OS-WORK-LEDGER.md`; unapplied migration 118 and a
  non-auto-discovered history-preserving rollback; a host-admin-only typed
  PostgreSQL store/state machine; 16 focused state/store/migration tests; and
  data model, database guide, migration guide, project map, and roadmap
  reconciliation. Stage and disposition are separate, receipts bind exact
  actions/evidence, optimistic versions reject stale writers, and source plus
  idempotency identities converge only when their facts match.
- Verification:
  - exact Node 22.23.2 focused tests pass 2 files / 16 tests; typecheck,
    full-source formatting, documentation continuity (58 active/ready rows and
    54 changelog entries), and `git diff --check` pass;
  - the sandbox root suite passes 2,304/2,350. All 45 permission-sensitive
    webhook/CNPC/child-process cases pass in an unrestricted rerun. The sole
    remaining failure is the pre-existing CNPC source-wrapper assertion on
    files unchanged from base `38810d3`;
  - the initial dependency install deliberately disabled lifecycle scripts and
    therefore lacked the Node-22 SQLite native binding. Rebuilding
    `better-sqlite3` under pinned Node 22 corrected the environment before the
    root result above was accepted;
  - migration 118 applied cleanly to a throwaway Unix-socket-only PostgreSQL 16
    cluster. The typed store's synthetic path ended
    `outcome_validated/completed`, version 9, with 10 events and 4 receipts;
    stale version, exact retry, block/resume, receipt binding, and zero
    non-admin grants were verified. The rollback refused to erase populated
    history, after which the cluster and temporary script were deleted.
- Deployment/migration at this task's boundary: not applied. The later,
  separately authorized `NC-20260816-001` task reconciled live ordering,
  captured the production backup, applied migration 118, deployed the bounded
  observer, and completed live parity/replay validation without promoting the
  ledger into email authority.
- Documentation: active work and this changelog registered the task before the
  first implementation edit; the design, data model, project map, roadmap, and
  migration guide are reconciled with the committed implementation.

### NC-20260815-007 — Reactivate the Company OS roadmap from the current baseline

- Date: 2026-08-16T04:45Z
- Owner/client: Codex
- State: complete
- Commit/PR: roadmap recovery commit
  `b7bb65d9b3aec003a0e507b3c0831effcbfca3a1` on local branch
  `codex/nc-20260815-007-company-os-reactivation`, based on verified lineage
  `9e4977ac339ff9ef149f33ea11dbd6faf2d54dc7`; no PR
- Change class: C1 — internal strategy and documentation only
- Affected systems: Company OS planning and shared continuity records; no
  runtime or external system
- Outcome:
  - reactivates `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` as the one strategic
    roadmap rather than creating a parallel Spark/agent-platform plan;
  - inventories every P0/P1/P2 program item conservatively as implemented,
    partial, deployed-unverified, still proposed, or superseded, while keeping
    `ACTIVE-WORK` and this changelog authoritative for actual lifecycle state;
  - defines Task, Trigger (including Schedule), Skill, Action Envelope, and
    Receipt as separate first-class contracts so procedure or activation never
    silently grants mutation authority;
  - adds dependency-gated R0-R5 slices: rebaseline, finish safety prerequisites,
    prove the Mailman/Sales work ledger, normalize triggers/skills, operate by
    exception, then evidence-gate execution profiles and parent/child work;
  - extends the stable planning backlog for normalized triggers, versioned
    skills, durable child tasks, host-selected execution profiles, and the
    smallest ledger-backed exception surface.
- Files: `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, `docs/ACTIVE-WORK.md`, this
  entry
- Verification: exact Node 22.23.2 documentation continuity passed with 57
  active/ready task rows and 53 changelog entries; focused `git diff --check`
  passed. No product/runtime tests were required because this task changes only
  C1 planning and continuity docs.
- Deployment/migration: not applicable; no source, schema, prompt,
  configuration, service, deployment, browser, database, Slack, Gmail, or
  other external-system state changed
- Rollback/recovery: revert only the three `NC-20260815-007` documentation
  edits; no production or data recovery applies
- Documentation: active roadmap, current-work ledger, and append-only evidence
  record updated together
- Follow-up: after review, start the selected ledger foundation under a new
  task ID and isolated branch. The foundation may be default-off and locally
  tested; live migration or workflow activation must still satisfy the named
  R1 gates.

### NC-20260815-009 — Bind approved recipient headers and executable fallback

- Date: 2026-08-16T03:45Z
- Owner/client: Codex
- State: complete; the exact runtime/Mailman repair is live and a later natural
  approved email completed the customer path without manual recovery.
- Commit/PR: implementation commit
  `12c2b049a27aadf88b2e0517e830ba91e232adc4` on
  `codex/nc-20260815-009-email-fallback-headers`, based on documentation head
  `334e15b` and deployed runtime predecessor `cfcfaae`; no PR.
- Change class: C5 because this changes the customer-email recipient and
  approval execution boundary. Local tests are non-sending.
- Root cause: the NC-20260815-008 customer action proved that the deterministic
  watchdog fallback generated a Chief handoff without Mailman's required
  `[APPROVED-REPLY]` marker. It also proved that only To, subject, and body were
  durable approval authority: a visible operator-approved CC was discarded by
  host rehydration and then failed the customer-Party CC guard.
- Outcome: the one approval parser now binds exactly one To/Email header and an
  optional ordered visible CC list; duplicate, conflicting, malformed,
  hidden-copy, or self-duplicated recipient headers fail closed. The durable
  action stores the approved CC, execution replaces model CC with those exact
  recipients, and a non-Party CC is allowed only when it is both action-bound
  and one of the configured host mailbox identities. Approved internal CC
  suppresses the open pixel so the raw Gmail layer does not remove the visible
  copy, and a matching visible CC suppresses duplicate default BCC. Chief
  fallbacks now carry the executable marker.
- Files: approved-handoff/execution/watchdog/SQLite/Gmail source and focused
  tests; `evals/email-delivery/incidents.json`; Mailman prompt/procedure;
  structure-only SQLite schema reference; architecture, security, project map,
  Company OS, active-work, and changelog authorities.
- Verification: exact Node 22.23.2 focused coverage passes 7 files / 257 tests;
  replay passes 13/13; the release-blocking email gate passes 24 files / 628
  tests and now includes the raw Gmail header layer; the independent runner
  builds and passes 6 files / 36 tests; typecheck, formatting, documentation
  continuity, and `git diff --check` pass. The unrestricted root suite passes
  2,333/2,334 tests; its sole failure is the unrelated CNPC source-wrapper
  assertion reproduced on unchanged base `334e15b`. The lockfile-exact install
  completed under Node 22 after first detecting and correcting a PATH leak that
  attempted native compilation under ambient Node 26.
- Artifact: the clean commit reran email-critical 628/628 and runner 36/36,
  then produced source tree `31c8fd4e033396fa4df567474a9384011d90af16`,
  compiled artifact
  `33bb2801a68479cc16563d4904d671f564eb3c40b768ea7f8170519e2f964aaa`
  across 620 files, and archive SHA-256
  `c4e96cd0ce971331d5860d94a2ca9af0719451afe3d2f5441cd9230f08802508`.
  Fresh local extraction and installed-host verification both passed under
  exact Node 22.23.2.
- Deployment/migration: the saved `mini-claw` SSH alias still pointed at stale
  `.204`; current authenticated Tailscale state identified the Mini at `.206`,
  and no SSH configuration was changed. The verified archive was installed at
  `~/.local/share/nanoclaw-releases/12c2b049a27aadf88b2e0517e830ba91e232adc4`.
  Activation waited roughly twenty minutes for a real Mailman/Sales run to
  finish, then required zero active containers, zero waiting groups, and zero
  email actions in approved/handoff/mailman/executing/attention states. The
  additive `approved_cc` startup migration is present exactly once.
- Activation: the dry run and apply reported only the permitted code-root,
  expected-commit, and program-argument changes. Reviewed operational Mailman
  files were backed up under
  `~/.local/share/nanoclaw-group-prompt-backups/cfcfaae-before-12c2b04` and
  copied with SHA-256 `5345e060...75e5` (`CLAUDE.md`) and
  `acd4b69d...76df` (`OUTBOUND-EMAIL.md`). Rollback plist:
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-cfcfaae03b6b-2026-08-16T04-35-16-950Z`.
  Stable post-activation health shows sole listener PID 40936, exact release
  and code root, Node 22.23.2, connected Gmail/Slack, and zero active/queued
  work. A first transitional health read occurred before the predecessor PID
  exited; deployment was not accepted until the new PID and uptime converged.
  No synthetic or customer email was sent during this release.
- Rollback/recovery: deploy the prior `cfcfaae` artifact through the activation
  rollback record. The additive nullable column may remain dormant. Never
  automatically retry an executing or uncertain action.
- Documentation: updated current behavior, recipient authority, incident
  replay, Mailman procedure, and `REL-005` in the Company OS plan.
- Natural outcome validation: at 2026-08-16T13:59Z, action
  `996a9d1c-e193-4fa3-9fe4-340a438e0f8d` traversed approval, the normal
  fallback handoff, Mailman start, one-time execution, and Gmail confirmation,
  then wrote exactly one completion to its original Slack thread. No manual
  repair or synthetic customer send was used. The durable action is confirmed,
  closing the named release outcome gate.
- Follow-up: preserve the incident corpus and normal receipt monitoring; no
  task-specific deployment or outcome gate remains.

### NC-20260815-008 — Make approved-email incidents a release-blocking replay

- Date: 2026-08-16T01:13Z
- Owner/client: Codex
- State: complete; exact replay is release-blocking and its later repaired
  natural path completed without manual recovery.
- Commit/PR: implementation commit
  `253996b43d7ffb49d95102d2f8fb906058f885fd` and verified-artifact handoff
  commit `cfcfaae03b6b51ae13a481d32ea1476d3dc9345e` on
  `codex/nc-20260815-008-email-replay-gate`, based on verified production
  commit `84607fd2ac4bcc0dd87fdc2d80d79635a69f0a6d`; no PR.
- Change class: C5 because the assurance protects the customer-email action
  boundary. The initial implementation was local and non-sending; later owner
  authorization covered one exact customer-email recovery and activation.
- Root cause: the live lineage already reloads exact operator-approved bytes
  host-side, but the incidents that led to roughly two weeks of manual email
  rescue were distributed across comments and separate tests. Nothing made the
  scrubbed incident set itself a visible, versioned release requirement or
  failed when a linked stateful regression silently left the email gate.
- Outcome: added a synthetic-only corpus with eight executable approval-card
  and host-execution cases covering dropped/prose-only handoffs, missing action
  identity, entity and customer-field drift, exact follow-up threading,
  malformed cards, post-approval mutation, and missing durable thread/action
  identity. Thirteen linked regressions pin Entry/Party resolution,
  predecessor-schema migration, confirmed duplicate replay, restart/uncertain
  handling, ambiguous actions, exact-session delivery, deterministic
  pre-Gmail/content holds, blocked-send visibility, and scheduled terminal
  receipts into the release gate.
- Files: `evals/email-delivery/{README.md,incidents.json}`;
  `src/email-delivery-incident-replay.test.ts`;
  `scripts/run-email-critical-tests.{mjs,d.mts}`; `package.json`;
  `docs/{COMPANY-OS-IMPROVEMENT-PLAN,PROJECT-MAP,RELEASE-INTEGRITY,ACTIVE-WORK,ENGINEERING-CHANGELOG}.md`.
- Verification: exact Node 22.23.2 replay 11/11; email-critical 23 files/571
  tests; independent agent runner 6 files/36 tests; typecheck and formatting
  pass. The root sandbox run passed 2,270/2,316; all 45 permission-sensitive
  failures passed in an unrestricted rerun. The sole remaining root failure is
  the unrelated pre-existing CNPC wrapper contract on the unchanged base.
- Artifact: the clean implementation commit reran the email gate and built
  successfully. Source tree
  `ea5938c2938630ad6268c62b58790a0362472e60`; compiled artifact
  `f706b9eb47794f38445234d17bd02a98d8dceca34242c2a32dd3018da3b8a670`
  across 620 files; archive SHA-256
  `20a776b78413a7cb76a90e954ab2eaf1a98f7d48f3359d606e69561711103d30`.
  Fresh-directory bundled verification with `--runtime` passed under Node
  22.23.2.
- Initial deployment state: read-only `/health` verified production commit
  `84607fd`, matching code root, Node 22.23.2, connected Gmail/Slack, no active
  container, and an empty queue before the branch was created.
- Runtime note: the compiled artifact hash is identical to prior live
  `84607fd` because this slice changes tests, the release gate, and
  documentation only. The owner nevertheless explicitly requested deployment;
  activation changes provenance and future release enforcement, not the email
  execution code.
- Rollback/recovery: restore the activation-captured launchd plist for
  `84607fd`, then reverify prior-release health; the additive test/docs commit
  has no data migration to undo. Preserve the contamination archive and exact
  Gmail receipt; never roll back or resend the confirmed customer action.
- Documentation: the Company OS records this as the first deterministic
  `EVAL-001` subset. Project and release contracts distinguish replay proof
  from transport canary and customer outcome; prompt-injection and blinded
  model-quality evaluation remain wider program work.
- Follow-up at the original boundary: repair the observed fallback-marker and
  approval-bound CC/header defects in a separate runtime slice, then require a
  later natural approved customer action without manual repair as outcome
  evidence. `NC-20260815-009` subsequently completed both requirements.
- Deployment addendum (2026-08-16T02:45Z): after explicit owner authorization,
  exact head `cfcfaae03b6b51ae13a481d32ea1476d3dc9345e` rebuilt with the 571-test
  email gate and 36-test runner gate passing. Archive SHA-256
  `d6a14dc90257e2948d9b7238a54c5cb79d1c98b06c30dc080dfc6c3266cf71b5`
  matched after transfer; the immutable Mini release directory passed bundled
  runtime verification. At this checkpoint activation had not yet occurred.
- Recovery evidence: the activation verifier caught 18 mutated tracked
  knowledge files and 92 extra knowledge/backup files inside live release
  `84607fd`. All were preserved under the release-contamination archive; the
  manifest-attested copies were restored, and `84607fd` now verifies again.
  This demonstrates the unresolved `NC-20260815-006` state-root separation
  defect; operational knowledge bytes remain preserved in the writable state
  checkout and contamination archive.
- Incident root cause and recovery (2026-08-16T03:10Z): production logs showed
  the watchdog-generated Chief fallback omitted Mailman's required
  `[APPROVED-REPLY]` marker, so Mailman explicitly refused to call Gmail. The
  stored approved card also included a CC that the normal immutable replay
  deletes and the customer-Party CC guard cannot authorize. After explicit
  owner authorization, a bounded one-time recovery revalidated the exact
  action/card/hash, canonical Party, content policy, disabled test routing, and
  zero prior Sent candidates before its one-time execution claim. Gmail receipt
  `1a0088cd49ec9664` independently verified the approved To, visible CC,
  subject, and `SENT` label. A content-free full-message verification also
  matched the normalized 570-byte Sent body to the approved-card/ledger hash.
  The durable ledger ended `confirmed`; the business interaction and
  original-thread Slack receipt were also written. This was a manual recovery
  and does not validate the unchanged natural runtime path.
- Activation/live verification (2026-08-16T03:12Z): the post-recovery drain had
  no active approved-send states, containers, or queued groups. Release
  `cfcfaae03b6b51ae13a481d32ea1476d3dc9345e` activated with only the three
  planned launchd path changes. New PID 18232 is the sole listener on port 8088;
  health reports the exact commit, source tree
  `7cf301987bb4df9c2dd597241ff8e941fbad65d6`, artifact
  `f706b9eb47794f38445234d17bd02a98d8dceca34242c2a32dd3018da3b8a670`,
  matching code root, Node 22.23.2, connected Gmail/Slack, and no active/queued
  work. The installed 620-file release independently verifies. Rollback remains
  the launchd plist captured by the activation tool.
- Natural closure (2026-08-16T13:59Z): after `NC-20260815-009` repaired and
  deployed both runtime defects, action
  `996a9d1c-e193-4fa3-9fe4-340a438e0f8d` completed the normal approval,
  fallback, Mailman, Gmail acknowledgment, and one original-thread completion
  path without manual recovery. That closes this task's named natural outcome
  gate while leaving the synthetic incident corpus release-blocking.

### NC-20260812-001 — Account-aware Stripe lifecycle evidence for Chaos

- Date: 2026-08-12
- Owner/client: Codex + Claude Code owner/reviewer
- State: ready_for_deploy on the exact live release lineage; not yet migrated,
  configured, deployed, or live-verified.
- Change class: C5 — dual-account payment/refund webhook identity, durable
  business-data outbox, authenticated external analytics write, and production
  n8n configuration.
- Root cause: the live n8n workflow already has separate Stripe Trigger
  credentials for Heartbeat and Tandem, but its minimized envelope drops the
  verified `evt_*`, Stripe timestamp, and refund `re_*`. NanoClaw then silently
  tries both keys and accounts by the incoming `cs_*`/`pi_*`, allowing one
  Checkout sale to occupy two accounting rows. The tracked workflow was also
  stale and contained a webhook secret; it has been replaced by a secret-free
  live-contract source and runbook. A generic, unauthenticated legacy alias fed
  the Heartbeat extractor despite having no mentions in 45 executions/90 days.
- Local outcome:
  - fixed account labels remain bound to their Stripe Trigger credential;
  - n8n preserves provider event/time and fans out exact succeeded refund IDs;
  - purchases converge on canonical `pi_*`; unpaid/no-PI Checkout events do not
    become purchases;
  - Payment Log, Sales roster fallback, and Postgres converge on the canonical
    ID instead of preserving a `cs_*`/`pi_*` double;
  - Stripe key prefixes, names, and emails are absent from the structured
    lifecycle result; the private accounting summary behavior is unchanged;
  - migration 117 adds a PII-free outbox with independent retry/dead-letter
    state and immediate chief alerting; raw email is resolved transiently only
    when sending to Chaos;
  - Chaos publication is default-off and cannot make accounting retry; and
  - an aggregate-only 7/30/90 reconciliation compares both Stripe accounts,
    outbox state, and Chaos receipts from an explicit producer coverage start.
- Claude convergence: R1 session `85747f15-ef0b-4998-9c8a-684dca0d44f1`
  returned `REVISE DESIGN`; R2 session
  `457996e8-3943-466d-a086-0ef17d198d6b` confirmed convergence, idempotency,
  refund distinctness, PII minimization, and honest cohort/reconciliation
  semantics, then returned `REVISE` for missing dead-letter alerting and an
  optional account label. Both findings are fixed and covered by tests.
- Verification: 55 focused tests pass; TypeScript, Node syntax for all host
  scripts except the intentionally function-wrapped n8n Code-node source, PHP
  contract tests (42), form-data drift check, and `git diff --check` pass. The
  local full root suite is not a valid signal under Node 26 with Node-22 native
  modules and restricted listeners; target-runtime Node 22 verification remains
  a release gate.
- Exact-lineage reconciliation: the reviewed source commit was replayed on top
  of live release `b4d85b2`. CNPC already owns migration 116 there, so the Chaos
  migration was mechanically renumbered to 117 with no SQL semantic change.
  The release bundle now includes the three deterministic Contador scripts and
  resolves them through `NANOCLAW_CODE_ROOT`, so activation cannot accidentally
  execute a different copy from the dirty operational checkout.
- Claude R3 reviewed that four-file release-integrity delta in the same session
  and returned `SHIP` with no P0/P1 finding.
- Rollback: keep `CHAOS_LIFECYCLE_ENABLED=false`; restore the private n8n
  backup; deploy the prior NanoClaw artifact. Migration 117 is additive and may
  remain dormant.

### NC-20260811-002 — Restore receipted daily Sales follow-ups

- Date: 2026-08-11T20:45Z
- Owner/client: Codex
- State: validating; live transport/completion repair in
  `79819282865458823b727b6cc99a229caac4fdd3`; runner close-order correction
  validated locally and pending a superseding immutable release
- Change class: C5 — production scheduler/IPC isolation, Sales behavior, and
  backlog recovery
- Incident: seven daily runs from August 3-11 were logged `success` while every
  result only said that five Gmail reads were queued or still pending. The 32
  returned Gmail results were held after their scheduled-task containers
  exited, and no August follow-up card was produced.
- Root cause: the August 2 exact-session hardening correctly stopped Gmail
  results falling into sibling Sales sessions, but the exact delivery resolver
  also excluded scheduled-task containers. The generic ten-second close timer
  then ended the work item and treated waiting prose as success.
- Implementation: exact Gmail input may return to an active scheduled task only
  when both source container and directory-owned group match; ordinary chat
  piping remains denied. The scheduler uses a resettable bounded continuation
  window. A non-empty daily run must return a count-consistent receipt naming
  every selected pipeline ID, and the host verifies a visible follow-up/cold
  card for each; an empty run requires the exact empty-queue receipt. Partial or
  waiting runs fail visibly and are recorded as errors.
- Backlog/safety: a read-only live aggregate found 108 currently eligible rows
  (101 FU1, five FU2, two cold); this current population is not attributed in
  full to the outage. Recovery remains capped at five oldest rows per run and
  creates approval cards only. No customer email is sent without later human
  approval.
- Verification so far: pinned Node 22.23.2 typecheck, formatting, documentation
  continuity, and diff checks clean. The focused scheduler/queue/completion/
  Gmail/handoff gate passes 5 files / 112 tests. The expanded email-critical
  gate passes 22 files / 558 tests and the independent runner passes 5 files /
  34 tests. The complete host suite accounts for 2,287/2,288 tests: 2,242 pass
  in-sandbox and all 45 permission-sensitive tests pass on the required
  unrestricted rerun. The sole remaining failure is the unrelated pre-existing
  CNPC source-wrapper contract assertion already present on the exact base.
  The immutable archive was independently extracted and runtime-verified:
  source tree `bf8789b7d6ce14a2d0fb5e3f6fe352dfc6562369`, compiled artifact
  `f4cf456c79b1cbf957446ba975c32a8464f964fc5151e501d511cbbbfebbbc9a`
  across 612 files, and archive SHA-256
  `d5dfef80ea23ff1a99cc54e431228fa87aa26306bfe542cab7c11d48ec536120`.
  The first immutable release was then activated with explicit approval and a
  bounded five-lead live recovery was run.
- Read-only production preflight at 2026-08-11T20:49Z: immutable release
  `194f8486e737d387f5b69b1f88db711bebc06659` remains live and verified under
  Node 22.23.2 with Slack/Gmail connected; all seven August daily follow-up runs
  remain recorded as `success`; nonterminal `pending_sends` count is zero. One
  unrelated Certifier container was active, so activation would wait for it to
  drain even after approval.
- First production outcome: release `7981928` ran as the sole Node 22.23.2
  listener with matching verified code root and connected Slack/Gmail. All five
  exact Gmail thread results returned to the scheduled task and zero were held.
  Four approval cards were accepted for Leads #349, #332, #467, and #326. Lead
  #472 was rejected by the content guard for two banned phrases. The new host
  completion validator correctly rejected the task's inaccurate five-card
  receipt and recorded the run as `error`; no customer email was sent.
- Second root cause and repair: the host rejection reached the correct task
  container while its long model turn was active, but the runner checked a
  stale close sentinel before draining IPC input at the next loop boundary. A
  small pure loop policy now gives exact pending input priority over close, and
  the completion validator evaluates the latest visible receipt against the
  final visible card state so a corrected asynchronous repost can complete the
  run. Sales instructions require processing every card acceptance/rejection
  before the final receipt. Pinned Node 22.23.2 validation passes root
  typecheck/build, 3 focused host files / 36 tests, 3 permission-sensitive
  files / 45 tests, and the independent runner build with 6 files / 36 tests.
- Superseding deployment and bounded recovery: immutable release `a33bed1` was
  activated after active work and nonterminal sends drained to zero. Production
  rebuilt `nanoclaw-agent:latest` as OCI index
  `sha256:adad05ad78c04cbee8bae2dc5a559adc9fc25f0816be5b46494219b93ccfebfc`,
  refreshed all 18 runner snapshots, and installed the reviewed Sales workflow
  at SHA-256
  `93e8db58793e7107a8323ce623a6f1249c78ceedc9a74be4faca721ad248a0a4`.
  Health proves exact commit/code root, Node 22.23.2, one listener, connected
  Slack/Gmail, and an empty queue. Rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-798192828654-2026-08-11T21-57-44-214Z`.
  The normal task prompt was restored immediately after the one-lead run was
  claimed, with its next cron still 2026-08-12 09:00 America/Chicago.
- Recovery outcome and third protocol mismatch: the repaired runner consumed
  Lead #472's exact Gmail result and the content-guard rejection, and Sales
  posted a corrected visible approval card at 2026-08-11T22:00:41Z. Together
  with the four accepted cards from the first bounded run, all five recovery
  artifacts now exist; no customer email was sent. The run still recorded an
  error because success persisted the card to Slack but, unlike rejection,
  returned no asynchronous acknowledgement to the exact container. Sales could
  not know validation had succeeded and ended with waiting prose instead of a
  receipt. The follow-up repair returns `[approval_card ACCEPTED]` only after
  Slack persistence; the marker is progress/visibility evidence, never send
  authority. Pinned Node 22.23.2 typecheck/build and documentation continuity
  pass; the focused IPC/queue/completion set passes 3 files / 57 tests, the
  email-critical gate passes 22 files / 560 tests plus the independent runner's
  6 files / 36 tests, and all 45 permission-sensitive broad-suite tests pass in
  their required environment. The complete root suite accounts for 2,290 of
  2,291 tests; the sole remaining failure is the unchanged pre-existing CNPC
  source-wrapper contract assertion.
- Rollback: reactivate the prior immutable release and restore the prior
  operational Sales workflow copy. Held async results are never replayed into a
  new or sibling session; rerun the bounded task instead.
- Documentation: Sales workflow, project map, security model, active work, and
  this changelog entry.

### NC-20260811-001 — Exact-thread human commercial terms and reply aliases

- Date: 2026-08-11T20:10Z
- Owner/client: Codex
- State: ready_for_deploy; immutable release pending from exact live immutable
  base `194f8486e737d387f5b69b1f88db711bebc06659`
- Trigger: Sales rejected Alex's exact 5% Velera instruction as an invented
  discount, then incorrectly told the operator to send Tom Olney's reply
  manually. The exact Gmail sender alias was also absent from Tom's CRM email
  allowlist and would have caused the next boundary failure.
- Recovery: a complete corrected Lead #1098 card is posted in Tom's original
  Slack work thread and awaits approval; no email has been sent.
- Implementation: canonical numeric commercial terms are derived only from
  durable non-bot human messages in the exact Sales work thread, with questions
  inert and later explicit negation revoking an earlier value. IPC preflight,
  Slack defense in depth, Action-ID creation, and final Gmail dispatch consume
  the same exact-thread evidence; mismatched values and every other guard remain
  blocked.
- Recipient boundary: an approved reply may accept the exact Gmail-derived
  participant as a reply-scoped alias only when it matches the approved card,
  carries a host Action-ID, and its approved Gmail thread resolves to the Party.
  No CRM row is created and standalone/model-supplied recipients remain on the
  existing allowlist.
- Verification at this entry: pinned Node 22.23.2 typecheck, formatting,
  documentation continuity, runner build/tests, and the 19-file email-critical
  gate pass (523/523). The broad sandbox run passed 2,233/2,279; its 45
  permission-sensitive listener and migration failures passed on the required
  unrestricted rerun. The only remaining failure is an unrelated pre-existing
  CNPC prompt-contract assertion: the exact live base's test expects registration
  details in a source-checkout wrapper that only delegates to the compiled CLI,
  and neither file differs on this branch. Immutable release, deployment, and a
  natural Gmail receipt remain pending.

### NC-20260810-002 — CNPC intake and bounded coach matching

- State: validating from exact live immutable base `0b355396281a5e35b6159dce1ab8f9d36155efd0`.
- Trigger: automate the EA-controlled CNPC intake-to-coach-match workflow while
  preserving human approval for consequential communication and commercial
  actions.
- Public capture deployed and verified:
  - n8n workflow ID `cnpc-coaching-intake` is published at
    `POST https://webhooks.tandemcoach.co/webhook/cnpc-coaching-intake`;
  - missing authentication returns `401`; an authenticated complete synthetic
    form-1 payload returns `202`, `normalized: true`, stable `gf:1:<entry>`
    identity, and mapping version `gf-form-1-v1`;
  - sanitized Gravity Forms entry 583 established the exact field-ID mapping;
  - the capture workflow has no downstream node, so it cannot reach NanoClaw,
    Slack, email, Plutio, or coach-capacity state yet.
- Source implementation:
  - typed, length-bounded normalized intake contract and stable event key;
  - durable host-owned identity and intake persistence;
  - deterministic eligibility and published price tiers;
  - migration 116 for canonical coaches, capacity snapshots, match results,
    chemistry soft holds, engagements, and an approval/receipt outbox;
  - host-bounded active-capacity candidate pool and exact roster version;
  - host validation and persistence of candidate IDs, ranks, reasons, and
    roster version returned by the CNPC minion;
  - dedicated `groups/cnpc/` behavior, knowledge, and registration for Slack
    channel `C0BPG0408BW`.
- Security boundary: public and private webhook secrets are distinct; the
  tracked n8n artifact contains only a one-way public-secret digest; the minion
  receives neither database nor Gmail/Plutio credentials. Client/coach email,
  Plutio, hard capacity commitment, and ready-to-begin execution are absent and
  blocked pending named approval and host receipts.
- Release state at this entry: rebased onto exact live immutable commit
  `0b35539`; migration, registration, private n8n delivery, deployment, and
  sanitized end-to-end canary remain pending.
- Detailed operating contract: `docs/CNPC-AUTOMATION.md`.

### NC-20260809-004 — Request-first Sales response policy

- Date: 2026-08-10T06:30Z
- Owner/client: Codex implementer + Claude Code owner/reviewer
- State: ready_for_deploy from exact live base `4437ee3a47dac2dc69357bcd160f410efe467fc7`
- Change class: C5 — Sales behavior authority, autonomy marker recognition, immutable release, and production prompt activation
- Replaces offer-first behavior with deterministic request-first routing: evidence-gated relationship, explicit asks, answerability, one route, and a bounded content budget.
- Commercial content is legal only for `TRANSACT` with a verbatim current-message Route-Basis of at most 15 words. `ORIENT` cannot add price, cohort, booking, enrollment, signup, or free-module CTAs.
- `LOW` confidence and `HUMAN` produce a draftless `[SALES ESCALATION]`; browsing-path data is disabled and non-binding for customer-facing drafting.
- Draft recognition is anchored, case-insensitive, and emphasis-tolerant; the historical `REVISED DRAFT FOLLOW-UP:` alias remains recognition-only. A replay over 2,322 local Sales bot rows classified 568 before and after, with zero differences.
- Claude exact-session R3 verdict: `ACCEPT`. Exact live-lineage pre-release checks: 2 final contract files / 17 tests; full suite 166 files / 2,227 tests accounted for (2,184 in-sandbox plus 43 permission-sensitive tests rerun 43/43); typecheck, build, formatting, continuity, and diff checks clean.
- The nine-case fixture is a structural contract seed, not evidence of improved real-customer responses. Blinded historical scoring and natural-response observation remain pending outcome validation.
- Review record: `docs/reports/NC-20260809-004-CLAUDE-FINAL-REVIEW-R3.md`.

### NC-20260809-001 — Grader recalibration release

- Date: 2026-08-10T00:55Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified as immutable release `bc9312522aba` from exact live
  base `ec62c3003aaa`
- Change class: C5 — host/runner message boundary, live read-only curriculum
  lookup, group prompt, registration, and production activation
- The host is the only publisher of grader-authored text into `#gru-grader`.
  Student staging is exactly `PASS|NO PASS`, one blank line, then feedback;
  blocked bytes are never posted or persisted.
- Six Foundation assignments are resolved from the current Heartbeat lesson by
  one allowlisted GET. The grader receives curriculum text, not a credential or
  a Heartbeat write tool.
- Every initial or warm grader turn carries a host-minted UUID through the
  runner and MCP boundary; the host requires an exact run/JID/thread match.
- Grader raw final text is suppressed for normal and adopted containers.
- Automatic posting of results to Heartbeat is absent by design. The release
  stages feedback in Slack for human review and manual copy only.
- Verification on the combined commit: pinned Node 22.23.2 typechecks; focused
  grader suite 10 files / 235 tests; full root suite 160 files / 2,186 tests;
  release gate 19 files / 513 tests; runner 5 files / 34 tests; documentation
  continuity and diff checks clean.
- Production proof: PID 92532 executes the exact `bc9312522aba` release;
  `/health` verifies source tree and artifact identity, Slack/Gmail are
  connected, both grader final-text suppression flags are live, and the prompt
  hash matches the release. A no-network installed-artifact canary accepted
  concrete feedback and blocked stock praise. Heartbeat access remained
  GET-only; no student post, result write, approval, or certificate action ran.
- Release record: `docs/reports/NC-20260809-001-GRADER-RELEASE.md`.

### NC-20260809-003 — Close the Procurement opportunity-to-outcome loop

- Date: 2026-08-09T19:51Z
- Owner/client: Codex + Claude owner
- State: validating; migration 115 and the prior collection-only release remain
  live with review disabled; a Claude-approved deterministic host collector is
  implemented and awaits immutable deployment plus shadow/live outcome proof
- Commit/release: commits `9aa23b4e7c394145487baabb64873beb5d321617`
  and `ba726e7cbda03e35cf63d7d1b732ced5339f95e4` are live from isolated branch
  `codex/nc-20260809-003-procurement-recovery`
- Change class: C5 — production schema, authorization/configuration, email
  routing, Slack workflow, immutable deployment, and controlled live canaries
- Affected systems: Procurement control plane, classification taxonomy,
  scheduler/reconciliation, host/runner IPC, group behavior, PostgreSQL,
  launchd, release pipeline, and operations documentation
- Starting evidence: aggregate-only production preflight confirms the live
  release is healthy but Procurement is not operational: both RFP/RFQ labels
  are `auto_archive=true`; 348 of 466 classified Procurement emails lack a
  routing receipt; control-plane run/observation/card tables are empty; all 396
  opportunities are source-keyless and unreviewed; the review constraint is
  unvalidated; the active daily task timed out on 2026-08-09; all four daemon
  gate keys are absent; proposal-framework authority is still April-dated.
- Authorized outcome: implement, review, commit, migrate, deploy, and live-test
  the smallest reliable path from receipted, host-planned intake through named decision
  and proposal-ready or recorded-pass closure. Keep submission and commitments
  manual. Add sources only after that outcome is proven.
- Review/verification so far: Claude Opus R2 found permanent alert-loss and
  one-alert-ever regressions before release. Both are repaired with a durable
  acknowledged outbox, per-alert failure isolation, and daily time buckets.
  Claude R3 returned converged, after which Codex found that a Slack failure
  after commit could still emit a false `NOT RECORDED` receipt. Successful
  decision and pursuit receipts are now written in the same transaction as the
  state/event, delivered with a receipt-returning post, and retried through the
  bounded acknowledged outbox. Claude R4 explicitly corrected its R3 miss and
  returned converged with all five gates GO. Pinned Node 22.23.2 typecheck
  passes; the final focused gate passes 9 files / 64 tests; formatting and
  documentation continuity pass; the final complete permitted suite passes
  151 files / 1,969 tests; the independent runner build and 4 files / 29 tests
  pass.
  A schema-only disposable PostgreSQL rehearsal passed forward migration,
  idempotent reapply, transactional smoke, rollback, and restored migration-114
  behavior, including the final durable action-receipt design.
- Deployment and live boundary: migration 115 and immutable release
  `9aa23b4e7c39` are live under Node 22.23.2; Slack and Gmail health are good;
  collection is enabled; review is disabled; the legacy daily task is paused.
  The release archive SHA-256 is
  `b850b9d9d541a678128ed5495762ceb8e02ce36ae74c9f6e40212be945758522`.
  This is deployed, not outcome-validated.
- Live canary evidence: two natural CaleProcure runs returned scheduler
  `success` but wrote no source-run/card/pursuit rows; the first also queued
  twice because a due one-time task was not claimed before its slow container
  completed. Both success claims are rejected. Public browser verification
  observed all nine release-owned keyword searches and one current positive
  row, event `0000039985` under business unit `3820`; the page retains a hidden
  stale row after a zero result and does not safely reach `networkidle`.
  An operator-assisted adapter canary then completed source run 4 with planned
  9, observed 9, missing 0, and one new observation/opportunity. That proves
  the adapter/database path only, not the natural agent path.
- Follow-up implementation: due tasks use a SQLite compare-and-swap claim;
  scheduled CaleProcure IPC overrides the model run key with deterministic
  host token `t.<taskId>.<startMs>`; receipt validation queries that exact key,
  adapter version, and release-owned planned-unit set; final model text is
  buffered until validation; scan-shaped prompt drift fails closed; and a
  restart marks claimed-but-unfinished one-time tasks `error` with a visible
  alert instead of silently rerunning or losing them.
- Follow-up verification: Claude Opus R7 returned `CHANGES REQUIRED` with four
  blockers and six additional findings; all determinate corrections were
  implemented. Claude R8 then independently returned `GO` for commit,
  immutable collection-only deployment, and the third natural canary, closing
  all ten R7 findings. Pinned Node 22.23.2 passes typecheck, build, formatting,
  `git diff --check`, documentation continuity, 5 focused files / 46 tests,
  and the complete permission-enabled suite at 152 files / 1,980 tests. The
  independent runner build and 4 files / 29 tests also pass. R8's live-schema
  read-only predicate precheck, immutable build/verification, deployment, and
  the third natural canary remain separate pending facts. Three safe-direction
  scheduler follow-ups remain explicitly tracked: concurrent-restart false
  orphan alerts, exact group-not-found terminal recording, and a lost-CAS
  regression test; none can create a false success.
- Follow-up deployment: immutable archive
  `nanoclaw-ba726e7cbda0.tar.gz` (SHA-256
  `09606bde8ed6a9f20ef587c46f3a8877a30809c88987fada187e29b03f95b6de`)
  verified source tree `14272af5b15c6431ff9de41f44cdcf182f6a9224` and
  artifact `268749789bde31b0f6389776066802e6d537f2558f1fd93186dac2700f51492d`.
  Activation retained rollback plist
  `com.nanoclaw.plist.rollback-9aa23b4e7c39-2026-08-09T23-54-21-421Z`;
  exact live health is `ba726e7`, Node 22.23.2, Slack/Gmail connected, no active
  container. The required live JSONB-predicate precheck returned zero rows.
  CaleProcure ingest was found stale-off and was enabled after exact backup;
  review remains off. Live task timeout drift was corrected to 900000 ms.
- Third natural canary: task `nc-20260809-003-caleprocure-canary-3` ran once
  and host source run 5 completed with adapter v2, planned 9, observed 9,
  missing 0. It reported zero observations/opportunities and missed current
  public event `0000039985`, so only the scheduler/correlation/receipt mechanics
  pass; the procurement outcome fails. Independent public-browser reproduction
  showed that filling `Event Name` does not run a query: the explicit visible
  `Search` button must be clicked. After that click `facilitation` yields a
  visible `Showing Results 1 of 1` grid while hidden duplicate summaries and
  rows remain. The tracked procedure now requires an explicit search action and
  visible-only proof. It must be independently reviewed, installed byte-exact,
  and pass another natural positive-control canary before review, proposal, or
  source expansion.
- Claude R9 returned `CHANGES REQUIRED` and found that the first procedure
  correction had not restated the explicit-search rule in the Step 4
  `observed_units` payload contract, did not operationalize visible-only
  selection with snapshot refs, and documented an impossible in-run recovery
  for `partial`. The corrected contract now requires an explicit visible
  Search action and exact-keyword visible result state for every observed unit,
  uses interactive refs/accessibility snapshots rather than raw text matches,
  and stops partial runs for an operator rerun with a new host token.
- Independent public-browser verification also closed the expected stable-ID
  gap without an agency-name guess: CaleProcure's visible
  `Look up businessUnit` table maps the exact SF Bay Conservation Commission
  row to `3820`; opening `/event/3820/0000039985` visibly repeats the exact
  event ID, department, title, and close date. The procedure generalizes that
  as exact-one department lookup plus clean-detail verification and fails
  partial on zero/multiple matches or detail mismatch.
- Release-integrity follow-up: R9 verified that the active release packages
  `groups/` but not the `knowledge/` procedure to which the Procurement prompt
  delegates. The builder now includes tracked `knowledge/` bytes, and the host
  prefers the active release's read-only per-group knowledge directory while
  suppressing a mutable configured mount at the same container path. Older
  releases without packaged knowledge retain the configured fallback for safe
  rollback. Three focused mount-plan regressions cover manifest-owned
  precedence, old-release fallback, and unsafe group-folder rejection; pinned
  Node 22.23.2 typecheck and the final 1 file / 27 tests pass.
- Claude R10 returned `CHANGES REQUIRED` on one mount-target alias defect: an
  empty configured target or the equivalent `knowledge/` and `./knowledge`
  spellings could mount after and shadow the verified release bytes. The
  suppression filter now matches the mount resolver's empty-value fallback and
  normalizes the final relative target. Three regressions cover those aliases.
  R10 otherwise accepted the R9 repairs and release-owned design; its
  non-blocking procedure findings are incorporated by resolving refs before
  actions and requiring a lookup-reported globally unique normalized exact
  department match.
- Claude R11 returned `GO` for commit, immutable collection-only deployment,
  and one fourth natural positive-control canary with review disabled. It
  independently exercised twelve mount spellings, reproduced 27/27 focused
  tests plus typecheck/format/continuity/diff checks, and confirmed the alias
  blocker closed. The exact CLI result was 233.640 seconds and `$7.0173895`.
- Final release gate: exact Node 22.23.2 passes the host build, typecheck,
  formatting, documentation continuity, `git diff --check`, and the complete
  152-file / 1,986-test suite; the independent runner build and 4-file /
  29-test suite pass. An initial npm-wrapper run selected ambient Node 26 and
  produced ABI/runtime-only failures; it was rejected and replaced with the
  direct pinned-runtime run.
- Release `ec62c3003aaae652712164f47b3c5c7efbc9f5d3` is live from immutable
  archive SHA-256
  `f52e2f57e9e5214e01d1e08451ab3f15f29604115212cc4dd2818069f212619f`
  (source tree `a8b4c7bd1efc5da7c7ab227a600bc01acc4bfeb5`, artifact
  `38a5df15cea7352e12bb889c276f040d7c237a1cccd1d5d2e8a74135b7d0ec93`,
  552 files). Activation changed only the three release identity paths and
  created rollback plist
  `com.nanoclaw.plist.rollback-ba726e7cbda0-2026-08-10T00-51-16-106Z`.
  Refreshed health proves a new PID, exact code-root match, Node 22.23.2,
  Slack/Gmail connected, and zero active containers. Collection remains on,
  review off. The manifest-covered live Procurement procedure is byte-identical
  at SHA-256
  `e7d355cfe5a7e95197ffb308a8d30ad60ed98f072502dab065d92d2314e74a9f`.
- Fourth natural canary
  `nc-20260809-003-caleprocure-canary-4` was claimed exactly once but produced
  no result and no source-run receipt. One aggregate task-run row ended `error`
  after 1,235,396 ms and a boolean-only query classified it as a container
  timeout; no task result payload was read. The supposed 900,000 ms group bound
  was actually raised by `effectiveContainerTimeoutMs` to production
  `IDLE_TIMEOUT + 30,000 = 1,230,000` ms. Review remains off. After four natural
  failures, another prompt/timeout retry is not evidence-driven: the next
  stabilization slice must move CaleProcure acquisition into deterministic
  host-owned browser code and leave the agent to assess receipted rows.
- Deterministic collector candidate: added a host-owned Playwright CDP port,
  collection coordinator, exact CaleProcure identity resolver, receipt-writing
  CLI, and default-off daily registration script. The port accepts only an
  unauthenticated `http://127.0.0.1` origin, creates and later closes exactly
  two pages, proves clear/search busy transitions, uses visible-only result
  state, reconciles count against extracted rows, maps an exact department via
  the portal directory, and verifies every positive row against its clean
  detail URL before host ingestion. The coordinator bounds pre-detail rows,
  preserves independently proven units across row-budget, reconciliation, and
  identity failures, aborts globally on transport/baseline/query failures, and
  supplies partial live coverage to the existing receipt boundary.
- Scheduler/release candidate: immutable `dist/*.js` jobs resolve beneath
  `NANOCLAW_CODE_ROOT`, execute using `process.execPath`, retain the operational
  cwd, and receive their configured timeout. The agent-container Procurement
  CDP/credential/bridge configuration is retired, stale browser config is
  removed, the dedicated Chrome is loopback-only, and release archives include
  the registration/browser scripts. Bonfire acquisition is paused rather than
  silently relying on the now-retired container bridge.
- Independent review: Claude R12 approved the architecture; R13 required six
  bounded race, abort, row-budget, unit-isolation, bridge-retirement, and output
  flush repairs; R14 accepted all six and returned `GO for commit and shadow
deployment`. R14's remaining count-mismatch whole-run abort was also changed
  to a per-unit `reconciliation_failed` diagnostic. The focused exact-Node
  22.23.2 gate passes 6 files / 47 tests. Production activation and all shadow
  and live claims remain pending; review stays disabled.
- Final candidate review: Claude R15 independently reproduced the focused
  6-file / 47-test gate, traced `reconciliation_failed` through the migration
  115 receipt boundary, and returned `GO for commit and immutable shadow
deployment` with no blocker or high regression. Codex's final exact-Node
  22.23.2 evidence also includes the host build, typecheck, formatting,
  continuity, `git diff --check`, the complete 157-file / 2,006-test suite, and
  the independent runner build plus 4-file / 29-test suite. No deployment or
  production outcome is claimed by these gates.
- Intervening-lineage reconciliation and first shadow: production had advanced
  to Grader release `bc931252`; Procurement was replayed on tracked Grader
  evidence commit `7451834` rather than overwriting it. The integrated 165-file
  / 2,206-test root suite and 5-file / 34-test runner suite passed, and immutable
  release `f3c423c52f62` activated with exact health. Prompt/launcher bytes
  match the release; CDP is loopback-only and the old bridge is unreachable;
  legacy scan, container ingest, deterministic collector, and review are off.
  `data/jobs.json` had a backed-up literal trailing `\\n` corruption repaired
  before default-off registration.
- Shadow gate 1 failed usefully: the collector reported a real `coaching`
  search failure and cleaned its tabs, but the one-shot Node process remained
  alive because its CDP WebSocket was never disconnected. Chrome stayed alive
  with no tab growth. The candidate fix awaits `browser.close()` after both
  owned pages; Playwright's connect-over-CDP path maps that close to the client
  transport, not the launchd-owned browser. Claude R16 independently verified
  those semantics from pinned Playwright source and returned `GO`. The final
  delta also bounds the transport disconnect at 10 seconds with an unreferenced,
  cleared timer, and a second regression proves a missing close acknowledgement
  cannot hang the one-shot process. Exact Node 22.23.2 passes 3 focused files /
  15 tests, the full 165-file / 2,208-test root suite, host build, typecheck,
  formatting, continuity, `git diff --check`, and the runner's 5 files / 34
  tests. No source receipt or opportunity write occurred, and all gates remain
  off pending immutable redeployment and the repeated shadow.
- R16 artifact and acquisition diagnosis: clean commit `4053bf89867b` produced
  archive SHA-256
  `f7f73df4757ca2cb4ee73e9c31b11c4b5cf2aa769c4e5c64b84c20173870a660`,
  source tree `b147c5d090450d9c66ef216b3ce05a91fa16c6d6`, artifact
  `92d1efc4915a985a63959970e98e2dff6b35a4a84f16606086e35638205d1ca6`,
  and 592 files. It verified on the Mac Mini and dry-ran with exactly the three
  expected identity changes, but was not activated while unrelated Sales work
  remained active. Two direct target-release shadows prove self-exit, Chrome
  survival, and a two-tab post-run baseline. Query-bound public diagnostics
  then isolated `coaching`: the PeopleSoft POST returns 200 and an exact
  query/no-results tuple while the UI renders neither results nor no-results;
  `facilitation` through the same path returns one visible row and no
  no-results tuple. A candidate response parser accepts only that exact tuple
  and rejects contradictions. Claude R17 returned `GO`; the follow-up records
  `visible | response` evidence provenance in every unit diagnostic, treats a
  malformed candidate URL as non-matching rather than fatal, and adds the two
  requested exact parser regressions. Exact Node 22.23.2 passes the 3 focused
  files / 16 tests, build, typecheck, formatting, continuity,
  `git diff --check`, the full 165-file / 2,209-test root suite, and the
  independent runner's 5 files / 34 tests. A superseding immutable release
  remains pending; all collection/review gates remain off.
- R17 release and R18 diagnosis: immutable `a69f0ff1a372` activated with archive
  SHA-256
  `e3cc8e00cfccc294607e5a8bd27e017d6b8bfd9065fe4bec0d552d9fe7cb6803`,
  source tree `ca6e0b3c278538d70ef8c1f414318340d574f3dc`, artifact
  `cb89cf09981aa2e071a4c21d1d2b3b1c7e4d1c49592afdefbcf7640802fd50c7`,
  and exact Node 22.23.2 health. The first shadow self-exited with tabs 2-to-2
  but still failed on `coaching`. Claude R18 returned `NO-GO` on the proposed
  async response predicate and required response-cardinality diagnostics,
  resolved-response binding, cause-chain output, shadow partial evidence, and
  a `search()` regression. A bounded no-write diagnostic proved one exact-path
  POST per search, HTTP 200 JSON, and one exact query capture. `coaching` uses
  the full terminal message `No event met your search criteria. Please change
your search criteria and try again`, whereas the parser expected only the
  shorter UI label. `facilitation` retains its one visible reconciled row and
  has no error text. This disproves wrong-response/status/content-type causes
  and isolates the string-contract mismatch.
- R18 repair candidate: the browser port now matches only the exact full
  query-bound terminal tuple through a removable response listener and a
  bounded visible-or-response outcome loop. The visible positive path does not
  depend on response-body shape; contradictory zero/visible states fail closed;
  there is no shared resolved-payload mutation or losing response timeout.
  Shadow failures retain a public partial summary and print an eight-level,
  cycle-safe cause chain. Exact Node 22.23.2 passes 3 focused files / 19 tests,
  including the production `search()` path, rejected-response cheap gates,
  listener cleanup, terminal-zero selection, visible positive reconciliation,
  and shadow partial/cause evidence. Full verification, final Claude review,
  immutable release, and production shadow evidence remain pending; all gates
  are still off.
- R19 outcome-order review and repair: Claude returned `NO-GO` because an
  agreeing visible no-results marker was incorrectly included in the
  response-zero contradiction condition, and because the response flag was
  sampled after the DOM counts. It also required direct tests of contradiction,
  timeout, visible-zero, and cross-keyword terminal payloads. A bounded public
  DOM diagnostic on `executive coaching` observed the full normalized message
  `No event met your search criteria. Please change your search criteria and try
again`, exactly matching the verified response text, so all four exact DOM
  call sites now use that full string. The repaired loop samples the flag first,
  rejects only visible results summary/grid, prefers an agreeing visible zero,
  and uses response provenance only when the portal renders no state. The four
  missing paths now have regressions; shadow/live cause output also removes its
  duplicated first link. Exact Node 22.23.2 focused verification passes 3 files
  / 22 tests, typecheck, formatting, and `git diff --check`. Final Claude
  convergence, full verification, immutable release, and three shadows remain
  pending; all Procurement gates remain off.
- Claude R20 returned `GO for commit, immutable deployment, and the unchanged
three-shadow gate`, with no blocker/high. Its remaining Medium is the intended
  fail-closed Clear Criteria check becoming load-bearing now that the full empty
  marker is matched; shadow 1 will prove whether the portal removes that marker
  before the next keyword. The synthetic timeout test now uses 50 ms rather
  than 1 ms to avoid unrelated one-millisecond deadline races. Exact Node
  22.23.2 final verification passes the focused 3-file / 22-test Procurement
  slice, root build, typecheck, formatting, documentation continuity,
  `git diff --check`, the complete 165-file / 2,215-test root suite, and the
  independent runner build plus 5 files / 34 tests. An initial sandboxed
  complete-suite attempt was rejected because the sandbox denied the webhook
  bind and a migration child process; the complete suite was rerun outside that
  sandbox and passed.
- Immutable release `d5836318ce36` activated with verified source tree
  `4b169c0201c680ad4659c8bdf91946e20d06a8df`, artifact
  `7542dea1bcdc5b4b2134797063397bab723396486434a680e5d00982ab1def43`,
  and archive SHA-256
  `292e2384fcdf353b6b576443d53cbaf3f33c9421f954a597b86a5028b0e47f53`.
  Health converged to listener PID 48776 on exact Node 22.23.2; Slack/Gmail
  remained connected, active containers and in-flight send states were zero,
  Chrome remained at two tabs, and all three Procurement gates remained `0`.
- Restarted shadow 1 self-exited after 74.75 seconds with tabs 2 -> 2 and no
  write, but stopped after `coaching` because the full visible no-results marker
  survives Clear Criteria. A bounded public-source diagnostic proved Clear
  empties the query, summary, and grid while leaving that message visible; a
  following `facilitation` search removes it and renders one reconciled row.
  The prior hidden-UI premise is retired: the response path is required because
  the visible marker is stale and not query-bound.
- Claude R21 returned `GO FOR R21 IMPLEMENTATION` with one same-change High:
  remove the marker from total parsing as well as clear/outcome decisions.
  Zeros now require the exact query-bound response tuple; positives require a
  visible summary and reconciliation; marker visibility is a non-authoritative
  public diagnostic. Claude R22 returned `GO FOR COMMIT AND SUPERSEDING
IMMUTABLE SHADOW RELEASE`, with no blocker/high code issue. Exact Node 22.23.2
  passes 3 focused files / 26 tests, the complete 165-file / 2,219-test root
  suite, typecheck, build, formatting, documentation continuity,
  `git diff --check`, and the independent runner build plus 5 files / 34 tests.
- Before any live write, each restarted shadow must prove: every zero is
  `response`; every positive is `visible` and reconciled; no contradiction;
  a positive immediately follows a zero; `coaching` is `response` / 0 /
  `visibleEmptyMarker: true`; complete 9/9 coverage; nonzero reconciled
  baseline; differing unit totals; identity-verified positive control; runtime
  below half timeout; self-exit; and no Chrome tab growth. Immutable superseding
  release and the restarted three-shadow evidence remain pending.
- Rollback/recovery: tracked
  `rollback_115_procurement_pursuit.sql` restores the verbatim migration-114
  function bodies, prior taxonomy behavior, and removes 115 objects/columns;
  `smoke_rollback_115_procurement_pursuit.sql` proves the restoration. Installed
  service definition, taxonomy rows, task row/prompt, and relevant schema
  definitions still require explicit backups before production mutation;
  immutable release rollback retains prior `97ca2cc`.

### NC-20260806-001 — Rejected Sales approval cards return to their exact author

- Date: 2026-08-06T22:05Z
- Owner/client: Codex + Claude validator
- State: validating; Marina's corrected card is visible for approval, while the
  implementation is not yet committed, released, deployed, or live-canary
  verified
- Commit/release: pending on
  `codex/nc-20260806-001-approval-rejection-loop`
- Change class: C5 — customer-email approval presentation and exact-session
  feedback
- Incident/recovery: Marina Minina Lead #1047 produced a valid approval card
  containing the banned phrase `happy to help`. The container received the
  premature result `Message sent.` before the host content guard rejected the
  card, and Sales then falsely reported the nonexistent draft as posted. Codex
  recovered the exact rejected bytes, changed only that phrase to `I can map
out`, validated the corrected card with the deployed parser and guard, and
  reposted it through the normal Sales IPC path to the original work thread at
  Slack ts `1786051860.082149`. It is awaiting human approval; no approval or
  Gmail send occurred.
- Implementation: IPC now parses and content-checks approval cards while the
  exact source container is still known. Malformed, content-invalid, and valid
  but overlong cards are quarantined, rejected visibly in the source work
  thread, and returned only to that container with instructions to correct and
  repost. A shared 4,000-character limit prevents IPC/Slack drift. The runner's
  approval-card result now says only that host validation was requested, and a
  narrow host predicate suppresses pure posted/awaiting-approval recap prose
  without hiding blocked or negative status text.
- Verification: pinned Node 22.23.2 typecheck and formatting pass; the serial
  email-critical gate passes 19 files / 510 tests; the complete suite passes
  148 files / 1,940 tests; and the independent runner builds and passes 4 files
  / 29 tests. Claude Opus R1 verified the core Marina path and returned
  `CHANGES REQUIRED` for four bounded edge cases; Codex reproduced and repaired
  all four, including Claude's literal false-suppression examples. Claude R2
  found that a leading-whitespace card could still cross Slack's limit only
  after its group prefix was added. Both IPC and Slack now call one shared
  prefix-aware predicate, the exact 3,995-character reproduction is covered,
  the runner build/tests are part of the immutable email release gate, and
  question/still recaps remain visible. The post-R2 email gate passes 19 files
  / 513 tests plus the 29 runner tests; the final complete suite passes 148
  files / 1,943 tests. Claude R3 returned `CONVERGED`. Its fresh-checkout
  dependency prerequisite is now explicit in the release runbook and project
  map: the independent runner's lockfile, including dev dependencies even if
  `NODE_ENV=production`, must be installed before the shared gate or immutable
  build. Claude R4 returned `CONVERGED` on that closeout.
- Safety boundary: the content guard is unchanged and remains fail closed. The
  repair does not approve a draft, widen customer content, or send email. A
  non-customer rejection/repost canary is required after immutable activation
  before outcome validation.
- Documentation: Sales instructions, workflows, architecture, security,
  project map, active work, convergence artifacts, and this entry.
- Rollback/recovery: revert the release as one unit. Marina's accepted approval
  card remains an independent Slack artifact and must not be reposted or sent
  without the normal human approval path.

### NC-20260804-004 — Canonical transactional links survive the content guard

- Date: 2026-08-04T15:40Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified; customer recovery and deployment are
  Gmail/health-confirmed, with the next natural approved email reserved for
  business-outcome validation
- Commit/release: `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba` on
  `codex/nc-20260804-003-host-owned-email-bytes`
- Change class: C5 — customer email content boundary and exact recovery
- Incident/recovery: Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` was blocked
  solely for an approved direct `us06web.zoom.us` meeting link. Exact-card
  preflight proved recipient, subject, content hash, and Gmail thread matched
  and that no prior receipt existed. A Zoom-only recovery produced Gmail message
  `19fcd6a20fc986df` on thread `19fcd3af14473697` at
  `2026-08-04T15:35:12.964Z`; the ledger now contains exactly one confirmed
  event and is replay-protected. The missing mechanical Gmail receipt was
  posted to the exact Sales thread at Slack ts `1785858368.200159`.
- Implementation: allow regional `zoom.us` meeting hosts, Tandem's legacy
  `tandemcoaching.com` site and company-controlled `tco.ac` short links, and
  Stripe's canonical `book.stripe.com` checkout host. Exact hostname/subdomain
  matching remains unchanged, suffix lookalikes remain blocked, and the content
  guard suite now runs in `test:email-critical`. Parseable approval cards run
  the same policy before Slack presents them and again before Action-ID
  creation, preventing an operator from approving a known-unsendable action.
- Verification: exact pinned Node 22.23.2 typecheck passes; the expanded serial
  email-critical gate passes 18 files / 497 tests; and the complete suite passes
  147 files / 1,927 tests. Claude Opus R2 and R3 both returned `CONVERGED` after
  R1's blocking selector finding was repaired. Formatting and diff whitespace
  are clean; documentation continuity is the remaining pre-commit gate.
- Release-gate reconciliation: the first clean immutable build exposed that
  `scripts/build-release.mjs` still hard-coded the former 14-file email suite
  even though `test:email-critical` had expanded to 18 files. The first archive
  was not deployed. The builder and `npm run test:email-critical` now invoke one
  shared Node runner, eliminating the duplicated list rather than merely making
  two copies temporarily equal. The shared runner includes the four added
  guard/action files and must reproduce the 18-file / 497-test gate before
  packaging.
- Release-gate commit: `898294c`; Claude R4 and R6 returned `CONVERGED`, while
  R5's symlink-path false-green finding was repaired before this commit.
- Deployment/migration: no schema migration was required. Immutable release
  `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba` is active on the production Mac
  mini. Health verifies source tree `89f2629dfdde77b160fbc30824287eefa0782545`,
  artifact hash
  `1ace579828a381aedef998ac4ae1819f409960ea59fc802789e437dfa0ee06de`,
  Node `22.23.2`, exact code root, connected Gmail/Slack, one listener, and an
  idle queue. Operational Sales/Mailman instruction hashes match the release.
- Safety boundary: no general arbitrary-link approval bypass and no synthetic
  customer send. Claude review and exact Node-22 release gates precede the
  immutable activation shared with NC-20260804-003.

### NC-20260804-003 — Execute host-approved email bytes, not model copies

- Date: 2026-08-04T14:38Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified; stranded customer approvals are Gmail-confirmed,
  the implementation is active, and the next natural approved email remains
  business-outcome validation
- Commit/release: `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba` on
  `codex/nc-20260804-003-host-owned-email-bytes`
- Change class: C5 — customer email execution, approval identity, one-time
  Gmail claims, receipts, and duplicate prevention
- Incident/recovery: Lead #1003 Action
  `4fae5b5b-7a56-4588-8c62-c16e769ae371` reached Mailman with exact approved
  bytes, but its tool call omitted `action_id` and changed literal `&` to
  `&amp;`. The host stopped before an execution claim or Gmail call, then posted
  misleading receipt-reconciliation wording. A bounded recovery re-parsed the
  stored card, proved no prior attempt, and sent those exact bytes once. Gmail
  confirmed message `19fcd16443172cb1`, thread `19fccbd558f107e6`, at
  `2026-08-04T14:03:36.867Z`.
- Reproduction/recovery: before this fix was deployed, Lead #1019 Action
  `732cc8de-b9cc-4cb6-8d73-2e6b833e6d01` repeated the same mutation: Action-ID,
  recipient, and subject matched, while Mailman expanded one literal `&` to
  `&amp;` (455 approved UTF-8 bytes versus 459 attempted bytes). The guard held
  before any execution claim. Read-only ledger/card/Gmail-Sent preflight proved
  no prior attempt, then bounded exact-card recovery produced Gmail
  message/thread `19fceafb937b9bfa` at `2026-08-04T21:30:50.684Z`. The action
  is durably confirmed once, its business interaction was logged, and its Sales
  thread has the mechanical receipt. Existing HTML-entity drift coverage
  already exercises this exact defect; this adds operational evidence, not a
  sixth defect family.
- Reproduction/recovery addendum 2026-08-05: Lead #1029 Action
  `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d` repeated the combined pre-deployment
  path: Sales omitted the Action-ID and Mailman entity-escaped a literal `&` in
  both subject and body. The action never entered execution, Gmail Sent had no
  matching message, and exact approved-card recovery passed the normal host
  guards and produced Gmail-confirmed message/thread `19fd3438954b40fe` at
  `2026-08-05T18:50:46.831Z`; the Sales thread has the receipt. A focused IPC
  regression now exercises this exact unthreaded, missing-ID, mutated-field
  shape. It is additional evidence for the pending host-owned execution fix,
  not a new defect family.
- Reproduction/recovery addendum 2026-08-05: Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` repeated the same pre-deployment
  missing-ID/entity-mutation path. Mailman preserved recipient and subject but
  changed one body `&` to `&amp;` (1,852 versus 1,856 bytes). No execution claim
  or Gmail Sent match existed before recovery. Exact approved-card recovery
  passed the normal host guards and produced Gmail-confirmed message/thread
  `19fd44fd031fc6f1` at `2026-08-05T23:43:48.546Z`; the originating Sales
  thread has the receipt. The existing Lead-#1029 regression covers this
  narrower body-only mutation shape, so this is operational recurrence evidence
  rather than a new defect family.
- Final pre-activation drain 2026-08-05: exact-card recovery through the
  reviewed release code durably confirmed Actions
  `c62d02ac-ed49-4b28-93f9-8935e3f07423`,
  `b3b0727f-1c51-476e-b854-b313996de655`, and
  `a5013939-ff73-44bc-bb98-0e4a5a7903d5` with Gmail receipts
  `19fd4b60e5c393c6`, `19fd4b6457fdb1db`, and `19fd4b85d6692aa2`.
  Each originating Sales thread received its mechanical receipt. The drained
  ledger had 23 confirmed and two deterministically blocked actions, with no
  pending, executing, attention-required, or uncertain state.
- Implementation: after resolving one action, the host reloads its exact Slack
  card and replaces Mailman-supplied Action-ID, recipient, subject, body,
  thread, CC, HTML/Markdown mode, Party hint, and email type with host-approved
  or host-derived values before authorization and claim. Deterministic
  pre-Gmail holds become terminal blocked actions that explicitly say Gmail was
  not called. Exact scheduled Sales follow-up cards now enter the same ledger
  and must include Email, Thread-ID, fenced Subject, and fenced body. Direct
  host proposal follow-ups now claim and confirm the action ledger so a failure
  after Gmail accepts cannot invite a duplicate resend.
- Action selection: recording a newer approval in the same Slack work thread
  transactionally blocks older pre-Gmail actions as superseded, while never
  superseding an action that may have reached Gmail. A Gmail thread with
  multiple live approvals is held unless raw request content identifies exactly
  one durable candidate; raw bytes are corroboration only and never execution
  authority. Confirmed/uncertain/blocked state is evaluated before card
  rehydration, and deterministic pre-Gmail failures explicitly say Gmail was
  not called.
- Verification: six focused files pass 91/91 tests, including
  HTML-entity/Unicode/spacing drift, missing Action-ID,
  recipient/subject/thread/CC/HTML/Party/type replacement, exact follow-up
  arming, proposal confirmed replay, pre-receipt uncertainty, and a post-send
  logging exception. On the combined final tree, pinned Node 22.23.2 typecheck,
  the final 18-file / 497-test email-critical gate, and the complete 147-file /
  1,927-test suite pass. Claude Opus R1 returned `CHANGES REQUIRED` after
  independently proving the stale-approved-card selector defect. R2 returned
  `CONVERGED` after the repair; R3 again returned `CONVERGED` after a final
  parser false-rejection residual and security-documentation gap were closed.
  Commit, immutable activation, and live non-sending replay remain pending.
- Files: `src/approved-email-execution.ts`, `src/ipc.ts`,
  `src/approved-send-handoff.ts`, `src/send-watchdog.ts`,
  `src/proposal-approved-email.ts`, `src/index.ts`, focused tests,
  `package.json`, Sales/Mailman procedures, architecture/security/project map,
  active work, and this changelog.
- Deployment/migration: no schema migration was required. Immutable release
  `8ae6993183de31c3aafe0ba65f7a7dab7d3b5eba` is active and health-verified with
  artifact hash
  `1ace579828a381aedef998ac4ae1819f409960ea59fc802789e437dfa0ee06de`.
  A live watcher replay of confirmed Action
  `c62d02ac-ed49-4b28-93f9-8935e3f07423` posted `[EMAIL ALREADY SENT]` in the
  original thread while its event count stayed at six and the matching Gmail
  Sent result set remained unchanged. The running release therefore rejected
  the duplicate without a Gmail call.
- Rollback/recovery: revert the exact release; the already confirmed customer
  recovery must never be replayed as a new action.
- Follow-ups: use the next natural approved email as business-outcome
  validation of the complete normal Sales-to-Mailman watcher path.

### NC-20260804-001 — Sales work is acknowledged before model generation

- Date: 2026-08-04T12:36Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/release: `fa817a179448838a7489d4398992ce3cd9c929fb` on
  `codex/nc-20260804-001-sales-generating-ack`
- Change class: C3 — visible Slack work-thread status; no customer email or
  approval action is generated by this change
- Affected systems: host message dispatch, Sales persisted container
  configuration, Sales group instructions, Slack work-thread observability
- Incident evidence: the observed Mailman-to-Sales handoff entered host
  processing in 0.9 seconds and produced its review card roughly 134 seconds
  later. The wait was inside the running Sales agent rather than a container-slot
  queue. Live registration and its exact saved session confirm Sales used Sonnet,
  not Opus: 19 agent turns, 12,007 output tokens, ten reads returning 159,125
  characters, five PostgreSQL commands, ToolSearch, and the final message send.
  The tools were complete about 80 seconds before ToolSearch. Source inspection
  found that Sales instructions assumed
  a host processing receipt, while startup enforced only `threadPerMessage` and
  did not require the existing opt-in `processingMessage` configuration.
- Outcome: startup now converges every Sales registration on per-message work
  isolation plus `[PROCESSING] Generating response…`, and fails closed if the
  persisted reload omits either requirement. Dispatch awaits the in-thread
  receipt before enqueueing the cold container. Duplicate suppression is set
  only after successful delivery, leaving a failed first attempt eligible for
  the existing spawn-path fallback.
- Files: `src/index.ts`, `src/types.ts`, `src/routing.test.ts`,
  `groups/sales/CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT-MAP.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`
- Verification: under pinned Node 22.23.2, focused routing tests pass 23/23,
  the serial email-critical gate passes 14 files / 443 tests, and the complete
  suite passes 145 files / 1,904 tests with its required loopback/subprocess
  permissions. Typecheck, production build, formatting, diff whitespace, and
  documentation continuity are clean. Release and production verification are
  pending.
- Deployment/migration: immutable release
  `nanoclaw-fa817a179448.tar.gz` verifies commit
  `fa817a179448838a7489d4398992ce3cd9c929fb`, source tree
  `830e8d9785c6c8dab9a47a74e23acdc3c105f98d`, 520 artifact files, artifact
  SHA-256 `4e620674603c4d8dabe44f3b9c7b2224cd0e7ca6d962acab1e3848adad8f285e`,
  and archive SHA-256
  `125f1fc835c9cd067409a46be27d381bc04db747e5f32c7094a6a6f641840d65`.
  The production activator moved exactly the release code root, expected commit,
  and executable from `21d54309a42a` to `fa817a179448` at
  2026-08-04T12:51Z. Launchd PID 38279 runs Node 22.23.2 from the new immutable
  root; Gmail and Slack are connected, the wait queue is empty, release/code-root
  identity agrees, and the exact reviewed Sales prompt is installed. Startup
  persisted the one-row additive JSON convergence while preserving other Sales
  overrides. No synthetic lead, approval, or customer email was created.
- Rollback/recovery: restore the prior release and prior reviewed Sales prompt;
  if operational rollback also requires removing the receipt, restore the
  backed-up Sales `container_config`. No customer-data migration is involved.
- Documentation: Sales instructions, architecture, project map, active work,
  and this changelog are aligned.
- Follow-ups: observe the next natural handoff for the actual in-thread receipt.
  `NC-20260804-002` records the separately verified oversized-context latency
  debt and its quality-preserving evaluation boundary.

### NC-20260804-002 — Bound Sales drafting context without losing safeguards

- Date: 2026-08-04T12:54Z
- Owner/client: unassigned
- State: planned
- Commit/PR: pending
- Change class: C3 — Sales agent behavior and customer-response quality
- Affected systems: Sales prompt, canonical knowledge/learned material,
  retrieval behavior, latency and quality evaluation
- Outcome: planned measured remediation for the 159,125-character / ten-read
  standard context load observed in a simple Sonnet draft. No prompt or runtime
  behavior has changed under this task.
- Verification: exact saved-session aggregate captured without logging customer
  content; the representative run used 19 turns, 12,007 output tokens, five
  PostgreSQL commands, one ToolSearch, and one message send.
- Deployment/migration: none.
- Rollback/recovery: not applicable until a reviewed change exists.
- Documentation: active work and this changelog.
- Follow-ups: build a representative replay/eval set and prove that bounded
  retrieval preserves pricing, schedule, learned corrections, voice, Entry ID,
  approval, threading, and recipient requirements before deployment.

### NC-20260803-003 — Forwarded inquiries remain content-aware and recoverable

- Date: 2026-08-03T23:26Z
- Owner/client: Codex + Claude validator
- State: complete
- Commit/release: `ec0bf4c64aedddac9a4defbc31ceaf9470d171e5` followed by
  route-state repair `21d54309a42a34b42f5a980606a9406c402485ec` on
  `codex/nc-20260803-003-forwarded-email-recovery`
- Change class: C5 — inbound customer email classification, persistence,
  cross-group Gmail authority, live classification-rule remediation, and exact
  inbound replay
- Incident: an internal sender's forwarded Level 1 registration inquiry matched
  an auto-learned calendar sender rule. The parser stopped at the forwarded
  message marker, the actionable fast path returned before inbound persistence,
  and the Chief fallback omitted the Gmail identifiers. Chief was not allowed
  to search, Sales' search was not an exact assigned-address query, and the
  inquiry dead-ended until the operator supplied its contents manually.
- Live remediation: an aggregate production audit found 156 enabled
  `source='auto'` sender rules targeting non-auto-archive taxonomy labels, with
  428 historical matches. One constrained update set those 156 rows
  `enabled=false`; no row was deleted, manual/lesson/seed rules and legitimate
  auto-archive rules were untouched, and the verified remaining count is zero.
- Implementation: sender-wide auto-rules are now created only for auto-archive
  labels; future `probation_until` rows are excluded until mature; `Re:`,
  `Fwd:`, and `Fw:` subjects bypass sender-only rules; the body parser retains
  explicit forwarded content; direct actionable routes persist an exact
  Mailman-owned no-wake copy before dispatch; and Chief fallbacks carry full
  parsed body, Thread-ID, Message-ID, plus exact-read/no-search guidance.
- Recipient binding: for an explicit forward whose Tandem-owned From domain
  has a Gmail-added, aligned DMARC or DKIM pass, the host resolves the external
  From/Reply-To in the first forwarded header block as the lead, preserves the
  teammate as `Forwarded-By`, withholds Mailman's grant to the internal thread,
  and exposes that thread only as audit metadata. Inbox/Sales treat the work as
  a new outbound email after approval, never a reply to the teammate.
- Verification so far: pinned Node 22.23.2 typecheck passes; five focused files
  pass 136 tests; the full repository suite passes 145 files / 1,896 tests under
  Node 22.23.2 with the loopback and subprocess permissions its webhook and
  skills-engine tests require. The initial restricted run's 43 failures were
  reproduced as 35 `listen EPERM` cases and eight child-process PATH cases,
  then all 43 passed under the required conditions. Independent Claude review
  converged in R5. Immutable release `ec0bf4c64aed` was built and activated;
  launchd, listener, release/code-root agreement, Gmail, and Slack were healthy.
  The exact failed Gmail message was replayed once and the deployed parser
  recovered the authenticated external sender plus 995-character body.
- Replay finding and repair: Mailman correctly reclassified the replay as
  `MrGru/lead/inquiry` at confidence 0.95, but the row retained `routed_at` from
  the earlier bad classifier version and suppressed the corrected host route.
  No customer email was sent. The follow-up resets `routed_at` when classifier
  versions change and uses one 30-second, same-version conditional retry claim
  driven by the stored label; completed, recent, auto-direct
  `rules-runner-v1`, and concurrent retries cannot claim the Mailman route.
  Claude R6 found the missing rules-runner exclusion; Claude R7 returned
  `CONVERGED`. The final immutable build/deployment and exact route retry then
  completed as recorded below. On the final R7 tree, pinned Node 22.23.2
  typecheck passes, the handler file passes 25/25 tests, the complete suite
  passes 145 files / 1,900 tests, and documentation continuity plus diff
  whitespace pass.
- Final release: clean archive `nanoclaw-21d54309a42a.tar.gz` independently
  verified commit `21d54309a42a34b42f5a980606a9406c402485ec`, source tree
  `666ecf2ffddcace71eaeae81d90264370d3d1671`, 520 artifact files, artifact
  SHA-256 `bf6b25bdeb923158581df3fd90cfb1014ae0021071ddfc3d74043d86bbc50340`,
  and archive SHA-256
  `6f782136e1d02ab5167f82bf8ed95503a1f22682a22e03bfb758ace728fc7669`.
  The serial email-critical release gate passed 14 files / 439 tests.
- Deployment/outcome: the exact-three-field activator moved production from
  `ec0bf4c64aed` to `21d54309a42a`; rollback plist is
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-ec0bf4c64aed-2026-08-04T01-08-34-604Z`.
  Live health converged on PID/listener `71320`, Node 22.23.2, matching immutable
  code root and commit, connected Gmail/Slack, and an idle queue before replay.
  The exact recovered message then routed once to Sales and produced one
  validated `[SALES REVIEW]` card in its own Slack thread. Structural ledger
  checks found one card/approval marker and zero email send events since the
  recovery; pending-send state remained two historical blocked and five
  confirmed rows. The customer reply was not sent and remains approval-bound.

### NC-20260803-002 — Host-resolved Party identity outranks the model hint

- Date: 2026-08-03T19:50Z
- Owner/client: Codex
- State: complete
- Commit/release: `69bbdf782770cc4389d7a0d9035b50e36f75aa47` on
  `codex/nc-20260803-002-email-party-hint`
- Change class: C5 — final recipient boundary and one held customer action
- Incident: Colleen Entry 985 action
  `7f0ee312-1b73-4f9a-bbda-4459ee351436` reached the Gmail execution boundary
  but was blocked before Gmail. Mailman put pipeline Entry ID `985` into the
  legacy `lead_id` field; the host resolved the approved recipient/thread to
  Party `11152`, then incorrectly let the model hint override that authority
  and reported `recipient_guard`. No Gmail receipt exists for the blocked action.
- Fix: `verifyPartyRecipient()` now uses the host-resolved Party whenever
  available and treats `lead_id` only as a legacy canonical-Party hint. A
  mismatch is logged, not trusted. The known-party email membership check still
  runs on the host-selected Party, and the exact approved recipient/content,
  Gmail thread, CC, content, one-time action, and receipt boundaries are
  unchanged. The runner tool descriptions and Mailman procedure now explicitly
  prohibit substituting `Entry ID` into `lead_id`.
- Verification: the exact `985` versus `11152` reply regression passes; focused
  Gmail/IPC/delivery tests passed 3 files / 48 tests before the dedicated reply
  regression was added, the final handler file passed 47 tests, the complete
  email-critical gate passed 14 files / 419 tests, root typecheck/build passed,
  and the independent runner build plus 3 files / 22 tests passed under exact
  Node 22.23.2. The full suite reconciled to 145 files / 1,876 tests: 143 files
  passed in the restricted environment and the two known child-process/
  loopback-dependent files passed 43/43 with required permissions.
  Documentation/source formatting, continuity, and diff whitespace checks pass
  on the changed formatted surfaces. Clean release archive
  `nanoclaw-69bbdf782770.tar.gz` verified commit
  `69bbdf782770cc4389d7a0d9035b50e36f75aa47`, source tree
  `7dcde9b71e9d9ee25d890377740e13af8fa2243d`, artifact SHA-256
  `6963bfd95a7acda8563d9070abdc7ca7f4710a5dd8ceb9a912cf809662b7059d`,
  520 files, and archive SHA-256
  `90b5433eefd31485d2d42fa45a9e89133f16ffef60411d0bd6f93f4c78fd10cc`.
- Deployment: production rebuilt `nanoclaw-agent:latest` as OCI image digest
  `sha256:b2a4b8079b9c4b37f5f81b656c3e6bf5e16d04979b57f88d19cb9d51469c508b`,
  refreshed all 17 runner snapshots before host activation, and installed the
  reviewed Mailman procedure with matching source/destination SHA-256
  `f61749b265eb93445ddf1e6e1517976c6cda0780a14f3a8b3e7f0749e6c0e701`.
  The exact-three-field activation moved production from `5b76a2a` to immutable
  release `69bbdf7`; health proves matching commit/code root, Node 22.23.2,
  connected Slack/Gmail, and an idle queue. Rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-5b76a2aa40c5-2026-08-03T19-57-19-459Z`.
- Authorized recovery: terminal blocked action
  `7f0ee312-1b73-4f9a-bbda-4459ee351436` remained closed. The reposted card was
  byte-identical to the approved card (1,045 bytes; matching SHA-256
  `faa1cf763ab16f18759b6e3573db92ecb08a477f7af1446788a890e047386405`).
  Fresh action `15757279-47de-4a94-84f2-10613f63ea8c` completed at
  `2026-08-03T20:06:11.446Z` with Gmail message `19fc93bda9566299` on original
  thread `19fc907d76aa161a`. Its append-only stages are approved, handoff routed,
  Mailman started, executing, and confirmed. Production contains exactly one
  matching confirmed-content row and one row for that Gmail message ID; the
  outbound interaction was logged and Slack posted the same receipt.

### NC-20260803-001 — Email sessions and Sales work items are exact

- Date: 2026-08-03T14:45Z
- Owner/client: Codex + Claude Opus 5 validator
- State: complete
- Commit/release: `5b76a2aa40c5709b5964c57f0ad5ba81938a1f78` on
  `codex/nc-20260803-001-email-session-threading`
- Change class: C5 — customer email, approval boundary, concurrent container
  routing, Slack work-unit identity, production activation, and one held action
- Incident evidence: Justin Mangum's card omitted a parseable subject and never
  armed an action; his quarantined Gmail denial was consumed by Judith
  Pineiro's concurrent Mailman session, while Judith's actual reply received
  Gmail receipt `19fc7f12ade6742f`; root/thread Sales keys split Justin's card
  from later operator activity. Justin was not sent.
- Implementation: validate and quarantine every malformed Sales review before
  Slack; make the canonical Sales template require a fenced subject; stamp all
  Gmail MCP calls with runner-owned container identity; deliver async results
  and denials through the exact active queue work unit; add a host-labelled,
  Sales-directed lead identity derived from Gmail `Reply-To` rather than a
  relay envelope (other host formatters display the field but do not anchor on
  it); persist and assert per-root Sales work units; migrate legacy
  cursors without replay or rollback; and refuse cross-lead root binding.
- Claude R1 returned `CHANGES REQUIRED`: it proved the first guard was
  unreachable for cards without a footer, the envelope formatter derived no
  lead key, host-root trust could cross-merge leads, and targeted files could be
  silently deleted after container exit. The implementation was reconciled to
  all four blocking findings plus its quarantine/threading findings. Report:
  `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R1.md`.
- Claude R2 returned `CHANGES REQUIRED`: it proved the alternate support-card
  markers still bypassed validation and that ephemeral Gmail results had been
  enrolled in chat-cursor rollback. The reconciliation now shares one marker
  predicate across validation/arming, excludes ephemeral results from cursor
  recovery, reloads persisted Sales config before asserting, confines Reply-To
  and recipient parsing to structured headers, distinguishes invalid Gmail
  requests, and signals cross-lead root divergence. Report:
  `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R2.md`.
- Claude R3 returned `CHANGES REQUIRED`: it found that Chief's live,
  Git-ignored `[SUPPORT-DRAFT]` template used an incompatible legacy shape and
  therefore could not arm an email action. The reconciliation tracks and
  converts that canonical template, tests the file itself, makes card rejection
  group-appropriate, logs unacknowledged ephemeral results removed at container
  exit, requires runner rollout before host activation, removes unrelated
  documentation reflow, and shares the host-root predicate. Report:
  `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R3.md`.
- Claude R4 returned `CHANGES REQUIRED`: it proved malformed cards already in
  Slack could fail silently at approval, activation did not explicitly install
  changed group instructions into the writable operational workspace, and
  Slack could split an approval card across separately stored rows. The
  reconciliation adds an approval-observer notice with no action minting,
  refuses overlong approval cards as one visible rejection, uses a
  group-neutral quarantine family, stages the Chief template as tracked
  authority, and makes reviewed prompt installation and hashing an ordered
  activation correctness gate. Report:
  `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R4.md`.
- Claude R5 returned `APPROVE WITH FOLLOW-UPS` after independently verifying
  all six R4 items. Codex then found one remaining listener-semantic gap: the
  visible malformed-card rejection was still unclaimed and could continue into
  the normal agent approval path. The reconciliation now returns an explicit
  rejected result, claims only that rejected approval, and leaves valid armed
  cards unclaimed. Exact Node 22.23.2 focused evidence is 4 files / 180 tests
  plus typecheck. Report:
  `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R5.md`; R6 delta review pending.
- Final pre-commit exact Node 22.23.2 evidence: expanded email-critical 14 files
  / 418 tests, typecheck, root build, runner build and 3 files / 22 tests,
  continuity, formatting, and whitespace passed. The full serial run passed 143
  files in the restricted environment; its two permission-dependent files then
  passed 43/43 with the required child-process/loopback access, reconciling the
  complete 145 files / 1,875 tests. Claude R6 returned `APPROVE`.
- Release/deployment: clean release archive
  `nanoclaw-5b76a2aa40c5.tar.gz` passed bundled verification; production rebuilt
  `nanoclaw-agent:latest` as
  `sha256:9de282074c63df2aef0902a07ffe540a756c54e30835d49fa8b65e0ac7a77767`,
  refreshed all 17 runner snapshots before host activation, installed and
  hash-verified the five changed operational prompts, enabled Sales
  `threadPerMessage` with a backed-up one-row migration, and activated immutable
  release `5b76a2a` with healthy Slack/Gmail connections and exact Node 22.23.2
  release identity. Rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-e1fa93e09f6d-2026-08-03T15-57-08-304Z`.
- Authorized recovery: the corrected Justin card preserved the prior recipient
  and 335-byte body exactly and added only the existing Gmail-thread subject;
  production hashes and the deployed parser were checked before fresh approval.
  Action `92c2130d-4ee3-4d07-8632-1c29b2884281` completed at
  `2026-08-03T16:09:07.552Z` with Gmail message `19fc862d08848576` on thread
  `19fc7dbb8d41a592`. The ledger contains exactly one confirmed event, message,
  thread, and matching confirmed-content row; Slack posted the same receipt.

### NC-20260802-009 — Approved email delivery is an exact, receipted action

- Date: 2026-08-02T21:30Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified
- Commit/PR: `d1bfccef1c5b6e49837ea668bdbfae207c0aec10` plus correction
  `e1fa93e09f6dedf363c9a8c0be1723583563f533` on
  `codex/nc-20260802-009-email-assurance`
- Change class: C5 — customer-email execution, durable host state, agent tool
  contract, release gate, and production canary
- Affected systems: approved-send parsing/watchdog; SQLite `pending_sends` and
  `email_send_events`; Gmail IPC authorization/dispatch/guards; Mailman MCP and
  tracked instructions; release builder; security/project/roadmap records
- Incident basis: the July 28-31 failures formed one delivery-control gap, not
  one isolated bug. A handoff could be printed instead of routed; a routed
  cross-group row could fail to wake Mailman; PostgreSQL `bigint` text could be
  rejected against a model number; numeric mocks hid that production failure;
  a queued tool result could be mistaken for delivery; and source, compiled
  runtime, ignored Mailman procedure, and deployment evidence could diverge.
- Implementation so far:
  - every parseable approval receives one host UUID plus an immutable SHA-256
    of the exact approved subject/body and retains its approval thread;
  - `pending_sends` is an action projection and `email_send_events` is an
    append-only stage ledger from approval through Gmail receipt or visible
    block/uncertainty;
  - handoff and Mailman-start correlation prefer exact action/content identity;
    the final Gmail boundary uses one conditional execution claim;
  - confirmed replay returns the recorded receipt without Gmail; executing or
    uncertain replay is held for reconciliation; same-recipient concurrent work
    is separated by content hash rather than cleared by recipient order;
  - recipient/content guard failures and uncertain boundary errors post into
    the originating approval thread. A durable Gmail receipt remains confirmed
    if only a later business-interaction update fails;
  - Mailman's required `OUTBOUND-EMAIL.md` is now tracked and packaged. It
    removes the obsolete ASCII subject rewrite and model-side post-send DB
    write, requires verbatim approved bytes, and treats “queued” as non-final;
  - `test:email-critical` is serial and `release:build` runs it against the
    exact clean commit before compilation.
- Verification before Claude R1: exact Node 22.23.2 root typecheck/build,
  email-critical 7 files / 170 tests, runner build and 3 files / 22 tests, full
  serial regression 144 files / 1,834 tests, continuity, and diff whitespace
  passed. Those full-suite counts predate the R1 reconciliation and are not
  final evidence for the revised delta.
- Claude R1 exact-session Opus 5 review returned `CHANGES REQUIRED` and found
  that the alert transition could reopen an interrupted Gmail attempt, exact
  typed approvals never reached host listeners, pre-action rows could not gain
  an identity, global test routing stranded a claimed action, and bare queued
  tool text/canary documentation contradicted the intended receipt semantics.
  The report is
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R1.md`.
- R1 reconciliation makes an overdue executing attempt permanently uncertain,
  wires exact typed approval to the latest bot draft in its thread, posts and
  propagates the host Action-ID, blocks malformed cards and global redirects
  before execution, alerts Chief on unbound requests, backfills only NULL
  legacy IDs, qualifies queued tool results, anchors `Body:` after untrusted
  original text, and adds a fixed monitored-mailbox Gmail receipt canary with
  no customer/business state. Exact Node 22.23.2 typecheck/build, expanded email
  gate 10 files / 294 tests, full serial regression 145 files / 1,845 tests,
  runner build and 3 files / 22 tests, continuity/schema self-test, and source
  formatting pass.
- Claude R2 exact-session Opus 5 review returned `APPROVE WITH FOLLOW-UPS`.
  It independently replayed the interrupted and never-started state-machine
  transitions, stale terminal-state guards, legacy ID backfill, pre-action
  aggregate drain query, isolated canary reachability, and release-gate parity.
  Its five non-blocking residuals are registered as NC-20260802-010: card-aware
  typed resolution and visible no-op, typed-listener scope/proposal convergence,
  trusted-boundary Subject parsing, canary header hygiene, and clearer recovery
  text when global test routing blocks an action. No residual can produce a
  wrong or duplicate send; customer-path outcome validation remains pending.
- Final pre-commit gate on exact Node 22.23.2: typecheck and root build passed;
  email-critical passed 10 files / 294 tests; agent-runner build and 3 files /
  22 tests passed; documentation continuity passed with 38 active/ready rows
  and 35 changelog entries; source formatting and `git diff --check` passed.
- First activation attempt at 2026-08-02T23:08Z: archive SHA-256
  `e7cbdd65e10d91f52c9bd158f1925854aab5c6a93b176d929313f43bfbc9ce6a`
  verified locally and on production; bundled verification and activation
  dry-run passed; the aggregate pre-action `pending_sends` count was zero. The
  target then failed startup with `no such column: action_id` because the
  initial schema block created `idx_pending_sends_action` before the legacy
  column-migration loop. The activator restored exact release `aa1c821` and a
  healthy Node 22.23.2 listener with Slack/Gmail connected and no queued work.
  The five live group instructions were restored byte-for-byte from their
  pre-switch backup. No canary, customer email, OAuth change, or business-row
  mutation occurred; the database remained on its pre-NC-009 structure.
- Migration-order correction: the action index is created only after the
  additive column loop. A focused regression reconstructs the structure-only
  live pre-NC-009 table and indexes, runs the real initializer, and proves a new
  action plus its append-only approval event can be written. This correction
  requires same-session Claude review and a new commit/release before retry.
- Claude R3 exact-session Opus 5 review returned `APPROVE`. It executed the real
  committed and corrected `createSchema()` bodies against the exact production
  DDL: the committed body reproduced `no such column: action_id`, while the
  correction converged fresh, legacy, repeated, and partially migrated states.
  The fixture matched production column order and all three old indexes, failed
  against committed code, and passed against corrected code. Action-ID
  uniqueness and legacy-row non-executability remain intact. Its broader
  schema-convergence follow-ups are recorded as NC-20260802-011.
- Post-R3 exact Node 22.23.2 gates: typecheck and root build pass;
  email-critical passes 10 files / 295 tests; full serial regression passes
  145 files / 1,846 tests; agent-runner build and 3 files / 22 tests pass;
  continuity, source formatting, and diff integrity pass.
- Corrected release/deployment: commit `e1fa93e` produced a 520-file bundle
  with source-tree digest `7ade520429963e29e5d050da0b105bf7d2497b2b`,
  artifact digest `de470dd842a6443bb21fa95e3f827afb240324c3f50e35385ceb3cd21337c24a`,
  and archive SHA-256
  `e99cca9e13f8b35d9070ecfc444a79a66807db7a6814b06d1cfb66b6c69500b0`.
  Local unpack, production transfer, bundled verification, zero-row
  precondition, prompt hashes, and exact-three-field dry-run passed. Activation
  changed `aa1c821` to `e1fa93e`; health, launchd, and `lsof` converged on sole
  NanoClaw PID 68877 under Node 22.23.2 with verified release/code-root
  identity, Slack/Gmail connected, an empty queue, zero containers, and the
  additive action/event schema present with zero rows.
- Live transport evidence: the single owner-authorized, fixed-content internal
  canary returned and re-read Gmail message/thread receipt
  `19fc4d33ccf3061e`; its monitored recipient is recorded only as SHA-256
  `a25b480c540d47711e9892cf5319e34bd91e430b7fe85cce306c30b90580df31`.
  It used the activated release binary/manifest, wrote no Slack, customer,
  action-ledger, or business state, changed no OAuth configuration, and was not
  retried. The isolated temporary environment bridge was removed. A direct
  release-root invocation cannot currently see the operational `.env`; that
  runbook/code ergonomics defect is a non-blocking NC-010 follow-up.
- Claude R4 deployment-record review returned `APPROVE WITH FOLLOW-UPS` and
  authorized the documentation commit. It found no contradiction, overclaim,
  missing rollback evidence, secret/customer-address leak, or continuity
  blocker. D1/D2 are recorded in NC-010 N6: remove or repair the unpinned npm
  canary invocation and provide a tracked non-sending credential/release
  preflight. The informational shared-environment-layer wording was clarified
  in the runbook.
- Rollback/recovery: revert the reviewed commit and activate the prior exact
  release. The additive SQLite action/event columns and table may remain
  dormant; never delete uncertain or confirmed receipt rows during rollback.
- Residual boundary: this slice binds email delivery identity and execution,
  but does not close named-operator, nonce, expiry, or displayed-card approval
  authorization for every Company-OS action class. The full customer path
  remains `deployed_unverified` until the next natural approved send proves
  Action-ID continuity, threaded status, event/receipt persistence, and replay.

### NC-20260802-008 — Sales routing retries and work-cycle identity are bounded

- Date: 2026-08-02T19:58Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified
- Commit/PR: `aa1c82187b7fbf10050a4863bdbe8d07e87af82c` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C3 — Slack routing and Sales operator workflow
- Affected systems: Slack routing/queue, queue-owned container provenance, IPC
  cross-channel policy, channel health, Sales instructions, focused tests
- Implementation: per-lead sends serialize before resolving/rolling anchors;
  scheduled re-post equivalence expires after six hours; every historical-root
  rejection reason has negative coverage. Connected delivery failures schedule
  bounded exponential retries, and partial multi-chunk delivery persists only
  the unsent remainder under the established root. Queue context must be active;
  same-channel non-lead Sales status may inherit that host-owned work unit, but
  explicit or inherited timestamps never cross into another channel. Resolver
  downgrade count/time and queue retry state are visible through `/health`.
- R5 review/reconciliation: Claude approved the NC-008 half and identified
  bounded follow-ups. The source-group lookup now fails closed by stripping a
  timestamp when the source cannot be registered, the downgrade counter is
  explicitly named as process-lifetime, and the six-hour prompt wording is
  measured from root creation. Resolver failure remains visibly unanchored
  rather than inventing a second lead identity; that fallback is explicitly
  declined because it would create a second lead authority.
- Verification so far: Node 22.23.2 typecheck, combined focused regression at
  7 files / 186 tests, and full regression at 144 files / 1,827 tests pass.
  Documentation continuity, schema sanitizer self-test, source formatting, and
  diff whitespace pass. Exact-session Claude Opus R6 approved with follow-ups
  and no commit/deploy blockers. Commit and deployment are now complete; live
  Sales observation remains a separate pending state.
- Deployment: the exact `aa1c821` artifact and reviewed Sales prompt are live on
  the production Mac Mini. Health reports Slack/Gmail connected, zero active or
  waiting containers, `outgoingQueueDepth=0`, `outgoingRetryAttempt=0`, and
  `leadResolverDowngradeCountSinceStart=0`. No synthetic Slack post was sent;
  one natural handoff/draft/operator-revision cycle and scheduled work card are
  still required before the operator outcome is validated.

### NC-20260802-007 — Release activation makes lock and rehearsal behavior truthful

- Date: 2026-08-02T19:58Z
- Owner/client: Codex + Claude validator
- State: complete
- Commit/PR: `aa1c82187b7fbf10050a4863bdbe8d07e87af82c` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C5 — production activation lock and fail-closed diagnostics
- Affected systems: release activation executor/planner, macOS plist integration
  test, release/security documentation
- Implementation: the activator delegates its PID claim to macOS `shlock`,
  whose final `link(2)` claim is atomic and which refuses every extant lock. A
  dead numeric holder is reported as stale; recovery is a documented operator
  proof/removal/rehearsal sequence, not an automatic unlink that can race a new
  owner. Cleanup remains owner-checked. Dry-run proves `lsof` and `shlock`;
  pruned rollback roots and same-real-directory targets get direct errors; the
  successful rollback branch is asserted; and a Darwin-only test uses real
  `plutil` to render, lint, decode, and compare the candidate plist.
- R5 review/reconciliation: Claude's real-host probe proved that macOS
  `shlock` refuses stale locks, contrary to the first implementation's claim.
  The mock now mirrors that behavior; errors distinguish live, stale, and
  unreadable owners; dry-run proves the lock tool; docs require an operator to
  prove no activator is running before exact-path removal and a fresh rehearsal;
  and symlink aliases of the active release fail directly.
- Verification so far: Node 22.23.2 typecheck, combined focused regression at
  7 files / 186 tests, and full regression at 144 files / 1,827 tests pass.
  Documentation continuity, schema sanitizer self-test, source formatting, and
  diff whitespace pass. Exact-session Claude Opus R6 approved with follow-ups
  and no commit/deploy blockers. Commit, release build, activation, and live
  infrastructure verification are now complete.
- Release/deployment: Node 22.23.2 built archive
  `nanoclaw-aa1c82187b7f.tar.gz` with SHA-256
  `74865da1899008cca7cf533c716a7b84fea4ec44e5c247d17ad87e7913a1d60a`;
  the target contains 512 verified artifact files with digest
  `491a8c12f7398000dedceea0d89f54e865ba0df72e0da465f6ec482063e502d6`.
  Production dry-run changed exactly the executable, code root, and expected
  commit, then apply switched `23ffb07` → `aa1c821` and retained rollback plist
  `com.nanoclaw.plist.rollback-23ffb07d4751-2026-08-02T20-39-35-826Z`.
- Live verification: the installed plist, in-place bundle, and operational
  Sales prompt match the reviewed release. A first immediate post-switch health
  request sampled retiring PID 7169 while launchd/listener had advanced; a
  subsequent no-cache probe converged on PID 14460 across health, `lsof`,
  launchd, and `ps`. Health proves commit/root match, Node 22.23.2, both channels
  connected, and no active/waiting containers; the activation lock is absent.

### NC-20260802-006 — Sales channel roots are inbound work items, not draft broadcasts

- Date: 2026-08-02T18:22Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified
- Commit/PR: `93e8d00cbe2525436c4202e412af2c278efafff0` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C3 — Slack routing and Sales operator workflow
- Affected systems: lead-key derivation, Slack anchor lifecycle/broadcast policy,
  Sales and Inbox prompts, project map, focused routing tests
- Trigger: the operator confirmed Sales still scattered drafts arbitrarily
  between channel and thread. The host explicitly set `reply_broadcast=true` on
  lead-anchor replies and applied the generic anchor TTL, so even correctly
  anchored drafts appeared in the channel timeline and old threads could roll
  into new top-level posts.
- Implementation: every inbound `*→sales` handoff and every scheduled
  `[FOLLOW-UP]`/`[COLD]` control card now starts a fresh top-level work-item root
  and repoints the lead anchor. All subsequent lead cards,
  revisions, status, approvals, and handoffs resolve quietly inside that root;
  they never broadcast and never roll merely because the generic TTL elapsed.
  A host-recorded older root remains valid after the same lead gets a newer work
  item, so concurrent cycles do not steal each other's drafts. The runner now
  labels output with its container identity and the host defaults omitted Sales
  `thread_ts` values from that exact queue-registered work unit; older cycles no
  longer depend on the model to originate their root. A repeated scheduled card
  with the same stored marker/lead is treated as a revision, not a second root.
  Quoted handoff
  markers cannot start work; partial long-message retries reuse the root already
  established by chunk one. Reconnect delivery re-enters the same router.
- Verification: the post-R3 focused release/Sales/IPC/queue suite passes (7
  files / 178 tests); Node 22.23.2 typecheck passes.
  Combined full Node 22.23.2 suite passes serially (143 files / 1,810 tests), including
  the isolated-worktree Chaos reconciler fixture after its logger mock was made
  independent of a local `.env` file. Typecheck passes; remaining gates are
  Claude implementation review and reconciliation. Source formatting,
  documentation continuity, and diff checks passed before R2. Claude Opus 5 R2
  approved NC-003 with follow-ups and found two NC-006 blockers; the scheduled
  work-item and host-recorded historical-root changes above reconcile both.
  Claude Opus 5 R3 then approved with follow-ups and no commit/deploy blockers.
  The exact-session R4 delta review also approved with follow-ups and no commit
  or deploy blockers, independently reproducing 7 files / 178 focused tests.
  Its bounded scheduled-cycle, active-state, and non-lead inheritance findings
  are recorded under planned task NC-008 rather than hidden in review prose.
- Pre-deployment boundary: no Slack message, database row, installed prompt,
  service, or production process was changed. Live behavior requires a separate
  reviewed deployment and one real handoff/draft/revision observation.
- Deployment addendum: the NC-006 runtime and prompt shipped as part of exact
  release `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`. Release identity, prompt
  hash, channel connections, listener ownership, and idle queue are verified.
  No synthetic Sales message was posted, so the natural handoff/draft/revision
  observation remains pending.

### NC-20260802-003 — Release activation is one validated, rollback-safe identity switch

- Date: 2026-08-02T18:15Z
- Owner/client: Codex + Claude validator
- State: complete
- Commit/PR: `93e8d00cbe2525436c4202e412af2c278efafff0` on
  `codex/nc-20260802-003-company-os-sequence`, based on deployment-record commit
  `0f20224`
- Change class: C5 — production release activation and runtime provenance
- Affected systems: release integrity/health, release bundle inventory,
  installed launchd activation procedure, release/security/project-map docs
- Trigger: the `23ffb07` deployment exposed a two-field coordination gap: code
  root and expected commit were updated separately, while the tracked plist also
  differed from machine-local Node and runtime settings.
- Implementation: production startup reports and enforces the resolved code
  root against the verified release. The new dry-run-by-default activator parses
  the installed plist, permits exactly three identity changes, verifies current
  rollback and target bundles plus the actual interpreter and candidate plist,
  captures an exclusive rollback file, performs one bounded switch, requires
  commit/root proof from health, and restores once on failure. Apply is guarded
  by a fixed exclusive lock; rollback health is verified without masking the
  original failure. An explicit `--recover-from-down` path repairs a stopped or
  unhealthy current daemon without weakening bundle, interpreter, hostname, or
  target-health checks. Atomic `shlock` claiming refuses every extant lock; a
  dead holder gets an explicit operator recovery runbook rather than a racy
  automatic unlink. Host tool probing is proven before mutation, and lock
  cleanup cannot mask activation evidence. The release bundle includes the
  activation command.
- Validation so far: Node 22.23.2 typecheck passes; focused release integrity,
  activation planning, and activation executor tests pass (3 files / 21 tests);
  combined full suite passes serially (143 files / 1,810 tests) with normal local-server
  permissions; independent
  agent-runner build/tests pass (3 files / 22 tests); production build and CLI
  help load successfully. The first sandboxed webhook attempt was invalid only
  because socket binding was denied and is not counted as a product failure.
  Continuity, source formatting, and diff checks passed before R2. Claude Opus 5
  R2 approved this slice with follow-ups; its activation-lock, rollback-report,
  stopped-daemon recovery, and path-normalization findings are now reconciled
  and path-normalization findings were reconciled. Claude Opus 5 R3 approved
  with no blockers. The exact-session R4 delta review also approved with
  follow-ups and no commit or deploy blockers, independently proving the
  focused 7-file / 178-test delta and the host `lsof` command shape. Its
  double-reclaimer stale-lock race and dry-run probe-placement findings are
  recorded under planned task NC-007; the race must close before the first
  production `--apply`.
- Deployment: exact release `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`
  successfully exercised the dry-run and apply paths on the production Mac
  Mini, atomically changing only the three release-identity fields from
  `23ffb07`. The subsequent no-cache health probe, `lsof`, launchd, and `ps`
  converged on sole PID 14460 with `codeRootMatchesRelease=true`; the rollback
  plist remains available and the activation lock was cleaned up.

### NC-20260802-002 — Container timeout is an absolute lifetime, including after adoption

- Date: 2026-08-02T17:03Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: `23ffb07d47512ae9c889a87328ff71dc38b443f8` on
  `codex/nc-20260802-001-release`
- Change class: C3 — production container lifecycle and queue capacity
- Affected systems: `src/container-runner.ts`, `src/index.ts`, focused timeout
  tests, production NanoClaw release
- Trigger/evidence: the NC-001 restart adopted the still-live
  `nanoclaw-sales-1785689606073` run. It continued emitting heartbeats well past
  the Sales group's configured runtime and was adopted again on restart.
- Root cause: heartbeat and output markers called `resetTimeout()`, so the
  documented hard timeout measured inactivity rather than total runtime.
  `adoptSidecarContainer()` then applied no deadline based on the sidecar's
  durable `startedMs`; adopted states are deliberately excluded from the queue's
  duplicate liveness cleanup.
- Intended fix: calculate one effective absolute lifetime, never extend it for
  heartbeats/output, reject already-expired sidecars, and schedule adopted runs
  to stop at the remaining original deadline. Heartbeats continue to prove
  liveness for freeze/spawn checks; they no longer grant runtime extensions.
- Verification: 37 focused container-runner/group-queue tests pass, including
  a heartbeat immediately before the deadline and adopted remaining-lifetime
  arithmetic; typecheck, targeted formatting, diff check, release verification,
  and the 30-row continuity check pass.
- Deployment: exact archive SHA-256
  `627f981166f05860b4869de2df0a989cd65ba3723486ad87114de088cfc91487`
  was independently verified locally and on the Mac Mini, then activated at
  `/Users/xbohdpukc/.local/share/nanoclaw-releases/23ffb07d47512ae9c889a87328ff71dc38b443f8`.
  Fresh health reports release verified, Node 22.23.2, Slack/Gmail connected,
  one launchd-owned listener, and zero active/waiting containers. The named
  stale Sales container had exited before this restart, so the next natural
  wall-clock expiry remains the live outcome check; no synthetic stale work was
  created.

### NC-20260802-001 — MrGru grader file delivery is host-owned and idempotent

- Date: 2026-08-02T16:28Z
- Owner/client: Codex
- State: complete
- Commit/PR: isolated release branch `codex/nc-20260802-001-release` based on
  `0a39380`; exact release commit recorded by the deployment evidence
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
  syntax, discovery, and an isolated temp-root queue dry run pass. The isolated
  release candidate changes only `channels/slack.js`, `index.js`, `ipc.js`, and
  the new `grader-file-message.js` relative to the running host modules; the
  remaining removed JavaScript files are stale test or dormant-channel build
  artifacts.
- Deployment/canary: the first exact production release was commit `3368831`;
  it was superseded by timeout-fix release `23ffb07` without changing the grader
  delivery contract. Release-mode health verifies the exact commit/artifact and
  Node 22.23.2 with Slack/Gmail connected. Sanitized file delivery produced
  Slack root `1785690984.409549`, file `F0BM10JEXN3`, a durable complete receipt,
  and exactly one grader wake. The grader safely flagged the synthetic identity
  instead of emitting a learner verdict. Replaying the same adapter request
  after the final release returned the same root/file with `duplicate: true` and
  no repost. MrGru already had `files:read` and `files:write`; no OAuth mutation
  occurred.
- Deployment lessons: production launchd requires legacy `unload`/`load`; the
  release root resolves pinned dependencies from the shared parent
  `nanoclaw-releases/node_modules`; and both `NANOCLAW_CODE_ROOT` and
  `NANOCLAW_EXPECTED_RELEASE_COMMIT` must be changed together. The rollback plist
  is `com.nanoclaw.plist.pre-23ffb07`.

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
  emitted _before_ mailman composes the mail, so every downstream refusal —
  recipient guard, content guard, Gmail error, `[ALREADY-HANDLED]` — happened
  after the expectation had already been discharged. NC-20260728-003 chose the
  handoff deliberately ("the agent got that far"); this narrows it to the only
  signal that actually proves delivery.
- Change:
  - `src/send-watchdog.ts` — `observeOutbound` keeps observing the handoff but
    logs it as progress only and no longer clears. New `observeConfirmedSend`
    clears on a confirmed send, unwrapping a `Name <addr>` form and matching
    case-insensitively. `alertText` reworded: it no longer claims "no handoff has
    been seen" (a handoff usually _has_ been seen) and now points the operator at
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
