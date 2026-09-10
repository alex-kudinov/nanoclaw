# Bounded review — durable payment operation store (R1)

**Verdict: ACCEPTED** within this source scope (the 7 files listed in REQUEST-R1.md).

Scope reviewed: `src/payment-store.ts`, `src/payment-payload-vault.ts`, their two test
files, migration 149 + rollback, and `docs/PAYMENT-DOMAIN.md`. `payment-domain.ts` and
its contracts were treated as accepted per the request and not re-reviewed.

## Checks performed and result

- **Atomicity / commit-before-network**: No network or provider calls appear anywhere
  in `payment-store.ts` or inside any `this.transaction(...)` callback. Vault
  seal/open are local AES-256-GCM operations. Sealed request bytes are committed in
  the same transaction as the operation row (`prepareSession`), satisfying
  commit-before-dispatch.
- **Duplication / idempotency**: `acceptAttempt` takes a scope+quote advisory xact
  lock (`pg_advisory_xact_lock(hashtextextended(...))`) before its existence check,
  and `prepareSession` takes `FOR UPDATE` on the parent attempt row before its
  existence check — both correctly serialize the concurrent-25-callers case rather
  than relying on the unique constraints alone. Confirmed against the 25-concurrent
  tests.
- **Concurrent workers / lease fencing**: `acquireDispatch` locks the operation row
  `FOR UPDATE`, checks `lease_until > now` (DB `clock_timestamp()`, not app clock)
  before granting a new lease, and the grant itself is an optimistic-concurrency
  `UPDATE ... WHERE version=$5`. `finishDispatch` requires exact `lease_token`,
  `version`, and unexpired `lease_until` match, so a stale worker's write is
  correctly rejected (`operation_lease_lost`) once a fresh worker has re-acquired.
  Matches the 25-worker and fresh-connection-recovery tests.
- **DB-level defense in depth**: The `fn_payment_operation_guard` trigger
  independently enforces the version fence (`NEW.version = OLD.version + 1`),
  blocks any update once `OLD.state` is terminal, and freezes every column except
  `state/session_expires_at/encrypted_response/version/lease_token/lease_until`.
  This backs up the app-layer checks rather than substituting for them.
- **Encryption / immutable evidence**: AAD binds each ciphertext to
  `${keyId}:${operationId}:{request|response}`, so cross-operation and
  request/response transplantation fail closed (tested). `acquireDispatch`
  additionally re-derives `paymentPayloadFingerprint` after decrypt and compares
  it to the stored `request_sha256`, which is redundant with GCM's own
  authentication *unless* stored bytes were altered by a path that bypasses the
  immutability trigger (e.g. direct superuser write) — reasonable extra check, not
  a defect.
- **Permissions**: Migration revokes all privileges from `PUBLIC` and loops over
  every non-`nanoclaw_admin`, non-`pg_%` role to revoke explicitly, closing the
  default-grant gap. Ownership of all tables/functions is `nanoclaw_admin`. Test
  independently queries `role_table_grants`/`routine_privileges` to confirm no
  other grantee. Consistent with "no agent/public grants."
- **Rollback safety**: `rollback_149_payment_attempt_store.sql` takes
  `ACCESS EXCLUSIVE` locks on all three tables, then raises
  `'rollback 149 refused: payment evidence exists'` and aborts before dropping
  anything if any row exists in any of the three tables. Only drops
  tables/functions on an empty store. Confirmed by the test that a populated
  rollback is rejected, then an emptied one succeeds and the migration/rollback
  cycle is replayable.

## Minor non-blocking observation (not a required correction)

`acceptAttempt`'s advisory lock key is `payment-quote:${scopeHash}:${quoteId}` of the
*incoming* attempt. Two concurrent calls that reuse the same client-supplied
`attemptId` but carry different `scope`/`quoteId` take different advisory locks, so
neither is serialized against the other; the losing insert would surface as a raw
Postgres `23505` unique-violation on the `attempt_id` primary key instead of the
domain's `attempt_identity_conflict` error. This can't produce a duplicate row or a
duplicate financial action — the primary key still guarantees at most one row per
`attempt_id` — it only changes the error a caller sees in an already-abnormal input
case (attemptId reuse across mismatched scopes). The existing test suite already
accepts an equivalent raw-`23505` outcome for cross-attempt `idempotency_key` reuse
in `payment-store-disposable.test.ts` ("enforces global key uniqueness"), so this is
consistent with the store's established error-surface convention rather than a new
defect. No correction proposed.

## Test/migration reproducibility

Confirmed the disposable test only targets a generated
`nc_payment_disposable_<pid>_<hex>` database on `/tmp:5432`, asserts
`inet_server_addr()` is null before creating anything, asserts the `nanoclaw_admin`
role pre-exists rather than creating one, and drops only the database it itself
created. No production pool, credential loading, or env value is read. This matches
the "do not demand new pool/credential loading" constraint and the "no live
financial/enrollment effect" boundary in the request.

No corrections required in this scope.
