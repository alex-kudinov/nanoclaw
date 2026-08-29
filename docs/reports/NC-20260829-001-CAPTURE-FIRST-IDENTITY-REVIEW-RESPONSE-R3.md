# NC-20260829-001 capture-first dual identity — bounded review R3 response

Reviewed only the allowed paths listed in the R3 request. No material blocking
defect found. One residual concurrency question is outside this round's
allowed-path visibility and is called out below rather than asserted as a bug.

## Findings by review question

1. **No payment/free object without both identities.** Confirmed. In
   `handle_capture`, `establish_checkout_customer_identity()` runs and must
   return `ok:true` before `set_transient()` stores the session at all — a
   failed handshake leaves no session behind
   (`class-stripe-checkout.php:757-773`). In `handle_intent`, the same
   handshake gates all three outcomes: installment subscription
   (`:1188-1196`), `$0`-after-coupon free enrollment (`:1214-1224`), and the
   paid PaymentIntent (`:1214-1334`) — the identity call sits before the
   `price === 0` branch, so free enrollment is gated exactly like paid.
   `create_subscription_intent` independently fails closed if
   `stripe_customer_bound` or the `cus_` shape is missing (`:1459-1464`), so a
   caller cannot skip `establish_checkout_customer_identity` and reach
   Stripe directly.

2. **Replay, ambiguity, multi-candidate, concurrency, Search lag, bind
   timeout.** Mostly closed. Token replay is serialized by
   `pg_advisory_xact_lock` on `checkoutTokenSha256`, and a replayed token with
   a different email is rejected (`checkout_token_identity_conflict`, 409).
   Two email-matched Parties return `checkout_party_ambiguous` (409) with no
   deterministic fallback, matching the "no `best_party_by_email`" rule.
   Stripe Customer Search races are absorbed by the Party-scoped idempotency
   key (`tccustparty_v1_<sha256(party_id)>`), confirmed by the PHP test
   asserting two different session tokens for one Party share one key
   (`test-stripe-customer-identity.php:141-152`) — so concurrent
   sessions *for an already-resolved Party* cannot create two Customers.
   **Open question, not verifiable in this round's scope:** `resolve` locks
   only on `checkoutTokenSha256`, not on email. Two different checkout tokens
   (e.g., two tabs) submitting the same email concurrently could both observe
   zero `strictPartyCandidates` rows and both call `fn_create_party`,
   producing two canonical Parties for one email before either commits.
   `fn_create_party` and the `parties` table constraints that would prevent
   this are not in this round's allowed paths, so I can't confirm whether a
   DB-level safeguard exists. If it does not, the failure mode is bounded, not
   silent: a later merge of the two Parties would surface as
   `checkout_party_stripe_customer_ambiguous` (409) via the two-active-refs
   check in `exactStripeCustomerForParty`, rather than silently attaching the
   wrong Customer. Worth a dedicated pass against the `business_v2.parties`
   schema/`fn_create_party` if not already covered.

3. **No premature Customer mutation or role claim.** Confirmed.
   `select_checkout_customer_candidate` never mutates a blank/conflicting/
   truncated candidate (`needs_name_update` is computed but unused; only an
   exact single name match is reused) — covered by
   `test-stripe-customer-identity.php:78-96`. `bindCheckoutCustomerIdentityWithClient`
   takes a `FOR UPDATE` row lock on the external ref and rejects with
   `stripe_customer_party_conflict` (409) before any write if the ref is
   already owned by a different Party (`checkout-customer-identity.ts:465-481`),
   exercised by the "refuses a Stripe Customer already owned by another
   Party" test. A net-new Party only ever receives `prospect`
   (`fn_add_party_role`), never a paid/client role.

4. **Binding token and archive isolation.** Confirmed. The token is HMAC-signed
   (`checkout-binding:` domain-separated), `timingSafeEqual`-verified, carries
   only `party_id`/`interaction_id`/both sha256 fingerprints/`exp`, and is
   TTL-bound to 15 minutes (`checkout-customer-identity.ts:196-256`).
   WordPress never inspects or forwards it anywhere except back through the
   same signed relay call — it's opaque outside NanoClaw, which is the only
   holder of `identitySecret`. In `webhook-server.ts`, both
   `checkout.identity.resolve` and `checkout.identity.bind` branches `return`
   before reaching `archiveWebhook`/`prepareWebsiteCheckoutRecoveryEnvelope`
   (`:1010-1082` vs. `:1083+`), and the only log call on failure
   (`logger.error({ err, requestKind }, ...)`) never includes the raw payload
   or email — consistent with "generic webhook archive never stores identity-
   handshake raw email/name."

5. **External-ref insert/update/conflict semantics.** Confirmed correct.
   Advisory lock on `stripeCustomerId` serializes bind attempts for that
   Customer; ownership by another Party is checked before any write;
   duplicate binds for the same Party update (`status`, `verified_at`,
   `last_seen_at`, `source_receipt_sha256`) rather than re-insert, verified by
   the "binds and replays" test asserting exactly one `INSERT` across two
   calls.

6. **n8n allowlist.** Within scope (`checkout-recovery-website-verify.js`
   only): the identity branch adds a strict per-`request_kind` field
   allowlist before re-signing with the *relay* secret (distinct from the
   *ingress* secret, explicitly checked `!== ingressSecret`), preserves the
   32KB body cap, and keeps the existing timestamp/HMAC verification shared
   with the lifecycle event path — no retention added. I did not read the
   workflow JSON (not in the allowed list for this round) so I can't confirm
   node topology/credential wiring beyond the verified fact already stated in
   the request (credential hash unchanged).

7. **Ordering across cached sessions / coupons / installments / full
   payment.** Confirmed correct and consistent: coupon-only-with-full-payment
   is rejected before any identity or subscription work
   (`:1172-1178`); installments re-run the identity handshake even for a
   session captured pre-deployment (comment at `:1212-1213` and the shared
   `establish_checkout_customer_identity($session, $token)` call site,
   asserted exactly 3 times in source by the PHP test); the `$0`-after-coupon
   branch is downstream of the same gate, so a free coupon cannot bypass
   Party/Customer establishment.

8. **TypeScript/PHP/Stripe/runtime/test gaps.** None found in the allowed
   files beyond the concurrency-visibility gap in item 2. `$session` is
   correctly passed by reference into `establish_checkout_customer_identity`
   and `ensure_stripe_customer` (`array &$session`), so mutations do persist
   into the transient written by `handle_capture` — this was worth checking
   explicitly since a missed reference would have silently dropped
   `party_id`/`stripe_customer_id`/`stripe_customer_bound` from the stored
   session.

## Net assessment

The mechanics match the design doc and the owner's required order. The one
open item — cross-token, same-email concurrent Party creation — is a
visibility gap in this round's allowed paths (not in scope: `fn_create_party`,
`business_v2.parties` constraints), not a confirmed defect, and its worst
observed downstream effect under the existing code is a fail-closed 409, not
a wrong or silent association.
