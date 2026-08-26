# NC-20260826-001 — Tandem OS relationship-owner authority

Date: 2026-08-26

Program item: `work:relationship-owner-authority`

Decision:
`.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json`

Change class: C5 identity/authority boundary; current implementation remains
host/admin-only and grants no external action.

## Owner decision

The owner selected a generic organizational model. Tandem OS owns assignment
authority, and the explicit principal is `team:tandem` / `Tandem Team`.
Ownership means accountability/routing only. It does not choose a sender,
approve content, activate follow-up, grant a capability, or authorize a
provider, payment, contract, credential, or customer action.

## Local implementation

- migration/rollback 138 adds an append-only principal registry and append-only
  decision-bound assignment registry;
- one principal has `managing_system='tandem_os'` and
  `action_authority='none'`;
- three assignments cover `sales_conversation`, `proposal_signature`, and
  `receivable` separately;
- `company_followup_cases` retains principal key, assignment ID, and decision
  reference under a composite foreign key that also binds case lane;
- the as-of host resolver returns only exact valid assignment evidence;
- missing, malformed, duplicate, unavailable, or action-authorizing evidence
  fails closed without a creator/sender/group/activity fallback;
- follow-up policy `2026-08-26.1`, shadow contract v2, review contract v2,
  and durable case projection carry exact owner provenance;
- terminal source facts can still close without ownership because they require
  no new action.

## Local verification

- pinned Node: 22.23.2;
- focused TypeScript: 7 files / 56 tests passed; the PostgreSQL integration
  file was separately enabled and passed 6/6;
- format, typecheck, build, documentation continuity, capability matrix, and
  diff checks passed;
- full root: 301 files / 3,291 tests passed, 10 files / 27 tests skipped, and
  three unrelated baseline failures. The exact same failures reproduce at
  base `460a51c7`: one CNPC wrapper-literal assertion and two local external
  `~/dev/grading/registry.json` expectation mismatches;
- disposable PostgreSQL 16.15:
  - base schema plus migrations 118, 130, 131, 137, and 138 applied;
  - one principal and three exact assignments exist;
  - two test cases persisted exact owner provenance;
  - principal/assignment rows are append-only;
  - concurrent same-lane assignment inserts serialize through commit; the
    second transaction re-reads the committed row and rejects a stale
    supersession ID;
  - non-admin grants on the owner registry: zero;
  - populated rollback refused and retained all evidence;
  - a separate empty database rolled migration 138 back cleanly, leaving both
    owner tables absent and zero owner columns on follow-up cases.

## Independent review

- Claude Sonnet/high R1 found one material mismatch: paused/draft/pending
  waiting decisions could bypass owner validation while the database correctly
  forbade ownerless waiting rows.
- The policy now validates owner evidence before every non-terminal waiting
  result. Policy and PostgreSQL tests cover all four paths plus authoritative
  terminal closure.
- R1 also noted that later assignments should be required to name the exact
  current superseded row. The migration trigger now enforces that invariant.
- R2 returned `NO MATERIAL FINDINGS`.
- R2 noted a non-material concurrent-insert race. The trigger now takes one
  transaction-scoped advisory lock per exact assignment scope; an enabled
  PostgreSQL concurrency test proves blocking and post-commit revalidation.
- R3 returned `NO MATERIAL FINDINGS`.

## Boundary still in force

No production migration, runtime activation, case projection, provider read or
write, customer record/message, Slack post, draft, approval, schedule,
follow-up activation, Plutio mutation, credential, payment, contract, minion
grant, or deployment has occurred in this task at this checkpoint.

Exact commit/release, production preflight, deployment, and live
non-interference proof remain pending.
