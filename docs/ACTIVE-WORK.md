# NanoClaw active work

ut (original token count: 233762)
Total output lines: 8935

# NanoClaw active work

2026-09-14T22:31Z — `NC-20260914-002` trusted Italian submission language,
owner Codex with bounded Claude reviewer, `ready_for_deploy`, C5, isolated branch
`codex/grader-italian-attestation-20260914` from exact production release
`1509c38eb53bfbb32bfc16cc09cc240af3094614`. Add only an optional
`submission_language=it` to the existing main/chief-only grader-file IPC, bind
it in memory to the exact Slack root before persistence, and carry it into that
root's run context. Preserve the registered English Foundation assignment and
feedback language; unattested mismatches remain held. No new route, schema,
durable student state, broad language policy, translation-primary grading, or
certificate action. Focused tests and one Sonnet/high review are complete;
build, exact release activation, Barbara live verdict, and any Heartbeat
writeback remain pending. Updated 2026-09-14T22:50Z.

ut (original token count: 239823)
Total output lines: 9270

# NanoClaw active work

2026-09-18T12:35Z — `NC-20260918-001` honor exact owner-directed email CC
recipients, owner Codex with fresh necessity and bounded Sonnet/high review,
`ready_for_review`, C5, isolated branch `codex/owner-directed-cc-20260918` from exact
live release `e5b309669b5073137a9da451298b49306d5f9d08`. Current observable result:
an exact action-bound approved card may carry a CC, but Gmail blocks any
out-of-Party address that is neither a configured mailbox nor visible on the
latest external message; this rejected Alex's explicit instruction to copy
`cherie@tandemcoach.co`. Required evidence remains exact human approval,
immutable To/Cc/subject/body, one Action-ID, BCC prohibition, address/count
validation, one-time execution, and Gmail receipt. Obligation delta: no schema,
state, worker, queue, scheduler, external dependency, or second send path; the
existing exact approved card/action becomes sufficient authority for its
operator-visible CC list, while unapproved or drifted recipients remain blocked.
Removing the exact-card/action match would reopen fabricated-recipient risk, so
it remains mandatory. Next falsifiable proof: focused regressions must accept an
exact action-approved off-thread CC on both send and reply, reject missing or
drifted approval and BCC/duplicate/over-ten cards, then pass the email-critical
gate, independent review, immutable release, and live health verification. S1
necessity review returned `KEEP`; focused tests pass 121/121, typecheck passes,
and the complete email-critical gate passes 808/808 plus runner 45/45. The full
suite passes 4,508 with 34 skips and the same three predecessor Capacity, CNPC,
and date-sensitive Trafft failures reproduced on the live base. State is
`ready_for_review`. No customer email or synthetic external send is authorized
as a canary. Strict-MCP bounded Sonnet/high implementation review returned
`PASS` with no material finding; next is commit, push, immutable build,
activation, and live health verification.

2026-09-18T03:00Z — `NC-20260917-003` finite website installment contracts,
owner Codex with bounded Sonnet/high review, `ready_for_review`, C4, isolated
branch `codex/finite-installments-20260917` from exact live lineage `724a5a5c1`.
Add default-off host-owned finite contracts, exactly N obligations, one
attempt per obligation, earliest-unpaid due claiming, durable ambiguous
dispatch state, and one recovery-required record after a definite rejection.
Commerce retains the provider token and dispatch adapter; Company OS never
receives a usable token. Focused finite-billing and webhook suites pass 66/66,
pinned typecheck passes, and bounded review found one material schema omission
for `dispatch_unknown`; it is corrected with a regression assertion. No
Production flag, credential, migration, schedule loop, provider request,
payment, invoice send or customer message has occurred. Next: commit both
source branches, run release reconciliation, and deploy default-off source only.

2026-09-18T01:38Z — `NC-20260917-002` admit canonical ACC roster cohort
identities, owner Codex with bounded Sonnet/high review, `complete`, C4,
isolated branch `codex/acc-cohort-roster-translation-20260917` from exact live
release `3972d9f545b333a5b565dd46208214a352e7f7e6`. Tandemweb will freeze ACC
roster values as canonical `YYYY-MM` identifiers instead of display copy. The
existing signed Bookkeeper validator must accept that exact ACC shape while
retaining the current label-plus-range contract for PCC/ACTC; the Sheet writer
remains byte-preserving and fill-only. No schema, route, process, worker, queue,
scheduler, payment, provider, enrollment, access, customer message or broad
roster rewrite. Next: implement the validator regression, run focused/full
verification and bounded cross-repository review, then release Company OS
before the two Tandemweb plugins and correct one guarded roster cell. The
validator and webhook suites pass 72/72; it accepts `YYYY-MM` only for ACC and
retains the prior PCC/ACTC display-value contract. Pinned typecheck and
continuity pass; the full suite is 4,502 pass / 34 skip / four failures, with
the payment-method race passing isolated and the other three exact known
predecessor baselines. Bounded correctness review returned PASS; both LOW test
hardening observations are mechanically closed. Exact immutable release
`618880fbe188a15e913a081c40eb3bd68a452363` is live on Node 22.23.2 with
verified source tree `96b414c32187afebce56088e31855dcfcbe5eb97` and artifact
hash `fa054ce6484f48c399fe74cccb4e0d3eefc09d4214627ccded981c38e94a5818`.
Health, launchd and the sole listener agree; Gmail/Slack are connected and the
runtime queues are empty. Tandem Commerce 1.40.18 and Tandem Snippets 1.7.4
were then activated, live rows resolve the exact transition identities, and
the one guarded Manpreet roster cell reads back `2026-10`. No payment was
created.

2026-09-18T00:22Z — `NC-20260917-001` repair Adyen Commerce capacity
commitments, owner Codex with bounded Sonnet/high review, `validating`, C4,
isolated branch `codex/adyen-capacity-source-fix-20260917` from exact live
release `eb8af47caa654738c671b34d94363a5b4e940aa3`. The signed Commerce
Bookkeeper ingress already emits the canonical `website_adyen_sale` source, but
the core Capacity reducer omits that value from its commitment allowlist. Paid
Adyen orders therefore finish Payment Log, roster and PostgreSQL projection,
then fail before the idempotent capacity commitment. Add only that existing
source to the reducer allowlist with a real reducer regression; no schema,
route, worker, queue, scheduler, payment/provider call, customer message,
manual capacity adjustment or new authority. Focused reducer/ingress tests pass
21/21; pinned typecheck and continuity pass; the full suite passes 4,503 with
the same three unrelated predecessor failures. Bounded Sonnet/high correctness
review returned PASS with no material finding. Exact release `44edb85d` was
activated, but the first bounded retry exposed a second durable guard: both old
denials are cached by the operator case key, so the corrected reducer was never
re-entered. The ingress now versions only that case key while preserving the
stable commitment and payment idempotency keys. Next: verify, amend the release,
then retry the same two jobs and prove one reservation each with no duplicate
payment or roster effects.

2026-09-16T13:08Z — `NC-20260916-001` Commerce refund Bookkeeper projection,
owner Codex, `validating`, C4, isolated branch
`codex/commerce-refund-bookkeeper-20260916` from exact live release
`ebd07d52e8e7433068086b749ab023fb53ddf5c3`. Extend only the existing signed
Commerce Bookkeeper receiver and deterministic recorder so a signed successful
Adyen `REFUND` can update the existing Payment Log status and append one
idempotent, PII-free PostgreSQL refund projection. Preserve the original payment
row, Student Roster/access/capacity state, the one existing route/process/queue,
and all AUTHORISATION behavior. Add migration 170 plus guarded empty-only
rollback; no provider call, email, customer communication, roster mutation,
access action, new service, worker, queue, scheduler or credential. Next: record
the minimum-sufficient checkpoint, obtain fresh S1 necessity review, implement
the walking skeleton, verify disposable PostgreSQL and receiver/recorder tests,
then release and replay only the one preserved TEST refund job. S1 returned KEEP
for the narrow branch/table/status/no-roster path and REMOVE for any new runner.
Focused 81/81, typecheck, format and continuity pass; full suite has 4,501 pass,
34 skip, one flaky predecessor that passed isolated and three exact live-line
predecessor failures outside the changed files. Next: bounded diff review,
commit/build, migration-170 backup/apply, exact release, Commerce 1.22.1 payload
deploy and one preserved TEST refund-job replay/readback.

2026-09-16T00:45Z — `NC-20260915-005` ACC/combined Commerce capacity
integration, owner Codex with bounded Sonnet/high review, `validating`, C5,
isolated branch `codex/acc-capacity-commerce-20260915` from exact live merge
`189531ac2e96b58d720e90fc71255e71c8cb3e6d`. Reuse only the accepted local
available/sold-out projection plus post-fulfillment durable commitments; add
provider-scoped Adyen identity, ACC cohort admission, four missing readiness
pools and explicit review failures. No checkout holds, new worker/queue/schema,
automatic waitlist action or real validation charge. Focused 78/78, disposable
PostgreSQL, typecheck and formatting pass; full root is 4,491 pass / 34 skip /
three independently confirmed predecessor failures. Sonnet/high found one
new-user multi-group queue-readback gap; Tandem Commerce corrected it and all 20
PHP suites pass. Next: commit/build immutable artifacts, reconcile exact live
lineage, then migrate/deploy NanoClaw before Commerce under short leases.

