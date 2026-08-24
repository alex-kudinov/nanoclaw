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

| File                  | Task | Description                                                   |
| --------------------- | ---- | ------------------------------------------------------------- |
| `01_extensions.sql`   | T1   | Verify citext, create schema                                  |
| `02_lookups.sql`      | T2   | 14 lookup tables with seeds                                   |
| `03_parties.sql`      | T3   | parties + party_emails                                        |
| `04_roles.sql`        | T4   | party_roles, party_contact_roles, party_relationships         |
| `05_engagements.sql`  | T5   | engagements + engagement_participants                         |
| `06_programs.sql`     | T6   | programs, program_variants, variant_enrollments + deferred FK |
| `07_pipeline.sql`     | T7   | pipeline_entries + pipeline_stage_history                     |
| `08_interactions.sql` | T8   | interactions + attachments                                    |
| `09_documents.sql`    | T9   | documents + document_line_items                               |
| `10_outbox.sql`       | T10  | plutio_outbox + plutio_refs                                   |
| `11_helpers.sql`      | T11  | 14 functions (8 callable + 6 trigger)                         |
| `12_triggers.sql`     | T12  | 19 trigger installations                                      |
| `13_views.sql`        | T13  | 6 agent-facing views                                          |
| `14_grants.sql`       | T14  | Role grants + permission boundary                             |
| `90_smoke_tests.sql`  | T15  | 20 smoke tests (transactional, no data persists)              |
| `validate.sql`        | T16  | AC-1 through AC-20 assertions                                 |

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
- migration 118 is the host-only Company OS work-ledger foundation created by
  `NC-20260815-010`; `NC-20260816-001` records its separately backed-up,
  explicit production apply and live-verified default-off observer deployment;
- migration 119 is the host-job extension created locally by
  `NC-20260816-016`; `NC-20260816-017` records its separately backed-up,
  explicit production apply and bounded default-off projection proof;
- migration 120 is the host-only Company Work operator-attention state created
  and activated by `NC-20260816-018`; it grants no agent access and never
  mutates source work. See `docs/COMPANY-OS-EXCEPTION-LOOP.md`;
- migration 121 is the normalized trigger occurrence foundation created by
  `NC-20260817-001` and applied/live-proved for one scheduled-time boundary by
  `NC-20260817-002`. It stores content-free identities/hashes only; the
  one-boundary configuration is now disabled and no task/action authority was
  granted. See `docs/COMPANY-OS-TRIGGER-CONTRACT.md`;
- migration 122 is the source-inventory and watermark target created by
  `NC-20260817-003` and applied dark under exact release `070cde38` by
  `NC-20260817-004`. Its immutable source definitions, versioned cursor state,
  and append-only checkpoint/gap/reconciliation history are live but empty and
  admin-only. It remains unwired, registers no source, and grants no agent or
  task/action authority;
- migration 123 is the inbound-Gmail reconciliation shadow target created by
  `NC-20260817-006` and applied dark under `NC-20260817-013`. Its admin-only
  resumable snapshot state plus append-only page and per-message-ID receipts
  are live with zero rows and zero non-admin grants. The one active opaque page
  token is cleared at terminal or invalidation; append-only history stores
  token hashes only. Disposable PostgreSQL proves a 21-page/10,001-candidate
  terminal attempt, replay stability, permissions, and guarded rollback. Live
  schema presence is not source registration, source bootstrap, a Gmail call,
  shadow evidence, cursor wiring, message recovery, or action authority;
- migration 124 is the separate, gap-independent, host-admin-only mailbox audit
  evidence target applied by `NC-20260818-002`; it cannot advance a watermark
  or recover a message;
- migration 125 is the admin-only program-facts observation and condition-work
  extension applied by `NC-20260820-002`; fact correction remains owner work;
- migration 126 is the append-only Sales outcome-quality assessment chain
  applied dark by `NC-20260820-006`; NC-007 adds a separately gated one-receipt
  producer, but live schema/command presence is not assessment evidence;
- migration 127 is NC-20260820-008's admin-only outcome-review packet delivery
  and decision ledger. The runtime producer is default-off and the migration
  alone does not post Slack, classify an outcome, read Gmail, or grant any
  agent/action authority;
- migration 128 is NC-20260820-009's narrow outcome-review reaction vocabulary
  extension: Slack `+1` is an explicit configured-operator `clean` decision on
  the exact bound packet, not an inference from silence or another message;
