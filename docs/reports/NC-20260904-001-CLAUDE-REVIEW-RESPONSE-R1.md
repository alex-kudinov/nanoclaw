# NC-20260904-001 bounded implementation review — response R1

## Finding 1 (material): legacy cohort text-matching is not scoped to the MCS

practicum product, unlike the structured-metadata path

`resolveCohortLabel` gates only its structured-metadata branch on
`cohort_program === 'mcs-practicum'`
(`tools/contador/lib/cohort.cjs:65-69`). Its legacy fallback has no equivalent
product gate:

```
tools/contador/lib/cohort.cjs:98-107
  const sources = [
    chargeMetadata?.cohort || '',
    chargeMetadata?.product || '',
    chargeDescription,
    productName,
  ];
  for (const source of sources) {
    const label = labelFromText(String(source || ''), when);
    if (label) return label;
  }
```

`labelFromText` returns a label whenever the given text contains any
recognized month token and any recognized weekday token anywhere in the
string (`cohort.cjs:52-62`), regardless of what product the payment is for.

`process-payment.cjs` calls this resolver unconditionally for **every**
payment, not only MCS purchases:

```
tools/contador/process-payment.cjs:840-845
  const cohort = resolveCohortLabel({
    chargeMetadata,
    chargeDescription,
    productName,
    purchasedAt: txnDateObj,
  });
```

The resulting `cohort` value is then used two ways, both unconditioned on
product identity:

- Sheets: `fillCohortCell(tab, headerRow, writtenRow, cohort)` is called for
  every matched roster tab (`process-payment.cjs:1071-1076`). If `cohort` is
  non-blank and the tab's header row has no `Cohort` column, `fillCohortCell`
  throws (`process-payment.cjs:476-478`); the per-tab `catch` records an
  `ERROR` and that target is excluded from `verifiedTargets`
  (`process-payment.cjs:1101-1103`), which flips `rosterMode` from
  `mapped_verified` to `write_failed` (`process-payment.cjs:1105-1108`) and
  therefore the whole fulfillment state from `complete` to `write_failed`
  (`derivePaymentFulfillmentOutcome`, `process-payment.cjs:744-761`). If the
  tab does have a `Cohort` column, an incorrect label is written into it
  instead (silently, since the blank-check gate at `cohort.cjs`-driven
  `fillCohortCell` only prevents overwriting a non-blank cell, not a wrong
  first write).
- Postgres: the same ungated value is passed as `:'cohort'`
  (`process-payment.cjs:1198`) and persisted via
  `COALESCE(NULLIF(BTRIM(payments.cohort), ''), EXCLUDED.cohort)`
  (`process-payment.cjs:1227`), so any non-MCS payment whose
  `chargeDescription`/`productName`/metadata happens to contain a
  recognizable month name and weekday name anywhere in the text gets that
  text written into `public.payments.cohort`.

No test in `cohort.test.ts` or `process-payment.test.ts` exercises a non-MCS
product whose free text coincidentally contains a month+weekday pair — the
existing "returns blank for unrelated product text" case
(`cohort.test.ts:85-90`) uses an MCS product name that simply lacks those
tokens, not an unrelated product that has them.

**Consequence:** this regresses intended behavior #6 ("existing ... durable
case semantics must not regress") for any non-MCS payment whose description
text happens to satisfy the month+weekday pattern — the case can be pushed
from `complete` to `write_failed` for a fully processed payment (a false
fulfillment failure), or an unrelated roster/Postgres row can receive a
fabricated cohort value.

**Correction:** apply the same product gate to the legacy fallback that
already exists for the structured path — e.g. only run the `sources` loop in
`resolveCohortLabel` when `chargeMetadata.cohort_program === 'mcs-practicum'`
_or_ the resolved product identity (canonical slug/product name) is a known
MCS practicum product; otherwise return `''` before attempting any free-text
match. This keeps requirement #2 (legacy slug/description/product-name forms
supported) working for actual MCS payments while eliminating the current
unscoped substring match against arbitrary payment text.