2026-09-15T23:12Z — `NC-20260915-004` live-line credential Commerce
integration, owner Codex, `ready_for_deploy`, C4/C5, isolated branch
`codex/commerce-cohort-live-integration-20260915` from exact live identity
release `50905fc8522c11a55a9fca782280b862a017daa6`. Production advanced on a
divergent login-tools lineage while the Commerce cohort release was being built;
the initial activation stopped at dry-run. This branch preserves the complete
live identity gateway source and adds only provider-neutral Bookkeeper commits
`4016d985`, migration-168 commit `59e84ead`, and credential-cohort commits
`381f2567`/`fd7e08e7`. The source merges without runtime-code conflict; only
continuity documentation required combination. Next: run exact integrated
verification, build one immutable release and activate only after a zero-work
drain. No payment, enrollment, Sheet, customer message, identity binding, Funnel
or IAM mutation is authorized by this integration.

2026-09-15T20:20Z — `NC-20260915-003` Tandem Identity login-to-tools walking
skeleton, owner Codex, `blocked`, C5/C3. Company OS program work
`work:tandem-identity-login-tools-walking-skeleton` is claimed at revision 357.
Tandem Identity branch `codex/login-tools-walking-skeleton-20260915` starts from
the runtime-unchanged topology documentation at `3a577a7`; Company OS continuity
branch `codex/tandem-identity-login-tools-walking-skeleton-20260915` starts from
the completed topology proof at `d4e6f39b`. Scope is the smallest customer-
visible path: reuse the existing verified session and identity gateway so
`/account` and `/tools` resolve one explicit Party and one exact coaching-tools
entitlement. Unbound, ambiguous, missing/held access, logout, revocation and
Company OS unavailability must fail closed. No new identity store, service,
queue, worker, tunnel, generalized federation, provider write, mass migration
or production rollout is authorized. The exact controlled pilot identity/Party
binding is a named-human gate and will not be invented. The source path is now
reviewed, committed and pushed on private Tandem Identity branch
`codex/login-tools-walking-skeleton-20260915` at `d46fb591`: focused 55/55 and
full 74 passed with four intentional Firestore skips; typecheck/build pass;
Sonnet/high returned `PASS`. No deployment occurred because the installed
gateway still guarantees `unbound`. The owner then named the pilot account.
Read-only Company OS resolution found three active same-email Parties: long-
lived Party `10069` with 13 exact Plutio/Trafft/Stripe/Tandem-web references,
plus WordPress checkout prospects `11646` and `11647`; all lack verified claims
or auth bindings, and none has Coaching Tools Plus. Next: owner explicitly
designates the canonical Party and legitimate entitlement path, then separately
authorizes the real gateway path for a truthful end-to-end development canary.
The owner approved Party `10069` and the smallest real gateway. Fresh necessity
review returned `KEEP` for one exact path-mounted Tailscale Funnel route into the
existing server, with no new service/store. Implementation is waiting on the
load-bearing independent readback of the Cloud Run service account's immutable
numeric subject; Google Cloud Console requires the owner's fresh passkey. No
endpoint, Funnel, IAM, binding or deployment state has changed.
2026-09-15T23:00Z — `NC-20260915-002` credential Commerce cohort projection,
owner Codex with bounded Sonnet/high necessity review, `in_progress`, C4, same
isolated provider-neutral Bookkeeper branch. Extend only the existing signed
Commerce envelope with an optional bounded PCC/ACTC calendar selection. The
recorder keeps Product Map routing, fills the existing roster `Cohort` cell only
when blank, reads back product and cohort cells, and adds the cohort to the rich
Contador receipt. No new route, table, migration, credential, process, queue,
scheduler, payment authority or customer communication. ACC and combined Level 2
remain outside this slice because their status/capacity obligation is not yet
supported. Typecheck and focused Bookkeeper/migration tests pass 11/11; immutable
release build, deployment and first natural purchase proof remain pending.

2026-09-15T21:11Z — `NC-20260915-001` provider-neutral Commerce Bookkeeper
projection, owner Codex with bounded Claude necessity review, `blocked`,
C4, isolated branch `codex/commerce-bookkeeper-provider-neutral-20260915` from
exact live release `3dd0eb671203f6f25bbd87afe7f97eeb911dac39`. This is a
retrospective registration: implementation began from the Peri program's recorded
authorization and minimum-sufficient checkpoint before the NanoClaw continuity row
was added. Generalize only the existing signed asynchronous receiver from MCS to
MCS plus six approved English Practitioner CCE one-time products; use exact
catalog-declared Product Map labels; add Payment Log column P as explicit provider
provenance for both existing Stripe and Adyen writers; and restore a rich mechanical
Contador receipt. Preserve column J's literal `Stripe ID` header for existing
maintenance consumers, all existing payment/enrollment/Encharge/receipt truth, the
single host process and route, and All-Access on Heartbeat. No new endpoint, DDL,
credential, queue, worker, scheduler, provider, synchronous dependency, payment, or
customer communication is added. Focused 100/100, typecheck, and diff check pass;
full suite is 4,419 pass/32 skip/19 unrelated baseline failures. Commits
`4016d985` (NanoClaw) and `65d40c99f` (Tandemweb) are pushed. NanoClaw
`740837715c0f` and Commerce 1.18.11 are now live and healthy. The exact replay wrote
and read back the AI Payment Log/Adyen provider and Practitioner roster cells, then
failed safely before PostgreSQL because migration 166's product constraint is still
MCS-only. The job remains pending and is deferred until 2026-09-16T21:31Z. Next:
complete the required necessity review for migration 168, apply/read back only that
constraint correction after backup, then replay the same job once and verify
PostgreSQL, rich Contador receipt, WordPress completion and no duplicate effects.
Migration 168 is now implemented locally with a guarded rollback and disposable
PostgreSQL proof. Approved Sonnet/high review `7c4f21e1-59a4-4e5e-8469-19d3e5de5f40`
returned `KEEP`; both findings are closed by an exact receiver/SQL boundary corpus
and a hard `rollback 168 refused` exception. Focused migration/receiver tests are
10/10. Typecheck and the expanded migration/receiver suite now pass 12/12. State is
`ready_for_deploy`: commit/release the exact bytes, take and validate the protected
backup, apply/read back migration 168, and replay the one deferred job.

2026-09-15T22:15Z — `NC-20260915-002` LinkedIn native-alert intake for
Executive Search, owner Codex, `ready_for_deploy`, C2, isolated branch
`codex/linkedin-alert-intake-20260915` from exact live release
`59e84ead6b088f2eedb7d9baaeda323d34dd5f8a`. Capture only exact LinkedIn job
alert mail before Mailman classification into a minimized, immutable private
outbox on the production Mini; suppress those messages from Sales/Chief;
export a bounded batch over the existing authenticated SSH path; and let the
Mac Studio Executive Search app persist replay-safe received/pending/resolved
lead receipts and resolve jobs only through configured employer/public ATS
sources. No LinkedIn page fetch, mailbox credential copy, inbound application
port, recurring timer, report refresh, application, employer contact, or
customer/business email routing is added. Minimum-sufficient review returned
KEEP while deferring recurring polling until one natural exact-sender alert
proves the provider format. Focused 96/96, typecheck, Executive Search 93/93,
lint/build, actual SSH transfer, restart-persistent UI state and one bounded
Sonnet/high review pass after two verified corrections. Next: commit/push the
reviewed bytes, build/verify immutable releases, deploy NanoClaw then Executive
Search, verify empty live state and await one natural exact-sender alert.

