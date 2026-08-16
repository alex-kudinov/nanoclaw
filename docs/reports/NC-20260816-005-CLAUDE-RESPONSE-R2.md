# NC-20260816-005 — Claude implementation response (R2)

## Outcome

`READY_FOR_CODEX_VERIFICATION`

Both R2 `CHANGES_REQUIRED` gaps are closed on
`codex/nc-20260816-005-stripe-attribution` (exact live base `55c97d5`).
Nothing was committed, built, deployed, or written to any production/external
system in this round.

## Diffs re-inspected before starting

`git status --short` at the start of this round matched exactly what R1 left:

```
 M docs/ACTIVE-WORK.md
 M docs/ENGINEERING-CHANGELOG.md
 M src/chaos-lifecycle-outbox.test.ts
 M src/chaos-lifecycle-outbox.ts
 M tools/contador/process-payment.cjs
?? docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md
?? docs/reports/NC-20260816-005-CODEX-REQUEST-R1.md
?? docs/reports/NC-20260816-005-CODEX-REQUEST-R2.md
?? tools/contador/process-payment.test.ts
```

`vitest.config.ts` was clean (no diff) — confirming the R1 temporary local
override had in fact been reverted, and `tools/contador/process-payment.cjs`
was untouched in this round (R2's allowed-edit list does not include it).

## Changed files (R2)

Exactly R2's allowed edit paths, all touched:

- `src/chaos-lifecycle-outbox.ts`
- `src/chaos-lifecycle-outbox.test.ts`
- `vitest.config.ts`
- `docs/ACTIVE-WORK.md`
- `docs/ENGINEERING-CHANGELOG.md`
- `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R2.md` (this file)

Not touched in this round: `tools/contador/process-payment.cjs`,
`tools/contador/process-payment.test.ts`, `src/stripe-payment-host.ts`,
`src/stripe-payment-host.test.ts` — none were in R2's allowed-edit list and
none needed to change to satisfy R2's two gaps.

## What was fixed and why

**1. Upgrade/non-erasure merge on `ON CONFLICT` (required change 1).**

The R1 `enqueueStripeLifecycleFact` `INSERT ... ON CONFLICT (source_system,
source_event_id) DO UPDATE` only updated `provider_event_ids`,
`provider_object_ids`, and `updated_at` — `properties` (and therefore the
persisted `canonical_product_slug`) was never touched on conflict. Since the
Checkout half and PaymentIntent half of one purchase resolve to the *same*
`source_event_id` (both use the shared canonical `pi_*` transaction id — see
`sourceEventId()`), and since the reaper's retry path re-runs the same
enqueue, this meant: if the first call to land landed without a valid slug
(no metadata yet resolved, a transient validation miss, etc.) and a later
call — the twin event or a retry — carried a valid one, the row was
permanently stuck without a canonical slug. Conversely, a later call
*without* a slug could not be allowed to silently blank out a slug a prior
call had already stored.

Fixed with an upgrade-only, non-erasing merge:

```sql
properties = CASE
  WHEN EXCLUDED.properties ? 'canonical_product_slug'
  THEN jsonb_set(
    business_v2.chaos_lifecycle_outbox.properties,
    '{canonical_product_slug}',
    EXCLUDED.properties -> 'canonical_product_slug'
  )
  ELSE business_v2.chaos_lifecycle_outbox.properties
END
```

This works because the JS layer already only puts the
`canonical_product_slug` key into the outgoing `properties` object when
`validCanonicalProductSlug` passed (R1 behavior, unchanged) — so
`EXCLUDED.properties ? 'canonical_product_slug'` is a reliable signal that
*this specific call* carries a validated slug. When it does, only that one
key is set into the existing stored `properties` via `jsonb_set` (every other
existing key — `account`, `payment_status`, refund fields, etc. — is left
alone, since the base object of `jsonb_set` is the *existing* row's
`properties`, not `EXCLUDED.properties`). When it doesn't, the `ELSE` branch
assigns the stored `properties` back to itself unchanged — no key is ever
removed. This is a scoped merge of exactly the one field the requirement
named, not a general "merge everything" that could let a stale retry's other
property values regress a fresher row.

A new test,
`'on conflict, upgrades the stored slug only when the incoming call carries a
validated one, and never erases it otherwise'`, exercises both branches by
calling `enqueueStripeLifecycleFact` twice for the same `canonical_transaction_id`
— first with a valid slug, then without — and asserts, at the SQL/parameter
contract boundary (the only boundary a mocked-`query` unit test can reach
without a live Postgres):

- the outgoing `properties` JSON differs correctly between the two calls
  (has the slug key on call 1, omits it on call 2 — this is the R1 fail-closed
  behavior, re-confirmed here in the specific two-call sequence);
- the SQL text contains the `EXCLUDED.properties ? 'canonical_product_slug'`
  guard and `jsonb_set(...)`, i.e. the upgrade path exists;
- the SQL text never contains a blind `properties = EXCLUDED.properties`
  overwrite;
- both calls run the identical static SQL string — proving the two behaviors
  (upgrade vs. preserve) come from the same `CASE` expression evaluated
  server-side against each call's actual `properties`, not from two different
  code paths in JS that could drift apart.

**2. `tools/**/*.test.ts` added to `vitest.config.ts` (required change 2).**

```diff
       'scripts/**/*.test.ts',
+      'tools/**/*.test.ts',
     ],
```

`tools/contador/process-payment.test.ts` is the only file this glob currently
matches (checked with `find tools -name "*.test.ts"`), so no other test files
were unexpectedly pulled into the suite. `npm test -- --run
src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts
tools/contador/process-payment.test.ts` now runs all three files under the
tracked config with no local override, as confirmed below.

**3. Active-work/changelog/response evidence updated (required change 3).**

- `docs/ACTIVE-WORK.md`: the NC-20260816-005 row's "Next action" no longer
  mentions a follow-up task for the test glob; the task-detail section's R1
  verification note (which explicitly said "Codex needs a separate task to
  add `tools/**/*.test.ts`") was replaced with an R2 round note describing
  both fixes and the new 49-test/tracked-`npm test` verification. Timestamp
  corrected to UTC (`2026-08-16T17:05Z`).
- `docs/ENGINEERING-CHANGELOG.md`: the existing (still-`Unreleased`,
  not-yet-committed) `### NC-20260816-005` entry was amended in place with a
  dated addendum per `docs/CHANGE-PROTOCOL.md` §3 ("Lifecycle fields may be
  amended in place with a dated UTC addendum") rather than a second
  `### NC-20260816-005 — ...` heading — the changelog checker rejects
  duplicate headings for one task ID, and the entry was never committed/
  released, so amending in place (not deleting any prior fact) is the correct
  append-only move here. The "Follow-ups" bullet's now-resolved test-glob
  item is explicitly marked resolved and superseded by the addendum, which
  restates the corrected fact (`tools/**/*.test.ts` is in `vitest.config.ts`)
  rather than leaving the outdated "separate task" statement as the last word.
- This file: `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R2.md`.

## Material findings / residual risks

- **A JS template-literal syntax hazard while writing the SQL comment.** My
  first draft of the upgrade-only SQL comment used backticks around
  `` `properties` `` for emphasis; since the whole query is a JS template
  literal, that backtick prematurely closed the string and broke the build
  (`esbuild` error, both dependent test files failing to transform). Caught
  immediately by running the focused tests before considering this done;
  fixed by dropping the backticks from the SQL comment. No other backticks
  exist inside any template-literal SQL string in this file (checked with a
  full-file grep) — this was an isolated authoring mistake, not a pattern.
- **The merge behavior is proven at the SQL/parameter contract boundary, not
  against a live Postgres.** As with R1, no database was available in this
  environment and none should be touched per the safety contract. The new
  test proves the exact SQL text and the exact `properties` JSON each call
  sends; it does not execute `jsonb_set`/`CASE` against a real row. A
  live/staging replay of the two-call sequence (or of the real
  Checkout-then-PaymentIntent / PaymentIntent-then-Checkout order) remains a
  Codex verification step.
- No other residual risks beyond those already carried from R1 (see
  `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md`): the four historical
  `unmapped-stripe-product` rows remain untouched, and a live psql replay of
  the literal-`$`/quotes product-name cases is still a Codex step.

## Exact verification results

All run under pinned Node 22.23.2 (via `/opt/homebrew/opt/node@22/bin/node`,
reached through `bash -lc` in this sandboxed shell; `node -v` confirmed
`v22.23.2` immediately before each run):

```
$ npm test -- --run src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts tools/contador/process-payment.test.ts
> vitest run --run src/chaos-lifecycle-outbox.test.ts src/stripe-payment-host.test.ts tools/contador/process-payment.test.ts

 ✓ tools/contador/process-payment.test.ts (17 tests) 3ms
 ✓ src/stripe-payment-host.test.ts (20 tests) 6ms
 ✓ src/chaos-lifecycle-outbox.test.ts (12 tests) 28ms

 Test Files  3 passed (3)
      Tests  49 passed (49)
```

(12 in `chaos-lifecycle-outbox.test.ts` = the 11 from R1 plus the one new R2
upgrade/non-erasure test. 17 in `process-payment.test.ts` and 20 in
`stripe-payment-host.test.ts` are unchanged from R1. This is the exact
tracked `npm test` command — no config override, local or otherwise, was
needed or used.)

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

```
$ git diff --check
(exit 0, no output — no whitespace errors)
```

## Confirmation: no production or external write occurred

- No `git commit`, `git push`, branch action, or PR action was performed.
- No Stripe, Google Sheets, or Postgres call was made. All verification was
  static analysis (`tsc --noEmit`), documentation lint
  (`docs:continuity-check`), and Vitest unit tests against the existing
  mocked `business-db`/`fetch`/`fs` boundaries already in place from R1 — the
  new test only added assertions on `queryMock`'s captured SQL text and
  parameters, it made no real database call.
- `git status --short` at the end of this round shows changes only in the six
  files listed under "Changed files (R2)" plus the three untracked R1/R2
  request-and-response artifacts already present at the start of this round
  (`docs/reports/NC-20260816-005-CODEX-REQUEST-R1.md`,
  `docs/reports/NC-20260816-005-CODEX-REQUEST-R2.md`,
  `docs/reports/NC-20260816-005-CLAUDE-RESPONSE-R1.md`) plus
  `tools/contador/process-payment.cjs` and
  `tools/contador/process-payment.test.ts`, both carried over unmodified from
  R1 and outside R2's allowed-edit list.
