# Student lifecycle decision register

Status: strategy register, version 1, 2026-09-07

Task: `NC-20260907-003`

Strategy: `docs/STUDENT-LIFECYCLE-STRATEGY.md`

This register distinguishes settled strategy from choices that still need
source evidence or owner authority. It does not grant production, provider,
financial, student, communication, migration, deployment, or `.program` state
authority.

## Settled for this strategy

| ID | Decision | Authority/evidence | Effect |
| --- | --- | --- | --- |
| `SLD-001` | Extend the existing entitlement, enrollment, capacity, and Company OS foundations. Do not create a parallel student master in Sheets, Plutio, Heartbeat, or CoachGrader. | Astra strategy brief; accepted lifecycle/enrollment designs | Company OS joins canonical work; each provider keeps authority for its native facts. |
| `SLD-002` | Model provider bindings as typed, scoped, versioned, source-bound relationships. A native ID is not assumed to identify one offer. | Astra strategy brief; `docs/STUDENT-PRODUCT-IDENTITY.md` | Ambiguous product/price/group/course/contract relationships are held and owned, never guessed from names, amounts, or shared access. |
| `SLD-003` | One installment agreement creates one order with many obligations and receipts. The fully settled first pilot proves several aliases of one funding receipt; later financial semantics prove several distinct installment payments. | Astra strategy brief; enrollment foundation | Payment aliases and later obligation receipts cannot multiply orders, participants, enrollments, or seats; the later policy proof does not block or broaden the first pilot. |
| `SLD-004` | Migrate coverage by bounded population through a staged ratchet. | Astra strategy brief | Legacy dispositions are explicit and time-bounded; the allowlist cannot silently grow; strict publication expands only after proof. |
| `SLD-005` | Preserve committed-seat simple sync. Do not restore synchronous checkout reservations, short-lived holds, or a live checkout dependency on NanoClaw. | Accepted `.program/decisions/decision-academy-capacity-simple-sync-strategy-2026-09-06.json` | Capacity uses committed seats, daily reconciliation, threshold publication, targeted cache refresh, and operator adjustment while accepting the recorded small race risk. |
| `SLD-006` | Integrate the reviewed enrollment/admission branch deliberately with the current live supervision bridge lineage before a pilot. | Astra strategy brief; Git ancestry and overlap inspection | Start from current release lineage; preserve `138e43ab`; integrate reviewed local commits through `8b1ffbb9`; reconcile shared continuity files by meaning; do not treat either branch as a complete production line. |
| `SLD-007` | Continue lifecycle governance beyond enrollment through documented participation/progress, assessment, completion, and separately authorized actions. | Astra strategy brief; lifecycle control plane | Group/access membership is not progress. CoachGrader supplies assessment evidence without becoming the student master. Certificate, service, consent, suppression, approval, and `NO_ACTION` gates remain. |
| `SLD-008` | Use Astra for strategy and acceptance, one explicit Sol High execution writer, and Claude Sonnet/high independent review. | `docs/MODEL-ROUTING-POLICY.md` | Model routing changes no program claim, runtime permission, business authority, or release gate. |
| `SLD-009` | Build and review the selected provider projection path before routing any real event to the new writer; activate canonical admission and projection/readback in one exact bounded rollout while retaining separate evidence milestones. | Astra strategy correction after R1 | If both activation authorities are not ready, preserve the existing route. Projection foundation is a local prerequisite; live projection reconciliation follows canonical admission without an unrelated phase or another event in between. |

## Open decisions and safe holds

| ID | Decision owner | Evidence required | Phase | Safe behavior until resolved |
| --- | --- | --- | --- | --- |
| `SLO-001` | Academy/program owner | Accepted supervision schedule, explicit capacity authority, exact participant roster/source, and current commitment comparison | 1 and 4 | Do not infer capacity from roster size or assign a student. Count verified funded commitments and keep the episode in an owned hold. |
| `SLO-002` | Finance and Academy owner | Native agreement schedule; which states reserve/hold entitlement and class commitment; cancellation, arrears, refund, dispute, deferral, and withdrawal rules; accounting treatment boundary | 3 and 5 | Admit only the already proved fully settled slice. Keep later installments on one agreement, continue independent accounting, and hold registration/projection when policy is absent. |
| `SLO-003` | Academy/program owner | Sponsor contract or accepted grant, authoritative seat count, participant confirmation per seat, replacement/transfer policy, and service-allowance consumption evidence | 5 | Preserve verified funded seats and allowances separately; materialize only independently proved participants; do not convert a payer or unused service into a student/class seat. |
| `SLO-004` | Commercial/product owner with source owners | Account-scoped Stripe products/prices, exact checkout/contract context, Plutio references, Heartbeat relationship type, historical effective periods, and MCS dated-slug/`mcs-full` evidence | 1 and 2 | Mark the relationship unresolved or preserve an explicit temporary legacy disposition. Do not delete historical aliases or reverse-map shared groups into purchases. |
| `SLO-005` | Program owner at the exact bounded rollout gate | Current live lineage; selected population; native issuer/operator authentication; credential handling; production data/locking; migrations 146/147; both writer paths; rollback; selected provider target/permissions; and separate canonical plus projection/readback natural-event criteria | 3 and 4 | Keep the store disposable-only, migrations unapplied, existing writers unchanged, and the new route off until canonical plus projection activation are both prepared, reviewed, and authorized. If either is missing, do not divert the event. Never replay the repaired legacy event or call canonical-only evidence end to end. |
| `SLO-006` | Operations owner | Baseline exception volume/age, natural event cadence, available operator channel, severity and escalation evidence, provider rate/availability constraints | 6 | Keep each exception durably owned with freshness and next-review time. Do not invent service targets or notify on every unchanged reconciliation. |
| `SLO-007` | Program/data owner | Supported provider APIs/webhooks for participation and progress, assessment identity contract, completion evidence, retention, and exact action-specific authority | 7 | Report progress as unavailable when unsupported. Do not use access/group membership as progress or let CoachGrader, a certificate, or a marketing flow become the student master. |

