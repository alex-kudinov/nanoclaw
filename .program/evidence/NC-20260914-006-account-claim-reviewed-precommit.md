# NC-20260914-006 account-claim reviewed precommit evidence

Date: 2026-09-14 America/Chicago

## Scope and minimum-sufficient result

The authorized result was one concrete, dark Google account-claim walking
skeleton after all 12 Heartbeat proof cases completed. The accepted
operational-obligation delta is limited to a strict normalized claim, pure
evaluator and caller-owned disposable PostgreSQL transaction over migration
167. No generalized provider layer, runtime, token verifier, network,
credential, new DDL, real user, production binding, Party/ref/access/provider
write or deployment is present.

Fresh-context necessity review returned `KEEP` with two reductions: use only the
Google claim and remove `claim_available`. Exact consumed replay must be a
no-op; altered reuse must fail closed.

## Implemented proof

- `google-account-claim.ts` defines the strict body/envelope/context and
  accepted/held/rejected evaluator.
- `google-account-claim-store.ts` is locked to generated
  `nc_tandem_identity_d2_test_*` databases before any other statement. It
  appends only one dark adapter registration, receipt, related Heartbeat ref,
  accepted auth account and accepted-claim resolution decision inside the
  caller's transaction.
- Runtime context must contain exactly one candidate Party and explicit false
  conflict/shared-identifier facts. Email is evidence only and is never a
  matching authority.
- The store rejects a missing/merged target Party, a previously observed Google
  subject, altered claim-ID reuse and adapter scope/environment collision.
- Exact replay verifies complete stored evidence and writes zero. Late global
  decision collision proves the entire transaction rolls back.
- The production entry point does not import the module. No migration 168,
  credential, HTTP/network call, provider attempt or protected-domain writer
  exists.

## Verification

- Focused: 3 files, 20/20 tests passed.
- Format check: passed.
- TypeScript typecheck: passed.
- Build: passed; payment document bundle completed.
- Documentation continuity and capability matrix: passed.
- Full suite: 420 files passed, 10 skipped and 6 failed; 4,422 tests passed, 32
  skipped and 20 failed. No identity-control-plane test failed.
- Nineteen failures are the established unrelated baseline. The additional
  Academy Capacity shadow-population disposable timeout passed immediately in
  isolation, 2/2. The effective comparison is therefore 4,423 passing tests
  with the same 19 unrelated baseline failures.
- Final focused rerun after review correction: 20/20 plus typecheck passed.

## Independent review

Risk gate: material consequence is a durable auth-subject-to-Party identity
binding; material uncertainty is a new boundary intended for later BFF/Company
OS integration without a production transport or canonical-context runtime yet.

One bounded Claude Sonnet/high review used session
`b7f57971-d2bc-472f-bd64-de4aa6a0c1d0`, Read/Glob/Grep/Write only, strict empty
MCP configuration, no Bash/web/network, and wrote only
`docs/reports/NC-20260914-006-CLAUDE-REVIEW-RESPONSE-R1.md`. It found no
behavioral defect. Its one moderate finding was missing negative coverage for
`target_party_unavailable` and `auth_subject_already_observed`; both cases now
have exact transactional zero-write proofs. The correction changed only tests
and is mechanically verified, so no second round is warranted.

Usage audit: 13 unique Sonnet model calls; 113,010 cache-create, 965,527
cache-read, 13,591 output tokens; maximum context 119,643; no malformed records.
The maximum exceeded the 100k bounded-review target. The reviewer also opened
the imported non-secret `canonical.ts` helper beyond the packet's eight listed
read paths. No secret, credential, provider/user data or unrelated mutation was
involved. Both are recorded as orchestration defects and do not enlarge the
accepted evidence claim.

## Topology reconciliation

Actual durable additions in source are the two claim modules, their tests,
documentation, the review packet/response and program evidence. There is no new
table, migration, queue, worker, scheduler, runtime import, endpoint, external
dependency, secret boundary or independently operated service. Migration 167 is
read but unchanged. Deployment is explicitly prohibited and not applicable to
this unwired disposable-only result.

## Next separately gated proof

A future slice may prove disposable cross-repository transport: the BFF verifies
a fresh Google ID token and authenticates a replay-safe claim to Company OS;
Company OS derives candidate/conflict facts canonically inside the transaction.
That slice must remove or replace the disposable-database guard only under a new
security and production admission decision. It may not infer identity from
email/name/group/payment similarity.
