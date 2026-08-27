# NC-20260823-006 bounded terminal-state correction review R1 — response

Reviewed exactly the bounded file set named in the request. No Bash, web,
MCP, credentials, `.env`, logs, databases, or unrelated files were used.

## Material finding 1 (highest consequence)

**A case the terminalizer durably closed can still be silently reopened and
re-sent to the external Stripe processor by an ordinary later webhook
delivery — contradicting the "no external replay" guarantee the owner
authorized for terminalized cases.**

Evidence:

- `src/contador-payment-fulfillment-store.ts:461-495`
  (`beginContadorFulfillmentWithClient`) has exactly three branches for a
  prior case: `state === 'complete'` → `duplicateComplete`; `state ===
  'processing' && lease_active` → `inFlight`; **everything else** (the final
  `else`, lines 470-495) is reopened — `state` reset to `'processing'`,
  `version` and `attempt_count` incremented, a fresh lease issued, and an
  `admission` receipt written with `resultCode: 'retry_admitted'`
  (line 504).
- That catch-all `else` branch does not distinguish a case's prior
  `last_error_code`. It fires identically whether the prior `write_failed`
  came from an ordinary transient `processor_failed` /
  `processor_contract_invalid` finalize (`src/stripe-payment-host.ts:305-364`,
  `persistProcessorFailure`) or from the terminalizer's deliberate,
  durable `expired_processing_terminalized` closure
  (`src/contador-payment-fulfillment-store.ts:788-829`).
- Nothing in `contador_payment_fulfillment_cases` distinguishes the two.
  `CASE_COLUMNS` (`src/contador-payment-fulfillment-store.ts:154-161`) has no
  terminal/no-retry flag; the only signal is
  `last_error_code === 'expired_processing_terminalized'`, and that signal is
  checked *only* inside the terminalizer's own idempotent-replay guard
  (`inspectExpiredCaseWithClient`, lines 662-666), never inside
  `beginContadorFulfillmentWithClient`.
- Consequence: once a natural webhook redelivery for the same
  `stripe_account`/`payment_intent_id` reaches `handleStripePayment` again
  (Stripe itself retries failed webhook deliveries independently of n8n's
  5-attempt dead-letter, and Stripe's retry window is measured in days, not
  minutes), admission reopens the terminalized case and
  `handleStripePayment` (`src/stripe-payment-host.ts:441-452`) executes
  `tools/contador/process-payment.cjs` / `mark-refunds.cjs` again — an
  external Stripe/Sheets/Postgres write against a case the owner explicitly
  authorized to be closed with "no external replay."

This is exactly what material question 1 asks ("Can any processor/alias
error still strand a case or cause external-write replay after a terminal
exception exists?") — the answer is yes, and it is not specific to the two
proven cases; it applies to every case the terminalizer will ever close.

**Concrete correction:**

1. In `beginContadorFulfillmentWithClient`, add a branch before the
   catch-all `else` (around line 464) that checks
   `prior.rows[0].state === 'write_failed' && prior.rows[0].last_error_code === 'expired_processing_terminalized'`
   and, on match, returns the existing row unchanged — no lease issued, no
   admission receipt written — analogous to the existing
   `duplicateComplete`/`inFlight` short-circuits.
2. Add a new result field (e.g. `terminalHeld: boolean`) to
   `BeginContadorFulfillmentResult` so `handleStripePayment` can detect it
   and return a `[PAYMENT HELD]`-style summary without invoking
   `execFile`/`finalizeFulfillment`, mirroring the existing
   `admission.duplicateComplete` early return at
   `src/stripe-payment-host.ts:414-424`.
3. Add a negative test to `contador-payment-fulfillment-store.test.ts`
   asserting a prior `write_failed`/`expired_processing_terminalized` row is
   not reopened by `beginContadorFulfillmentWithClient`, and a test to
   `stripe-payment-host.test.ts` asserting `execFile` is never invoked for
   such a case on a subsequent `handleStripePayment` call.

This is also the answer to material question 7: this exact negative/replay
path is untested. `contador-payment-fulfillment-store.test.ts` only tests
terminalization itself and its own idempotent replay
(`terminalizeExpiredContadorFulfillmentCaseWithClient` called twice); no test
drives `beginContadorFulfillmentWithClient`/`handleStripePayment` with a
prior `expired_processing_terminalized` row.

## Other material questions — no findings

- **Q2** (`py_` support / rollback minimality): the constraint change, the
  `assertContadorProviderAlias` charge pattern, and the rollback's
  `py_`-existence guard are typed, scoped to `alias_kind = 'charge'` only,
  and leave every other alias kind's pattern untouched. Confirmed against
  `139_contador_charge_alias_compatibility.sql`,
  `rollback_139_contador_charge_alias_compatibility.sql`, and
  `contador-payment-fulfillment-store.ts:193-207`.
- **Q3** (batch mutation safety): `terminalizeExpiredContadorFulfillmentCases`
  pre-validates every spec under `FOR UPDATE` before mutating any of them
  and aborts the whole batch on the first ineligible, non-already-terminal
  spec (`contador-payment-fulfillment-store.ts:848-860`). The per-case
  `UPDATE` re-checks `version`, `attempt_count`, `state = 'processing'`, and
  `lease_expires_at <= now()` atomically
  (`contador-payment-fulfillment-store.ts:798-807`), refusing a drifted row
  even if the pre-check briefly raced. No gap found.
- **Q4** (receipts/timestamps): terminalization receipts are truthful
  (`stripe_source: verified`, all other required stages: `failed`), and the
  case's `last_observed_at` is left untouched by the terminalization
  `UPDATE`, correctly preserving the original source-observed time. No
  amount/customer/product content is written anywhere in the reviewed files.
- **Q5** (external reachability from the terminalizer): neither
  `terminalizeExpiredContadorFulfillmentCaseWithClient`/
  `terminalizeExpiredContadorFulfillmentCases` nor the CLI import or call
  Stripe, Sheets, `process-payment.cjs`, `mark-refunds.cjs`, or any network
  client — only the injected Postgres `client`. Confirmed.
- **Q6** (release binding): `scripts/build-release.mjs` explicitly lists both
  `139_contador_charge_alias_compatibility.sql` and
  `rollback_139_contador_charge_alias_compatibility.sql` in its `tracked`
  array (lines 158-159), and `package.json` exposes
  `contador:terminalize-expired` → `dist/contador-payment-fulfillment-terminalize-cli.js`,
  which is produced by the same `tsc` build step (`dist` is copied wholesale
  into the release stage). No gap found within the bounded file set.

No other material defects were found in the bounded file set.
