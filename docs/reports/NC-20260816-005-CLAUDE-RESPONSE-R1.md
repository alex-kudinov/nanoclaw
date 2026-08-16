# NC-20260816-005 — Claude implementation response (R1)

## Outcome

`READY_FOR_CODEX_VERIFICATION`

Local implementation and focused-test verification are complete on
`codex/nc-20260816-005-stripe-attribution` (exact live base `55c97d5`). Nothing
was committed, built, deployed, or written to any external system. Codex owns
commit/build/deploy and the separate historical-row correction per the
original task's Authority section.

## Changed files

All within the request's allowed edit paths:

- `tools/contador/process-payment.cjs`
- `tools/contador/process-payment.test.ts` (new)
- `src/chaos-lifecycle-outbox.ts`
- `src/chaos-lifecycle-outbox.test.ts`
- `docs/ACTIVE-WORK.md`
- `docs/ENGINEERING-CHANGELOG.md`
- `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md` (this file)

Not touched: `src/stripe-payment-host.ts`, `src/stripe-payment-host.test.ts`
(contract unchanged — see below), the migration file (read-only authority,
no schema change needed), and everything outside the allowed paths.

## Design decisions

**1. Metadata extraction/validation (required behavior 1, 3).** Tandem's
checkout writes the canonical website product slug into the underlying
PaymentIntent's `metadata.product` key (`class-stripe-checkout.php`), in the
same kebab-case shape as `data/checkout/products.json` keys. Both event
shapes in `process-payment.cjs` end up fetching that same PaymentIntent object
(the checkout branch already fetches it for fee/refund data; the
payment-intent branch fetches it as the primary object), so `pi.metadata`
is read once per run and validated by a new pure `validateCanonicalProductSlug`
(kebab-case regex, length cap, fail-closed to `null` — never passes raw text
through). The result flows through the existing `__CHAOS_LIFECYCLE__`
sentinel as an additive `canonical_product_slug` field.

**2. Persistence without a schema change (required behavior 2).** Migration
117's `chaos_lifecycle_outbox` table has no product-slug column, but does have
a `properties jsonb` column. `enqueueStripeLifecycleFact` re-validates the
incoming slug (defense in depth — never trust the sentinel blindly) and, only
if valid, stores it as `properties.canonical_product_slug`. An invalid or
absent value is simply omitted, never persisted as text. This avoids editing
the migration file, which is read-only authority for this task.

**3. Chaos send-time precedence and fail-closed fallback (required behavior
3).** `sendRow` re-validates `row.properties.canonical_product_slug` a second
time (in case a row was ever written by different code, or the column drifts)
and prefers it over the existing name-derived `safeProductSlug(identity.product_name)`
only when valid; otherwise it falls back unchanged. Heartbeat/off-site
payments, which never carry Tandem's `product` metadata, naturally fall back
to the pre-existing behavior with no account-specific branching needed.

