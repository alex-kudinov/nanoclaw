# Local atomic enrollment store

`NC-20260906-008`, based on reviewed ingress `e6463ba2`. Unwired and
**disposable-only**; no production database/provider activation is included.

`persistEnrollmentIngress(pool, candidate, hostAuthority)` checks the connected
database against its generated test namespace and requires a Unix socket. It
uses an injected fresh idle client, never production connection defaults. The
lower-level mapper applies the same target guard; its helpers require the public
operation's enclosing transaction and locks, not standalone autocommit use.

The operation starts SERIALIZABLE, locks all 20 canonical tables in fixed order
before its data snapshot, loads state, invokes the reviewed pure ingress adapter,
writes relational deltas, verifies exact readback and commits. It returns only
after COMMIT acknowledgement. SHARE ROW EXCLUSIVE locks serialize store calls
and conflict with other DML; versioned updates also use compare-and-swap. This
conservative local proof claims no production throughput or writer coexistence.
Lock/statement timeouts bound waiting. Database failures are surfaced without
source acknowledgement; callers retry the exact intake, never a new identity.

The mapper resolves foreign keys to stable domain identities across all 20
relations. It introduces no parallel JSON-state ledger, deletion, blanket
replacement or blind upsert. Immutable references/evidence/receipts and history
prefixes cannot be rewritten. Missing references, unsafe integers, key collisions,
stale versions or readback differences abort. Timestamp normalization does not
change proof/payload hashes. Unmodeled SQL fields (finance source pointer, class
dates, delivery attempts/error metadata) are preserved by explicit column lists.
Active projection leases are refused; provider delivery remains separate work.

Both aggregates, aliases, proofs, exceptions, finance, assignments and outbox
changes commit or roll back together. Sequence gaps after rollback are normal.
A COMMIT error raises `EnrollmentCommitUncertainError` and discards the client;
it claims neither rollback nor success. Retrying the same immutable intake
reconciles a committed attempt or safely applies an aborted one. No external
action is performed by that retry.

Local/unapplied migration **146_student_enrollment_store_contract.sql** adds the
missing outbox `version` column, separate from delivery attempts, and admits
`evidence` history subjects. `attachEnrollmentEvidence` now logs its individual
evidence key instead of repeatedly logging parent-order version zero. Existing
history is not rewritten. Rollback refuses any outbox or evidence-history rows,
then restores the old shape when empty. No production migration was performed.

Run `./scripts/with-pinned-node.sh npx vitest run src/student-enrollment-store.test.ts`.
The harness creates a fresh random database, pins socket/port/user, strips PG
routing/credentials, disables password/service files, applies 142–146, proves
empty rollback/reapply, runs an isolated worker and drops the database. It
requires the existing local admin role; it creates no cluster role/membership
and imports no real records. Proof includes every mapped relation, alias and
paid-seat races, sponsor/grant/held intake, real SQL rollback, lost commit
acknowledgement, replay/readback, metadata retention, leases, stale CAS, immutable
records, populated rollback refusal and zero non-admin grants.

Authenticated source admission and production promotion remain separately
governed. Promotion must explicitly replace the disposable guard, establish
bounded data/locking and writer coexistence, authorize migration/activation and
verify new-event outcomes. Historical replay, provider/Sheet changes, deployment,
payments/refunds and communication remain excluded here.
