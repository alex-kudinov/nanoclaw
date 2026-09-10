# NC-20260909-004 bounded production-pilot review R1

## Decision requested

Review the new production integration only. Report material correctness,
security, data-integrity, idempotency, accounting-continuity, provider-
acceptance, rollback, or release-gate defects that must be fixed before P01-P10
or deployment. If none remain, write `NO MATERIAL FINDINGS`.

This is a C5/C4 one-natural-event pilot. Be adversarial and concrete. Do not
reimplement it, broaden the rollout, reopen already reviewed local foundation
semantics, inspect secrets/customer data, or perform any external action.

## Authority order

1. Accepted owner decision (do not read `.program`; its exact operative scope
   is summarized below).
2. `docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.json`.
3. Current code and tests listed here.

Owner-authorized scope is exactly one future natural, undiscounted USD 3,996,
paid-in-full, fully settled, self-purchased Tandem Stripe
`supervision-inaugural` v1 event for `supervision:2026-10-07`, capacity 15,
followed immediately by CSS and Heartbeat projections. Historical, repaired,
synthetic, second, installment, discounted, sponsored, invoiced, refunded,
disputed, multi-seat, Encharge/Plutio, communication, certificate, and broader
writer activity remain forbidden.

## Allowed read paths

- `docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.json`
- `src/student-enrollment-production.ts`
- `src/student-enrollment-stripe-evidence.ts`
- `src/student-enrollment-provider-drivers.ts`
- `src/student-enrollment-pilot-runtime.ts`
- `src/stripe-payment-host.ts`
- `tools/contador/process-payment.cjs` (only the argument parsing,
  `formatRosterSummary`, `derivePaymentFulfillmentOutcome`, roster branch, and
  final sentinel sections)
- `src/student-enrollment-admission.ts` (only injected production persistence,
  claim, and finalization hooks)
- `src/student-enrollment-store.ts` and
  `src/student-enrollment-store-mapping.ts` (only guard injection and
  transaction/readback changes)
- `src/student-enrollment-projection-store.ts` (only production guard and exact
  claim/readback additions)
- the matching new tests for those files if needed to validate a finding.

The broader restored admission/store/projection implementation and migrations
146-148 already had bounded review on their source branches. Reopen them only
when the new integration demonstrably violates one of their contracts.

## New implementation to scrutinize

- Production startup is default-off and should fail closed unless immutable
  release commit, activation epoch, P01-P09 receipt hash, marker UUID, and three
  distinct host-only issuer keys are bound.
- Native evidence reloads Payment Intent, Checkout Session, line item, product,
  price, charge and canonical Party. Selection must happen before a writer
  claim and preserve legacy processing on refusal.
- Exact capacity/pool/mapping readiness and one-event budget are checked under
  the SERIALIZABLE canonical transaction before `writer=enrollment`.
- Authenticated receipts, writer claim, canonical state, and both target
  delivery identities commit together. Lost COMMIT acknowledgement may only
  replay the exact immutable certificate.
- After `writer=enrollment`, Contador must still verify Payment Log and
  `public.payments`, skip the legacy roster, and never run provider projections
  until both accounting receipts verify. It must never fall through to legacy
  registration after an enrollment claim.
- Student Roster must preserve A:M outside the exact C/F:M plus conditional B
  contract, hold duplicate/ambiguous identity, exact-read-back the row, and
  restore only an unchanged receipt-owned preimage.
- Heartbeat must add only two exact groups with sibling removal disabled,
  exact-user/readback group UUIDs, hold ambiguous acceptance, and remove only
  memberships absent in its recorded preimage.
- A worker must claim only this event's exact assignment/version, treat a
  prior verified target as complete after restart, and never blindly retry an
  uncertain provider acceptance.

## Evidence already passed

- Node 22.23.2 typecheck and build.
- 132 focused tests across the restored foundation plus selector, native
  evidence, provider drivers, shared Stripe host, and Contador.
- Full root: 3,838 pass / 32 skip / three failures reproduced unchanged on
  exact live `00d66184` (stale CNPC wrapper assertion, date-sensitive Trafft
  fixture, Academy Capacity disposable reservation expectation).
- Documentation continuity passes after task-owned migrations were staged.
- No production/provider/database/Sheet/Heartbeat/config/payment/student write
  occurred.

## Response contract

Write only
`docs/reports/NC-20260909-004-CLAUDE-REVIEW-RESPONSE-R1.md`.

For each material finding include severity, exact file/line evidence, failure
scenario, violated packet invariant, and the smallest safe correction. Do not
report style, naming, speculative future enhancements, already accepted
non-objectives, or the three disclosed unrelated baseline failures. End with
one of `MATERIAL FINDINGS` or `NO MATERIAL FINDINGS`.
