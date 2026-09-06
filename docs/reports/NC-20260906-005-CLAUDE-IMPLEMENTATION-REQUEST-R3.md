# NC-20260906-005 — bounded implementation review R3

## Review objective

Review the exact staged cross-repository implementation of the owner-approved
simple capacity sync against the converged R2 contract. Report material
correctness, safety, security, data-integrity, cache, or release defects only.

This is the owner-approved third and final Claude round. The two prepared patch
artifacts total about 98 KB because the load-bearing transaction and cache
boundary spans NanoClaw and Tandemweb; do not open unrelated files or conduct
repository archaeology.

## Authority and non-objectives

- No temporary checkout seat reservation and no synchronous NanoClaw checkout
  dependency.
- One successful mapped website sale or explicit invoice/check/sponsor/manual
  promise creates one durable committed seat.
- Assignments and commitments remain distinct; exact reconciliation consumes a
  commitment only after an assignment already exists.
- Capacity changes and commitment/assignment transfers are versioned and
  atomic.
- WordPress stores a signed monotonic two-state projection used by both cached
  display and server-side checkout validation; `cohorts.json` is fallback.
- Threshold and daily publication share a durable outbox. Only affected
  LiteSpeed and Cloudflare URLs are purged and then prewarmed.
- Publication failure freezes the last accepted site state and retries; it must
  not block a sale.
- No customer/waitlist message, refund/payment action, broad historical replay,
  participant inference, or Gate F provider/assignment-authority cutover.
- Preserve ACC September 7 and MCS Friday sold out, MCS Thursday available,
  and Rita settled in January Thursday.

## Artifacts

1. `docs/reports/NC-20260906-005-CLAUDE-PLAN-CORRECTION-RESPONSE-R2.md`
2. `docs/reports/NC-20260906-005-NANOCLAW-IMPLEMENTATION-R3.patch`
3. `docs/reports/NC-20260906-005-TANDEMWEB-IMPLEMENTATION-R3.patch`

Do not inspect `.env`, credentials, auth stores, databases, customer records,
or any file not named above.

## Verification already run

- NanoClaw focused domain/operator/disposable PostgreSQL/publication/sale
  ingress/Stripe/Contador/migration: 107 passed.
- NanoClaw full root: 3,599 passed / 32 skipped, with only the two unchanged
  predecessor failures in CNPC wrapper literal assertion and date-sensitive
  Trafft status.
- Email-critical: 750/750.
- Agent runner: build plus 45/45.
- Tandemweb focused capacity/status/calendar: 59/59.
- Tandemweb all PHP test files: 60 files passed; four exact failures reproduce
  unchanged on the base commit (ACC source-block test, missing generated ACC
  asset, exam persistent-field test, legacy combined no-date test).
- Typecheck, documentation/capability continuity, shell syntax, and diff checks
  pass.

## Required response

Write `docs/reports/NC-20260906-005-CLAUDE-IMPLEMENTATION-RESPONSE-R3.md`.

- Begin with `NO MATERIAL FINDINGS` or a consequence-ordered finding list.
- Cite exact patch/file lines and give the smallest correction.
- Check especially: both migration constraints and rollback; over-capacity sale
  truth; one-seat idempotency; pool and assignment locking; persistence/readback;
  publication revision/hash/retry; HMAC/replay; last-state fallback; targeted
  purge/prewarm; checkout hold bypass; config/release packaging.
- Do not edit implementation files and do not add speculative follow-ups.
