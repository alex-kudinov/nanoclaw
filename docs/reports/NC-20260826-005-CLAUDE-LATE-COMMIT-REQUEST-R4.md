# NC-20260826-005 late-commit cursor correction review R4

Review only the R3 sequence-allocation/late-commit correction. Read only:

1. `docs/reports/NC-20260826-005-CLAUDE-DUAL-CURSOR-RESPONSE-R3.md`
2. `src/relationship-context-source-enrichment.ts`
3. `src/relationship-context-store.integration.test.ts`

Write only:

`docs/reports/NC-20260826-005-CLAUDE-LATE-COMMIT-RESPONSE-R4.md`

Do not edit code, use Bash/web/MCP/provider tools, or reopen earlier accepted
findings.

## Correction

- Neither contact nor Chaos advances a completed cursor past a row it read and
  leaves it there permanently.
- Contact resets its numeric inbox cursor to zero after a completed bounded
  cycle.
- Chaos maintains independent interaction/inbox numeric cursors plus per-lane
  done flags. A lane that reaches its current end waits while the other drains;
  when both are done, both positions/done flags reset to their initial state.
- Therefore a lower sequence ID allocated earlier but committed after a higher
  ID is visible may be missed in the current cycle, but is necessarily read in
  the next bounded cycle. It cannot be skipped permanently.
- Pages order by underlying numeric columns (`i.id`, `w.id`), never text aliases.
- Full evidence is still grouped only for the bounded changed visitor set.
- Exact observations replay duplicate-only and terminal legacy upserts remain
  stable.

## Evidence

- Pinned Node 22.23.2 typecheck and seven focused tests pass.
- Disposable PostgreSQL 4/4 drains three interaction plus three inbox changes
  under a forced two-item budget, completes, resets, drains the second complete
  cycle, proves duplicate observation replay, preserves exact/legacy totals,
  and passes PII-negative readback.
- Migration-137 SQL integration passes.
- No production/provider mutation occurred.

Report only a still-material skip, replay, scale, identity, or privacy defect
in this correction. Otherwise write `NO MATERIAL FINDINGS`.
