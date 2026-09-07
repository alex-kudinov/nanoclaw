# Bounded independent review: product identity bridge — response R1

Reviewer: Claude (Sonnet), independent pass per request packet R1.
Scope reviewed: `NC-20260907-001-REVIEW-DIFF.txt`, `docs/STUDENT-PRODUCT-IDENTITY.md`,
and `tools/contador/process-payment.cjs` (read for necessary call-site context:
`fetchPaymentData`, `fetchPaymentWithKeyFallback`, `resolveRosterTargets`,
`derivePaymentFulfillmentOutcome`, and the roster-write call site).

## NO MATERIAL FINDINGS

Traced the paths the acceptance criteria depend on and found no defect:

- `stripeAccount` (used as `resolveProductIdentity`'s `account` arg) is set by
  `fetchPaymentWithKeyFallback` (`result.stripeAccount = STRIPE_ACCOUNT`,
  `process-payment.cjs:534`) even though `fetchPaymentData`'s own return object
  omits it — confirmed this is pre-existing plumbing, not a gap introduced here.
- `resolveRosterTargets` (`process-payment.cjs:407-427`) keys only on
  `row[1]`/`row[2]` (tab/column); it never reads `row[0]`. The resolved-identity
  rows carry a synthetic `offer:<key>` label in `row[0]` in place of a product
  name — confirmed inert for routing.
- Binding validation (`compileProductBindings`) rejects any route whose
  `roster_targets` includes `(not a student)`, so a `resolved` identity can
  never produce an empty/not-a-student route; `resolved.rows` is always
  non-empty by construction, matching the acceptance contract.
- Cross-account reuse, mixed/partial signals, and incomplete invoice evidence
  all correctly fall through to `conflict` in `resolveProductIdentity`
  (`product-identity.cjs:239-275`) rather than resolving optimistically;
  traced each of the 8 `product-identity.test.ts` cases against the source
  and each assertion matches actual behavior.
- `identityIncomplete`/`identityProductIds`/`identityPriceIds` are populated
  correctly for all three fetch shapes in `fetchPaymentData` (checkout
  line items, PI+invoice, and full-payment PI with no invoice/no native
  price) — the no-invoice case correctly leaves both id arrays empty and
  `identityIncomplete` false, which is the documented "offer slug only, no
  native product/price" case, not a false-incomplete or false-complete state.
- The `identity_conflict` roster mode returns `rows: []` from
  `resolveProductIdentity`, so the existing per-row write loop naturally
  no-ops (no special-case skip needed) while `derivePaymentFulfillmentOutcome`
  correctly maps it to `needs_review` / `product_identity_conflict` and an
  `exception` receipt outcome, leaving payment-log/Postgres accounting
  stages independently gated as before.

No boundary regression, no omitted error path, and no semantic mismatch
between `docs/STUDENT-PRODUCT-IDENTITY.md`'s stated contract and the diff's
implementation was found within the reviewed packet.
