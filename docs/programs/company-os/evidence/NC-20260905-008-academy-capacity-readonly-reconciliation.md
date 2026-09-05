# NC-20260905-008 — Academy capacity read-only reconciliation

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Work item: `work:academy-capacity-readonly-reconciliation`

## Authority and boundary

The owner said to continue after the synthetic capacity proof. The accepted
decision bounded this reconciliation to the September 2026 MCS Thursday and
Friday delivery blocks, their January 2027 destinations, and the September 7
ACC Module 1 start shared by `acc-module-1`, `acc-full`, and `acc-pcc-full`.
The source window is 2026-01-01 through 2026-09-05.

Exact identity was read transiently only to check assignments, refunds,
duplicates, and the owner-named deferral. The durable JSON evidence contains
only aggregate counts, source hashes, public product keys, and owned
exceptions. No Student Roster, Stripe, Plutio, Heartbeat, calendar, website,
database, runtime, waitlist, or customer state was changed.

## Current reconciliation

| Delivery block | Assignment evidence | Payment/refund evidence | Capacity result | Public state | Disposition |
| --- | --- | --- | --- | --- | --- |
| MCS 2026-09-24 Thursday | 6 rows; 1 refunded; 5 active | 6 successful identities, 1 fully refunded; historical transfer delta reconciles to 5 | 5/12; 7 available | Open | Count matched; deferral origin remains disputed |
| MCS 2026-09-25 Friday | 13 active, non-refunded rows | 10 successful identities, no full refund, 1 failed; 3 may be non-Stripe or unresolved funding | 13/12; over by 1; owner hypothesis is 12 | Sold out with dated waitlist | Needs resolution; remain fail-closed |
| MCS 2027-01-07 Thursday | 1 active row | No destination-attributed Stripe payment; paired transfer accounting says 1 | 1/12; 11 available | Open | Assignment is current; origin needs evidence |
| MCS 2027-01-08 Friday | 0 active rows | 0 matching payments | 0/12; 12 available | Open | Destination alternative retained while origin is unresolved |
| ACC Module 1 2026-09-07 | 8 active rows: 2 Module 1 and 6 collapsed Full Program rows | 2 exact cohort-bound website payments: 1 `acc-module-1`, 1 `acc-full`, 0 `acc-pcc-full`; no refunds | Numeric capacity unknown; availability cannot be calculated | Sold out with dated waitlist by owner decision | Policy-only, fail-closed; needs capacity and source reconciliation |

The current public pages independently show September 7 ACC as sold out with
one dated waitlist across the three sharing offers, September 25 MCS Friday as
sold out with its dated waitlist, and September 24 MCS Thursday as available.

## Source-specific findings

- Student Roster remains the present assignment authority. Its MCS scoped row
  set and ACC September row set are bound by SHA-256 in the JSON evidence.
- The owner-named deferral subject is currently assigned to January 2027
  Thursday. The earlier Tandemweb transfer record says the origin was September
  Thursday, but the owner's Friday count context associated the deferral with
  Friday. The current roster no longer proves origin, and Friday still contains
  13 other active rows. No second row may be changed from this evidence.
- The Tandemweb reconciler currently substitutes the owner count of 12 for the
  Friday roster count of 13. That preserves sold-out safety but hides an
  over-capacity assignment. Company OS must use the roster-derived floor and
  record owner assertions as variance evidence rather than a lower override.
- Product Map correctly routes the Professional Coach Program to ACC, PCC, and
  ACTC Full Program columns, but the ACC column cannot distinguish its
  September seats from ordinary `acc-full` seats.
- A bounded Plutio title/amount search found two possible paid $3,999 ACC
  invoices. They are not participant-and-cohort bound, so this report counts
  neither as a seat or exact funding resolution.
- Heartbeat currently has 24 MCS full-group members, 22 ACC full-group members,
  and 3 combined-program group members. These are program-wide access groups,
  not dated cohort counters, and the report records only privacy-minimized
  membership hashes.

## Durable exceptions

Seven owned exceptions preserve the unresolved work:

1. Friday owner-versus-roster count conflict.
2. Deferral origin/weekday conflict.
3. Tandemweb owner override masking roster over-capacity.
4. Three MCS Friday assignments without exact cohort-bound funding
   classification.
5. Missing numeric ACC September 7 capacity.
6. Collapsed ACC full-program offer attribution.
7. Six ACC assignments without exact cohort-bound funding classification.

The machine-readable evidence names an owner and exact next evidence for each
exception. None authorizes a source repair.

## Artifact contract

- JSON evidence:
  `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json`
- Reusable schema:
  `facts/catalogs/academy-capacity-reconciliation-evidence-v1.schema.json`
- Deterministic validator:
  `scripts/validate-academy-capacity-reconciliation.mjs`

The validator rejects PII and raw Stripe IDs, owner-count understatements,
unowned exception references, population drift, invalid seat arithmetic,
unknown-capacity availability claims, missing shared offers, and any attempt to
treat Heartbeat as capacity authority.

## Independent review

Claude Sonnet/high R1 found two material completeness defects: the three MCS
Friday assignments without exact Stripe funding lacked their own owned
exception, and the JSON Schema was documented but not actually applied. The
implementation now records the seventh funding exception, requires the exact
block-specific exception for every funding gap, and evaluates every JSON Schema
keyword used by the contract before the domain checks. Bounded R2 returned
`NO MATERIAL FINDINGS`.

- R1: 5 model calls; 79,205 cache-create; 201,163 cache-read; 22,543 output;
  87,771 maximum context tokens.
- R2: 6 model calls; 58,839 cache-create; 248,341 cache-read; 10,083 output;
  67,405 maximum context tokens.

## Verification

- Evidence validator: pass; five delivery blocks, seven owned exceptions,
  aggregate/hash-only classification.
- Focused capacity/reconciliation tests: 20/20.
- Pinned Node typecheck/build, formatting, documentation continuity/capability,
  JSON parsing, privacy scan, and diff check: pass.
- Full root: 3,538 passed / 32 skipped / two exact predecessor failures: the
  CNPC wrapper-literal assertion and date-sensitive Trafft freshness fixture.
- External observation: read-only only; no operational mutation or deployment.

## Next gate

The read-only report is sufficient to prevent blind population of migration
143. Resolving the exceptions requires a separate source-write decision: name
the authoritative evidence for the extra Friday assignment and the deferral's
origin/destination, record ACC's numeric capacity, bind six ACC assignments to
their exact source offers and funding evidence, and correct the Tandemweb
reconciler before any database population, minion, checkout cutover, waitlist
offer, or authority transition.
