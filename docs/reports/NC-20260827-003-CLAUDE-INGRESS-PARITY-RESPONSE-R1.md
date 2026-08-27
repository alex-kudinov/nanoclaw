# NC-20260827-003 bounded Stripe ingress parity review R1 — response

Reviewer: Claude (static review only — no Bash, web, MCP, credentials, `.env`,
logs, database, Stripe, n8n, or runtime access). Read only the allowed packet.

## Verdict

NO MATERIAL FINDINGS.

## Evidence against each material question

1. **Silent omission across pages/boundary/drift.** Every returned row (not
   just succeeded ones) must match `paymentIntentId()`
   (`src/contador-stripe-ingress-parity.ts:201-203`) or the fetch throws;
   pagination requires a cursor whenever `has_more` is true or throws
   (`stripe_ingress_pagination_cursor_missing`, lines 211-215); the two full
   reads are compared via a sorted-array SHA-256 (`stableSnapshotValue`,
   lines 239-248, 275-277), so any row appearing/disappearing between reads —
   including one racing in at the live window edge — fails closed as
   `stripe_ingress_snapshot_drift` rather than silently vanishing. The window
   bound (`createdLt = floor(now/1000)+1`, line 259) correctly makes the
   upper edge inclusive of the current second.

2. **Race with natural webhook admission / partial or duplicate case-receipt
   sets.** Parity acquires `pg_advisory_xact_lock(hashtextextended('scope:pi',
   0))` (line 350-352) — byte-identical key format to
   `beginContadorFulfillmentWithClient`'s lock
   (`contador-payment-fulfillment-store.ts:417-419`). Both paths lock and
   mutate inside a single Postgres transaction, so parity and a concurrent
   natural admission for the same PaymentIntent fully serialize; whichever
   commits second sees the other's row and takes the correct branch (skip as
   existing, or the ordinary retry branch). The entire reconcile call runs in
   one `withAgentContext` transaction, so any mid-loop failure rolls back all
   case/receipt inserts for that run — no partial rows persist. Re-running is
   idempotent because the existing-case/alias check re-executes fresh each
   tick.

3. **Truthful, schema-compatible needs-review state/timestamps/reopening.**
   The direct `INSERT` column list and parameter order
   (lines 392-410) line up 1:1 with `CASE_COLUMNS` used elsewhere in
   `contador-payment-fulfillment-store.ts`, and `state:'needs_review'` /
   `ownerGroup:'contador'` are members of the existing
   `ContadorFulfillmentState`/`ownerGroup` types, so this isn't a foreign
   state value. A later natural webhook for the same PI hits
   `beginContadorFulfillmentWithClient`'s generic retry branch (none of the
   `complete`/terminal-held/in-flight branches match a `needs_review` row),
   producing `version 0→1`, `attempt_count 1→2` — exactly what the evidence
   doc claims. `review_deadline = now()+interval '1 day'` and
   `owner_group='contador'` match the one-day/owner claim.

4. **External replay/payment side effects.** The file imports only
   `business-db`, `env`, and `logger` — no import of
   `beginContadorFulfillment`/`finalizeContadorFulfillment`/
   `handleStripePayment`/`process-payment.cjs`/`mark-refunds.cjs`, and the
   only outbound network call is `https.get` (`stripeGetJson`,
   lines 96-139) — no POST/mutation path exists in this file.

5. **PII/raw payload reaching persistence, health, or logs.** The row
   destructuring only ever reads `row.id`, `row.status`, `row.created`
   (lines 201-226) — no `customer`, `receipt_email`, `amount`, etc. is
   touched. Receipt `evidence` is hashed with SHA-256 before storage; only
   the hash is persisted (`evidence_sha256` column), never the evidence
   object. `ContadorStripeIngressParityHealth.result` carries only counts
   (`rowsScanned`, `succeededPaymentIntents`, `existingCases`,
   `inboxWithoutCase`, `exceptionsCreated`) — no PaymentIntent IDs, and
   `errorCode()` (lines 492-497) bounds error strings to a safe
   `[a-z][a-z0-9_]*` pattern before it ever reaches logs/health, preventing a
   raw provider error message from leaking through. The config test's literal
   assertion (`contador-stripe-ingress-parity-config.test.ts:16-22`) backs
   this with a regex check for PII field names.

6. **Default-off wiring safety.** `.env.example:52`, both
   `launchd/**/com.nanoclaw.plist`, and `setup/service.ts` all set
   `CONTADOR_STRIPE_INGRESS_PARITY_ENABLED=0`/`<string>0</string>` —
   confirmed by direct read of all four files. `src/index.ts:2450-2457` gates
   the initial fire-and-forget call and the `setInterval` behind
   `contadorStripeIngressParityEnabled()`, guards overlap with
   `contadorStripeIngressParityInFlight`, and calls
   `.unref()` on the timer. `runContadorStripeIngressParity` independently
   re-checks the flag and resets to `baseHealth()` if disabled (defense in
   depth), and catches its own errors internally (`degraded` status) so a
   provider/DB failure never throws past the tick wrapper.

7. **Missing negative/replay/scale tests.** Not a gap needing surfacing here
   — the evidence doc already discloses its own residual checklist
   (independent review, full/root/runner gates, immutable release, backup,
   off-first deployment, known-missing-payment capture, exact replay, live
   non-interference — `docs/programs/company-os/evidence/
   NC-20260827-003-stripe-payment-ingress-parity.md:76-78`) as pending, not
   claimed done.

## Notes (non-material)

- The full reconcile call runs as a single database transaction across both
  Stripe accounts and up to ~1,000 scanned/500 succeeded rows per scope. Under
  the default-off, 15-minute-interval, capped-row design this is not a
  material risk, but if the row caps are ever raised it would hold advisory
  locks (and therefore contend with live webhook admission) for the whole
  batch duration rather than per-PI.
