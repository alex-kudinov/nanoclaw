# NC-20260826-001 — Concurrency hardening review R3

Verdict: NO MATERIAL FINDINGS

The transaction-scoped advisory lock closes the R2 concurrency note:

- `pg_advisory_xact_lock(bigint)` is held through commit or rollback;
- it is acquired before the READ COMMITTED statement that selects the current
  exact-scope assignment;
- a second transaction therefore sees either the prior state after rollback or
  the newly committed state after commit;
- the lock changes ordering only and does not alter first-assignment,
  exact-supersession, same-scope, or effective-time validation;
- both `hashtextextended` and `pg_advisory_xact_lock` are PostgreSQL core
  built-ins and require no extension;
- a hash collision can only over-serialize unrelated scopes, not grant
  authority.

The seed remains safe because each initial row has a distinct lane scope and is
the first row in that scope.

The reviewer noted a bounded liveness risk if future tooling acquires multiple
different scope locks in inconsistent order; PostgreSQL would abort one
transaction without corrupting authority. Future batch tooling should use a
stable lane order.

The static migration test proves packaging of the lock but does not itself
exercise concurrent transactions. Codex added an enabled disposable-PostgreSQL
integration test that holds the first scope transaction, proves the second
blocks, commits the first, and verifies the second re-reads the committed
assignment and rejects the now-stale supersession ID.
