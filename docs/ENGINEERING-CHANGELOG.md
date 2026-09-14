# NanoClaw engineering changelog

al token count: 213440)
Total output lines: 12913

# NanoClaw engineering changelog

## 2026-09-14 — NC-20260914-002 exact-root Italian submission attestation

- State: ready_for_deploy; reviewed source and isolated verification complete,
  exact release and live workflow pending.
- Change class: C5 because one new privileged assertion affects which
  cross-language submission the grader may evaluate.
- The existing directory-authorized main/chief grader-file request accepts only
  optional `submission_language=it`. It participates in the request hash and
  receipt, and the host binds it in memory to `{grader jid, Slack root ts}`
  after upload but before the root is persisted and becomes grader-visible.
- The exact run context may expose `<submission_language>it</submission_language>`
  without changing registry-derived course variant, `en-US` locale, English
  feedback language, or the live assignment. Omission, restart, expiry, another
  root, another JID, or any unsupported language remains fail-closed.
- No new route, database/schema, durable student state, language registry,
  worker/scheduler, automatic detection, translation-primary grading, or
  certificate behavior is introduced.
- Isolated exact-production-base verification passed typecheck, five focused
  files / 163 tests, documentation continuity, capabilities matrix and diff
  check. Full suite passed 4,415 with 32 skipped and 19 unrelated baseline
  failures tied to retired publication fixtures plus existing CNPC, capacity,
  and relationship checks. One bounded Claude Sonnet/high
  review returned `ACCEPT`; session
  `8641cb43-fa3d-4a9d-81eb-01e34d8ab625`, four model calls, 80,820 cache-create,
  141,682 cache-read, 15,351 output tokens, maximum context 80,822.
- Shared toolbox syntax/registry validation passed; isolated staging emitted
  exact `submission_language: "it"`, and `de` was rejected before staging.
- Deployment, live Slack verdict, and Heartbeat writeback are not yet claimed.
  Rollback is the prior immutable release plus the prior grader prompt; restart
  clears every in-memory attestation.

al token count: 221648)
Total output lines: 13399

# NanoClaw engineering changelog

## 2026-09-18 — NC-20260918-001 owner-directed approved CC authority

- State: `ready_for_review`; implementation and local verification are complete.
- Change class: C5 because the change adjusts the final recipient/privacy trust
  boundary for approved customer email.
- Trigger: an exact approved reply carrying Alex's explicit
  `Cc: cherie@tandemcoach.co` instruction was blocked before Gmail because the
  CC was outside the customer's Party, configured sender mailboxes, and latest
  visible inbound recipients.
- Outcome: the existing action-bound human-approved card now authorizes its
  exact ordered CC list for both sends and replies. Unapproved CC continues to
  require Party membership. Primary To/Party/thread checks, exact content and
  recipient rehydration, BCC prohibition, uniqueness/count limits, reserved
  address rejection, one-time execution, and Gmail-confirmed receipts remain.
- Topology: no schema, migration, durable field, worker, queue, scheduler,
  dependency, address resolver, tool, or second send path. Names are never
  resolved to addresses; Alex/Cherie must state exact bare addresses.
- Verification: focused recipient/parser/execution/prompt suites pass 121/121;
  pinned typecheck passes; the email-critical gate passes 808/808 plus runner
  45/45. The full suite passes 4,508 with 34 skips and the same three unrelated
  predecessor Capacity, CNPC and date-sensitive Trafft failures reproduced on
  exact live base `e5b30966`.
- Independent review: the pre-implementation necessity round returned `KEEP`.
  Strict-MCP bounded Sonnet/high implementation review session
  `c752f807-17a6-4519-9eb6-20c51bbde7eb` returned `PASS` with no material
  finding. It verified card-time address closure, approval/execution CC
  equality, action-only authority, reserved-address rejection, unchanged
  primary alias scope, host rehydration, and test-routing CC removal. Usage:
  ten model calls, 137,403 cache-create, 307,136 cache-read, 19,693 output
  tokens.
- Deployment: not yet committed or deployed. No customer email or synthetic
  external canary was sent; natural owner-directed CC is the outcome gate after
  activation.

## 2026-09-17 — NC-20260917-003 finite website installment contracts

- State: `ready_for_review`; default-off source and focused verification are complete.
- Change class: C4 because the dormant path can initiate future stored-method payments when separately configured and enabled.
- Outcome: migration 171 adds a host-owned finite contract, explicit obligation, one-attempt, append-only receipt and recovery-required model. `src/finite-billing.ts` validates signed activation facts, preserves no-N+1 and earliest-unpaid ordering, records ambiguous dispatch durably, and exposes one deterministic sweep callable without registering a standing schedule.
- Boundaries: no usable provider token enters Company OS; no automatic retry, customer send, custom schedule, open-ended renewal, Production enablement or due-date override exists.
- Verification: focused finite-billing plus webhook suites pass 66/66; pinned typecheck and diff checks pass. Commerce companion verification is recorded in the Peri program evidence.
- Independent review: one Sonnet/high round found one material mismatch between the application `dispatch_unknown` state and the PostgreSQL CHECK. Migration 171 now admits that blocked state and the focused test asserts it; no re-review is needed for the mechanical correction.
- Deployment/migration: not yet applied. Rollback is runtime disablement; the rollback migration refuses destructive deletion of financial evidence.

## 2026-09-17 — NC-20260917-002 canonical ACC roster cohort identities

- State: `complete`; source, verification, review, immutable release, live
  projection proof and the one guarded roster correction are complete.
- Change class: C4 because the existing post-payment Bookkeeper path writes the
  student roster after signed payment truth.
- Outcome: the signed Commerce envelope validator now requires the canonical
  `YYYY-MM` roster identity for ACC while preserving the existing
  label-plus-range contract for PCC and ACTC. The Sheet writer remains
  unchanged, byte-preserving, fill-only and readback-gated.
- Files: `src/commerce-bookkeeper.ts`, `src/commerce-bookkeeper.test.ts`,
  `src/webhook-server.test.ts`, `docs/ACTIVE-WORK.md`, and this changelog.
- Verification: pinned focused Bookkeeper/webhook suites pass 72/72; typecheck
  and continuity pass. The full suite is 4,502 pass / 34 skip / four failures:
  the payment-method concurrency case passes isolated and the remaining three
  are the exact known predecessor Capacity, CNPC and date-sensitive Trafft
  failures.
- Independent review: bounded Sonnet/high session
  `d79020be-f79b-4de4-82ea-acee207fa122` returned PASS. It found two LOW test
  hardening gaps: four compatibility-map rows lacked direct assertions, and a
  malformed explicit cohort token could fall through to the map. Both are now
  mechanically closed; all six rows and malformed/mixed/conflicting/unknown
  boundaries are direct tests, so no second review round is warranted. Usage:
  six model calls, 138,473 cache-create, 544,709 cache-read and 18,576 output
  tokens; maximum context 150,151 exceeded the bounded target and is recorded
  as orchestration debt.
- Topology: no schema, route, service, process, worker, queue, scheduler,
  credential, provider call, payment, enrollment, access or customer-message
  change.
- Release: commit `618880fbe188a15e913a081c40eb3bd68a452363`, source tree
  `96b414c32187afebce56088e31855dcfcbe5eb97`, artifact hash
  `fa054ce6484f48c399fe74cccb4e0d3eefc09d4214627ccded981c38e94a5818`,
  archive hash
  `64904a114e8faecccee8b65941bf60cdd851eebff8a8b2b2802607313c2bcf74`.
  The Mini independently verified the bundle and activated it from exact live
  `3972d9f5`. Health, launchd and the sole listener converge on PID 45738,
  Node 22.23.2, the exact code root, connected Gmail/Slack, zero active or
  waiting work and a healthy student-lifecycle store. Rollback plist:
  `/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-3972d9f545b3-2026-09-18T01-36-17-314Z`.
- Cross-system live proof: Tandem Commerce 1.40.18 and Tandem Snippets 1.7.4
  are active with source hashes matching commit `640cb6145`. The live calendar
  and Commerce resolver agree on the bounded transition rows, including
  Oct Module 1 -> `2026-10`, Oct Module 2 -> `2026-09`, Nov Module 1 ->
  `2026-11`, Nov Module 2 -> `2026-10`, Dec Module 3 -> `2026-10` and Dec
  Module 4 -> `2026-09`. A premature plugin activation was immediately rolled
  back while one unrelated NanoClaw task drained; database readback proved
  zero Commerce submissions during that interval. After Company OS activated,
  the verified plugin pair was reactivated in declared order.
- Roster correction: the existing guarded Sheets operation uniquely matched
  `arorus@gmail.com`, required the exact old display value, changed only
  `ACC!N59`, and API readback verified `2026-10`. No payment, Bookkeeper replay,
  enrollment, access change or customer message occurred.
- Rollback: restore the retained Mini plist and the VPS plugin backup at
  `/home/tca/plugin-backups/acc-cohort-gap-final-20260917T2037`. Existing
  payment and order evidence remains preserved; the intentionally corrected
  roster cell is not automatically reverted.

## 2026-09-17 — NC-20260917-001 Adyen capacity commitment source repair

- State: `validating`; source, focused/full verification and bounded review are
  complete; commit and production release remain pending.
- Change class: C4 because the existing asynchronous post-payment Bookkeeper
  path commits a paid learner seat after payment, roster and PostgreSQL
  projection readback.
- Root cause: the signed Commerce ingress already emitted the canonical
  `website_adyen_sale` source, and the type/store boundary admitted it, but the
  core Capacity reducer allowlist contained only `website_stripe_sale` and
  non-website commitment sources. Two paid Adyen jobs therefore failed with
  `academy_capacity_invalid_commitment_source` after their earlier idempotent
  projections completed. The first corrected live retry then proved those old
  denials were replayed from the durable operator case before the reducer; both
  cases remained denied and no reservation was written.
- Outcome: the reducer now admits exactly `website_adyen_sale`; unknown sources
  still throw `invalid_commitment_source`. The ingress advances only its
  operator-case contract key to `website-sale-v2`, retiring the two cached
  denials while preserving stable commitment and provider-payment idempotency
  keys, so an already-applied seat still cannot duplicate. No schema, topology,
  route, worker, queue, scheduler, provider call, customer message or manual
  capacity change is added.
