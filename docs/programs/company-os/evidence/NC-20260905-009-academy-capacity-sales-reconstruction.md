# NC-20260905-009 — September ACC shared-pool sales reconstruction

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Work item: `work:academy-capacity-sales-evidence-reconstruction`

## Correction

This evidence corrects, rather than rewrites,
`NC-20260905-008-academy-capacity-readonly-reconciliation`. That report counted
only the eight ACC rows already labeled `2026-09`. The owner clarified that the
September 7 shared classroom also contains Module 1, $3,999 ACC Full, and
$7,499 Professional Coach enrollments sold through checks and email. A
Professional Coach participant consumes one shared ACC seat even though the
entitlement should project to ACC, PCC, and ACTC.

The owner also clarified that the MCS deferral was probably from Friday and was
negotiated into January. The current January Thursday assignment is therefore
left in place. Historical Friday origin remains probable rather than proven;
no roster row was changed.

## Unique-seat reconstruction

The prior labeled ACC cohort ended with enrollment dates through April 3. One
unlabeled row appears on May 27. A dated enrollment email on June 3 says the
prior cohort started that day and the next entry was September. Applying that
operational boundary to the current roster gives:

| Evidence | Unique participants |
| --- | ---: |
| Explicit `2026-09` ACC rows | 8 |
| Unlabeled ACC rows dated June 3–September 5 | 13 |
| Operational September 7 shared-pool count | **21** |
| If the unresolved May 27 row also belongs to September | **22** |

The 21 operational seats are 10 Module 1 rows and 11 Full Program rows. The
roster-derived participant set is deduplicated by normalized participant email;
PCC, ACTC, or Heartbeat projections never add another seat.

The public state remains `sold_out`. Numeric capacity is still absent, so the
evidence proves the 21-seat population but cannot yet state by how many seats
the cohort is oversold.

## Offer and funding reconstruction

Payment Log has at least one row for all 21 candidate participant emails, but
only 13 bind to an exact current Product Map offer:

| Exact offer | Unique participants |
| --- | ---: |
| `acc-module-1` | 8 |
| `acc-full` | 5 |
| `acc-pcc-full` | 0 |
| No exact Product Map offer binding | 8 |

Direct cohort-bound Stripe evidence remains only one Module 1 and one ACC Full
payment. Read-only Plutio and enrollment-email evidence shows paid ACC
invoices, a two-seat September invoice, purchase-order enrollment, and $7,499
sales conversations, but title, amount, payer, or conversation alone cannot
identify the participant and offer. Those records are not converted into seats
or exact offer bindings.

## Missing combined-program projections

None of the 21 candidate participants currently intersects the PCC roster,
ACTC roster, or Professional Coach Heartbeat group. Ten intersect the ACC Full
Heartbeat group. Therefore the $7,499 subgroup is not duplicated across tabs;
it is presently unidentifiable, and any such participants are missing expected
PCC/ACTC/Heartbeat projections.

This distinction is load-bearing:

- capacity counts one unique participant in the September 7 ACC classroom;
- offer reconciliation must still distinguish $399, $3,999, and $7,499;
- fulfillment must separately project an exact $7,499 participant into ACC,
  PCC, ACTC, and the combined access group;
- missing projections are exceptions, never evidence that the participant did
  not buy the combined program.

## Held exceptions

Six privacy-minimized exceptions block source repair or production population:

1. the May 27 row that makes the exact boundary 21 versus 22;
2. missing numeric September 7 capacity;
3. unresolved split of 11 Full Program rows between $3,999 and $7,499;
4. missing PCC/ACTC/Heartbeat projections for any exact $7,499 students;
5. eight participants without exact Product Map funding classification;
6. probable Friday MCS origin that remains unproven for historical import.

Each exception has an owner and exact next evidence in the machine-readable
correction. None authorizes a provider or roster write.

## Privacy and boundary

Exact roster, Payment Log, Heartbeat, Plutio, and email identity was joined only
transiently. The correction stores aggregate counts, public offer keys, and
SHA-256 rowset receipts. It contains no names, emails, raw payment identifiers,
or email contents.

No Student Roster, Payment Log, Stripe, Plutio, Heartbeat, Gmail, website,
database, cohort, waitlist, runtime, minion, migration, deployment,
communication, or authority state changed.

## Independent review

Claude Sonnet/high returned `NO MATERIAL FINDINGS` after 13 load-bearing
checks covering correction lineage, 8+13 and 8+14 arithmetic, cross-report hash
identity, single-seat projection rules, unknown capacity and Professional Coach
count, payer/participant separation, January settlement, exception ownership,
privacy, write boundary, export parity, and test count.

- 6 model calls; 86,088 cache-create; 255,925 cache-read; 22,410 output;
  86,090 maximum context tokens.
- One non-material observation notes that the ACC Full Heartbeat intersection
  remains descriptive only. It does not feed a seat or offer count and is not
  promoted by this correction.

## Verification

- Combined base/correction validator: pass; two reports, 21 correction seats,
  six correction exceptions, aggregate/hash-only.
- Focused reconstruction tests: 13/13.
- Combined focused capacity/reconciliation tests: 26/26.
- Pinned Node typecheck/build, JSON/schema formatting, documentation
  continuity/capability, privacy and diff checks: pass.
- Full root: 3,544 passed / 32 skipped / two exact predecessor failures: the
  CNPC wrapper-literal assertion and date-sensitive Trafft freshness fixture.
- Exact commit, push, and program state are recorded at closure.

## Next gate

The source-write resolution gate must first determine whether the May 27 row is
June or September, record the numeric capacity, bind all 11 Full Program rows
to `$3,999` or `$7,499`, bind eight funding gaps to exact evidence, and plan
missing combined-program projections. Only then can migration 143 be populated
or the operational sources be corrected with exact readback.
