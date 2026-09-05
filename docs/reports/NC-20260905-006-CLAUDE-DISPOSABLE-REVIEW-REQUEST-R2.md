# NC-20260905-006 correction review R2

## Objective

Verify only that all three R1 findings are materially closed. Do not reopen
accepted migration design or propose adjacent work.

Write:
`docs/reports/NC-20260905-006-CLAUDE-DISPOSABLE-REVIEW-RESPONSE-R2.md`

## Allowed files

Read only:

1. this request;
2. `docs/reports/NC-20260905-006-CLAUDE-DISPOSABLE-REVIEW-RESPONSE-R1.md`;
3. `scripts/verify-student-enrollment-disposable.mjs`;
4. `src/student-enrollment-disposable-verifier.test.ts`.

Write only the named response. No Bash, web, MCP, database, environment,
credential, or other file access.

## Corrections to verify

1. Every `psql`/`createdb`/`dropdb` call now receives explicit
   `--host /tmp --port 5432`. Child processes receive an allowlisted environment
   without any ambient `PG*` variable. Before database creation, the verifier
   also requires `inet_server_addr() IS NULL` through the pinned maintenance
   connection.
2. Every expected failure requires an `expectedMessage` regex. The invalid seat
   check matches the exact relation/check failure, duplicate source identity
   matches the exact `(source_scope, source_object_type, source_object_id)` key,
   the append-only test matches its fixture exception, and populated rollback
   matches the exact rollback-refusal message.
3. Installed-shape proof now verifies exactly 13 migration-142 sequences,
   `nanoclaw_admin` ownership, and zero non-admin sequence usage grants.

## Independent proof after corrections

- Typecheck: pass.
- Focused verifier/migration tests: 12/12.
- The actual verifier was run with deliberately poisoned parent values
  `PGHOST=192.0.2.1`, `PGPORT=6543`, `PGDATABASE=nanoclaw_business`, and a dummy
  password. It still completed against local PostgreSQL 16.15 because child
  commands discard those variables and pin the socket/port.
- Result: 13 tables, one view, one synthetic chain, three reason-verified
  constraint refusals, populated rollback refusal, empty rollback, reapply,
  cleanup all passed.
- Exact prefix residue count was zero before and after.

## Required response

Return `NO MATERIAL FINDINGS` if all R1 findings are closed. Otherwise report
only the remaining material defect with exact evidence and smallest correction.
