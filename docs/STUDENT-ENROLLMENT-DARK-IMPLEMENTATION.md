# Student Enrollment Dark Implementation

Status: `NC-20260905-003` local implementation complete; migration 142 disposable PostgreSQL proof completed by `NC-20260905-006`; production remains unapplied

Base: reviewed foundation revision 1 at `1d77ae5a`

## Boundary

This task creates portable, reversible source and deterministic tests only.
Migration 142 remains unapplied. No existing runtime imports the command
engine. No source adapter, provider projection, reconciliation, backfill,
deployment, or communication is authorized.

## Conservative policy defaults

`facts/catalogs/student-enrollment-policy-v1.json` is the machine-readable
policy for this dark build. The defaults deliberately hold rather than infer:

- only source adapters may capture source references/evidence;
- enrollment operators may assign exact participants and classes but cannot
  confirm money or grant scholarships;
- finance operators may confirm off-platform payment only with an external
  receipt reference;
- owner-admin authority is required for grants, post-activation transfers, and
  refund/dispute/withdrawal decisions;
- paid offers require settled payment or explicit active terms;
- an unpaid invoice may create an order and seats but not an active enrollment
  by default;
- partial sponsor rosters materialize only exact assigned seats;
- no refund/dispute silently revokes access or deletes entitlement;
- initial Roster behavior is preview-only and preserves nonempty operator cells
  as drift exceptions;
- provider targets are independent; later failure does not undo a verified
  earlier target, and ambiguous acceptance is held for readback;
- raw uploads default to seven days, audit/source references seven years, and
  projection/resolved-exception receipts two years. Production retention jobs
  still require privacy/legal review and a separate decision.

## Schema slice

Migration `142_student_enrollment_dark_foundation.sql` creates admin-only:

1. `student_enrollment_orders`
2. `student_enrollment_order_source_refs`
3. `student_enrollment_evidence`
4. `student_enrollment_seats`
5. `student_enrollments_v2`
6. `student_component_entitlements`
7. `student_financial_agreements`
8. `student_financial_obligations`
9. `student_class_assignments`
10. `student_projection_outbox`
11. `student_projection_receipts`
12. `student_enrollment_exceptions_v2`
13. `student_enrollment_history`
14. `v_student_enrollment_dark_health`

Names deliberately avoid altering migration 134's live Community lifecycle
tables. Existing tables remain untouched. Source references, receipts, and
history are append-only. Current aggregates use optimistic integer versions.
Every JSON value is bounded. All tables/sequences/views are owned by
`nanoclaw_admin`, revoked from `PUBLIC`, and granted to no minion role.

The rollback refuses when any migration-142 table contains a row. It drops
only the exact empty dark schema objects.

## Domain/command slice

`src/student-enrollment-foundation.ts` is a pure deterministic aggregate and
command engine. It is not imported by `src/index.ts` and has no provider,
database, filesystem, network, clock, or random-number dependency. Callers
supply stable IDs, timestamps, evidence hashes, versions, and actor identity.

Commands clone state before mutation so a rejected command cannot partially
change the caller's state. Load-bearing rules include:

- one source-scoped reference binds to one order;
- evidence is append-only, source-bound when applicable, and may advance an
  incomplete order only through a separate versioned correction;
- an exact replay returns the prior order; conflicting reuse opens no merge;
- order, seat, enrollment, agreement, obligation, assignment, exception, and
  projection changes compare-and-swap expected versions;
- one assigned seat materializes at most one current enrollment;
- materialization requires exact participant evidence, payer relationship,
  offer/bundle version, financial classification, and no blocking exception;
- bundle component keys are unique and materialized atomically;
- financial obligations, entitlements, and assignments remain independent;
- incomplete order terms and obligation states have explicit versioned
  transitions rather than requiring record replacement;
- class assignments require an active/pending enrollment plus an entitlement
  for that component;
- projection requests are immutable and idempotent by target/subject/version;
- only exact matching readback may verify a projection;
- corrections and transfers append history and supersede prior projections;
- no command sends, projects, queries a provider, or touches a real database.

## Test matrix

Focused tests cover:

- all policy invariants and phase-off switches;
- migration/rollback names, constraints, append-only triggers, ownership,
  zero agent grants, guarded rollback, and release packaging;
- self-pay, separate payer, multi-seat sponsor, partial sponsor, scholarship,
  unpaid invoice hold, and module-only obligations;
- exact replay versus conflicting source alias;
- stale order/seat/materialization versions and transactional no-partial-write;
- one-seat/one-enrollment uniqueness and duplicate component rejection;
- obligation states independent of entitlement;
- assignment requires entitlement and exact delivery block;
- projection idempotency, exact readback, ambiguous acceptance, and supersession;
- exception ownership/resolution and append-only transfer history;
- the source remains unwired from the production composition root.

## Promotion gates

1. Commit and push this reviewed local foundation.
2. **Complete:** the reviewed credential-free verifier proved PostgreSQL 16.15
   apply, constraints, ownership/grants, populated refusal, empty rollback,
   reapply, and zero residue using synthetic rows only. It pins `/tmp:5432`,
   strips ambient `PG*` variables, and refuses existing/unsafe names.
3. Separately authorize production empty-schema migration with backup and
   least-privilege readback.
4. Separately implement/wire ingress adapters in shadow mode.
5. Only then authorize read-only reconciliation.

Nothing in this task authorizes gates 2-5.

## Review convergence

Claude Sonnet/high R1 found one SQL/domain audit-field mismatch, six runtime
integrity gaps, and two smaller incomplete-state issues. The corrections add
complete audit timestamps/actors, recurring exception semantics, strict
transfer preconditions, all-exception materialization holds, projection
supersession versions/history, runtime closed-set and SQL-aligned validation,
explicit order transitions, and duplicate assignment protection. R2 verified
those corrections and found two residual validation omissions; lower-snake
reason/evidence codes and evidence subject types are now guarded with direct
negative tests. No material review finding remains unresolved.
