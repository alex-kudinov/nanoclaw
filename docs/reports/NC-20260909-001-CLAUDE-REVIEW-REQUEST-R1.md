# NC-20260909-001 bounded implementation review R1

## Objective

Review the local, unwired provider-projection foundation for the first settled
self-purchased dated Supervision pilot. Report only material correctness,
safety, data-integrity, idempotency, concurrency, or contract defects.

## Accepted authority and invariants

- Company OS remains canonical; provider state is a rebuildable projection.
- The selected pilot is authenticated, settled, self-purchased
  `supervision-inaugural` v1 assigned to `supervision:2026-10-07`, with zero
  blocking exceptions.
- Student Roster and Heartbeat are required. Encharge and Plutio are explicitly
  `not_applicable` for this offer/version; no inference is permitted.
- Heartbeat has two independent layers: stable content access and a hidden,
  admin-controlled, zero-content delivery marker. Marker membership proves
  neither payment nor entitlement.
- Current production readiness must remain false. No production migration,
  runtime wiring, real provider/credential/data access, deployment, financial
  action, or communication is authorized.
- An uncertain provider acceptance must be held and reconciled by target
  idempotency lookup/readback before retry. A definitive failure may retry the
  same key. Partial target failure preserves the funded order and class
  commitment with a durable owned exception.

## Allowed review files (eight)

1. `src/student-enrollment-projection.ts`
2. `src/student-enrollment-projection-store.ts`
3. `src/student-enrollment-projection.test.ts`
4. `scripts/student-enrollment-projection-disposable-worker.ts`
5. `data/business/migrations/nanoclaw-v2/148_student_enrollment_projection_foundation.sql`
6. `data/business/migrations/nanoclaw-v2/rollback_148_student_enrollment_projection_foundation.sql`
7. `facts/catalogs/student-enrollment-projection-targets-v1.json`
8. `docs/STUDENT-ENROLLMENT-PROJECTION-FOUNDATION.md`

Do not inspect `.env*`, credentials, auth stores, browser profiles, runtime
databases, other provider data, unrelated diffs, or broad repository history.
Do not edit implementation. Write only the response file named below.

## Evidence already produced

- Pinned Node 22.23.2 root typecheck: pass.
- Focused engine/catalog/migration/disposable tests: 13/13 pass.
- Generated-name-only local PostgreSQL proof: pass, database dropped with zero
  residue; populated migration-148 rollback refusal passes.
- Proof covers one-winner claim, exact readback, failed-to-retry attempt 2,
  uncertain acceptance held before retry, target idempotency, stale refusal,
  supersession, canonical commitment preservation, and provider-double rollback.
- Documentation continuity and capability matrix: pass.

## Questions

1. Can two workers or retries create a duplicate provider effect despite the
   target idempotency lookup, lease token, SQL uniqueness, and claim logic?
2. Can any stale/superseded or uncertain item be incorrectly delivered or
   retried?
3. Are receipt/exception/outbox state transitions atomic and compatible with
   migration-142 constraints?
4. Does exact readback normalization authenticate all load-bearing target facts
   without fabricating marker semantics?
5. Does rollback preserve canonical truth and avoid deleting unrelated provider
   state?
6. Does the tracked readiness catalog truthfully fail closed for later rollout?

## Required response

Write `docs/reports/NC-20260909-001-CLAUDE-REVIEW-RESPONSE-R1.md`.
List material findings only, highest consequence first, with exact file/line
evidence and a concrete correction. If none, write `NO MATERIAL FINDINGS` and a
short statement of the reviewed invariants. Do not add speculative backlog,
style comments, or repeat the task narrative.
