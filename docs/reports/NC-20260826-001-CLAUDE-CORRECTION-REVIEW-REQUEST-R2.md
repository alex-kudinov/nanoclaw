# NC-20260826-001 — Relationship-owner correction review R2

Use Claude Sonnet with high effort. Review only whether the R1 material finding
and the noted supersession proof gap are fully closed without weakening the
accepted no-action boundary. Report material findings only. Do not edit files,
run Bash, inspect secrets, or access external systems. Return the complete
review report as your response.

## R1 finding to close

Four modeled non-terminal waiting states could return before owner validation,
while migration 138 rejects waiting cases with null owner provenance.

## Corrections

1. `src/followup-policy.ts` now runs owner validation before:
   - paused Sales waiting;
   - proposal-not-issued waiting;
   - receivable pending-action waiting;
   - invoice-not-issued waiting.
2. Authoritative terminal Sales/proposal/invoice facts remain before the owner
   gate and can still close without new action.
3. `src/followup-policy.test.ts` covers missing owner for all four states and
   terminal-without-owner behavior.
4. `src/followup-case-store.integration.test.ts` proves the store projects a
   missing-owner draft as `blocked/relationship_owner_unresolved` and that
   PostgreSQL independently rejects an ownerless waiting mutation.
5. Migration 138 now requires every later assignment for an existing scope to
   name the exact current assignment it supersedes. The integration test proves
   an omitted supersession is rejected.

## Verification

- focused pure tests: 56/56;
- enabled PostgreSQL integration: 5/5;
- pinned Node 22.23.2 typecheck: pass.

## Allowed packet

Read only:

1. this request;
2. `docs/reports/NC-20260826-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`;
3. `src/followup-policy.ts`;
4. `src/followup-policy.test.ts`;
5. `src/followup-case-store.ts`;
6. `src/followup-case-store.integration.test.ts`;
7. `data/business/migrations/nanoclaw-v2/138_relationship_owner_authority.sql`;
8. `src/relationship-owner-migration.test.ts`;
9. `docs/RELATIONSHIP-OWNER-AUTHORITY.md`.

## Response

- `Verdict: NO MATERIAL FINDINGS` if both issues are closed.
- Otherwise give exact consequence, evidence, failing scenario, bounded fix,
  and missing acceptance test.
- List source ambiguities separately.
