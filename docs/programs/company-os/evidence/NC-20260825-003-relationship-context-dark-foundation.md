# NC-20260825-003 — Relationship Context dark-foundation evidence

Date: 2026-08-25
Program item: `work:relationship-context-dark-foundation`
Decision: `.program/decisions/decision-relationship-context-dark-foundation-2026-08-25.json`
Change class: C2 local reversible source/schema; later identity activation is C5

## Boundary and isolation

- isolated worktree: `/private/tmp/nanoclaw-relationship-context-dark`;
- branch: `codex/relationship-context-dark-foundation-20260825`;
- base: exact reviewed/live lineage
  `683d61208e1c6c2d8bb8579441503c355c4df17a`;
- dirty primary and unrelated worktrees preserved;
- no real provider, production database/runtime/configuration, credentials,
  customer record, Plutio data/field/backfill, Booking behavior, minion grant,
  communication, deployment, restart, or live outcome accessed or changed.

## Plan convergence

Plan R1 session `624c4e95-9e35-4e7c-951f-c204801ab7ab` found four material
gaps before source work:

1. migration 137 omitted the accepted legacy Party source-pair backfill;
2. persisted manifest/observation/projection JSON lacked a numeric bound;
3. merge acceptance tests were narrower than the design's lineage contract;
4. model-writable work identity was not separated from host binding.

The plan now requires an idempotent conflict-refusing backfill, 8,192-byte DB
and validator limits, named claims/refs/exceptions/observations/projections/
query/Plutio merge proofs, and no work ID in the MCP schema. The consumed host
grant is its only source. R2 session `cecb66ac-bd1c-49ac-be84-993f686f27c1`
closed three findings and left one minor missing test-name specificity issue,
fixed mechanically before source edits.

Measured usage:

- plan R1: 8 model calls; 157,351 cache-create, 655,200 cache-read, 16,796
  output tokens; maximum context 165,917, above the 100k bounded-review target;
- plan R2: 4 model calls; 46,465 cache-create, 115,185 cache-read, 11,432 output
  tokens; maximum context 53,239, no warning.

## Implemented dark mechanics

- migration/rollback 137: eight admin-only authorities, exact legacy ref
  compatibility backfill, merge/immutability guards, 8,192-byte JSON bounds,
  aggregate health/exception views, and guarded rollback;
- typed provider-neutral manifest/fact/observation contracts and registry;
- fixture-only `reference_lms` adapter with no credential or network surface;
- ambiguity-safe in-memory/PostgreSQL repositories and deterministic ingest,
  projection, freshness/conflict, context-pack, and query-receipt mechanics;
- exact one-shot host grant policy, default-off feature, no model work ID;
- host/container `party_context_get`, asynchronous exact-source return,
  quarantine/denial path, and 32-KiB response bound;
- pure dry-run Plutio projection planner with no execute/provider surface;
- release packaging, environment reference, structure-only schema docs, and
  architecture/data/security/operations authority updates.
- stable adapter registration now fails closed for invalid semantic versions,
  undeclared privacy/identity classes, duplicate source scopes, and unscoped
  identity evidence. A 256-KiB multi-fact batch envelope is distinct from the
  8-KiB bound retained for every persistable JSON value.

## Implementation review and corrections

Sonnet/high R1 session `f2873224-5ee5-467b-ad0c-6200e47da618` found four
material issues:

1. query receipts could imply success before oversized/unavailable transport;
2. replay after later identity resolution left observation lineage unresolved;
3. query-time external refs collapsed ambiguity and missing identity to
   `not_found`;
4. rollback and registry/adapter proof was not fully included in the packet.

The implementation now records `pending` transport followed by one terminal
`delivered`/`failed` transition, retroactively links an unresolved observation
exactly once while refusing a different Party, returns
`ambiguous`/`needs_identity`/`not_found` distinctly, and proves the guarded
rollback. R2 session `61b486b0-e60a-4bad-96cb-8a9bbe638ff0` closed those
load-bearing issues and the rollback ambiguity. Its packet excluded the
contract validator; Codex directly verified semantic-version enforcement and
added missing privacy/identity/source-ref validation plus the separate 256-KiB
batch envelope.

Measured implementation-review usage:

- R1: five model calls; 125,983 cache-create, 264,722 cache-read, 33,795 output
  tokens; maximum context 134,549, above the 100k target;
- R2: five model calls; 112,474 cache-create, 235,975 cache-read, 25,983 output
  tokens; maximum context 119,248, above the 100k target.

## Final verification

- relationship-focused run: 9 files / 30 tests passed;
- opt-in PostgreSQL store test: 1/1 passed;
- root format, typecheck, and build: passed;
- full root: 298 files / 3,274 tests passed; 10 files / 24 tests skipped; only
  the unchanged unrelated `src/cnpc-prompt-contract.test.ts` wrapper-literal
  failure remains;
- container runner build and full test suite: 8 files / 45 tests passed;
- documentation continuity, capability matrix, and staged/unstaged diff checks:
  passed;
- disposable PostgreSQL:
  - base schema plus migration 137 apply passed;
  - legacy source backfill inserted once and replayed no-op;
  - pre-existing wrong-owner scoped ref aborted backfill;
  - oversized manifest JSON was rejected;
  - claims/refs/exceptions/observations/projections/query/Plutio merge lineage
    and merged-write refusal passed;
  - actual PostgreSQL store ingest/replay/projection/query receipt passed;
  - non-admin relationship-context grants: zero;
  - populated rollback refused and retained tables;
  - separate empty rollback succeeded;
  - both disposable databases were dropped.

## Immutable local completion

- pushed branch: `codex/relationship-context-dark-foundation-20260825`;
- implementation commit:
  `050fed67aabcf3cc7cbc52dcc74ffa63eb6e62b4`;
- source tree: `5f1c64f01f3a5e232f998fc8b054dbaf886bc090`;
- release-build proof: 980 files, artifact
  `20ead1203c836ce417a4916e5ede77223d3920436425dc321eebee2c2a88e33d`,
  archive
  `e694bb2031f54f1facf3b0a4f3616a46b1162e076472ebe3e339013fdf2eb6e4`.

The artifact was built to prove the exact committed source packages through
the established workflow. It was not activated or deployed.

## Separately gated after this task

Production migration, real adapters/provider access, Booking identity migration,
Plutio field discovery/write/backfill, minion capability grants or prompt
changes, deployment, live verification, and natural business outcomes.