- migration 129 is NC-20260821-001's live content-free Company Work exception
  dispatch lifecycle. It binds an exact Slack packet to one brief/work version,
  records router pickup and bounded Chief-turn outcome, suppresses a completed
  unchanged fingerprint, and grants no agent access or source/work authority;
- migration 130 is NC-20260821-002's live, empty, content-free follow-up case and
  changed-evidence event projection for Sales conversations, proposal
  signatures, and receivables under exact release `a939af5a`. It is unwired and grants no agent, source,
  scheduler, draft, approval, Plutio, payment, or send authority;
- migration 131 is NC-20260821-002's live content-free operator-decision
  extension under exact release `6b9b5f27`. It permits one `declined` receipt with a SHA-256 operator
  fingerprint on the existing append-only event ledger; it does not read Slack,
  mutate pipeline/source state, create a draft, or send;
- migration 132 is NC-20260822-017's local, unapplied healer-resolution
  Company Work extension. Its default-off host writer and report support are
  runtime-unwired; schema/source presence does not authorize a production
  migration, live incident projection, Slack presentation, healer action, or
  deployment;
- migration 133 is NC-20260823-006's live, empty, host-owned Contador
  payment/refund fulfillment ledger. It creates one current case per Stripe
  account/payment-intent pair plus append-only opaque aliases and minimized
  stage receipts. It grants only `nanoclaw_admin`; source presence does not
  process or replay a Stripe event, write Sheets/public payments, post Slack,
  repair history, or grant accounting authority. Exact release
  `b131071c74fc` applied it admin-only after backup and a zero-work drain;
- migration 134 is NC-20260824-004/005's live Community-only student
  lifecycle dark foundation. It creates admin-only catalog, identity-link,
  event, multi-axis enrollment, state-history, reconciliation-run, and
  exception relations plus aggregate views. It has no catalog seeds, Circle
  value, provider registration, schedule, action outbox, recipient/message,
  group/minion grant, or runtime activation. Disposable PostgreSQL proves
  apply, zero non-admin grants, empty rollback, reapply, store projection, and
  populated-history rollback refusal. Exact release `7364accd53ae` applied it
  with the runtime disabled and all seven relations empty;
- migration 135 is NC-20260824-006's live checkout-recovery shadow control.
  It creates separate admin-only cases, exact provider/source aliases,
  append-only normalized events, and append-only receipts for the Tandem
  website and both fixed Stripe accounts. It contains no send outbox, message,
  CRM/booking/student/accounting write, or agent grant. Tandem website cases
  alone receive a 45-minute host timeout; Heartbeat cases are provider-event
  driven. Exact reviewed descendants run it in production shadow mode;
- migration 136 is NC-20260824-009's prospective two-reminder extension. It
  adds policy-v2 locale/safe-return/product context plus separate per-touch
  intent state and append-only send receipts. It is default-off, admin-only,
  cutoff-gated, and contains no historical replay. Applying it does not
  authorize a provider event or customer email; runtime mode, templates, flow,
  canary, and cutover remain separate gates;
- `rollback_118_company_work_ledger.sql` is deliberately not auto-discovered
  and refuses to erase any recorded work history;
- `rollback_119_company_work_job_runs.sql` is also non-auto-discovered and
  refuses to narrow the schema while any host-job history exists;
- rollbacks 120-135 are non-auto-discovered and refuse to erase populated
  operator-attention, trigger-occurrence, source/watermark, Gmail-shadow,
  mailbox-audit, program-facts, outcome-quality, or outcome-review history;
  rollback 128 specifically refuses once any durable `+1` decision exists,
  rollback 129 refuses once any packet/attempt evidence exists, and rollback
  130 refuses once any follow-up case/event evidence exists; rollback 131
  refuses once any operator-decision evidence exists; rollback 132 refuses once
  any healer-resolution item or observation exists; rollback 133 refuses once
  any Contador fulfillment case, alias, or receipt exists; rollback 134 refuses
  once any lifecycle catalog, identity, event, enrollment, reconciliation,
  history, or exception evidence exists; rollback 135 refuses once any checkout
  recovery case, alias, event, or receipt exists; rollback 136 refuses once any
  routing context, touch intent, or send receipt exists.

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
