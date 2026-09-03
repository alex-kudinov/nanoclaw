# NC-20260903-001 Gru Bookkeeper month audit

Status: production data repaired; retry implementation local and under review

Window: 2026-08-03 00:00 CT through 2026-09-03 07:30 CT

Sources: production `#gru-bookkeeper` message ledger, webhook inbox,
Contador fulfillment cases/receipts, Payment Log readback, Product Map,
Student Roster readback, and exact Plutio invoice reads for the two invoice
descriptions in the window

This report is content-minimized. Transaction tokens are the first 12 hex
characters of SHA-256 over the Stripe object ID. No email address, Stripe ID,
customer identifier, raw webhook, or payment-card data is stored here.

## Result

- 98 payment-summary messages represented 96 distinct Stripe objects.
- 20 distinct objects were called unmapped or carried a Sheet/readback error.
- Three unmapped labels were provably false: Product Map/roster reads failed,
  but the summary rendered the default empty match list as `Sales tab
  (unmapped product)`.
- Four durable cases were left `write_failed` after a transient Sheets failure;
  their webhook rows were nevertheless marked handled, so no automatic retry
  occurred.
- Six genuine product-name aliases needed current mapping/replay: two French
  Foundations payments, two `ICF `-prefixed Level 1 mentoring payments, and two
  AAMC payments. The AAMC Product Map row was added during the live operator
  thread; the French and Level 1 rows were added by this task with exact
  destination-header readback.
- One Plutio payer represented eight separate Foundations seats. The eight
  participant roster rows already existed with the exact payment date; the
  payer/company was not enrolled as a ninth student.
- Ten exact archived transactions were replayed through the host-owned
  fulfillment boundary. Cases 1, 2, 3, 15, 16, 30, 35, 38, 43, and new
  historical case 46 are all `complete` with Payment Log, PostgreSQL, and
  roster readback.
- Eight stale August/September Sales catch-all rows were cleared only after
  their real roster destination was verified. Five older Plutio-invoice rows
  outside this audit window remain; they were not silently reclassified.
- Post-repair ledger state is 41 `complete`, three separately owned
  `needs_review`, two predecessor terminalized `write_failed`, zero
  `needs_product`, and zero `processing`.

## Every flagged object in the window

| Date | Token/case | Original signal | Reclassification and verified disposition |
| --- | --- | --- | --- |
| Aug 3 | `7682364a1213` | Level 1 Group Mentoring called unmapped | Earlier Product Map repair/replay is intact; ACC Group Mentoring is present for Aug 3. |
| Aug 4 | `d1b675a68e45` | ACTC M1 called unmapped with Sheets 500 | Same-day retry and current readback show ACTC M1 on Aug 4. This was a transient Sheet failure, not a missing product. |
| Aug 4 | `7eca17146b10` | ACC-renewal mentoring called unmapped | Earlier mapping repair is intact; Mentor Coaching / ACC Renewal is present for Aug 4. |
| Aug 5 | `fa37856b5a77` | AAMC installment called unmapped twice | Earlier repair is intact; MCS Practicum and its exact September cohort are present. |
| Aug 5 | `1b5c11d0410a` | PaymentIntent half said `Unknown` | Same purchase as the next Checkout object; prior dedupe/product-preservation repair prevents a second student outcome. |
| Aug 5 | `971fa499989a` | Supervision service called unmapped | Correctly reclassified as a delivered service, not a student purchase. No Sales or roster row is required. |
| Aug 6 | `f06ef61de0cd` | Plutio invoice description called unmapped | Exact invoice is one AAMC Friday seat; MCS Practicum was already present. The stale payer/company catch-all row was cleared. |
| Aug 6 | `3d71c023fe9d` | Plutio invoice description called unmapped | Exact invoice is eight Foundations seats. Eight separate MCS MC Foundation rows dated Aug 6 were verified; the payer/company catch-all row was cleared, not enrolled. |
| Aug 10 | `06f26491909a` | AAMC installment called unmapped | Earlier repair is intact; MCS Practicum plus exact cohort are present. |
| Aug 15 | `b31d9b7ec794` | Coaching Supervision Mastery called unmapped | Earlier repair is intact; CSS / Coaching Supervision Mastery is present. |
| Aug 19 | `33800b482673`, case 46 | Level 1 Individual Mentoring alias missing | Added the explicit Level 1 alias, replayed archived inbox 4620, verified ACC Individual Mentoring, and cleared the stale catch-all row. |
| Aug 24 | `bfd935d8d0f2`, case 1 | French Foundations alias missing | Added exact French alias, replayed to `complete`, verified MCS MC Foundation, and cleared catch-all. |
| Aug 24 | `4e181e974516`, case 2 | Payment Log Sheets 503 | Replayed to `complete`; Payment Log readback and the existing ACC M1 roster outcome both verify. |
| Aug 24 | `c5ba2512c6f6`, case 3 | French Foundations alias missing | Added exact French alias, replayed to `complete`, verified MCS MC Foundation, and cleared catch-all. |
| Aug 27 | `b74c40741571`, case 15 | Payment Log timeout; roster succeeded | Replayed to `complete`; both Payment Log and existing MCS MC Foundation read back. |
| Aug 27 | `7d5916a76a22`, case 16 | False unmapped label plus roster timeout | Replayed to `complete`; MCS MC Foundation is now present and read back. |
| Aug 31 | `ad94e6fd80cb`, case 30 | Level 1 Individual Mentoring alias missing | Added explicit alias, replayed to `complete`, verified ACC Individual Mentoring, and cleared catch-all. |
| Sep 1 | `6afdb16e62b9`, case 35 | AAMC alias missing | Replayed the operator-added exact mapping to `complete`, verified MCS Practicum, and cleared catch-all. |
| Sep 2 | `c62b25fc6bca`, case 38 | False unmapped label plus roster timeout | The manual agent rerun wrote the roster but bypassed the case. Host replay closed version 2 as `complete`; MCS MC Foundation reads back. |
| Sep 3 | `53affce6e252`, case 43 | AAMC alias missing | The manual agent rerun wrote the roster but bypassed the case. Host replay closed version 1 as `complete`; MCS Practicum reads back and catch-all was cleared. |

