# NC-20260906-001 — Academy capacity source resolution

Date: 2026-09-06  
Program: `program:company-os`  
Work item: `work:academy-capacity-reconciliation-resolution`

## Outcome

Rita's transfer is settled. The Student Roster already placed the owner-named
deferral in January 2027 Thursday. Heartbeat's stale September 2026 cohort
membership was removed with exact group/user preconditions and read back
absent; the user and base MCS access remain. Tandemweb now records the
owner-confirmed seat origin as September Friday, the historical Stripe payment
source as September Thursday, and the destination as January Thursday. These
are separate facts; her assignment origin and destination are no longer
reconciliation questions.

The September 7 ACC shared delivery block is now explicit in the Student
Roster: 21 active assignments, capacity 12, zero availability, oversold by 9.
The previously held May 27 row is explicitly assigned to the prior June cohort,
and there are no post-boundary unlabeled ACC rows.

## Offer, funding, and projection result

The 21 assignments split into 10 Module 1 routes and 11 Full Program routes.
Current exact payment and paid-invoice evidence resolves the offer count as:

| Offer | Exact paid seats |
| --- | ---: |
| ACC Module 1 | 9 |
| ACC Full Program (`$3,999`) | 11 |
| Professional Coach (`$7,499`) | 0 |
| Assigned seat without an exact matching live offer | 1 |

Two generic invoice descriptions in the Payment Log were corrected to the
canonical ACC Full product after exact paid Plutio invoice readback. Four
additional ACC Full participants bind to three paid Plutio invoices, including
one exact two-seat corporate invoice. No Plutio record was changed.

All 11 ACC Full participants have current Full Course access in Heartbeat: ten
exact-email matches and one exact-name/company alias match. None belongs to the
Professional Coach access group. Therefore this cohort requires no PCC, ACTC,
or Professional Coach membership repair and those projections must not be
invented.

## Mutations and verification

- Student Roster: 13 guarded requests; 11 cells updated and verified, while two
  precondition conflicts were immediately read back already at the desired
  value. Final ACC readback is 21 September rows, one June boundary row, and
  zero unlabeled post-boundary rows.
- Payment Log: two guarded Product cells updated and verified by exact Stripe
  ID and expected prior value for ACC Full. Two more were similarly corrected
  to MCS Practicum after exact paid invoice readback. The three non-checkout
  Friday funding rows now reconcile the 13 assignments to 13 funded seats.
- Heartbeat: one exact September cohort membership removed and verified absent;
  the user remains with base MCS access.
- Tandemweb: pushed `56bb8f6ee` separates assignment origin from payment
  source, validates the paired transfer, and accepts the three manual/legacy
  funding seats only with zero seat delta, exact count, source receipt, and
  64-character evidence hash. Thursday is 5/matched/open, Friday is
  13/funding-matched but owner-variance `needs_review`/sold out, and January
  Thursday is 1/matched/open.
- Toolbox: commit `8d996dd` contains the guarded removal operation. Full tests
  pass 65/65 plus focused Heartbeat tests. Claude Sonnet/high's material
  readback-refusal test finding and minor argument-test finding were corrected.

The machine-readable receipt contains only aggregate counts and hashes:
`docs/programs/company-os/evidence/NC-20260906-001-academy-capacity-source-resolution.json`.

## Remaining exceptions

Three exceptions remain, none involving Rita, MCS funding, or the ACC offer
split:

1. The current MCS roster has 13 Friday rows excluding Rita, while the earlier
   owner count was 12. That is a separate current-roster variance.
2. One ACC Module 1 assignment has no exact matching live-offer funding source.
3. One ACC Full participant uses different roster and Heartbeat emails; an
   explicit alias is required before database population.

No refund, customer communication, certificate, public deployment, production
database population, runtime/minion activation, migration, or authority
cutover occurred.
