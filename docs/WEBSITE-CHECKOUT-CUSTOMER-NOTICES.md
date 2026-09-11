# Website checkout customer notices

Status: local source-only production-readiness capacity under `NC-20260909-003`.
No production migration, Gmail send, configuration, listener wiring or activation
is implied.

## Ownership boundary

`src/website-checkout-customer-notices.ts` is the concrete owner for the LIVE
website checkout service's `WebsiteCheckoutReceiptWelcomeOwner` interface. It
does not treat the enrollment `accepted_pending_receipt` obligation as an email
receipt, and it does not reuse the Plutio-specific outbox, the four-target
student projection outbox, or the operator-approved SQLite Mailman ledger.

Migration 158 adds two admin-only PostgreSQL tables:

- `website_checkout_customer_notice_jobs` holds immutable attempt, notice kind,
  canonical party, content, sender and deterministic message identity. Customer
  email addresses and bodies are re-read/rebuilt and retained only in memory;
  the ledger stores their SHA-256 bindings.
- `website_checkout_customer_notice_receipts` appends queue, claim, Gmail ACK,
  readback and hold evidence. Confirmed jobs cannot change. Populated rollback
  refuses. Migration 158 is ordered after the separately owned webhook card
  method evidence migration 157.

Both tables remain owned by `nanoclaw_admin`, grant no agent role and are not
polled by the daemon unless the managed LIVE service is separately configured.

## Admission and notice policy

The owner accepts only the stable service idempotency key
`website_checkout_receipt_welcome:<attempt UUID>`. Before each possible send it
re-reads and agrees all of these canonical facts:

- exact LIVE Adyen scope and caller `tandem-wordpress-live`;
- exact English `mcq-program-a-foundations:en-US` attempt and immutable $299 USD
  base price, with the actual accepted final amount (including an admitted
  promotion) matching the active financial obligation;
- canonical card method evidence and payment-readiness eligibility under the
  accepted immediate-capture evidence;
- one materialized order/seat/active enrollment and unmerged payer/participant
  Party identities with primary email addresses;
- exact self or separate-payer relationship;
- current-version verified Heartbeat membership before an access confirmation.

Self purchase emits one combined card-payment/enrollment/access confirmation
only after Heartbeat membership is verified. A separate payer receives one
payment receipt after the canonical enrollment is eligible; the learner's
access notice waits for verified membership. The learner notice does not issue
credentials and explicitly leaves a first-login invitation to Heartbeat, so it
does not duplicate the provider's native new-user invitation.

Copy states only that the card payment was accepted and that verified access is
present. It makes no settlement, certificate-eligibility, completion or
marketing claim.

## Gmail and replay safety

The production factory pins the configured Gmail profile account and the exact
canonical `GMAIL_SEND_AS` identity. It uses `gmail-api.ts` `sendEmail`, including
the existing C3 external-write checks, and adds its own pre-claim
`assertExternalWriteAllowed` call. Tests inject both network and clock/UUID
doubles and never call Gmail.

Every notice has a stable attempt/kind/version key and a deterministic visible
notice reference. Before a new claim, the adapter searches Gmail Sent for the
exact recipient and deterministic subject. One exact metadata match is adopted;
multiple or mismatched results hold. After `sendEmail` returns, the Gmail
message/thread identifiers are durably acknowledged and then re-read with exact
To, From and Subject checks before confirmation.

A send exception or expired claim is treated as possible acceptance. The job
enters `held` with `uncertain_acceptance=true`; ordinary claim excludes it and
never sends again. A later reconciliation may move that hold to confirmed only
after one exact Gmail Sent match and metadata readback. A known Gmail ACK with a
temporarily unavailable readback remains acknowledged for read-only retry; it
does not resend.

## Configuration and activation

`createGmailWebsiteCheckoutReceiptWelcomeOwner(config, deps)` requires:

- the exact caller, offer/locale, product name and HTTPS course URL;
- the same LIVE payment scope and card-capture evidence as the checkout service;
- pinned Gmail account/send-as values;
- an accepted decision reference and activation-receipt SHA-256;
- the managed service's guarded PostgreSQL transaction dependency.

The returned object is passed as `receiptWelcomeOwner` to the existing managed
LIVE service. `receiptWelcome.enabled` remains false until migration 158 is
separately approved/applied and the exact configuration, account, sender,
course URL, receipt hash and service release are read back. Activation and the
first real customer email require separate authority and Gmail-confirmed
evidence. Rollback disables new notice creation but preserves readback and
reconciliation for any acknowledged or uncertain job.

`receiptReference` is non-null only when the complete required notice set is
verified. Partial gift-payer delivery remains explicit in the durable job and
receipt ledger while the aggregate result stays `queued` or `held` with a null
reference, so callers cannot mistake one sent email for complete delivery.
