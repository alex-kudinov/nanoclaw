# NC-20260909-003 bounded architecture reset review — response

VERDICT: MATERIAL CORRECTION REQUIRED

The eight allowed artifacts show a working, well-hardened checkout system, but
its authority placement is exactly what the owner rejected: NanoClaw currently
creates and resumes Adyen Sessions, gates enrollment ("checkout admission"),
generates/stores/emails documents, and receives the native Adyen webhook,
all reached from WordPress through a bidirectional signed private transport.
None of that is a defect in the code itself — the validation is thorough and
the idempotency/state-machine discipline is real engineering value — but the
runtime boundary has to move. Section 3 keeps that domain logic; it changes
who runs it.

## 1. Corrected end-to-end flow

**A. Synchronous checkout/customer response (WordPress/VPS, Tandem Commerce)**
1. Checkout page (existing form, pricing/promo, browser-context ownership —
   untouched by this reset) submits to the plugin.
2. Plugin validates the form server-side, computes the authoritative quote,
   and durably records the exact temporary checkout submission before any
   provider call (decision 9).
3. Plugin calls Adyen `/sessions` directly from PHP — the pattern already
   proven test-only in `class-adyen-test-checkout.php` (idempotency-key-gated
   transient, request-fingerprint replay check, product allowlist, rate
   limit) — hardened for production: full billing address for AVS, business-
   invoice/buying-for-someone-else branches, Google address suggestion,
   conditional Additional Details page.
4. Browser renders the Adyen Web Component from the returned session; on
   redirect/component completion the plugin may read Adyen's synchronous
   result for UX only. It is never treated as payment truth.
5. Confirmation page reads the **durable order state** written by the webhook
   path (B), not the synchronous return. If the webhook hasn't landed yet, it
   shows a plain "processing" state per decision 8's "plain failure/retry
   language."

**B. Authoritative Adyen webhook/payment transition (VPS)**
1. Adyen posts the native webhook to a VPS endpoint; plugin verifies the
   Adyen HMAC.
2. The handler does only fast, durable work inside the ack window: dedupe on
   Adyen's own event identity, transition the order/attempt state, and
   enqueue jobs. **No provider API calls, no Heartbeat call, no NanoClaw
   call happens inside this handler.** Adyen retries on any non-2xx or slow
   response; a synchronous downstream call here would make payment
   durability depend on Heartbeat/Sheets/NanoClaw uptime and risks duplicate
   webhook delivery storms.
3. Terminal nonpayment → delete the temporary submission, free the
   idempotency key for a fresh attempt (decision 9).
4. Confirmed payment → materialize durable commerce/order records and enqueue
   (c) below, plus (C) and (D).

**C. Common commerce jobs (VPS action-runner)**
- Generate receipt, and paid invoice if a business invoice was chosen,
  reusing the document-identity rules already encoded in the dispatch
  coordinator (`TCA-XXXX-XXXXXX` invoice numbering, `TCA-<hex12>-R` receipt
  numbering, `<number>-receipt.pdf` / `<number>-paid-invoice.pdf` filenames).
- Deliver confirmation email with the documents attached/linked.
- Idempotent on `(orderId, documentKind)`.

**D. Per-product actions (VPS action-runner)**
- A product can register multiple actions. MCS Foundations: one action
  enrolls the learner directly in the exact Heartbeat course/group.
  Enrollment logic does not move into NanoClaw (decision 3).
- Each action is its own independently retryable row; a stuck Heartbeat call
  must not block receipt delivery or vice versa.

**E. Non-blocking NanoClaw Bookkeeper compatibility delivery**
- A separate VPS outbox job sends the verified **native** Adyen notification
  plus Tandem order/product/payer/learner context to a new NanoClaw Adyen
  adapter (sibling of `stripe-payment-host.ts`). No translation into a fake
  Stripe or provider-neutral event (decision 4).
- Failure/unavailability leaves a retryable VPS job; the paid order,
  documents, and enrollment are never touched by this outcome (decision 6).
- The NanoClaw adapter writes Payment Log + Student Roster + the operational
  Postgres receipt through the **same shared recorder** `process-payment.cjs`
  already uses for Stripe, tagged by provider. No accounting, enrollment,
  document, or payment-status authority (confirmed against
  `docs/CONTADOR-BIZMGR-BOUNDARY.md`, which already scopes Contador/Bookkeeper
  this way for Stripe).

