# NC-20260825-003 — Relationship Context plan correction review R2

Review only whether all four R1 plan findings are closed in the corrected
implementation plan.

Read only:

- `docs/RELATIONSHIP-CONTEXT-IMPLEMENTATION-PLAN.md`
- `docs/reports/NC-20260825-003-CLAUDE-PLAN-REVIEW-RESPONSE-R1.md`

Check exactly:

1. migration 137 performs a safe, idempotent, conflict-refusing legacy Party
   source-pair backfill with a test;
2. every persisted manifest/observation/projection/query/Plutio JSON value has
   an explicit 8,192-byte database and validator bound plus rejection test;
3. merge tests name claims, refs, exceptions, observations, projections, query
   receipts, and Plutio receipts and prove no active/current authority remains
   only on a tombstoned loser while immutable evidence survives;
4. no model-writable work ID is trusted: the exact work ID comes only from a
   future host-resolved and consumed run/container/purpose/subject grant.

Do not read other files, edit the plan/source, or use Bash/web/MCP/provider
tools. Write only
`docs/reports/NC-20260825-003-CLAUDE-PLAN-CORRECTION-RESPONSE-R2.md` with
`NO MATERIAL FINDINGS` or only unresolved material findings and bounded fixes.
