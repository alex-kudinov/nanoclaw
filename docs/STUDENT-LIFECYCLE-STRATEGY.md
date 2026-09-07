# Durable student lifecycle strategy

Status: owner-directed strategy and dependency plan, version 1, 2026-09-07

Task: `NC-20260907-003`

Strategy authority: `docs/STUDENT-LIFECYCLE-STRATEGY-BRIEF.md`

Decision register: `docs/STUDENT-LIFECYCLE-DECISION-REGISTER.md`

This plan turns every valid commercial or grant promise into durable,
source-bound work: what was promised, under which terms, to whom, for which
dated class when applicable, which systems must reflect it, and what evidence
proves completion. A partial failure keeps the funded promise and capacity
commitment visible while creating an owned exception. Retries, aliases, and
installments do not create extra orders, students, enrollments, or seats.

This document is a dependency design. `.program/state.json` remains the only
execution portfolio and authorization source. The plan creates no provider,
student, payment, roster, capacity, communication, migration, deployment, or
runtime action.

## What exists now

- The entitlement catalog separates eight commercial offers from their frozen
  bundles and components. Company OS is the reconciled enrollment/work ledger;
  source systems retain authority for their own facts.
- The live supervision bridge in release `138e43ab` routes the first bounded
  offer family by source-bound identity. At its recorded source snapshot, one
  of 37 active checkout entries was covered by the bridge. The 47-total/37-active
  figures are a local checkout snapshot, not current provider totals.
- The reviewed local enrollment line culminates at
  `8b1ffbb9902b5fd3f7df245142d54db3de92dcee`. It provides eight synthetic ingress
  source-channel dispositions, including a review-only correction path, plus
  serializable relational persistence, authenticated issuer receipts, and one-
  writer claims. Migrations 146 and 147 are unapplied; the store remains
  disposable-only and no native provider or production writer is connected.
- The local enrollment line and the live supervision bridge descend separately
  from `f5adc8cc`. Their application source does not overlap, but their Project
  Map, Active Work, and changelog histories do. A production pilot must start
  from the current release lineage, integrate the reviewed enrollment commits,
  and reconcile those shared authorities by meaning before any migration or
  activation. Neither branch may replace the other wholesale.
- The accepted capacity strategy uses committed-seat accounting, daily
  reconciliation, threshold-triggered cached website publication, targeted cache
  refresh, and explicit operator adjustments. It accepts a small residual race
  risk. Synchronous checkout reservations, short-lived holds, and a live checkout
  dependency on NanoClaw are superseded and must not return through older docs or
  implementation conditions.

## Operating model

### One canonical episode, several distinct records

A lifecycle episode joins records that remain conceptually separate:

| Record | Meaning | Primary authority |
| --- | --- | --- |
| Program and curriculum version | What the educational program contains | Course sources and accepted program facts |
| Commercial offer/version | What was offered and under which terms | Accepted commercial and checkout sources |
| Payment agreement | How one order is funded | Native contract, invoice, or payment-plan source |
| Payment obligation/receipt | One scheduled obligation and its actual receipt | Native payment provider/accounting source |
| Bundle/component entitlement | What the participant is promised | Frozen entitlement catalog plus accepted order |
| Order and seat | The commercial/grant episode and participant capacity | Company OS enrollment ledger |
| Participant/enrollment | The identified recipient of the promise | Source-bound Party and participant evidence |
| Delivery block/pool | The dated class and capacity boundary | Accepted schedule and capacity configuration |
| Provider access/progress | What the provider granted or observed | The exact provider object and supported API/webhook |
| Projection receipt | What a downstream system now reflects | Company OS outbox plus exact target readback |

A provider binding is a typed relationship, not a universal ID-to-offer lookup.
Several Stripe products or prices may represent one offer. A reused product may
need price plus exact checkout or contract context. A shared Heartbeat group can
support several entitlements and cannot prove a purchase, class assignment, or
progress. Provider account/community, object type, native ID, effective period,
relationship type, evidence, status, and resolution owner are all required.

### One agreement, several payment receipts

An installment plan creates one commercial agreement and one enrollment order.
Its Payment Intents, invoice payments, charges, and other receipts are aliases or
obligation settlements on that agreement. They never create another order or
student merely because a later installment produced a new native object.

The current local adapter admits fully settled receipts only. Payment-plan grant
or hold rules, arrears, cancellation, refund, dispute, sponsor funding, and
service consumption require separate contract proof before admission broadens.
Independent accounting continues when enrollment is held. Neither payer identity,
an amount match, nor a payment date proves participant, offer, or class.

### Publication and coverage ratchet

Version-controlled manifests remain the editable authority. A later management
screen may propose, validate, and publish the same records; it cannot become a
second catalog master.

Every sellable item or variant moves forward through these explicit states:

1. `observed` — found in a bounded source inventory; no relationship inferred.
2. `legacy_dispositioned` — temporary treatment, evidence, owner, and expiry are
   recorded. Existing operations may continue only within that accepted scope.
