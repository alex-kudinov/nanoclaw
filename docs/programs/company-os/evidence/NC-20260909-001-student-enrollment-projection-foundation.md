# NC-20260909-001 — Student enrollment provider-projection foundation

## Outcome

Local, unwired projection mechanics are implemented and reviewed for the first
fully settled, self-purchased, dated Supervision population. Production/provider
readiness remains deliberately false and deployment is not applicable.

## Exact integration lineage

- Starting canonical admission/store authority:
  `8b1ffbb9902b5fd3f7df245142d54db3de92dcee`.
- Lifecycle strategy and routing integrated through original reviewed closure
  `40f0d364b3d7edcfcf87aca24af92984f866ba16`.
- Read-only catalog reconciliation integrated through original reviewed closure
  `0e6fb6050a304689561234d8fdbb0282674ae5bd`.
- Supervision/MCS source-bound publication mechanics and evidence integrated
  through original current publication closure
  `55c068d2c39b9295b0a79ebe65369a3cc68172dc`.
- Unrelated selective-consultative Sales source was excluded. Shared Project
  Map, Active Work, and changelog histories were reconciled by meaning; current
  admission/store facts and final publication closure facts are both retained.
- Cross-machine task claim was committed and pushed first at `b99b5362`.
- Reviewed implementation commit:
  `deaab99ca4c756f54d22d8c6e6f9b2d4a91daf69`.

## Files and mechanics

- `src/student-enrollment-projection.ts`: deterministic Student Roster and
  two-layer Heartbeat payloads; target normalizers; injected driver; exact
  readback; real provider operation identity; retry/uncertain/rollback paths.
- `src/student-enrollment-projection-store.ts`: guarded disposable-only queue,
  target/version idempotency, stale refusal, `SKIP LOCKED` claims, lease fencing,
  version supersession, receipts, and durable projection exceptions.
- Migration 148 plus guarded rollback: destination, target idempotency,
  operation, readback, uncertainty, and supersession evidence only.
- Projection target catalog: roster and Heartbeat required; Encharge and Plutio
  explicitly not applicable. Current permission/activation readiness is false;
  the Heartbeat delivery-marker provider identity is absent.
- Unit, catalog, migration, and disposable PostgreSQL proof artifacts; all data
  and providers are synthetic.

## Review and corrections

Claude Code Sonnet/high R1 session
`269320c8-3c9f-478a-a1e9-face9c32e91d` found two material issues:

1. An active claim could be superseded during a provider apply, orphaning a real
   effect. Corrected by blocking new versions behind claimed/applied/held work,
   limiting stale sweeps to queued/failed rows, re-fencing after apply, and
   atomically holding post-apply version/lease loss without the old lease.
2. Replay derived a fake operation ID from payload. Corrected so provider lookup
   returns and preserves the genuine operation ID through readback and rollback.

R1 usage: 7 model calls; 88,633 cache-create; 332,510 cache-read; 19,678 output;
93,474 maximum context; no warning threshold.

Claude R2 session `e77e1c9a-7cea-4d20-b202-c1ccbb18b5f1` returned
`NO MATERIAL FINDINGS` on the load-bearing corrections. R2 usage: 9 model
calls; 89,437 cache-create; 481,785 cache-read; 11,809 output; 99,324 maximum
context; no warning threshold.

Review-scope disposition: both runs had only `Read,Write`, strict empty MCP,
Sonnet/high, and fresh sessions. R2 exceeded its five-file prompt by reading the
directly related migration 148 and predecessor migration 142. No credential,
runtime database, provider, secret, or unrelated private source was read, but
the round is not described as exact-scope compliant and Claude's own “five
files only” scope note is inaccurate. Its response artifact remains verbatim.

## Verification

- Pinned Node 22.23.2 typecheck: pass.
- Focused engine/catalog/migration/disposable suite: 15/15 pass.
- Disposable PostgreSQL: generated `nc_student_enrollment_store_<32 hex>` only;
  one-winner claim, exact readback, failed-to-retry attempt 2, uncertain
  acceptance before retry, duplicate enqueue/effect prevention, in-flight
  version and lease-loss holds, real operation-ID replay/rollback, stale
  refusal, supersession, canonical commitment preservation, populated rollback
  refusal, database drop and zero residue pass.
- Full root suite with four workers: 3,774 pass / 32 skip / 3 failures. All
  three failures reproduce unchanged on integrated predecessor `c246671c`:
  CNPC wrapper-literal assertion, date-stale Trafft projection fixture, and
  time-sensitive Capacity disposable reservation expectation.
- Documentation continuity/capability matrix, typecheck, diff check, and focused
  reruns pass before final commit. Final commit/push and clean remote-head
  evidence are recorded in the closure addendum/changelog.

## No-live-action proof

No real credential, provider read/write, browser, CSV, student or historical
row, production database, migration apply, paid-event routing, writer cutover,
runtime composition, deployment/restart, financial action, or communication was
used. `STUDENT_PROJECTION_MODE` is `local_unwired`; the database guard accepts
only generated disposable names over the local Unix socket; the tracked target
catalog leaves every permission and activation flag false.
