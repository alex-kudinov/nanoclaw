# NC-20260914-007 bounded identity proposal review response R1

## Material findings

### Finding 1 — serializable-transaction check verifies a session GUC, not that the multi-statement read/write sequence actually shares one persisting transaction

`src/identity-control-plane/google-account-claim-proposal-store.ts:97-105` (inside
`assertDisposableSerializable`):

```
const isolation = await client.query<IsolationLevel>(
  `SELECT current_setting('transaction_isolation') AS transaction_isolation`,
);
if (
  isolation.rowCount !== 1 ||
  isolation.rows[0].transaction_isolation !== 'serializable'
) {
  fail('serializable_transaction_required');
}
```

This only reads the `transaction_isolation` GUC on the current statement. It does not
prove the caller has an open, multi-statement `BEGIN ... COMMIT` block spanning the
subsequent candidate read (`deriveTarget`, lines 139-223, three separate `FOR SHARE`
queries) and the later write via `applyGoogleAccountClaimWithClient`
(`google-account-claim-proposal-store.ts:269-279`). PostgreSQL reports
`transaction_isolation = serializable` for a lone, autocommitted, single-statement
implicit transaction just as readily as for a real explicit transaction, as long as
`default_transaction_isolation` (or `SET SESSION CHARACTERISTICS AS TRANSACTION
ISOLATION LEVEL SERIALIZABLE`) is set at the session level. No `BEGIN` is required to
pass this check.

**Concrete failure path:** a caller sets session-level serializable isolation (e.g. via
`PGOPTIONS`, a pool default, or a bare `SET` with no `BEGIN`) instead of wrapping the
call in an explicit transaction. `assertDisposableSerializable` passes. Each subsequent
statement on that `PoolClient` — the `FOR SHARE` candidate read, the exception read, and
eventually the insert(s) inside `applyGoogleAccountClaimWithClient` — now runs and
commits as its own independent single-statement transaction, so every `FOR SHARE` lock
is released the instant its own statement completes. A concurrent transaction is free to
merge the candidate Party, flip its `party_identifier_claims` row to `status != 'active'`,
or insert a second matching claim between the candidate read and the later write. The
receiver still writes using the now-stale `derived.partyId`, producing exactly the
"derive/replay the wrong Party" race the review asks to rule out (load-bearing question
4), even though the isolation-level check reports success throughout.

**Smallest correction:** don't rely solely on the GUC string. Sample a per-transaction
value that only stays constant across statements of the *same* transaction — e.g. call
`SELECT pg_current_xact_id_if_assigned()` immediately after the isolation check and again
immediately before the write in `applyGoogleAccountClaimProposalWithClient`, and `fail()`
if the two values differ or if the second is null. That distinguishes "one open
transaction persisted across the whole sequence" from "isolation GUC merely set at the
session level."

### Finding 2 (secondary, lower confidence) — replay branch does not re-check `merged_into` on the decision's stored Party

`src/identity-control-plane/google-account-claim-proposal-store.ts:156-163`:

```
return {
  kind: 'replay',
  partyId: integer(
    priorDecision.rows[0].party_id!,
    'prior_decision_party_invalid',
  ),
};
```

Unlike the fresh-candidate path (line 175, `parties.merged_into IS NULL`), the replay
path returns the previously-decided `party_id` without joining `parties` to confirm it
is still unmerged. If that Party was merged away after the original acceptance, an
exact or altered replay under the same `claimId` derives a stale/defunct Party rather
than the live one. I did not confirm this produces an actual write, because whether it
does depends entirely on the migration-167 store's exact-payload/altered-reuse handling,
which is explicitly out of scope for this review (`NC-20260914-006`, "do not reopen
their internals"). Flagging for completeness only; treat as informational unless that
store's replay check is reopened.

## Load-bearing checks performed

- Confirmed `src/app.ts:160-201` (`tandem-identity-claim-proposal-20260914`) executes
  origin → CSRF → strict body → `auth.verifyIdToken` → verified-email → recent-auth →
  `identityGateway.observeLogin` → session-cookie creation, matching the claimed
  existing order exactly; `account-claim-proposal.ts` is not imported by `app.ts` or
  `server.ts` (enforced by its own boundary test).
- Traced `createGoogleAccountClaimProposal` (`account-claim-proposal.ts:67-120`): it
  independently re-derives recent-auth and verified-email checks from the
  `LoginObservation` fields rather than trusting caller intent, and emits only a
  SHA-256 of the normalized email — no raw email, token, or credential in the output.
- Diffed the two `GoogleAccountClaimProposalSchema` definitions (BFF vs. Company OS):
  identical literal constraints on `kind`/`audience`/`role`/`payerLearnerRelationship`,
  identical `bounded`/`sha256`/`instant` helpers, identical 60s/5min/10min time-window
  arithmetic in both `createGoogleAccountClaimProposal` and
  `validateGoogleAccountClaimProposal`. Neither schema can express a Party ID,
  candidate list, conflict flag, or non-`participant` role. `heartbeatRef.scope`'s
  exact bound on the Company OS side comes from `ScopedReferenceSchema` in
  `contracts.js`, which is outside the allowed read set — noted as an unverifiable gap,
  not asserted as a defect.
- Confirmed every `held`/`rejected` path in `google-account-claim-proposal-store.ts`
  (zero candidates, multiple candidates, open exception, prior-decision mismatch,
  non-serializable isolation, non-disposable database) returns
  `zeroWriteResult(...)` before any write, and that no `try/catch` in this file could
  swallow a thrown error from the write step and leave a half-applied transaction.
  Confirmed forbidden-writer absence (`business_v2.parties`,
  `party_external_refs`, `provider_projection_attempts`) both by reading the file and
  by re-checking the boundary test's regex actually covers the file as written.
  Confirmed candidate/exception reads use `FOR SHARE` against
  `party_identifier_claims`/`party_identity_exceptions`/`parties`, and candidate
  selection excludes merged Parties (`parties.merged_into IS NULL`).
  Confirmed no evidence label, comment, or doc line asserts authenticated live
  transport; `docs/IDENTITY-CONTROL-PLANE-CLAIM-PROPOSAL-DISPOSABLE.md` explicitly
  disclaims it and the evidence ref is labeled `bff-sequence-fixture:...`.
