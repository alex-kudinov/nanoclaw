# NC-20260905-006 — Student enrollment disposable PostgreSQL proof

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Work item: `work:student-enrollment-disposable-schema-proof`

## Authority and lineage

The owner said to proceed with the next synthetic schema proof. The current
program selected the already-authorized enrollment proof before the dependent
capacity proof. The revision-182 handoff was rejected as stale against revision
184 and was used only as historical safety evidence. Its suggested task ID
`NC-20260905-004` conflicted with the accepted capacity-architecture task, so
this execution used collision-free `NC-20260905-006`.

Source is the reviewed migration-142 branch tip `deac91a8`. Production
`nanoclaw_business`, providers, real students, roster, payments, runtime,
deployment, and communications were outside authority.

## Verifier

`scripts/verify-student-enrollment-disposable.mjs`:

- accepts only `nc_student_enrollment_disposable_*` names and refuses malformed,
  production-like, or existing targets;
- pins every PostgreSQL process to Unix socket `/tmp`, port 5432;
- passes an allowlisted child environment with no ambient `PG*` variables;
- confirms `inet_server_addr() IS NULL` before database creation;
- uses the existing `nanoclaw_admin` role and never creates/alters a role;
- installs only structure-only `parties` and append-only-trigger prerequisites;
- applies migration 142 and checks 13 tables, one view, 13 sequences, ownership,
  and zero non-admin table/sequence grants;
- creates one synthetic chain covering all 13 migration tables;
- reason-matches an invalid seat, duplicate source identity, append-only update,
  and populated rollback refusal;
- proves the failed populated rollback retains data;
- truncates synthetic rows, proves empty rollback, reapplies, proves empty shape,
  rolls back again, and drops the database in `finally`.

## Live synthetic proof

The corrected verifier was intentionally run with poisoned parent values for
`PGHOST`, `PGPORT`, `PGDATABASE=nanoclaw_business`, and a dummy password. Those
values were discarded; the pinned local PostgreSQL 16.15 socket completed:

```json
{"ok":true,"serverVersion":"16.15 (Homebrew)","tables":13,"views":1,"syntheticChains":1,"expectedConstraintRefusals":3,"populatedRollbackRefused":true,"emptyRollbackPassed":true,"reapplyPassed":true,"databaseRemoved":true}
```

Exact prefix residue was zero before the rerun and zero afterward.

## Review

Claude Sonnet/high R1 found three material verifier defects:

1. unpinned ambient PostgreSQL target;
2. expected failures checked by exit status without matching their reason;
3. omitted sequence ownership/grant verification.

All were corrected. Narrow R2 returned `NO MATERIAL FINDINGS`.

- R1: 4 model calls; 79,434 cache-create; 150,780 cache-read; 18,447 output;
  88,000 maximum context tokens.
- R2: 4 model calls; 48,968 cache-create; 130,772 cache-read; 7,090 output;
  57,534 maximum context tokens.

## Verification

- Node syntax and package JSON: pass.
- Pinned Node typecheck: pass.
- Focused verifier/migration tests: 12/12.
- Full root: 3,505 passed / 32 skipped / two exact predecessor failures:
  the CNPC wrapper-literal assertion and date-sensitive Trafft freshness fixture.
- Database residue: zero.

## Boundary preserved

Only uniquely generated local disposable databases were created, populated
with synthetic rows, and dropped. No cluster role changed. No production or
external system was accessed or mutated. No source migration was applied to a
persistent business database and nothing was deployed.

## Next gate

`work:academy-capacity-disposable-schema-proof` may proceed only under its own
accepted authorization. It must use this corrected connection/cleanup verifier
boundary and prove migrations 142 and 143 together before any real-data
reconciliation.