Technical facts that can be settled from authoritative sources stay within the
read-only reconciliation task. The owner is asked only for business meaning,
policy, authority, or risk choices that source evidence cannot decide.

## Portfolio mapping adopted at revision 247

Astra applied these four reviewed candidate definitions to primary
`.program/state.json` at revision 247 after R2. They remain candidates and do not
authorize or replace any current item. Current program state remains authority;
the descriptions below explain the mapping and are not another execution queue.

### `work:student-product-catalog-source-reconciliation`

- Title: Reconcile student product catalog sources and dispositions.
- Contribution: Produce the first complete, privacy-minimized, read-only
  inventory of sellable variants/locales and typed native relationships, with
  explicit fulfillment and legacy dispositions before strict coverage expands.
- Parent outcome: `outcome:inbox-resolution`.
- Registered priority: 24.
- Dependencies: `work:student-lifecycle-strategy-and-model-routing`.
- Registered status/authority: `candidate`, `internal_reversible`, authorization
  not required for the bounded read-only/repository work; execution still waits
  for Astra to accept the packet's exact source/privacy/time boundary and apply
  the portfolio delta.
- Completion: Every selected source item has an evidence-bound treatment and
  relationship disposition; ambiguous items have owner, reason, affected
  population, safe hold, and review trigger. No source write occurs.
- Downstream change: add this item as a dependency of
  `work:student-product-identity-coverage-rollout`,
  `work:supervision-enrollment-capacity-reconciliation`, and
  `work:student-enrollment-production-admission-pilot`.

### `work:student-enrollment-financial-agreement-semantics`

- Title: Prove enrollment financial agreement and receipt semantics.
- Contribution: Specify and prove one-order/multiple-obligation receipt identity,
  plus refund, dispute, withdrawal, sponsor, transfer, grant, and service-
  allowance behavior without broadening the fully settled first pilot.
- Parent outcome: `outcome:inbox-resolution`.
- Registered priority: 24.
- Dependencies: `work:student-product-catalog-source-reconciliation` and
  `work:bookkeeper-capacity-enrollment-contract`.
- Registered status/authority: `candidate`, `internal_reversible`, authorization
  not required for local design/disposable proof; business policy and all
  production/financial effects remain owner-gated.
- Completion: Accepted business rules map to deterministic positive, duplicate,
  conflict, reversal, partial-sponsor, and no-projection cases. One agreement's
  multiple receipts cannot create multiple orders, enrollments, or seats.
- Downstream change: payment-plan and other finance-family expansion depends on
  this item; it is not folded into the fully settled supervision pilot.

### `work:student-enrollment-projection-foundation`

- Title: Prepare enrollment provider delivery before a paid-event pilot.
- Contribution: Make selected projection adapters, exact readback and rollback
  ready before new paid events enter canonical admission, so an engineering
  milestone cannot leave a participant deliberately unfulfilled.
- Parent outcome: `outcome:inbox-resolution`.
- Registered priority: 24.
- Dependencies: `work:student-product-catalog-source-reconciliation`,
  `work:student-enrollment-transactional-store`, and
  `work:student-enrollment-authenticated-source-admission`.
- Registered status/authority: `candidate`, `internal_reversible`, authorization
  not required for local/disposable source and tests; no provider or production
  write is included.
- Completion: Reviewed local/disposable implementation and positive/negative
  proofs make destination identity, exact readback, retries, uncertain acceptance,
  no duplicate effects, and rollback ready for the selected pilot with pinned
  code and no live provider/student write.
- Downstream change: add this item as a prerequisite of
  `work:student-enrollment-production-admission-pilot`. A real event is not
  diverted until this foundation and the same rollout's canonical/provider
  activation authority are ready.

### `work:student-enrollment-projection-reconciliation`

- Title: Reconcile enrollment provider projections and uncertain acceptance.
- Contribution: Compare canonical admitted promises with required provider
  projections, exact readback, retries, uncertain acceptance, and owned gaps so
  legacy writers can retire by proven population coverage.
- Parent outcome: `outcome:inbox-resolution`.
- Registered priority: 24.
- Dependencies: `work:student-enrollment-production-admission-pilot` and
  `work:student-enrollment-projection-foundation`.
- Registered status/authority: `candidate`, `external_consequential`, authorization
  required and not authorized; source reads and every target write or retry are
  separately authorized.
- Completion: No unowned gap in the admitted population; each target version is
  verified, held, or reconciliation-required; uncertain acceptance blocks retry;
  legacy retirement has exact coverage and rollback evidence.
- Activation order: verify live projection activation/readback in the same
  bounded rollout as canonical admission before any unrelated installment-family
  expansion. A paid event is not diverted while required delivery is unavailable.
- Preserved work: do not replace `work:student-lifecycle-control-plane-build`,
  `work:academy-capacity-simple-status-sync`,
  `work:academy-capacity-authority-cutover`, or lifecycle action/minion items.
  Full Academy assignment/capacity authority cutover becomes dependent on this
  verified projection reconciliation.

At review start, revision 246 had 17 candidates. Revision 247 has 21 after these
four registrations. Candidate count is a review signal; it does not make any
item ready, authorized, or claimed.
