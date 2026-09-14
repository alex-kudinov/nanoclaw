# NC-20260914-001 bounded D3 identity-safety review — response R1

No material findings.

## Scope covered

Reviewed exactly the eight listed files plus the request packet. Traced the
full path: two-census stability/order/gap checks and identity-quality gates
in `prepareHeartbeatAggregateSnapshot` (`d3-heartbeat-snapshot.ts:275-348`) →
shape/privacy/hash/freshness re-validation in
`validateHeartbeatAggregateSnapshot` (`d3-heartbeat-snapshot.ts:350-563`) →
advisory-locked, artifact-keyed duplicate detection and one-shot write path
in `importHeartbeatAggregateSnapshotWithClient`
(`d3-heartbeat-reconciliation.ts:284-482`) → host-pinned CLI wrapper
(`d3-heartbeat-reconciliation-cli.ts`) → migration-167 triggers and
append-only/attempt-prohibited constraints. Cross-checked against the
disposable-PostgreSQL lifecycle test (`d2-student-lifecycle-shadow.disposable.test.ts:392-521`).

## Checks performed against each accepted-boundary risk

- **Stale/changed/private evidence:** both censuses must be strictly
  ordered, ≤15 min apart, and byte-identical on every field except
  `observedAt` (`d3-heartbeat-snapshot.ts:283-299`, re-enforced on import at
  `:490-499`); `artifactSha256` is a hash over the full unsigned payload and
  is re-verified byte-for-byte on import (`:560-562`). Group names, webhook
  filters, destination hosts, and action bodies never enter the artifact —
  only their SHA-256 fingerprints do; the test at
  `d3-heartbeat-snapshot.test.ts:92-95` asserts this directly. Import is
  bounded to the window `[observedAt(second census), freshUntil]`
  (`:554-559`).
- **Non-idempotent replay:** duplicate detection keys on
  `(provider, environment, source_scope, entity_set, source_watermark=artifactSha256)`
  under an xact-scoped advisory lock (`d3-heartbeat-reconciliation.ts:293-314`);
  the duplicate path performs zero writes and re-verifies expected
  item/projection/command/readback/attempt counts before returning
  (`:219-282`). The disposable-DB test proves exact replay inserts zero
  rows across all tracked tables (`d2-student-lifecycle-shadow.disposable.test.ts:469-484`).
- **Incomplete evidence looking complete:** `fn_tandem_identity_finalize_reconciliation_run`
  and the `provider_reconciliation_runs_transition` trigger recompute
  `observed_count`/`held_count`/`snapshot_sha256` server-side from the actual
  `provider_snapshot_items` rows rather than trusting caller-supplied
  numbers (migration lines 859-962); a run cannot reach `status='complete'`
  with mismatched counts. `assertPreserved` re-reads Party/ref/auth/decision/
  attempt/D2 counts before and after the write and throws on any delta
  (`d3-heartbeat-reconciliation.ts:81-85`, `:316`, `:461-462`).
- **Canonical identity/access drift:** D3 never calls any Party/ref/auth/
  resolution-writing function; `assertPreserved` enforces this at the DB
  level for every import, and D2's counters are scoped separately
  (`adapter_key='tandem_identity_student_lifecycle_shadow'`,
  `source_scope='community'`) so they cannot mask a D3-side change.
- **Provider attempt/write:** `provider_projection_commands` structurally
  forces `writes_enabled=false`, `attempt_count=0`, `provider_operation_id
  IS NULL`, `next_attempt_at IS NULL` via column CHECKs (migration lines
  386-389); `provider_projection_attempts` INSERT is unconditionally
  rejected by `fn_tandem_identity_attempt_prohibited()` (migration lines
  823-832, wired at 1053-1056). The app code path never targets that table.

## Non-blocking observation (not a finding)

`scripts/prepare-tandem-identity-d3-heartbeat-snapshot.mjs` imports compiled
output (`../dist/identity-control-plane/d3-heartbeat-snapshot.js`) rather
than the TypeScript source reviewed here. Confirmed the checked-in `dist/`
currently contains this version's logic (`artifact_stale_or_future` and
`census_observation_gap` markers both present), so there is no live
divergence today. This is the same stale-build class already tracked
project-wide (`npm run build` precondition, `feedback-stale-incremental-build`
memory) and not specific to D3 — noted for completeness, not raised as a
defect requiring correction here.
