# NC-20260919-002 bounded correctness review — response

## Verdict

No code defect found in the reviewed boundary. One deployment-sequencing
constraint is load-bearing and must be honored exactly as already planned in
`docs/ACTIVE-WORK.md` ("release producer before consumer") — reversing it
would reject 100% of Commerce deliveries, not just the TEST/fee slice. See
Q4. All other invariants hold under inspection.

## Answers

### Q1 — Can any TEST delivery reach an official sink or Capacity?

No.

- `prepareCommerceBookkeeperEnvelope` rejects `deliveryKind === 'fee_reconciliation'`
  when `environment !== 'live'` before any handling
  (`src/commerce-bookkeeper.ts:301-306,371-372`).
- For `environment === 'test'` payment/refund deliveries, the child process
  returns a suppressed result immediately, before touching `PAYMENTS_ID`,
  `ROSTER_ID`, or Postgres — the Sheets/Postgres config check
  (`fail('bookkeeper configuration missing')`) sits strictly after the TEST
  branch's early `return` (`tools/contador/process-commerce-payment.cjs:398-414`).
  This ordering is asserted directly in a test
  (`src/commerce-bookkeeper.test.ts:382-384`).
- `commitCommerceCapacity` is only invoked when
  `envelope.environment === 'live' && envelope.deliveryKind === 'payment'`
  (`src/webhook-server.ts:1012-1018`), so TEST never reaches Capacity.
- Host-side, `handleCommerceBookkeeper`'s readback (`validSuppression`,
  `src/commerce-bookkeeper.ts:492-498`) independently asserts
  `officialRecordSuppressed === true` and all three verified flags are
  `false` for `environment === 'test'`, rejecting the delivery if the child
  process ever disagrees. Defense in depth, not just trust in the child.

### Q2 — Can a LIVE fee job attach to the wrong row, double-count Peri, regress/blank G:H, or report false success?

No material issue found.

- `recordPaymentFees` requires exactly one Payment Log row matching the
  signed `pspReference`, then checks gross/currency/PSP/status/provider
  before writing, and re-reads gross/fee/net/currency/PSP/provider after
  writing (`tools/contador/process-commerce-payment.cjs:164-193`). Wrong-row
  attachment is excluded by the `matches.length !== 1` guard.
- Peri double-counting is a Commerce-side concern by design
  (`providerFeeCents`/`periFeeCents` arrive pre-computed and are only
  summed: `commerceEconomics`, line 89-108); NanoClaw does not re-derive or
  re-add fees. This is the accepted division of responsibility per the
  request's own "Accepted facts."
- Blanking: an ordinary LIVE payment replay without economics explicitly
  preserves the existing G/H values from the sheet rather than overwriting
  with blanks (`recordPaymentLog`, lines 140-148, `if (!fact.economics) { ...
  read prior G/H ... }`). A payment delivery that *does* carry economics
  (already-available Adyen-detailed data) is the intentional
  fill/upgrade path from Objective 2, not a regression path.
- The `nanoclaw.bookkeeper.notify` job (which writes the initial Payment Log
  row) is claimed once and marked `complete` on success
  (`class-tandem-commerce-store.php:4200-4215`); completed jobs are never
  re-claimed (`claim_jobs`, line 4170: only `state='pending'` or an expired
  lease). So the fee-bearing job (`nanoclaw.bookkeeper.fees`) is the only
  path that can update G/H after the initial write, and it always reads
  `bookkeeper_economics()` fresh at execution time rather than from a stale
  snapshot (`class-tandem-commerce-actions.php:381-394`), so a delayed
  transport-level retry of the payment job cannot clobber a later,
  better-informed fee reconciliation.

### Q3 — Can an authentic Zentact replay or non-final/mismatched event create duplicate or incorrect work?

No.

- The fee job is only inserted when `environment==='live' &&
  match_state==='exact_order' && order_id!==null && status==='SETTLED' &&
  processing_cost_value is a non-negative int`
  (`class-tandem-commerce-store.php:3037-3051`). `amount_mismatch`,
  `identifier_mismatch`, `unmatched`, `exact_submission`, and non-`SETTLED`
  statuses are all excluded by this single gate — confirmed by
  `tests/test-zentact-webhook.php:198-226` (mismatch/unmatched/identifier
  cases) and by the missing-processingCost path implicitly (guard requires
  `is_int(...)`).
- Job dedup does not rely on the randomly generated `job_id` UUID; the
  `jobs` table has `UNIQUE KEY order_action (order_id,action_key)`
  (line 348), so `INSERT IGNORE` on a genuine event replay is a no-op
  regardless of how many times the same order's SETTLED event is
  reprocessed. `test-zentact-webhook.php:165-168` exercises exactly this
  replay path and asserts the job count stays at 1.
- An authentic replay of the same `event_key` is also blocked earlier: the
  `finance_projections` row is looked up by `event_key` and, if found, every
  source field must match exactly or the request fails closed with
  `commerce_zentact_source_conflict` (lines 3001-3006); the replay branch
  never re-derives `match_state`, it reuses the stored value
  (`$effective_match_state`, line 3035), so a replay cannot flip an
  already-recorded `unmatched`/`mismatch` state into a job-triggering
  `exact_order` state.

### Q4 — Deployment order

**Deploy Commerce (producer) before NanoClaw (consumer).** Reversing this is
unsafe, not just suboptimal:

- `docs/ACTIVE-WORK.md:9-11` records that the *currently deployed* Commerce
  envelope omits the `environment` field entirely — this diff is what adds
  `'environment' => (string) $order['environment']` to the payload
  (`class-tandem-commerce-actions.php:410`).
- The new NanoClaw validator requires `environment` to be a non-empty string
  and one of `['test','live']` (`src/commerce-bookkeeper.ts:283,301-306`);
  `text()` throws `environment invalid` (422) whenever the field is absent
  (`src/commerce-bookkeeper.ts:110-116`).
- If NanoClaw is deployed first, **every** Commerce delivery — not just
  TEST or fee-reconciliation ones — would be rejected with 422 until
  Commerce ships the new field, since old Commerce sends no `environment`
  key at all.
- This matches the already-recorded intent ("release producer before
  consumer", `docs/ACTIVE-WORK.md:22`) and the identical precedent noted for
  the sibling ticket NC-20260919-001 ("the consumer must not precede the
  producer").

Bounded retry/drain requirement: none beyond what already exists. If
Commerce is deployed first and briefly runs ahead of NanoClaw, any
`nanoclaw.bookkeeper.fees` delivery attempt against the old NanoClaw will
fail (unrecognized `deliveryKind`) and `retry_job` backs off exponentially,
capped at 3600s, indefinitely (`class-tandem-commerce-store.php:4218-4230`)
— no manual drain needed once NanoClaw is live. During that same window,
TEST payments would continue to be recorded as ordinary LIVE payments by
the old NanoClaw code (the pre-existing bug persisting a little longer, not
a new regression), consistent with "the owner already removed visible test
rows" as an accepted, already-handled operational fact.

### Q5 — Are any result booleans or Slack/log claims materially misleading?

No. `formatCommerceFeeSummary` explicitly states `Student Roster: unchanged`
and `Database: unchanged` for the fee-only path, matching the actual result
object (`studentRosterVerified: false, postgresVerified: false`,
`process-commerce-payment.cjs:417-427`). `formatCommerceTestSummary` states
plainly that no official record was written
(`process-commerce-payment.cjs:360-368`), matching
`officialRecordSuppressed: true` and all-false verification flags. The
webhook-server log line distinguishes suppressed / fee-reconciled /
projected outcomes correctly (`src/webhook-server.ts:1034-1039`).
