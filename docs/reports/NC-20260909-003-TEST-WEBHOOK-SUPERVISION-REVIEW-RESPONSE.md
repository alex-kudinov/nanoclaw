# NC-20260909-003 TEST webhook supervision correction review — response

## Verdict

NO MATERIAL FINDINGS.

## Checks performed against the eight in-scope files

- **Environment cannot widen to LIVE.** `privateConfigSchema` pins
  `mode: z.literal('test')` and `adyen.environment: z.literal('test')`
  (`src/website-checkout-test-runner.ts:50,57`); the derived `PaymentScope`
  also hardcodes `environment: 'test' as const` (line 245). Any config with a
  non-`test` value fails Zod parsing and throws
  `invalid_website_checkout_private_config` before any DB/listener work. No
  path in the reviewed files can promote this runtime to LIVE.

- **Fresh database applies every migration once, in dependency order.** The
  `migrations` array (lines 134–171) lists 161 and 162 immediately after 154
  and before 155–159 — not in ascending numeric order — but every dependency
  precondition in 161–165 is satisfied at its array position (161 needs only
  154; 162 needs only 151; 163 needs 149/154/155; 164 needs 163; 165 needs
  149/154). Traced the full chain; no ordering violation. The non-numeric
  placement is a readability/maintainability nit, not a correctness defect —
  not raised as material.

- **Reusable database applies 161–165 only when absent, and rejects partial
  states.** 148, 157, 159, 161, 163, 164, and 165 each use a count-based
  completeness check with an explicit `else if (count !== N) throw
unsafe_website_checkout_database` branch (lines 609–708). 162's check is
  existence-only with no `else if` — but it tracks a single atomically
  created table (`CREATE TABLE ... COMMIT` in one transaction), so 0/1 is the
  only reachable state; there is no partial state for it to fail to catch.
  Confirmed this isn't a functional gap.

- **164's empty-store precondition can't race the checkout server.** 163 and
  164 are applied synchronously during startup, before `server.listen()` is
  called, so no webhook/payment write can populate
  `payment_checkout_documents` between 163 creating the table and 164
  requiring it empty.

- **Manifest-sourced database name is validated before SQL interpolation.**
  `manifestSchema` enforces `database` against
  `/^nc_student_enrollment_store_[a-f0-9]{32}$/` (line 173, 177) before the
  value is ever interpolated into `CREATE DATABASE "${database}"` or `DROP
DATABASE "${database}"`.

- **Compiled entrypoint contract, per `website-checkout-test-entrypoint.ts`
  and its test file:**
  - Requires exactly one absolute `--config` path (`isAbsolute` check,
    line 19) — tested.
  - `verifyRuntimeRelease()` runs before argument-derived config is ever read
    or any DB/listener work starts (lines 48–57) — tested (`start` is
    provably not called when release verification throws).
  - All three failure paths emit fixed, content-free `code=...` strings;
    the "keeps startup errors content-free" test explicitly proves a thrown
    `Error('secret provider body')` does not leak into stderr.
  - Signal cleanup is bounded: handlers are registered with `process.once`
    and a `stopping` flag prevents re-entry (lines 62–70). **Note:** no test
    in `website-checkout-test-entrypoint.test.ts` exercises this path (e.g.
    a double `SIGINT` emission asserting `stop()` runs once) — the claim
    rests on code inspection only, not on the visible test suite. Minor gap,
    not treated as material since the guard logic is simple and directly
    readable.

- **No secret/PII exposure.** `READY ...` stdout never includes the config
  path or any secret; confirmed by the "starts once and exposes no database
  or private path" test (asserts `stdout` excludes `/private/test.json`).

## Item outside the fixed review scope — flagged, not asserted as a defect

`website-checkout-test-runner.ts:19,768` imports and unconditionally calls
`liveMcsProviderOptimization()` from `./payment-live-runtime.js` to populate
the TEST service's `providerOptimization` field. That file is not among the
eight approved paths, so its behavior could not be inspected. Given the
`test`-literal scope lock described above, this is most plausibly
environment-agnostic provider-optimization configuration (e.g. card-network
tuning) rather than a live credential/scope leak, but this was not
independently confirmed. Recommend a follow-up read of
`src/payment-live-runtime.ts` to confirm it returns no LIVE-scoped
credentials, merchant, or webhook authority before treating the LIVE-safety
claim as fully closed.

## Not independently verifiable from this review

The following claims in the request's "Verification" section require Bash,
database, or filesystem stat access outside the permitted read-only, no-Bash
scope, and are reported as stated by the requester rather than confirmed:
typecheck result, 66/66 test count (only 4 tests were visible in the one
in-scope test file), the TEST DB backup's ownership/size/SHA-256, and that
migrations 161–165 were actually applied cleanly to the live preserved
database.
