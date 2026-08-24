# NC-20260824-005 Community student-lifecycle dark deployment

Date: 2026-08-24
Program: `program:company-os`
Work item: `work:student-lifecycle-community-dark-deploy`
Evidence class: reviewed source, immutable release, production backup,
additive schema, service health, default-off and non-interference proof

## Authorized boundary

The owner authorized implementation and deployment after Claude convergence,
while keeping Circle deferred. This release could build and verify the exact
reviewed artifact, back up production, apply only migration 134, activate the
main service with student lifecycle disabled, and read back health, schema,
permissions, emptiness, non-interference, and rollback readiness.

No n8n workflow was imported or activated; no Heartbeat registration or legacy
receiver changed; Circle was not accessed; no lifecycle credential was set; no
lifecycle event, action, message, certificate, manufactured canary, or minion
authority was created.

## Review and release

- Claude Sonnet/high plan review identified four material controls, all applied
  before source implementation.
- Implementation R1 identified unstable redelivery keys and relay/identity
  secret coupling. Both were fixed; correction R2 session
  `79950a5d-90c2-4df4-837a-d3c205296988` returned `NO MATERIAL FINDINGS`.
- Exact pushed implementation:
  `7364accd53aed9e1808dc0882592312a0e1ac5ae`.
- Source tree: `6601c60fda4294bf379ca31720c894e3d4158cdd`.
- Artifact: 904 files,
  `4639355fe47e7ee7a37bcb52f000aaf7e4887e53aa1b798900fb8a59006ec738`.
- Archive:
  `162f05e2bf6843718693c0618ec5c275c66a846f8df118eafebc0fb9b32c6397`.
- Local and Mini runtime verification passed under Node 22.23.2; the archive
  contains the exact migration and guarded rollback 134 files.
- Root typecheck passed. Full suite: 3,161 passed / 14 skipped with the
  unchanged pre-existing CNPC wrapper assertion failure. Release-critical
  tests passed 742/742; the independent runner built and passed 43/43.

## Backup and migration

- A natural pre-deploy zero-work drain held across four consecutive samples.
- Mode-0700 backup directory:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-005-20260824T1712Z`.
- Custom PostgreSQL dump SHA-256:
  `fb402d32021f65533413b9d4b02d4a5055ed15bf14d47a89fe4ad94b6a2476fc`.
- WAL-safe SQLite backup SHA-256:
  `7c7601999e60f47bb6508cb28b52819fad5c816a3a86953617dec643061bf813`.
- Installed plist backup SHA-256:
  `7868a72293c69e2b9f5f06401b07126ee653788e44237b1755b4d0b50c46d56e`.
- Migration 134 applied once from the verified release. All seven tables are
  empty; all 16 lifecycle relations/sequences have the intended admin owner;
  non-admin table and sequence grants are zero; three user triggers are
  enabled; wrong function owners are zero.

## Activation and live readback

- Pre-deploy release was exact `778545b353b2…`, Node 22.23.2, one listener,
  Gmail/Slack connected, zero active webhook work, and no lifecycle schema or
  lifecycle environment keys.
- Activation dry-run named only
  `EnvironmentVariables.NANOCLAW_CODE_ROOT`,
  `EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT`, and
  `ProgramArguments.1`.
- One applied activation retained rollback plist
  `com.nanoclaw.plist.rollback-778545b353b2-2026-08-24T17-15-41-620Z`.
- Live PID 24053 reports release mode, verified exact commit/tree/artifact/code
  root, Node 22.23.2, one listener, Gmail and Slack connected, zero waiting
  groups, zero Slack outgoing backlog, and the unchanged 273-line error
  baseline.
- Live health reports `studentLifecycle.enabled=false`, workspace `community`,
  `actionConsumers=false`, and `circle=false`; the operational environment has
  zero `STUDENT_LIFECYCLE_*` keys.
- Normal Chief, Mailman, and Sales work arrived after restart and ran on the
  new release without queue buildup or new daemon errors. It was not
  interrupted to manufacture an empty-active snapshot.
- The generic webhook ledger advanced naturally from 4,756 to 4,758 handled
  rows with zero active rows. All seven lifecycle tables remain at zero rows.

## Rollback and outcome boundary

Service rollback is the retained plist pointer to exact release `778545b3…`.
The guarded rollback 134 file is manifest-bound and remains eligible while all
seven lifecycle tables are empty; it was not executed in production. Database,
SQLite, and installed-plist backups are independently readable.

This proves the disabled Community substrate is deployed and non-interfering.
It does not prove Heartbeat/n8n ingestion, duplicate delivery, quarantine,
reconciliation, provider cutover, lifecycle actions, Circle, or a natural
student-lifecycle outcome. Those remain separately authorized work.
