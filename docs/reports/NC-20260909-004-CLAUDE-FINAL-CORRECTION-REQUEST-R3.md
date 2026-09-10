# NC-20260909-004 final bounded correction review R3

Owner explicitly approved this final third completed Sonnet/high review. Review
only the post-R2 corrections below. Do not reopen prior findings or broaden
scope.

## Exact authority

One future natural Tandem `supervision-inaugural` v1 event: direct PaymentIntent
or applicable Checkout Session, undiscounted USD 399600, fully settled,
self-purchased by one exact Party, `supervision:2026-10-07`, capacity 15. Every
post-activation in-scope roster effect requires persisted `writer=legacy`;
enrollment ownership, uncertainty, missing claim, claim-read failure, or direct
CLI invocation is accounting-only. Existing roster rows may write C and F:M,
plus B only when blank/Unknown; A/D/E are never rewritten.

## Read only

- `src/student-enrollment-production.ts`
- `src/student-enrollment-stripe-evidence.ts`
- `src/student-enrollment-provider-drivers.ts`
- `tools/contador/process-payment.cjs` only argument parsing,
  `enrollmentRegistrationMode`, writer-claim read, registration-mode selection,
  and roster branch
- matching new tests only if required

## Corrections to verify

1. Tandem's current paid-in-full Payment Element creates a direct PaymentIntent,
   not a Checkout Session or stable one-time Price. Native evidence now accepts
   that exact direct path only with source-stamped offer/cohort/Party/email/name,
   accepted terms version, standard nonregional/no-coupon metadata, exact
   amount-received, charge amount/currency, no invoice/refund/dispute/Connect
   transfer, and Party lookup agreement. Checkout Session evidence remains
   separately exact when it actually exists.
2. Refused but source-valid post-activation pilot events atomically claim
   `writer=legacy` before the old route. The Contador CLI independently reads
   the persisted canonical PaymentIntent writer. Only legacy permits roster;
   enrollment/no-claim/read-failure/missing event time becomes accounting-only.
   Pre-activation and unrelated offers remain unchanged.
3. Existing Student Roster rows update only B:C or C plus F:M. Rollback verifies
   the full postimage but restores only B:C/C plus F:M. A/D/E are never written.
   Preimages are file-and-directory fsynced before provider effects.

Evidence: 143/143 focused tests, typecheck, build and continuity pass. Full root
is 3,846 pass / 32 skip / three exact-live baseline failures; one unrelated
parallel-load timeout passed immediately alone. No external mutation occurred.

Write only
`docs/reports/NC-20260909-004-CLAUDE-FINAL-CORRECTION-RESPONSE-R3.md`.
Report only a material remaining defect with exact file/line/scenario and the
smallest fix, or `NO MATERIAL FINDINGS`. End with that verdict.
