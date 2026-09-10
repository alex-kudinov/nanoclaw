# R3 replay-correction review

## Verdict: NO MATERIAL FINDINGS

## Trace

Retry of identical receipt B after its exception is resolved:

- `old`/`priorRef` still resolve to the original order (A's admission evidence), so the
  admission-duplicate check at line 68 correctly stays false — B never impersonates A's
  admission.
- The attestation check (`acceptedReceiptSha256`/`effectiveAt`) runs first, unchanged, so
  an unattested replay still throws `source_unverified` regardless of prior exception
  state — the new return cannot be used to bypass attestation.
- `exceptionKeyFor('order', boundKey, 'duplicate_source_conflict')` reproduces the exact
  key created for B the first time, because `fingerprint` is a pure hash of B's normalized
  content and `boundKey` resolves identically via the same `priorRef` lookup. Lookup now
  matches open OR terminal state, so the resolved (terminal) exception is found and the
  new early return fires: `{ ...original, orderKey: boundKey, duplicate: true }`.
- That return spreads `original` verbatim — no mutation of `enrollment.exceptions`,
  `.history`, or `.projections`. The already-resolved exception and its history stay
  exactly as `resolveEnrollmentException` left them, and the later authorized projection
  (`projection:authorized-later`, queued via an unrelated command after resolution) is
  never touched, so it stays `queued`. This matches the regression's two assertions.
- A materially different conflicting receipt C changes `fingerprint`, so its
  `exceptionKeyFor` result misses the exceptions map, the early return does not fire, and
  execution falls through to `hold()` + the projection-freeze loop as before — fresh
  conflicts are still fully handled, not swallowed by the new check.
- Single shared `exceptionKeyFor` (used by both `hold` and the new lookup) removes the
  prior duplication risk of two independently-computed key formulas drifting apart.

## Conclusion

The early return closes the reproduced defect (stale conflict resolution no longer
refreezes fresh, unrelated projections) without weakening the attestation gate, without
opening a bypass for genuinely new conflicting receipts, and without mutating any
already-recorded decision or its visibility in the returned aggregate.
