# NC-20260905-006 correction review R2 — response

## Verdict

NO MATERIAL FINDINGS

## Verification against each R1 finding

### 1. HIGH — connection target pinning — CLOSED

- All four `spawnSync` call sites now pass explicit `--host /tmp --port 5432`:
  `psql()` (`scripts/verify-student-enrollment-disposable.mjs:88-91`),
  `maintenanceQuery()` (lines 108-111), `createDatabase()` (lines 169-172),
  `dropDatabase()` (lines 185-188).
- `run()` no longer spreads `process.env`; every child process gets
  `childEnvironment()` (lines 24-39), an explicit allowlist (`PATH`, `HOME`,
  `USER`, `LANG`, `LC_ALL`, `TMPDIR`, `NANOCLAW_DISPOSABLE_PG_BIN`) with no
  `PG*` entry, so an ambient `PGHOST`/`PGPORT`/`PGDATABASE`/`PGPASSWORD` cannot
  reach `psql`/`createdb`/`dropdb`.
- `runStudentEnrollmentDisposableProof()` queries
  `SELECT CASE WHEN inet_server_addr() IS NULL THEN 'local' ELSE 'remote' END`
  over the pinned maintenance connection (lines 528-532) and throws
  `refusing non-local PostgreSQL server` before `createDatabase(database)` is
  ever called (line 536) — the check runs strictly before database creation,
  as required.
- No remaining call path passes `process.env` or an unpinned host/port.

### 2. MEDIUM — expected failures must be reason-verified — CLOSED

- `run()`'s `expectFailure` branch now hard-requires an `expectedMessage`
  regex and throws `expected failures require an expectedMessage regex` if
  one is not supplied (lines 61-63), so no `expectFailure: true` call can
  silently accept an exit code alone.
- All three constraint calls in `verifySyntheticConstraints` now carry
  matching regexes: the seat check-constraint failure
  (`/new row for relation "student_enrollment_seats" violates check
  constraint/i`, lines 449-452), the duplicate source-ref unique key
  (`/Key \(source_scope, source_object_type, source_object_id\)=/i`,
  lines 465-469), and the append-only trigger
  (`/append-only fixture relation/i`, lines 479-482), which matches the exact
  `RAISE EXCEPTION 'append-only fixture relation'` text defined in the
  fixture trigger (line 210).
- The populated-rollback refusal already carried
  `/rollback refused: student enrollment evidence exists/i` (lines 223-230)
  and is unchanged.

### 3. LOW-MEDIUM — sequence ownership/grant coverage — CLOSED

- `verifyInstalledShape` adds three checks restricted to
  `c.relkind='S' AND c.relname LIKE 'student_%_id_seq'`: a count asserted at
  `'13'` (lines 268-275), non-admin owners asserted at `'0'` (lines 276-285),
  and non-admin `information_schema.role_usage_grants` entries asserted at
  `'0'` (lines 286-294) — following the same `expectScalar` pattern already
  used for tables/view, exactly as the R1 smallest-correction suggested.

## Test-file corroboration

`src/student-enrollment-disposable-verifier.test.ts` asserts (via source
substring checks) the presence of `childEnvironment()`, absence of
`env: process.env`, the `LOCAL_SOCKET`/`LOCAL_PORT` pins, the
`refusing non-local PostgreSQL server` guard, the
`expected failures require an expectedMessage regex` guard, and all three new
sequence-coverage labels (`student sequence count`, `non-admin sequence
owners`, `non-admin sequence grants`) — consistent with the source under
review.

## Scope note

Per the R2 request, migration 142's SQL itself, its rollback file, and any
live database/test execution were not read or run for this review; the
sequence count of 13 checked here is taken as given from the R1 finding text
("Migration 142 ... explicitly re-owns and re-grants 13 sequences"), not
re-derived. No accepted migration design or adjacent work was reopened.
