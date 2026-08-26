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

## Immutable release and production verification

- implementation:
  `416384fc713152bedfa54f51df402a1009bc37c6`;
- source tree:
  `8e1f436d2d789ba1fb035cd569d4ce926c797225`;
- artifact: 988 files,
  `0617a2ab2b13aa603e7698ccba6ec97ffb46ffdd53ab3a6cc62233bfc74c574a`;
- archive:
  `1dbb7637bae0775c330a1b7ef69774ebe76d18ed34428602bd250611063d24a8`,
  byte-identical and runtime-verified on the Mini;
- four consecutive pre-mutation samples: zero active containers, zero waiting
  groups, and zero outgoing Slack queue;
- mode-0700 backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-001-20260826T144521Z`;
- PostgreSQL dump SHA-256:
  `b0fcb83fa71c450d32cd35fb204ab2b4dffdf432221ca7543814bec877222ea5`;
- SQLite backup SHA-256:
  `abdd566b79d7725489e5ac9b637c8dd09be93c7603535d0f9eab73e52cb5d65b`;
- installed plist backup SHA-256:
  `36177f7fb7f1949a40c396c5e83ae47b9db95ab16717891de383189d78f5d758`.

Migration 138 applied once from the verified release. Live readback proves one
principal, three assignments, three owner constraints, three enabled triggers,
zero wrong relation owners, zero non-admin table/sequence/function grants, and
zero follow-up case/event rows.

Activation changed only code root, expected commit, and executable pointer.
Rollback plist:
`/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-e97c9f8700da-2026-08-26T14-48-40-757Z`.
The daemon reports exact release/tree/artifact/code root under Node 22.23.2,
connected Gmail/Slack, zero waiting/outgoing queues, Relationship Context query
disabled with zero grants, healthy Trafft shadow, zero projections/queries,
checkout production sends preserved, Community lifecycle enabled, and Circle
off.

A release-owned dry run observed 205 exact cases (180 Sales, five proposals,
20 receivables), returned no source errors, and exposed only
`team:tandem` as relationship owner. It performed no apply; follow-up
cases/events remained zero.

## Boundary still in force

No follow-up projection/apply, provider write, customer record/message, Slack
post, draft, approval, schedule, follow-up activation, Plutio mutation,
credential, payment, contract, minion grant, or context-query activation
occurred. Organizational ownership does not authorize any of those steps.
