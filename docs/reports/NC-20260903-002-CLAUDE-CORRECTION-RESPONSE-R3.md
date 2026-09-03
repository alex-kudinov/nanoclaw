# NC-20260903-002 — Correction review R3 response

Scope: the two R2 findings, against the named files only.

## Finding 1 — Packet incompleteness

Resolved. `classification-policy.ts`, `mailman-run-context.ts`,
`gmail-classification-reaper.ts`, and their test files are present and
readable in this round.

## Finding 2 — Fail-open binding: NOT independently verifiable in-boundary

The claim is that `src/ipc.ts` now runs a binding/proof check (missing,
expired, mismatched, or wrong-thread → quarantine) for *every*
`classify_label_write`, not just when `run_id` is present. `src/ipc.ts` is
excluded from this round's read boundary, so this cannot be confirmed
directly. The only evidence offered is
`mailman-classification-contract.test.ts`, which checks two string
conditions against `ipc.ts`'s source text:

1. it contains `if (data.type === 'classify_label_write')`
2. it does **not** contain `data.type === 'classify_label_write' && data.run_id`

This proves the literal old conjunction is gone; it does not prove a
binding/proof check runs, or that missing/expired/mismatched/wrong-thread
cases are actually quarantined. Equivalent fail-open code (reordered
condition, restructured `if`, or a no-op branch) would satisfy both
assertions.

The file in-boundary that should contain the corresponding validation call —
`classify-ipc-handlers.ts` — has no reference to `run_id`, binding, proof,
expiry, or thread-matching anywhere in `handleClassifyLabelWrite` or
`retryUnroutedClassification`, even though `ClassifyLabelWritePayload`
declares `run_id?: string`. `mailman-run-context.ts`'s only exported
consumer-facing function tied to `run_id`,
`mailmanUnboundSendDisposition`, governs the **outbound send** path
(distinguishing an expected inbound-classification send denial from a real
escalation) — a different control from validating an *inbound*
`classify_label_write`'s binding proof. Nothing in the readable packet shows
`getMailmanRunContext` (or equivalent) being called from the
`classify_label_write` path.

Net: the specific mechanism this finding was opened to confirm is not
observable anywhere in the current read boundary, and the one piece of
evidence offered (a textual contract test) does not test behavior.

## Finding 3 — Routing/auto_archive separation: partially confirmed

The auto_archive/routing separation itself is directly confirmed in
`classify-ipc-handlers.ts`: `routeAfterClassify` runs unconditionally for
every non-`rules-runner-v1` classification (lines ~551–585) before and
independent of the `taxonomy?.auto_archive` check that only gates
`removeLabelsFromThread(..., ['INBOX'])` (lines ~587–598). Archive metadata
does not gate routing.

However, "every rule/LLM classification reaches the canonical disposition
policy" is not confirmable in-boundary. `CLASSIFICATION_POLICY` /
`classificationPolicyFor` from `classification-policy.ts` is not imported or
referenced by any runtime file in this packet — not
`classify-ipc-handlers.ts`, not `gmail-classification-reaper.ts`, not
`mailman-run-context.ts`. The only consumers are its own unit test and
`mailman-classification-contract.test.ts`, which uses
`CANONICAL_CLASSIFICATION_LABELS` solely to check label completeness against
prompt/migration text, not to confirm any code path dispatches by
`disposition`. Actual routing dispatch happens through
`routeClassifiedEmail` (`host-router.ts`), which is outside this round's
boundary. As presented, `classification-policy.ts` is proven correct in
isolation but not shown to be wired into the live routing decision.

## Verdict

`GO WITH REQUIRED CHANGES` — before final sign-off, expand the read boundary
by one round to include: (a) the actual binding/proof-check implementation
in `src/ipc.ts` (not just the contract-test string assertions), and (b) the
segment of `host-router.ts` that consumes `label` to confirm it calls
`classificationPolicyFor`/`CLASSIFICATION_POLICY`. Both are the load-bearing
mechanisms for R2 findings 2 and 3 and remain unverified by this review.