3. `source_bound` — offer, agreement semantics, typed native relationships,
   fulfillment treatment, and required destinations are explicit.
4. `verified` — deterministic validation and source readback agree; ambiguity is
   held as an owned exception.
5. `strict_publish_eligible` — new or changed publication fails if required
   bindings, destinations, schedule/pool compatibility, or pinned exports are
   missing.

The legacy allowlist can shrink or receive an explicit owner-reviewed extension;
it cannot silently grow. Strict coverage is enabled by source/offer/locale or
variant only after that population passes. The 37-entry snapshot is a baseline
to refresh, not a demand for one global cutover.

Each offer receives one explicit treatment: enrollment, component/service
fulfillment, non-student sale, grant/free access, retired/historical, or
unresolved. Purchased coaching or supervision allowances stay separate from
training-program roster seats and receive their own consumption evidence.

## Phased dependency and acceptance plan

| Phase | Work and reason | Exit evidence | Portfolio mapping |
| --- | --- | --- | --- |
| 0. Adopt routing and plan | Install the project-local Astra/Sol/Claude routing policy and finish this reviewed plan without expanding authority. | Explicit Sol High dispatch, parsed project config, both instruction surfaces bound, continuity checks, independent Claude review, and internal Astra acceptance. Fresh-task default behavior stays labeled unverified until observed. | Active `work:student-lifecycle-strategy-and-model-routing` |
| 1. Reconcile sources | Read every selected active website variant/locale, both Stripe accounts, Plutio references, Heartbeat relationships, roster destination, curriculum, and schedule. Typed relationships and explicit dispositions come before code or provider changes. | Every selected item has a source-bound or time-bounded legacy disposition; unresolved business choices block only their affected population. | Candidate `work:student-product-catalog-source-reconciliation`; existing coverage rollout, supervision capacity reconciliation, and production admission pilot depend on it. First packet: `docs/work-packets/NC-20260907-003-READONLY-CATALOG-RECONCILIATION.md` |
| 2. Establish publication checks | Build one coordinated version/publish contract with generated pinned consumer projections and deterministic drift checks. Keep source ownership where it belongs. | One accepted offer update reproduces its required exports and cannot publish when a required binding or destination is missing; staged coverage cannot regress or silently expand legacy exemptions. | Existing `work:student-product-identity-coverage-rollout`, refined by Phase 1 evidence |
| 3. Prepare admission and projection together | Deliberately integrate the reviewed enrollment/admission line with the current supervision bridge lineage. For the fully settled slice, distinguish one funding receipt from its identifiers/aliases and prove authenticated admission, accounting continuity, serializable replay, projection execution/readback, retry, and uncertain acceptance in local/disposable tests. | Exact integration lineage; one fully settled funding receipt's Payment Intent/event/charge/checkout aliases converge on one agreement/order; selected projection targets have versioned apply/readback and failure proofs. Migrations 146/147, store promotion, native writers, provider permissions, and routing remain off. It does not claim multiple distinct installment payments or a real outcome. | Existing admission foundation plus candidate `work:student-enrollment-projection-foundation`; production pilot depends on both source reconciliation and this reviewed projection foundation. Financial-agreement semantics remains later. |
| 4. Run one bounded canonical plus projection pilot | Recommended first population is a new, fully settled, self-purchased supervision tuition episode with an explicitly mapped dated class. Route no real event to the new writer unless the selected projection execution/readback path is already reviewed and both canonical plus provider activation are explicitly authorized for one rollout. | First evidence milestone: one canonical order/enrollment, frozen promise, correct class, commitment/assignment, accounting continuity, projection request, and duplicate/alias suppression. Immediate second milestone: the selected roster/access versions are applied and read back, or an uncertain/failing target leaves the promise counted with an owned exception and blocks end-to-end acceptance. Do not replay Ma. Carmen. | `work:supervision-enrollment-capacity-reconciliation` prepares class/capacity. `work:student-enrollment-production-admission-pilot` and dependent `work:student-enrollment-projection-reconciliation` execute sequential evidence within the same authorized bounded rollout; no unrelated phase or additional real event sits between them. |
| 5. Prove and expand bounded financial semantics | After the fully settled supervision path is accepted end to end, add multiple distinct installment payments, refunds/disputes, sponsor and multi-seat relationships, transfers, grants, additional product/provider families, and service allowances only after each contract is explicit. | One agreement remains one order/enrollment across multiple obligation receipts. Each admitted family has identity, state-transition, duplicate, reversal, ambiguity, projection, and rollback proof. Historical backfill is bounded and dry-run first; payment date never infers reassignment. | Candidate `work:student-enrollment-financial-agreement-semantics` plus existing coverage gates. Its local proof may be prepared earlier, but it neither blocks nor expands the fully settled Phase 4 population and no family activates before Phase 4 acceptance. |
| 6. Reconcile continuously and retire legacy writers | Continue comparing accepted funding with canonical completion, applied/read-back projection versions, alias conflicts, exception ownership/age, capacity, and source watermarks. Retire old paths only by proven population coverage. | No unowned gap in each admitted population; uncertain acceptance blocks retry; natural outcomes and rollback remain observable; each legacy writer retires only after its exact population has end-to-end coverage. | Continue candidate `work:student-enrollment-projection-reconciliation`; completed projection reconciliation remains a prerequisite of full Academy authority cutover. Preserve existing control-plane, simple-sync, and authority-cutover boundaries. |
| 7. Continue beyond enrollment | Govern participation/progress, assessment, completion, and separately authorized service, certificate, and marketing actions. Enrollment/access alone cannot prove progress. | Documented provider progress evidence or an explicit unavailable state; CoachGrader assessment evidence joined without becoming the student master; completion and every action retain purpose, consent, suppression, NO_ACTION, approval, idempotency, and delivery/readback gates. | Existing `work:student-lifecycle-action-catalog-design`, `work:student-lifecycle-action-runtime-build`, `work:student-lifecycle-minion-design`, and `work:student-lifecycle-minion-build`; no duplicate item proposed. |