## Root causes

1. **A rendering bug lied about classification.** `rosterMatches` started empty.
   If the Product Map GET threw, the outer catch recorded an error but the
   summary still rendered the empty array as `Sales tab (unmapped product)`.
2. **A durable exception was mistaken for retry completion.** The fulfillment
   ledger correctly stored transient stage failures as `write_failed`, but both
   the initial webhook path and webhook reaper marked the inbox handled for any
   terminal case state. The five-attempt webhook retry machinery therefore
   never saw the row again.
3. **The only retry offered to the operator bypassed ownership.** Gru manually
   invoked `process-payment.cjs`, which can repair a Sheet cell but cannot
   advance the host-owned case. Slack could say fixed while the case remained
   failed.
4. **Product mapping is explicit but incomplete.** Exact-name matching is safe
   against guessing, but missing localized/prefix aliases legitimately becomes
   `needs_product`. The missing aliases were not being worked and replayed.
5. **Earlier routing safety existed outside release authority.** The
   not-a-student sentinel and tab-rename-safe exam routing were recorded as
   live operational changes but remained uncommitted. The current immutable
   release no longer contained them.
6. **A Plutio invoice is not a student identity.** An invoice description may
   represent one participant, a sponsor, a company, or multiple seats. Filing
   the payer to Sales is not participant resolution.

## Implemented source correction

- Retry one transient Google Sheets GET (timeout, 408, 429, 5xx, connection
  reset) inside the deterministic processor. Non-idempotent writes are not
  blindly retried at the HTTP-call level.
- Keep transient `write_failed` webhook rows failed so the existing five-attempt
  durable reaper retries them; only complete or owned identity/product/review
  outcomes are handled.
- Post a host-authored retry result back to Contador after a reaper attempt.
- Render Product Map/read failures as `not classified`, never `unmapped`.
- Restore the Product Map not-a-student sentinel and renamed-tab-safe exam
  routing in the immutable source lineage.
- Clear a stale Sales row only after a mapped roster or non-student outcome is
  read back; cleanup failure makes the case retryable.
- Treat Plutio invoice descriptions as `needs_student` rather than enrolling a
  payer/company or declaring product success.
- Update the Contador prompt so manual direct-script reruns are not accepted as
  host-case completion.

## Verification and release boundary

Focused processor/store/host/webhook/reaper tests pass 149/149 under Node
22.23.2. Typecheck, build, formatting, continuity, capability, and diff checks
pass. The full root suite is 3,414 pass / 32 skip with the same two exact-base
failures (CNPC wrapper-literal expectation and date-stale Trafft fixture).
Claude Sonnet/high R1B returned `NO MATERIAL FINDINGS`; Codex applied its one
non-material consistency suggestion and reran the gates. Commit, immutable
release, deployment, and a controlled transient-failure live canary remain
pending at this report revision. The production data repair above is already
applied and read back; the automatic-retry code is not yet live.
