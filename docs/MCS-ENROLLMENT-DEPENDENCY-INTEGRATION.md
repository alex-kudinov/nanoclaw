# MCS enrollment source dependency integration

NC-20260909-003; source-only, no production activation or migration.

Payment base57d86497 imports exact final reviewed source content from
`origin/codex/student-enrollment-projection-foundation-20260909` at d9e29856.
The selected73 files are the source, migrations146-148, test helpers, contracts,
and review/evidence records introduced by6952442c,86141afa,ef52b51d,a46ecfe2,
and deaab99c, excluding their shared continuity files. Business database
instructions and current continuity are merged additively. A worktree-to-source
comparison over all73 selected paths returned no differences after staging.

The full branch merge was previewed and aborted because it also included
unrelated catalog-audit, agent and configuration changes. Those were not
imported. No Supervision production-pilot selector/runtime or source-activation
policy is included. Existing payment migrations149-151 are preserved.

The dependency provides canonical Bookkeeper order/seat composition,
proof-bound ingress, transactional PostgreSQL persistence, authenticated issuer
receipts/shared writer claims, and exact-destination projection outbox/readback.
It remains the reviewed disposable-only implementation. A new Adyen or
zero-price source must be registered explicitly, with provisional-access and
received-funds certification semantics reviewed, not disguised as settled
Stripe funding or an owner grant.

Verification at import:120 focused enrollment tests pass, including real
disposable PostgreSQL store/admission/writer-race/projection proofs; typecheck
passes. Full bounded-worker verification:4035 pass/32 skip, with exactly the
three established unrelated CNPC/Trafft/capacity fixture failures; the default
parallel PostgreSQL contention timeout does not occur with maxWorkers=2.
No tests were selectively excluded for that run. None of these
tests reads real students or invokes native providers.

Runtime/schema source availability is not exact-population activation authority.
The standalone Foundations publication and source-readiness gates remain open;
the accepted existing full-program publication is not a standalone offer.
