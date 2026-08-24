# NC-20260824-004 — Claude implementation-plan review R1 response

## 1. Verdict

**APPROVED WITH MATERIAL CORRECTIONS**

The overall architecture (dedicated default-off route, host-only mechanics,
seven-table schema split, archive-then-project flow) is sound and consistent
with `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`. Four material findings must be
corrected before implementation proceeds; none require a redesign.

## 2. Material findings (ordered by consequence)

### Finding 1 — Stage 1's required "reconciliation runner" is missing from the outcome and file/slice map

Evidence: `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md` §16, Stage 1 — "deterministic
parser, normalizer, projector, reaper, **and reconciliation runner** with
fixtures only; no provider/runtime configuration." The implementation plan's
§1 outcome list names "parser, HMAC relay gate, privacy minimizer, identity
and catalog resolver, event ledger, multi-axis enrollment projection, history,
exceptions, retry/replay path, and health surface" — it never names a
reconciliation runner. §5 (the exact source plan) adds the
`student_lifecycle_reconciliation_runs` **table** (§5.1 item 6) but no runner
source file, no fixtures-only registry/catalog/progress-scan logic, and no
corresponding test file. Control-plane §11 defines three scan types (registry,
course/cohort catalog, progress) that this table exists to record receipts
for; Stage 4 ("run 14 days and at least two complete progress scans in dark
mode") cannot begin until Stage 1 has already produced this code under
fixtures.

Consequence: building `student_lifecycle_reconciliation_runs` with no writer
leaves an inert table and an incomplete Stage 1 slice that could be reported
as "dark foundation complete" while a named design deliverable is absent —
exactly the kind of implied-but-unverified completion `docs/CHANGE-PROTOCOL.md`
prohibits.

Correction: add to §1 and §5 a fixtures-only reconciliation runner (e.g.
`src/student-lifecycle-reconciliation.ts` + `src/student-lifecycle-reconciliation.test.ts`)
that exercises the registry/catalog/progress scan reducers against
injected/fake read sources only — no live Heartbeat/API/network call in this
dark slice — and writes run receipts through `student-lifecycle-store.ts`.
If the task intends to narrow Stage 1 scope relative to the accepted design,
that narrowing must be recorded as an explicit decision, not silently
dropped, since the control-plane document is authority #2 in this review's
own authority order.

### Finding 2 — Pre-archive identity resolution conflicts with the archive-first reliability invariant and has no home for §14's "failed identity staging" data class

Evidence: implementation plan §4 orders the request path as: (6) "transiently
resolve email-bearing events to an exact party where possible, **then**
discard email/name and create a minimized prepared envelope" — **then** (7)
"archive only the prepared envelope in `webhook_inbox`." This makes the
durable archive write depend on a prior database round-trip (`party_emails`
lookup).

This inverts the dominant convention already in
`src/webhook-server.ts`: the `chaos`, `stripe-payment`, and `booked` handlers
all run `archiveWebhook` unconditionally first (lines 722–758) and hard-fail
the request if the archive write itself errors, specifically so "we never
dispatch an agent without a corresponding inbox row." (The one existing
exception, CNPC intake, validates *before* archiving — but that validation is
a pure, dependency-free parse, not a network/DB call, so it carries a
materially different failure mode.) It also conflicts with the control-plane's
own target-architecture diagram (§4), which orders "minimize before archive"
ahead of, and separately from, "identity/catalog resolution" inside the same
intake box — implying the minimized/fingerprinted envelope is meant to be
durable before resolution is attempted, not after.

Concretely: if the `party_emails` lookup fails transiently (DB connection
drop, pool exhaustion), the request path in §4 has no archived row and no
described fallback. The event is lost unless n8n retries — and a retry must
still satisfy the plan's own five-minute HMAC timestamp skew window (§4 point
3 / control-plane §5.2). Any retry-after-backoff scenario that lands outside
that window is rejected on signature grounds, producing silent, permanent
data loss rather than a retryable failure.

