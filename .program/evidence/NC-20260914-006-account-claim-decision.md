# NC-20260914-006 account-claim path decision

Recorded: 2026-09-15T00:21:06Z

- Current result: all 12 proof cases have stable Heartbeat graphs; six remain
  staged, four remain ambiguous and two resolve exactly. More weak matching
  evidence cannot release the ten holds.
- Selected mechanism: authenticated explicit account claim using the accepted
  Google Identity Platform subject as authentication evidence and Company OS
  as Party-binding authority.
- Minimum-sufficient review: fresh-context Codex Sol/high returned `KEEP` with
  two reductions—use one concrete normalized Google claim rather than a
  generalized provider abstraction, and omit `claim_available` until a future
  challenge/UI lifecycle exists.
- Walking skeleton: NanoClaw-only pure claim contract/evaluator plus disposable
  migration-167 adapter. It proves held-without-claim versus
  `resolved_claim_or_operation`/`accepted_claim` with exact replay, altered
  reuse refusal and zero partial writes.
- Deferred: BFF route, customer UI, Firestore challenge store, signing keys,
  live token transport, real users, production binding, Party creation,
  provider/access writes, DDL and deployment.
- Source checkpoint:
  `/Users/xbohdpukc/dev/tandemweb/SOPs/plans/tandem-identity-readiness-2026-09-13/23-account-claim-minimum-sufficient-checkpoint.md`.

The decision is implementation authority for the dark foundation only. A real
claim or production activation remains an owner decision.
