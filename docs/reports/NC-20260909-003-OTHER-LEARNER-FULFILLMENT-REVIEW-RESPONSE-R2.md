# NC-20260909-003 fulfillment, documents, and AVS correction review — response R2

1. **R2's allowed-file scope excludes the actual call site R1 flagged, so
   Required Question 2 cannot be answered from this review.**

   R1's finding was against
   `src/website-checkout-heartbeat-live-delivery.ts:119-140` (`find()`'s
   unconditional `catch` around the exact-email Heartbeat lookup). R2's
   "Allowed review files" (request R2, lines 31-36) list the toolbox wrapper
   (`find-user.sh`, `test-find-user.sh`) and the unrelated document/Adyen
   files, but not `website-checkout-heartbeat-live-delivery.ts` or its test
   (`website-checkout-live-service.test.ts`) — the files that actually contain
   the duplicate-create defect.

   The wrapper fix itself is sound within scope:
   `find-user.sh:65-80` narrows the fallback to a confirmed
   `HEARTBEAT_HTTP_CODE == "404"` (line 69), and for any other failure
   (auth/5xx/timeout) it `cat`s the response body and exits 1 (lines 72-74),
   preserving a structured error and nonzero exit instead of silently
   returning empty. The `mktemp` response file is removed via the
   `trap 'rm -f "$response_file"' EXIT` set at line 67 regardless of outcome —
   no leaked temp data. `test-find-user.sh:45-56` exercises all three
   response shapes the mock `curl` returns (missing→404, existing→200,
   outage→503) and asserts empty/found/failure respectively, matching the
   request's "Verification" claims.

   But whether NanoClaw's caller now actually distinguishes "confirmed 404"
   from "the toolbox call failed for an unrelated reason" — the exact defect
   R1 identified — is not verifiable from the six files in scope. The
   request's "Accepted facts" assert the correction was made at the call
   site, but an assertion in the request packet is not evidence produced by
   this review.

   **Smallest safe fix:** no change needed to the six reviewed files; before
   treating Required Question 2 as closed, run a follow-up review scoped to
   `src/website-checkout-heartbeat-live-delivery.ts` and
   `src/website-checkout-live-service.test.ts` to confirm the `catch` there
   now keys off the toolbox wrapper's exit code/structured error rather than
   catching unconditionally, and that a non-404 lookup failure propagates
   instead of falling through to `heartbeat/create-user`.

No other material findings.

- **Q1** (confirmed): `find-user.sh` maps only a confirmed HTTP 404 to
  `{ok:true,data:[]}`; every other failure propagates the underlying
  structured error and nonzero exit; the temp response file is always
  cleaned up via the `EXIT` trap.
- **Q3** (confirmed): `payment-checkout-documents.ts:764-833`
  (`PgPaymentCheckoutDocumentAuthorityReader.read`) joins
  `business_v2.payment_identity_materializations` (`m.payer_party_id` /
  `m.participant_party_id`, lines 789-794) for payer/participant identity and
  never reads the null `payment_identity_preparations` party columns.
  Pre-existing authorization (`caller`, `scope_sha256`), payment-state
  (`authorization_recorded`, exactly one authorized payment, matching
  `payment_reference`), active-enrollment, and retry-exception checks (lines
  813-833) are unchanged. `payment-checkout-documents.test.ts:400-410`
  regression-tests this: it asserts the new join is present, the old
  `pp.id=ip.payer_party_id` join is absent, and a mutated
  `retry_exception=true` fixture still rejects with
  `checkout_document_authority_conflict`.
- **Q4** (confirmed): `protected-preview-core.js:924-934` configures the
  Adyen Card component with `billingAddressRequired: true,
  billingAddressMode: 'full'`, Adyen's documented mechanism for collecting
  and submitting full AVS billing-address data with the card payment method
  in a Sessions payment. This is wired to its own DOM subtree
  (`#billing-address-autocomplete` etc., lines 137-139, 241-254) and is
  distinct from the optional company invoice address (`companyLegalName`,
  `invoiceEmail`, `taxId`, lines 230-254), which is collected and sent
  separately via `/identity/prepare`'s `billingProfile` field
  (lines 1121-1132) and never enters the Card component config.
- **Q5**: the heartbeat-wrapper 404-vs-other-failure behavior and the
  document-authority materialization-join behavior are each directly
  regression-tested as described above, within the scope this review could
  reach (see finding 1 for the one gap that scope leaves open).
