# Student Entitlement Catalog

Status: catalog revision 1, source/design authority only

Task: `NC-20260905-001`

Machine-readable authority: `facts/catalogs/student-entitlements-v1.json`

## Decision

A full program is a versioned bundle of heterogeneous component promises. It
is not one boolean access flag and it is not shorthand for Modules 1-4.

Company OS owns the cross-provider enrollment episode, purchased bundle
version, materialized component entitlements, scheduled assignments,
consumption, reconciliation, exceptions, and action receipts. Native providers
remain authoritative for their own facts: Stripe/Plutio for payments,
Heartbeat for access and supported completion, Google Calendar for schedules,
Zoom for attendance, grading ledgers for assessments, and Sertifier for issued
credentials.

Student Roster, Heartbeat, Encharge, and Plutio are projections of the relevant
slice. None is the universal student master.

## Required separation

Every student lifecycle implementation must keep these records distinct:

1. **Enrollment episode** — the commercial offer and bundle version bought.
2. **Component entitlement** — each included course, service allowance,
   assessment, resource, or earned outcome.
3. **Scheduled assignment** — the exact module class block, program cohort, or
   group series the student is assigned to attend.
4. **Consumption** — access used, sessions/hours attended, submissions/reviews,
   milestones, and remaining allowance.
5. **Progress** — provider-supported course and assessment progress.
6. **Financial obligation** — paid-in-full, installment, pay-as-you-go, invoice,
   refund, dispute, or actual next obligation.
7. **Communication eligibility** — service/marketing purpose, consent,
   suppression, recipient identity, and delivery receipt.

One fact may not substitute for another. A class marker does not prove payment
or entitlement; a full-access group does not prove class assignment; course
completion does not consume an individual mentoring allowance.

## Bundle versions

The catalog currently defines six entitlement bundles behind seven commercial
offers:

- ACC Level 1 Full;
- PCC + ACTC Level 2 Full;
- ACTC-only Full;
- Professional Coach Program (ACC + PCC + ACTC);
- MCS Standard Path;
- Coaching Supervision Mastery, shared by inaugural and regular-price offers.

The bundle version is frozen on the enrollment episode. A later catalog update
does not silently alter an earlier student's promise. A deliberate upgrade,
grant, correction, transfer, refund, or revocation appends a sourced entitlement
event and preserves history.

## Component semantics

Each catalog component names:

- stable component key and human name;
- component type and delivery mode;
- quantity/unit plus its evidence status;
- scheduling and consumption model;
- whether a Heartbeat marker is applicable;
- exact known Heartbeat access-group/course IDs;
- provider attachment confidence;
- source references and unresolved questions.

`included` creates an entitlement when the bundle is purchased.
`conditional` creates it only after the named condition is independently
verified. `earned_on_completion` describes a promised outcome whose issuance
still requires its readiness and approval gate.

## Heartbeat groups

### Constant course-access groups

Existing paid and Course Access Groups remain the content entitlement layer.
They are not nested under cohort markers and may not be renamed or repurposed.
Their membership proves only the exact provider access recorded in the catalog.

### Hidden marker groups

Future marker groups are a separate parallel projection under an
administrator-only `Student Markers` parent:

```text
enrollment:<offer-key>:<bundle-version>
class:<delivery-family>:<component>:<yyyy-mm-dd>:<slot>
series:<delivery-family>:<component>:<yyyy-mm>
```

Marker invariants:

- hidden and admin-controlled;
- no paid offer, course, channel, resource, event, or other content attached;
- no workflow by default;
- never a payment, entitlement, attendance, progress, or consent authority;
- full-program and module-only students in the same delivery block share the
  same class marker;
- only actual scheduled group components receive markers;
- individual mentoring/supervision, self-paced courses, assessments, resource
  access, and certificate outcomes do not receive cohort markers;
- transfer updates provider membership only after canonical append-only
  assignment history and exact add/remove readback.

Catalog revision 1 is design-only and grants no marker-group creation or
membership authority.

## Operational examples

### Same class, different purchase

An ACC Full student and an ACC Module 1-only student assigned to the same four
live sessions share one class assignment and one future marker. Their component
entitlements differ because their enrollment episodes point to different
bundle/offer contracts.

### Full purchase, later module

The full purchase creates every included component entitlement immediately. It
creates only the class assignment selected at checkout. Later module class
assignments require a schedule-backed registration or an explicit accepted
program rule; they are not inferred merely because the student owns the module.

### Payment decision

- Full-program paid-in-full: no module payment due.
- Full-program installment: next obligation comes from the Stripe schedule.
- Module-only: another module is `not_entitled` or `eligible_to_purchase`, not
  overdue unless an actual obligation exists.
- Refund/dispute: the affected entitlement/action is held pending exact policy.

### Tomorrow's class

The recipient set is the exact scheduled class block joined to active class
assignments, verified identity, applicable access/hold state, and purpose-based
communication suppression. The query does not start from a broad full-program
group or a manually maintained tag.

## Current evidence boundary

The September 5 audit verified provider group/course identities, Stripe product
identities, published bundle claims, the checkout catalog, the Product Map, and
the MCS/AACS course sources without reading student membership. The supported
Heartbeat surface does not expose the complete full-group-to-content attachment
graph. ACC/PCC/ACTC exact service quantities and some consumption/resubmission
rules remain unresolved and are explicitly marked provisional.

The complete evidence and conflict disposition are in
`docs/programs/company-os/evidence/NC-20260905-001-student-entitlement-audit.md`.

## Next implementation gates

1. Obtain owner decisions for the unresolved ACC/PCC/ACTC quantities and
   consumption rules.
2. Add ordered `business_v2` bundle, component, entitlement, assignment, and
   consumption migrations plus deterministic materialization tests.
3. Ingest the structured checkout cohort fields and exact bundle version into
   the payment/enrollment case.
4. Produce read-only Student Roster and Encharge projections.
5. Reconcile existing Heartbeat September groups by exact purpose before
   proposing any marker creation.
6. Separately authorize marker groups, membership backfill, provider actions,
   messages, and lifecycle consumers only after dark reconciliation passes.
