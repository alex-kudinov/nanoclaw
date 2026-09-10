# NC-20260909-004 load-bearing correction review R2 — response

## Correction 1 — verified closed

`src/student-enrollment-production.ts:712-753`: the retry-once `admit()` call
is now wrapped in its own try/catch (`:725-733`). Any failure there — a second
`EnrollmentCommitUncertainError` or otherwise — returns a typed
`{ writer: 'uncertain', code: 'enrollment_commit_or_readback_uncertain',
orderKey: null }` instead of propagating. The subsequent projection-subject
build (`buildProjectionSubject`) is also wrapped (`:735-752`); if it throws
after a successful commit, the same `uncertain` result is returned, this time
carrying `admission.orderKey` — no path out of `route()` throws.

`src/stripe-payment-host.ts:511-526`: the `route()` call site is now
try/caught. Any escaping error (matching the H1 uncaught-second-throw
scenario) is converted to the same `writer: 'uncertain'` shape before the
Contador lease is touched.

`stripe-payment-host.ts:544` includes `--accounting-only` whenever
`enrollmentRoute.writer !== 'legacy'`, which covers `'uncertain'`. `:587-602`
forces `state: 'needs_review'`, `errorCode: 'enrollment_admission_uncertain'`
for the `'uncertain'` branch, with `enrollmentPilot.deliver` never called
(no provider delivery). This result flows unconditionally into
`finalizeFulfillment` at `:682-694`, so the lease is finalized durably rather
than left in-flight.

`stripe-payment-host.test.ts:359-399` ("finalizes accounting as needs-review
when enrollment commit status is uncertain") mocks `route()` to throw and
asserts: `--accounting-only` present, `deliver` not called,
`finalizeFulfillment` called with `state: 'needs_review'` /
`errorCode: 'enrollment_admission_uncertain'`, and the returned
`enrollmentWriter: 'uncertain'`. This is the exact scenario from H1 (post-claim
error escaping `route()`), and it now terminates the lease instead of
stranding it.

## Correction 2 — verified closed

`src/student-enrollment-provider-drivers.ts:225-239`: on the new-row path,
`apply()` persists the initial `prepared` checkpoint (`row: null`) at `:225`,
then after `api.append()` returns and `inserted` is computed, persists a
second `prepared` checkpoint containing `before.row = inserted` at `:232-236`,
and only then flips `state` to `'applied'` at `:238-239`. A crash between the
second checkpoint and the applied-flip leaves a durable, locatable row.

`rollback()` (`:255-289`) handles the case where even the second checkpoint
never landed (`before.row` still `null`, `before.appended` true): it calls
`this.locate()` at `:267-269`, which re-resolves the row by the unique
participant email or projection key (`:164-180`, throwing on ambiguity or
conflict) and persists the recovered locator before proceeding. It then reads
the current row and compares against the expected postimage hash (`:272-277`)
before clearing (`:278-283`), and verifies the post-clear readback
(`:284-288`) — matching "re-resolves … persists the recovered locator,
verifies the exact postimage, and only then clears A:M."

`student-enrollment-provider-drivers.test.ts:155-202` ("persists or
re-discovers an appended row before receipt-owned rollback") covers both crash
windows: (1) a `preimages.put` failure injected on the third write reproduces
a crash after the row checkpoint but before the applied-flip — the surviving
checkpoint has `state: 'prepared'`, `before: { row: 2, appended: true }`, and
`rollback()` succeeds directly using that row; (2) `api.append` is mocked to
succeed server-side then throw (lost response) — the surviving checkpoint has
`before.row === null`, and `rollback()` still succeeds by re-locating and
clearing the row. Contrasted with the sibling `HeartbeatProjectionDriver` test
at `:205-242`, which is unaffected and continues to pass.

## Verdict

NO MATERIAL FINDINGS
