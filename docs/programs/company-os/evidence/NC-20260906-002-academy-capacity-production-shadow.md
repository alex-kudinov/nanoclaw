# NC-20260906-002 — Academy capacity production shadow population

Date: 2026-09-06  
Program: `program:company-os`  
Work item: `work:academy-capacity-production-shadow-population`

## Outcome

The accepted Academy capacity model is now present in production PostgreSQL as
an admin-only shadow. Migrations 142 and 143 were applied from the independently
reviewed, immutable `a9839d9299da815eb63b5730348b62c27b8138b7` release after a
verified `business_v2` backup. The release was extracted and verified as a
migration tool only; the running NanoClaw daemon was not changed or restarted.

The exact private manifest populated five delivery blocks and 40 assignments.
An immediate second apply inserted zero rows. Independent SQL readback produced:

| Delivery block | Capacity | Occupied | Available | Shadow state |
| --- | ---: | ---: | ---: | --- |
| ACC Module 1 — 2026-09-07 | 12 | 21 | 0 | sold out |
| MCS Thursday — 2026-09-24 | 12 | 5 | 7 | open |
| MCS Friday — 2026-09-25 | 12 | 13 | 0 | sold out |
| MCS Thursday — 2027-01-07 | 12 | 1 | 11 | open |
| MCS Friday — 2027-01-08 | 12 | 0 | 12 | open |

Rita's accepted transfer remains settled in January Thursday. It is represented
as that one January assignment and is not an exception.

## Durable records and held facts

The batch created 40 orders, seats, agreements, enrollments, and class
assignments; 310 component entitlements; 40 verified Student Roster projection
receipts; seven offer-to-pool mappings; and three exact-evidence Party records
where no unique active Party existed. Payer identity was not inferred.

Three exceptions remain open exactly as authorized:

1. `mcs_friday_owner_count_variance` — current roster 13 versus prior owner count 12.
2. `funding_source_unresolved` — one ACC Module 1 assignment lacks an exact live-offer funding source.
3. `cross_provider_email_alias_unresolved` — one ACC Full roster/Heartbeat alias is held without rewriting either provider.

## Safety and verification

- Backup: mode-0600 custom-format dump, 12,746,378 bytes, SHA-256
  `e58d398371aebb317b104ebe42a7201f8f5d02142d7e6538ca877c6b773d70dd`;
  `pg_restore --list` passed.
- Manifest: mode 0600, SHA-256
  `d44839d2b8ea08495fffd69fb5ca8c8aa6e30a9980c428477c3a4c3ea52793d8`.
- Schema: all 112 target objects are owned by `nanoclaw_admin`; there are zero
  non-admin target-table grants.
- Readback: 40/40/40/40 order-seat-agreement-enrollment chains, 310
  entitlements, 40 assignments, 40 verified projections, and three open
  exceptions. There are zero pending projections, reservations, waitlist
  entries, waitlist offers, or orders with an inferred payer.
- Idempotency: the second production apply inserted zero rows in every category.
- Review: Claude Sonnet/high found two material validation/readback gaps in the
  first round; both were corrected. The fresh second round returned no material
  findings. Corrected focused tests passed 62/62; disposable PostgreSQL proof,
  catalog validation, typecheck, and release build passed.
- The full inherited suite remains 3,567 passed, 32 skipped, and two known
  unrelated predecessor failures (CNPC wrapper literal assertion and a
  date-sensitive Trafft status expectation).

## Non-interference

The running daemon remains verified at
`886e258730729a2cade1baee70466e62e2bff59e` with Node 22.23.2, Gmail and Slack
connected, zero active containers, zero queued/waiting work, and student
lifecycle action consumers disabled. No checkout, public-site, provider,
Student Roster, Heartbeat, waitlist, communication, refund, certificate,
payment, minion/runtime, or authority-cutover mutation occurred in this
production step.

The aggregate, content-minimized machine receipt is
`docs/programs/company-os/evidence/NC-20260906-002-academy-capacity-production-shadow.json`.
