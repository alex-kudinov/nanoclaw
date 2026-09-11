# Response: shared MCS payment domain, first unwired implementation slice

Scope: read only the three files named in REQUEST-R1.md. No shell, MCP, web,
credentials, other source or history consulted. Source not modified.

## Verdict: one material defect found (not ACCEPTED as-is)

Everything else in the module is within invariant, given the documented,
intentionally-deferred boundaries (auth, CAS, correlation, exception
persistence, retry-horizon-vs-quote-expiry policy). One gap in
`projectPaymentEvidence` lets financially meaningful evidence (a refund) pass
through as merely "pending" when it is actually impossible and should be an
owned conflict.

## Defect: refund evidence after a refused authorization is not treated as conflicting when no capture ever exists

**File/function:** `src/payment-domain.ts`, `projectPaymentEvidence`, lines 424-425:

```ts
if (authorizationFact?.success === false && captured > 0n)
  exceptions.add('capture_after_refusal');
```

This only guards the capture side of the invariant the docs state as "a
refusal plus successful capture conflicts" (PAYMENT-DOMAIN.md line 35). It
does not guard the symmetric refund case. A refund fact can never
legitimately exist against a refused authorization with zero captures (no
provider ever issues a REFUND for money that was never captured), but the
current logic accepts it as valid, non-conflicting evidence sitting in
`evidenceState: 'awaiting_prior_evidence'` — implying a capture is merely
late and will still arrive, which is false once the authorization is
terminally refused.

**Reproducer** (using the file's own test fixtures/helpers):

```ts
project([fact({ success: false }), refund()])
// actual:
// {
//   authorization: 'refused',
//   capturedAmount: 0,
//   refundedAmount: 29900,
//   evidenceState: 'awaiting_prior_evidence',
//   exceptions: [],
//   settlement: 'unproven',
//   fulfillment: 'not_evaluated',
// }
```

`refundedAmount: 29900` is reported on a refused authorization with no
capture ever recorded, and no exception is raised. Compare to the existing,
correctly-guarded sibling case one test above it:

```ts
project([fact({ success: false }), capture()]).exceptions
// => ['capture_after_refusal']   (correct — this path IS guarded)
```

The refund path is the same invariant, unguarded.

**Smallest correction:**

```ts
if (authorizationFact?.success === false && (captured > 0n || refunded > 0n))
  exceptions.add('capture_after_refusal');
```

**Test quality gap (same root cause):** the suite has "holds a capture after
refusal as an owned conflict" (line 460) but no symmetric refund case. Add:

```ts
it('holds a refund after refusal as an owned conflict', () => {
  expect(project([fact({ success: false }), refund()]).exceptions).toEqual([
    'capture_after_refusal',
  ]);
});
```

## Areas checked, no defect found

- **Money/arithmetic:** `validatePaymentQuote` — subtraction identity, discount
  policy requirement, safe-integer bounds (including the `MAX_SAFE_INTEGER + 1`
  boundary, correctly rejected by `.max()` after passing `.int()`), NaN/Infinity
  rejection. Correct.
- **Fingerprints:** `paymentQuoteFingerprint`/`hash` operate on the
  schema-parsed (not raw) value via `canonical()`, so key order can't produce
  a different digest and unknown/stripped fields can't slip through
  (`.strict()` schemas). Attempt/operation fingerprint chaining
  (`quoteFingerprint`, `attemptFingerprint`) correctly forces re-validation of
  the embedded object rather than trusting a caller-supplied hash.
- **Scope pinning:** `assertPaymentAttemptReuse` and
  `decidePaymentOperationRecovery` both reject every scope dimension change
  (provider/environment/company/merchant/store/endpointRegion) and quote
  substitution. Correct and fully tested.
- **Retry decisions:** `decidePaymentOperationRecovery` — expired lease before
  `retryUntil` returns `retry_same_operation` not failure (matches "lease
  expiry means UNKNOWN, not failure"); `retryUntil` is never extended by a
  repeated ambiguous result (`recordPaymentOperationResult` copies the
  original window); terminal states (`session_available`,
  `permanent_failure`) reject contradictory re-assertion via
  `operation_result_conflict`/`session_expiry_conflict`; session reuse uses
  strict `<` against provider-reported expiry (expiry instant itself forces
  `reconcile`). Correct. (`retryUntil` may legitimately outlive
  `attempt.quote.expiresAt` — this is the documented adapter responsibility,
  not a defect here, since the retried request is the exact pinned payload
  from before expiry, not a new priced request.)
- **Duplicate/conflict/out-of-order evidence, aggregate captures/refunds:**
  delivery-ID and operation-key (`kind:operationReference`) dedup are
  independent and order-independent; overflow-safe via `BigInt` accumulation
  (tested at `Number.MAX_SAFE_INTEGER`); permutation determinism verified
  structurally (72 four-event permutations across three fixture scenarios,
  consistent with the reported count) and holds under manual review of the
  reduction logic (conflict short-circuits before any order-dependent
  aggregation runs). No mutation of caller-supplied evidence or attempt data.
- **Attempt/quote lifecycle:** stale/not-yet-valid quote rejection at both
  attempt creation and dispatch time, tamper detection via fingerprint
  mismatch, free-order routing via a distinct admission error rather than a
  fake paid attempt — all correct.

No other accepted-valid-input-that-violates-invariant or
rejected-valid-input cases were found. This does not redesign the plan,
does not evaluate provider/adapter/store concerns explicitly deferred by the
request packet, and does not represent this slice as more than an unwired
contract/decision module.
