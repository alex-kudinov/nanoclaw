# NC-20260916-001 bounded correctness review response

## Defect: Payment Log refund status can regress from `refunded` to `partially refunded` on out-of-order delivery

**Location:** `tools/contador/process-commerce-payment.cjs`, `recordRefundPaymentLog` (lines 136–152), called from `main()` (line 303).

**Evidence:**

```js
const status = refundPaymentLogStatus(refund);
await update(PAYMENTS_ID, `Payment Log!K${sheetRow}`, [[status]]);
```

`refundPaymentLogStatus` (lines 131–134) derives status solely from the single incoming
refund's self-reported `remainingPaidCents`:

```js
return refund.remainingPaidCents === 0 ? 'refunded' : 'partially refunded';
```

There is no read of the current `Payment Log!K` value and no comparison against any
previously recorded refund for the same payment before the cell is overwritten. Each
refund is idempotent with respect to *itself* (`refund_psp_reference` is the Postgres
primary key, and the `ON CONFLICT ... WHERE` clause in `recordPostgresRefund` correctly
rejects a retry that changes that refund's own facts), but nothing enforces ordering
*across* two different partial refunds against the same original payment.

**Failure scenario:** an order receives two partial refunds — refund A
(`cumulativeRefundedCents = 9900`, `remainingPaidCents = 20000` → `partially refunded`)
and refund B (`cumulativeRefundedCents = 29900`, `remainingPaidCents = 0` →
`refunded`). If B's webhook is processed before A's (out-of-order delivery or a retried
A arriving after B has already landed — both are ordinary webhook/retry conditions, not
attacker-controlled), the sheet correctly shows `refunded` after B, then is
unconditionally overwritten back to `partially refunded` when A is processed. The ledger
now asserts the order still owes a refund it has already fully received — a false
financial fact — with no further event to correct it, since A was the last legitimate
notification for that pair.

This is new to the refund branch: `business_v2.contador_adyen_refunds` itself is
unaffected (each refund keeps its own immutable row, so no financial fact is lost or
duplicated in Postgres), and Student Roster is correctly untouched by refund policy. The
regression is confined to the single mutable `Payment Log!K` status cell this change
introduces.

**Current exposure:** per `NC-20260916-001-S2-RECONCILIATION.md`, this release replays
exactly one preserved internal Adyen TEST refund job and prohibits production refund
creation, so the two-refund race cannot occur under this walking skeleton. The defect is
latent in code that will handle real multi-refund traffic once that restriction is
lifted.

**Smallest correction:** read the existing status before writing, and never let a write
of `partially refunded` overwrite an existing `refunded` cell (a full refund is a
terminal state and cannot be logically un-refunded by an older, less-complete
notification):

```js
const sheetRow = matches[0].index + 1;
const status = refundPaymentLogStatus(refund);
const currentStatus = String(
  (await get(PAYMENTS_ID, `Payment Log!K${sheetRow}`)).values?.[0]?.[0] || '',
).trim();
const finalStatus = currentStatus === 'refunded' ? currentStatus : status;
if (finalStatus !== currentStatus) {
  await update(PAYMENTS_ID, `Payment Log!K${sheetRow}`, [[finalStatus]]);
}
const identity = (await get(PAYMENTS_ID, `Payment Log!J${sheetRow}:K${sheetRow}`)).values?.[0] || [];
const provider = String((await get(PAYMENTS_ID, `Payment Log!P${sheetRow}`)).values?.[0]?.[0] || '');
if (identity[0] !== refund.paymentPspReference || identity[1] !== finalStatus || provider !== 'Adyen') fail('refund payment log readback mismatch');
return { verified: true, row: sheetRow, status: finalStatus };
```

This keeps every other verified behavior in scope intact: exact signed refund
correlation, stable single-refund retry identity, PostgreSQL idempotency/mismatch
handling (`recordPostgresRefund`'s `ON CONFLICT ... WHERE` guard correctly no-ops and
surfaces `postgresVerified: false` on any factual mismatch), the additive/guarded-rollback
migration pair (170 is `CREATE TABLE IF NOT EXISTS`-safe to reapply; the rollback refuses
to run while any row exists and contains no `DELETE`), no roster/access mutation on
refund, and unchanged AUTHORISATION validation in `prepareCommerceBookkeeperEnvelope`.
