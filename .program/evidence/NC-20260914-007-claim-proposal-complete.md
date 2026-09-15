# NC-20260914-007 claim-proposal disposable proof complete

Date: 2026-09-14 America/Chicago

## Result

The network-free Tandem Identity to Company OS participant-proposal proof is
implemented, independently reviewed, verified and preserved in both private
repositories.

- Tandem Identity private repository:
  `https://github.com/alex-kudinov/tandem-identity`.
- Tandem Identity pushed branch:
  `codex/claim-proposal-disposable-20260914`.
- Tandem Identity exact remote head:
  `fc5714db9948821801b63b27f9dcf125cecc1580`.
- Company OS pushed branch:
  `codex/tandem-identity-claim-proposal-disposable-20260914`.
- Company OS reviewed source/evidence checkpoint:
  `d6048eacd3268ecefcabb3a9ba3d594da2289f72`; the final remote ref is recorded
  by the canonical external program receipt after this file is committed.
- Both worktrees are clean and track their remote branches.

The new Tandem Identity repository matches `tandemweb` ownership and private
visibility. It uses an HTTPS remote because the active GitHub credential on this
machine is HTTPS and the attempted SSH connection had no usable public key. The
new repository's current default branch is the reviewed proposal branch; no
unrelated branch or tag was pushed.

## Verified behavior

- Existing BFF Firebase token, verified-email and recent-auth checks precede the
  injected proposal gateway.
- The proposal is participant-only and cannot contain Party or conflict
  authority.
- One neutral 880-byte synthetic proposal was consumed by an independent
  Company OS schema at exact SHA-256
  `8dc277b4f6bc06e3233329cc64e7bb4708051343686c090d4d259f45ef356c66`.
- Company OS derives current candidate/open-conflict facts from migration-137
  state inside one serializable transaction and pins the PostgreSQL transaction
  ID across all reads before calling the migration-167 claim store.
- Exact replay writes zero. Altered, ambiguous, conflicting, stale,
  cross-scope, non-serializable and serializable-autocommit paths fail before
  binding or leave no partial state.
- Tandem Identity: 44 tests passed, four Firestore integration tests
  intentionally skipped; Node 22 typecheck/build passed.
- Company OS: focused 19/19; format/typecheck/build/docs passed. Two full runs
  had no identity failure and the same effective 19 unrelated baseline after
  different known flakes passed immediately in isolation.

## Review

Fresh necessity review removed bespoke HMAC, custom signing/key IDs, a second
Firebase verifier, duplicate fixture and staff/payer scope. One bounded Claude
Sonnet/high review found the isolation-GUC autocommit hole. The transaction-ID
pin and exact autocommit regression closed it mechanically; no second round was
needed.

## Boundaries

No endpoint, network transport, service credential, signing key, new DDL, real
user, production identity binding, Party/ref/access/enrollment/entitlement/
customer/provider write, deployment or activation occurred.

The next separately gated decision is the real endpoint topology and standard
authenticated service identity, followed by a still-disposable runtime proof.
