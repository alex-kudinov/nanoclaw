# NC-20260905-007 bounded capacity disposable-proof review R2

## Objective

Review only the two load-bearing corrections made after R1. Determine whether
the disposable migration-142 -> migration-143 proof now makes the
cross-migration cleanup explicit, performs a valid empty rollback of 143, and
self-checks that its generated database was removed.

## Authority and boundary

- This is a synthetic, local-only PostgreSQL proof.
- Do not inspect credentials, auth stores, `.env` files, unrelated private
  data, production systems, real student records, providers, or runtimes.
- Do not modify source. Write only the response file named below.
- Do not reopen R1 findings already confirmed as correct unless a correction
  regressed them.

## Allowed files

1. `docs/reports/NC-20260905-007-CLAUDE-CAPACITY-PROOF-RESPONSE-R1.md`
2. `scripts/verify-student-enrollment-disposable.mjs`
3. `scripts/verify-student-enrollment-disposable.d.mts`
4. `scripts/verify-academy-capacity-disposable.mjs`
5. `scripts/verify-academy-capacity-disposable.d.mts`
6. `src/academy-capacity-disposable-verifier.test.ts`
7. `data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql`
8. `data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql`

## Corrections to challenge

1. Before clearing migration-143 capacity evidence, the proof explicitly
   deletes migration-142 class assignments whose `delivery_block_key` belongs
   to a migration-143 delivery block. It asserts that deletion, then uses
   ordered `DELETE` statements for the seven capacity tables. No implicit
   cascading is used. The proof accurately claims that the enrollment order
   foundation remains, not that the coupled assignment row remains.
2. `databaseExists` is exported from the base verifier and declared in its
   type surface. The capacity CLI captures the exact generated database name,
   runs the proof, then refuses success if that database still exists.

## Current mechanical evidence

- Focused verifier and migration tests: 25 passed.
- With hostile ambient `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGPASSWORD`, the
  capacity CLI used pinned local PostgreSQL 16.15 and returned `ok: true`.
- Exact generated-prefix database residue was zero immediately before and
  after that CLI run.

## Response

Write only
`docs/reports/NC-20260905-007-CLAUDE-CAPACITY-PROOF-RESPONSE-R2.md`.

Report material findings only, ordered by consequence, with exact file and
evidence references. If both corrections hold and no material regression is
present, say `NO MATERIAL FINDINGS` and briefly name the checks performed.
