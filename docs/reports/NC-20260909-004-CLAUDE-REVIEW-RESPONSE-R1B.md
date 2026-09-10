# NC-20260909-004 narrow production-pilot review R1B — response

## Finding 1 — HIGH: uncaught exception from `route()` after a possible-acceptance strands the Contador fulfillment lease with no compensating handling

**Files/lines:**
- `src/student-enrollment-production.ts:707-717` (retry-once logic around `service.admit`)
- `src/stripe-payment-host.ts:508-511` (unguarded call site)

**Failure scenario:** `route()`'s only error handling around `service.admit(input.pool, certificate)` is:
```
try {
  admission = await service.admit(input.pool, certificate);
} catch (error) {
  if (error instanceof EnrollmentPilotRefusalError) return {...};
  if (!(error instanceof EnrollmentCommitUncertainError)) throw error;
  admission = await service.admit(input.pool, certificate);   // retry, uncaught
}
```
The retry call at line 716 is not wrapped in its own try/catch. If the second `admit()` also throws — a second `EnrollmentCommitUncertainError` (e.g. a repeat transient Postgres/network blip during the SERIALIZABLE commit) or any other error — the rejection propagates out of `route()` entirely, uncaught.

`stripe-payment-host.ts:508-511` calls this with no surrounding try/catch:
```
const enrollmentRoute = !isRefund && enrollmentPilot
  ? await enrollmentPilot.route({ payload, source })
  : ({ writer: 'legacy', code: 'pilot_disabled' } as const);
```
This call happens *after* `beginContadorFulfillment` has already admitted the case and issued a lease token (line ~469), but *before* the try/catch that guards the `process-payment.cjs` execution (line 535) and before any call to `finalizeFulfillment`. An uncaught error here throws out of `handleStripePayment` with the fulfillment case still in its non-terminal, leased "processing" state — `finalizeFulfillment` is never called, unlike every other failure path in this file (script failure is caught and turned into `persistProcessorFailure`, script throws `StripePayloadError`, etc., all of which finalize the case). On the next webhook delivery for the same `stripe_id`, `beginContadorFulfillment` will see the case as `inFlight` and throw `StripeFulfillmentInFlightError`, permanently blocking retries until an operator manually breaks the lease — while it is simultaneously uncertain whether the one-and-only enrollment writer claim/order was actually committed by the errored `admit()` call.

**Violated invariant:** "Any uncertain provider acceptance holds without blind retry" and the review's own callout "provider errors before versus after possible acceptance" — this is exactly the post-claim error path that has weaker handling than the pre-claim (evidence resolution) path, which safely converts *any* error to a legacy refusal (`student-enrollment-production.ts:547-555`).

**Smallest correction:** wrap the `enrollmentPilot.route(...)` call in `stripe-payment-host.ts` in a try/catch that, on any thrown error, finalizes the Contador case into a non-terminal `needs_review` state (mirroring `persistProcessorFailure`) instead of letting the exception escape with the lease unresolved. Equivalently, make the second `service.admit` attempt in `student-enrollment-production.ts:716` itself caught, converting any further failure into a typed, non-throwing result (e.g. `{ writer: 'legacy', code: '...' }` is wrong since acceptance may have happened — it should surface as a distinct "uncertain" result the host path is required to handle) rather than an escaping rejection.

## Finding 2 — MEDIUM/HIGH: appended roster row's row number is not durable before the write is considered possibly-accepted, making it un-rollback-able if the process crashes between append and preimage finalize

**File/lines:** `src/student-enrollment-provider-drivers.ts:225-235` (`StudentRosterProjectionDriver.apply`), rollback dependency at `:262-263`.

**Failure scenario:** For a new student (no existing row — `row === null`), `apply()` persists a `prepared` preimage record with `before: { row: null, values: [], appended: true }` (line 225), then calls `api.append(...)` (line 229). If the append succeeds server-side but the process crashes/restarts before reaching line 235 (`prepared.state = 'applied'; await this.preimages.put(prepared)`), the durable preimage record on disk still has `row: null`. The discovered row number from `rowNumber(appended.updatedRange)` was only ever assigned to the in-memory `prepared.before.row` (line 232) — it is never independently persisted.

On the next `deliver()` retry, `apply()` finds the existing `prepared` record (state not `'applied'`) and correctly throws `ProjectionAcceptanceUncertainError()` rather than re-appending (avoiding a duplicate row) — this part is correct. But if this projection is later targeted for `rollback()` (e.g. a compensating action after the enrollment order is voided), `rollback()` reads the same stale preimage record and immediately fails at line 263 (`if (!before.row) throw new Error('student_roster_rollback_row_missing')`) — it can never locate the actually-appended row to clear it. The row silently persists in the production roster forever with no way to compensate through this driver.

Contrast with the sibling `HeartbeatProjectionDriver.apply` (`:322-355`), where `before` (accessPresent/markerPresent) is fully computed and durably persisted *before* any mutating API call, so a crash at any point still leaves `rollback()` able to reverse exactly what was added — confirming this is a real asymmetry/gap specific to the roster driver, not an inherent property of the pattern.

**Violated invariant:** review's explicit callout "preimage durability plus append/update/membership compensation," and "Rollback touches only exact receipt-owned effects" (rollback cannot even identify the effect it owns).

**Smallest correction:** persist the discovered row number as its own durable checkpoint immediately after `api.append()` succeeds, before flipping to `'applied'` — e.g. `await this.preimages.put({ ...prepared, before: { ...prepared.before, row: inserted } })` right after computing `inserted` at line 230, then a second `put()` to flip `state` to `'applied'`. This guarantees `rollback()` can always locate the row even if the process crashes between the append and the final state transition.

MATERIAL FINDINGS
