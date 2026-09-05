# NC-20260905-003 Claude correction review R2 — Response

Reviewed strictly the four listed artifacts. No Bash/MCP/web tools invoked, no
live data inspected, no implementation file edited.

## Verified resolved

- **P0 (audit/lifecycle columns):** `FinancialAgreement`, `FinancialObligation`,
  `ComponentEntitlement`, and `ClassAssignment` now carry `createdAt`/
  `updatedAt`/`updatedBy` and are stamped from `actor`/`occurredAt` at every
  write site (`recordFinancialAgreement` line 1120, `recordFinancialObligation`
  line 1215, `materializeEnrollment`'s entitlement construction line 1446,
  `assignClass` line 1559). `ProjectionOutboxItem` carries `createdAt`/
  `updatedAt` (stamped in `requestProjection`, line 1628). `ProjectionReceipt`
  carries independent `occurredAt`/`recordedAt` (both set distinctly in
  `recordProjectionReadback`, line 1712). `EnrollmentException` carries
  `firstSeenAt`/`lastSeenAt`/`reviewAt`/`resolvedAt`/`occurrenceCount`/
  `updatedBy`, all correctly stamped in `openEnrollmentException` and
  `resolveEnrollmentException`. All match the corresponding SQL `NOT NULL`
  columns and the `created_at <= updated_at` / `first_seen_at <= last_seen_at`
  / `resolved_at >= last_seen_at` CHECKs.
- **P1 (silent re-observation drop):** `openEnrollmentException` (line 1788)
  now compares material facts on repeat `exceptionKey`, throws
  `exception_key_conflict` on divergence, blocks reopening a closed key with
  `exception_closed`, rejects time regression, and otherwise bumps `version`/
  `occurrenceCount`/`lastSeenAt` with a `re_observed` history row. Verified by
  test `opens and resolves a durable owned exception by version`.
- **P1 (transfer preconditions / inferred payer):** `transferParticipant`
  (line 1940) now requires `seat.participantPartyId !== null` and
  `seat.state` in `assigned|accepted|materialized`, and requires an explicit,
  validated `payerRelationship` argument (no `unknown`-to-`separate_payer`
  default). Verified by test `does not use transfer as a first-assignment or
  cancelled-seat bypass`.
- **P1 (severity-gated blocking):** `hasBlockingException` (line 1286) now
  blocks on any `open`/`acknowledged` exception regardless of severity.
  Verified by test `blocks materialization for any open exception regardless
  of severity`.
- **P1 (projection supersession audit trail):** `transferParticipant`
  (lines 2042-2064) now increments `version` and pushes a
  `superseded_by_transfer` history row for every superseded projection, not
  just the seat. Verified by test `requires owner evidence for
  post-materialization transfer and preserves history`.
- **P1 (closed-set runtime checks / numeric bounds):** `correctOrderTerms`,
  `recordFinancialAgreement`, `recordFinancialObligation`,
  `transitionFinancialObligation`, `assignClass`, `openEnrollmentException`,
  `resolveEnrollmentException`, and `requestProjection` all now call
  `assertChoice` against a runtime `Set` for every field R1 named
  (agreement type/state, obligation state, assignment state, exception
  subject-type/severity/owner-role/resolution, projection target/subject-type),
  and `policyRevision`/`catalogRevision` are positive-integer checked.
- **P2 (dead order states):** `transitionOrderState` now produces
  `ready_to_materialize`/`held`/`cancelled` with gate checks and blocks
  resurrection from `cancelled`. Verified by test.
- **P2 (duplicate entitlement/delivery-block pair):** `assignClass`
  (lines 1529-1540) now rejects a second non-terminal assignment for the same
  `(entitlementKey, deliveryBlockKey)` pair.

## Unresolved — P1: `assertKey`'s charset still diverges from the SQL columns it now length-matches

R1's `assertKey` finding was corrected for length (`maxLength` is now
parameterized and passed correctly per column), but `assertKey`'s pattern is
still the generic key charset:

```
/^[a-z0-9][a-z0-9._:-]*$/
```

(line 326). This is used for `reasonCode` in `transitionOrderState` (line 889)
and `openEnrollmentException` (line 1764), and for `evidenceType` in
`attachEnrollmentEvidence` (line 753). The SQL columns behind all three —
`reason_code` (both `student_enrollment_exceptions_v2` and
`student_enrollment_history`) and `evidence_type`
(`student_enrollment_evidence`) — use a different, stricter pattern:

```
'^[a-z][a-z0-9_]{0,99}$'
```

`assertKey` permits a leading digit and `.`/`:`/`-` characters that the SQL
pattern forbids. A caller-supplied `reasonCode` or `evidenceType` such as
`"1-off-correction"` or `"owner.override"` passes domain validation today and
would be rejected by the SQL `CHECK` at persistence time — the exact failure
mode the assertKey correction was meant to close, just on the charset axis
instead of the length axis. None of the reason codes/evidence types the
codebase itself hardcodes trip this (they're all `snake_case`), so the gap is
invisible under the current test suite and only surfaces once a caller
supplies a value.

**Correction:** add a second regex parameter to `assertKey` (or a distinct
`assertReasonCode`/`assertLowerSnake` helper) using
`/^[a-z][a-z0-9_]{0,N}$/` for `reasonCode` and `evidenceType`, leaving the
existing charset for the `_key` family (`orderKey`, `seatKey`,
`entitlementKey`, etc.) where it already matches SQL.

## Unresolved — P1: `attachEnrollmentEvidence` never runtime-validates `subjectType`

Every other command that accepts a closed-set field now calls `assertChoice`
against a runtime `Set` before using the value. `attachEnrollmentEvidence`
(line 748) does not: `input.subjectType` is trusted from the TypeScript union
type alone, then passed straight into `subjectExists` (line 759):

```ts
function subjectExists(state, type, key) {
  const maps: Record<EnrollmentEvidence['subjectType'], Record<string, unknown>> = { ... };
  return Boolean(maps[type][key]);
}
```

If `subjectType` arrives from JSON/IPC as a string outside the nine
recognized values, `maps[type]` is `undefined` and `maps[type][key]` throws an
unhandled `TypeError`, not a controlled `EnrollmentCommandError` — a strictly
worse outcome than the silent-acceptance risk R1's closed-set finding was
raised against, on the one command the fix wave missed. No
`EVIDENCE_SUBJECT_TYPES` set exists among the other closed-set constants
(`SOURCE_CHANNELS`, `EXCEPTION_SUBJECT_TYPES`, `PROJECTION_SUBJECT_TYPES`,
etc., lines 441-545).

**Correction:** add an `EVIDENCE_SUBJECT_TYPES` set matching the nine values
in the `EnrollmentEvidence['subjectType']` union and call
`assertChoice(EVIDENCE_SUBJECT_TYPES, input.subjectType, 'evidenceSubjectType')`
in `attachEnrollmentEvidence` before the `subjectExists` check, mirroring the
pattern already used in `openEnrollmentException`.

## Not re-verified

Build/typecheck/test execution and the migration test file were not
inspected — outside the four-file allowed packet for this round.
