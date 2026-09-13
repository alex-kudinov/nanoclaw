# NC-20260909-003 bounded architecture reset review

## Objective

Review the current English MCS Adyen checkout architecture against the owner's
newly clarified authority boundary. Produce a concrete keep/change/delete-or-
archive/create plan before any implementation. Identify hidden coupling and a
safe no-outage cutover. This is architecture review only.

Write the response only to:

`/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-RESPONSE.md`

Report material findings and decisions only. Do not edit source, tests,
migrations, runtime configuration, active work, or any other file.

## Owner decisions: authoritative and not open for reinterpretation

1. A dedicated WordPress plugin on the VPS, working name **Tandem Commerce**,
   owns the complete customer commerce lifecycle: checkout, authoritative
   quote, Adyen Session creation, Adyen webhook verification, payment state,
   orders, payer/learner/organization commerce records, receipts, paid invoices,
   payment links, common jobs, and per-product post-payment actions.
2. NanoClaw/Mac Mini must not create or resume Adyen Sessions and must not be
   required for checkout, payment confirmation, receipt/invoice download or
   email, product enrollment, or any other customer-facing commerce result.
3. A product can define multiple post-payment actions on the VPS. For MCS
   Foundations, one action enrolls the submitted learner directly in the exact
   Heartbeat course/group. Enrollment does not move into NanoClaw.
4. A common post-payment compatibility job sends the verified **native Adyen
   notification** plus necessary Tandem order/product/payer/learner context to
   NanoClaw Bookkeeper. The VPS does not translate Adyen into a fake Stripe
   event or a provider-neutral event.
5. NanoClaw Bookkeeper owns separate provider adapters. The existing Stripe
   adapter/webhook persists during the compatibility window. A new Adyen
   adapter interprets native Adyen event codes plus Tandem context. Both feed a
   shared operational recorder for Payment Log, Student Roster, and the
   existing operational PostgreSQL receipt. This is not accounting authority.
6. Failure or unavailability of NanoClaw/Bookkeeper must leave a retryable VPS
   job but must not change the customer's paid order, confirmation, documents,
   or enrollment.
7. Repeated payer or learner email/name values never prevent a purchase.
   Separate submitted purchases remain separate. Idempotency applies only to
   replay of the same order, provider event, or configured action.
8. Checkout remains deliberately simple: editable validated form; explicit
   Apply-code action; independent buying-for-someone-else and business-invoice
   choices; conditional Additional details page; Google address suggestion;
   full card billing address in Adyen Component for AVS; known items; tax zero;
   automatic capture; plain failure/retry language; Confirmation with working
   receipt and paid-invoice actions.
9. On submit, the VPS records the exact temporary checkout submission and calls
   Adyen. On confirmed payment it creates the durable commerce/order records and
   action jobs. On terminal nonpayment it deletes the temporary PII submission
   and permits a fresh submit. A genuinely pending/unknown provider outcome is
   retained until resolved so the UI cannot encourage an accidental second
   charge.
10. The proposed addition of three document paths to the VPS-to-Mini LiteSpeed
    proxy was cancelled and must not be implemented. The current Mini-hosted
    payment service remains running only until a VPS/WordPress replacement is
    independently verified and cut over without an outage.

## Current implemented facts to assess

- WordPress currently owns visible form, pricing/promotion/terms, browser
  context, intents, preparations, quote and private-transport orchestration.
- WordPress calls signed `/internal/payments/*` routes through
  `webhooks.tandemcoach.co`; LiteSpeed forwards selected paths over a reverse SSH
  tunnel to a dedicated NanoClaw payment service on the Mac Mini.
- NanoClaw currently owns Adyen Session creation, payment-event persistence,
  status/return, post-payment identity/order/enrollment materialization,
  Heartbeat delivery, document generation/storage/email, and significant
  payment-specific PostgreSQL schema. This authority placement is rejected.
