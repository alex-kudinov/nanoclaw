# NC-20260909-003 TEST webhook supervision correction review

## Objective

Review the smallest source correction required to run the preserved TEST
checkout backend from an immutable release and safely advance a reusable TEST
database through migrations 161–165. Report material findings only and write
`docs/reports/NC-20260909-003-TEST-WEBHOOK-SUPERVISION-REVIEW-RESPONSE.md`.

## Incident facts

- The enabled Adyen TEST webhook returned repeated HTTP503 because its local
  backend, edge and reverse tunnel had been terminal-session processes and were
  offline.
- The exact failed delivery was redelivered after all three hops were restored;
  Adyen reports Accepted.
- A fresh full Tandem TEST payment is durably `authorization_recorded` with one
  payment event. This is TEST only.
- The preserved reusable database lacked migrations 161–165. A private custom
  backup was created before applying them. The new payment then passed.
- Permanent launchd definitions will use the compiled entrypoint from an
  immutable release; their machine-local rendering is outside this source diff.

## Review paths

Read only:

1. `src/website-checkout-test-runner.ts`
2. `src/website-checkout-test-entrypoint.ts`
3. `src/website-checkout-test-entrypoint.test.ts`
4. `data/business/migrations/nanoclaw-v2/161_payment_checkout_billing_profile.sql`
5. `data/business/migrations/nanoclaw-v2/162_payment_provider_optimization_evidence.sql`
6. `data/business/migrations/nanoclaw-v2/163_payment_checkout_documents.sql`
7. `data/business/migrations/nanoclaw-v2/164_payment_checkout_document_retention.sql`
8. `data/business/migrations/nanoclaw-v2/165_deferred_checkout_identity.sql`

Write only the response artifact. Do not inspect runtime config, `.env`,
credentials, auth stores, browser profiles or unrelated files. Do not run Bash,
network, provider, database, git or deployment actions.

## Required checks

- A brand-new TEST database still applies every migration once in dependency
  order.
- A reusable database applies each of 161–165 only when its complete marker is
  absent and rejects partial states.
- The compiled entrypoint requires one absolute config, verifies the immutable
  release before any private config/database/listener work, has content-free
  errors, and installs bounded signal cleanup.
- No LIVE service, customer, payment, secret, webhook authority or cleanup
  boundary is widened.

## Verification

- Typecheck passes.
- Focused entrypoint/runner/service/webhook/evidence tests pass 66/66.
- Existing TEST DB backup: owner-only, 606726 bytes, SHA-256
  `fdd0e8918a9efa8d76dbeccb82a9ab2cd6a0092c23af77340cabb11508d7bf32`.
- Migrations 161–165 applied cleanly to the preserved TEST database.

Return `NO MATERIAL FINDINGS` if safe; otherwise give exact file/evidence,
consequence and smallest correction.
