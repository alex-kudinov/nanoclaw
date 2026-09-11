# NC-20260909-003 canonical website enrollment adapter review R1

## Objective

Independently review the bounded, source-only MCS website checkout enrollment
adapter. Report only material correctness, security-boundary, concurrency,
replay/idempotency, rollback, data-integrity, or unintended-side-effect defects.
This is review, not implementation or architecture expansion.

## Accepted scope and facts

- `admit(attemptId)` must re-read authenticated checkout/identity authority,
  immutable quote, one exact scoped native PSP method binding and current signed
  provider evidence before materializing one canonical order, seat, enrollment,
  financial agreement and obligation.
- Order identity is scope plus quote ID, never PSP. A PSP has one scoped writer.
- The publication is staged TEST-only and its runtime consumer is disabled.
- Trusted publication identity is independently configured as exact publication
  ID, positive revision and payload SHA-256. The adapter must recompute payload
  integrity; a supplied object cannot approve its own changed hash.
- Quote versions are exact: catalog is
  `publication.source_versions.checkout_catalog`; bundle is
  `bundle_key + ':revision-' + bundle_version`; delivery is
  `'publication:' + publication_id + ':r' + revision + ':' + offer_key`.
- Publication base amount binds quote `originalAmount`; WordPress owns discount
  arithmetic and the financial obligation records the exact `finalAmount`.
- ACH authorization grants provisional enrollment only when mandate evidence is
  already in the immutable checkout-admission row. It does not prove received
  funds or certificate clearance. Card requires fixed capture-configuration
  evidence. No code here may clear a certificate.
- Exact replay validates immutable consumed/canonical bindings without rewriting
  the original consumption digest from a later financial projection or catalog.
  Later adverse facts stay visible but do not create a second enrollment or
  silently revoke access.
- `persistEnrollmentDecision` is the existing disposable-only serializable
  transaction. Canonical tables lock first. Checkout/identity rows are then
  row-locked; method bindings are immutable; payment projection shares the
  transaction snapshot. Payment writers do not acquire enrollment locks.
- The adapter is not imported by a listener/runtime. No provider, projection,
  delivery, certificate, customer, production database, or other external action
  is authorized.

## Allowed review artifacts

Read only these files plus this request:

1. `src/website-checkout-enrollment-adapter.ts`
2. `src/website-checkout-enrollment-adapter-disposable.test.ts`
3. `docs/MCS-WEBSITE-CHECKOUT-ENROLLMENT-ADAPTER.md`
4. `data/business/migrations/nanoclaw-v2/155_website_checkout_admission_evidence.sql`
5. `facts/generated/student-foundations-publication-v1.scoped.json`
6. `src/student-enrollment-store.ts`
7. `src/student-enrollment-admission.ts`
8. `src/payment-readiness.ts`

Do not inspect `.env*`, credentials, settings/auth stores, raw logs, lockfiles,
Git history, unrelated source, customer data, runtime state, or external systems.
Do not use shell, network, Git or MCP tools.

## Verification already completed

- Pinned runtime: Node `22.23.2`.
- Draft baseline reproduced: 5 failures / 1 pass, all five from obsolete quote
  catalog/bundle/delivery fixture strings.
- Corrected disposable adapter suite: 14/14 pass. It includes independently
  fixed canonical and rotated publication pins; unchanged-hash tamper and
  self-rehashed tamper rejection; exact catalog/bundle/delivery mismatch holds;
  nonzero Spanish regional discount/base-price/obligation proof; separate payer
  and participant; ACH/card gates; multi-PSP hold; legacy writer conflict;
  cross-attempt quote and PSP uniqueness; forced final-insert rollback/retry;
  post-admission publication rotation replay; later chargeback visibility; and
  concurrent duplicate admission.
- Ten related enrollment/payment files: 120/120 tests pass with max two workers.
- Whole-tree TypeScript passed. `git diff --check` passed before this request.

## Review questions

1. Can any changed/tampered/unpinned publication or mismatched offer, locale,
   source/version, base price, identity, consent, method, PSP or provider evidence
   reach canonical writes?
2. Can replay, concurrency, cross-attempt quote/PSP reuse, lock order, or a failure
   after writer claim produce a second order/enrollment, consume funding twice,
   leak a writer claim, or leave partial financial/admission state?
3. Does immutable replay preserve the original accepted evidence while surfacing
   current adverse state without recomputing or overwriting history?
4. Does any path request delivery/projection, clear or issue a certificate, call a
   provider, enable a runtime, or perform another unintended action?

## Required response

Write only
`docs/reports/NC-20260909-003-CANONICAL-ADAPTER-REVIEW-RESPONSE-R1.md`.
Order material findings by consequence and cite exact file/line evidence. For
each finding, state the violated accepted fact and smallest bounded correction.
Do not request speculative refactors or restate the packet. If there are no
material findings, say `NO MATERIAL FINDINGS` explicitly.