- The old WordPress TEST adapter already demonstrates direct server-side Adyen
  Session creation from PHP, but it is not production-ready and does not supply
  the complete accepted commerce lifecycle.
- NanoClaw's current Stripe host handler receives a small Stripe notification,
  retrieves provider detail, and runs the deterministic Bookkeeper writer.
- The current architecture created a large family of NanoClaw payment source,
  migrations 149-165, release/service/tunnel configuration, and WordPress
  private-transport/coordinator code. Do not assume all of it should move or be
  retained. Classify it based on the accepted ownership boundary.

## Allowed read-only source artifacts

Read only the request plus these eight artifacts. Do not use Bash, web, MCP,
secrets, runtime databases, live logs, or unrelated repository archaeology.

1. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-adyen-test-checkout.php`
2. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-public-bootstrap.php`
3. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php`
4. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-payment-private-transport.php`
5. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/website-checkout-service.ts`
6. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/website-checkout-live-service.ts`
7. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/stripe-payment-host.ts`
8. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/CONTADOR-BIZMGR-BOUNDARY.md`

The request's current-fact summary is authoritative for other files not granted
for reading. If a conclusion cannot be supported from this packet, label it as
an implementation-audit item rather than opening more files.

## Required response

1. Start with `VERDICT: CONVERGED`, `VERDICT: MATERIAL CORRECTION REQUIRED`, or
   `VERDICT: OWNER DECISION REQUIRED`.
2. Give the corrected end-to-end flow, explicitly separating:
   - synchronous checkout/customer response;
   - authoritative Adyen webhook/payment transition;
   - common commerce jobs;
   - per-product actions;
   - non-blocking NanoClaw Bookkeeper compatibility delivery.
3. Provide a **Keep / Change or move / Delete or archive / Create** matrix. Name
   exact listed files when supported and name bounded file families/components
   for the later audit. Distinguish reusable domain logic from rejected runtime
   authority and historical evidence that must not be erased.
4. Define the minimum WordPress/VPS data model and state transitions. Avoid a
   second CRM or identity-resolution system before payment. State which
   technical unique keys are legitimate and which payer/learner uniqueness is
   forbidden.
5. Define the VPS action-runner contract: transactional creation, retries,
   exact-order/action idempotency, independent failure, and customer-visible
   behavior. Explain why provider API calls must not run inside the Adyen webhook
   acknowledgement.
6. Define the NanoClaw Bookkeeper boundary for native Adyen notification plus
   Tandem context, separate from the existing Stripe adapter. Identify the
   shared internal recorder seam and required Sheet/PostgreSQL readback. Do not
   assign accounting, enrollment, document, payment-status, or CRM authority to
   NanoClaw.
7. Give a no-outage migration/cutover sequence, including treatment of the
   already-confirmed live purchase and in-flight old attempts, credential
   relocation/rotation, historical NanoClaw payment rows, reverse tunnel/routes,
   rollback, and the exact point at which the Mini service can be disabled.
8. List tests and live proofs required before cutover. Build/deploy/HTTP success
   alone is insufficient; include a real test-mode purchase, webhook, order,
   documents, product action, NanoClaw compatibility notification, Sheet and
   roster readback, and failure/retry/non-interference cases.
9. Surface only genuinely missing owner decisions. Do not reopen the ten owner
   decisions above.

## Non-objectives and forbidden actions

- No source implementation, refactor, migration, deployment or provider action.
- No production data, credential, webhook, DNS, Cloudflare, LiteSpeed, tunnel,
  service, database, WordPress option, Heartbeat, Google Sheet, email, or payment
  mutation.
- Do not propose moving the current NanoClaw payment service unchanged onto the
  VPS; the owner rejected its architecture, not merely its host location.
- Do not make WooCommerce, an external CRM, polling from NanoClaw, or a new
  payment microservice a hidden assumption.
- Do not delete historical migrations or evidence already applied to production;
  classify retirement and archival separately from destructive schema removal.
- Do not infer settlement/accounting authority from the operational Bookkeeper
  compatibility feed.