## 2. Keep / Change-or-move / Delete-or-archive / Create

**Keep**
- `tools/contador/process-payment.cjs`, `tools/contador/mark-refunds.cjs`,
  `src/stripe-payment-host.ts`, and the durable fulfillment-case pattern
  (`beginContadorFulfillment`/`finalizeContadorFulfillment`, staged receipts,
  retryable error-code set) — the Stripe adapter persists unchanged during
  the compatibility window (decision 5) and is the reference contract for the
  new Adyen adapter.
- `docs/CONTADOR-BIZMGR-BOUNDARY.md` — its Contador/Bookkeeper boundary
  already matches decision 5's "not accounting authority" constraint; no
  change needed now, only a future addendum naming the Adyen adapter.
- The WordPress-owned pieces named in the current-fact summary but outside
  this packet (visible form, pricing/promotion/terms, browser context,
  intents/preparations) — untouched by this reset.
- The **shape** of `class-adyen-test-checkout.php`: idempotency-key-gated
  transient with request-fingerprint conflict detection, product allowlist,
  origin allowlist, per-IP rate limiting. This is the reusable seed for the
  production session-creation endpoint, not test-only scaffolding to discard.

**Change or move** (bounded families for the implementation audit)
- **Session/attempt lifecycle family** — the parts of
  `class-checkout-dispatch-coordinator.php` (`start_payment`,
  `resume_host_session`, `return_payment`, `payment_status`, `retry_payment`,
  `check_payment_submit`) that call
  `/internal/payments/{sessions,attempts,returns,status,session-retries,
  session-submit-checks}` — move the Adyen-calling logic in-process to the
  VPS. The *business rules* embedded here (quote-to-attempt binding via
  `intentId`/`quoteFingerprint`, terms-redisplay-on-mismatch, promotion
  consumption tied to one payment, dual-fence transactional freeze before any
  network call) are legitimate domain logic worth porting deliberately — not
  copy-pasted, since the HMAC round-trip they were built around disappears.
- **Enrollment/"checkout admission" family** — `admit_checkout`/
  `post_payment_admission` in the coordinator, the
  `/internal/payments/enrollment-admissions` contract, and NanoClaw's
  `PaymentCheckoutAdmissionController` / `WebsiteCheckoutEnrollmentAdapter` /
  `WebsiteCheckoutHeartbeatLiveDelivery` (referenced from
  `website-checkout-service.ts` / `website-checkout-live-service.ts`, not
  opened) — move the Heartbeat enrollment call to the VPS per-product action
  (decision 3). The enrollment-result vocabulary (`disposition`,
  `canonicalEnrollment`, `accessDelivery` states, the reason-code set) is
  sound and worth reusing on the VPS side.
- **Document family** — `document_request`/`prepare_document`/
  `download_document`/`email_document` in the coordinator, the
  `/internal/payments/documents/*` contract, and NanoClaw's
  `PaymentCheckoutDocumentApiController` / `payment-checkout-documents.ts` /
  `PgPaymentCheckoutDocumentStore` (referenced) — move generation, storage,
  and email to the VPS common commerce job. The document-identity/format
  rules are reusable verbatim (see flow section C).
- **Composition/config-validation pattern** in
  `class-checkout-public-bootstrap.php` (`exact_keys` config validation,
  fail-closed TEST/LIVE `validate_environment_binding`, cross-key collision
  check) — the pattern is reusable; the actual wiring must be rebuilt once
  session creation is local and no longer depends on
  `Tandem_Payment_Private_Transport`.

**Delete or archive**
- `class-payment-private-transport.php` in its role as a **bidirectional
  runtime authority channel** — HMAC-signed requests to NanoClaw plus
  signed-response/receipt verification for `attempt_acceptance`,
  `promotion_consumption`, `free_order_admission`, and checkout-admission
  evidence. This entire authority pattern is rejected once NanoClaw stops
  creating sessions and gating enrollment/documents. Archive, do not delete —
  its signed-envelope design (`tandem-payments-v1` HMAC, nonce+timestamp
  replay protection, response signing with a *separate* key) is legitimate
  prior art for the one-directional Bookkeeper compatibility feed's own
  signing scheme, even though its bidirectional-authority role is gone.
