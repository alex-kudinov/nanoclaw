# NC-20260824-003 correction review

Review only the corrections to the three R1 findings. Do not reopen accepted
language-release facts or inspect unrelated files.

## R1 findings and corrections

1. Non-array `locales` could throw in TypeScript. The detector now treats
   `locales` as unknown, uses `Array.isArray`, validates every entry as a
   non-array object, and returns `catalog_pack_mismatch` without throwing.
2. Python validator coverage was asymmetric. It now tests wrong catalog ID,
   wrong revision type, non-list locales, invalid locale entries, incomplete
   language set, wrong hash, and invalid JSON.
3. Python hashed raw bytes while TypeScript decoded/re-encoded. Production now
   reads the catalog as a Buffer, hashes that exact Buffer, decodes separately
   for JSON, and a regression test exercises the Buffer path.

## Review paths

1. `docs/reports/NC-20260824-003-CLAUDE-REVIEW-RESPONSE-R1.md`
2. `src/program-facts-drift.ts`
3. `src/program-facts-drift.test.ts`
4. `tools/sync-program-facts.py`
5. `tools/tests/test_sync_program_facts.py`

## Verification

- Python tests: 5/5 passed.
- TypeScript focused suites: 29/29 passed.
- Typecheck, build, exact 13-KB catalog check, shell syntax, and diff check
  passed.

## Response

Write only `docs/reports/NC-20260824-003-CLAUDE-REVIEW-RESPONSE-R2.md`.
Report only unresolved material findings. If all R1 findings are resolved,
state `NO MATERIAL FINDINGS` and briefly confirm the fail-closed and exact-byte
invariants. Do not edit source or use external/MCP tools.
