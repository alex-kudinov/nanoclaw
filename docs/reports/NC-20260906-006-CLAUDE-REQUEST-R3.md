# Final bounded replay-correction review

The owner explicitly requires correction and independent re-review of all
load-bearing findings. R2 returned NO MATERIAL FINDINGS for its five reviewed
corrections. While R2 was reading that snapshot, Codex reproduced one further
concrete retry defect and fixed it. This additional round is restricted to
that small change, not another broad implementation review.

Read ONLY `docs/reports/NC-20260906-006-REPLAY-EVIDENCE-R3.md` (exact final source
excerpt and one regression). Write
`docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R3.md` with material findings or
NO MATERIAL FINDINGS and stop. No other reads, tools except Read/Write, source
edits, Bash/web/MCP, secrets, real records, or production access. Two reads
(this request and the evidence) then one response write should suffice.

Defect reproduction: admit valid receipt A, submit trusted conflicting receipt B
on the same scoped source, resolve B's exception using the existing versioned
owner command, queue a later authorized roster projection, and retry identical
receipt B. Previously hold() skipped the already-existing exception but the
surrounding conflict path still froze the NEW projection. The regression failed
before the fix and now passes.

Correction: use one exceptionKeyFor helper for both exception creation and
lookup; after verifying the conflicting receipt is host-attested, if its exact
source-conflict fingerprint already exists (open OR terminal), return the prior
state with duplicate:true. This makes recorded conflict decisions immutable
on retry. A materially different conflicting receipt has a different hash and
still opens a new owned exception and freezes pending projections. Current
exception state remains visible in the returned canonical aggregate.

Accepted facts: the original admitted receipt has immutable admission evidence;
future legitimate order corrections do not change it. Source tuple derives
orderKey; the receipt hash covers all normalized input facts. Exception keys
cover subject type/key, reason, and receipt hash. Host authority is trusted
context, not user/AI inputs. Arrays/maps contain canonical persisted records.
resolveEnrollmentException preserves the exception/key/history in terminal
state. The excerpt's pure function never mutates the original state.

Check only whether the new early return closes the reproduced bug without
bypassing fresh conflicts or touching existing decisions. Final focused 131/131
(44 adapter tests); typecheck pass; full root 3,664 pass/32 skipped with only
the two unchanged, reproduced predecessor failures. No runtime/provider writes.
