# Tandem Commerce implementation review request

## Objective

Review the implemented checkout replacement for material correctness and safety defects before deployment. Report only defects that could cause a payment to be lost, duplicated, falsely confirmed, associated with the wrong order, leave the customer stuck, fail documents/enrollment, leak protected data, corrupt the Bookkeeper projections, or make the release impossible.

Do not redesign the accepted architecture, propose a speculative backlog, modify source files, run commands, inspect credentials, or review unrelated NanoClaw/tandemweb code. Write findings only to:

`/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-IMPLEMENTATION-CLAUDE-RESPONSE.md`

## Accepted architecture

The accepted architecture and second-round resolution are in:

- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-REQUEST-R2.md`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/docs/reports/NC-20260909-003-COMMERCE-ARCHITECTURE-RESET-CLAUDE-RESPONSE-R2.md`

Do not reopen those decisions. WordPress/VPS is authoritative for checkout, Adyen Session creation, webhook verification, orders, documents, and Heartbeat enrollment. NanoClaw only receives a retried compatibility delivery and updates existing operational views. Repeat buyers and duplicate learner enrollments are allowed; idempotency applies only to the same submission/provider event/action.

## Review surface

WordPress implementation:

- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/includes/class-tandem-commerce-store.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/includes/class-tandem-commerce-controller.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/includes/class-tandem-commerce-adyen.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/includes/class-tandem-commerce-actions.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/includes/class-tandem-commerce-documents.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/src/commerce-checkout-core.js`

NanoClaw compatibility implementation:

- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/commerce-bookkeeper.ts`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/tools/contador/process-commerce-payment.cjs`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/webhook-server.ts` only the `commerceBookkeeper` additions
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/data/business/migrations/nanoclaw-v2/166_contador_adyen_payments.sql`

Supporting tests may be read only as needed:

- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-commerce/tests/test-commerce-core.php`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/commerce-checkout.test.mjs`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/commerce-bookkeeper.test.ts`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/webhook-server.test.ts` only the commerce delivery test

## Invariants to check

1. One validated submit creates one temporary submission and one Adyen Session. No payer/learner uniqueness gate exists.
2. Only an HMAC-valid matching merchant/reference/amount/currency AUTHORISATION success creates a paid order. Browser callbacks cannot confirm payment.
3. Abandoning before card submission restores editing; terminal nonpayment permits a clean new submission; a late authentic payment cannot be silently lost.
4. Card collection requires full Adyen billing address for AVS. Automatic capture and exact zero-tax L3 arithmetic are coherent.
5. Customer-facing validation points to the form; no internal draft/intent/reconciliation language appears.
6. Confirmation reaches the confirmation step and receipt/invoice download/email are order-bound and cannot be used before payment.
7. Heartbeat enrollment is a WordPress job and accurately distinguishes invited from verified access.
8. WordPress compatibility delivery is signed, retried, and non-blocking for checkout. NanoClaw preserves the native Adyen notification, validates matching order facts, and acknowledges only after exact Sheet/Postgres readback.
9. Payment Log/Studenter projection is idempotent by Adyen PSP reference and never executes input as shell or SQL.
10. New migration is adjacent to, and does not mutate, existing Stripe fulfillment tables.

## Completed checks

- Browser/checkout POC suite: 98/98.
- New Tandem Commerce PHP core checks: all 19 assertions pass; every PHP file lints.
- NanoClaw focused TypeScript checks: typecheck passes; commerce + webhook-server tests 62/62.
- Full NanoClaw run was invalid because it was invoked under Node 26 instead of the required pinned Node 22; the pinned full run will be performed after review.

## Response format

Write a concise report with material findings ordered by severity. Each finding must identify an exact file and evidence. If there are no material findings, say so explicitly. Do not include cosmetic suggestions.
