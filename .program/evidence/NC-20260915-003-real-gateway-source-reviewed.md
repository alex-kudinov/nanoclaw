# NC-20260915-003 real gateway source and review evidence

Date: 2026-09-15

Evidence class: source, disposable integration, independent review. This is not
deployment, live endpoint, live sign-in, binding, Funnel, provider, or customer
outcome evidence.

## Accepted bounded result

- One exact development gateway route is disabled by default.
- Google service identity is pinned to issuer, exact audience, verified runtime
  email, and immutable subject `114536406241819905948` independently read before
  implementation.
- The caller supplies only project, Firebase UID, and optional verified-email
  fingerprint; it cannot select Party or entitlement.
- The operator binding is pinned to the accepted owner decision, development
  project, UID, email fingerprint, Party `10069`, and caller subject.
- Party `10069` still has no Coaching Tools Plus grant; the expected projection
  is bound with an empty entitlement list and `/tools` denial.
- Exact replay is zero-write. Changed UID, Party, decision, or caller subject
  rolls back with all evidence/binding and protected counts unchanged.
- Append-only disable creates a rollback receipt and next disabled auth-account
  version; repeat disable is zero-write and a different rollback decision fails.
- The BFF uses Application Default Credentials, exact audience, short timeout,
  strict response schema, and a hard 16 KiB streaming response cap.

## Verification

- NanoClaw focused gateway, webhook, and disposable PostgreSQL tests: 74/74.
- NanoClaw formatting, typecheck, build, documentation continuity: pass.
- NanoClaw full suite: 4,470 pass / 34 skip / five failures. Three are the
  established unrelated academy fixture, CNPC contract, and Trafft freshness
  failures. The two additional parallel-run failures (academy shadow timeout
  and payment identity concurrent 503) both passed immediately in an isolated
  rerun: 8/8. No gateway or Tandem Identity test failed.
- Tandem Identity full suite: 79 pass / four intentional Firestore skips;
  typecheck and build pass.

## Independent review

- Claude Sonnet/high R1 session `2fab281d-efb7-4c93-b7df-80a287b12de2`
  stopped because three load-bearing files were accidentally omitted from the
  allowed packet and identified a duplicated path-prefix literal.
- The packet was corrected; route namespace derivation, complete stable replay
  identity, full receipt-hash comparison, and changed-field zero-write proofs
  were added.
- Claude Sonnet/high R2 session `92cd3608-6193-4379-9c13-6e4e9dcab6f9`
  returned `PASS WITH CORRECTIONS`: no remaining authentication,
  authorization, route-isolation, or replay defect.
- Corrections resolved mechanically after R2: the runtime database context was
  confirmed as the existing host admin pool with fixed parameterized reads; no
  new role was added; the streaming limit became hard; and append-only disable
  was implemented and proven in disposable PostgreSQL.
- R1 usage: five model calls; 10 input, 119,968 cache-create, 287,962
  cache-read, 14,297 output tokens; maximum observed context 124,809.
- R2 usage: eight model calls; 16 input, 254,056 cache-create, 1,223,617
  cache-read, 23,966 output tokens; maximum observed context 263,943.

## External state

No real-gateway source commit, push, release, deployment, database binding,
Firebase account, Funnel mount, or provider write existed when this evidence
was recorded. Commit/push and live proof remain separate evidence classes.