The four candidate items refine gaps inside broad existing candidates. They
do not replace existing production-pilot, capacity, action, minion, or control-
plane work. At review start, program revision 246 had 17 candidates. After R2,
Astra applied the exact reviewed delta at revision 247: the four items are now
registered candidates, making 21, with none activated. The current primary
`.program/state.json` remains authority; this plan is not another live queue.

## Canonical admission and end-to-end supervision milestones

Preparation first reconciles the offer/source relationships and exact supervision
class/capacity, then integrates and proves both the fully settled canonical path
and selected projection execution/readback in a disposable environment. Do not
route a real event unless both reviewed paths and the same bounded rollout's exact
canonical/provider authority are ready; otherwise preserve the existing route.

Within that one rollout, the canonical evidence milestone must first prove:

- one authenticated commercial agreement/order and one participant enrollment;
- frozen offer and bundle promises plus the correct financial terms;
- one exact dated supervision delivery block with confirmed capacity;
- one seat commitment and class assignment;
- one version-bound projection request ready for its already authorized target;
- independent accounting capture even if registration is held;
- exact no-op behavior for retries and aliases of the same fully settled funding
  receipt; and
- over-capacity funding recorded and held for owner resolution without assigning
  above approved capacity.

That milestone proves canonical admission only. It does not itself prove provider
write/readback or end-to-end acceptance.

The dependent projection-reconciliation item then applies the selected target
versions in the same authorized bounded rollout. The full end-to-end supervision
milestone additionally requires exact roster/access readback, duplicate-safe
projection retry, uncertain-acceptance reconciliation, preservation of the funded
promise during a provider failure, and an owned recoverable exception for every
unmet target. The program items remain sequential so there is no dependency
cycle; operational preparation and authorization cover both before routing the
event, and no unrelated Phase 5 expansion occurs between the two evidence states.

Synthetic/disposable tests prove failure paths. They do not manufacture a real
payment, disable a provider, or send a message. Canonical admission and immediate
end-to-end projection/readback retain distinct evidence receipts from the same
authorized natural-event rollout.
A webhook 200, build, migration, deployment, elapsed observation window, or model
verdict alone is insufficient.

## Management, evidence, and measures

Every slice carries an exact work packet, source lineage, file/resource ownership,
positive and negative acceptance, independent review, correction receipts, and
separate deployment authority. One integration/release writer revalidates the
current live commit and intervening releases before activation. An older Sales
branch may not regress `138e43ab`, and the enrollment branch may not be promoted
without reconciling its older base and current continuity authority.

Measure facts before setting targets:

- coverage by source, offer, variant, locale, account, and relationship type;
- canonical agreements/orders whose expected completion or projection is absent;
- duplicate events and aliases suppressed without duplicate effects;
- provider projection state, uncertain acceptance, retry, and exact readback;
- exception owner, age, recurrence, and safe holding behavior;
- class commitment/assignment/capacity variance;
- natural participation, assessment, completion, and action receipts; and
- release lineage and rollback readiness.

Targets follow the Phase 1 baseline. No success rate, savings claim, or deadline
is invented to make the plan appear complete.

## Sources and protected boundaries

This strategy extends, rather than replaces:

- `docs/STUDENT-ENTITLEMENT-CATALOG.md`;
- `docs/STUDENT-ENROLLMENT-FOUNDATION.md`;
- `docs/STUDENT-PRODUCT-IDENTITY.md`;
- `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md`;
- `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`;
- reviewed local enrollment line
  `codex/enrollment-authenticated-admission-20260906` at `8b1ffbb9`; and
- accepted primary decision
  `.program/decisions/decision-academy-capacity-simple-sync-strategy-2026-09-06.json`.

Provider writes, production migrations, application release, access changes,
capacity changes, student communication, certificate issuance, marketing sends,
and portfolio state changes remain separately governed.
