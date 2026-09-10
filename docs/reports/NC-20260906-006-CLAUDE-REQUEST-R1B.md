# Bounded adapter review, restarted after read-budget drift

Read exactly these three files once, then write material findings to
`docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R1B.md` and stop:

1. `src/bookkeeper-enrollment-contract.ts`
2. `src/bookkeeper-enrollment-contract.test.ts`
3. `docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md`

No other source reads. This is an independent review of the NEW adapter, not
the predecessor engines. Stop after at most eight tool calls with a verdict.
No Bash/web/MCP/network or edits except the named response. Never access
credentials, .env, session stores, real records, data dumps, or unrelated files.

Review correctness against the contract and find material counterexamples.
Pay attention to idempotency over lifecycle changes, exact source admission,
account/canonical-payment scoping, payer versus participant, duplicate people,
finance/grant authority, catalog evolution, per-seat rollback, capacity counting,
projection/hold/version semantics, and future-effective enrollments. Report
precise reproductions and file lines, not speculative backlog or restatement.

Accepted dependency mechanics, independently inspected by Codex and covered by
87 passing predecessor tests (do not re-investigate them):

- All enrollment/capacity commands are pure, clone state, and use the supplied
  expected entity versions. They do not validate caller authorization.
- captureOrder keys sources by scope/type/ID and idempotency key; material source
  conflicts throw. Order evidenceSha256 can change on correctOrderTerms.
- createSeats requires the exact declared seat count; assignParticipant records
  the named Party, evidence hash, and payer relationship.
- materializeEnrollment checks order/seat, funding classification, explicit
  payer consistency, open/acknowledged order/seat exceptions; creates only
  supplied entitlements; pending requires effectiveAt. It changes seat/order
  versions and records history; no provider action occurs.
- reserveCapacity requires an active offer mapping, open/scheduled block/pool,
  exact pool version and supplied order/seat bindings. For channel commitment it
  requires source scope in website_stripe_sale/invoice/check/sponsor/manual_sale
  and expiresAt exactly block.endsAt. It allows paid commitments above capacity
  and counts them, but does not validate whether their person is known.
- showInventory counts pending/active assignments plus live commitments/holds;
  available is clamped to zero.
- commitClassAssignment checks exact live commitment, pool and enrollment
  versions, mapping, offer/catalog/component/order/seat, no blocking enrollment
  exceptions, and no duplicate assignment for the enrollment/block. It calls
  assignClass and consumes the commitment, returning BOTH updated aggregates.
- requestProjection creates a queued versioned outbox record; readback only
  verifies matching subject version and expected hash. There is no executor.
- openEnrollmentException appends a durable canonical-subject exception and
  history, with role ownership and review time, but does not automatically hold
  already queued projections or mutate financial/enrollment state.

The runtime authority parameter is a trusted HOST-only fixture boundary, never
an agent/HTTP value; hashing cannot authenticate native evidence. Future source
adapters/persistence and replacement of the existing live roster/commitment
path are excluded and explicitly gated. Local full-settlement/grant contract
and one explicit starting assignment per seat are accepted scope. No history,
production, provider/Sheet writes, deployment, payment/refund, or communication.

Focused 124/124 passed; typecheck passed; full root 3,657 pass/32 skip and two
confirmed unchanged predecessor failures. The first review was interrupted
after repeated engine reads without a verdict; no findings exist from it.
This fresh Sonnet/high review has about 46k characters of source/doc inputs.
