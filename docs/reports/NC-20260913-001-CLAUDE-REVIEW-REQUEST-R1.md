# NC-20260913-001 bounded implementation review

Status: superseded by narrower R2 after the first session was stopped without a response artifact

## Objective

Review only the load-bearing D0 identity-safety implementation. Find material
ways it could falsely resolve/bind a Party, represent an external write, accept
stale/destructive absence evidence, mix TEST/LIVE identities, or produce
non-deterministic/self-fulfilling replay evidence.

## Authority and boundaries

- Company OS will own Party/account binding and entitlements; providers retain
  native-fact authority.
- D0 is pure shadow. It must have no network, database, provider credential,
  runtime registration, Party/ref/access write, migration, or deployment.
- Email, name, group, ShopperDNA, payment instrument and other weak evidence
  may rank candidates but cannot bind a Party.
- Heartbeat-only observations stage candidates; they never create Parties.
- Existing access is preserved; no purchase or payer role may be invented.
- Future provider writes are outside D0 and need a separate versioned contract.

## Allowed files

Read only:

1. this request;
2. `src/identity-control-plane/canonical.ts`;
3. `src/identity-control-plane/contracts.ts`;
4. `src/identity-control-plane/resolver.ts`;
5. `src/identity-control-plane/semantic.ts`;
6. `src/identity-control-plane/reducer.ts`;
7. `src/identity-control-plane/replay-fixtures.ts`;
8. `src/identity-control-plane/d0-replay.test.ts`.

Do not inspect other repository, private mapping, `.env`, credential, runtime,
or provider files. Write only the response artifact named below.

## Implemented contract

- Nine strict Zod shapes; shadow commands only support simulated/superseded/
  blocked, false writes, zero attempts and null provider-operation timing.
- Exact scoped reference, transitive merge lineage, accepted auth subject, and
  accepted claim/Tandem operation are the only resolved bases.
- Tombstones, multiple bindings and merge cycles conflict. A single weak Party
  candidate remains ambiguous. Unverified hints cannot resolve even an exact
  ref; rejected authenticity fails.
- Manifest provider/environment/scope/entity/event must match; related refs
  must stay in the primary production/nonproduction environment class.
- Desired projection and shadow command keys are content-derived and exactly
  correlated.
- Complete snapshots verify count and canonical item hash; absence additionally
  requires the matching complete, still-fresh run.
- Domain facts deduplicate by event/fact key, refuse version regression and
  conflict on equal version/different hash. Replay and snapshot inputs are
  canonically sorted.
- Proof cases are not returned from a constant lookup: each generates a
  synthetic resolver state, resolves it, then maps the typed decision to the
  accepted pseudonymous outcome.

## Verification already performed

- Pinned Node 22.23.2.
- 34 focused tests pass; typecheck and build pass.
- Replay: 12/12 proof and 16/16 failure fixtures; zero provider, Party and
  access writes; plan hash `3f80b9da14b53ad9a7a994a119f197527a2bad68fd6ebb89b3483f5901d3c4ae`;
  report hash `2803bf272b06b2897d2ae8a52beb69e27f38dea07d268a72ba477697c584a7ac`.
- Structural test rejects network/HTTP/PostgreSQL/Firebase/Google/provider-
  toolbox/child-process/environment dependencies and verifies no host import.
- Full suite with D0 and without D0 has the same 20 failures in the same six
  unchanged baseline files; documentation continuity passes.

## Review questions

1. Does the resolver have an ordering, tombstone, merge-lineage, accepted-
   subject or authenticity path that can return the wrong Party/basis?
2. Can any schema-valid/semantic-valid D0 object represent or trigger a real
   write or Party materialization without an accepted creation basis?
3. Can an incomplete/stale/tampered snapshot support absence or a healthy
   scoreboard?
4. Are deduplication, equal-version conflict, canonical ordering and aggregate
   hashes deterministic under input permutation and multi-fact events?
5. Do the 12+16 fixtures test the mechanisms they claim rather than merely
   restating expected strings?

Report only material findings, ordered by consequence, with exact file/line
evidence and the smallest correction/test. Distinguish real defects from later
D1/provider implementation work.

## Output

Write only
`docs/reports/NC-20260913-001-CLAUDE-REVIEW-RESPONSE-R1.md`.