2026-09-15T21:11Z — `NC-20260915-001` provider-neutral Commerce Bookkeeper
projection, owner Codex with bounded Claude necessity review, `blocked`,
C4, isolated branch `codex/commerce-bookkeeper-provider-neutral-20260915` from
exact live release `3dd0eb671203f6f25bbd87afe7f97eeb911dac39`. This is a
retrospective registration: implementation began from the Peri program's recorded
authorization and minimum-sufficient checkpoint before the NanoClaw continuity row
was added. Generalize only the existing signed asynchronous receiver from MCS to
MCS plus six approved English Practitioner CCE one-time products; use exact
catalog-declared Product Map labels; add Payment Log column P as explicit provider
provenance for both existing Stripe and Adyen writers; and restore a rich mechanical
Contador receipt. Preserve column J's literal `Stripe ID` header for existing
maintenance consumers, all existing payment/enrollment/Encharge/receipt truth, the
single host process and route, and All-Access on Heartbeat. No new endpoint, DDL,
credential, queue, worker, scheduler, provider, synchronous dependency, payment, or
customer communication is added. Focused 100/100, typecheck, and diff check pass;
full suite is 4,419 pass/32 skip/19 unrelated baseline failures. Commits
`4016d985` (NanoClaw) and `65d40c99f` (Tandemweb) are pushed. NanoClaw
`740837715c0f` and Commerce 1.18.11 are now live and healthy. The exact replay wrote
and read back the AI Payment Log/Adyen provider and Practitioner roster cells, then
failed safely before PostgreSQL because migration 166's product constraint is still
MCS-only. The job remains pending and is deferred until 2026-09-16T21:31Z. Next:
complete the required necessity review for migration 168, apply/read back only that
constraint correction after backup, then replay the same job once and verify
PostgreSQL, rich Contador receipt, WordPress completion and no duplicate effects.
Migration 168 is now implemented locally with a guarded rollback and disposable
PostgreSQL proof. Approved Sonnet/high review `7c4f21e1-59a4-4e5e-8469-19d3e5de5f40`
returned `KEEP`; both findings are closed by an exact receiver/SQL boundary corpus
and a hard `rollback 168 refused` exception. Focused migration/receiver tests are
10/10. Typecheck and the expanded migration/receiver suite now pass 12/12. State is
`ready_for_deploy`: commit/release the exact bytes, take and validate the protected
backup, apply/read back migration 168, and replay the one deferred job.

2026-09-15T19:46Z — `NC-20260915-002` Tandem Identity authenticated service
topology proof, owner Codex, `complete`, C5/C2. Isolated Company OS branch
`codex/tandem-identity-service-topology-disposable-20260915` starts from the
reviewed proposal source at `15b22f20`; Tandem Identity branch
`codex/service-topology-disposable-20260915` starts from private `main` at
`fc5714d`; the architecture/checkpoint branch
`codex/tandem-identity-service-topology-20260915` starts from `fdd7e819b`.
Scope is one current read-only topology audit, one minimum-sufficient obligation
checkpoint and fresh necessity review, then only the accepted network-free
disposable proof of a standard service identity. Likely files are the three
identity/proposal source and test surfaces, exact architecture/checkpoint docs,
this active-work record, project map, changelog and task evidence. No production
endpoint, IAM/network/secret mutation, real credential or user, Party/ref/access/
provider/customer write, runtime wiring, migration or deployment is authorized.
The current audit and `KEEP` necessity verdict are recorded; one pure unwired
Company OS verifier plus ephemeral test issuer passes focused, cross-repository
and disposable database proof. Sonnet/high bounded auth review returned `PASS`
with no material finding. Tandemweb checkpoint commit is `e2e245e43`; Tandem
Identity runtime-unchanged documentation commit is `3a577a7`; Company OS
implementation `582a9b37` is pushed with exact remote readback. Company OS
program revision 354 closes every continuity commitment. No implementation,
release or deployment remains for this disposable proof; the next identity
work must be a separately authorized customer-visible walking skeleton.

2026-09-15T01:48Z — `NC-20260914-007` Tandem Identity disposable BFF-to-
Company-OS claim proposal, owner Codex, `complete`, C5/C2. Tandem Identity
implementation `926774f`, reviewed source `4ca09d8` and remote-limit record
`fc5714d` are committed and pushed to private
`alex-kudinov/tandem-identity` on
`codex/claim-proposal-disposable-20260914`; Company OS implementation
`512a4ee6` and pushed head `d6048eac` are on
`codex/tandem-identity-claim-proposal-disposable-20260914`. The existing BFF
`/api/session` Firebase-verification sequence now proves an injected gateway can
emit only a strict participant proposal with no Party/conflict authority.
Company OS independently validates the exact neutral artifact, derives current
identifier candidates/open exception in one transaction, pins the PostgreSQL
transaction ID against serializable-autocommit bypass, and reuses migration 167
for atomic acceptance/replay. Focused 19/19, Tandem 44 passed/four intentional
Firestore skips, typecheck, build, format and docs continuity pass. Fresh S2
necessity review removed bespoke
HMAC, second token verifier, duplicate fixture, staff/payer and live transport;
bounded Sonnet/high review found and closed the transaction-boundary defect.
Endpoint, network, credential, runtime wiring, DDL, real user, production
identity/ref/access/customer/provider writes and deployment remain prohibited
and absent.

The exact Tandem Identity and Company OS remote refs were read back. No
deployment is waiting or authorized; the next endpoint/transport stage remains
separately gated.

2026-09-15T00:52Z — `NC-20260914-006` Tandem Identity authenticated
account-claim dark foundation, owner Codex, `complete`, C5/C2, implementation
commit `2669e9cf` on isolated branch
`codex/tandem-identity-account-claim-dark-20260914` from D3 proof commit
`1c2e0c52e4e0a7ca7651913d67e77f2b0ec3416a`. One concrete normalized Google
claim, strict accepted-or-held/rejected evaluator, C02-shaped before/after D0
proof and migration-167 disposable transaction now pass focused 20/20,
typecheck, build, format and documentation continuity. Exact replay writes
zero; altered reuse, missing Party, reused subject, ambiguity and scope/
environment conflict fail closed; late failure rolls back. One bounded
Sonnet/high review found no behavior defect and one negative-test gap, now
closed mechanically. General provider abstraction, `claim_available`, BFF/UI/
Firestore/signing, real users, Party creation, production identity/ref/access/
customer/provider writes, DDL, runtime activation and deployment remain
prohibited and absent.

2026-09-14T11:21Z — `NC-20260914-001` Tandem Identity D3 Heartbeat
aggregate reconciliation, owner Codex, `complete`, C5/C3, pushed branch
`codex/tandem-identity-d3-heartbeat-reconciliation-20260914` from D2 live-proof
commit `e887c7849a30dbb82738d1e541730f0c16cb0908`. Owner authorization is
recorded in
`.program/decisions/decision-tandem-identity-d3-heartbeat-reconciliation-2026-09-14.json`.
Import a twice-reproduced, privacy-minimized Heartbeat main census and webhook
fingerprint into the migration-167 reconciliation ledger, add aggregate-only
blocked simulations, and prove atomic exact replay. The complete census is
1,694 users and 4,202 group-membership edges, but it exposes no per-user graph;
therefore person resolution, absence decisions, access repair, Party/ref/auth
binding, provider attempts and all customer/provider writes remain prohibited.
The exact live release is `1509c38eb53bfbb32bfc16cc09cc240af3094614`.
Production stores one fresh complete run, 82 normalized fingerprints, one
blocked control projection and one unavailable readback. Candidate and
exact-live replays both wrote zero; Party/ref/auth/resolution/attempt and D2
state are unchanged. The Mac Mini has no Heartbeat credential or recurring
provider client. The active Chief container was adopted intact across the
three-pointer release switch. No further action remains in D3; per-user graph
acquisition and any identity/access migration are separately gated.

2026-09-14T02:39Z — `NC-20260913-003` Tandem Identity D2 production
shadow, owner Codex, `complete`, C5/C3, deployed branch
`codex/tandem-identity-d2-shadow-20260913` from D1 completion
`eae3a1424e1c1224d943c618bc8ac66b516a3194` and exact live release
`c190b957333ac1901b2d46a1f4b3f1cf75c6341c`. Owner authorization is
recorded in
`.program/decisions/decision-tandem-identity-d2-production-shadow-2026-09-14.json`.
Freeze the live schema/roles/source aggregate, implement a bounded idempotent
host-only mirror from existing `student_lifecycle_events` into D1 receipts,
held observations, non-Party candidates, divergence metrics and a truthful
blocked scoreboard; prove it against disposable PostgreSQL; run bounded
Sonnet/high review and full verification; then take a protected production
backup, apply migration 167, deploy and exact-read back only if every gate
passes. Current frozen source is 379 events/379 inbox links/156 distinct
Heartbeat users/71 current Party-linked source rows; all 379 are
`source_asserted_unreconciled`, so D2 must retain every event as
`unverified_hint`/held and create no accepted canonical fact. Party creation or
merge, ref binding, enrollment/entitlement/access/customer projection,
provider hook/config/write, payment, certificate, attendance, booking,
communication and full migration are prohibited.
The default-off host worker, aggregate `/health` surface, immutable release
inputs, read-only exact-prefix validator and value-redacted configuration
transaction are implemented locally. A real disposable PostgreSQL 2+2 batch
reaches four held receipts/observations and three candidates, then exact replay
adds zero; provider-reconciled input rolls the whole batch back. Sonnet/high R1
found one latent endless-catch-up defect for a userless source row; D2 now
reports that irreducible gap as terminally blocked and preserves its exact
count, with a real PostgreSQL regression. Focused 66/66, typecheck, build,
format and continuity pass; full repository is 4,401 pass/32 skip/19 unchanged
baseline failures and no identity test failed. Documentation and independent
review are complete. Reviewed implementation commit
`d99ca2589def4fc459fa129218ab83696b34b330` is pushed and live under verified
artifact `416eec1b…`/1,360 files/Node 22.23.2. A readable 14,858,133-byte
mode-0600 backup preceded migration 167. Disabled-first release and exact
post-migration checks passed, then the fixed configuration was enabled once.
Live state is 379 source/receipt/held-observation rows, 156 candidates, zero
unmirrored/promoted/linked/materializable/resolution/projection/command/attempt/
readback/reconciliation/drift state, blocked provider-unreconciled health and
an exact second-run zero-write replay. Party/ref counts and channels/queues are
unchanged. D2 is complete; D3 remains separately unauthorized.

