# Tandem Identity D0 Replay Core

Status: independently reviewed local pure implementation; no runtime registration, database, provider, or deployment

Task: `NC-20260913-001`

## Purpose

D0 turns the accepted Tandem Identity Stage D design into executable,
deterministic contracts before any database or provider integration exists. It
proves that difficult identity input fails safely and that the shadow model
cannot represent an external write.

The implementation is intentionally not a service. Nothing imports it from
`src/index.ts`, and the runtime package has no HTTP, network, PostgreSQL,
Firebase, Google, provider-toolbox, child-process, or environment dependency.

## Files

| File | Responsibility |
| --- | --- |
| `src/identity-control-plane/contracts.ts` | Nine strict Zod object contracts and closed enums |
| `canonical.ts` | Canonical JSON, scoped-reference keys, SHA-256, permutation-stable replay ordering |
| `resolver.ts` | Exact-ref, merge-lineage, auth-subject, claim/operation precedence; candidate/ambiguity holds |
| `semantic.ts` | Manifest/scope, TEST/LIVE, projection/command, snapshot/freshness, scoreboard and uncertainty rules |
| `reducer.ts` | Duplicate/stale fact reduction, temporal claims, payer/learner roles, split freeze and tombstones |
| `replay-fixtures.ts` | Twelve pseudonymous proof outcomes and sixteen failure fixtures |
| `replay.ts` / `replay-cli.ts` | Aggregate replay report and content-derived receipt hashes |
| `*.test.ts` | Shape, semantic, resolver, replay and structural no-capability verification |

## Enforced boundaries

- `provider_projection_command` permits only `simulated`, `superseded`, or
  `blocked`; writes are false, attempt count is zero, and provider operation
  and next-attempt fields are null.
- A staged candidate with creation basis `none` cannot materialize a Party.
  Even an accepted creation basis needs candidate status `accepted` before the
  materialization flag may be true.
- One weak Party candidate is still `ambiguous`; it is never selected by
  email/name similarity.
- Exact scoped reference wins; tombstoned or multiply bound references are
  conflicts. Merge lineage follows transitively and cycles conflict.
- Auth subject, accepted claim, and Tandem-origin operation are deterministic
  accepted bases, in that order when duplicate evidence points to one Party.
- Adapter provider/environment/scope, entity type, and event type must match
  the accepted manifest. Every related reference stays inside the same
  production or nonproduction environment class.
- Snapshot items are unique, scoped, hashed and canonically ordered. Absence
  needs a complete, still-fresh reconciliation run.
- Missing complete-snapshot time or freshness degrades the scoreboard;
  consequential drift and uncertain/blocked commands block it.
- Payer and learner remain separate Party roles; deletion tombstones an
  external reference and Party split freezes identity-dependent access.

## Replay contract

Run with the exact Node version pinned by `.nvmrc`:

```bash
npx tsx src/identity-control-plane/replay-cli.ts
```

Success requires:

- proof cases: 12/12;
- failure fixtures: 27/27;
- provider writes: 0;
- Party writes: 0;
- access mutations: 0;
- no failed proof or failure-fixture receipt;
- stable canonical report and plan hashes for unchanged source.

The fixtures contain only case IDs and synthetic references. The restricted
person mapping remains outside the repository.

## Current local receipt

Focused verification on Node 22.23.2 produced:

- 47 focused tests passed;
- TypeScript typecheck passed;
- replay `proofPassed=12`, `failurePassed=27`;
- plan SHA-256 `b93bb5057820992acfdad02343c394af29e6ebae3beb9bb61d5e04b09ccb9a30`;
- report SHA-256 `157388051eebaead7745d00c548ab5ca48e7ee1290b02ce6ed120eb1743ac2b6`.

Final repository boundary: typecheck, build and documentation continuity pass.
The full suite with D0 has 4,381 passed, 32 skipped and 20 failures in six
unchanged baseline files. The exclusion comparison had one additional
intermittent disposable PostgreSQL failure; that exact test passed immediately
when isolated. A prior paired comparison reproduced the same 20 failures with
D0 included and excluded.

Hashes are build evidence, not deployment or live identity outcomes.

## Independent review

Bounded Claude Sonnet/high R2 found no mechanism defect. It identified missing
failure-fixture coverage for weak/rejected authenticity, both reducer conflict
branches, tombstone and accepted-subject conflicts, merge cycles, manifest
scope/entity/event mismatch, and duplicate snapshot facts. R17-R27 now execute
those paths. The unused parallel proof helper was removed. All corrections are
mechanically covered; no second confirmation round is required.

## What D0 does not prove

- database constraints, transactional storage, migrations, backup or restore;
- provider authentication, webhook completeness, rate limits, or readback;
- Google account synchronization or Tandem Account availability;
- a real Heartbeat/Encharge/Plutio/Trafft/Sertifier/Stripe/Adyen/Sheets adapter;
- production shadow ingestion, provider projection, access correctness, or
  migration readiness.

Those belong to D1-D4 and remain separately governed.

## Rollback

D0 is unregistered source. Before integration, rollback is removal/revert of
the `src/identity-control-plane/` directory and this documentation change.
There is no database, runtime, provider, credential, queue, customer, or
deployment state to compensate.
