# NC-20260906-003 Gate D Capacity review disposition — R1

Claude Sonnet/high found one material observability defect: every zero-row
persistence result was recorded as `stale_version`, even when the actual cause
was a missing reference or another write-integrity mismatch. Codex independently
confirmed the finding.

The correction gives each persistence boundary its own stable result code,
including pool/reservation/waitlist/enrollment/assignment write conflicts and
missing-reference inserts. These codes remain `needs_review`, preserving the
operator state machine while making the durable case and final receipt
truthful. Operator-case finalization now has its own hard failure rather than
being mislabeled as a domain version race.

The disposable worker now installs a one-command test trigger that suppresses
the destination assignment insert during a transfer. The command records
`assignment_insert_missing_reference`; the savepoint restores the origin
assignment, enrollment version, both pool versions, and zero destination rows.
The trigger is removed and the ordinary transfer then succeeds. Updated proof
is 14 cases, 28 receipts, four exact review cases, zero PII markers, and no
partial domain mutation.

Corrected focused tests and pinned typecheck pass. Because the finding changes
load-bearing receipt semantics, a narrow fresh R2 review is required.
