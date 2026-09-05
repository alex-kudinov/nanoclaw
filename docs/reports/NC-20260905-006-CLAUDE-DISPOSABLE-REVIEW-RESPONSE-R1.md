# NC-20260905-006 bounded disposable-verifier review R1 — response

## Verdict

Not clean. One high-severity finding (unpinned connection target) and two
lower-severity findings (unverified failure reasons; incomplete
ownership/grant coverage). No finding indicates the migration itself is
unsafe, and no finding indicates the live proof already run was actually
against the wrong server — but the script as written does not *guarantee*
that outcome for a future run.

## Material findings (ordered by severity)

### 1. HIGH — connection target is never pinned to local; ambient `PG*` env vars are trusted

`scripts/verify-student-enrollment-disposable.mjs:32-37` (`run()`) and every
caller of it (`psql`, `maintenanceQuery`, `createDatabase`, `dropDatabase`)
pass `env: process.env` verbatim to `spawnSync` with no `-h`/`-p`/`PGHOST`
override and no post-connect check of which server was actually reached.
`postgresBin()` (line 22) only resolves a local *client binary* path; it says
nothing about which *server* that client talks to.

`assertDisposableDatabaseName` (lines 90-98) and the pre-flight
`nanoclaw_admin` role check (lines 430-434) validate the **name** and the
**role**, not the **host**. `nanoclaw_admin` is the same role name used for
production `nanoclaw_business` access (`data/business/CLAUDE.md`, "Connection"
section), and this project's own documented workflow exports `PGPASSWORD`
and connects with `-h 192.168.64.1 -U nanoclaw_admin` for manual admin
sessions. If a shell that has run that documented workflow (or has
`PGHOST`/`PGPASSWORD`/`PGPORT` exported for any other reason) invokes this
script, `createdb`, `psql`, and `dropdb` will silently target that remote
server instead of the intended local instance. Every accepted-scope guarantee
("local PostgreSQL database", "no `nanoclaw_business` ... access") depends
entirely on the ambient environment happening to be clean — the script does
not verify or enforce it. This is precisely the "connect to an unsafe/existing
database" risk the review was scoped to catch.

**Smallest correction:** in `run()`, build the child `env` from an explicit
allowlist (e.g. `PATH`, `HOME`, `USER`, `NANOCLAW_DISPOSABLE_PG_BIN`) instead
of spreading `process.env`, so `PGHOST`/`PGPORT`/`PGDATABASE`/`PGPASSWORD`
cannot leak in, and additionally assert
`maintenanceQuery('SELECT inet_server_addr()')` returns empty (Unix-socket,
loopback) before `createDatabase` runs, throwing if it does not.

### 2. MEDIUM — expected constraint/trigger failures are verified by exit code only, not by reason

`verifySyntheticConstraints` (lines 348-391) issues three `psql(...,
{ expectFailure: true })` calls (seat participant/state invariant, source-ref
uniqueness, append-only trigger). `run()`'s `expectFailure` branch (lines
38-42) only checks `result.status !== 0` — it never inspects `stderr` for the
specific constraint/trigger name or message. This is inconsistent with the
populated-rollback check three lines later (lines 445-449), which does regex
-match the expected refusal text. A typo'd column/table name, an unrelated
permission error, or a different constraint firing first would also produce a
nonzero exit and be accepted as proof of "the intended constraint refused,"
while the returned proof object's `expectedConstraintRefusals: 3`
(lines 469, and `.d.mts` line 12) implies each of the three specific business
rules was individually confirmed — it was not.

**Smallest correction:** extend `run()`'s `expectFailure` option to accept an
`expectedMessage` regex and pass one per call (e.g. the CHECK/unique
constraint name for the first two, `/append-only fixture relation/` for the
third), the same pattern already used for the rollback refusal.

### 3. LOW-MEDIUM — ownership/grant proof omits migration-142 sequences

`verifyInstalledShape` (lines 177-220) restricts its owner/grant queries to
`c.relkind='r'` (tables) and `c.relkind='v'` (the view). Migration 142
(`142_student_enrollment_dark_foundation.sql:335-351`) explicitly re-owns and
re-grants 13 sequences via a separate `DO` loop. Nothing in the verifier
checks `relkind='S'`, so a sequence silently omitted from that array (left
owned by the connecting superuser instead of `nanoclaw_admin`, or left with a
stale grant) would not fail any assertion in this proof.

**Smallest correction:** add the same owner/grant `expectScalar` pattern for
`c.relkind='S'` restricted to `c.relname LIKE 'student_%_id_seq'`.

## Checks performed against the request's challenge list

- (1) Name validation: regex-anchored allowlist (`^nc_student_enrollment_disposable_[a-z0-9_]{8,80}$`)
  plus a keyword denylist rejects `postgres`, `template*`, `nanoclaw_business`,
  production-like names, punctuation/hyphenated names, and option-injection
  attempts (nothing matching the pattern can start with `-`) — confirmed sound.
- (2) All `spawnSync` calls use argument arrays with no `shell: true` and no
  string concatenation into a shell command — confirmed sound.
- (3) `finally { if (created) dropDatabase(database); }` only drops when this
  invocation actually created the target, including the pre-existing-name
  refusal path — confirmed sound.
- (4) No `CREATE ROLE`/`ALTER ROLE`; only `ALTER TABLE/SEQUENCE/FUNCTION ...
  OWNER TO nanoclaw_admin` against an already-existing role; no credential
  material is read, constructed, or printed — confirmed sound.
- (5) Constraint/trigger expected failures are exit-code-only — **finding 2**.
  Rollback refusal message is reason-checked — confirmed sound.
- (6) 13 synthetic inserts map 1:1 to the 13 `student_%` tables; health-view
  counts (`1|1|1|1|1`) are live aggregate queries, not hardcoded — confirmed
  sound.
- (7) Owner/grant checks miss sequences — **finding 3**.
- (8) Empty rollback, reapply, second rollback, and residue are all live
  `pg_class` count queries (`verifyUninstalled`), not inferred from exit
  status; the top-level `databaseExists` check after `finally` independently
  confirms drop — confirmed sound.
- (9) Error messages only surface truncated `stderr`/`stdout` from local
  `psql`/`createdb`/`dropdb`; no host, password, or token is constructed or
  printed anywhere in the script — confirmed sound, contingent on finding 1.
