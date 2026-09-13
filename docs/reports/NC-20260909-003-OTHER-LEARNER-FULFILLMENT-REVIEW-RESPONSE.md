# NC-20260909-003 other-learner fulfillment and documents review — response

1. **Unconditional catch on the exact-email Heartbeat lookup can convert a
   transient/non-404 failure into an unsafe duplicate-account create, not
   just the expected new-learner 404 case.**

   `src/website-checkout-heartbeat-live-delivery.ts:119-140` (`find()`):

   ```
   try {
     value = await this.toolbox.run('heartbeat/find-user', ['--email', ...]);
   } catch {
     // Heartbeat's exact-email endpoint returns HTTP 404 for a normal new
     // learner. ...
     value = await this.toolbox.run('heartbeat/find-user', ['--name', ...]);
   }
   ```

   The `catch` has no predicate — it treats the documented 404-for-new-learner
   case identically to any other failure of the exact-email lookup (auth
   failure, timeout, 5xx, rate limit). On any such failure it falls through to
   the bounded 1,000-row name-scan fallback. If the true existing account does
   not appear in that bounded, name-keyed fallback (name mismatch, ordering,
   or simply not within the first 1,000 rows), `find()` returns `null` and
   `apply()` (`website-checkout-heartbeat-live-delivery.ts:186-213`) proceeds
   to `heartbeat/create-user`, creating a second Heartbeat account for an
   email that already exists. This is a real duplicate-creation path, not
   merely a theoretical one, because the code cannot currently distinguish
   "confirmed 404" from "lookup failed for an unrelated reason."

   This is exactly the scenario Required Question 2 asks to evaluate, and the
   test suite does not cover it: the one test that exercises this catch
   (`src/website-checkout-live-service.test.ts:277-329`, "treats exact-email
   404 as a missing new learner...") throws a generic
   `Error('heartbeat_toolbox_failed')` for the email lookup, which is
   indistinguishable at the code level from a genuine outage. No test asserts
   that a non-404 failure is held/retried rather than treated as
   "not found → create."

   **Smallest safe correction:** narrow the `catch` to only take the fallback
   path when the caught error can be confirmed to represent the toolbox's
   documented not-found signal (e.g. inspect an exit code or structured error
   field the `heartbeat/find-user` wrapper attaches for HTTP 404, per the
   "registered toolbox wrapper exits nonzero" fact in the request packet).
   Any other error should propagate out of `find()` so `deliver()`'s existing
   held/retry path handles it, instead of silently routing into the
   create-user branch. Add a corresponding test asserting a non-404 error
   from the email lookup does not result in a `heartbeat/create-user` call.

No other material correctness, duplicate-creation, authorization, privacy,
document-integrity, or regression findings in the reviewed diff. The document
authority SQL (`src/payment-checkout-documents.ts:764-833`, `PgPaymentCheckoutDocumentAuthorityReader.read`)
correctly binds payer/participant identity to
`business_v2.payment_identity_materializations` rather than the null
pre-payment `payment_identity_preparations` columns, and this is directly
regression-tested (`src/payment-checkout-documents.test.ts:400-406`: asserts
the join is present and the old `pp.id=ip.payer_party_id` join is absent).
Existing authorization (`caller`, `scope_sha256`), payment-state
(`authorization_recorded`, single authorized payment, matching
`payment_reference`), active-enrollment, and retry-exception checks in that
query are all unchanged and still enforced.