- Files: `src/academy-capacity.ts`, `src/academy-capacity.test.ts`,
  `src/academy-capacity-sale-ingress.ts`,
  `src/academy-capacity-sale-ingress.test.ts`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`.
- Verification: the real reducer plus ingress suite passes 21/21 under pinned
  Node 22.23.2; typecheck and documentation continuity pass. The full suite is
  4,503 pass / 34 skip / three exact unrelated predecessor failures: Capacity
  disposable expired-hold expectation, CNPC wrapper-source assertion and the
  date-sensitive Trafft freshness expectation.
- Independent review: one bounded Sonnet/high round, session
  `422cfc49-7922-4c40-8799-d70007ffb3ab`, returned PASS with no material
  findings across the Capacity allowlist and the paired Commerce recovery
  transaction/browser paths. It used 14 model calls, 218,144 cache-create,
  2,355,022 cache-read and 8,580 output tokens; the oversized 218,146-token
  context and cache reread are recorded as an orchestration defect and no
  second round will be run.
- Deployment: commit `44edb85d` was built and activated as an immutable release
  with exact health/Node/code-root verification and rollback to `eb8af47c`.
  One bounded retry of the two existing jobs reproduced the cached-denial
  boundary; both remain pending, no reservation was written and no payment was
  initiated. A corrected release is pending.
- Rollback/recovery: ordinary code rollback removes the new source admission;
  idempotent Bookkeeper retries preserve the already-complete payment, roster
  and PostgreSQL projections.
- Documentation: Active Work and this changelog. Project Map and Release
  Integrity are unchanged because topology, authority and release procedure do
  not change.

## 2026-09-16 — NC-20260916-001 Commerce refund Bookkeeper projection

- State: `validating`; source, focused verification and S1/S2 are complete;
  commit, migration, release and preserved TEST-job replay remain pending.
- Change class: C4 because the existing asynchronous Bookkeeper path changes
  financial projections after WordPress-authoritative signed refund success.
- Outcome: the existing signed receiver admits exact `REFUND success` envelopes
  with refund/payment PSPs, request/order references, exact amount and stable
  sequence-bounded cumulative/remaining totals. The existing recorder updates
  only the original Payment Log status, explicitly leaves Student Roster
  unchanged, appends one PII-free migration-170 refund projection and produces
  the mechanical Contador receipt before WordPress completion.
- Topology: no new endpoint, service, process, queue, worker, scheduler,
  credential, provider call, customer communication or access/capacity action.
- Verification: focused receiver/webhook/payment-migration/refund-migration
  suite passes 81/81; pinned Node typecheck, formatting and documentation
  continuity pass. Full suite is 4,501 pass / 34 skip / four initial failures;
  the payment-method concurrency case passed immediately in isolated rerun and
  the remaining three are the exact live-line predecessor failures (Academy
  Capacity operator fixture, CNPC wrapper-source assertion and Trafft stale-date
  fixture), outside changed files.
- Necessity review: isolated Sonnet/high session
  `7e780d32-65e0-4a81-8883-563177d7290a` returned KEEP for all five obligations
  and REMOVE for any new runner. It used three turns, 15,591 cache-create,
  41,446 cache-read and 1,136 output tokens; reported cost was about $0.08203.
- Correctness review: Sonnet/high session
  `ae5cb79c-8915-406c-8e5a-eec4424d403f` found one material ordering defect:
  a delayed partial refund could regress Payment Log from `refunded` to
  `partially refunded`. The recorder now reads the current status and makes full
  refund terminal; focused tests cover both directions. The review used ten
  turns, 54,202 cache-create, 90,720 cache-read and 19,601 output tokens;
  reported cost was about $0.43098. No second correctness round is needed
  because the correction is a pure monotonic reducer with direct regression
  assertions.
- Rollback: host-code rollback preserves refund evidence. SQL rollback 170 is
  permitted only while the refund table is empty and otherwise raises a visible
  refusal.
- Documentation: Active Work, Project Map, Release Integrity, Contador prompt,
  structure-only schema, S1 request/response and S2 reconciliation.

## 2026-09-15 — NC-20260915-005 provider-neutral ACC capacity commitments

- Extends the existing signed Commerce Bookkeeper cohort envelope to canonical
  ACC selections and reuses the owner-approved simple-sync Capacity path after
  Payment Log, roster and PostgreSQL readback. No checkout hold or synchronous
  NanoClaw dependency is reintroduced.
- Existing Stripe identity remains the raw `pi_*`; Adyen uses the distinct
  `adyen:<pspReference>` idempotency identity and
  `website_adyen_sale` source scope. Only ACC Module 1, ACC Full and combined
  Full consume the shared Module 1 pool; Modules 2-4 remain cohort-bearing but
  outside that pool.
- Migration 169 registers the four missing published Module 1 starts, four
  12-seat pools and the existing three offer mappings. It creates no learner,
  assignment, reservation, commitment, payment, message or access. Exact
  reapply, empty rollback and conflict refusal are proven in disposable
  PostgreSQL.
- Missing mapping and full-pool outcomes remain explicit review results. The
  host cannot acknowledge WordPress or post the Bookkeeper success receipt
  before one applied/replayed Capacity commitment.
- Focused payment/capacity proof passes 78/78 plus typecheck and formatting.
  Full root proof passes 4,491 with 34 skips and three unchanged baseline
  failures independently reproduced on the predecessor lineage: Capacity
  disposable expired-hold expectation, CNPC source-wrapper literal, and the
  date-sensitive Trafft freshness expectation.
- Bounded Sonnet/high review found one material combined-program gap: the
  brand-new-user path did not read back both groups. Tandem Commerce now fails
  unless every snapshotted group is present in the existing durable pending-
  enrollment queue; the result remains truthfully `invited` until activation.
  The payment/status/idempotency/migration boundaries otherwise passed review.

## 2026-09-15 — NC-20260915-004 live-line credential Commerce integration

- Exact production release `50905fc8522c11a55a9fca782280b862a017daa6`
  advanced on the login-tools branch after the provider-neutral Commerce release.
  A dry-run caught the divergent lineage before activation; no service pointer
  changed.
- The integration branch starts from that exact live commit and applies only the
  reviewed provider-neutral receiver, migration 168 and credential cohort
  projection commits. It retains every identity gateway source file and the
  current runtime topology. Runtime source merges without conflict; Active Work
  and this changelog were combined manually to preserve both ownership records.
- No migration reapply is required: live PostgreSQL already has migration 168 and
  one provider-neutral AI row. The immutable release must package the migration
  for integrity while preserving the live generalized constraint.
- Activation is gated on integrated typecheck/focused tests, clean immutable
  release verification, exact current health and natural zero-work drain.

## 2026-09-15 — NC-20260915-002 credential Commerce cohort projection

- State: `in_progress`; source verification is green, release pending.
- The existing signed Commerce Bookkeeper envelope accepts either no cohort or
  one exact PCC/ACTC selection with bound program, module, scope, key, four
  canonical session timestamps, display facts and fill-only roster value.
  Malformed or internally inconsistent cohort evidence fails before any Sheet or
  PostgreSQL write.
- The existing recorder continues exact Product Map routing. When a cohort is
  present it requires the destination tab's existing `Cohort` column, writes only
  a blank cell, preserves an operator/existing value, and reads the cell back
  before acknowledging the WordPress job. The mechanical Slack receipt includes
  the purchase-snapshotted cohort.
- This adds no route, endpoint, table, migration, secret, worker, queue,
  scheduler, agent or payment authority. Cohort source authority and checkout
  validation remain in Tandem Commerce; NanoClaw is an idempotent destination.
- Verification: pinned Node typecheck and focused Bookkeeper plus migration-168
  tests pass 11/11. Immutable release build, deployment and first natural
  credential purchase remain required.

## 2026-09-15 — NC-20260915-002 LinkedIn alert intake for Executive Search

- State: `validating`; implementation and focused tests exist in the isolated
  branch, while independent review, immutable release, and natural-provider
  evidence remain pending.
- Change class: C2. The host changes one inbound Gmail disposition and creates
  private immutable discovery envelopes. It sends no message, changes no CRM or
  application decision, and grants no agent capability.
- Exact authenticated mail from `jobalerts-noreply@linkedin.com` with recognized
  LinkedIn job pointers is captured before Mailman, Chief, proposal, hard-filter,
  or classification paths. Raw body/HTML and tracking parameters are discarded;
  the outbox retains only bounded job-pointer metadata and hashes.
- Executive Search uses an explicit operator-triggered SSH pull over the existing
  Tailnet path. It stores private replay-safe received/pending/resolved receipts,
  resolves only an exact existing employer/public-ATS match, and surfaces
  unmatched leads without treating email snippets as job descriptions.
- Minimum-sufficient review: `KEEP`, with recurring timer polling removed from
  this release until an exact-sender natural alert proves the provider format.
- Verification: NanoClaw focused Gmail/parser/disposition/outbox 96/96 and
  typecheck pass under Node 22.23.2. Its full suite is 4,441 passed / 32 skipped
  with four failures in unchanged unrelated Academy Capacity, CNPC,
  payment-method, and Trafft tests. Executive Search passes its full 93/93
  root+nested suite plus app lint/typecheck/build.
- Independent review: one bounded Sonnet/high round found a broken remote
  `find` glob and retained-batch starvation. Both were corrected and covered by
  direct glob reproduction plus a 101-envelope advancement regression. Review
  usage: four model calls, maximum context 55,115, cache creation 50,274, cache
  read 76,564, output 21,307; no second ceremonial round.
- Integration proof: an actual authenticated SSH fixture transferred one
  minimized envelope from the Mini path to a disposable Studio store, resolved
  one exact ATS lead and retained one unmatched lead, with zero applications,
  reports or schedules. Hidden-IAB proof showed zero/zero before explicit
  import, then one matched/one pending, preserved after reload.
- Files: `src/linkedin-job-alert-outbox.ts`, Gmail parser/channel/disposition and
  focused tests, this changelog, Project Map, Security, Active Work, and
  `docs/LINKEDIN-JOB-ALERT-OUTBOX.md`; Executive Search owns its separate intake
  module, API/UI, tests and local evidence.
- Deployment/migration: pending. No real Gmail message was read for this proof,
  no production outbox/Studio receipt was created, and no schedule, LinkedIn
  page fetch, briefing, application, employer contact, or customer/business
  route changed. Synthetic Mini/Studio fixture artifacts were removed after
  verification; private proof receipts remain on the Studio.
- Rollback/recovery: remove the capture call and accepted reason while preserving
  minimized outbox/Studio receipts. SSH or Studio outage leaves Mini envelopes
  queued; exact replay remains idempotent.

## 2026-09-15 — NC-20260915-003 login-to-tools source walking skeleton

- Owner redirected Tandem Identity from further foundation work to one customer-
  visible milestone: the same verified session and exact Party must reach
  `/account` and one protected `/tools` experience.
- Fresh minimum-sufficient review returned `KEEP` for a typed version-1 access
  projection, pure evaluator and route through the existing gateway seam. It
  rejected any new store, transport, cache, queue, worker, tunnel or second
  identity/access authority.
- Private Tandem Identity source now requires exact `coaching_tools.plus`,
  `active` state, inclusive start/exclusive expiry, positive canonical version,
  five-minute freshness and 60-second future skew. Every uncertain/malformed
  state denies; gateway failure is distinct temporary unavailability.
- `/account` and `/tools` independently query the same `(project, Firebase UID)`
  and receive the same Party in the HTTP proof. Party IDs and access projections
  do not enter HTML; `/api/me` retains its binding-summary response.
- Focused access/application tests passed 55/55; full Tandem Identity passed 74
  with four intentional Firestore skips; typecheck, build and diff checks pass.
- One bounded Claude Sonnet/high review returned `PASS` with no material finding.
  Its low error-middleware consistency note was fixed mechanically. Session
  `58e97d58-0019-4e90-929f-67adf1374fa6` used four model calls, 59,235
  cache-create, 95,172 cache-read and 12,157 output tokens; maximum context was
  64,076 with no warning.
- A formatter-expanded intermediate diff was corrected before acceptance:
  established files returned to their original formatting and the reviewed
  route assertions moved to a focused test file. Full verification passed again.
- Exact private remote head is `d46fb591e4c22e8edc5f113ee0dc99c0062f7589`
  on `codex/login-tools-walking-skeleton-20260915`.
- Deployment/live outcome is blocked, not claimed. The installed server still
  uses `UnconfiguredIdentityGateway`; no user, verification, Party/auth binding,
  entitlement grant, provider write, gateway transport or deployment occurred.
  Completion requires one owner-named controlled identity and exact Party/
  entitlement plus a separately authorized real gateway path.
- Read-only owner-pilot reconstruction then found three unmerged same-email
  Person records. Party `10069` is the only long-lived record and carries 13
  exact Plutio, Trafft, Stripe and Tandem-web references; Parties `11646` and
  `11647` are recent WordPress checkout-created prospects with no returned exact
  refs. None has a verified identifier claim, Google auth binding or Coaching
  Tools Plus entitlement. Eleven other Parties have the canonical
  `shared.coaching-tools-plus` component. No identity/access/provider write
  occurred. Evidence:
  `.program/evidence/NC-20260915-003-pilot-resolution-blocked.md`.
- The owner approved Party `10069` for this pilot without merging the two
  checkout duplicates and authorized the smallest real development gateway.
  Current topology supports one path-mounted Tailscale Funnel route into the
  existing NanoClaw HTTP process; Funnel is available and currently empty.
  Fresh necessity review returned `KEEP`, requiring exact application-path
  enforcement, stable replay identity, a bounded Funnel lease and independent
  pre-pinning of the Cloud Run service account numeric subject. Google Cloud
  requires fresh owner passkey verification for that IAM readback, so no source,
  endpoint, Funnel, binding or deployment action has started. Evidence:
  `.program/evidence/NC-20260915-003-gateway-subject-readback-waiting.md`.

## 2026-09-15 — NC-20260915-002 service-account transport verifier

- Selected a future Google-signed Cloud Run service-account ID token as the
  smallest standard BFF-to-Company-OS caller identity after a current read-only
  Cloud Run, Mac Mini, Tailscale and Cloudflare-path audit.
- A fresh minimum-sufficient necessity review returned `KEEP` after removing a
  production-shaped BFF token/client abstraction. The existing Tandem Identity
  proposal producer remains unchanged.
- Added one pure, unwired Company OS verifier using the existing
  `google-auth-library`. It requires a strict RS256 header, Google issuer, exact
  HTTPS audience, exact verified runtime service-account email, immutable
  subject, bounded times, token/body byte limits and the unchanged strict
  participant proposal.
- An ephemeral in-memory issuer and the exact existing BFF artifact prove the
  synthetic boundary. Generated disposable PostgreSQL preserves explicit
  serializable transaction identity, accepts once, returns zero-write exact
  replay and rejects altered claim-ID reuse through existing claim semantics.
- Focused transport/cross-repository/database proof passed 23/23. Format,
  typecheck, build and documentation continuity passed. Full NanoClaw reached
  4,447 passed / 34 skipped / 20 unrelated failures with no identity failure;
  payment reconciliation passed immediately in isolation and the pre-existing
  Academy Capacity fixture remains independently red. Tandem Identity remained
  44 passed / 4 intentional Firestore skips with typecheck/build passing.
- One bounded Sonnet/high auth review returned `PASS`, no material findings and
  no required correction. Session `6f3acb26-a59b-4bd6-8b0d-2dff28cc0f13`
  used four model calls, 84,356 cache-create, 143,816 cache-read and 16,292
  output tokens; maximum context was 89,197 with no usage warning.
- Companion commits: Tandemweb topology/obligation checkpoint `e2e245e43` and
  Tandem Identity runtime-unchanged boundary documentation `3a577a7`.
- Company OS implementation commit `582a9b37` is pushed with exact remote
  readback. Final completion evidence is
  `.program/evidence/NC-20260915-002-service-topology-complete.md`; Company OS
  revision 354 closes all seven commitments with no active claim or lease.
- This is synthetic source/disposable evidence only. No endpoint, HTTP client,
  metadata/certificate fetch, IAM/network/secret/config, runtime import, worker,
  DDL/migration, real credential/user, Party/ref/access/provider/customer write
  or deployment exists. Production remains gated on real metadata-token/IAM/
  certificate evidence and an authorized HTTPS route.

### 2026-09-15T21:53Z addendum — migration 168 review and source proof

- Owner approved the additional review. Sonnet/high session
  `7c4f21e1-59a4-4e5e-8469-19d3e5de5f40` returned `KEEP` and found two material
  proof gaps: the SQL/receiver pattern equivalence needed mechanical evidence, and
  unsafe rollback had to fail visibly rather than silently.
- Migration 168 now replaces only the MCS-literal product constraint with the exact
  1–100 lowercase-alphanumeric/internal-hyphen shape enforced by
  `commerce-bookkeeper.ts`. Its guarded rollback raises
  `rollback 168 refused` whenever any non-MCS row exists; code rollback preserves
  provider-neutral evidence.
- A real disposable PostgreSQL database proves first apply, exact reapply without
  row changes, Practitioner admission, populated rollback refusal, safe MCS-only
  rollback and reapply. The static corpus covers one-character, 100-character,
  consecutive-hyphen, leading/trailing-hyphen, uppercase, underscore and 101-byte
  cases against both source contracts. Focused migration/receiver tests pass 10/10.
- Review usage: six model calls, 21,255 cache-create, 125,085 cache-read, 9,085
  output tokens, maximum context 33,071, no warnings; cost `$0.200911`.
- No production schema or pending job changed in this addendum. Backup, exact
  migration apply/readback and one pending-job replay remain required.
- Final local release gate: TypeScript typecheck passes and the focused migration,
  prior Adyen-schema and signed Bookkeeper receiver suites pass 12/12.

## 2026-09-14 — NC-20260914-007 disposable claim proposal

- Added an independent strict participant-only Company OS proposal validator.
  The BFF cannot supply Party IDs, candidate lists, conflict flags, staff/payer
  roles or access decisions.
- Added an unwired disposable receiver that requires serializable isolation,
  derives current unmerged Parties only from active/current verified migration-
  137 identifier claims, and reads open exceptions by exact Heartbeat-reference
  fingerprint before reusing the migration-167 accepted-claim store.
- Exact replay reconstructs the historical target only from an existing exact
  accepted-claim decision and writes zero. Altered reuse, zero/multiple
  candidates, open conflict, prior decision conflict, invalid proposal and
  non-serializable callers fail closed with zero forbidden writes.
- One BFF-produced temporary proposal artifact is consumed by hash; no second
  checked-in fixture exists. The S2 necessity review removed custom HMAC,
  signing canonicalization, key IDs and a second Firebase verifier.
- This is synthetic source/disposable evidence only. No endpoint, network,
  credential, runtime import, DDL, real user, production binding, provider/
  access/customer write or deployment is present.
- Focused cross-repository and disposable verification passes 19/19; format,
  typecheck, build and docs continuity pass. Two full runs were each 4,435 pass/
  33 skip/20 fail; each had the established 19 unrelated failures plus a
  different disposable/concurrency flake. Payment-method reconciliation and
  Academy Capacity shadow both passed immediately in isolation, making the
  effective comparison 4,436 pass with the same baseline.
- One bounded Sonnet/high round found the isolation-GUC check did not prove one
  persistent transaction. The receiver now assigns and rechecks the same
  PostgreSQL transaction ID across all context reads; a session configured
  serializable but left in autocommit fails before writes. The exact regression
  passes, so no second review round is warranted. Four model calls used 71,968
  cache-create, 138,150 cache-read and 28,000 output tokens; maximum context was
  83,647.
- Source commits: Tandem Identity implementation `926774f`, reviewed source
  head `4ca09d8`, and Company OS implementation `512a4ee6`. These branches are
  source-only and unwired; deployment and live/provider verification are not
  applicable and remain explicitly prohibited.
- The owner selected the same private GitHub account as `tandemweb`. Private
  `alex-kudinov/tandem-identity` now exists, uses authenticated HTTPS, and the
  exact reviewed branch is remotely verified at `fc5714d`. Company OS final
  reviewed source/evidence checkpoint is `d6048eac`; the program item is
  complete with no deployment, and canonical program evidence records the final
  remote ref.

## 2026-09-14 — NC-20260914-006 dark Google account claim

- Added one concrete, strict Google Identity Platform claim and evaluator for an
  explicit Heartbeat-user-to-existing-Party selection. Email/name/group/payment
  similarity is never an authority; missing or conflicting context holds or
  rejects the claim.
- Added an unwired admin-transaction store over migration 167 only. Accepted
  synthetic claims append one authenticated receipt, related Heartbeat ref,
  accepted auth-account binding and accepted-claim resolution decision. Exact
  replay writes zero; altered reuse, prior subject observation, invalid target
  Party, cross-environment adapter scope and late constraint conflicts fail
  closed or roll back atomically.
- Structural checks exclude network, credentials, production runtime imports,
  Party/ref/provider-attempt writers and migration 168. No real user, provider,
  production database, access, customer or deployment action is authorized.
- Focused tests, full-suite comparison, independent auth/identity review and the
  final source commit are recorded in
  `.program/evidence/NC-20260914-006-account-claim-reviewed-precommit.md`.
- Verification: focused 20/20, format, typecheck, build and docs continuity
  pass. Full suite was 4,422 pass/32 skip/20 fail; the one failure beyond the
  established 19-file baseline was an unrelated disposable timeout that passed
  immediately in isolation, making the effective comparison 4,423 pass with
  the same 19 baseline failures.
- One bounded Sonnet/high round found no behavioral defect and one moderate
  proof gap: missing-Party and prior-Google-subject refusal lacked database
  tests. Both guards now have exact zero-write disposable readbacks; no second
  round is warranted. The review used 13 model calls, 113,010 cache-create,
  965,527 cache-read and 13,591 output tokens; its 119,643-token maximum context
  exceeded the 100k target and is recorded as an orchestration warning.
- Source implementation commit: `2669e9cf` on
  `codex/tandem-identity-account-claim-dark-20260914`. This is an unwired source
  result, so deployment and live/provider verification are not applicable and
  remain explicitly prohibited.

## 2026-09-14 — NC-20260914-001 Tandem Identity D3 Heartbeat reconciliation

- State: `complete`; reviewed source, disposable PostgreSQL proof, protected
  backup, immutable release, production import, replay and exact live readback
  are complete.
- Two complete Heartbeat `main` censuses reproduce 1,694 users, 79 groups and
  4,202 membership edges; the current webhook inventory has 22 registrations.
  The private artifact retains only UUIDs, counts, timestamps and hashes.
- D3 introduces no provider client or credential on Mini. One one-shot
  transaction can write only a full aggregate reconciliation, 82 normalized
  fingerprints, one aggregate control projection, one blocked command and one
  unavailable readback. The block is
  `INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE` because the source has no per-user
  graph.
- Exact replay writes zero. Party/ref/auth/resolution/provider-attempt and D2
  counts are compared before and after; migration 167 also structurally rejects
  every provider attempt.
- Focused 9/9, typecheck, build and documentation continuity pass. Full suite:
  4,407 pass/32 skip/19 failures in the unchanged five-file baseline; no D3 or
  identity-control-plane failure.
- Bounded Sonnet/high review
  `ed0bdbcc-6a73-42a3-8b5c-93573b866c92` found no material issue. It used 7
  model calls, 135,768 cache-create, 568,014 cache-read and 18,208 output tokens,
  with a 135,770 maximum context warning; no second round is warranted.
- First production readback surfaced a read-only integration defect: the D2
  validator treated all provider projection/reconciliation rows as D2 rows and
  therefore rejected D3's authorized `main` evidence. It now scopes those
  checks to D2's `community` source while retaining the global zero-attempt
  invariant. D3 acceptance also pins the database-recomputed snapshot hash and
  the full protected D2/canonical baseline. Focused 12/12 and typecheck pass;
  this mechanical validator-only correction does not need a second review
  round.
- Detailed evidence:
  `.program/evidence/NC-20260914-001-d3-complete.md`,
  `.program/evidence/NC-20260914-001-d3-reviewed-precommit.md` and
  `docs/IDENTITY-CONTROL-PLANE-D3.md`.
- Release: exact live commit
  `1509c38eb53bfbb32bfc16cc09cc240af3094614`, source tree
  `24bf0a3a86f3039e6d1da63f565d0534b9267789`, artifact SHA-256
  `39030fffcb6b54f17acfa26e686d8fb73834201d11d16520e9371cc38741c40e`,
  1,372 files and archive SHA-256
  `e6012f9d0ad4610e835406e74e98439a1527f3a8823f3519b9fdc551eda6c5b5`.
  Local and fresh Mini verification pass under Node 22.23.2.
- Protected backup is 15,116,487 bytes, mode 0600 and SHA-256
  `530e34aed7d6886a388a9e4dbfa38c166a999913b2b4770c5d335701c397ed53`;
  `pg_restore --list` accepts it.
- Production run ID 1 stores 82 normalized items with database-computed
  snapshot SHA-256
  `c4ec624167ef6766d4b04bb8aac715a11c76c60b6a5cffae2d528c90df9725ea`.
  Candidate and exact-live replays are zero-write duplicates. Party 1,647,
  refs 5,601, claims/auth/resolutions/attempts zero and D2 379/379/156 remain
  unchanged.
- Activation changed only three immutable release pointers, retained rollback
  plist `com.nanoclaw.plist.rollback-d99ca2589def-2026-09-14T11-50-49-513Z`,
  adopted the unrelated Chief container intact, and restored connected
  Gmail/Slack with no waiting groups.

## 2026-09-14 — NC-20260913-003 Tandem Identity D2 production shadow

- State: `complete`; implementation, independent review, immutable release,
  production migration, enablement and live verification are complete.
- Exact base: D1 completion
  `eae3a1424e1c1224d943c618bc8ac66b516a3194`, whose ancestor is exact live
  release `c190b957333ac1901b2d46a1f4b3f1cf75c6341c`.
- Authorization: accepted owner decision
  `.program/decisions/decision-tandem-identity-d2-production-shadow-2026-09-14.json`;
  Party/ref/access/entitlement/customer/provider writes and full migration stay
  prohibited.
- Read-only production freeze: 379 immutable student-lifecycle rows, max ID
  379, 156 distinct Heartbeat users, 71 current Party-linked source rows, zero
  userless rows and all 379 `source_asserted_unreconciled`. The minimized
  prefix fingerprint is
  `251fe76eed9db7710fbe7d96d11359f0c5231cd9f6cbd0c42ac4d1207642f955`.
- Local implementation: one default-off host transaction mirrors only the
  existing ledger into unverified/held receipts, same-environment receipt refs,
  Party-null held observations and version-1 open non-materializable candidates.
  It has no provider client/credential, accepted resolution, desired projection,
  command/attempt/readback, reconciliation/drift, customer or minion surface.
- Safety: transaction advisory lock, bounded ordered selection, exact receipt
  idempotency, source-contract validation, Party/ref before/after counts and
  zero accepted-fact/provider-attempt assertions fail closed. `/health` reports
  only aggregate state and must remain blocked on provider authenticity.
- Release controls: migration 167, a host/database/frozen-prefix read-only
  validator, and a fixed value-redacted environment transaction are immutable
  release inputs. Configuration defaults off and pins 500 rows/300,000 ms when
  enabled.
- Verification so far: focused 66/66 plus pinned Node 22.23.2 format,
  typecheck, build and documentation continuity pass.
  Disposable PostgreSQL proves 2+2 catch-up, four receipts/held observations,
  three candidates, exact zero-write replay, zero canonical/provider effects,
  and whole-batch rollback on unexpected provider authenticity.
- Full repository: 4,401 pass, 32 skip and 19 failures in the same five
  unchanged baseline files as D1; no identity-control-plane source/test failed.
- Independent bounded Sonnet/high R1 found one material latent health defect:
  a future userless source row could never be mirrored but would report
  `catching_up` forever. Health now distinguishes mirrorable remaining work,
  terminally blocks unsupported subjects and retains their exact unmirrored
  count. A real PostgreSQL regression passes; no second round is warranted.
- Review session `b975876c-b6cd-4369-9555-c236b2d3d617`: 11 turns,
  124,416 cache-creation, 375,736 cache-read and 17,476 output tokens (14,554
  thinking), no web request or subagent. The standalone usage reporter found
  no persisted transcript.
- Deployment/migration state is detailed below. Production is exact release
  `d99ca258`; migration 167 is live and populated only by the bounded D2 shadow.
- Rollback: disable D2 through the release-bound config transaction, reload,
  and restore the prior immutable release if needed while preserving append-only
  evidence. Populated migration rollback must refuse; the verified pre-167
  custom backup is the destructive recovery boundary.
- Documentation: `docs/IDENTITY-CONTROL-PLANE-D2.md`, Project Map, Security,
  Release Integrity, Business DB guide, Active Work and this changelog.
- Release: clean immutable artifact from commit
  `d99ca2589def4fc459fa129218ab83696b34b330`, source tree
  `cf952ed4db55d14f741de2475f4d258ce0867b09`, artifact SHA-256
  `416eec1baada64dde08573f627f75b0725a91ae12a01fc15051a70eb796a62b0`,
  1,360 files and archive SHA-256
  `4ff5eaa5e1a8f5926e9fb44656f98884a543c96f950ea81d789b9e05373402a2`.
  Local and fresh Mini extraction/runtime verification passed under Node
  22.23.2. The first release build correctly stopped on stale nested-runner
  dependencies; locked `npm ci`, runner build and 45/45 tests repaired the
  environment without changing source or dependencies.
- Backup/migration: mode-0600 complete custom backup
  `NC-20260913-003-20260914T030951Z/nanoclaw_business_pre_167.dump` is
  14,858,133 bytes, SHA-256
  `56f17f7e45ec8f5b716c0f5859e670b07e5f701d12d679fabedeae1988a361e5`,
  and has a readable `pg_restore --list`. Exact preflight pinned 379 rows,
  source prefix and zero target objects. Migration 167 committed; exact
  post-migration readback found 12 tables/one view/zero non-admin grants/zero
  target rows and unchanged Party/ref/source state.
- Disabled-first activation changed only the three immutable release pointers
  from `c190b957` to `d99ca258`; rollback plist
  `com.nanoclaw.plist.rollback-c190b957333a-2026-09-14T03-11-02-625Z` is mode
  0600. Health proved exact release/code root, connected Gmail/Slack, zero
  containers and empty queues while D2 remained disabled.
- Enablement changed only the fixed D2 enable/batch/interval keys through the
  release-bound value-redacted transaction; mode-0600 environment rollback is
  `.env.rollback-tandem-identity-d2-2026-09-14T03-11-34-067Z`. One bounded
  restart produced 379 unverified/held receipts, 379 Party-null held
  observations and 156 non-materializable candidates for 379 source rows.
- Live exact readback: zero unmirrored/promoted/linked/materializable/accepted/
  projection/command/attempt/readback/reconciliation/drift rows; Party 1,645,
  refs 5,596, claims zero and identity exceptions 1,196 unchanged. `/health`
  is intentionally `blocked/provider_authenticity_unreconciled` with no error.
  Immediate compiled replay scanned and inserted zero while retaining the same
  blocked score and zero provider attempts.
- Deployment boundary: no provider API/hook/config/write, Party/ref/access/
  enrollment/entitlement/customer projection, payment, certificate, booking,
  attendance, communication, or minion capability changed. D3 is not implied.

## 2026-09-14 — NC-20260913-002 Tandem Identity D1 disposable store

- Exact base: D0 completion `3c8e7d1c4a704f7952950aa86644b7d70c1ab8c9`
  on isolated branch `codex/tandem-identity-d1-disposable-20260913`.
- Change class: C5 identity/security and distributed-consistency contract,
  exercised only through C2 local source and generated disposable databases.
- Migration 167 extends the existing migration-137 Party/context foundation
  with explicit environment and effective manifest declarations, then adds 12
  admin-only receipt, related-ref, candidate, resolution, auth, desired
  projection, shadow command, prohibited attempt, simulated readback,
  reconciliation/snapshot and drift relations.
- Database enforcement covers manifest provider/environment/scope/entity/event
  matching; exact receipt replay and changed-hash conflicts; related-ref
  TEST/LIVE class segregation; append-only monotonic candidate lifecycle and
  materialization basis; resolution
  result/basis/Party coupling; append-only evidence; monotonic auth and desired
  versions; derived projection/idempotency hashes; command/projection FK;
  shadow write prohibition; canonical snapshot finalization; and complete,
  matching, still-fresh absence evidence.
- Disposable PostgreSQL 16.15 proof: deliberate mid-migration failure rollback,
  first apply, direct reapply, 12-table/one-view shape, admin ownership, zero
  non-admin grants, exact receipt replay no-op, one synthetic end-to-end chain,
  18 reason-matched negative contracts, transaction failure rollback,
  custom-format backup/restore with trigger readback, a two-client finalization
  race that refuses the late snapshot item with zero residue, populated rollback
  refusal, empty rollback, reapply and zero database residue. Reported provider
  attempts, production connections and residue are all zero.
- Bounded Sonnet/high R1 found one material constraint gap: ambiguous,
  not-found and conflict decisions could carry a foreign candidate ID. The
  target check now requires `candidate_id IS NULL` for that whole branch and a
  real PostgreSQL refusal proves it. The review's non-material note that an
  immutable candidate could not advance is closed with append-only monotonic
  candidate versions and constrained forward transitions; no second review is
  needed because both corrections are mechanically exercised.
- Codex additionally closed a post-review snapshot race: item insertion now
  holds a share row lock while validating an open run, so a concurrent terminal
  update either includes the committed item or causes the later item to re-read
  terminal state and refuse. The two-client PostgreSQL proof exercises the
  failure path; no second review is needed for this mechanically verified lock.
- Review session `c6b1a4b7-ff1c-4b83-a476-673059d030ce` used bounded Claude
  Sonnet/high with read-only packet access and one response-file write. The
  runner recorded 10 turns, 128,925 cache-creation, 195,198 cache-read and
  24,096 output tokens (21,325 thinking), with no web request or subagent; the
  standalone usage reporter found no persisted transcript.
- Verification so far: D0+D1 focused 52/52; format, pinned Node 22.23.2
  typecheck, build and documentation continuity pass. Full repository: 4,387
  passed, 32 skipped and 19 failures in five unchanged baseline files: Academy
  Capacity disposable state, CNPC prompt wiring, date-sensitive Trafft status,
  and two publication suites whose pinned Tandemweb fixture path is absent. No
  D0/D1 source or test failed. Bounded Sonnet/high review and corrections are
  complete. Final focused 52/52, disposable PostgreSQL, format, typecheck,
  build, docs continuity, absent release/runtime registration and zero-residue
  readback all pass.
- Commit/push: reviewed implementation
  `2ae0e7575e883573213fedfb1c3d531c15fcb345` is pushed on
  `origin/codex/tandem-identity-d1-disposable-20260913`; remote readback matched.
- State: `complete`. Source, disposable proof, independent review, corrections,
  verification, commit and push are complete.
- Deployment/migration: none. Migration 167 is deliberately excluded from the
  release bundle and has not been applied to production or any persistent
  database. No provider/customer/Party/ref/access/enrollment/entitlement,
  credential, runtime, communication, packaging or deployment state changed.
- Rollback: populated rollback refuses before deletion and requires a separate
  archival migration; empty rollback/reapply is proven. The private temporary
  backup and all generated databases are removed by the verifier.
- Documentation: `docs/IDENTITY-CONTROL-PLANE-D1.md`, Project Map, Business DB
  guide, Active Work and this changelog. The live structure-only schema
  reference is intentionally unchanged because production schema is unchanged.

## 2026-09-14 — NC-20260913-001 Tandem Identity D0 replay core

- Exact base: verified live release
  `c190b957333ac1901b2d46a1f4b3f1cf75c6341c`; the first empty worktree based
  on stale `origin/main` was removed before source edits.
- Added an unregistered pure TypeScript identity-control-plane package with
  strict scoped-reference/event/candidate/resolution/adapter/projection/
  shadow-command/reconciliation/drift/scoreboard contracts, canonical hashes,
  exact-ref and merge-lineage resolution, manifest and environment-class
  checks, complete/fresh snapshot gates, uncertain-delivery planning, temporal
  claims, explicit payer/learner roles, tombstones, split freeze, and derived
  synchronization health.
- The executable pseudonymous replay reproduces 12/12 accepted proof outcomes
  and 27/27 failure fixtures. It reports zero provider, Party, and access writes;
  plan SHA-256 `b93bb5057820992acfdad02343c394af29e6ebae3beb9bb61d5e04b09ccb9a30`
  and report SHA-256
  `157388051eebaead7745d00c548ab5ca48e7ee1290b02ce6ed120eb1743ac2b6`.
- Structural tests reject HTTP/network/PostgreSQL/Firebase/Google/provider-
  toolbox/child-process/environment imports and prove no host runtime import.
  D0 has no migration, service, consumer, runtime registration, provider
  credential, or external-write state.
- Verification on pinned Node 22.23.2: 47 focused tests; final typecheck, build,
  full-suite and documentation continuity rerun follows the review correction.
  The pre-review boundary had typecheck, build and
  documentation continuity pass. Full suite with D0: 4,371 passed, 32 skipped,
  20 failed in six unchanged baseline files; excluding D0: 4,334 passed, 32
  skipped, the same 20 failures in the same six files. Failures are existing
  Academy capacity disposable state, CNPC prompt wiring, date-sensitive Trafft
  freshness, and missing external Tandemweb catalog fixtures.
- Review: bounded Sonnet/high R2 found no mechanism defect. It found missing
  fixture coverage for weak/rejected authenticity, both reducer conflict
  branches, tombstone/accepted-subject/merge-cycle conflict, manifest
  scope/entity/event mismatch and duplicate snapshot facts. R17-R27 now execute
  every path; the unused parallel proof helper was removed. Corrections are
  mechanically verified, so no confirmation round is required. The successful
  review used forced `info`; its response artifact exists but the shared usage
  reporter has no persisted transcript, so numeric model usage is unavailable.
- Final verification after review correction: 47/47 focused, typecheck, build,
  formatting and documentation continuity pass. Full suite with D0: 4,381
  passed, 32 skipped, 20 baseline failures in six files. The D0-excluded run
  had 4,333 passed and one additional intermittent
  `student-enrollment-projection-disposable` failure; that exact test passed
  immediately in isolation. An earlier paired comparison had the same 20
  failures with D0 included/excluded. No D0 test or source failed.
- Commit/push: independently reviewed implementation
  `4b3ec286b9359b93ab1945478c7e679fe09b43ef` is pushed on
  `origin/codex/tandem-identity-d0-replay-20260913`; exact remote branch
  readback matches.
- State: `complete`. Independent review, corrections, verification, commit and
  push are complete. Deployment/migration are explicitly not applicable.
- Deployment/migration: not applicable and prohibited for D0. No database,
  provider, customer, payment, enrollment, access, credential, communication,
  runtime, or production mutation occurred.
- Dependency baseline: clean `npm ci` reports 38 existing findings (three low,
  15 moderate, 15 high, five critical). D0 changes no dependency or lockfile;
  exact reachability/remediation is preserved as separate unapproved program
  candidate `work:nanoclaw-dependency-vulnerability-reconciliation` rather than
  invoking `npm audit fix` under this task.
- Documentation: `docs/IDENTITY-CONTROL-PLANE-D0.md`, Project Map, Active Work,
  and this changelog.

## 2026-09-13 — NC-20260909-003 visible Commerce Bookkeeper receipt

- A recovered Live WordPress Commerce payment completed exact Payment Log,
  Student Roster and PostgreSQL readback, but the dedicated compatibility
  handler returned success without posting the mechanical receipt required by
  El Contador's existing AUTO contract. Live evidence showed one Adyen
  projection row and zero matching Contador channel messages.
- The handler now resolves exactly one registered `contador` group and posts the
  already-verified recorder summary before returning HTTP success. Missing
  registration or a send failure returns retryable 503 after the idempotent
  recorder, so the VPS job repairs rather than silently completing.
- The Stripe payment path, provider/payment authority, sheets/roster/PostgreSQL
  recorder, group prompt, and no-agent-spawn boundary are unchanged.
- State: in_progress. Source verification, immutable release, live health and
  one exact current-order message/readback remain pending.

## 2026-09-12 — NC-20260909-003 other-learner fulfillment, documents and AVS

- The first confirmed LIVE `other`-learner checkout proved payment and canonical
  enrollment, then exposed two independent post-payment defects. Heartbeat's
  exact-email lookup returns HTTP404 for a new participant, but the shared tool
  converted that normal absence to a hard failure; the projection retried
  `provider_lookup_failed` without creating access. Receipt and paid-invoice
  preparation still joined migration154's intentionally empty pre-payment Party
  columns instead of migration165's immutable paid materialization.
- Shared Heartbeat tool commit
  `c7537456de6c079ce21178e83e5d7509b597fbd3` invokes the API helper in the
  current shell, maps only confirmed404 to `{ok:true,data:[]}`, preserves
  structured non404 failures and removes the bounded temp response on every
  exit. Its mock contract proves404 empty,200 exact user and503 failure; a live
  nonexistent synthetic email also returns exact empty.
- `PgPaymentCheckoutDocumentAuthorityReader` now selects and joins payer and
  participant only through `payment_identity_materializations`; its existing
  caller/scope, single authorized payment, matching provider reference, active
  enrollment and retry-exception checks remain unchanged. The regression test
  requires the materialization join and excludes the old preparation join.
- Adyen's current ESD requirements make AVS data necessary for Visa interchange
  qualification. Tandem checkout commit `172676e44` configures Web Components
  v6 with `billingAddressRequired:true` and `billingAddressMode:'full'`. Card
  billing remains a separate Payment-step field from the optional company
  invoice address. JavaScript95/95, WordPress PHP85/85 and public Vite build pass.
- Nano focused33/33, broader payment/checkout526/526 and typecheck pass. The full
  repository recorded4,326 pass,32 skipped and19 unrelated pre-existing
  failures across five files outside this change. Bounded Sonnet/high R1 found
  and prevented the unsafe all-errors fallback. R2 confirmed the confirmed404
  wrapper, document authority and AVS config; its caller-scope note is closed by
  the final source diff, where `HeartbeatLiveMembershipDriver.find()` retains
  one exact-email call with no catch or name fallback.
- Post-deployment exact authority readback passed, but the receipt still failed
  before persistence. The generator derived invoice policy metadata whenever
  paid invoices were globally enabled, including while building a receipt; the
  receipt schema correctly rejects tax-policy metadata. Invoice configuration is
  now selected only for `paid_invoice`. The disposable PostgreSQL test creates a
  receipt with paid invoices enabled and proves all three tax-policy fields stay
  null with the receipt correction policy intact.
- A direct signed request through the deployed HTTP route returned unsigned401
  while direct document-owner preparation succeeded. The shared
  `PaymentRequestAuthenticator` allowlist omitted all three document paths even
  though the response wrapper and document controller included them. The exact
  prepare/download/email paths are now authenticated and each test proves a
  mismatched status path is still denied.

## 2026-09-12 — NC-20260909-003 TEST webhook lifecycle correction

- Corrected an overstated Level 3 completion claim. The initial official-card
  provider flow was Authorised, but the enabled Tandem TEST webhook returned
  repeated HTTP503 because its backend, filtering edge and reverse tunnel were
  terminal-session processes and offline. Restoring all three hops and retrying
  the exact event produced Adyen `Accepted`.
- The preserved TEST database was also behind migrations161–165, which explains
  its failed identity path and prevented ESD evidence storage. A private mode0600
  custom backup (606726 bytes, SHA-256
  `fdd0e8918a9efa8d76dbeccb82a9ab2cd6a0092c23af77340cabb11508d7bf32`)
  preceded successful application of all five migrations.
- A fresh full Tandem TEST checkout now has an Accepted Adyen AUTHORISATION,
  one durable payment event and `authorization_recorded` projection. It has no
  provider optimization evidence because Adyen did not include ESD validation
  fields; Level 3 scheme submission therefore remains unproven pending provider
  enablement/result evidence.
- Reusable TEST startup now advances complete missing 161–165 schemas and
  rejects partial markers. A new compiled TEST entrypoint verifies the immutable
  release before reading config or opening PostgreSQL/listeners, emits
  content-free errors and installs one-shot cleanup handlers. Focused tests pass
  66/66; independent Claude Sonnet/high returned `NO MATERIAL FINDINGS`.
- Immutable release `a14b679cdc1e10363137c78871f0f34d0afeafff` passed 805/805
  host tests plus 45/45 runner tests. Artifact SHA-256 is
  `9dd630a49139071c75add9d9de939454f5530aabfc7e8bfde9f01982dba9f3d0`
  across 1,312 files; archive SHA-256 is
  `abf20aade99bd2fa408c913eaec77aa2a3ac3b2d89c4f22966cfd1afe1a21143`.
  Studio now resolves its pinned production dependencies from the established
  shared `nanoclaw-releases/node_modules` location, while release integrity
  continues to verify the exact compiled artifact.
- Three launchd jobs now supervise the TEST backend, webhook filtering edge and
  reverse SSH tunnel. Forced restart changed all three process IDs and restored
  local listeners 3443/3444 plus VPS loopback15679. The public webhook route
  returned the expected HTTP403 for an unsigned probe after restart. Exact
  database readback for TEST attempt
  `638d2161-3abb-4b8e-9c8d-2fde220dabb7` remains one payment event with
  `authorization_recorded`, zero optimization-evidence rows and zero admissions;
  Adyen event `WHEL4293G22322235PXZSNM2DQ4D4J` records HTTP202 Accepted for PSP
  `XK4P3Z94BWW5KG75` at the Tandem webhook URL.
- A provider-originated redelivery after the forced supervisor restart created
  Adyen event `WHEL4299N2...V5MDDQ63JK` for the previously failed PSP
  `XH38KKJ9HKW9PPV5`; Adyen records the Tandem URL as Accepted at
  19:49:40.524 CDT. This proves the restarted supervised chain accepts authentic
  Adyen webhook traffic rather than only the unsigned HTTP probe.

## 2026-09-12 — NC-20260909-003 MCS Level 3 enhanced scheme data

- Replaced the disabled combined optimization with an exact server-owned Level
  3 profile for the US MCS course. One known invoice line carries product code
  `MCSFOUND`, description `MCS Foundations`, quantity 1, unit `EA`, UNSPSC
  `86132000`, exact quote original/discount/final arithmetic and zero tax.
  Required field bounds fail closed, browser identity is excluded, and the prior
  forced-authentication/no-challenge settings are not part of this change.
- Current Adyen v72 provider tests proved an API-version incompatibility rather
  than an arithmetic defect: v72 Session creation accepts flattened Level 3
  `additionalData`, but its browser `/payments` rejects it because v72 requires
  structured top-level `enhancedSchemeData`; `/sessions` in turn rejects that
  structured field as unknown. Checkout v69 retains the documented flattened
  Session contract. Only the exact MCS Level 3 path is pinned to v69; ordinary
  non-L3 Sessions remain v72.
- Provider proof used no LIVE transaction: the exact v69 TEST Session request
  returned HTTP 201, a direct official Visa TEST-card `/payments` returned
  `Authorised`, and the full Adyen Web Session/card flow also returned
  `Authorised`. The v72 browser control returned failed. Focused adapter,
  runtime, webhook/evidence and disposable database coverage passes 123/123,
  including malformed required fields, discount arithmetic, endpoint pinning,
  replay and encrypted-at-rest Session reuse.
- All 51 Adyen/payment/website-checkout test files pass 504/504. Independent
  Claude Sonnet/high reviewed the exact provider/version, arithmetic, PII,
  replay and environment boundaries and reported `NO MATERIAL FINDINGS`.
- Immutable release `94eafe1e004323a97d3f15b801acf9efdbaec13a` passed
  805/805 host plus 45/45 runner tests. Artifact SHA-256 is
  `2882c52e4af75325b383928c8559e1078bdafaf2a7373ea3876bbeb9a8d1a126`
  across 1,308 files; archive SHA-256 is
  `f5364f0b94d48bf747c7e7a20228c363bbfb5540f0bef450219ae8e856b92f8a`.
  Exact config validation, release verification, Mini health/readiness and all
  three release pointers pass after activation.
- A hidden isolated LIVE no-card proof submitted a valid $299 checkout and
  reached the empty Adyen card form, proving LIVE accepted the exact v69 Level
  3 Session request. No card data was entered. Guarded database readback found
  zero payment events and zero admissions; the one synthetic encrypted
  submission was then deleted and read back as zero retained. No payment,
  enrollment, document or email was created.

## 2026-09-12 — NC-20260909-003 immediate confirmation response repair

- The first natural successful simplified-checkout return proved payment,
  materialization and enrollment, but exposed a response-shape mismatch: status
  included the minimized purchase confirmation while the immediate return did
  not. That kept the browser on Payment and withheld the existing receipt and
  paid-invoice controls even though enrollment was complete.
- `/internal/payments/returns` now reads and attaches the same minimized,
  capability-protected confirmation summary used by `/status`, and only for the
  existing `confirming_payment` state. Review and terminal-nonpayment behavior is
  unchanged. The regression test asserts the exact returned summary and retains
  PSP/session non-exposure assertions.
- Focused payment tests pass 43/43, WordPress coordinator/BFF contracts pass
  111/111, typecheck passes, and independent Claude Sonnet/high review reports
  `NO MATERIAL FINDINGS`.
- Immutable release `d1704c301cb026265c9b4bbcee02f20254c1e57a` passed
  805/805 host and 45/45 runner tests. Artifact SHA-256 is
  `c87f129f882c98d58d9aaffd4ac664d74a69803a408842d0fc90a1f1873f145b`
  across 1,308 files; archive SHA-256 is
  `262bf54b84d646339ae8f88a72858009e248eeda22fb233f02d05d8c3e3aa46f`.
  Mini activated all three release pointers together and reports healthy/ready.
  The first sub-second probe correctly restored the prior release; the second
  activation waited for listener startup and succeeded.
- Production readback for the original successful attempt remains exactly one
  authorization-recorded projection, one admission and one active enrollment,
  with zero generated documents. Reloading its original browser tab recovered
  Confirmation, the exact $1 paid summary and all four receipt/paid-invoice
  download/email actions. No action was invoked, no email was sent, and no
  payment was replayed.

## 2026-09-12 — NC-20260909-003 Promo/new-learner incident and owner-directed simplification

- Local replacement implementation now defers all LIVE Party and fulfillment
  creation until exact authenticated card-payment eligibility. Migration165
  adds one encrypted, deletable checkout-submission payload and an immutable
  post-confirm identity materialization receipt. The payment worker purges
  terminal refused/failed submissions and expired submissions that never
  acquired a payment attempt; pending/ambiguous attempts retain their payload
  until resolution.
- Confirmed purchases deliberately insert a new payer/learner Party instead of
  email-deduplicating; replay of the same attempt returns the same
  materialization. Disposable PostgreSQL proves zero pre-payment Parties, two
  distinct confirmed Parties for two identical-email submissions, and failed
  PII purge without Party creation. The public browser now submits directly to
  the accepted Adyen Session, has no pre-submit status request or same-order
  successor retry, automatically discards unfinished setup, and returns a
  failed payment to its still-editable form.
- Deployment: immutable Nano release
  `60e1ff16ce04834e9374325ff69ee4a779a363b1` passed 805/805 host and 45/45
  runner tests; artifact hash `8ea482023fd2b3bd522116ebccd61cd97a31c85529876ae918a0b78e01d74d9f`
  across 1,308 files and archive hash
  `0b6681397c63e16b76b2127056e8bd19ae626ffc6b67a61eb8675b8bad194f59`.
  A 13,740,668-byte pre165 `business_v2` backup has SHA-256
  `8f24565cdc0524b4` and 1,813 catalog lines. Migration165 applied and read back
  both admin-owned tables with zero submission/materialization rows; the exact
  release is healthy and ready on Mini.
- Tandemweb checkout implementation `e4ada3df99299ec95150dfead1644b5b649eb1e5`
  is live in current descendant `08c46677849c854f4f7b97dcb5ddd968cc062b09` after design/catalog
  gates plus LiteSpeed and Cloudflare purge. The direct checkout serves JS
  `c21dd2d406c60cd7`, step links have no underline, Apply code is present, and
  an untouched form has no status error or console log. A synthetic no-card
  submission opened the $299 Adyen form and showed its exact receipt email;
  PostgreSQL readback at that boundary was one encrypted submission, zero
  materializations and zero matching Party/interactions. Back unlocked the
  Information form and the 95/95 browser suite includes delayed email-field
  replacement/restoration. No card data or payment was entered. The exact
  synthetic temporary PII was deleted and final submission/materialization/
  Party counts returned to zero. Main MCS still reports
  `data-new-routing="0"`; the next natural purchase remains outcome proof.
- Independent Claude Sonnet/high R1 found one material cleanup race: any old
  terminal sub-session could purge PII while a successor on the same attempt
  remained live. The corrected query requires a current refused/failed
  projection and terminal proof for every operation. Return/status also retain
  authenticated payment truth when fulfillment must retry. R2 reported `NO
