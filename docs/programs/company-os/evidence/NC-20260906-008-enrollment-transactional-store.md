# NC-20260906-008 atomic enrollment persistence evidence

Company OS `work:student-enrollment-transactional-store`, accepted decision
`decision-student-enrollment-transactional-store-2026-09-06` from the owner's Go.

## Source and authority

- Program validated at r230, no active claim. Authorization r231, claim r232,
  nine explicit continuity commitments r233. This task is the sole claim.
- Isolated `/Users/xbohdpukc/dev/NanoClaw-enrollment-store-20260906`, branch
  `codex/student-enrollment-transactional-store-20260906`, base `e6463ba2`.
  Registration was committed/pushed before implementation. Primary source
  remains dirty on `codex/continuity-reconciliation` at `51185a5d`.
- Canonical tables/types and the existing partial operator store were inspected
  before coding. The new store is separate and has no production wiring.

## Implemented and corrected

See `docs/STUDENT-ENROLLMENT-TRANSACTIONAL-STORE.md`. Public intake transaction
guards database/socket, locks the 20 relations, loads a consistent snapshot,
invokes the reviewed ingress engine, persists relational deltas, verifies full
canonical readback and only returns after COMMIT acknowledgement. Uncertain
COMMIT raises a distinct exception and destroys the connection. Exact intake
retry reconciles the outcome without duplicate effects.

The real database proof caught two schema/domain mismatches missed by pure
tests: absent projection `version`, and evidence attachments colliding with
parent-order version-zero history. Local/unapplied migration 146 adds version
and the evidence history subject; the source command uses evidence identity.
No old migration or existing historical row was rewritten. SQL-only delivery
metadata is preserved; active leases, immutable changes, deletes, stale versions
and readback mismatches are refused.

## Executed verification

- Pinned Node 22.23.2 dependencies; root typecheck and standalone worker
  TypeScript check pass. Focused 148/148 across seven files.
- Real PostgreSQL proof succeeds as nanoclaw_admin in a fresh random local DB.
  Every mapped relation is populated, including source-linked evidence,
  synthetic projection receipt and waitlist references. Exact intake replay
  preserves the canonical snapshot after reconstruction.
- Concurrent aliases produce one order/enrollment. Concurrent paid last-seat
  intakes produce occupied 1, committed 1, available 0: the oversale remains an
  owned exception and counted funded commitment, not a second assigned student.
- Forced outbox INSERT failure rolls back all business rows and allows retry.
  Simulated lost COMMIT acknowledgement reports uncertainty; fresh retry is
  duplicate-only. PostgreSQL sequence gaps are not business-state mutations.
- Partial sponsor: one materialized, one unassigned funded seat. Grant and
  quarantine persist/replay. Source conflict persists held projection version 1.
- Delivery attempt/error columns survive an actual projection UPDATE; claimed
  leases refuse intake. Forced stale CAS, deletion and evidence rewrite refuse.
- Migration 146 empty rollback and reapply succeed; populated outbox rollback
  refuses. Zero explicit non-admin grants across the 20 canonical relations.
- Harness pins local socket/port/user, strips PG routing/password settings,
  uses no password/service files, creates no cluster role/membership and removes
  the generated database on success/failure. Final success verifies no residue.
- Full root: 3,706 pass / 32 skipped / two unchanged failures: CNPC stale
  wrapper-literal assertion and date-sensitive Trafft freshness fixture.
  No production/provider/customer data was read or changed for these checks.

## Independent review and closure

- Fresh Sonnet/high R1 `45fbcfca-508d-424f-a0b9-83e82b00f58b`, 100k compaction,
  Read/Write only, exact five allowed implementation/proof artifacts, via the
  installed `alex,info` rotation runner. Verdict/usage and final Git/program
  receipts will be appended. No review or production success is assumed.

## Review closure

- R1 returned **NO MATERIAL FINDINGS**. One fresh bounded Sonnet/high round,
  four model calls; 67,325 cache-create, 132,807 cache-read, 16,994 output,
  maximum context 74,099 tokens. No usage warning; Claude wrote only its named
  response artifact. Codex remains responsible for the tested source.
- Review checks covered namespace/socket guards, snapshot/lock order, version
  CAS, immutable prefixes, foreign keys/readback, uncertain commits, active
  leases, migration/rollback and the evidence identity correction. Its minor
  narrative descriptions of the original failure are secondary to the actual
  recorded uniqueness failure and source diff; no unresolved material finding.
- Root typecheck and standalone worker check with `--strict` pass. Both known
  full-suite failures reproduced on unchanged predecessor `e6463ba2` in this
  task (8 pass / 2 fail). No new failure is being classified as baseline.
- Final staged continuity passes: 165 task rows / 161 changelog entries,
  schema sanitizer and generated capabilities checks clean. The existing live
  schema snapshot date is preserved with a clearly labeled local 146 delta.