**4. Product-name preservation + shell-free Postgres write (required
behavior 4), scoped to exactly what was authorized.** The live worktree
already converges Checkout and PaymentIntent events onto one `pi_*` row (via
`canonicalTransactionId`/`accountingStripeId`); that part of NC-20260815-004
was not re-implemented because it already exists. What was missing — and is
ported here from the reviewed-but-uncommitted evidence — is:
  - a `preferredProductName(incoming, existing, eventType)` pure guard,
    applied to **both** stores named in the requirement: the Payment Log
    sheet (read column E back before overwrite) and Postgres (`ON CONFLICT`
    `CASE` guard on `product_name`/`product_id`/`event_type`);
  - removal of shell interpolation from the Postgres write: `execSync`
    (which ran the whole command through `/bin/sh -c`, letting the *shell*
    expand `$999`, `` ` ``, and `$(...)` before psql ever saw them) is
    replaced with `execFileSync('psql', [...args, '-f', '-'], { input: sql })`
    — no shell at all — using `psql -v NAME=value` / `:'var'` parameter
    binding fed on stdin (psql only performs `:'var'` substitution when
    reading a script, never for `-c` strings). A small pure
    `buildPsqlVarArgs` helper was extracted so this is independently testable
    without a live database.

  Deliberately **not** ported: `NOT_A_STUDENT` / `resolveRosterTargets` and
  the associated roster-classification refactor present in the evidence file.
  That is unrelated roster-policy behavior change, explicitly out of scope
  ("no ... roster-policy expansion") and explicitly called out in
  `docs/ACTIVE-WORK.md`'s own NC-20260816-005 scope note as work this task
  must not port.

**5. `src/stripe-payment-host.ts` left unchanged.** `parseLifecycleSentinel`
JSON-parses the sentinel line generically into `StripeLifecycleFact` and does
no field-by-field validation of its own; `canonical_product_slug` is a new
optional field that flows through untouched. No contract change, so its test
file was also left unchanged, per the task's own conditional ("only if its
contract changes").

**6. Testability guard added to `process-payment.cjs`.** The file previously
called `main()` unconditionally at module load and `process.exit(1)` on
missing argv/env — importing it for unit tests would have fired the whole
Stripe/Sheets/Postgres pipeline as a side effect. Added the same
`require.main === module` guard pattern already used by the (uncommitted)
evidence file, wrapped only around the CLI-only exits and the `main()` call.
This is additive and behavior-preserving for the real CLI invocation path
(`node process-payment.cjs <id>`), which is unaffected.

## Material findings / residual risks

- **`vitest.config.ts` has no `tools/**` entry in this worktree.** The exact
  test command in the request
  (`npm test -- --run ... tools/contador/process-payment.test.ts`) cannot
  discover the new test file under the tracked config, because this
  immutable-lineage worktree's `vitest.config.ts` `include` glob is
  `src/**`, `setup/**`, `skills-engine/**`, `scripts/**` only — the live
  NanoClaw checkout's config already has `tools/**/*.test.ts` (again, from
  the same uncommitted NC-20260815-004 lineage), but `vitest.config.ts` is
  outside this task's allowed edit paths, so it was not changed. I verified
  the new test file locally by temporarily adding the `tools/**` glob entry,
  running the exact three-file command, and reverting the config change
  before finishing (confirmed via `git status`/`git diff` showing no residual
  change to `vitest.config.ts`). Codex should open a narrow follow-up task to
  add that one glob entry so `npm test` covers `tools/contador/*.test.ts`
  going forward.
- **Literal `$`/quotes/command-like product names are proven at the argv
  boundary, not against a live psql.** No database was available in this
  environment (and none should be touched per the safety contract). The test
  suite proves `buildPsqlVarArgs` hands each value through as one inert argv
  element (never shell-interpolated, never concatenated into the SQL/command
  text) and that `preferredProductName` correctly resolves arrival order —
  the same boundary NC-20260815-004's evidence describes verifying live
  against a real (rolled-back) transaction. A live/staging psql replay of the
  `$999`/`O'Brien`/backtick cases remains a Codex verification step, not
  something this round could perform.
- **The four historical `unmapped-stripe-product` rows are untouched**, as
  required — no historical repair was attempted in this round.

## Exact test results

Commands run under pinned Node 22.23.2 (via
`/opt/homebrew/opt/node@22/bin/node`, since `nvm`/`.nvmrc` activation was not
reachable through this sandboxed shell; verified `node -v` → `v22.23.2` before
every run):

```
$ npx vitest run src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts
 ✓ src/chaos-lifecycle-outbox.test.ts (11 tests) 28ms
 ✓ src/stripe-payment-host.test.ts (20 tests) 7ms
 Test Files  2 passed (2)
      Tests  31 passed (31)
```

```
$ npx vitest run --config <temporary include override, reverted> \
    src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts \
    tools/contador/process-payment.test.ts
 ✓ tools/contador/process-payment.test.ts (17 tests) 3ms
 ✓ src/chaos-lifecycle-outbox.test.ts (11 tests) 26ms
 ✓ src/stripe-payment-host.test.ts (20 tests) 7ms
 Test Files  3 passed (3)
      Tests  48 passed (48)
```

```
$ npm run typecheck
> tsc --noEmit
(exit 0, no output)
```

```
$ npm run docs:continuity-check
Schema sanitizer self-test passed.
Documentation continuity check passed: 60 active/ready task rows, 56 changelog entries.
```
(First run failed on this task's own pre-existing non-UTC `Updated`
timestamp — `2026-08-16T11:45-05:00` instead of `...Z` — and, after fixing
that, on the `ready_for_review` row requiring a changelog entry. Both were
authoring gaps in the allowed `docs/ACTIVE-WORK.md` /
`docs/ENGINEERING-CHANGELOG.md` paths, fixed in this same change; not a
baseline defect.)

```
$ git diff --check
(exit 0, no output — no whitespace errors)
```

`npm test` (unscoped) was not run — the request specifies the four commands
above as the minimum, and a full-suite run was out of scope for this focused
round.

## Confirmation: no production or external write occurred

- No `git commit`, `git push`, or branch/PR action was performed.
- No Stripe, Google Sheets, or Postgres call was made — all verification was
  static analysis (`tsc --noEmit`), documentation lint
  (`docs:continuity-check`), and Vitest unit tests against mocked
  `business-db`/`fetch`/`fs`/`child_process` boundaries. `process-payment.cjs`
  was never executed as a CLI (`node process-payment.cjs <id>`); only its
  exported pure functions were imported and called.
- `npm ci` was run once in this worktree to install local dev dependencies
  (needed to run Vitest/tsc at all); it did not modify `package.json` or
  `package-lock.json` (confirmed via `git status`/`git diff --stat`).
- The one non-allowed-path file touched during verification
  (`vitest.config.ts`) was reverted via `git checkout --` before finishing;
  `git status --short vitest.config.ts` and `git diff --stat` confirm it is
  clean in the final state.
- Final `git status --short` shows changes only in the seven files listed
  under "Changed files" above.
