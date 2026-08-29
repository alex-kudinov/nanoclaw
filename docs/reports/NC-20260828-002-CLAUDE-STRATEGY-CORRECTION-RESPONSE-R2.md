# NC-20260828-002 — canonical Sertifier campaign strategy correction review (response R2)

## Verdict

**Closed.** All eight R1 corrections are addressed in
`docs/SERTIFIER-CAMPAIGN-STRATEGY.md` with specific, deterministic language —
no residual ambiguity that would block implementation. The strategy is safe
to implement and safe to create empty canonical campaigns against.

## Correction-by-correction closure

1. **CLAUDE.md Rule 2/4/5 reconciliation (blocking).** Section 6 requires
   replacing the per-issuance-campaign rule with the canonical reuse
   contract and stating that campaign IDs load automatically with no
   operator-supplied override in Gru-authored scripts. Section 4 adds that
   any operator override must still pass full component/privacy/status
   validation. Closed as a specified prerequisite of Section 8 step 4
   (prompt/tool/config deploy) — it does not block step 1 (empty campaign
   creation), which has no prompt dependency.
2. **Explicit-send vs. bare-`send` precedence (blocking).** Section 5 states
   explicit-send parsing runs before the generic bare-`send` dispatch
   bucket, and Section 7 requires a test asserting this order. Closed.
3. **Overlapping preset-phrase disambiguation (high).** Section 5 replaces
   substring matching with an exact full-alias grammar (`send <alias> to
   <email>`, not a substring search) plus a hard uniqueness constraint on
   aliases across presets, validated by a config-time test (Section 7).
   This eliminates the ambiguity structurally rather than requiring a
   runtime tie-break. Closed.
4. **One-command shortcut scoped to attribute-less presets (high).**
   Section 5 restricts immediate one-command execution to presets with an
   empty `requiredAttributes` array; attribute-bearing presets fall back to
   the normal draft/attribute-collection/review-gate flow and explicitly
   never run a doomed `--send` call. Closed, including the previously
   undefined failure path.
5. **Privacy and allowed-status expected values (medium).** Section 2 fixes
   `private: false` as the canonical default and `allowedStatuses` to
   Draft (`1`)/Sent (`3`) only, with Scheduled (`2`) and any unknown status
   failing closed. Section 7 requires a schema test asserting the array is
   exactly `[1,3]`. Closed.
6. **`already_issued` reporting branch (medium).** Section 5 item 7 gives
   `already_issued` its own report language ("duplicate-safe no-op ... do
   not claim a new add or resend") distinct from the successful-add branch.
   Closed.
7. **Uncertain-reconciliation terminal state (medium).** Section 5 item 7
   defines `issued_pending_reconciliation` (and any ambiguous/failed
   receipt) as moving the script to `pending/uncertain/`, posting
   `[CERTIFICATE HOLD]`, with no automatic retry and no later bare `send`
   treated as resend authority. Section 7 requires a test for this exact
   behavior. Closed.
8. **Heartbeat case-sensitivity (confirm-before-build).** Section 5 items 1–2
   normalize the outgoing lookup key to lowercase and require a
   case-insensitive exact match on the returned email before accepting a
   result. This satisfies the normalize-and-compare alternative R1 offered
   in place of confirming Heartbeat's own server-side match semantics.
   Closed under the terms R1 specified.

## Test matrix

Section 7 covers every test class R1's required list named: grammar
precedence, overlapping-phrase, attribute-bearing presets, per-field drift
negatives (including null/missing badge normalization), Scheduled-status
rejection, `already_issued`, uncertain-reconciliation hold, Heartbeat
normalization/zero/multiple/blank/mismatch cases, and operator-override
validation parity. No gaps against the R1 list.

## Residual notes (non-blocking)

- Heartbeat's server-side match behavior for a real mixed-case stored email
  against a lowercased query is still unverified against the live API — the
  strategy's client-side normalization is the documented mitigation R1
  accepted, but this is worth confirming empirically the first time a
  mixed-case Heartbeat record is exercised. Not a spec defect.

## Answer

Safe to implement. Safe to create the empty canonical campaigns (Section 8
step 1) now — that step has no dependency on the still-pending CLAUDE.md /
EXECUTION-STEPS.md prompt edits required later in Section 8 step 4.
