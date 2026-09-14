# NC-20260913-001 narrow D0 safety review

The first broader session was stopped without a response artifact. Review only
the six runtime files below plus this request. Do not inspect tests, docs,
private data, other source, configuration, credentials, or Git history.

## Required invariant

D0 is a pure shadow calculator. It cannot create/merge a Party, attach a
provider reference, mutate access, reach a database/network/provider, or
represent a dispatched provider command. Weak evidence never resolves identity.

## Allowed files

- `src/identity-control-plane/canonical.ts`
- `src/identity-control-plane/contracts.ts`
- `src/identity-control-plane/resolver.ts`
- `src/identity-control-plane/semantic.ts`
- `src/identity-control-plane/reducer.ts`
- `src/identity-control-plane/replay-fixtures.ts`

## Review focus

Report only material defects in these mechanisms:

1. Exact reference, transitive merge lineage, accepted auth/claim/operation,
   tombstone/cycle, authenticity and candidate precedence. One weak candidate
   must remain ambiguous; unverified hints must not resolve.
2. Closed candidate creation basis and accepted-status gate. Shadow command
   shapes permit only simulated/superseded/blocked, false writes, zero attempts
   and null provider-operation timing.
3. Adapter provider/environment/scope/entity/event match and related-reference
   Production/nonproduction segregation.
4. Domain dedupe by event+fact, multi-fact events, conflicting duplicate
   detection, monotonic version handling and permutation-stable reduction.
5. Snapshot item uniqueness by scoped ref+fact, canonical snapshot integrity,
   and absence evidence restricted to the same full, complete, still-fresh
   scope after completion.
6. Whether the 12 proof cases and 16 failure fixtures genuinely exercise those
   mechanisms instead of returning expected constants.

Pinned Node 22.23.2 verification: 37 focused tests, typecheck/build, 12/12 proof
and 16/16 failures, zero provider/Party/access writes. Full suite with and
without D0 has the same 20 failures in the same six unrelated baseline files.

Do not propose D1 database/provider work. Order findings by consequence with
exact file evidence and the smallest correction/test. If no material defect
remains, say so explicitly.

Write only
`docs/reports/NC-20260913-001-CLAUDE-REVIEW-RESPONSE-R2.md`.
