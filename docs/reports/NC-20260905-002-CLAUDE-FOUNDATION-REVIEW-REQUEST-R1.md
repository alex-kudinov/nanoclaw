# NC-20260905-002 Claude foundation review R1

## Objective

Independently review the proposed multi-source Academy enrollment foundation
for material architectural or process defects. The owner wants strong
Codex-Claude convergence before any reconciliation or data change.

## Accepted authority and facts

- Company OS is the provider-neutral process owner; native providers retain
  their own facts.
- The accepted entitlement catalog separates commercial enrollment,
  component entitlements, class assignments, consumption, progress, finance,
  and communication eligibility.
- Constant Heartbeat access groups and future hidden zero-content marker groups
  are parallel projections. Neither is canonical enrollment truth.
- Website Stripe is only one ingress. Manual Stripe, Plutio invoice/contract,
  check/ACH/wire, sponsor cohorts, scholarships, complimentary grants, and
  corrections must enter the same process.
- A payer is not automatically a participant. One payer/order may fund many
  seats; unknown participants must remain unknown.
- This phase is C1 foundation only. No student population inspection,
  reconciliation, backfill, provider/database/runtime write, deployment, or
  communication is authorized.

## Review artifacts

Read only:

1. `docs/STUDENT-ENROLLMENT-FOUNDATION.md`
2. `facts/catalogs/student-enrollment-foundation-v1.json`
3. `facts/catalogs/student-enrollment-foundation-v1.schema.json`
4. `scripts/validate-student-enrollment-foundation.mjs`
5. `src/student-enrollment-foundation.test.ts`

The predecessor entitlement contract is summarized above; do not reopen its
accepted bundle contents or search the repository broadly.

## Questions

Look for material gaps or contradictions in:

- order versus seat versus student-enrollment identity and cardinality;
- source authority, idempotency, aliases, duplicate/conflicting capture;
- payer/participant evidence and partially named sponsor cohorts;
- financial agreement and obligation separation, including no-payment grants;
- entitlement materialization and class/delivery-block assignment;
- operator intake, atomicity, concurrency, corrections, transfers, and holds;
- projection outbox, exact readback, replay, supersession, and target drift;
- durable exceptions, ownership, privacy, retention, and audit evidence;
- operational queries for class recipients, cohort views, and payment due;
- rollout/rollback gates and whether a later implementation can proceed without
  inventing major semantics;
- whether the schema, validator, and tests enforce the document's load-bearing
  invariants instead of serving as decorative artifacts.

## Response contract

Write only
`docs/reports/NC-20260905-002-CLAUDE-FOUNDATION-REVIEW-RESPONSE-R1.md`.
Report material findings only, ordered P0/P1/P2, with exact file/evidence
references, consequence, and a concrete correction. Distinguish a true defect
from a later owner decision already left explicitly gated. If there are no
material findings, say `NO MATERIAL FINDINGS` and briefly name the strongest
invariants you verified. Do not edit source artifacts, invoke Bash or external
tools, inspect live data, or propose reconciliation/backfill/provider actions.
