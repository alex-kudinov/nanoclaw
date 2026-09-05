# NC-20260905-005 bounded implementation review R1

## Objective

Review the local, default-off Academy capacity extension for material defects.
The implementation must extend the reviewed enrollment foundation rather than
create parallel student, entitlement, finance, participant, assignment,
receipt, or exception authority.

Report only defects that could cause overselling, incorrect occupancy,
incorrect transfer/withdrawal, duplicate or lost assignment, waitlist-order or
approval failure, SQL/domain divergence, broken rollback/least privilege, raw
runtime exceptions from unvalidated input, or a future adapter being forced to
invent required facts. Cite exact file and line/construct. Do not restate the
design and do not propose adjacent features.

Write the review to:
`docs/reports/NC-20260905-005-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`

## Authority and accepted facts

1. `docs/ACADEMY-CAPACITY-DARK-IMPLEMENTATION.md` is the exact task boundary.
2. `src/student-enrollment-foundation.ts` at predecessor `deac91a8` is the
   reviewed enrollment command/type authority. Capacity must reuse its
   `EnrollmentFoundationState`, `ClassAssignment`, history, and `assignClass`.
3. Migration 142 is source-only and unapplied. Migration 143 is also
   source-only and unapplied; no disposable or production DB apply is part of
   this task.
4. V1 has exactly one seat pool per delivery block and permits multiple
   versioned offers to share it.
5. `pending` and `active` class assignments both consume capacity. Only
   unexpired `held` reservations count as reserved. Consumed reservations do
   not double-count assignments.
6. `waitlist_offer` is an internal reservation channel that protects the
   released seat between human-approved staging and assignment. It does not
   authorize Mailman or any message.
7. The TypeScript engine is intentionally pure and unwired. Callers supply
   keys, timestamps, evidence hashes, actors, and expected versions. A later
   persistence adapter must transact/lock; this task does not wire one.
8. Migration 143's assignment delivery-block FK is deliberately `NOT VALID` so
   future existing rows cannot be treated as reconciled implicitly. It still
   governs new/updated rows after application.
9. MCS Thursday 2026-09-24 remains open. No real cohort/student/provider state
   is represented in fixtures or changed by this task.
10. No new minion is created. Capacity-minion activation and every provider,
    Bookkeeper, Tandemweb, Student Roster, waitlist-message, migration,
    deployment, and authority-cutover action remain separately gated.

## Allowed files

Read only:

1. this request;
2. `docs/ACADEMY-CAPACITY-DARK-IMPLEMENTATION.md`;
3. `src/academy-capacity.ts`;
4. `src/academy-capacity.test.ts`;
5. `src/academy-capacity-migration.test.ts`;
6. `data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql`;
7. `data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql`;
8. `src/student-enrollment-foundation.ts` only as needed to verify the imported
   types/commands and assignment/history integration.

Write only the named response artifact. Do not edit implementation files. Do
not use Bash, web, MCP, providers, databases, environment files, credentials,
or any other repository path.

## Implementation claims to challenge

- A stale expected pool version cannot reserve or mutate the last seat; exact
  reservation replay returns the prior result while conflicting reuse fails.
- Reserve, commit, transfer, withdrawal, waitlist staging/resolution, closure,
  and reopen mutate clones only after validation, so rejection cannot partially
  change either input aggregate.
- Assignment commit consumes one reservation and creates one canonical
  foundation assignment atomically in the pure model; exact replay does not
  duplicate either.
- One enrollment cannot occupy one delivery block twice, even through distinct
  entitlement rows; SQL and runtime agree.
- Transfer releases origin occupancy and consumes destination occupancy in one
  returned pair, refuses a full/closed/mismatched destination, and replays
  exactly.
- Withdrawal ends only the class assignment. It does not infer a refund,
  cancel the enrollment, or rewrite finance.
- Open enrollment exceptions block assignment/transfer.
- Manual holds require a reason and seven-day maximum; checkout uses a
  30-minute maximum; waitlist holds require their internal reason.
- FIFO selection is stable; only one active waitlist offer per pool exists;
  approval evidence is required before sent/accepted state; sent requires a
  delivery receipt; terminal outcomes release the hold; conversion consumes it.
- SQL composite keys prevent mismatched order/seat and pool/entry/reservation
  relationships.
- All runtime enums, keys, counts, versions, timestamps, hashes, actor/reason
  fields that reach SQL receive compatible validation or controlled refusal.
- Capacity events are append-only and versioned; all new objects and sequences
  are admin-only; rollback refuses after evidence and touches no migration-142
  data objects beyond removing its exact added constraints/index.
- The engine remains absent from `src/index.ts`; source presence is not runtime
  activation.

## Current verification

- Typecheck: pass.
- Formatting: pass.
- Focused capacity/enrollment suite: 54/54 pass.
- Documentation continuity/capability gate: pass after staging only migration
  143 and its rollback, as required by the migration portability check.
- Full suite after rebuilding the pinned-Node native dependency: 3,523 passed,
  32 skipped, two unchanged predecessor failures:
  `cnpc-prompt-contract.test.ts` expects the older wrapper literal, and the
  date-sensitive Trafft shadow fixture classifies August evidence as stale.
- No migration, provider, real-data, runtime, message, deployment, or cohort
  state action occurred.

## Required response

Give a short verdict, then material findings ordered by severity. For each,
name the violated accepted fact or implementation claim and the smallest
corrective direction. If there are no material defects, say exactly
`NO MATERIAL FINDINGS` and list the load-bearing checks you performed.
