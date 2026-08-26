# NC-20260826-001 — Tandem OS relationship-owner review R1

## Review contract

Use Claude Sonnet with high effort for an independent bounded review. Report
material findings only, ordered by consequence, with exact file/line evidence,
the failing scenario, the smallest safe correction, and the missing acceptance
test. Do not edit source, inspect secrets, access providers/databases/network,
run Bash, or reopen the accepted owner decision. Return the complete review
report as your response.

## Objective

Review the C5 identity/authority boundary that makes `Tandem Team` the
explicit generic relationship owner managed by Tandem OS.

The implementation must:

1. record one stable `team:tandem` organizational principal;
2. explicitly assign it to each Sales conversation, proposal-signature, and
   receivable lane with accepted-decision provenance;
3. treat ownership as accountability/routing only, with no sender, approval,
   follow-up, minion, provider, payment, contract, credential, or customer
   action authority;
4. resolve exact as-of assignment evidence and fail closed without any
   creator/sender/group/activity fallback;
5. bind durable follow-up cases to the exact principal, assignment, decision,
   and lane;
6. preserve authoritative terminal source closure when no new action is
   required;
7. remain admin-only and runtime/action-dark until a separately verified
   release.

## Authority and accepted facts

- Owner decision:
  `.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json`.
- Tandem OS is the assignment authority.
- The generic owner is `team:tandem` / `Tandem Team`.
- Generic ownership is explicit policy, not inference and not a global sender.
- Existing workflow groups retain their roles: Sales coordinates;
  Contador owns invoice/payment truth; Mailman can send only exact separately
  approved bytes.
- The exact base is pushed/live Relationship Context lineage `460a51c7`.
- Migration 130 follow-up tables are live and were last verified empty.
- Migration 137 and the credential-free null-Party Trafft shadow are live;
  context queries/minion grants remain disabled.
- No production mutation has occurred in NC-20260826-001.

## Allowed source packet

Read only:

1. this request;
2. the accepted decision file above;
3. `docs/RELATIONSHIP-OWNER-AUTHORITY.md`;
4. `docs/SALES-FOLLOWUP-OPERATING-MODEL.md` sections 5-7 and the owner-decision checkpoint;
5. `data/business/migrations/nanoclaw-v2/138_relationship_owner_authority.sql`;
6. `data/business/migrations/nanoclaw-v2/rollback_138_relationship_owner_authority.sql`;
7. `src/relationship-owner.ts` and its two tests;
8. `src/followup-policy.ts` and `src/followup-policy.test.ts`;
9. `src/followup-shadow-source.ts` and
   `src/followup-shadow-source.test.ts`;
10. `src/followup-case-store.ts` and
    `src/followup-case-store.integration.test.ts`;
11. `src/followup-shadow.ts`, `src/followup-review.ts`, and their tests;
12. `docs/SECURITY.md` relationship-owner section;
13. `docs/DATA-MODEL.md` relationship-owner section;
14. `docs/programs/company-os/evidence/NC-20260826-001-relationship-owner-authority.md`.

Do not inspect unrelated source or historical reports.

## Verified evidence supplied to the reviewer

- Pinned Node 22.23.2 format, typecheck, build, and focused 55/55 pass.
- Enabled PostgreSQL store integration 4/4 passes.
- Disposable PostgreSQL 16.15 proves migration apply, one principal, three
  assignments, case provenance, append-only enforcement, zero non-admin
  grants, populated rollback refusal, and clean empty rollback.
- Full root: 3,290 pass / 25 skip / three unrelated failures. The same three
  failures reproduce at exact base `460a51c7`: one CNPC wrapper assertion and
  two external `~/dev/grading/registry.json` expectation mismatches.
- Documentation continuity and diff checks pass.

## Load-bearing questions

1. Can any actionable case become ready/waiting without exact current
   assignment evidence, or can a terminal fact be incorrectly blocked by an
   owner outage?
2. Can an assignment for one lane be reused for another, or can principal,
   decision, and scope provenance drift independently?
3. Can the registry or resolver accidentally confer external-action authority
   or fall back to a creator, sender, workflow group, pipeline field, or recent
   activity?
4. Is latest-effective assignment selection deterministic, append-only, and
   safe for a later explicit superseding decision?
5. Can migration 138 fail or partially apply against the current live shape,
   including pre-existing follow-up rows, role ownership, missing optional
   extensions, rollback, and default privileges?
6. Does the durable store write the exact owner tuple for inserts, updates,
   unchanged replays, and policy fingerprint/version changes?
7. Do shadow/report/review outputs carry enough minimized provenance to explain
   why ownership resolved without leaking or creating action authority?
8. Do tests prove negative paths and the exact database constraints rather
   than merely assert strings?

## Response format

- `Verdict: NO MATERIAL FINDINGS` when every load-bearing claim holds;
  otherwise `Verdict: MATERIAL FINDINGS`.
- For each finding: consequence, exact evidence, failing scenario, bounded
  correction, and missing acceptance test.
- List non-material proof gaps and source ambiguities separately.
- Do not infer a different owner decision.