2026-09-14T02:02Z — `NC-20260913-002` Tandem Identity D1 disposable
PostgreSQL store proof, owner Codex, `complete`, C5, pushed branch
`codex/tandem-identity-d1-disposable-20260913` from D0 completion
`3c8e7d1c4a704f7952950aa86644b7d70c1ab8c9`. Implement the reviewed
identity receipts, decisions, candidates, authentication bindings, desired
projections, shadow-only commands, complete reconciliation snapshots and drift
constraints as an unwired ordered migration. Prove first apply, reapply,
reason-matched negative cases, transaction failure rollback, backup/restore,
populated rollback refusal, empty rollback and zero disposable-database residue
under pinned Node/PostgreSQL. Update the structure-only design and project map,
run focused/full verification and bounded Sonnet/high review, then commit and
push the branch. Production Company OS, providers, customer data, Party/ref/
access state, credentials, runtime registration, communications, packaging,
migration and deployment are explicitly out of scope.
Migration 167 now implements 12 admin-only relations and an exact-replay
receipt function. Local PostgreSQL 16.15 passes deliberate migration failure
rollback, direct reapply, one synthetic chain, 18 reason-matched refusals,
transaction rollback, custom-format backup/restore, populated rollback refusal,
concurrent terminalization/late-item refusal, empty rollback/reapply, zero
provider attempts/production connections and zero
database residue. Sonnet/high R1 found one material dangling-candidate coupling
gap; the constraint now requires null candidate references for ambiguity,
not-found and conflict decisions. Its non-material lifecycle note is closed by
append-only monotonic candidate versions and legal forward transitions. The
52-test D0+D1 focused surface, format, typecheck, build
and docs continuity pass. The full repository has 4,387 pass/32 skip/19
unchanged baseline failures across Academy Capacity, CNPC prompt, date-sensitive
Trafft and missing Tandemweb publication fixtures; no D0/D1 source or test
failed. Bounded independent review and corrections are complete. Completion
evidence is recorded. Reviewed implementation commit
`2ae0e7575e883573213fedfb1c3d531c15fcb345` is pushed and exact remote readback
matched. Deployment and production migration are not applicable and were not
performed. No further D1 action; D2 production shadow admission requires a
separate explicit validation and task.

2026-09-14T00:45Z — `NC-20260913-001` Tandem Identity D0 replay core,
owner Codex, `complete`, C5, pushed branch
`codex/tandem-identity-d0-replay-20260913` commit `4b3ec286b935` from exact verified live release
`c190b957333ac1901b2d46a1f4b3f1cf75c6341c`. Implement only pure,
network-free TypeScript contracts, semantic validators, reducers, and the 12
proof plus 27 failure fixtures under `src/identity-control-plane/`; update
Project Map, authoritative D0 design, changelog, and continuity evidence. D0
has no database/provider imports, credentials, Party/external-reference/access
writes, runtime registration, consumer, migration, deployment, or production
effect. Sonnet/high R2 found no mechanism defect and identified coverage gaps;
R17-R27 now cover weak/rejected authenticity, both reducer conflicts,
tombstone/accepted-subject/merge-cycle conflicts, manifest scope/entity/event
mismatch and duplicate snapshot facts. The unused parallel proof helper is
removed. 47 focused checks and 12/12 proof plus 27/27 failure fixtures pass with
zero writes. Final typecheck, build and docs continuity pass. Full suite has
4,381 pass/32 skip/20 baseline failures; the exclusion run added one
intermittent disposable PostgreSQL failure that passes alone. Independent
review and corrections are complete; implementation commit `4b3ec286b935` is
pushed. Deployment/migration are not applicable to this unregistered pure
package. No further D0 action.

2026-09-13T21:24Z — NC-20260909-003 first Commerce payment polish,
source owner Codex: the recovered WordPress Commerce order reached the
compatibility Payment Log, Student Roster and PostgreSQL readbacks, but the
dedicated Commerce Bookkeeper handler acknowledged the VPS job without posting
the required mechanical summary to El Contador. Exact live evidence is one
matching Adyen projection row and zero matching Contador channel messages.
Align the handler with the existing Contador AUTO communication contract:
resolve exactly one registered `contador` group, post the verified recorder
summary before HTTP acknowledgment, return retryable 503 on missing group or
send failure, and prove the current order produces one visible message without
another payment. Preserve the existing Stripe path and do not spawn an agent.

2026-09-13T02:45Z — NC-20260909-003 architecture review complete, no
implementation: bounded Claude Sonnet/high R1 confirmed the rejected Mini
authority but incorrectly retained the WordPress intent/preparation state
machine, transient production persistence, reused terminal idempotency,
Stripe-shaped Bookkeeper internals, stranded paid-document history, and
mis-sequenced credential rotation. Codex independently verified those defects
against the current TEST adapter, migration133 and `process-payment.cjs`; narrow
R2 confirmed seven corrections and found no unresolved owner decision. The
converged target collapses pre-payment persistence to one durable MariaDB
submission row; leaves the current Stripe ingress/case path unchanged; adds a
separate Adyen Bookkeeper adapter/case family plus a newly extracted shared
operational recorder; imports the exact existing paid order/documents into
Tandem Commerce before retiring the Mini; and moves only real Adyen secrets to
the VPS, rotating them after old attempts drain. Card AVS billing remains in
the Adyen Component/provider flow; the temporary submission stores only the
checkout and optional business-invoice data entered before Payment. Review
sessions `f835554b-70a6-4517-a40c-a13afcc257c8` and
`13c308d0-4991-465f-9592-2451cae267ba`; both exceeded the 100k bounded-context
target and are closed. No source, schema, config, provider, runtime, deployment,
payment, email, Heartbeat, Sheet, tunnel, LiteSpeed, Cloudflare, DNS, or
credential mutation occurred.

2026-09-13T02:31Z — NC-20260909-003 architecture reset, owner decision:
the owner rejects NanoClaw/Mac Mini as Adyen Session, payment-status,
confirmation, receipt/invoice, or enrollment authority. Stop further changes
to the Mini payment service and do not add the proposed three LiteSpeed
document-route mappings. The target is a dedicated WordPress Tandem Commerce
plugin on the VPS: it owns Adyen Sessions/webhooks, payment/order/document
state, common jobs and per-product post-payment actions, including direct
course enrollment. A common VPS job sends the verified native Adyen
notification plus Tandem order context to NanoClaw Bookkeeper only for
compatibility spreadsheet/PostgreSQL recording; NanoClaw keeps distinct Stripe
and Adyen adapters and cannot gate customer checkout or fulfillment. Existing
Stripe webhook processing remains during the compatibility window. No new
implementation is authorized until a bounded Claude Sonnet/high architecture
review produces a keep/change/delete/create and cutover plan and Codex verifies
it for owner review. Current LIVE service remains in place only to avoid an
unreviewed outage; no root proxy change was applied.

2026-09-13T01:06Z — NC-20260909-003 first other-learner fulfillment and
document incident, source owner Codex: exact LIVE payment
`02a6bd46-004f-47e0-945d-ae8186e388d3` is authorized and canonically
enrolled, but Heartbeat access repeatedly records `provider_lookup_failed` and
all four receipt/invoice actions fail before document creation. This is not an
email duplicate: the purchase relationship is `other`. Root causes are a normal
Heartbeat404 for the new participant being treated as a hard lookup failure,
and document authority still joining the intentionally empty pre-payment Party
columns instead of migration165 materialization IDs. The Heartbeat wrapper now
maps only confirmed404 to exact empty and preserves all other failures; document
authority now uses immutable paid materialization IDs. The related Tandem
checkout also requires a full card billing address for Visa AVS/ESD. Focused and
broader suites pass; two bounded Sonnet/high reviews found the initial unsafe
catch, confirmed its correction boundary, confirmed the document/AVS changes,
and left only a review-scope note that Codex closed by checking the unchanged
exact-email-only caller. Release through the established immutable workflows,
then prove exact Heartbeat membership and receipt/invoice download plus email
outcomes without another payment. The first deployed document-identity repair
proved authority but exposed a second generator defect: globally enabled invoice
tax metadata was also copied into receipts, whose own immutable schema correctly
rejects tax metadata. Scope invoice metadata to `paid_invoice`, rerun release
tests, redeploy and exercise all four actions.
Direct signed-route reproduction then found the shared request authenticator
omits all three document endpoints, producing unsigned401 before the document
controller. Add the exact paths with route-mismatch tests and rebuild once.

