# NC-20260825-003 — Relationship Context dark-foundation plan review R1

## Objective

Review the exact implementation plan before source edits. Report only material
defects that could make the local dark foundation unsafe, internally
inconsistent, incompatible with NanoClaw's current live lineage, impossible to
verify, or broader than its authority.

## Authority and accepted facts

1. Root `CLAUDE.md` and current source/schema define implemented mechanics.
2. `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` is the accepted target design.
3. `docs/RELATIONSHIP-CONTEXT-IMPLEMENTATION-PLAN.md` is the candidate.
4. Base `683d61208e1c` is the clean exact reviewed/live lineage selected for the
   isolated branch.

Accepted owner boundary:

- local source, reversible migration/rollback, sanitized fixtures, tests,
  documentation, review, commit, and push are authorized;
- no real provider access, credential, production database/runtime/config,
  customer record, Plutio field/data, Booking behavior change, minion
  activation, communication, deployment, restart, or live outcome is allowed;
- the feature must be default off and deny by default;
- `business_v2.parties.id` is the internal join; providers remain native fact
  authorities; ambiguous identity never resolves by first-row email selection;
- ordinary future sources integrate through tracked adapters/manifests/fact
  catalog extensions, not core rewrites or runtime-downloaded code.

## Allowed read paths

- `CLAUDE.md`
- `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`
- `docs/RELATIONSHIP-CONTEXT-IMPLEMENTATION-PLAN.md`
- `src/student-lifecycle.ts`
- `src/student-lifecycle-store.ts`
- `src/ipc.ts`
- `container/agent-runner/src/ipc-mcp-stdio.ts`
- `data/business/migrations/nanoclaw-v2/134_student_lifecycle_community_dark.sql`

Do not read `.env*`, credentials, auth/session stores, runtime databases,
customer data, unrelated dirty work, or other worktrees. Do not use Bash, web,
MCP, or provider tools. Do not edit the plan or source.

## Review questions

1. Does migration 137's proposed table/merge/immutability/rollback model close
   identity ambiguity without corrupting merge lineage or inventing a second
   authority?
2. Is the adapter boundary genuinely provider-neutral and sufficiently bounded
   against credentials, network, direct DB writes, unbounded JSON, and semantic
   redefinition?
3. Can the store/service distinguish exact refs, verified claims, ambiguity,
   stale/conflicting/partial/unavailable projections, and immutable query
   receipts deterministically?
4. Does the IPC plan bind directory group plus host run/container/work/subject,
   fail closed, remain default off, and avoid granting action authority?
5. Is the dry-run Plutio plan provably non-executable and non-provider-facing?
6. Are exact files/tests/docs and ordering sufficient for an independently
   reviewable local implementation on this lineage?
7. Does any proposed work cross a prohibited external or production boundary?

## Response contract

Write only:

`docs/reports/NC-20260825-003-CLAUDE-PLAN-REVIEW-RESPONSE-R1.md`

Use:

- Verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`.
- Findings ordered by consequence, each with exact plan/source evidence, risk,
  and bounded correction.
- Do not restate the plan, create a broad backlog, or invent owner decisions.