- `src/website-checkout-service.ts` and `src/website-checkout-live-service.ts`
  in their current role as **runtime authority** for session creation,
  status, checkout admission, and documents — delete as live routes at
  cutover. `core.recordWebhook` specifically is superseded outright: NanoClaw
  must not receive the native Adyen webhook (decision 2). Keep the files in
  git history as evidence; do not port them forward into the compatibility
  adapter.
- The reverse-SSH-tunnel / LiteSpeed `/internal/payments/*` proxy route
  family — decommission at cutover (decision 10 already forbids adding to
  it; this extends to retiring it).
- NanoClaw payment schema, migrations 149-165 (not opened, per current-fact
  summary) — do not assume wholesale deletion or wholesale retention;
  classify the **runtime-authority tables** backing session/attempt/
  enrollment/document state (`payment_attempts`,
  `payment_identity_preparations`, `payment_checkout_submission_payloads`,
  `payment_checkout_evidence`, `payment_operations`,
  `payment_session_terminal_nonpayment_receipts`, document tables referenced
  by `PgPaymentCheckoutDocumentStore`) as **freeze-in-place historical
  evidence** post-cutover, not destructive schema removal — this preserves
  the already-confirmed live purchase without pretending it needs migrating.

**Create**
- Tandem Commerce WordPress plugin: session creation, webhook receiver +
  verifier, order/commerce schema, document generator, action-runner,
  Bookkeeper compatibility outbox.
- NanoClaw Adyen Bookkeeper adapter (sibling of `stripe-payment-host.ts`):
  accepts native Adyen notification + Tandem context, writes through the
  shared recorder, provider-tagged.
- VPS-side retryable outbox for the compatibility feed (independent-failure
  contract, decision 6).

## 3. Minimum WordPress/VPS data model and state transitions

Legitimate technical unique keys:
- Adyen `pspReference` per event.
- Adyen `merchantReference` = the VPS-generated order/attempt id.
- VPS-generated `orderId`/`attemptId` (UUID), one per checkout submission.
- `(orderId, actionKey)` for per-product action idempotency.
- `(orderId, documentKind)` for document idempotency.
- Webhook dedupe key: `(pspReference, eventCode, success)`.

Forbidden as a uniqueness or pre-payment gating key: payer/learner **email or
name**. No pre-payment identity match against an existing person/org record
may block or merge a purchase (decision 7). Any person/org matching happens
downstream of a paid order, not as a checkout gate — do not stand up a second
CRM or identity-resolution system in front of payment.

Order/attempt state transitions:
`draft_submission` → (session created) `awaiting_payment` →
webhook `authorised`/`captured` → `paid` (order materializes, jobs enqueue)
**or** webhook `refused`/`cancelled`/`expired` → `terminal_nonpayment`
(submission deleted, key freed) **or** webhook ambiguous/pending →
`payment_pending` (submission retained, no fresh submit permitted) → later
resolves to `paid` or `terminal_nonpayment`.

## 4. VPS action-runner contract

- Each post-payment action is its own row:
  `(order_id, action_key, state: pending|in_progress|complete|failed,
  attempt_count, last_error, lease_token, expected_version)` — the same
  optimistic-concurrency shape already proven by
  `beginContadorFulfillment`/`finalizeContadorFulfillment` in
  `stripe-payment-host.ts`.
- Actions are created transactionally with the order the moment payment is
  confirmed (B.4), but **executed** in a separate worker pass outside the
  webhook request/response cycle.
- Why provider/API calls must not run inside the webhook ack: Adyen enforces
  a short response window and retries with backoff on any non-2xx or slow
  ack; a synchronous Heartbeat/Sheets/NanoClaw call during that window either
  times out the webhook (triggering duplicate-delivery storms) or blocks
  Adyen's delivery queue for the merchant account. Separating "durable state
  transition" (fast, local write) from "action execution" (slow, external,
  independently retryable) is what makes the system webhook-safe — it is the
  same separation `stripe-payment-host.ts` already relies on by never running
  inside Stripe's own webhook handler.
- Customer-visible behavior: while actions are in flight, the confirmation
  page shows "payment received, finishing setup"; receipt download becomes
  available as soon as its own action completes, independent of enrollment
  status.

## 5. NanoClaw Bookkeeper boundary

- New Adyen adapter, separate from the existing Stripe adapter, accepting
  `{nativeAdyenNotification, tandemOrderContext}`. It interprets native Adyen
  event codes plus the Tandem context it was handed — it does not re-derive
  context by calling back into Adyen or the VPS.
