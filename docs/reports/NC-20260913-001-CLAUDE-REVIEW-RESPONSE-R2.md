# NC-20260913-001 narrow D0 safety review — response (R2)

Scope: the six files listed in the request plus the request itself. No tests,
other source, config, credentials, or git history were read. No commands were
run — this is a static review only; it does not independently confirm the
37/12/16/20 test-run counts asserted in the request.

The D0 mechanisms themselves (exact-reference/merge/auth-subject/claim
precedence, closed candidate creation gate, shadow-command shape, adapter
scope matching, domain dedupe/version monotonicity, snapshot/absence
integrity) are implemented correctly and consistent with the required
invariant: no path in these six files returns a `resolved_*` status, sets
`partyId`, or permits a non-`false`/non-`0`/non-`null` shadow-command field
without the schema rejecting it. The material defects below are **coverage
gaps in the proof/failure fixtures**, not mechanism-correctness bugs — but
per review focus item 6, coverage genuineness is explicitly in scope, and two
of these gaps sit directly on the stated invariant.

## 1. The weak-evidence (`unverified_hint`) branch has zero fixture coverage

`resolver.ts:108-109` is the only code path that implements "weak evidence
never resolves identity":

```ts
if (resolvedEvent.authenticity === 'unverified_hint') {
  status = candidates.length > 0 ? 'ambiguous' : 'staged_candidate';
}
```

Every fixture event in `replay-fixtures.ts` is built by `event()`
(`replay-fixtures.ts:42-62`), whose default `authenticity` is
`'relay_verified_provider_unverified'`, and no call site (`PROOF_CASES`,
`runProofCases`, or any `R01`-`R16` case in `runFailureFixture`) overrides it
to `'unverified_hint'`. The `'rejected'` branch (`resolver.ts:105-107`) is
likewise never triggered by any fixture.

Consequence: the exact mechanism review focus item 1 asks about — "weak
evidence never resolves identity" / "one weak candidate must remain
ambiguous" — is the one branch the cited 12/12 proof + 16/16 failure count
does not touch. A regression that let `unverified_hint` fall into the
exact-reference/merge/accepted-subject branch below it would not fail any
existing fixture.

**Smallest correction:** add one failure fixture (e.g. `R17`) that calls
`resolveIdentity` with `authenticity: 'unverified_hint'` against a state that
*does* contain a matching active `externalReferences` entry, and assert the
result is still `staged_candidate` (no candidates) or `ambiguous` (with
candidates) — never `resolved_exact_reference`. Add a second fixture for the
`'rejected'` branch asserting `EVENT_AUTHENTICITY_REJECTED` is thrown.

## 2. Domain-reducer `conflict` outcomes are never exercised

`reduceFactEvents` has two `'conflict'`-producing branches:

- `reducer.ts:64-73` — same `deduplicationKey`+`factKey` but a **different**
  `factVersion`/`valueSha256` than the first-seen copy.
- `reducer.ts:87-93` — same `factVersion` as the current fact but a
  **different** `valueSha256`.

`R01` (`replay-fixtures.ts:220-243`) only exercises the matching-value
duplicate (`duplicate_transport`). `R02` only exercises `ignored_stale`. No
fixture supplies mismatched version/hash under the same dedup key, and none
supplies a same-version/different-hash update. Review focus item 4 names
"conflicting duplicate detection" explicitly as a mechanism to verify; it is
the only one of the five listed sub-mechanisms in that item with no fixture
at all.

**Smallest correction:** add a fixture asserting `outcome === 'conflict'` for
each branch — e.g. two inputs sharing `deduplicationKey`+`factKey` with
different `valueSha256` (transport-conflict case), and two inputs at the same
`factVersion` with different `valueSha256` against an existing fact
(domain-conflict case).

## 3. Minor — several resolver `conflict` paths are untested

`R09` covers only one of four ways `resolveIdentity` reaches `'conflict'`:
duplicate *active* external references to different parties. Untested in
this file set:
- a tombstoned reference matching the subject (`resolver.ts:120-121`),
- more than one accepted-subject binding resolving to different parties
  (`resolver.ts:147-148`),
- a merge-lineage cycle causing `mergeSurvivor` to return `null`
  (`resolver.ts:56-63`, consumed at `resolver.ts:127-128`).

Lower consequence than items 1-2 since the general "conflict, no party
write" shape is already proven by `R09`, but a cycle or tombstone-specific
regression (e.g. accidentally resolving through a tombstoned reference)
would not be caught.

## 4. Minor — `evaluateProofCase` is not the function under fixture test

`resolver.ts:227-243` defines `evaluateProofCase`, a second, independent
encoding of the same proof-case decision table `runProofCases` exercises via
`resolveIdentity` + `proofActionFromDecision`. `runProofCases`
(`replay-fixtures.ts:148-185`) never calls `evaluateProofCase`. If this
function is exercised by tests outside the allowed scope for this review,
disregard; if not, it is untested logic that can silently diverge from the
real resolution path it duplicates.

## 5. Minor — no fixture at all for manifest-mismatch and snapshot-duplicate invariants

`R13` covers only the related-ref environment-class collision
(`semantic.ts:59-65`). The primary-reference mismatch invariants in the same
function (`SCOPE_MANIFEST_MISMATCH`, `ENTITY_TYPE_NOT_MANIFESTED`,
`EVENT_TYPE_NOT_MANIFESTED` at `semantic.ts:41-56`) and the
`SNAPSHOT_DUPLICATE_ITEM` invariant in `snapshotHash`
(`semantic.ts:162-165`) have no positive or negative fixture anywhere in
this file. Lowest consequence of the five findings — these are single-line
`invariant()` calls with narrow blast radius — but they are part of the
"adapter … match" and "snapshot item uniqueness" mechanisms review focus
items 3 and 5 name directly.

## No other material defects found

Outside the five items above, the schemas and functions in these six files
correctly enforce the stated invariant end-to-end: `ShadowCommandSchema`
pins status to `simulated`/`superseded`/`blocked`, `writesEnabled` to
`false`, `attemptCount` to `0`, and `providerOperationId`/`nextAttemptAt` to
`null` (`contracts.ts:291-309`); `AdapterManifestSchema` pins
`writesEnabled` to `false` (`contracts.ts:259`); `IdentityCandidateSchema`
gates `partyMaterializationAllowed` on both an explicit non-`none` creation
basis and `status === 'accepted'` (`contracts.ts:206-224`);
`ResolutionDecisionSchema` forbids a `partyId`/`resolutionBasis` outside the
four `resolved_*` statuses and forbids ambiguous-without-candidates or
not-found-with-candidates (`contracts.ts:119-174`); and
`validateAbsenceBasedDrift` requires a complete, full-mode, scope-matched,
still-fresh snapshot before permitting absence-based evidence
(`semantic.ts:190-221`). No file performs or references a database, network,
or provider I/O call, and none constructs a Party or access mutation.