MATERIAL FINDINGS`. R1 used 13 turns, 180,869 cache-create, 574,417
  cache-read and 21,422 output tokens; R2 used 11 turns, 90,126 cache-create,
  509,053 cache-read and 12,843 output tokens.

- A LIVE buying-for-someone-else attempt with a new learner email stopped
  before Payment. Production PostgreSQL logged `type "citext" does not exist`
  because the schema-qualified Party function was called with an unqualified
  `$2::citext` cast while the payment transaction pinned
  `search_path=pg_catalog`. The caller now passes the parameter without a
  textual cast, letting the function's stored argument type resolve
  independently of search path.
- Multiple canonical Party candidates for one email no longer block a
  deliberate purchase; the exact-token/different-email replay conflict remains.
  Every later deliberate checkout remains a distinct order/enrollment even when
  the entered details repeat.
- Focused identity unit and disposable PostgreSQL suites pass19/19; typecheck
  and diff check pass. Tandemweb owns the separately reviewed Apply-code and
  field-preserving copy changes.
- The owner rejected the broader pre-payment state machine. The accepted Peri
  decision now requires one editable validated form plus a temporary encrypted
  submission before payment, then Party/order/document/enrollment materialization
  only after confirmed Adyen payment. Terminal unconfirmed submissions purge
  temporary PII; ambiguous provider outcomes remain held until resolved. This
  replacement is implemented locally and remains pending full verification,
  independent review, migration, release and live readback.
- Deployment: pending immutable release and live non-payment verification.
- Rollback: retain the current `7ab97df4` checkout release and main-page Stripe
  routing until the reviewed replacement is proven on the direct canary.

## 2026-09-12 — NC-20260909-004 Optional business address line

- The MCS business billing contract now accepts a complete street address with
  an empty apartment/suite line. Both request normalization and immutable
  document snapshot validation retain the bounded empty string, and paid
  invoice rendering omits the separator when that optional line is absent.
- Focused billing/document/identity verification passes 28/28; typecheck and
  build pass. Full root verification passes 4,318 with 32 skipped; two
  unrelated date/data baselines and one known CNPC wrapper baseline remain,
  while two parallel disposable timeouts passed immediately in isolation.
  Website review and deployment evidence are recorded in Tandemweb and Peri.

## 2026-09-12 — NC-20260909-003 MCS receipt and paid-invoice document self-service

- Production v2 release: immutable `d160195d660fd0d1ca777bb59718954f459bcbe7`
  passed805 host and45 runner release tests with source tree
  `819ca85cbc559a35`, artifact SHA-256 `1524fda61e73778d`/1,308 files and archive
  SHA-256 `3a1233190a3bc712`. A fresh 13,633,637-byte `business_v2` custom backup
  (`business_v2-pre164-2026-09-12T16-00-00-Z.dump`) has SHA-256
  `5510fcc9b6b2db17` and1,786 verified catalog lines. Migration164 applied only
  after zero document/email rows and now exposes two admin-owned tables, six
  enabled immutability/purge guards, five required retention columns, one
  admin-owned SECURITY DEFINER purge function, zero non-admin grants and zero
  rows across documents/capabilities/email/sequence/hold/tombstone state.
- Activation: the first attempt updated only the executable pointer, correctly
  failed the expected-release/code-root integrity gate and automatically
  restored the prior config/plist/service. The corrected attempt atomically
  aligned executable, expected commit and code root, then loaded schema164 and
  the owner-approved paid-invoice hash `abafcfa00d934e37`. One exact process is
  healthy/ready; the current private config/plist hashes are
  `3761c072cf70aa1f` and `22398e745b87f75d`. The prior config/plist and database
  backup are retained privately. No document row or invoice number was created.
- WordPress/live UI: merged source/main/VPS `f439cece659e` preserves newer main
  work and the existing untracked VPS files. Hosted design-system CI
  run34703698118 succeeded; cache flush/warm and both public routes return200.
  Live assets are JS `b177b029e4888219` and CSS `c01a946b71d586b7`. Hidden
  desktop and390x844 browser checks pass all four checkbox combinations,
  conditional-section visibility, step renumbering, disabled incomplete
  submission, Back preservation, no mobile overflow and zero console warnings/
  errors. Payment stayed hidden and no provider Session/payment/email/document
  side effect was created. Natural post-payment proof remains owner-operated;
  ordinary MCS traffic remains Stripe.
- Owner-approved v2 source adds two independent Information-page gift/business
  choices, one conditional Additional details page with active-section-only
  validation and dynamic step numbering, immediate automatic-capture Paid
  document semantics, factual `Tax: $0.00 USD` without a legal classification,
  seller-EIN omission, the approved Red Oak seller address, and polished
  Tandem-logo receipt/invoice PDFs. Migration164 pins the seven-year retention
  window, append-only legal-hold events, exact Gmail-first deletion, local
  encrypted PII/PDF/recipient purge and a minimal immutable tombstone that
  prevents document regeneration.
- Review: bounded Sonnet/high R1
  `4524cde9-7fc3-475a-9ec9-635cc304ea00` found a caller-settable purge-GUC
  bypass and silent/dedup-blocked retention failures. Both were corrected.
  Combined correction/checkout R2
  `1a378ade-390c-4608-a56a-a1c642bea079` verified the database correction and
  reported no checkout-flow material finding. Its sole remaining reporting
  branch omission was a low-impact one-line correction with direct regression
  coverage; no third Claude round was used. R1 measured5 calls/87,500 cache-
  create/194,166 cache-read/29,929 output/max92,341 context; R2 measured4 calls/
  83,756 cache-create/145,475 cache-read/24,114 output/max93,643 context.
- Verification before release: pinned Node22.23.2 doctor/typecheck/build/format/
  continuity pass; focused backend46/46 including populated rollback refusal,
  direct old-GUC bypass refusal, legal hold/release, seven-year purge,
  tombstone/regeneration refusal, duplicate deletion evidence, failure
  reporting and shutdown types; frontend85/85 plus PHP26/26 and7/7; full root
  4,317 pass/32 skip/4 unchanged unrelated Capacity/CNPC/Trafft failures. Two
  deterministic production-renderer PDFs pass Poppler render/text inspection.
  No payment, email, document row, invoice number, migration, private config,
  release or website deployment occurred in this source/review phase.
- Source: migration163 plus `payment-checkout-documents.ts` add one immutable
  encrypted snapshot and separately encrypted deterministic PDF per verified
  English MCS attempt/document kind. Receipt self-service is enabled; paid
  invoice numbering remains disabled unless a private finance/legal activation
  digest binds seller/address, annual sequence, tax jurisdiction/policy,
  retention and replacement-or-credit-note correction rules. Missing
  pre-payment business details still refuse invoice issuance.
- Access/delivery: download requires the existing exact-attempt checkout
  capability plus a new opaque document capability with a maximum 15-minute
  lifetime. WordPress receives the PDF only through the signed private POST
  envelope and validates kind, number, filename, MIME, bytes and SHA-256 before
  making a local browser blob. Email jobs bind one encrypted recipient and
  content/PDF hash, reconcile Gmail Sent before retry, attach the exact PDF, and
  require message/thread/header/filename/attachment-digest readback; unknown
  acceptance holds without resend.
- Review: bounded Sonnet/high R1 `4bc7973b-aa5b-40bf-8ae6-a1f0aecab4ca`
  found a missing live-loader activation-hash check and inconsistent theoretical
  PDF/response ceilings. Both were corrected; narrow R2
  `f1c2c183-7587-46ed-8eb3-441d49795d6d` returned GO. Root then found that the
  browser WOFF asset produced invalid embedded-font warnings in Poppler,
  replaced it with the OFL Roboto TTF package, and proved exact extracted text
  including `José Žagar`. R1 used 9 model calls, 244,030 cache-create,
  1,005,000 cache-read, 24,451 output and 248,871 maximum context; R2 used 8
  calls, 113,830 cache-create, 533,145 cache-read, 8,222 output and 123,717
  maximum context. Both exceeded the 100k bounded-review target; R2 also read
  migration163 outside its declared four source paths. No credential, provider,
  database or external-write surface was available to either review.
- Verification: pinned Node22.23.2 focused 12 files/143 tests pass, including
  generated disposable PostgreSQL empty rollback/reapply, five-way contention,
  unique invoice sequencing, encrypted-at-rest proof, populated rollback
  refusal, cross-attempt capability denial and lost-ACK adoption. Typecheck,
  build, formatting, runtime doctor and documentation continuity pass. Full
  root is 4,313 pass/32 skip/4 fail: one parallel-only Capacity disposable
  timeout passes in isolation; the remaining Capacity/CNPC/Trafft failures are
  the unchanged baseline. Tandemweb prototype is 85/85; affected PHP is
  61+69+26+44+58+17 pass; both production bundles were rebuilt. No payment,
  email, invoice number, document row, config, migration, release or website
  deployment occurred in this local verification phase.
- Pre-activation correction: immutable archive `ece233ad` verified its manifest
  after installation on Mini but its CLI help probe failed because the release
  layout intentionally relies on an established parent dependency tree and did
  not contain the three newly introduced PDF/font packages. No supervisor,
  config, schema or traffic pointer changed; live stayed healthy on `e3c21b9e`.
  The replacement build now embeds the OFL Roboto TTF and bundles only pdf-lib,
  fontkit and their pinned transitive libraries into the one compiled document
  module. `scripts/bundle-payment-documents.mjs` rejects unexpected bundled
  packages and the release includes the font license. The compiled checkout CLI
  now runs without those packages installed in its release/parent runtime.
- A second pre-activation archive at `ea7fcdb8` exposed that the immutable
  builder invoked TypeScript directly after the ordinary build had bundled the
  module, replacing the bundled output before packaging. It also passed manifest
  verification and failed only the help probe; production again remained
  unchanged. The immutable builder now invokes the checked bundler immediately
  after its own TypeScript compile and before the existing help/refusal probes;
  the release contract test pins that order.
- Production release: immutable `b0c2ca2d1ab5` passed the 805-host/45-runner
  release gate with artifact SHA-256
  `afcf910b81998c100cfcaf6ca027c099d2ad27928a2d395366ff1174835856bf`
  and archive SHA-256
  `9c8a1c70f3f41ba1b8a0378f1b352134b834be4941a8ba9b8a563c6e4cf1365d`.
  A fresh complete `business_v2` custom-format backup was verified at
  `2f327587f86bc9d7159d50720733178805b9e41ca711bf459222c34943bc3004`
  before migration163 applied. Readback: five admin-owned relations, four
  enabled immutability guards, zero non-admin grants, and zero document,
  capability, email-job, email-receipt or sequence rows. The owner-only config
  now pins schema163, enables five-minute receipt downloads, and keeps paid
  invoice false. The active service runs exact `b0c2ca2d`, health/ready pass,
  the earlier owner-test exclusion remains exact, and rollback config/plist
  hashes are retained privately. No document, invoice number, email or payment
  was generated.
- WordPress/live UI: tandemweb feature/main/deployed `5f0e1c65d` passed hosted
  design-system CI run34696979482. Purge/warm and public200 verification passed.
  Live source hashes match the repository; the HTML contains four separate
  hidden Confirmation actions, public assets are
  `f9d36487373aeb62` JS and `4ba1c7287d46d510` CSS, USD299 renders, identity and
  Terms are blank/unchecked, status is empty, and the hidden in-app browser has
  no error/warning console entries. Post-payment document generation remains
  naturally unverified pending an owner-operated transaction; general paid
  invoice issuance remains finance/legal blocked.

## 2026-09-12 — NC-20260909-003 MCS confirmation and provider contracts

- Added the exact English MCS Adyen Session optimization profile: bounded
  PII-free attempt/quote/offer metadata, one authoritative line item, truthful
  zero-tax Level 3 fields, and checkout-scoped authentication with a
  no-challenge preference. A real unused TEST Session first identified and
  rejected unsupported `merchantRiskIndicator`; the corrected v72 request
  returned HTTP201 and the disposable store was removed without payment.
- Standard-webhook ESD and 3DS additions are unsigned supplemental evidence.
  Root corrected the initial implementation so these values never enter
  `PaymentFact`, payment fingerprints, projection or Confirmation. Migration162
  stores them separately as append-only admin evidence with populated rollback
  refusal. Migration161 adds paired digest/encrypted optional business-billing
  fields to immutable identity preparation; raw company/address/tax values are
  absent from WordPress persistence and provider metadata.
- Capability-protected status now returns a server-verified purchase summary
  only from one conflict-free authorization projection. It exposes exact
  offer/amount/currency, server-recorded time and a SHA-derived Tandem reference,
  never the PSP reference. Tandemweb renders the new Confirmation step and
  offers collapsed optional business-invoice fields.
- Sonnet/high bounded R1 `d89bd350-5dc6-40f6-852f-a5396f5a6226` returned GO;
  root independently found its mistaken unsigned-fact conclusion and made the
  load-bearing separation. Narrow R2
  `22dfc638-172e-4c83-8f29-c7b2d5ff5ad1` returned GO. R1 used five model calls,
  332201 cache-read and 24911 output tokens; R2 used four calls, 162011
  cache-read and 14753 output tokens. Both exceeded the 100k context target,
  recorded as orchestration warnings rather than hidden.
- Focused payment/runtime tests pass130/130; frontend tests pass83/83 and
  affected PHP contracts pass. Pinned Node typecheck/build/format/continuity
  pass. Full root:4295 pass/32 skip/5 fail; the two parallel disposable
  timeouts pass3/3 alone, and the three established unrelated Capacity/CNPC/
  Trafft failures remain. Invoice numbering, PDF generation and document email
  activation remain behind finance/legal acceptance. No real payment,
  customer email, fulfillment replay or Stripe routing change occurred.
- Release: NanoClaw `e3c21b9ebfc2ecc9ff6dd211bab9be924c001959`
  passed the immutable 803-host/45-runner gate and is live on the dedicated
  checkout service with `/health` and `/ready` passing. Fresh full backup SHA
  `d4bd91e589092d992fcad779af41c5ff10cde90384e93747a514355139f19cec`
  preceded migrations161-162; production readback is two billing columns, one
  admin-owned supplemental table, zero new rows and zero non-admin grants.
  Tandemweb `8c02c38a0cf8d0a3df17e5b0eae8fc3b750eaa49` is live on the VPS.
  Hidden-browser readback showed USD299, all three steps and the complete
  optional invoice disclosure without entering data or creating an intent.

## 2026-09-11 — NC-20260909-003 LIVE shared-feed filter wiring correction

- Root deployment inspection found that the standalone LIVE receiver omitted
  and its composition prohibited the existing verified-foreign-reference
  filter. Unrelated shared merchant events would403/retry. LIVE now requires
  and supplies that flag; the existing whole-batch HMAC/merchant checks,
  owned store/correlation validation and durable event admission are unchanged.
- Regression covers no-storage foreign success, mixed invalid HMAC, wrong
  merchant, owned validation failure and valid owned storage dispatch.47 focused
  tests, typecheck and continuity pass. Full run:4281 pass/32 skip/5 failures;
  two disposable timeouts pass3/3 under a one-worker rerun. The same unrelated
  Capacity, CNPC prompt and Trafft shadow failures remain, not a green suite.
- Narrow Sonnet/high follow-up86d5abf1-ce16-41e6-a5a1-b0e970471588 found no
  material defect in filter correction or ten-path deployment helper. Root
  independently verified parser ordering/storage behavior. LiteSpeed contexts
  can prefix-match; exact application route rejection remains the boundary,
  notwithstanding review prose calling them exact matches.
- Migration146–160 already applied frome289799e with15 individual readbacks;
  28 new tables empty/admin-owned, grants0, old40/40/40/0 counts unchanged.
  No additional schema change in this correction. Dedicated receiver not yet
  running, provider hook inactive, public MCS stillStripe. Final immutable
  installation and live foreign/provider proof remain separate requirements.

## 2026-09-11 — NC-20260909-003 authorized dedicated LIVE release preparation

- Owner authorized the English MCS Foundations one-time-card rollout. Added a
  compiled standalone entrypoint, exact migration146–160 release inventory,
  inert service/tunnel templates, full immutable startup verification, and
  distinct release-integrity diagnostics. Corrected LIVE readiness to check
  the actual payment_request_nonces table; genuine disposable schema passes.
- Corrected receipt delivery to distinguish the authenticated Gmail profile
  from its existing accepted Send-As alias. Real read-only profile/list/get
  metadata verified the configured identity; no sender, OAuth scope or email
  was changed. Exact From/Sent readback and existing write guards remain.
- Sonnet/high release R1 and R2 completed; application, routing, alias, loader,
  TLS and packaging changes have no unresolved material findings. R2's
  observational migration-helper receipt-order gap was mechanically fixed and
  verified with four forced-success/failure cases without changing SQL/guards.
  Evidence is under Peri output/mcs-ready/live-rollout/REVIEW-DISPOSITION.md.
- Root checks:339 payment/checkout/release-integrity tests passed; prior41
  packaging/readiness tests, typecheck/build and plist syntax passed. This does
  not erase the previously recorded unrelated whole-repository failures.
- Runtime remains unactivated: dedicated service will use existing operational
  CWD for canonical env/Gmail/Heartbeat dependencies, a new full-commit code
  root, separate logging, and strict loopback tunnel. Main release7a3fe6b3 and
  its critical shared dependency blobs remain unchanged. No production DB,
  checkout service, email or payment operation has occurred at this boundary.
- Independent infrastructure proof: valid certificate now serves the exact
  webhook vhost, with global listener/DNS unchanged; normal direct/public TLS
  checks passed. Dedicated restricted runtime credential and inactive webhook
  are prepared privately. WordPress72-table backup verified. These facts are
  not payment, fulfillment, reporting or public-traffic completion claims.

## 2026-09-07 — NC-20260907-001 supervision repair and product identity bridge

- Exact live case 63 repaired through the deployed host: CSS row 6 verified,
  Sales placeholder cleared, Payment Log row 469 and one PostgreSQL payment
  read back. Lifecycle enqueue suppressed; no communication or capacity change.
- Implemented versioned, account-scoped product bindings referencing existing
  entitlement offers/provider IDs. The first migrated population is the two
  supervision offers; changed names no longer select their destination.
  Mixed, missing companion, scope, projection and incomplete-source conflicts
  hold registration while preserving independent accounting receipts.
- Added an identity coverage audit and cross-provider ownership contract.
  Full local checkout snapshot: 47 total / 37 active / one active canonical
  route / 36 explicit coverage gaps; missing mcs-full requires reconciliation.
- Tests: 85 focused pass; full 3630 pass / 32 skip / two unchanged CNPC/Trafft
  failures reproduced on f5adc8cc. Typecheck, catalog and continuity pass.
- Sonnet/high R1 no material findings; Codex separately closed the Checkout
  unread-PI catch path; narrow R2 verified the correction with no further
  material findings. Source is ready for commit/release; deployment evidence
  will be appended after immutable activation and live verification.

This is the shared, append-only engineering and operations record for Claude
Code, Codex, and human collaborators. It records change evidence, not product
marketing.

Protocol: `docs/CHANGE-PROTOCOL.md`

## Unreleased

### 2026-09-11 final isolated TEST acceptance

- Deployed the reviewed English MCS card stack only to the preserved isolated
  TEST fixture: migration159 exact adjacent/same-attempt lineage, 11-event edge
  and backend parity, v2 attribution, September 11 Terms, exact retained-v1 HTTP
  replay, webhook/Session-result method convergence, retry/pre-submit fencing,
  canonical enrollment and the owner-approved Heartbeat driver. LIVE remains
  default-off and unchanged.
- Review path was explicit. R1 `e765b90a-8dad-4ad9-a471-c26bea17037f`
  (Sonnet/high: 3 calls; 6 input; 45,338 cache-create; 41,267 cache-read;
  17,870 output; maximum context 46,878) found cross-attempt retry-lineage DDL.
  Corrected R2 `394c52d0-431f-44ba-ab81-bf03bb4eb6f4` (3 calls; 6 input;
  39,389 cache-create; 28,317 cache-read; 24,900 output; maximum context
  40,929) returned `NO MATERIAL FINDINGS`. Native-defect review
  `139235e8-8b73-467b-9ebf-8c080c95d2e0` (3 calls; 6 input; 34,033
  cache-create; 21,061 cache-read; 17,101 output; maximum context 34,035)
  raised only a conditional cross-attempt concern; actual table uniqueness
  constraints made it moot, leaving no unresolved verified material finding.
- Final fresh native TEST completed official simulator 3DS and persisted one
  verified Session result, one successful HMAC authorization, one card binding
  with exact webhook operation/sequence provenance, current Terms/v2
  attribution, one active canonical enrollment/component and one verified
  Heartbeat projection. Owner CLI independently confirmed the exact QA user is
  in the target group and still has 13 total memberships. One status reload
  created no duplicate. Two earlier global conflicts remain preserved.
- Test-only fixture corrections added actual migration157 before159 and changed
  binding-tamper coverage to flip decoded ciphertext. All payment/checkout tests
  pass 433 with 8 skipped and 0 failures; typecheck and diff checks pass. The
  last broad suite retained established unrelated and parallel-only failures,
  so no globally green CI claim is made.
- This acceptance proves TEST authorization/result/method/enrollment/group
  membership, not settlement, receipt/welcome email delivery, learner login,
  course activity, certification, or LIVE/production readiness. No LIVE config,
  schema apply, provider charge, deployment or production activation occurred.

### 2026-09-11 addendum — terminal card retry, source-only

- Added tentative local migration 159 and a bounded three-Session chain. The
  same immutable attempt/quote/attribution survives; each successor consumes
  one exact authenticated terminal receipt for its predecessor.
- Added purpose-separated encrypted return bindings, strict signed `-s2`/`-s3`
  webhook correlation, stale predecessor late-positive diversion, and the
  signed private `/internal/payments/session-retries` contract. Expired quote
  returns reconfirmation without provider I/O.
- Enrollment now keeps the original commercial attribution operation while
  requiring method/event evidence for the latest Session operation. Retry
  exceptions gate enrollment, Heartbeat access, and Gmail notice authority.
- Disposable full-service proof covers refusal, explicit successor success,
  original attribution/price/promotion preservation, canonical enrollment/
  access, and a stable notice-owner key. Focused 172/172 plus 36/36 pass;
  typecheck/build/format/diff pass. Full suite 4,246 pass/32 skip with the three
  established unrelated baselines plus one parallel-only capacity-shadow
  timeout that passes alone.
- Bounded Sonnet/high R1 found one material post-success replay ordering defect;
  it was fixed and regression-tested. R2 returned `NO MATERIAL FINDINGS`.
  Nothing was applied to a real database or provider/runtime/config, and no
  payment, enrollment/access, message, commit, push, or deploy occurred.
- Root independently found a later material migration159 upgrade defect: its
  additive backfills ran through immutable legacy result/reference/event
  triggers and would fail on populated data. The correction disables only those
  named triggers inside the migration transaction, restores/verifies them before
  commit, and changes no prior business/cipher/state/version field. A populated
  verified+conflict+event fixture proves exact preservation, restored
  immutability and rollback refusal 2/2. Review is pending under the stopped
  review-authority gate.
- Added the signed private exact-binding pre-submit check with no card fields,
  Session creation or provider call. It consults the backend new-payment kill
  gate and current chain/evidence under lock, allowing original/current
  successor Sessions and blocking stale, positive, late-positive, pending,
  unknown, expired or unavailable state. Focused 28/28 pass. It narrows but
  cannot eliminate the issued-capability/check-to-submit race; review is
  pending root's next explicitly approved packet.

### NC-20260909-003 — Admit only HMAC-verified Adyen TEST payment events

#### 2026-09-11T13:13Z addendum — environment-explicit core and inert LIVE composition

- State: `validating`. Source is uncommitted/unpushed on base `1a1f3b8d`; this
  addendum extends the current dirty English-card task without publishing or
  activating it.
- Added one reusable provider/runtime core while preserving the prior TEST
  exports and TEST service. Environment selection now owns exact endpoint,
  credential purpose, HMAC envelope, scope and correlation namespace. LIVE can
  construct only `{validated-prefix}-checkout-live.adyenpayments.com` v72 and
  reserves the appended suffix within the DNS-label limit.
- Added a source-only `createPaymentLiveRuntime` fixed to
  `tandem-wordpress-live`, `tandem-wordpress-commerce-v1`,
  `mcq-program-a-foundations:en-US`, card, LIVE/eu and canonical HTTPS return
  origin. All activation flags are explicit and default off. New starts require
  enabled+recovery; recovery-only preserves status, return reconciliation,
  original-provider dispatch/reconciliation and owned webhook intake.
- Generalized the one canonical HMAC/event store for LIVE without adding a
  parallel ledger. LIVE requires all 11 existing card reducer events and
  hash-only retention for verified owned unsupported events; TEST/LIVE keys,
  envelope flags, merchant/store, scope and reference prefixes fail closed.
  Settlement and fulfillment remain unproven and unchanged.
- Verification under pinned Node22.23.2: focused provider/runtime/event suites
  134/134 pass; typecheck/build pass. Final full root run is4183 passed/32
  skipped with the same three established unrelated failures plus one parallel
  disposable timeout; the timeout immediately passed2/2 alone. `git diff
