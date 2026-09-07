# Bounded independent review: product identity bridge

Review with Sonnet/high. Read only this packet, `NC-20260907-001-REVIEW-DIFF.txt`
in this directory, `../STUDENT-PRODUCT-IDENTITY.md`, and (if necessary) the
changed `../../tools/contador/process-payment.cjs`. Write ONLY
`NC-20260907-001-CLAUDE-RESPONSE-R1.md` here, then stop. No Bash, MCP, network,
credentials, environment, other sources, or operational/customer records.
Report material findings only with exact references and reproductions, or
NO MATERIAL FINDINGS. Target at most eight tool calls. Do not restate the design.

Owner authorizes exact supervision payment repair and durable product identity
management. Repair already completed through the existing live host: case 63
complete, CSS row verified, Sales cleared and one accounting payment retained.
Review is for the bounded implementation, not the repair's private records.

Accepted scope: initial migrated population is supervision inaugural and
regular only. Existing entitlement catalog remains the offer/bundle master;
new bindings reference its provider IDs rather than duplicate price/offer
facts. Other active products retain their legacy paths and are explicit audit
gaps. Broad migration, new enrollment writer, access provisioning, capacity and
financial interpretation remain outside this release. Do not demand those as
findings or infer that a valid identity implies fully paid tuition or a class.

Catalog facts verified independently through live Stripe product reads:
- `supervision-inaugural`, bundle `coaching-supervision-mastery:v1`, product
  `prod_UvqkpUONPWr8Bo`, price `price_1Tvz3MA7hTBWpVVqhF708kPv`.
- `supervision-regular`, same bundle, product `prod_UvqkMSjRqR4zho`, price
  `price_1Tvz3MA7hTBWpVVq9gL3v49F`.
- Both native products are installment variants; full-payment website PIs
  contain a stable metadata.product slug and may have no native product/price.
- All are on the Tandem Stripe account. The existing host authenticates the
  source then fetches the PI/invoice/product through Stripe; this does not
  accept browser proof. Original payment/accounting provider fields stay intact.
- CSS destination and exact column verified; legacy matching uses case-folded
  product labels. A conflicting live label mapping now holds migrated writes.

Acceptance: changed names/absent map rows resolve exact known identities;
unknown/mixed companion identifiers, account mismatch, partial invoice evidence
and conflicting projections hold roster writes in a durable needs_review case;
accounting continues and neither class nor financial terms are inferred.
Read-only audit enumerates uncovered active offers, price-binding drift and
catalog/checkout-key differences; strict mode refuses incomplete coverage.
Immutable release must include helper, binding file and referenced catalog.

Validation: 85 focused tests pass (10 new); typecheck and entitlement validator
pass. Full suite: 3,630 passed / 32 skipped / two existing CNPC wrapper and
date-stale Trafft failures; source unchanged for those failures. Review semantic
correctness, boundary regressions and omitted error paths, not formatting.
