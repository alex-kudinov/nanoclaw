# NC-20260830-001 narrow review retry — response (R1B)

Reviewed exactly the six listed files/ranges. No other paths read.

## NO MATERIAL FINDINGS

Evidence:

- **Scoping (no cross-run borrowing, no wrong-JID leak).** `contexts` is keyed by
  the exact `runId` string (`src/grader-run-context.ts:61,124`), and
  `getGraderRunBinding` additionally rejects a mismatched `jid`
  (`stored.jid !== jid`, line 125). Overlapping runs in the same thread stay
  distinct (`grader-run-context.test.ts:105-124`), and a resolved later run
  never backfills an earlier unresolved run id
  (`ipc-grader-boundary.test.ts:328-354`).
- **Expiry.** TTL check is `nowMs - registeredAtMs > CONTEXT_TTL_MS`
  (`grader-run-context.ts:126`), exercised at the exact boundary and boundary+1
  (`grader-run-context.test.ts:86-97`), and the expired entry is deleted so it
  cannot be reused (`grader-run-context.ts:127`, test at 99-103).
- **Post-restart / adopted container.** The registry is a bare in-memory `Map`
  with no persistence, so a restart or adopted container has no entry;
  `getGraderRunBinding` returns `undefined` and `ipc.ts:985-986` falls back to
  `data.thread_ts` — the pre-patch path — confirmed by
  `ipc-grader-boundary.test.ts:309-326`.
- **Wrong/omitted model thread_ts is overridden, not merged.** `ipc.ts:981-991`
  computes `effectiveThreadTs` from the host binding when present, logs (jid /
  thread ids only, no submission content) on a mismatch, and never trusts the
  model-supplied value once a binding exists. Both the omitted-thread case
  (operator-only messages) and the conflicting-thread case are covered
  (`ipc-grader-boundary.test.ts:356-420`).
- **Operator-only thread placement.** `groups/grader/CLAUDE.md:130-131` requires
  the discrepancy notice to call `send_message` with the triggering
  `thread_ts` explicitly rather than relying on suppressed final text; since
  the host now overrides a wrong/missing `thread_ts` on that same grader-to-
  grader path, the notice lands in the correct thread even if the model gets
  the argument wrong. Wording is pinned by
  `grader-prompt-contract.test.ts:30-35`.
- **No duplicate delivery.** `ipc.ts:968-1029` computes one `effectiveThreadTs`
  and makes exactly one `deliverGraderOutput` call per IPC message; overriding
  the thread does not add a second send, it redirects the single send.
- **Type/logic soundness.** `GraderRunBinding.threadTs` is a required `string`
  (`grader-run-context.ts:57`, `StoredGraderRunContext.threadTs` at line 52,
  `setGraderRunContext` signature at line 71), so `effectiveThreadTs` is never
  silently `undefined` when a binding exists; `getGraderRunContext` at line
  104-107 further requires an exact `threadTs` match against the binding
  before returning submission context, so `submissionContext` can't be
  attached to a message actually routed elsewhere.

No security, correctness, or regression defect found in the reviewed diff. Not
independently re-verified: the reported 74/74 focused test pass and typecheck
pass (accepted as stated per the request).
