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