2026-09-13T00:39Z — NC-20260909-003 TEST webhook lifecycle correction,
source owner Codex: the prior Level 3 completion claim was overstated. The
standalone provider payment was Authorised, but the enabled TEST webhook's
backend, edge and reverse tunnel were terminal-session processes and offline;
Adyen recorded repeated HTTP503. All three hops were restored and the exact
failed event redelivered Accepted. The preserved TEST database also lacked
migrations161–165; an owner-only 606726-byte backup was taken, the five
migrations applied, and a fresh full Tandem TEST payment now has one Accepted
Adyen delivery, one durable AUTHORISATION and `authorization_recorded` state.
The webhook does not yet contain ESD validation results, so L3 submission is not
claimed. Source adds reusable161–165 upgrades and a release-verified compiled
TEST entrypoint for permanent supervision. Focused66/66 and independent
Sonnet/high review pass. Immutable release `a14b679c` passed the release gate and
is installed on Studio with shared pinned production dependencies. launchd now
supervises the backend, filtering edge and reverse tunnel. A forced restart
changed all three PIDs, restored listeners on 3443/3444 and VPS loopback15679,
and the public route returned the expected403 for an unsigned request. The exact
fresh TEST attempt remains `authorization_recorded` with one payment event, zero
optimization-evidence rows and zero admissions. After the forced restart, a real
Adyen retry of the previously failed AUTHORISATION created a new Tandem delivery
at 19:49:40 CDT with status Accepted.

2026-09-13T00:00Z — NC-20260909-003 MCS Level 3 enhanced scheme data,
source owner Codex: the previously disabled combined optimization was split.
Exact provider proof showed Checkout v72 accepts flattened L3 fields on Session
creation but rejects them during the browser `/payments` call; v72 also rejects
the new structured `enhancedSchemeData` field on `/sessions`. The isolated MCS
L3 path is therefore pinned to supported Checkout v69 while ordinary Sessions
remain v72. It sends one known `MCS Foundations` line, product `MCSFOUND`,
UNSPSC `86132000`, quantity 1, unit `EA`, exact authoritative original/discount/
final amounts, and zero tax. Authentication forcing is absent. Provider Session
creation returned 201, a direct official-card TEST `/payments` returned
Authorised, and the full Adyen Web browser Session returned Authorised. Focused
123/123 and the broader payment/checkout suite 504/504 plus typecheck pass.
Independent Claude Sonnet/high reports no material findings. Immutable release
`94eafe1e` passed 805/805 plus runner 45/45 and is healthy/ready on Mini. One
isolated LIVE no-card check created the exact $299 v69/L3 Session and rendered
the empty Adyen card form. No card data was entered; the attempt has zero
payment events/admissions, and its one synthetic encrypted submission was
deleted with zero retained. No LIVE payment was created.

2026-09-12T23:20Z — NC-20260909-003 successful-return confirmation repair is
deployed and live-verified. The first natural simplified-checkout payment was
authorized, materialized and enrolled, but the immediate
`/internal/payments/returns` response omitted the already-available minimized
confirmation summary. WordPress therefore rendered enrollment success while
leaving Payment active and hiding receipt/paid-invoice actions. The return path
now includes the same capability-protected confirmation summary as status, only
for `confirming_payment`; terminal and review paths are unchanged. Focused
43/43, WordPress contract 111/111, typecheck, immutable release 805/805 plus
runner 45/45, and independent Claude Sonnet/high review pass. Exact release
`d1704c30` is healthy/ready on Mini. Reloading the original successful checkout
advanced it to Confirmation with the exact $1 purchase summary and all four
receipt/invoice download/email actions. No document/email was generated and no
payment was replayed. Production remains one authorization, one admission and
one active enrollment for the attempt.

2026-09-12T22:01Z — NC-20260909-003 simple checkout replacement is deployed
and nonfinancially verified. LIVE identity preparation now creates only an
encrypted deletable submission plus purchase-scoped references; it creates no
Party, interaction, order, enrollment, document, access job or notice. Exact
confirmed payment materializes a new Party per deliberate purchase (including
repeated identical email), then the existing atomic order/enrollment/access
path runs. Terminal nonpayment purges temporary PII; pending/ambiguous evidence
is retained and cannot start a second payment. Migration165 and focused
disposable proof passes. Tandemweb removes the browser pre-submit round trip,
successor retry UI and buyer-facing draft recovery. Claude R2 has no material
findings. Nano release `60e1ff16` and schema165 are healthy/ready on Mini;
Tandemweb checkout implementation `e4ada3df9` is live in current descendant
`08c466778`, with caches purged. A live no-card submission
opened the $299 Adyen form while PostgreSQL showed one encrypted submission,
zero materializations and zero synthetic Parties/interactions; the synthetic
temporary PII was then deleted and final counts returned to zero. Back unlock,
clean console and field-replacement regression pass; main MCS remains Stripe.
The next natural purchase is outcome proof; do not manufacture one.

2026-09-12T20:52Z — NC-20260909-003 owner-directed checkout simplification,
source owner Codex: every deliberate submitted form is a new purchase even when
all identity/course fields repeat. Same-request replay remains idempotent, but
email/Party ambiguity and prior checkout state must not block a new purchase.
The accepted Peri decision is
`.program/decisions/decision-mcs-prepayment-simplification-2026-09-12.json`.
Immediate incident repair qualifies the new-Party email parameter without
depending on `search_path`, removes the ambiguous-email purchase hold, adds an
explicit promo Apply action, and removes buyer-visible previous-draft language.
The larger target removes Party/order/enrollment materialization before payment:
pre-payment retains only the editable browser form plus one temporary encrypted
submission; confirmed Adyen payment triggers materialization, terminal
unconfirmed purges the temporary PII, and ambiguous payment remains held until
resolved. Main-page routing stays Stripe; no autonomous payment is authorized.

2026-09-12T12:31Z — NC-20260909-003 document self-service continuation,
source owner Codex: implement the immutable English MCS receipt/paid-invoice
snapshot, deterministic PDF, short-lived download capability and Gmail-backed
deduplicated email boundaries. Paid-invoice generation and activation remain
disabled unless the finance/legal configuration receipt is complete; consumer
receipt source and self-service may proceed. Preserve ordinary MCS Stripe
routing, the prior owner-test fulfillment exclusion, and owner operation of any
real payment. Backend source/migration/tests first, then WordPress actions,
bounded Sonnet/high review, immutable backend-first release and no-payment live
verification under Peri `work:mcs-foundations-deploy-ready`.

2026-09-11T23:05Z — NC-20260909-003 root continuation, source owner Codex:
the authorized LIVE rollout exposed an unwired shared-feed filter. Patch only
LIVE composition/runner plus regression tests; reuse existing whole-batch HMAC
verification and in-memory foreign-reference discard. No schema change. Both
production schemas are being installed separately; public routing remains
Stripe. Review/release correction before enabling the inactive LIVE webhook.

Status: shared current-state register
Protocol: `docs/CHANGE-PROTOCOL.md`
Last reviewed: 2026-08-29

Read this file before editing. Entries describe non-trivial work that may exist
outside the current client conversation.

## Active work

| `NC-20260909-003` | Complete reusable MCS Foundations one-time card/ACH deployment readiness | Codex coordinator + bounded writers + Claude reviewer | `codex/adyen-webhook-live-20260909` source `1a1f3b8d` plus reviewed/deployed isolated English card TEST service; live `75d5b6c1` unchanged; dirty primaries preserved | `validating` | C5 | English MCS card TEST now joins signed Session/return/status/retry/pre-submit, v2 attribution, September 11 Terms, native HMAC lifecycle, exact method provenance, canonical enrollment and owner-approved Heartbeat delivery. Final native 3DS produced one verified result, one successful authorization, one exact card binding, one active enrollment/component and one verified membership projection; status reload created no duplicate and earlier conflicts remain immutable. | Commit/push the existing task branch after continuity closure. TEST does not prove settlement, email, learner login or LIVE readiness. LIVE activation/config/schema/provider/deploy remain separately gated; ACH and other populations remain later. Program `work:mcs-foundations-deploy-ready` at Peri. | 2026-09-11T19:05Z |
| `NC-20260911-001` | Add bounded customer retry after exact terminal card nonpayment | Codex backend worker + bounded Claude reviewer | Same dirty checkout; tentative local migration 159 only | `in_progress` | C5 | Exact authenticated Session terminal receipt, maximum sequence 3, one successor per predecessor receipt, exact-operation opaque return binding, strict webhook sequence correlation, and late-positive diversion before fulfillment. Preserve immutable quote and every operation. | Source/tests/review only. No WordPress edit, migration apply, provider/database/runtime/config action, payment, commit, push, or deploy. | 2026-09-11T19:00Z |

