# NC-20260904-002 MCS cohort backfill

Status: applied and read back

Environment: production Student Roster and `nanoclaw_business`

Scope: MCS rows with an `MCS Practicum` date and blank `Cohort`

This report is content-minimized. Payment tokens are the first 12 hexadecimal
characters of SHA-256 over the Stripe PaymentIntent ID. Names, emails, raw
Stripe bodies, payment methods, and amounts are excluded.

## Audit result

- The MCS tab has 32 rows with an MCS Practicum date.
- Before repair, 17 of those rows had a blank cohort.
- Five rows had exact, non-conflicting source evidence and were safe to fill.
- Eleven remaining rows were purchased only as `MCS - Standard path`; no
  Stripe/payment record names a month and weekday.
- One remaining row has no matching `public.payments`, Payment Log, or Stripe
  customer/charge result by its exact roster identity. It remains unresolved.

## Applied rows

| MCS row | Payment token | Exact evidence | Applied cohort |
| ---: | --- | --- | --- |
| 60 | `7a8f02c814f7` | existing exact `public.payments.cohort` readback | September 2026 – Thursday |
| 159 | `8cdc0cf88709` | Stripe charge description plus legacy cohort slug | September 2026 – Thursday |
| 166 | `fa2a28d2819a` | exact Stripe-derived product name | September 2026 – Friday |
| 186 | `53affce6e252` | current Stripe `cohort_program/start/label` metadata | September 2026 – Friday |
| 190 | `6afdb16e62b9` | current Stripe `cohort_program/start/label` metadata | September 2026 – Friday |

Every target row was re-read immediately before mutation and required the
expected email identity plus a blank cohort. Each write targeted only its exact
`J` cell and was read back before continuing. No existing cohort was
overwritten.

PostgreSQL used an exact five-PaymentIntent transaction with missing/conflict
preconditions. Four blank `public.payments.cohort` values were filled; row 60's
payment already carried the exact Thursday cohort. Final readback is five of
five matching.

## Final state

- Cohort distribution for the 32 practicum rows: 13 Friday, 7 Thursday, 12
  blank.
- The five exact changed roster cells and all five matching payment rows read
  back with the expected value.
- The 12 unresolved rows remain blank rather than inferred from purchase or
  practicum dates.
- Protected backup:
  `/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260904-002-20260904T210406Z`
  (mode 0700; exact five-row Sheet snapshot plus readable custom-format
  `public.payments` dump).
- NanoClaw remained on verified release `886e2587`; Gmail/Slack, queues, and
  Stripe parity remained healthy.
- No payment, refund, customer communication, enrollment purchase, accounting,
  or unrelated roster/database record was created or changed.

## Rollback

The inverse Sheet change is to clear only `MCS!J60`, `J159`, `J166`, `J186`,
and `J190` after first verifying they still equal the values above. The
PostgreSQL inverse is to clear only the four rows changed by this task after
the same exact-value precondition. Prefer the protected snapshot/dump and
Google Sheets version history for evidence; never perform a broad cohort clear.
