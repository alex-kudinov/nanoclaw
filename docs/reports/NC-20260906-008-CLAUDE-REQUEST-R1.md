# Independent bounded persistence review

Read only these five implementation/proof artifacts and the critical diff:
- `src/student-enrollment-store.ts`
- `src/student-enrollment-store-mapping.ts`
- `scripts/verify-student-enrollment-store-disposable.mjs`
- `scripts/student-enrollment-store-disposable-worker.ts`
- `docs/reports/NC-20260906-008-CRITICAL-SCHEMA-EVIDENCE.md`

Write material findings with exact references and reproduction, or NO MATERIAL
FINDINGS, to `docs/reports/NC-20260906-008-CLAUDE-RESPONSE-R1.md`, then stop.
Read each file once; stay under eight tool calls. Read/Write only, write only
the response. No other reads, Bash/web/MCP, secrets, .env, auth/session stores,
real records, network or production access. About 47k characters total.

Accepted scope: local unwired persistence of the reviewed ingress function's
two canonical aggregates in the existing 20 relational tables, with real
disposable PostgreSQL proof. No production migration, host/provider activation,
real/historical data, replay, payments/refunds or communication. Pool/proof
authority is trusted HOST input; no external interface is installed.

Required contract: generated disposable namespace and Unix-socket guards before
data access; SERIALIZABLE plus ordered table locks before data snapshots;
version CAS, immutable history/evidence, exact foreign-key resolution and
readback; one transaction for aliases, proofs, enrollment, capacity, finance,
exceptions and outbox; failures roll back; COMMIT errors are explicitly unknown
and retry uses the same intake identity. Internal mapping helpers require the
public caller's transaction/locks and are not standalone autocommit APIs.
Broad locking/full snapshots are accepted for this local proof, not production
throughput. Preserve SQL delivery metadata; refuse active leases.

Predecessor facts (do not re-investigate): applyEnrollmentIngress is pure,
host-proof bound, preserves payer/participant separation, owns quarantines,
and deduplicates source/intake aliases. Verified paid promises stay counted
even when full or participant identity is held; only exact participants/classes
materialize. Duplicate source conflicts can hold/version pending projections.
There are no providers inside those engines. IDs are stable domain keys;
database serial IDs are internal references. Timestamp normalization must not
change evidence/payload hashes. The canonical SQL schemas 142–145 are unchanged
and all 20 mapped relations are populated/read back in the real proof.

Two schema mismatches were exposed by actual PostgreSQL testing and corrected
locally in migration 146: missing projection version column; attach_evidence
logging every proof as parent-order version zero, violating unique history.
Evidence history now uses its own evidence key, no old rows rewritten. Rollback
refuses populated outbox/evidence history; empty rollback/reapply is tested.

Assess actual loss/duplication, stale snapshots, commit uncertainty, SQL/FK/
version mapping, append-only preservation, disposable containment and meaningful
failure/race tests. Tests pass including source-alias/paid-seat races, forced SQL
failure, lost commit acknowledgement, linked evidence, synthetic projection
receipt, waitlist, grants, partial sponsor, stale CAS and leases. Root typecheck
and worker typecheck pass; full root 3,706 pass/32 skip with the two known,
unchanged CNPC/Trafft baseline failures. No broad archaeology or speculative
production backlog. Sonnet/high, fresh independent review.