Separately, control-plane §14 lists "failed identity staging" (encrypted/
restricted normalized email, 7-day retention) as its own data class, distinct
from the inbox archive and the normalized event. Implementation plan §5.1's
seven tables have no table for this data class. If §4's "keyed identity
fingerprint plus an exception" is meant to fully satisfy §14 without ever
storing a resolvable raw email, that is a legitimate design choice — but the
plan does not say so, and the two documents currently describe inconsistent
retention shapes for the same data class.

Correction: archive the minimized/fingerprinted envelope **before** attempting
`party_emails` resolution, matching the dominant archive-first convention and
the control-plane diagram ordering. Perform identity resolution as a
subsequent step (synchronous immediately after archive, or deferred to the
store/reaper) that can be retried from the archived row without needing the
raw email again. Then explicitly state in the plan whether §14's "failed
identity staging" data class is satisfied entirely by the keyed fingerprint +
exception (with the Heartbeat `user_id` in the payload as the operator's
manual cross-reference into Heartbeat's own UI), or whether a distinct
short-retention staging table is required — and if the latter, add it to
§5.1.

### Finding 3 — The shared `readBody()` helper has no size cap and cannot satisfy the plan's own "strict raw body byte limit" requirement

Evidence: implementation plan §4 point 2 requires the lifecycle route to
"read the exact raw body under a strict byte limit," and §7 lists "size
limits" as a required focused test. `src/webhook-server.ts`'s only body
reader, `readBody()` (lines 217–224), unconditionally accumulates every
chunk with no length check:

```ts
function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
```

Every existing route in this file (`/hook/gmail-push`, `/api/post`, generic
`/hook/:id`) reuses this same unbounded reader. Implementation plan §5.4 lists
`src/webhook-server.ts` as a modified file but does not call out that this
helper must be replaced or wrapped for the lifecycle route; if the new route
simply calls the existing `readBody()`, the "strict byte limit" requirement
is unenforced in practice regardless of what the tests assert against a
small fixture payload.

Correction: implement (or wrap) a bounded body reader for the lifecycle route
that aborts/destroys the connection and returns 413 once accumulated bytes
exceed the configured limit, before JSON parsing or HMAC computation. Do not
reuse the shared `readBody()` as-is for this route.

### Finding 4 — The reaper's mechanical branch for `student-lifecycle` rows must be explicit and independently tested to guarantee no group lookup or agent dispatch

Evidence: `src/webhook-inbox-reaper.ts`'s `dispatchRow()` special-cases
`chaos` and `stripe-payment` with an early return *before* the
`groups.find(...)` / `webhooks.find(...)` lookup (lines 192–211); every other
`source` falls through to `webhooks.find((w) => w.id === row.source)` (line
183) and, if found, to `runAgent` (line 234). A `student-lifecycle` row will
never have a `data/webhooks.json` entry (no group is authorized to receive
it), so without an explicit early-return branch mirroring `chaos`/
`stripe-payment`, any `student-lifecycle` row that lands in `received`,
`failed`, or stale `dispatched` status would throw `webhook config
'student-lifecycle' not found` — which is merely a broken retry, not a
safety violation. But if a future edit "fixes" that error by adding a
webhooks.json entry or falling through to the generic path instead of adding
the dedicated mechanical branch, it would silently reintroduce `runAgent`
dispatch for lifecycle rows, contradicting the decision's exclusion of
"lifecycle actions/messages... or minion authority."

Implementation plan §5.4 correctly lists `src/webhook-inbox-reaper.ts` and its
test as modified, but the plan text does not state the required guard
explicitly.

Correction: add an explicit `if (row.source === 'student-lifecycle') { ... ;
return; }` mechanical branch before the `webhooks.find`/`groups.find` lookup,
calling the store's replay path (never `renderPrompt`/`runAgent`), and add a
test that asserts `runAgent` is never invoked for `student-lifecycle` rows
across all three reaper trigger conditions (received, failed, stale
dispatched).

## 3. Answers to plan section 9 questions

1. **Is pre-archive transient identity resolution compatible with
   archive-first reliability when the stored prepared envelope must be
   replayable without raw email?** No, not as currently sequenced — see
   Finding 2. Archive the fingerprinted envelope first; resolve identity as a
   subsequent, retryable step.
2. **Is the seven-table split proportionate?** Yes. It maps 1:1 to distinct
   write patterns the design requires: append-only facts (`events`,
   `state_history`) vs. a compare-and-swap current projection
   (`enrollments`) vs. run receipts (`reconciliation_runs`) vs. owner-visible
   problems (`exceptions`) vs. two independent authority sources
   (`catalog_entries` per §8.2, `identity_links` per §8.1). Combining any of
   these would either weaken the append-only/mutable distinction or collapse
   two independently-versioned authorities into one table. No correction
   needed, pending Finding 2's possible addition of a staging table.
3. **Can the dedicated default-off webhook path be added without breaking
   generic webhook behavior or creating an unauthenticated path?** Yes,
   structurally — the existing file already establishes the precedent
   (`/hook/gmail-push` is matched by exact path before the generic `/hook/:id`
   regex, and fails closed with a 503 when its handler is unconfigured). The
   same placement and fail-closed gating works for the lifecycle route.
   However, this only holds if Finding 3 (bounded body read) is corrected —
   otherwise the route is authenticated but not resource-bounded, which is
   itself a form of unauthenticated exposure (unbounded memory consumption
   before signature verification even runs).
4. **Are event identity and enrollment-episode semantics sufficient for
   duplicate, rejoin/reset, and out-of-order cases?** At the design level,
   yes — control-plane §7 and §10 already specify per-action stable keys and
   explicit episode-reopening rules, and the implementation plan's §5.2/§5.3
   responsibilities correctly delegate this to a pure reducer plus a
   compare-and-swap store. No implementation-plan-level gap found beyond
   Finding 1 (the reconciliation runner needed to detect out-of-order/stale
   snapshots in the first place).
5. **Does the inactive n8n template prove the signature contract without
   storing credential material or execution PII?** As specified (§5.5:
   `active: false`, no inline credentials, runtime credential/env references,
   execution data disabled, reason-code-only errors), yes — this matches
   control-plane §5.2 and Stage 2. No material finding; verify at
   implementation time that it follows the same credential-reference pattern
   as other n8n exports in the repository.
6. **Are any required design completion conditions missing from the file/test
   plan?** Yes — Finding 1 (reconciliation runner) is exactly this gap.
   Findings 3 and 4 are also completion-condition gaps: a byte-limit
   requirement with no enforcing code, and a reaper safety guarantee with no
   explicit branch/test.

## 4. Corrected file/slice/test map

In addition to everything in implementation plan §5, add:

- `src/student-lifecycle-reconciliation.ts` +
  `src/student-lifecycle-reconciliation.test.ts` — fixtures-only registry,
  catalog, and progress scan reducers (Finding 1); writes receipts through
  `student-lifecycle-store.ts`.
- In `src/webhook-server.ts`: a bounded body reader dedicated to (or wrapping)
  the lifecycle route, distinct from the shared unbounded `readBody()`
  (Finding 3), exercised by an oversize-request test.
- In `src/student-lifecycle.ts` / `src/student-lifecycle-store.ts`: reorder
  the prepare→archive sequence so the minimized/fingerprinted envelope is
  archived before any `party_emails` DB lookup, with resolution as a
  subsequent step (Finding 2); resolve or explicitly scope out the §14
  "failed identity staging" data class against the seven-table list.
- In `src/webhook-inbox-reaper.ts`: an explicit `student-lifecycle` mechanical
  branch before the `webhooks.find`/`groups.find` lookup, plus a test
  asserting `runAgent` is never invoked for this source (Finding 4).

No other change to the plan's file/slice map is required.

## 5. Boundary statement

This review confirms the plan's own exclusions and adds no new authority.
Circle remains completely excluded from this review and from the corrections
above. Production migration/data, n8n import/activation, Heartbeat
registration changes, deployment/restart, legacy receiver cutover,
credentials/rotation, lifecycle action consumers, messages, certificates, and
minion capability remain out of scope and unauthorized by this response.
