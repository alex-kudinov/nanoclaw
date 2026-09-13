# NC-20260909-003 architecture reset — bounded correction review R2

## Objective

Correct only the load-bearing defects Codex independently found in R1. Do not
reopen the owner's authority decisions or restate the entire architecture.
Write only:

`/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-RESPONSE-R2.md`

Start with `VERDICT: CONVERGED` or `VERDICT: MATERIAL CORRECTION REQUIRED`.

## Allowed reads

1. Original request:
   `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-REQUEST.md`
2. R1 response:
   `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-RESPONSE.md`
3. WordPress TEST adapter:
   `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-adyen-test-checkout.php`
4. Current Stripe-shaped case schema:
   `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/133_contador_payment_fulfillment_cases.sql`
5. Current Stripe processor:
   `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/tools/contador/process-payment.cjs`

No Bash, web, MCP, secrets, other files, or implementation edits.

## Corrections R2 must adjudicate

### 1. Current WordPress state machine is not automatically kept

R1 says the current WordPress browser context, intents and preparations are
"untouched by this reset." That conflicts with owner decision 9 and the prior
owner-directed simplification: before confirmed payment the target has the
editable browser form plus **one temporary submitted record**, not a parallel
intent/preparation/quote/capability/receipt state machine. Pricing, promotions,
terms, form validation, attribution facts and UI are reusable; the current
multi-table/multi-capability orchestration is subject to removal or collapse.

State the minimum necessary pre-payment record and explicitly put the current
intent/preparation/private-capability machinery in the implementation-audit /
retirement category unless a field is proven necessary.

### 2. WordPress transients are not the production persistence model

`class-adyen-test-checkout.php` uses a 30-minute transient. Retain its useful
validation, product allowlist, Adyen payload-building, origin/rate-limit and
same-request replay ideas, but not transient storage as the authoritative
production submission/order/payment record. The new plugin needs durable
MariaDB tables and database transactions.

### 3. A terminal retry gets a new attempt/idempotency key

R1 says terminal nonpayment deletes the submission and "frees the idempotency
key." Do not reuse a provider idempotency key. A deliberate fresh submit creates
a new submission/attempt UUID and new Adyen idempotency key. The old terminal
attempt retains only the minimum non-PII provider/tombstone evidence required to
recognize a late event; payer/learner uniqueness remains forbidden.

### 4. Existing paid purchase must not be stranded

R1 says the already-confirmed LIVE purchase should remain only as closed
historical evidence and not be migrated. Its receipt/invoice actions are the
active customer incident. The cutover must import or project the exact verified
paid order/document facts into Tandem Commerce without a new payment or new
enrollment, or retain a bounded old-document compatibility route until those
documents work. Recommend the simpler safe option and state verification.

### 5. Current Bookkeeper implementation is Stripe-shaped

Migration 133 hard-codes `stripe_account`, `payment_intent_id`, Stripe event
names, Stripe alias prefixes, and a `stripe_source` stage. The current
`process-payment.cjs` fetches Stripe and combines provider acquisition with
Sheet/PostgreSQL writes. R1's claim that the Adyen adapter can simply write
through that existing provider-tagged recorder is not currently true.

Recommend the least-risk compatibility design. Preferred direction unless the
allowed evidence disproves it:

- preserve the proven Stripe ingress/case path unchanged during compatibility;
- create an Adyen input adapter that accepts the native verified Adyen
  notification plus Tandem order context;
- extract or create a provider-neutral **operational recorder seam** for the
  common Payment Log/Student Roster/payment-receipt writes;
- use an adjacent Adyen delivery/case record, or an explicit later v2 migration,
  instead of mutating migration 133's live Stripe identity in place during the
  first cutover.

This can share recorder behavior without pretending the existing case schema or
Stripe fetch script is provider-neutral.

### 6. Adyen verification and compatibility signing

Tandem Commerce on the VPS alone verifies the Adyen webhook HMAC and owns
payment truth. Its common job sends the native notification unchanged plus
Tandem order context inside a new, separately HMAC-signed delivery envelope.
NanoClaw verifies the Tandem Commerce delivery signature and adapts the native
notification for operational recording; it does not need the Adyen webhook HMAC
secret and does not re-adjudicate whether checkout is paid.

### 7. Credential cutover precision

The Adyen API key and webhook HMAC are secrets and must exist only on the VPS
after cutover; rotate them after the old path drains. The client key and merchant
account identifier are not secrets and need not be "rotated." Retire and revoke
the old bidirectional WordPress↔Mini transport keys. Create a distinct narrow
Tandem Commerce→NanoClaw Bookkeeper delivery key.

### 8. Owner decisions already resolve three R1 questions

- Compatibility delivery: a common VPS product-action job **pushes** a signed
  delivery to NanoClaw Bookkeeper. Exact existing ingress reuse vs one new
  narrow endpoint is an implementation audit, not an owner architecture choice.
- Paid trigger: for this merchant's explicitly approved automatic-capture card
  flow, successful `AUTHORISATION` is the customer/order paid trigger; later
  `CAPTURE_FAILED`, reversal, cancellation or refund events update state and
  create their appropriate operational actions/exceptions.
- Frozen NanoClaw checkout records follow the already-approved seven-year
  commerce/document retention unless a stricter legal hold applies; code/routes
  become inactive and records remain read-only. No destructive migration
  rollback is proposed.

R1's remaining shared-vs-parallel case-schema question should be resolved as an
implementation recommendation from item 5, not returned to the owner unless a
business decision truly remains.

## Required R2 response

1. Corrected keep/change/delete-or-archive/create deltas relative to R1.
2. Corrected minimum state model and terminal retry rule.
3. Corrected Bookkeeper adapter/recorder/case boundary.
4. Corrected treatment of the existing paid purchase and credentials.
5. List any genuinely unresolved owner decision; `none` is acceptable.
