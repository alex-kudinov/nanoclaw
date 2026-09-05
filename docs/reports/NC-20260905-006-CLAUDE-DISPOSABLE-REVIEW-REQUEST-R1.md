# NC-20260905-006 bounded disposable-verifier review R1

## Objective

Review the credential-free PostgreSQL verifier for material safety or proof
defects. Report only issues that could connect to an unsafe/existing database,
leave a disposable database behind, mutate cluster roles, expose credentials,
misclassify an unexpected failure as an expected constraint/rollback refusal,
fail to test migration 142 as claimed, or overstate the evidence.

Write the response to:
`docs/reports/NC-20260905-006-CLAUDE-DISPOSABLE-REVIEW-RESPONSE-R1.md`

## Accepted scope

- The verifier may create and drop only a newly generated local PostgreSQL
  database whose name begins `nc_student_enrollment_disposable_`.
- It must refuse production-like, malformed, or already-existing names.
- It may use only the already-existing local `nanoclaw_admin` role; it must not
  create or alter cluster roles.
- It installs only a structure-only `business_v2.parties` table and
  `fn_company_work_append_only()` prerequisite inside the disposable database.
- It applies migration 142, inserts synthetic-only rows, verifies expected
  valid and invalid behavior, proves populated rollback refusal preserves data,
  truncates synthetic rows, proves empty rollback, reapplies, rolls back again,
  and drops the database in `finally`.
- No `nanoclaw_business`, provider, real student, roster, payment, runtime,
  deployment, or communication access is authorized.
- PostgreSQL 16.15 proof already returned: 13 tables, one view, one synthetic
  chain, three expected constraint refusals, populated rollback refused, empty
  rollback passed, reapply passed, database removed. A separate maintenance
  query found zero matching disposable databases afterward.

## Allowed files

Read only:

1. this request;
2. `scripts/verify-student-enrollment-disposable.mjs`;
3. `scripts/verify-student-enrollment-disposable.d.mts`;
4. `src/student-enrollment-disposable-verifier.test.ts`;
5. `data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql`;
6. `data/business/migrations/nanoclaw-v2/rollback_142_student_enrollment_dark_foundation.sql`.

Write only the named response. Do not use Bash, web, MCP, databases,
environment files, credentials, or any other repository path.

## Checks to challenge

1. Name validation cannot accept `postgres`, `template*`,
   `nanoclaw_business`, production-like names, option injection, punctuation,
   or an existing generated-prefix database.
2. `spawnSync` calls use argument arrays and no shell interpolation.
3. Cleanup runs after every post-creation failure and does not drop a target
   that this invocation did not create.
4. The proof does not create/alter roles or obtain secrets.
5. Expected-failure calls prove the intended constraint/trigger/rollback
   reason rather than merely accepting any nonzero exit.
6. The valid synthetic chain satisfies all 13 relations and the health counts
   support the stated proof.
7. Ownership/grant checks cannot silently miss new migration-142 objects.
8. Empty rollback/reapply/second rollback and final residue checks are real,
   not implied by command exit alone.
9. Errors do not print credentials or raw sensitive data.

## Verification already run

- Node syntax and package JSON: pass.
- Typecheck: pass.
- Focused verifier/migration tests: 11/11.
- Live disposable PostgreSQL 16.15 proof: pass with zero residue.

## Required response

Give a concise verdict and material findings ordered by severity with exact
file evidence and the smallest correction. If none exist, say exactly
`NO MATERIAL FINDINGS` and list the safety/proof checks performed.
