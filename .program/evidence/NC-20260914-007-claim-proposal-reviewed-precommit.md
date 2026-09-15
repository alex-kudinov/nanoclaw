# NC-20260914-007 claim-proposal reviewed precommit evidence

Date: 2026-09-14 America/Chicago

## Minimum-sufficient result

The owner instructed Codex to keep going after the dark Google account-claim
foundation. The proposed custom-HMAC transport proof entered the operational-
obligation gate. A fresh S2 reviewer returned `REMOVE` for bespoke HMAC,
canonical signing, key IDs, duplicate fixture copies and a second Firebase
verifier, while retaining the smaller cross-repository identity proof.

The accepted result is verified BFF sequencing, one strict participant-only
proposal, independent Company OS validation, Company OS-owned canonical context
derivation inside one persistent serializable generated-database transaction,
and reuse of the existing migration-167 claim store. It is not authenticated
live transport.

## Tandem Identity proof

- Base: `14d382f` on clean isolated branch
  `codex/claim-proposal-disposable-20260914`.
- `account-claim-proposal.ts` constructs only after a recent verified
  `LoginObservation`; it checks exact Google issuer/project and Heartbeat
  environment itself.
- The strict version-1 proposal contains a verified-email SHA-256 but no raw
  email, token, Party ID, candidate list, conflict flag, staff/payer role,
  entitlement or provider action.
- The existing `/api/session` test path proves Firebase token verification,
  verified email and recent auth precede the injected proposal-capturing
  gateway. Stale and unverified sessions never reach the gateway or session
  cookie.
- `app.ts` and `server.ts` do not import the module. There is no endpoint,
  network, credential, signing or runtime transport.
- One deterministic emitter produced the sole neutral artifact at
  `/tmp/tandem-identity-claim-proposal-v1.json`: 880 bytes, mode 0600, SHA-256
  `8dc277b4f6bc06e3233329cc64e7bb4708051343686c090d4d259f45ef356c66`.
- Verification: 44 passed, four Firestore integration tests intentionally
  skipped; Node 22 typecheck and build passed.
- Implementation commit `926774f`; reviewed documentation/source head
  `4ca09d8`.

## Company OS proof

- Base: reviewed NC-006 completion
  `a38c71c60038add19fec908fb3646e6948067b8a` on clean isolated branch
  `codex/tandem-identity-claim-proposal-disposable-20260914`.
- An independent strict schema consumed the exact BFF artifact and pinned its
  bytes/hash; NanoClaw contains no second fixture copy.
- Before state reads, the receiver rejects non-generated database names and
  wrong proposal audience/issuer/project/environment/time/shape.
- Inside PostgreSQL it requires serializable isolation, assigns a real
  `pg_current_xact_id()` and requires that same ID after candidate/exception
  reads. A session-level serializable autocommit client changes transaction IDs
  and fails before any write.
- New-claim candidate Parties derive only from active, unexpired,
  source-verified/provider-asserted migration-137
  `verified_email_candidate` rows joined to unmerged Parties. Open conflict
  derives only from the exact Heartbeat-reference fingerprint.
- Zero/multiple candidates, open exception, prior-decision conflict,
  non-serializable and autocommit callers hold/fail with zero identity writes.
- Exactly one safe candidate converts to the existing internal Google claim and
  migration-167 store. Exact replay writes zero; altered reuse fails by payload
  conflict; protected Party/ref/provider-attempt counts do not change.
- Focused proposal/artifact/disposable verification: 19/19 passed.
- Format, typecheck, build and documentation continuity passed.
- Two full suites: each produced 4,435 passed, 33 skipped and 20 failed. Nineteen
  are the established unrelated baseline; each run had one different additional
  known flake. Payment-method reconciliation passed immediately in isolation,
  11/11, and the Academy Capacity shadow timeout passed immediately in isolation,
  2/2. Effective comparison is 4,436 passing with the same 19 baseline failures.
  No identity-control-plane test failed.
- Company OS implementation commit `512a4ee6`.

## Independent review

Risk gate: the result can create an auth-subject-to-Party binding and crosses
BFF/Company OS ownership, while the new transaction-bound context derivation
lacked prior proof.

One bounded Claude Sonnet/high review used session
`af3584b4-78d8-430d-9e17-efa31f0aa6e6`, Read/Glob/Grep/Write only, strict empty
MCP configuration and no Bash/web/network. It wrote only
`docs/reports/NC-20260914-007-CLAUDE-REVIEW-RESPONSE-R1.md`.

Material finding: the isolation GUC alone did not prove one persistent
multi-statement transaction; an autocommit session configured serializable
could release locks after every query. Correction: assign and pin the actual
PostgreSQL transaction ID across derivation, plus a real autocommit-bypass
regression proving zero writes. Focused/typecheck verification passes. The
load-bearing correction is mechanically proven, so no second round is needed.

Secondary informational note: exact historical replay reconstructs the original
Party even after a later merge. The already-reviewed store returns exact replay
before any Party/evidence write, and altered reuse is hash-conflict/rollback
protected. No wrong binding or mutation was demonstrated; no correction is
required in this slice.

Usage audit: four unique Sonnet calls; 71,968 cache-create, 138,150 cache-read,
28,000 output tokens; maximum context 83,647; no warnings or malformed records.

## Topology reconciliation

Actual additions are two source-only proposal modules, one synthetic emitter,
an independent disposable receiver, tests, documents and review/program
evidence. There is no new table, migration, shared package, endpoint, network
client, worker, queue, scheduler, runtime import, credential, key, provider
integration or independently operated service. The generated test database is
dropped and the temporary artifact will be removed after final evidence.

Deployment is explicitly prohibited and not applicable. The next separately
gated work is selection of the real service topology and standard authenticated
transport, followed by a still-disposable runtime integration. No production or
real-user pilot is implied.
