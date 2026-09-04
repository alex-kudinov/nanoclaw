# NC-20260904-001 bounded implementation review

## Objective

Review the release-lineage and cohort correction that followed a live Stripe
webhook incident. Report only material findings that could cause a payment to
be misrouted, a cohort to be lost/overwritten, a durable fulfillment case to
claim success without required readback, or an immutable release to omit a
runtime dependency.

Write the verdict to:
`docs/reports/NC-20260904-001-CLAUDE-REVIEW-RESPONSE-R1.md`.

## Accepted live facts

- Exact live NanoClaw base is `a00edaeb7d9709d6d4069ab5a9719d7ef6b3d3ef`.
- Cloudflare OWASP threshold rule `949110` blocked one valid Stripe
  `payment_intent.succeeded` request twice with 403 while adjacent requests to
  the same URL returned 200.
- Active custom rule `44343c96ea2c43789a39319c1f68be11` matches only
  `webhooks.tandemcoach.co` + `POST` +
  `/webhook/stripe-payment/stripetandem/webhook` and skips only managed WAF
  rules. Custom rules and rate limits remain evaluated; n8n verifies Stripe's
  signature.
- Resending the original event returned 200. Existing case 55 advanced from
  `provider_delivery_missing` to `complete` with version-1 verified source,
  Payment Log, PostgreSQL, Student Roster, and final receipts.
- The exact live MCS roster row exists but its `Cohort` cell and matching
  `public.payments.cohort` are blank.
- Stripe's current authoritative metadata for this case separates the cohort as
  `cohort_program=mcs-practicum`, a valid ISO `cohort_start`, a human
  `cohort_range`, and plural weekday `cohort_label`. Do not request or expose
  the customer, payment method, token, client secret, or raw event.
- NC-20260817-001's cohort implementation was deployed from uncommitted
  operational files. Later immutable releases correctly omitted it. The
  migration/Sheet column survived; the runtime feature did not.

## Intended behavior

1. Current split MCS metadata resolves an exact month/year/weekday label.
2. Legacy `mcs-cohort-sept-thursday`, charge-description, and product-name
   forms remain supported.
3. Partial, unrelated, or non-MCS structured metadata returns blank.
4. Roster and Postgres writes fill only blank cohort values and preserve an
   existing operator value.
5. If Stripe names a cohort, the roster target is not considered verified
   unless the cohort cell readback also succeeds.
6. Existing payment identity, Product Map, payer/student, Plutio hold, safe GET
   retry, webhook reaper, and durable case semantics must not regress.
7. A release build must fail if the required cohort resolver is not tracked.

## Allowed review files

1. `tools/contador/process-payment.cjs`
2. `tools/contador/process-payment.test.ts`
3. `tools/contador/lib/cohort.cjs`
4. `tools/contador/lib/cohort.test.ts`
5. `scripts/build-release.mjs`
6. `src/contador-cohort-release.test.ts`
7. `docs/CONTADOR-CLOSED-LOOPS.md`
8. `docs/RELEASE-INTEGRITY.md`

Read this packet plus only those eight files. You may write only the response
artifact. Do not edit implementation or other documentation. Do not use Bash,
web, MCP, credentials, `.env`, auth/session stores, raw payment data, or
unrelated repository material.

## Verification already run

- Node 22.23.2 syntax checks pass.
- Focused processor/cohort/release/store/host/webhook/reaper: 160/160 pass.
- Typecheck and build pass.
- Documentation continuity passes.
- Full root: 3,440 pass / 32 skip / two failures. Both exact failures are the
  already-recorded base failures: CNPC wrapper-literal expectation and the
  date-stale Trafft fixture. No changed file participates in either failure.

## Requested response

Return `NO MATERIAL FINDINGS` if the intended behavior is enforced. Otherwise
list only material findings, highest consequence first, with exact file and
line evidence and a concrete correction. Do not restate the packet or propose
unrelated redesign/backlog.