| `NC-20260908-001` | Make customer-support threads quiet, literal, and bounded after the Pierre access incident | Codex + Claude reviewer | `codex/sales-support-thread-20260908` from exact live code `013b1d86` plus release docs `55c068d2`; dirty primary preserved | `ready_for_deploy` | C3 | Reviewed operator-instruction semantics/browser prohibition, resolved-support no-action, one processing receipt per exact input, private card repair feedback with fallback, Sales final-text suppression plus clean-empty notice, query-token redaction, and reply-subject normalization. Focused 174/174, email-critical 803/803 plus runner 45/45, replay 13/13, build/typecheck/format/runtime doctor pass; three full-root failures reproduce unchanged on base. No customer message, approval, provider/business-data mutation, migration, schedule, payment, or manufactured lead. | Commit/push, build and verify immutable release, safely activate after current work drains/adopts, verify exact health/prompt hashes and compiled non-sending canaries. | 2026-09-09T20:00Z |

| `NC-20260907-007` | Expand governed student-catalog publication to the current MCS checkout population | Astra owner + Sol High writer + Claude reviewer | NanoClaw live `013b1d86d884`; Tandemweb live/main `5ed4a462a3a1`; Toolbox isolated `778a60e`; dirty primaries preserved | `complete` | C4 | Scoped v2 resolver/publication covers the exact current ALT MCS admitted-price family, preserves primary and unqualified/retired ALT history on Product Map, and keeps both supervision routes unchanged. Exact immutable/static artifacts, one guarded operational prompt, focused/full gates, bounded review, and live readbacks pass. No flat-array cross-account projection, payment, customer/student row, roster/access/capacity/schedule/message/migration/provider-product mutation, source-sync convergence, or manufactured canary. | None for this population. Broader catalog coverage and natural enrollment outcomes remain future work; source sync stays paused. | 2026-09-08T02:58Z |

| `NC-20260907-006` | Implement and activate the reviewed two-route student catalog publication contract | Astra owner + Sol High writer + Claude reviewer | NanoClaw live `c5fdf5f6d9d5`; Tandemweb live `9d708ec4d940` over preserved educator-keyword base `636129a3`; source branches pushed; dirty primaries preserved | `complete` | C4 | Exact supervision inaugural/regular schema, source-reference manifest, cohort-aware deterministic generator, pinned NanoClaw compatibility output and Tandemweb static validation consumer, guarded Mini-only stale-source mirror repair, focused/full checks, bounded Sonnet/high review, immutable consumer releases and exact readback. No paid-event/provider/business mutation, enrollment replay, access/roster/customer/payment/class/capacity/schedule change, message, migration, or broader product rollout. | None for publication. Future `work:tandemweb-checkout-source-sync-convergence` must reconcile the pre-existing concurrent Syncthing file versions before anyone unpauses Mini; that work is not authorized here. | 2026-09-07T23:41Z |

| `NC-20260907-002` | Add selective consultative Sales dialogue while preserving direct answers | Codex + Claude reviewer | `codex/sales-consultative-dialogue-20260907` from exact live `aa73538c8450`; dirty primary preserved | `in_progress` | C3 | Sales decision/playbook/continuity, bounded manual-review protection, generated conversation evaluation, focused/full checks and immutable release. No customer send, follow-up cadence change, new provider access or schema migration. | Implement against accepted owner examples; verify continuity and direct/mixed/exploratory responses; obtain bounded Sonnet review and deploy with non-sending live proof. | 2026-09-07T14:14Z |