--check` passes.
- Sonnet/high bounded R1 used Read/Write with strict empty MCP over49,844
  request/evidence bytes. Its two confirmation questions were independently
  resolved: the unchanged full scope fingerprint pins provider/region/store,
  and the exact offer key matches the current publication/service. Codex then
  added canonical HTTPS origin, quote-authority and complete DNS-label
  hardening; narrow Sonnet/high R2 returned `NO MATERIAL FINDINGS`. R1 session
  `a0795b3e-4d43-4e4a-83de-288760335092`:4 calls, input8/cache-create74454/
  cache-read129128/output21597, max context79295. R2 session
  `2ca93784-8de4-4fb9-8af7-484e12c4c39e`:4 calls, input8/cache-create30154/
  cache-read108522/output6596, max context40041. Neither used shell, network,
  MCP, secrets, settings or repository write access.
- Deployment/migration: none. No listener/public BFF/frontend, private config
  reader, migration, provider request, production database, payment,
  publication/fulfillment lowering, commit, push, deploy or activation.
  Managed-host composition, public WordPress checkout, activated English
  publication, production Heartbeat/receipt delivery and external readiness
  gates remain unresolved.

#### 2026-09-11T02:57Z addendum — executable English card TEST service

- State: `validating`. Source is uncommitted/unpushed on exact base `1a1f3b8d`;
  root retains exact diff acceptance and tentative migration156 namespace
  authority before any source publication.
- `createWebsiteCheckoutTestService` is the first complete listener-ready
  disposable composition: signed Session/resume/return/status, signed identity,
  same-route checkout/attribution/enrollment admission and native HTTP HMAC event
  intake. It permits exactly `mcq-program-a-foundations:en-US`, card and
  TEST/eu/full Store Reference scope. It creates no listener and reads no
  environment/default database.
- The existing `/enrollment-admissions` command adds the exact six-field
  WordPress attribution handoff. Canonical base64/UTF-8/hash, strict nested
  schemas, request fingerprint, trusted field-map ID/hash and every overlapping
  snapshot/binding/attempt/quote/identity/Terms/privacy value are checked before
  immutable checkout evidence. Exact canonical bytes are encrypted with distinct
  AAD; no raw tracker token, contact, payment field, role proof, capability or
  promotion code is stored or returned.
- Same-body/business-operation replay with a fresh transport nonce returns a
  stable checkout receipt and moves enrollment held->accepted->duplicate after
  authenticated card result and signed authorization. The promotion verifier
  uses the reviewed PHP shape, exact originating Session operation and
  `adyen_card_authorization_v1`; it requires a host-configured promotion policy
  and durable card enrollment. Unlimited promotion redemption may be null;
  limited/restricted reservation remains bound by quote fingerprint. No-promo and
  regional-only policies return null.
- The hard-TEST launcher pins actual WordPress quote authority
  `tandem-wordpress-commerce-v1`, permits webhook-disabled and TEST-capture-
  unverified startup without inventing either proof, and keeps enrollment held.
  Its private manifest preserves the exact guarded disposable database across
  stop/restart and configuration update. Only explicit `--cleanup` can drop that
  exact inactive, current-user-owned fixture.
- Tentative local-only migration156 adds one immutable admin-only encrypted
  attribution row with exact checkout/capability FKs and unique operation,
  attempt, snapshot and binding identities. Empty rollback/reapply passes and
  populated rollback refuses. All fetched refs had max migration155; root has
  not yet granted global namespace publication or any production apply.
- Cross-project vector: exact WordPress file SHA-256
  `846f3b4d81ff6c882803709fe1ae026efabcc84af08fecce516766bd73ae5663`;
  strict Node readback decoded snapshot
  `afff1fa4e3268309990ab749c012e6092fe3333418fb72460593522c47bea317`
  and binding
  `23da9601d0181defcd1c1c34918c776eb7862dcbc1e91e9a3e846938eb5ad690`,
  identical to PHP's 31/31 fixture proof.
- Verification under Node22.23.2: focused13 files/79 pass, including complete
  disposable HTTP/PostgreSQL service2/2, promotion matrix7/7, webhook HTTP2/2,
  runner parser7/7, sanitized CLI failure1/1 and actual persistent PostgreSQL
  restart/config-update/cleanup1/1. Full4158 passed/
  32 skipped/the same three established unrelated failures (Capacity reserved
  seat, CNPC wrapper string, date-sensitive Trafft). Whole-tree typecheck, build,
  exact-source formatting and diff check pass. Continuity intentionally reports
  168 active/ready rows and 163 changelog entries and passes with the two
  local-only migration files staged solely for trackability.
- Sonnet/high R1 found one material missing caller pin in the promotion receipt
  join. The correction uses the actual enrollment `checkout_caller` both in the
  attribution join and bound filter; R2 returned `NO MATERIAL FINDINGS`. R1
  session `04e00394-c47b-40b1-aabc-1fd9c4e48a23`:8 calls, input16/
  cache-create112829/cache-read487339/output28291, max context117670 and one
  bounded-context warning. R2 session `ee93251b-2d4b-445a-b3b1-55ef4b86312e`:
  6 calls, input12/cache-create51493/cache-read242220/output4294, max context61380,
  no warnings. Both used Sonnet/high, `Read,Write`, empty strict MCP and no shell,
  network, Git, secrets, settings or raw logs…171648 tokens truncated…s when Slack
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

## 2026-09-10 — NC-20260909-003 bounded HTTP and immutable recovery

- Added an explicit injected TEST runtime and Node HTTP adapter with bounded
  body/deadline handling and no default listener, pool, environment discovery or
  LIVE path. Added canonical card/ACH attempt capabilities and es-419 quote
  identity support with explicit provider presentation mapping.
- Independent Sonnet/high method and HTTP reviews each found a material issue:
  current configuration could block existing recovery, and early stream error
  paths could escape request handling. Fixed both; each narrow R2 accepted the
  correction with no material findings. Original operation bytes and provider
  identity survive new-attempt disablement; reconciliation-only stops dispatch.
- Verification: 246 payment-focused tests pass; Codex independently reran133
  changed-boundary tests and typecheck. Real disposable PostgreSQL and HTTP
  cover concurrency, immutable recovery, configuration rollback, size/deadline/
  abort and late errors. Default full suite: three established baseline failures
  plus a DB-contention timeout that passes isolated; bounded full rerun required
  after dependency integration. No claim of a clean full suite yet.
- Deployment: none. Live Stripe and existing inert TEST receiver unchanged;
  this source is only one slice of the MCS deploy-ready build. No production
  migration, student action, payment, message or certificate issued.
- Evidence: Peri output/mcs-ready/backend-method-review/ and
  backend-http-review/ contain exact requests/responses; Peri program revision54
  tracks remaining source/provider/preview/fulfillment gates separately.

## 2026-09-10 — NC-20260909-003 reviewed enrollment source dependency

- Imported73 exact reviewed dependency paths at d9e29856 from source commits
  6952442c,86141afa,ef52b51d,a46ecfe2,deaab99c; included canonical store/admission/
  projection contracts and migrations146-148. Source hash comparison passes.
- Preserved current payment149-151, continuity and business instructions.
  Full-branch merge was safely aborted in favor of this narrow source import;
  unrelated configuration/catalog-audit and Supervision production pilot were
  not imported. Worker-owned new Session-result files remained untouched.
- 120 focused enrollment tests and typecheck pass, including disposable PG
  concurrency/readback. Full suite with maxWorkers=2:4035 pass/32 skip/exactly
  three established baseline failures, no extra PG timeout. No production
  migration, live source enablement, provider call or student action occurred.
- Integration scope/provenance: `docs/MCS-ENROLLMENT-DEPENDENCY-INTEGRATION.md`.

## 2026-09-10 — NC-20260909-003 authenticated Session-result verifier

- Added fixed-v72 TEST-only static result verification with exact native root
  reference, trusted stored Session ID, single Authorised PSP, immutable money
  and allowed method binding. This supplies actual-method evidence without
  trusting unsigned Standard-webhook method/date/additionalData fields.
- Sonnet/high R1 identified missing reference/result binding and deadline test
  coverage. Corrected with raw official-schema placement verification; R2 has
  no material findings. Codex independently reran39 tests, including hanging
  transport/slow-body bounds and other-attempt reuse. No secrets in errors.
- No native call, DB write, listener, enrollment or certificate action. The
  separate152 durable reconciliation/event slice is not claimed complete here.
- Review artifacts: Peri output/mcs-ready/session-result-review/.

## 2026-09-10 — NC-20260909-003 durable method/event evidence

- Added source-only152 encrypted reconciliation, scoped method/child-operation
  bindings and owned exceptions; expanded pending/failure/refund/return history
  with order-independent projection and minimized private status.
- Added signature/capability-protected return admission, immutable lost-first-ACK
  retry, auditable new-session immediate-capture request and pure no-action ACH
  access/certificate financial gates. Authorization is never called settlement.
- Four bounded Sonnet/high R1 reviews; controller/intake had no material findings.
  Corrected shared-reference/attempt races, sanitized repository failures, sticky
  method-conflict status and chargeback reversal history. Two narrow R2s accepted
  those corrections. Codex113-test/typecheck recheck passes; full bounded run:
  4075 pass/32 skip and exactly the three established baseline failures (includes
  the separate uncommitted edge tests). Continuity/capability checks pass.
- No production migration, live provider call, public route, course grant,
  certificate issuance, customer message or cutover. Pre-workflow edge filtering,
  protected BFF, canonical fulfillment and genuine TEST proof remain separate.
- Review artifacts: Peri output/mcs-ready/\*152-review/.

## 2026-09-10 — NC-20260909-003 pre-workflow TEST edge source

- Added a factory-only bounded HTTP filter before workflow persistence. Reuses
  native HMAC admission; no unsigned trusted-event DTO, database, logger or default
  listener. Foreign traffic is locally acknowledged; only owned native signed
  fields are forwarded, without optional private metadata or incoming headers.
- Exact allowlisted upstream and202/[accepted] ACK, body/header/time/concurrency
  bounds, no-queue backpressure and safe abort/error handling are tested.
- Sonnet/high R1 no material findings. Coordinator independently reran6 HTTP
  tests and500 foreign requests at25 concurrency: zero upstream calls, p95 27.77ms.
  These measurements are local-only, not whole-gateway capacity or provider proof.
- No external activation, secret installation, proxy/workflow change, payment,
  learner effect or certificate action. Exact TEST deployment/readback follows.

## 2026-09-11 — NC-20260909-003 durable customer receipt and access notices

- Added the concrete Gmail-backed `WebsiteCheckoutReceiptWelcomeOwner` plus
  local migration 158. The new admin-only ledger is independent of Plutio,
  student projections and operator-approved Mailman actions; it stores
  immutable Party/content/sender hashes and append-only queue/claim/Gmail ACK/
  readback/hold receipts without persisting customer email or body content.
- Exact LIVE card readiness, $299 USD base and admitted final amount, active
  canonical enrollment/obligation, unmerged payer/learner identity and current-
  version Heartbeat membership are re-read before each possible send. Self gets
  one combined payment/access confirmation. Gifts separate payer receipt from
  learner access copy and leave first-login invitation to Heartbeat. Copy makes
  no settlement, completion, certificate or marketing claim.
- Canonical `gmail-api.ts` `sendEmail` and the C3 safety brake are reused with a
  pinned Gmail profile and Send-As. Deterministic notice identities plus exact
  Sent/metadata readback adopt one prior result; unknown acceptance holds and
  ordinary replay never resends. Service-level receipt reference is emitted
  only after the complete required notice set is verified.
- Verification: focused notice and real disposable PostgreSQL suites 12/12;
  related Gmail/payment/service checks 84/84; typecheck, build, documentation
  continuity and diff checks pass. Full suite is 4,220 passed/32 skipped with
  only the three established unrelated capacity/CNPC/Trafft failures.
- Review: bounded Sonnet/high R1 found one partial aggregate receipt-reference
  inconsistency. Codex fixed it and added a gift payer-confirmed/learner-held
  regression; narrow R2 returned `NO MATERIAL FINDINGS`.
- Deployment/migration: none. Migration 158 is a tentative local allocation
  ordered after separately owned 157; it was applied only to a generated local
  disposable database and cleaned. No Gmail, customer, provider, live config,
  production database, commit, push, service activation or deployment action
  occurred. Exact factory wiring/configuration, migration application and first
  customer outcome remain separate root-owned gates.
- Documentation: `docs/WEBSITE-CHECKOUT-CUSTOMER-NOTICES.md`, project map,
  business schema guide and active-work record updated.

## 2026-09-11 — NC-20260909-003 managed LIVE service and browser-independent fulfillment

- Added one explicit TEST/LIVE full private checkout composition. The LIVE
  runner validates an owner-only config, exact caller/origin/offer/card/key
  purposes, inert publication plus separate activation receipt, approved access
  and Gmail notice owners, and existing 148/149-159 schema lineage before
  opening a loopback-only HTTP listener. `/health`, `/ready`, bounded shutdown
  and restart reuse are fixture-proven; production startup never creates or
  migrates a database.
- Preserved the protected TEST wrapper and records. An explicit
  `public_anonymous` profile selects only the MCS public return path; a dedicated
  manifest-switch command verifies the exact old config digest (including the
  legacy protected hash), writes an exclusive private backup, and refuses an
  unknown mismatch without DB access.
- Added the immutable English-only publication revision-2 candidate with the
  natively verified Heartbeat group/course/cohort mapping. Candidate bytes keep
  `runtime_consumer_enabled:false`; LIVE runtime requires an exact separately
  accepted activation receipt. The original revision-1 four-locale TEST artifact
  and digest are unchanged.
- Added production Heartbeat membership delivery through the existing student
  projection outbox/leases/receipts. It derives the exact active learner and
  current card readiness before every provider read/write, creates only a
  missing role User, preserves existing identity/role/groups, adds only the
  pinned English group, holds uncertain acceptance, and records a versioned
  Finance exception for later adverse evidence without revocation or
  certification.
- Tentative local migration157 adds an exact alternative method-evidence source
  for browser closure: only successful HMAC-admitted AUTHORISATION on an
  immutable card-only attempt can bind card to the exact payment event. Existing
  Session-result rows remain the default. Empty rollback/reapply and populated
  refusal pass in disposable PostgreSQL; the canonical enrollment records the
  same evidence source.
- A restart-safe keyset scanner now drains every signed checkout+attribution row
  with durable payment evidence, invokes idempotent enrollment/access/notices,
  and never blocks webhook acknowledgment. Claude access R1 found first-batch
  starvation; the scanner now paginates through the complete ordered set and a
  > batch regression passes. The timing question was closed with a fresh
  > canonical authority check immediately before each Heartbeat write.
- Verification: pinned Node22.23.2 typecheck/build pass; focused service,
  identity, webhook, enrollment, projection, migration157, notice and restart
  suites pass. Full suite:4220 pass/32 skip with exactly the three established
  unrelated Academy Capacity, CNPC source-assertion and date-sensitive Trafft
  failures. Sonnet/high service R1 found no verified defect and identified the
  then-missing notice wiring; notice source later supplied it. Access R1's one
  material scanner finding was fixed; narrow corrections R2 returned
  `NO MATERIAL FINDINGS`.
- Native evidence: the public TEST profile first reached real Adyen 3DS and
  HTTP200 return using the DECLINED holder fixture, leaving one conflict-held
  Session result. A later separately authorized logged-out USD299 official-Visa
  case completed native3DS/return and produced exactly one verified Session
  result plus one card/session_result binding while preserving that conflict.
  Zero webhook events/admissions leave state truthfully `confirming_payment` /
  `payment_evidence_pending`; no enrollment/access/notice outcome is claimed.
  Adyen v72 official docs confirm the strict authorised-result fields and
  webhook order-system authority; no schema relaxation was made for refused
  results.
- No LIVE/private config read, production DB/migration, provider write, payment,
  Heartbeat action, invite, Gmail send, commit, push, deploy or activation was
  performed in this backend slice.

## 2026-09-11 — NC-20260909-003 default-off Adyen payment observability

- Added a source-only, browser-independent LIVE projection from committed
  accepted website attempts, Session/retry results, terminal/review evidence,
  verified HMAC authorization and canonical enrollment into the existing Chaos
  lifecycle vocabulary. Exact caller, scope, attribution and English MCS offer
  filters prevent shared-merchant noise; unmatched exception hints remain in
  their payment ledger without blocking valid projection.
- Tentative local migration160 adds a distinct minimized admin-only outbox and
  append-only delivery receipts because migration117 is Stripe-specific. It
  stores no contact/card/provider identifier, signature, raw payload or secret;
  populated rollback refuses. Delivery uses deterministic opaque source IDs,
  one-row leases, bounded retry/dead-letter categories, redirect refusal and
  exact Chaos recorded/duplicate acceptance.
- External emission is default-off, LIVE-only and requires granted immutable
  attribution tracking consent. The sender transiently resolves the canonical
  payer, including gifts, and applies Chaos's exact person-key HMAC semantics;
  email is never stored, sent or logged. Attempts/problems map to
  `checkout_started`; `purchase_completed` requires verified authorization plus
  canonical enrollment and still reports settlement unproven.
- Observability schema/transactions and transport are isolated from payment
  readiness, webhook ACK and fulfillment. TEST external emission is not
  representable; injected transport and a generated disposable database provide
  the tests.
- Verification: focused 22/22, broader payment/checkout 312/312, typecheck and
  build pass. Combined review is pending. Documentation continuity reached only
  the expected Git-tracking gate for the two new migration files; root retains
  exact staging ownership after review.
- Deployment/migration: none beyond generated disposable PostgreSQL. No real or
  private configuration, existing database migration, provider/Chaos request,
  runtime start, payment, commit, push, deployment or activation occurred.

### 2026-09-11T20:22Z root review and verification addendum

- Final independent Sonnet/high review `dc8a0f10-d8df-4f47-8a03-130b23272d1b`
  found no material defects after root's scope/redirect/lease/hint corrections.
  The source remains default-off and no existing database was migrated.
- Root independently reran 312/312 payment/checkout checks and typecheck;
  formatting passes. Full suite: 400 files passed, 10 skipped, three failed;
  4,264 tests passed, 32 skipped, three failed. Failures are in unchanged
  `academy-capacity-operator-disposable`, `cnpc-prompt-contract`, and
  `relationship-context-trafft-shadow` tests, outside this diff. These are
  recorded rather than hidden or called a globally green build.
- Tandemweb's separate localhost TEST presentation now reads its course link
  from the catalog-owned course object and writes minimized private diagnostic
  receipts. This does not activate this LIVE-only Chaos projection or change a
  payment, enrollment, Heartbeat membership, or production Stripe path.