- Shared internal recorder seam: the same writer logic `process-payment.cjs`
  already runs for Stripe (Payment Log upsert by provider id, Student Roster
  upsert, Postgres `nanoclaw_business` payment-processing insert) should be
  reused with a provider tag, not duplicated.
- Required readback, mirroring `assertProcessorFulfillment`'s existing
  stage-receipt gate for Stripe: a `complete` state must show verified stage
  receipts for `payment_log`, `postgres_payment`, and `student_roster` (or an
  explicit `not_applicable` for roster on non-student products) before the
  fulfillment case is closed.
- No accounting, enrollment, document, or payment-status authority — this
  matches `docs/CONTADOR-BIZMGR-BOUNDARY.md`'s existing Contador scope for
  Stripe and must hold identically for Adyen.

## 6. Hidden coupling

- **Identity resolution is coupled to enrollment and documents, not just to
  session creation.** `website-checkout-service.ts` wires
  `identity.materializeForAttempt` into `WebsiteCheckoutEnrollmentAdapter`
  (live mode) and `identity.readPrivateBindings` into the document-authority
  reader. A narrow reading of "NanoClaw must not create Sessions" that leaves
  identity resolution on NanoClaw would silently keep NanoClaw required for
  enrollment and documents — exactly what decision 2 forbids. Identity
  resolution has to move to the VPS together with enrollment and documents,
  not stay behind as a "small" NanoClaw dependency.
- **Atomicity is currently a single `transaction_group` spanning
  preparation, quote, and attribution stores**, with an explicit re-read
  after commit (`// Never trust a COMMIT acknowledgement alone`) before
  anything is exposed as dispatch-ready. Moving pieces to the VPS must
  preserve an equivalent single-transaction-plus-verified-reread discipline
  locally, or the existing version-gating (`quote_plan_frozen`,
  `attemptAcceptanceReceipt`) silently degrades into a race.
- **`ContadorProviderAlias`/`assertContadorProviderAlias`** in
  `stripe-payment-host.ts` is the mechanism that maps multiple provider ids
  onto one fulfillment case. Whether it is already provider-agnostic or
  Stripe-shaped could not be confirmed from this packet (its definition
  lives outside the allowed artifacts) — flag as an implementation-audit
  item before assuming the Adyen adapter can reuse it unchanged.
- **Promotion consumption is bound to the enrollment call, not to payment
  authorization.** `admit_checkout` only issues a promotion-consumption
  receipt when the enrollment-admission response says one was consumed, and
  it throws if a promotion was expected but not consumed on a materialized
  enrollment. Moving enrollment to the VPS means promotion-consumption
  bookkeeping must move with it as one atomic unit — splitting "enrollment on
  VPS" from "promotion consumption still checked against NanoClaw" would
  break this invariant.

## 7. No-outage migration/cutover sequence

1. Build the Tandem Commerce plugin (session creation, webhook receiver,
   order schema, document generator, action-runner, Bookkeeper outbox) fully
   in Adyen **test** mode, VPS side, with zero production traffic routed to
   it.
2. Build the NanoClaw Adyen Bookkeeper adapter in test mode, side by side
   with the untouched Stripe adapter — no existing route removed yet.
3. Run the new path end to end in test mode against a non-production
   offer/allowlist entry (the same allowlist gating pattern
   `class-adyen-test-checkout.php` already uses): session, webhook, order,
   documents, Heartbeat test action, Bookkeeper notification, Sheet/roster
   readback — all without touching the Mini path.
4. Freeze *new* attempts on the Mini path using the existing
   `newAttemptsEnabled`/`recoverExistingEnabled` flags already present in
   `class-checkout-public-bootstrap.php` — no new mechanism required for the
   freeze step itself.
5. Treat the already-confirmed live purchase (per the current-fact summary
   and the recent "Record post-restart Adyen delivery" commit) as closed,
   historical evidence. Do not replay or migrate it into the new schema.
6. Let any in-flight old attempts resolve on the OLD path — the coordinator's
   `recover_intent`/`assert_dispatch_retry` machinery already supports
   resume-in-place; keep it alive in resume-only mode until the last old
   attempt reaches `paid` or `terminal_nonpayment`.
7. Once zero in-flight old attempts remain, cut the WordPress public
   checkout page over to the new plugin routes.