| Task ID           | Outcome                                                                                                                                                                                                                                   | Owner/client                                             | Branch @ base                                                                                                                                                                                                                  | Status                | Class | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Next action                                                                                                                                                                                                                                                                                                                                                             | Updated           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `NC-20260907-001` | Repair supervision registration and replace name-dependent product identity with a catalog-bound bridge                                                                                                                                   | Codex + Claude reviewer                                  | `codex/product-identity-20260907` from live-lineage `f5adc8cc`; primary preserved                                                                                                                                              | `in_progress`         | C4    | Exact case 63 repair, source identity audit, deterministic bridge, tests/review and established release. No broad replay, new enrollment writer activation, customer communication or inferred supervision capacity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verify repair; implement source-bound identity and explicit conflicts; review, deploy and reconcile cross-provider follow-ups.                                                                                                                                                                                                                                          | 2026-09-07T14:00Z |
| `NC-20260906-004` | Prevent Sales approval drafts from contradicting the current authoritative program schedule or canonical program facts                                                                                                                    | Codex + Claude reviewer                                  | pushed `codex/sales-fact-consistency-20260906`; deployed `663b63be2035` from final Capacity lineage `0102dfb5`                                                                                                                 | `complete`            | C3    | Host-owned, fail-closed factual-consistency control is live at IPC, Slack, approval-arm, host-rescue, and Gmail execution boundaries. It parses the fresh operational schedule, retains per-program attribution, checks immutable Supervision tuition, rejects missing/stale/contradictory/unsupported or ambiguous claims, and replays the exact 2026-09-06 defect. Claude R1's evidence-pooling finding is corrected; R2 returned no material findings. Final focused 218/218, email replay 13/13, email-critical 770/770, runner 45/45, typecheck/runtime doctor/continuity, and full root 3,604 passed / 32 skipped with only two unchanged predecessor failures. Live compiled canary rejects the bad sentence with both expected codes and accepts the corrected March/July/$4,796 statement; health, release identity, channels, one listener, empty queues, and zero active send states are verified.                                                                                                                                                                                                                                                                                                                                                                           | None. Observe the next natural schedule-dependent Sales draft as business-outcome evidence; do not manufacture or send a customer email for validation.                                                                                                                                                                                                                 | 2026-09-06T22:02Z |
| `NC-20260906-005` | Replace the planned real-time reservation cutover with simple committed-seat status synchronization for cached Academy pages                                                                                                              | Codex + Claude reviewer                                  | NanoClaw `aa73538c` over live Sales `663b63be`; Tandemweb `9e189a79e`; Company OS `work:academy-capacity-simple-status-sync` completing from r222                                                                              | `complete`            | C5    | Simple sync is live: mapped successful web sales and explicit operator promises become durable commitments; capacity changes and commitment/assignment moves are versioned; daily/threshold state publishes signed available/sold-out to local WordPress; only affected cached URLs purge/prewarm. All five initial states delivered with acknowledgements. ACC September 7 is 21/12 sold out, MCS Friday 13/12 sold out, MCS Thursday 5/12 available, and Rita remains in January Thursday. Cached pages are Cloudflare HIT; live checkout excludes September 7 for $399, $3,999, and $7,499. Claude findings are corrected and focused/full/release checks pass with only unchanged baselines. No financial/customer/provider/roster or automatic waitlist action ran.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None for Gate E. Continue ordinary daily reconciliation; Gate F authority cutover and any automated waitlist outreach remain separate owner decisions.                                                                                                                                                                                                                  | 2026-09-06T23:44Z |
| `NC-20260906-003` | Release the Gate D Academy Capacity minion and bounded operator workflow over the populated production shadow                                                                                                                             | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-prevention-20260906` @ `5b8020e0`; exact live NanoClaw `da2869fbc655`; Company OS `work:academy-capacity-minion-operator-workflow` complete at r217                                             | `complete`            | C5    | Owner-authorized Gate D only is live: strict host-owned inventory/enrollment reads; case/receipt-backed manual holds/releases, transfers, withdrawals, reconciliation, and FIFO waitlist staging; narrow private Capacity minion; exact idempotency, stale-version, missing-reference, and ambiguity refusal. Migration 144, Node-22.23.2 image, private group registration, capability enforcement, operator switch, natural inventory canary, final bounded prompt, immutable release, live health, and zero-mutation SQL readback are verified. Claude R2 has no material findings. No checkout/Tandemweb/public cutover, provider or Sheet write, customer message, automatic waitlist promotion, refund, payment, certificate, or assignment/capacity authority cutover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None for Gate D. Gate E/F remain separate and require a new accepted work item before public checkout or provider integration.                                                                                                                                                                                                                                          | 2026-09-06T21:41Z |
| `NC-20260906-002` | Apply the reviewed Academy enrollment/capacity schema and exact current population to production in shadow mode                                                                                                                           | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-prevention-20260906` @ `6c398329`; migration artifact `a9839d92`; exact live daemon remains `886e25873072`; Mac Mini production PostgreSQL                                                      | `complete`            | C5    | Production backup, verified current-lineage artifact, migrations 142-143, and idempotent source-bound population are complete: five delivery blocks, 40 assignments, 310 entitlements, three held exceptions; exact replay inserted zero. Readback is ACC 21/12 sold out, MCS Thursday 5/12 open, MCS Friday 13/12 sold out, January Thursday 1/12 open, January Friday 0/12 open; 112/112 target objects are admin-owned with zero non-admin grants. No checkout, provider/Sheet/public website, waitlist, message, refund, certificate, payment, runtime/minion consumer, or authority-cutover change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None for production shadow population. Gate D operator/minion work is separately authorized under `NC-20260906-003`; Gate E/F remain separate.                                                                                                                                                                                                                          | 2026-09-06T19:06Z |
| `NC-20260906-001` | Settle Rita's Friday-to-January transfer and turn the September 7 ACC reconstruction into exact source records                                                                                                                            | Codex + Claude reviewer                                  | NanoClaw pushed `codex/academy-capacity-prevention-20260906` @ `a2d6b50b`; Tandemweb pushed `codex/capacity-roster-floor-20260906` @ `56bb8f6ee`; Toolbox local `codex/heartbeat-remove-group-membership-20260906` @ `8d996dd` | `blocked`             | C4    | Owner-authorized source repair is applied and read back. Rita is conclusively January Thursday and barred from returning as an exception. ACC September is explicit at 21/12: 9 paid Module 1, 11 paid ACC Full, 0 Professional, one assigned Module 1 funding gap. MCS payment source and assignment origin are separate; Friday funding reconciles to all 13 rows and remains sold out for the distinct owner-count variance. No refund, message, certificate, payment, public deployment, production DB, runtime/minion, migration, or cutover action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Resolve only three held facts before database population: the separate 13th Friday MCS row versus owner count 12, one ACC Module 1 funding source, and one exact roster/Heartbeat email alias. Toolbox has no configured remote and its clean local commit cannot be merged into the overlapping dirty primary worktree automatically.                                  | 2026-09-06T16:53Z |
| `NC-20260905-010` | Prevent future Academy oversales by enforcing owner-confirmed capacity and a roster-derived occupancy floor                                                                                                                               | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-prevention-20260906` @ `23ad8b94`; Tandemweb `codex/capacity-roster-floor-20260906` @ `6509cef2`                                                                                                | `blocked`             | C2    | First prevention slice complete: September 7 capacity 12; 21/12 overage 9 and held 22/12 overage 10; Company OS evidence/validator hardened; Tandemweb owner estimates and negative payment adjustments cannot lower roster occupancy; one participant remains one shared seat; remaining source-resolution plans are owned. Claude returned no material findings; focused checks pass. No Student Roster, Payment Log, provider, production DB, public website, cohort, waitlist, runtime, minion, migration, deployment, backfill, communication, or authority-cutover write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Separately authorize exact source repairs for the May 27 boundary, 11 Full Program offer bindings, eight funding gaps, missing combined-program projections, and probable MCS Friday history; then verify each provider write by exact readback before any population/cutover.                                                                                          | 2026-09-06T15:46Z |
| `NC-20260905-009` | Reconstruct the September 7 ACC shared-pool population across every offer and payment channel without double-counting projections                                                                                                         | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-sales-reconstruction-20260905`; correction/validator/evidence `3d900ac0` from read-only reconciliation closure `5aad43a9`; Tandemweb evidence `4e01dc896`                                       | `complete`            | C2    | Corrects rather than rewrites NC-008: 8 explicit plus 13 operationally bounded unlabeled rows yield 21 unique shared-pool seats, with a held May 27 row making the upper boundary 22. The 21 split into 10 Module 1 and 11 Full Program roster routes; Payment Log exactly identifies 8 Module 1, 5 ACC Full, and 0 Professional Coach, leaving 8 unclassified. No candidate intersects PCC, ACTC, or the Professional Coach Heartbeat group, so missing `$7,499` offer/projection facts remain exceptions and add no seats. Rita remains in January with probable Friday origin. Aggregate/hash-only evidence, applied schema, validator, 13 tests, and Claude review complete. No provider, roster, payment, email, website, database, cohort, runtime, minion, migration, deployment, communication, or authority write.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | None for read-only reconstruction. The revision-199 source-write resolution candidate remains unauthorized and must resolve the 21-versus-22 boundary, numeric capacity, 11-row full-offer split, eight funding gaps, and missing combined-program projections before population or cutover.                                                                            | 2026-09-06T01:12Z |
| `NC-20260905-008` | Reconcile the September 2026 MCS and ACC shared-start capacity facts across current authoritative sources without changing them                                                                                                           | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-readonly-reconciliation-20260905`; report/validator/evidence `c0779fcb` from reviewed capacity proof `0b3129cc`; Tandemweb evidence lineage `4e01dc896`                                         | `complete`            | C2    | Read-only source evidence is hash/aggregate bound and machine validated: MCS Thursday 5/12 open; MCS Friday 13/12 fail-closed sold out; January destination evidence retained with disputed origin; ACC September 7 sold out with eight assignments but unknown capacity and collapsed offer/funding attribution. Seven owned exceptions prevent blind import. R1 findings were corrected and R2 returned no material findings. No provider, roster, database, website, cohort, waitlist, runtime, minion, message, migration, deployment, or authority write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None for read-only reconciliation. Resolve the seven source exceptions only under the revision-195 not-authorized source-write candidate before production population, minion, Bookkeeper or Tandemweb integration, waitlist action, deployment, or authority cutover.                                                                                                  | 2026-09-05T22:45Z |
| `NC-20260905-007` | Prove migrations 142 and 143 together in generated disposable PostgreSQL before capacity reconciliation                                                                                                                                   | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-disposable-proof-20260905`; verifier/evidence `7091d120` from capacity tip `b7b95824` plus corrected enrollment verifier `01351538`                                                             | `complete`            | C2    | Reused the pinned/stripped/generated-only verifier; ordered migration apply; seven tables/one view/seven sequences with ownership/grants; synthetic shared-pool offers, assignment, live/expired/consumed reservations, five reason-matched refusals, populated retention, explicit coupled-assignment cleanup, empty rollback/reapply, and zero residue. Two Claude rounds converged after correcting implicit cascade cleanup and adding CLI residue readback. No production, real student/provider/roster/payment/cohort/runtime/message/deployment access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None for the disposable proof. Read-only real-source reconciliation remains a separate owner gate; production migration, integrations, operator/minion activation, outreach, deployment, and authority cutover remain separately gated.                                                                                                                                 | 2026-09-05T22:12Z |
| `NC-20260905-005` | Implement the accepted Academy capacity extension as local, reversible, default-off source on the reviewed enrollment foundation                                                                                                          | Codex + Claude reviewer                                  | pushed `codex/academy-capacity-extension-20260905`; implementation `5b69e107` from exact predecessor `deac91a8` plus accepted architecture lineage                                                                             | `complete`            | C2    | Migration/rollback 143, seven admin-only tables plus occupancy view, pure command domain, one-delivery-block pools, multi-offer mapping, checkout/manual/internal-waitlist reservations, assignment-derived occupancy, close/reopen, atomic transfer/withdrawal, FIFO waitlist lifecycle, least privilege, exact replay, review, and provenance-bearing release package are complete. No migration apply, real student inspection/reconciliation, live cohort change, provider/runtime/checkout/Bookkeeper/Sheet wiring, minion activation, message, deployment, or authority cutover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None for the local capacity foundation. `work:academy-capacity-disposable-schema-proof` now gates reconciliation after the enrollment disposable proof; production migration, integrations, operator/minion activation, outreach, deployment, and authority cutover remain separate.                                                                                    | 2026-09-05T21:20Z |
| `NC-20260905-006` | Prove migration 142 in a generated disposable PostgreSQL database before any production or real-student gate                                                                                                                              | Codex + Claude reviewer                                  | pushed `codex/student-enrollment-disposable-proof-20260905`; verifier/evidence `04695633` from exact reviewed dark-foundation tip `deac91a8`                                                                                   | `complete`            | C2    | Credential-free fail-closed verifier pins local PostgreSQL and strips ambient `PG*`; generated-prefix/new-database-only safety; minimal prerequisites; migration apply, 13 table/sequence/view ownership/grants, synthetic valid/invalid transitions, reason-matched append-only/constraint/rollback refusal, empty rollback, reapply, cleanup, two Claude rounds, tests, commit/push. No `nanoclaw_business`, real student/provider/runtime/deployment/communication access.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None. The separately authorized capacity proof may now validate migrations 142 and 143 together; production migration and all real-data/provider/runtime gates remain separate.                                                                                                                                                                                         | 2026-09-05T21:48Z |
| `NC-20260905-003` | Implement the reviewed multi-source enrollment model as a local, reversible, default-off dark foundation before any reconciliation or live data change                                                                                    | Codex + Claude reviewer                                  | pushed `codex/student-enrollment-dark-foundation-20260905`; implementation `9e5bfeda` from foundation `1d77ae5a`                                                                                                               | `complete`            | C2    | Conservative policy revision 1, contract revision 2, migration/rollback 142, 13 admin-only tables plus aggregate view, and a pure unwired command engine cover source/evidence, incomplete orders, seats, participants, entitlements, obligations, assignments, outbox/readback, recurring exceptions, order states, and transfers. Two Claude rounds' material findings are corrected. No migration apply, real student inspection/reconciliation, backfill, adapter/provider/runtime wiring, deployment, or communication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for the local dark foundation. Disposable/production schema application, ingress adapters, reconciliation, projections, backfill, deployment, and communication remain separate owner-gated work.                                                                                                                                                                  | 2026-09-05T20:32Z |
| `NC-20260905-004` | Adopt the accepted Academy capacity architecture into Company OS without creating a parallel enrollment, entitlement, or schedule authority                                                                                               | Codex; prior architecture reviewed by Claude Sonnet/high | pushed `codex/academy-capacity-adoption-20260905` @ `38106bc6` from enrollment-foundation tip `1d77ae5a`; Company OS revision 177                                                                                              | `complete`            | C1    | Accepted architecture is reconciled with the entitlement/enrollment foundations; one delivery block per pool, assignment-derived occupancy, checkout/manual reservations, separate refund/withdrawal, atomic transfer, human-approved FIFO outreach, signed Tandemweb projection, and narrow host-command Capacity minion are authoritative design. Six implementation slices are canonical unauthorized candidates. No schema/runtime/provider/student/roster/waitlist-message/deployment mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None for architecture adoption. `work:academy-capacity-extension` waits on the active enrollment dark foundation, remaining pre-build policy decisions, and a separate Gate B authorization.                                                                                                                                                                            | 2026-09-05T19:55Z |
| `NC-20260905-002` | Converge with Claude on a provider-neutral, machine-validated multi-source student enrollment process and foundation before any reconciliation or data change                                                                             | Codex + Claude reviewer                                  | pushed `codex/student-enrollment-foundation-20260905`; foundation `ca544654` from entitlement catalog `ba4437be`                                                                                                               | `complete`            | C1    | Revision 1 defines order -> one-or-many seats -> exact participant enrollment; separate entitlements, class assignments, financial agreements/obligations, source aliases, projection receipts, and durable exceptions; eight ingress channels, eleven commands, and ten synthetic scenarios. R1 material findings and R2's residual assertion are fixed. No historical population inspection, reconciliation, backfill, student/provider/database/runtime change, deployment, or communication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None for foundation revision 1. Owner decisions and every dark schema/runtime, reconciliation, operator pilot, provider projection, backfill, deployment, and communication gate remain separate.                                                                                                                                                                       | 2026-09-05T19:08Z |
| `NC-20260905-001` | Reconcile every active full-program promise into a versioned, source-bound entitlement manifest before classifying or creating Heartbeat cohort-marker groups                                                                             | Codex + Claude reviewer                                  | pushed `codex/student-entitlement-catalog-20260905`; NanoClaw `64f48df8` + review record `8a0d3b10`; courses `419981a1`; exact live base `886e25873072`                                                                        | `complete`            | C1    | Revision 1 contains 42 typed components, six bundle definitions, seven active/future complete-program offers, exact known provider identities, source/evidence status, 20 explicit open questions, and six conflict dispositions. Company OS owns cross-provider enrollment/entitlement state; Plutio is an operator projection. Permanent Heartbeat access groups remain separate from future hidden zero-content markers. No student/member data, group creation, membership/access change, provider write, sheet mutation, message, flow, deployment, or runtime change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | None for catalog revision 1. Exact quantity decisions, database materialization, existing-marker reconciliation, roster/Encharge projection, and any Heartbeat group or membership action remain separately gated.                                                                                                                                                      | 2026-09-05T16:52Z |
| `NC-20260904-001` | Restore Stripe-to-Bookkeeper delivery after Cloudflare blocked a live MCS payment, then close the exact payment through verified roster and cohort readback                                                                               | Codex + Claude reviewer                                  | `codex/stripe-webhook-recovery-20260904` from exact live `a00edaeb7d97` in an isolated worktree                                                                                                                                | `ready_for_deploy`    | C5    | Exact managed-WAF-only skip rule is active for the Stripe n8n POST path; the original event was resent and returned 200; case 55 completed with all six receipts and Beril Esendal is read back on MCS row 192. The reviewed source restores the previously untracked cohort resolver/writer, supports current split cohort metadata, scopes legacy matching to explicit MCS evidence, preserves operator values, requires Sheet/Postgres readback, and makes the resolver a release-build dependency. Focused 160/160, typecheck/build/continuity, and full 3,440-pass baseline complete; Sonnet/high R1's one material scope finding is corrected and R2 returned no material findings. Preserve all other Cloudflare controls, payer/student boundaries, unrelated payments, and dirty worktrees.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Commit/push and immutable-release the exact descendant, deploy after drain, then repair only Beril's exact cohort through the reviewed processor and read back MCS J192 plus `public.payments.cohort`.                                                                                                                                                                  | 2026-09-04T20:49Z |
| `NC-20260903-002` | Make every actionable inbound customer email produce one durable, correctly bound owner work item instead of splitting classification, Sales response, and Chief escalation across model-dependent paths                                  | Codex + Claude reviewer                                  | `codex/support-routing-integrity-20260903` merged onto exact current live release `5942196f`                                                                                                                                   | `ready_for_deploy`    | C5    | Canonical policy/migration, typed host-bound classification, exact source reload, support/refund Sales ownership, Chief reply-work removal, turn-aware Gmail denial semantics, restart-safe missing/unrouted reconciliation, archive/routing separation, and late-fallback dedupe are reviewed and locally verified. Claude R1-R4 findings are corrected with no unresolved material issue. Typecheck/build, email-critical 750/750, replay 13/13, runner 45/45, focused gates, continuity/capability, and the exact full-root baseline pass. Preserve every approval, Action-ID, recipient/CC, Gmail execution, and receipt gate. No customer email, approval, provider write, or payment action is authorized.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reverify and package the combined descendant, apply/read back migration 141, drain active email work, activate and live-verify no-send behavior, then recover only exact still-stranded overnight support work.                                                                                                                                                         | 2026-09-03T14:10Z |
| `NC-20260902-001` | Make Sales and every minion consume current, provenance-bound business facts plus live schedules and learned corrections without weakening immutable release instructions                                                                 | Codex + Claude reviewer                                  | pushed `codex/sales-knowledge-runtime-20260902`; exact live release `658b4730`; prior `8df61d98`                                                                                                                               | `complete`            | C3    | Release-owned instruction precedence is limited to Procurement; every ordinary business KB again uses its configured operational mount. Coaching Supervision Mastery is hash-bound as live/enrolling AACS authority with checkout/stale-negative gates across 14 live consumers. Build/activation verify the effective target. Focused 92/92, Python 8/8, email-critical 748/748, runner 45/45, full 3,394 pass/32 skip with two exact base failures, continuity, exact archive verification, and Sonnet/high `GO` pass. Live PID/listener/release/channels/queues, exact Sales operational and Procurement release mount plans, zero detector findings, preserved Schedule/Learned hashes, and the corrected unapproved Lead #1311 card are verified. No customer email was sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None. The corrected Lead #1311 draft remains behind normal human approval; rollback to `8df61d98` is incident-only because it restores the stale mount.                                                                                                                                                                                                                 | 2026-09-02T13:24Z |
| `NC-20260903-001` | Stop transient Student Roster failures from masquerading as unmapped products; audit at least one month of Gru Bookkeeper transactions, replay every affected classification safely, and close the underlying retry/terminal-state defect | Codex + Claude reviewer                                  | `codex/gru-bookkeeper-retry-20260903` @ exact live `658b473061a3` (isolated worktree; dirty primary preserved)                                                                                                                 | `validating`          | C4    | The 2026-08-03 through 2026-09-03 audit found 20 flagged objects among 96. Two missing aliases were added/read back; ten exact archived transactions now have complete host-owned cases; eight stale in-window Sales rows were cleared after roster proof. Local source adds safe GET retry, durable webhook retry, truthful classification, catch-all cleanup, restored non-student/renamed-tab routing, Plutio participant holds, and prompt correction. Focused 149/149; typecheck/build/format/continuity pass; full 3,414 with two exact base failures. Sonnet/high R1B found no material issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Commit/push, build and independently verify the exact immutable release, deploy after a natural drain, and verify a controlled transient-read retry plus current case/roster/channel health.                                                                                                                                                                            | 2026-09-03T13:02Z |
| `NC-20260830-001` | Keep grader discrepancy notices in the exact submission thread and prevent operator-only decisions from disappearing as suppressed final text                                                                                             | Codex + Claude reviewer                                  | pushed `codex/grader-thread-routing-20260830`; exact live release `8df61d98`; prior `d834cb2f`                                                                                                                                 | `complete`            | C3    | Exact-run thread binding and discrepancy-tool instructions are live. Pinned Node focused 74/74, typecheck, format, build, continuity, release-cri…189823 tokens truncated…ture catches the committed
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

