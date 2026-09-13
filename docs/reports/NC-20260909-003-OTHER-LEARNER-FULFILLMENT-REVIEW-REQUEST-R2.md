# NC-20260909-003 fulfillment, documents, and AVS correction review R2

## Objective

Review the load-bearing correction to the R1 duplicate-account finding, the
paid-materialization document fix, and the new full Adyen billing-address form
required for Visa AVS/ESD qualification. Report material findings only.

## Accepted facts and authority

- R1 correctly found that catching every exact-email lookup failure was unsafe.
  That fallback has been removed from NanoClaw.
- The Heartbeat CLI's exact `/find/users` endpoint returns404 when an email does
  not exist. The corrected wrapper invokes the shared API helper without command
  substitution so it can inspect `HEARTBEAT_HTTP_CODE` in the same shell. It
  converts only confirmed404 to `{ok:true,data:[]}`; other failures preserve a
  nonzero exit and structured error.
- `payment_identity_preparations` Party IDs are intentionally null before
  payment; immutable paid IDs live in `payment_identity_materializations`.
- Adyen's current ESD requirements say every Visa transaction needs AVS data to
  qualify for interchange discounts. Its Web v6 Card Component sends a full
  billing address when `billingAddressRequired:true` and
  `billingAddressMode:'full'`.
- The card billing address is deliberately collected on Payment and remains
  separate from the optional company invoice address.
- No payment, provider write, document email, or customer communication is part
  of this review.

## Allowed review files

- `/Users/xbohdpukc/dev/toolbox/shared/heartbeat/tools/heartbeat/find-user.sh`
- `/Users/xbohdpukc/dev/toolbox/shared/heartbeat/tests/test-find-user.sh`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/payment-checkout-documents.ts`
- `/Users/xbohdpukc/dev/NanoClaw/.worktrees/adyen-webhook-live-20260909/src/payment-checkout-documents.test.ts`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/src/protected-preview-core.js`
- `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/protected-preview.test.mjs`
- this request and the R1 response.

Write only:

- `docs/reports/NC-20260909-003-OTHER-LEARNER-FULFILLMENT-REVIEW-RESPONSE-R2.md`

Do not inspect credentials, private configs, logs, database rows, customer data,
browser state, `.env`, auth stores, unrelated files, or MCP tools. Do not edit
implementation or tests.

## Required questions

1. Does the shell wrapper map only a confirmed404 to an empty exact lookup while
   preserving every other failure and avoiding leaked response/temp data?
2. Does this fully close R1's duplicate-create path without weakening the
   existing NanoClaw exact-email and uncertain-acceptance behavior?
3. Does document authority now use only paid materialization IDs while retaining
   the existing payment/enrollment authorization checks?
4. Does the Adyen Card configuration require a full valid billing address and
   therefore send AVS data in the Sessions payment, without conflating it with
   the company invoice address?
5. Are the tests load-bearing for the specific defects?

## Verification

- Heartbeat wrapper test: confirmed404 empty, existing email preserved, 503
  fails; pass. A live nonexistent synthetic email also returns exact empty.
- Nano focused:4 files,32/32; payment/checkout suite before R1:526/526;
  typecheck pass.
- Tandem checkout:95/95 JavaScript tests; PHP page/controller85/85; public Vite
  build pass.
- Full Nano repository before R1:4,326 pass,32 skipped,19 unrelated existing
  failures in five files outside this change.

## Response format

Write `NO MATERIAL FINDINGS` with a concise rationale, or an ordered list of
material findings with exact file/line evidence and the smallest safe fix.
