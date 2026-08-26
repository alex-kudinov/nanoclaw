# NC-20260826-001 — Independent review response R1

Verdict: MATERIAL FINDINGS

## Finding 1 — Ownerless waiting decisions conflict with the database contract

**Consequence:** Medium. This is fail-closed rather than an authority leak, but
it would turn ordinary business states into an unhandled PostgreSQL error.

**Evidence:**

- `evaluateSales` returned `pipeline_paused` before owner validation.
- `evaluateProposal` returned `proposal_not_issued` before owner validation.
- `evaluateReceivable` returned `action_or_approval_pending` and
  `invoice_not_issued` before owner validation.
- Those decisions therefore carried null principal/assignment/decision fields.
- Migration 138's
  `company_followup_cases_relationship_owner_required_chk` permits null owner
  evidence only for `blocked`, `completed`, or `cancelled`; it correctly
  rejects `waiting` with no assignment.
- Shadow projection inputs do not filter those modeled states before durable
  projection.

**Failing scenario:** A paused Sales entry, unissued proposal/invoice, or
pending receivable is observed while the owner registry is unavailable.
Policy returns `waiting` with null owner evidence; the store attempts to
persist it and PostgreSQL rejects the row instead of retaining a truthful
`relationship_owner_unresolved` block.

**Bounded correction:** Run the relationship-owner gate before every
non-terminal `waiting` return while keeping authoritative
`completed`/`cancelled` source facts ahead of that gate.

**Missing acceptance tests:**

1. Policy tests for paused Sales, draft proposal, draft invoice, and pending
   receivable with missing owner evidence.
2. A PostgreSQL store test proving missing owner becomes a blocked case and the
   database independently rejects an ownerless waiting state.

## Non-material proof gaps and source ambiguities

- The apply orchestration and transaction boundary were outside the allowed
  packet, so batch-abort behavior was not reviewed.
- Migration 138 validated `supersedes_assignment_id` when supplied but did
  not require a later assignment for an existing scope to name the exact
  current row. Latest-effective resolution remained deterministic, but the
  documented provenance-chain invariant was not enforced.

All other load-bearing checks passed: the lane-bound composite foreign key
prevents cross-lane reuse; no creator/sender/group/activity fallback exists;
latest-effective selection and append-only triggers are deterministic; the
registry is admin-only; and shadow/review outputs remain content-minimized.
