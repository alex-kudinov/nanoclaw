# NC-20260905-009 bounded ACC sales reconstruction review R1

## Objective

Review the correction to NC-008's labeled-only ACC count. Determine whether the
new evidence truthfully reconstructs 21 operational September 7 seats without
double-counting Professional Coach projections or inventing the unresolved
$3,999/$7,499 split.

## Authority and boundary

- The owner says the shared classroom includes ACC Module 1, $3,999 ACC Full,
  and $7,499 Professional Coach sales, including checks and email, and expects
  approximately 21 unique seats.
- A Professional Coach participant consumes one September 7 ACC seat even
  though fulfillment should also project to PCC and ACTC.
- The owner says the MCS deferral probably originated in Friday and must remain
  settled in January. The current January Thursday assignment is accepted; the
  historical origin remains probable, not proven.
- Exact identity was used transiently only for deduplication and intersections.
  Persisted evidence may contain only aggregates, hashes, public offer keys,
  correction lineage, and owned exceptions.
- Do not inspect credentials, `.env`, auth stores, raw provider rows, student
  identities, email contents, or unrelated files. Do not modify source. Write
  only the response file named below.
- No provider, roster, payment, email, website, database, cohort, runtime,
  minion, migration, deployment, communication, or authority write is allowed.

## Allowed files

1. `docs/programs/company-os/evidence/NC-20260905-009-academy-capacity-sales-reconstruction.json`
2. `docs/programs/company-os/evidence/NC-20260905-009-academy-capacity-sales-reconstruction.md`
3. `facts/catalogs/academy-capacity-reconciliation-correction-v1.schema.json`
4. `scripts/validate-academy-capacity-reconciliation.mjs`
5. `scripts/validate-academy-capacity-reconciliation.d.mts`
6. `src/academy-capacity-reconciliation.test.ts`
7. `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json`

## Supplied read-only observations

- ACC has 8 active rows explicitly labeled `2026-09`.
- It has 13 additional active, cohort-blank Module 1/Full Program rows dated
  June 3 through September 5. Their participant identities are unique from the
  explicit 8 and from each other.
- The previous labeled cohort's latest enrollment date is April 3. One earlier
  cohort-blank candidate exists on May 27. A June 3 enrollment email says the
  prior cohort started that day and the next entry was September.
- Therefore the owner-backed operational boundary is 8 + 13 = 21; including
  the unresolved May 27 row gives an explicit upper boundary of 22.
- The 21 rows comprise 10 Module 1 and 11 Full Program rows.
- Payment Log has rows for all 21 candidate emails. Exact Product Map matching
  classifies 8 as `acc-module-1`, 5 as `acc-full`, 0 as `acc-pcc-full`, leaving
  8 without an exact offer classification. Four of those have other or
  ambiguous payment rows.
- Direct September 7 Stripe metadata identifies only 1 Module 1 and 1 ACC Full
  payment; neither is refunded.
- None of the 21 candidate participants intersects the PCC roster, ACTC roster,
  or Professional Coach Heartbeat group. Ten intersect the ACC Full group.
- Read-only Plutio/Gmail evidence shows ACC invoices, a two-seat September
  invoice, purchase-order enrollment, and $7,499 sales conversations, but none
  is persisted or counted without exact participant/offer binding.
- The current public September 7 state remains sold out. Numeric capacity is
  not recorded.

## Claims to challenge

1. The report correctly supersedes rather than rewrites NC-008 and treats 21 as
   the operational count with a held 21-versus-22 boundary, not an unsupported
   exact historical truth.
2. Unique participant identity, not roster-tab or entitlement-projection rows,
   defines one shared ACC seat.
3. The current evidence supports 21 total seats and the 10/11 roster-route
   split, but does not support an `acc-pcc-full` count. Missing PCC/ACTC/group
   projections are fulfillment exceptions, not seats to add or proof that no
   $7,499 sale occurred.
4. Payment, invoice, payer, and email evidence remain separate from participant
   assignment and exact offer authority.
5. The MCS correction leaves the January assignment unchanged and labels Friday
   origin only as owner recollection.
6. The correction schema, combined validator, and tests fail closed on
   arithmetic, double counting, invented capacity/offer counts, missing
   exceptions, privacy, and write-boundary drift.

## Mechanical evidence

- Combined validator: 2 reports, correction 21 seats, 6 exceptions,
  aggregate/hash-only — pass.
- Focused reconciliation tests: 13/13.
- Pinned Node typecheck and diff check: pass.

## Response

Write only
`docs/reports/NC-20260905-009-CLAUDE-SALES-RECONSTRUCTION-RESPONSE-R1.md`.

Report material findings only, ordered by consequence with exact references
and the smallest safe correction. If none remain, say `NO MATERIAL FINDINGS`
and identify the load-bearing checks performed.
