# Bounded independent review: product identity bridge — response R2

Reviewer: Claude (Sonnet), narrow-correction pass per request packet R2.
Scope reviewed: this file's own request, `process-payment.cjs:548-700`
(`fetchPaymentData`), `product-identity.cjs`, and R1. No Bash/MCP/network,
no other files, per packet constraint — test execution not performed in
this pass; findings are static-trace only.

## Correction verified: closes the gap, no unintended expansion

The catch at `process-payment.cjs:614-618` (checkout branch, PI/charge
fetch) now sets `identityIncomplete = true` instead of swallowing the
failure silently. Confirmed present exactly where R2 describes it:

- Checkout line item product/price IDs are pushed into `identityProductIds`
  / `identityPriceIds` via `addLineIdentity` (line 577) *before* the
  `payment_intent` fetch at line 596. If that fetch (or the dependent
  charge fetch) throws, those arrays already hold whatever native IDs the
  line items carried, but `canonicalProductSlug` (the metadata offer,
  only ever set inside the try block at line 600) is never populated.
- Before this correction, an empty catch left `identityIncomplete=false`
  in that failure case. In `resolveProductIdentity`
  (`product-identity.cjs:79-105`), a known native-product/price match
  routes to `resolved` purely on `known.length` + `offerKeys.size === 1`
  when `input.incomplete` is false — with no way to know the unread
  metadata offer might have contradicted it.
- With the correction, `input.incomplete` is `true` in that same failure
  case, so the `if (input.incomplete || ...)` check at line 98 forces
  `status: 'conflict'` (`product_identity_conflict`) instead of resolving.
  The route is held, matching the packet's description of "the resolver
  already holds any recognized route when incomplete."

## No provider-authority expansion, no legacy regression

- The `incomplete` check only has effect inside the `known.length` branch
  (line 84 onward). When `identityProductIds`/`identityPriceIds` don't
  match any registered binding (`!known.length`), execution falls to the
  `wrongScope`/`legacy` path (lines 84-96), which never reads
  `input.incomplete`. Unrelated/legacy products are unaffected by this
  catch regardless of whether the PI/charge fetch failed.
- The PI-side (non-checkout) branch's own catch (line 648-651) already set
  `identityIncomplete = true` prior to this packet — this correction only
  extends the same discipline to the checkout branch's PI/charge catch,
  making the two paths consistent rather than introducing new logic.
- No new signal type, roster target, price, metadata field, or write path
  is touched. The change is a single boolean flip inside an existing
  error handler.

## Boundary not covered by this pass

`product-identity.test.ts` was not opened (outside the packet's file
list) and no test suite was executed (no Bash in this packet). The
correction's mechanism traces correctly against both call sites reviewed;
confirming the negative-test assertion still passes, and rerunning
root/focused tests, is outside this packet's tool access and must happen
in the pass that has Bash.

## Verdict

Correction is narrow, correctly targets the described gap, does not
expand provider authority, and does not change behavior for unrecognized
(legacy) products. No further material findings in the reviewed scope.
