# Response: correction review — refused authorization plus successful refund

Scope: `RESPONSE-R1.md`, `payment-domain.ts` (`projectPaymentEvidence`), and the
`scoped immutable financial evidence` test suite only. No shell, MCP, web,
secrets, other source, or history consulted. Source not modified.

## Verdict: ACCEPTED, no remaining material findings within this correction scope

## What changed and why it closes the R1 gap

`projectPaymentEvidence` now carries a second guard (lines 426-427) alongside
the existing `capture_after_refusal` check (lines 424-425):

```ts
if (authorizationFact?.success === false && captured > 0n)
  exceptions.add('capture_after_refusal');
if (authorizationFact?.success === false && refunded > 0n)
  exceptions.add('refund_after_refusal');
```

`refunded` only accumulates from facts where `fact.success` is `true` (line
418), so a *failed* refund against a refused authorization contributes `0n`
and never trips this rule — matching "a failed refund does not imply money
moved."

R1's suggested minimal fix folded the refund case into `capture_after_refusal`;
this correction instead uses a distinct `refund_after_refusal` code. That's a
different implementation choice, not a functional gap — it's strictly more
informative (a refused-authorization-with-both-capture-and-refund fact set now
reports both codes) and still routes through the same `conflictProjection()`
path (suppressed totals, `authorization: 'conflict'`, `evidenceState:
'conflict'`, sorted exception array). Confirmed by reading the conflict-path
code directly, not just the new tests.

## Verified against the code

- **`refund({ amount: 1000 })` after `fact({ success: false })`, both
  orders:** authorization refused → `refunded` reaches `1000n` → new guard
  fires → `exceptions.size > 0` → early return via `conflictProjection()` →
  `capturedAmount: 0`, `refundedAmount: 0`, `exceptions: ['refund_after_refusal']`.
  Matches the test at line 465.
- **`refund({ success: false })` after `fact({ success: false })`:**
  `refunded` stays `0n` (failed refund not accumulated) → neither refusal
  guard fires → `authorization: 'refused'`, `evidenceState: 'consistent'`,
  `exceptions: []`. Matches the same test's third assertion.
- **No regression on prior sibling behavior:** `capture_after_refusal` guard
  is untouched; authorized-with-refund-only cases (no refusal) still fall
  through to the pre-existing `awaiting_prior_evidence` path via
  `refunded > captured`, unaffected by the new refusal-only guard.
- **Permutation/order independence unaffected:** the new checks read only
  from the already-deduplicated `operations` map and run after the existing
  exception short-circuit, so they inherit the same order-independence
  guarantees as `capture_after_refusal`.
- **No mutation, no new schema/contract surface:** the fix is confined to two
  added boolean checks; no change to `factSchema`, evidence accumulation, or
  freezing behavior.

## Out of scope for this correction review

`PAYMENT-DOMAIN.md` and the full test/CI run are not in this request's
allowed paths, so the docs-updated and 51/51 claims are taken as given, not
independently re-verified here — that's consistent with R2's narrow scope
(check the load-bearing R1 correction only, not a new broad review).