8. Relocate **and rotate** credentials: Adyen API key, client key, merchant
   account, and the private-transport HMAC key pair move out of NanoClaw's
   environment into the VPS/WordPress secret store. Rotate the Adyen
   API/webhook-HMAC keys at cutover so the retired Mini listener's copy is
   invalidated, not merely orphaned.
9. Decommission the LiteSpeed reverse-tunnel `/internal/payments/*` proxy
   routes and the private-transport key pair once traffic on them is
   confirmed at zero for a full observation window (covering Adyen's own
   retry backoff plus the old system's retry TTL).
10. Disable the Mini-hosted payment service only after (a) zero in-flight
    attempts, (b) zero proxy traffic through the observation window, and
    (c) the rollback path below has been exercised in staging and is judged
    unnecessary.
11. Rollback: keep the Mini service and its credentials warm through step 9.
    If the VPS path fails during the parallel-run window, flip the
    WordPress checkout page's route config back to the old dispatch
    coordinator — its `newAttemptsEnabled` flag and HMAC transport remain
    intact until step 9's decommission, so rollback is a config flip, not a
    rebuild.
12. The Stripe adapter and its routes are untouched throughout; only the new
    Adyen Bookkeeper adapter is added alongside it (decision 5).

## 8. Tests and live proofs required before cutover

- Contract tests: VPS session creation, webhook signature verification, all
  three order-state outcomes (paid / terminal_nonpayment / pending), action
  idempotency (replay → single effect), document idempotency (replay → same
  PDF hash, no duplicate email).
- A real Adyen **test-mode** purchase run through the actual VPS checkout
  page (not a script): session created, card authorised, webhook received
  and acknowledged, order marked paid, receipt generated and downloadable,
  confirmation email delivered.
- Product-action proof: an MCS Foundations test purchase results in an
  actual Heartbeat test-environment enrollment call succeeding (or an
  explicit held/queued state if the test environment can't be reached),
  independent of the receipt action's completion.
- NanoClaw compatibility-notification proof: a real test-mode native Adyen
  notification plus Tandem context reaches the new adapter; Payment Log,
  Student Roster, and the Postgres operational row are read back and
  matched — the same stage-receipt discipline `assertProcessorFulfillment`
  already enforces for Stripe.
- Failure/retry proof: simulate NanoClaw/Bookkeeper unavailability during the
  compatibility notification; confirm the VPS order/enrollment/documents are
  unaffected, a retryable job remains, and a later retry succeeds without
  duplicating Payment Log/roster rows.
- Non-interference proof: run two purchases with identical payer name/email
  (or one test-mode and one live-mode purchase) concurrently and confirm
  decision 7 — neither purchase blocks or merges with the other.
- Idempotent-replay proof: replay one Adyen webhook event twice (Adyen does
  this on any ambiguous ack) and confirm no duplicate order, enrollment, or
  receipt email results.
- Rollback rehearsal: exercise the config-flip rollback in staging before
  relying on it against production traffic.

## 9. Genuinely missing owner decisions

- **Transport for the compatibility feed.** Decision 4 says the VPS runs "a
  common post-payment compatibility job" to NanoClaw Bookkeeper, but does not
  say whether it goes through n8n (as the existing Stripe path does today)
  or calls a NanoClaw HTTP endpoint directly from the VPS. This changes where
  the retry/backoff and observability for that feed live.
- **Which Adyen event materializes the order.** Decision 8 specifies
  automatic capture, but Adyen still delivers `AUTHORISATION` and `CAPTURE`
  as separate webhook events. The owner should confirm whether order
  materialization/enrollment fires on authorisation success or waits for
  capture — this trades faster learner access against exposure to a later
  capture failure, and decision 8/9 do not resolve it.
- **Retention policy for the frozen NanoClaw payment schema.** The
  instructions forbid destructive removal of migrations 149-165's evidence
  but do not set a retention window or an eventual cold-storage trigger for
  the frozen tables once the observation window in the cutover plan closes.
- **Shared vs. parallel fulfillment-case schema for Adyen.** Whether the new
  Adyen Bookkeeper adapter should extend `contador-payment-fulfillment-store`
  with a provider column (a schema change to an existing table) or use a new
  adjacent table is an implementation choice that affects what "shared
  operational recorder" in decision 5 means concretely, and should be settled
  before migration authoring rather than during it.
