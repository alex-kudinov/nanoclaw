# NC-20260909-004 narrow production-pilot review R1B

Review only five files and write material findings only. This replaces an
interrupted oversized review; do not read its session or broaden scope.

## Exact authority

One future natural Tandem Stripe `supervision-inaugural` v1 event only:
undiscounted USD 399600 minor units, paid-in-full/settled, one self-purchasing
canonical Party, class `supervision:2026-10-07`, capacity 15. One atomic
`writer=enrollment` claim and policy budget; Payment Log and `public.payments`
always verify before immediate CSS plus Heartbeat delivery. Historical,
synthetic, second, installment/invoice, refunded/disputed, wrong source/class,
multi-seat, communication, and broader cutover are forbidden. Any uncertain
provider acceptance holds without blind retry. Rollback touches only exact
receipt-owned effects.

## Read only

1. `src/student-enrollment-production.ts`
2. `src/student-enrollment-stripe-evidence.ts`
3. `src/student-enrollment-provider-drivers.ts`
4. `src/student-enrollment-pilot-runtime.ts`
5. `src/stripe-payment-host.ts`

Do not read other source, docs, tests, `.program`, environment files, secrets,
provider data, or prior Claude artifacts. Accepted supporting contracts:
`createEnrollmentAdmission` runs the injected decision under SERIALIZABLE with
all canonical tables locked; the injected claim and finalizer are inside it;
the production persistence hook writes target identities before COMMIT;
`claimExactProjection` fences one assignment/version; `deliverProjection`
records accepted/readback/held outcomes; Contador `--accounting-only` produces
verified payment-log/PostgreSQL receipts and a pending roster receipt.

## Questions

Find only defects that can cause an unauthorized event/effect, duplicate or
lost canonical/provider effect, false completion, accounting loss, unsafe
retry/rollback, unusable production start, or violation of the exact one-event
scope. Check especially:

- refusal versus post-claim behavior in the shared host path;
- native event/source/amount/discount/invoice/refund/product/class/Party proof;
- atomic budget and capacity checks;
- exact target selection and restart behavior;
- preimage durability plus append/update/membership compensation;
- provider errors before versus after possible acceptance;
- whether health/config state could claim readiness falsely.

## Response

Write only
`docs/reports/NC-20260909-004-CLAUDE-REVIEW-RESPONSE-R1B.md`.
For each material finding give severity, file/line, concrete failure scenario,
violated invariant, and smallest correction. Ignore style/future enhancements.
End `MATERIAL FINDINGS` or `NO MATERIAL FINDINGS`.
