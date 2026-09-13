# NC-20260909-003 MCS Level 3 provider proof

Date: 2026-09-12

## Contract

- US, USD, English MCS Foundations card payment only.
- One server-owned item: `MCSFOUND`, `MCS Foundations`, quantity 1, unit `EA`,
  UNSPSC `86132000`.
- `unitPrice` is the immutable original quote amount, `discountAmount` is the
  accepted discount, and `totalAmount` is their exact difference.
- Total and item tax are always zero. Shipping/destination fields are omitted
  because the course is digitally delivered.
- No payer name, email, billing address, tax ID or browser-entered amount is
  included in provider metadata.

## Provider results

1. Checkout v72 `/sessions` accepted the flattened Level 3 request with HTTP
   201, but the official Visa Level 3 TEST card then returned failed from the
   browser payment call.
2. Direct v72 `/payments` returned HTTP 422, code 209: Level 2/3 must use the
   new structured `enhancedSchemeData` field.
3. v72 `/sessions` with that structured field returned HTTP 400, code 702:
   `enhancedSchemeData` is unknown on `CreateCheckoutSessionRequest`.
4. Direct v69 `/payments` with the exact flattened request and official Visa
   TEST card returned HTTP 200 `Authorised`.
5. v69 `/sessions` returned HTTP 201, and the full Adyen Web 6.3 secured-fields
   flow with the same official Visa TEST card returned `Authorised`.
6. The unused-Session proof reopened its disposable database, reused the exact
   encrypted Session with one provider call, and removed the generated database.

No LIVE payment, enrollment, email or customer record was created by these
proofs. Adyen's optional ESD validation-result webhook setting is not proven
enabled, so this evidence proves provider payment acceptance but does not claim
an `enhancedSchemeDataSubmitted=L3` webhook receipt.

## Automated verification

- TypeScript typecheck: pass.
- Focused adapter/runtime/webhook/evidence/disposable database tests: 123/123.
- Required field validation covers API version, product/commodity codes,
  description and unit bounds.
- Arithmetic coverage includes full-price and discounted zero-tax cases.
- Endpoint coverage proves exact MCS L3 v69 and ordinary v72 separation.

## Release and LIVE no-card verification

- Reviewed commit `94eafe1e004323a97d3f15b801acf9efdbaec13a` built immutable
  artifact SHA-256
  `2882c52e4af75325b383928c8559e1078bdafaf2a7373ea3876bbeb9a8d1a126`
  across 1,308 files and archive SHA-256
  `f5364f0b94d48bf747c7e7a20228c363bbfb5540f0bef450219ae8e856b92f8a`.
  Release gates passed 805/805 host and 45/45 runner tests.
- Mini activated the exact commit/root/executable pointers and reports healthy
  and ready without a migration or configuration rewrite.
- One isolated LIVE no-card attempt reached the $299 Adyen card form, proving
  LIVE Session acceptance. No card data was entered. Database guards found zero
  payment events and zero admissions; the exact synthetic encrypted submission
  was deleted and verified absent. No payment, enrollment, document or email
  was created.
