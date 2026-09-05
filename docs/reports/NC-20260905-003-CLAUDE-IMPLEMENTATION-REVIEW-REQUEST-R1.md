# NC-20260905-003 Claude dark-foundation implementation review R1

## Objective

Adversarially review the local, default-off multi-source student enrollment
dark foundation for material correctness, integrity, security, and
implementation gaps before it is committed. This is an implementation
convergence review; the cross-file packet is about 104 KB and intentionally
uses the 150k context target because schema/domain contradictions cannot be
reviewed safely from a smaller excerpt.

## Authority and boundary

The owner approved the implementation plan after the independently converged
foundation. This task may create source, unapplied reversible migration files,
synthetic tests, and documentation only. It may not apply a migration, inspect
or reconcile real students, backfill, wire or activate an adapter/projection,
write any provider/Sheet/Heartbeat/Encharge/Plutio/runtime state, deploy, or
communicate.

Accepted model: one enrollment order owns one or many seats; each exact
assigned seat may have at most one current student enrollment while historical
withdrawn/cancelled/completed episodes remain. Payer, participant, entitlement,
class assignment, financial agreement/obligation, projection receipt, and
exception are independent.

## Review artifacts

Read only:

1. `docs/STUDENT-ENROLLMENT-FOUNDATION.md`
2. `docs/STUDENT-ENROLLMENT-DARK-IMPLEMENTATION.md`
3. `facts/catalogs/student-enrollment-policy-v1.json`
4. `facts/catalogs/student-enrollment-foundation-v1.json`
5. `data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql`
6. `data/business/migrations/nanoclaw-v2/rollback_142_student_enrollment_dark_foundation.sql`
7. `src/student-enrollment-foundation.ts`

The focused tests are summarized here rather than included as an eighth large
artifact: five files / 56 tests pass, covering contract/policy, migration and
rollback structure, source replay/conflict, aliasing, evidence, incomplete
order correction, seat cardinality, participant/payer evidence, sponsor
partial materialization, scholarship/no-payment, financial agreements and
obligation transitions, class-entitlement binding, exact projection readback,
ambiguous acceptance, exceptions, and post-activation transfer. Typecheck and
build pass. Tests and results are evidence, not authority.

## Review questions

Report only material P0/P1/P2 findings. Check:

- SQL validity, creation/drop order, foreign keys, constraints, partial
  uniqueness, indexes, append-only coverage, bounded JSON, admin ownership,
  absence of agent grants, empty-schema behavior, and guarded rollback;
- exact alignment among the accepted contract, policy defaults, SQL shape,
  and TypeScript semantics;
- untrusted runtime validation, source-scoped idempotency and conflicting
  aliases, evidence attachment, atomic no-partial mutation, optimistic
  versions, and replay behavior;
- incomplete order -> evidence -> corrected terms -> seats -> participant ->
  materialization path;
- one-to-many sponsored orders, unassigned seats, payer/participant proof,
  pre/post-activation transfer, and preservation of historical enrollments;
- financial agreement/obligation creation and transition without inventing a
  next-module debt or coupling finance to entitlement;
- class assignment only from exact entitlements and delivery blocks;
- outbox/receipt identity, duplicate/conflicting receipts, exact readback,
  ambiguous provider acceptance, supersession, and target independence;
- exception identity/ownership/resolution, audit history, retention boundary,
  and whether any update can bypass the intended history contract;
- whether the source is genuinely unwired/default-off and contains no path to
  live data or provider action;
- whether a later persistence adapter could implement these mechanics without
  inventing load-bearing semantics.

Do not treat explicitly deferred production role enforcement, provider
adapters, reconciliation, retention jobs, or deployment as defects unless the
current dark source falsely claims or structurally prevents their safe later
implementation.

## Response

Write only
`docs/reports/NC-20260905-003-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.
For each material finding, cite the exact file/construct, explain the concrete
failure, and give a bounded correction. If none, write `NO MATERIAL FINDINGS`
and list the strongest invariants verified. Do not edit implementation files,
invoke Bash/MCP/web tools, inspect live data, or broaden scope.
