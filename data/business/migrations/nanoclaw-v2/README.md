# NanoClaw Schema v2 Migration

Ships the `business_v2` PostgreSQL schema as a **dormant** replacement for the ad-hoc `public.*` tables. No agent reads or writes it until Plan #3.

## How to Run

**Prerequisites:** PostgreSQL 16.x, `citext` extension installed, Mac peer auth on `/tmp` socket, `xbohdpukc` member of `nanoclaw_admin`.

```bash
# 1. Pre-flight & stop daemons (T0 — see plan for full script)
# 2. Run migration
./run_migration.sh
# 3. Validate
./validate.sh
# 4. Restart daemons (T19 — see plan for restart script)
```

## File → Task → Execution Order

| File | Task | Description |
|------|------|-------------|
| `01_extensions.sql` | T1 | Verify citext, create schema |
| `02_lookups.sql` | T2 | 14 lookup tables with seeds |
| `03_parties.sql` | T3 | parties + party_emails |
| `04_roles.sql` | T4 | party_roles, party_contact_roles, party_relationships |
| `05_engagements.sql` | T5 | engagements + engagement_participants |
| `06_programs.sql` | T6 | programs, program_variants, variant_enrollments + deferred FK |
| `07_pipeline.sql` | T7 | pipeline_entries + pipeline_stage_history |
| `08_interactions.sql` | T8 | interactions + attachments |
| `09_documents.sql` | T9 | documents + document_line_items |
| `10_outbox.sql` | T10 | plutio_outbox + plutio_refs |
| `11_helpers.sql` | T11 | 14 functions (8 callable + 6 trigger) |
| `12_triggers.sql` | T12 | 19 trigger installations |
| `13_views.sql` | T13 | 6 agent-facing views |
| `14_grants.sql` | T14 | Role grants + permission boundary |
| `90_smoke_tests.sql` | T15 | 20 smoke tests (transactional, no data persists) |
| `validate.sql` | T16 | AC-1 through AC-20 assertions |

`run_migration.sh` executes two- and three-digit ordered files matching
`[0-9][0-9]*_*.sql` in version-sort order. It includes `90_smoke_tests.sql` and
incremental migrations through the latest tracked number. `validate.sql` runs
separately via `validate.sh`.

## Incremental migration state

Repository presence is portable source history, not evidence that a migration
is live. Inspect the running schema and shared active-work/changelog records
before applying anything.

- migrations 114-117 are owned by separately tracked Procurement, CNPC, and
  Chaos tasks with their own deployment state;
- migration 118 (`NC-20260815-010`) is the unapplied, host-only Company OS work
  ledger foundation;
- `rollback_118_company_work_ledger.sql` is deliberately not auto-discovered
  and refuses to erase any recorded work history.

## Rollback

See the plan document for the single-source-of-truth rollback procedure. Quick version:

```bash
# Pre-check for external dependencies
psql -h /tmp -U xbohdpukc nanoclaw_business --no-psqlrc -f rollback_precheck.sql

# Drop (if pre-check clean)
psql -h /tmp -U xbohdpukc nanoclaw_business --no-psqlrc -c "DROP SCHEMA business_v2 CASCADE"

# Full restore (rare)
pg_restore -h /tmp -U xbohdpukc -d nanoclaw_business --clean --if-exists /tmp/nanoclaw-business-predeploy-<ts>.dump
```

## Cross-Plan Invariants

1. Schema name `business_v2` never renamed
2. Schema owner `nanoclaw_admin` never changed
3. Migration executor `xbohdpukc` via Mac peer auth
4. Base tables never granted SELECT/INSERT/UPDATE/DELETE to agent roles (views + helpers only)
5. `parties_id_seq START WITH 10000` — no ALTER until Plan #4
6. 14 helper functions: later plans may ADD but never REPLACE without migration
7. `app.backfill_mode='true'` bypass honored by 5 trigger functions
8. DEFAULT PRIVILEGES grant nothing to agent roles

## Known Limitations

1. Audit columns show `'unknown'` until Plan #3 wires `withAgentContext()`
2. `business_v2` ships DORMANT — no agent uses it until Plan #3
3. macOS-only (launchd commands are Darwin-specific)

## Follow-Up Plans

- Plan #2: Plutio reaper implementation
- Plan #3: Agent cutover to `business_v2`
- Plan #4: Data backfill from `public.*` into `business_v2`
