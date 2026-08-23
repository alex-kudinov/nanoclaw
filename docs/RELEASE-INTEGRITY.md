# NanoClaw release integrity

Status: authoritative build, activation, verification, and rollback contract
Owner: host operations
Introduced by: `NC-20260730-006`

## Purpose

Production must execute one reviewed commit under one exact Node runtime. A
successful TypeScript build is not deployment proof, and a hand-edited
`dist/` directory is not a release.

This contract prevents the failure mode exposed by `NC-20260730-005`: the Mac
Mini's compiled Gmail boundary contained production-only patches that were not
present in its source checkout, so rebuilding from that checkout would have
silently removed security and delivery fixes.

## Release identity

`npm run release:build` creates:

- `dist/`, compiled from production source only;
- `dist/release-manifest.json`, containing the exact Git commit, source-tree
  hash, build time, Node pin, build runtime, and digest/file count of all
  compiled files;
- `.release/nanoclaw-<commit>.tar.gz`, containing the compiled artifact and the
  tracked runtime inputs required by the daemon and agent containers;
- `RELEASE.json` and `FILES.sha256` inside the archive.

The archive includes tracked `container/`, `facts/`, `groups/`, and
`knowledge/` bytes plus the deterministic program-fact sync/check command.
When a release contains `knowledge/agents/<group>`, the host mounts that
manifest-covered directory read-only at `/workspace/extra/knowledge` and
suppresses any mutable configured mount targeting the same container path.
Older releases without packaged knowledge retain the configured operational
mount so rollback remains viable. `FILES.sha256` therefore attests the group
prompt and the procedures to which it delegates as one release identity.

NC-20260821-006 crossed the dark follow-up-evidence release boundary under
exact release `8c4e3c2b8d78104421b6bf17cf21ff05359b4b3c`, source tree
`5511342c361e8841ecef9cb41530424521b176b4`, 844 compiled files, artifact
SHA-256 `f3da264f381008e7a58094e8acb9391237d6ab6cb6fafecaa95113093583fb73`,
and archive SHA-256
`06b89c37e9360028fdcf1cf3db68a2a8c2e8eea91c98bfc43c8fbd87c42c3e20`.
Fresh local and Mini extraction verified the same bytes under Node 22.23.2. A
zero-work drain and mode-0600 WAL-safe SQLite/plist backup preceded an exact
three-pointer activation retaining rollback to `e01c9228`. Healthy PID 53945
reports the exact release/code root, one listener, connected Gmail/Slack, and
empty queues/containers. The release-owned read-only follow-up dry run returned
zero source errors across 191 observations and eight internal Contador reviews;
no projection, Slack card, draft, approval, source mutation, schedule change,
or customer action ran. The legacy daily Sales task remains paused. Exact
backup, rollback, test-baseline, and live-read receipts are in
`docs/ENGINEERING-CHANGELOG.md`.

Beginning with NC-017, the archive also binds migration 119 and its guarded
rollback as exact regular files. This makes the reviewed bytes transportable
and independently verifiable; it does not apply the migration. Database backup,
daemon drain, one-file application, structural validation, and rollback policy
remain separate recorded operations.

Beginning with `NC-20260822-017`, the archive also binds migration 132 and its
history-preserving rollback. The corresponding host adapter defaults off and
is not daemon/scheduler/Slack/action wired. A release that contains these bytes
must apply migration 132 before activating the new Company Work report because
that report reads the new observation table. Deployment must retain
`COMPANY_HEALER_WORK_ENABLED=0`, verify the table/constraint/trigger/permission
shape, prove no healer-resolution rows were created, and compare protected
Company Work aggregates before and after activation. Bundling or applying the
migration does not authorize live incident projection, owner-work
presentation, remediation, or another healer action.

`NC-20260823-001` crossed that exact dark boundary under release
`97026492b85e1fe86ea9387d2bb3c9dc74019546`, source tree
`f8e9ddb4f4d4338f7eb7f537a00876aeb20b01ad`, 876-file artifact SHA-256
`fe170e94ceca79cd3b67f9a8bd5bd1fd6a32811000c554d475710aa073d09fc3`,
and archive SHA-256
`c840ee53a8157534c2337e8fe5c592e28f35d3d4ccfc0f4951848ac6556c44d0`.
After a zero-work drain and affected-state backup, migration 132 applied empty
and admin-only; activation retained rollback to exact release `1f474f90`.
Independent live proof shows the intended release/code root/Node, one listener,
connected Gmail/Slack, empty queues, disabled adapter, empty healer report,
unchanged protected Company Work fingerprints, and no new error lines. This
dark deployment does not authorize live projection or remediation.

`NC-20260823-002` adds two release-bound operations for the separately managed
fast-healer service: `activate-healer-release.mjs` moves its executable and
release identity to one immutable bundle with an exclusive lock, plist backup,
bounded launchd reload, and one clean-cycle proof; `set-company-healer-work.mjs`
performs a value-redacted, backup-producing environment transaction for one
exact source. Both default to dry-run and require exact-host confirmation for
mutation. The main daemon activator remains separate. A fast-healer release
must be deployed with projection off before the one-source config is applied.

NC-20260820-002 crossed the equivalent program-facts release boundary with
exact implementation `8344524cf4a439b84eb792cdf7b4a16b65178a6a`, source tree
`fac86f42aebcaf2e765ec16024fc679e9fa8aca1`, 788 compiled files, artifact
SHA-256 `e257edaab70dfe7fc05b4f5b9a21068aa39ffd8351e385620e0610021a4729b3`,
and archive SHA-256
`5c40601869f7f13df3b0394965214d0a3aa711b1d90a1f4ab98bbdc7f1873f9e`.
The archive verified locally and on the Mini. After a zero-work drain and a
mode-0600 affected-schema backup, exact migration 125 applied and verified
admin-only. Activation retained rollback to `64f1421e`, converged to healthy
PID 38712 on Node 22.23.2, enabled active mode, and cut only the existing
program-facts job to the compiled entrypoint without changing its schedule.
One exact-release canary and one real Campanero scheduler run proved stable
item/observation deduplication plus Chief pickup. This release does not
authorize any fact/source edit; owner correction and exact clean closure are
separate gates. Exact backup, rollback, configuration, run, and final-state
receipts are in `docs/ENGINEERING-CHANGELOG.md`.

NC-20260820-003 crossed the next additive release boundary under exact
candidate `bab154cbdadf76962373272d6a4960cb926d3794`, source tree
`e31362d8c8b858f420144d3d6777dde079b51c94`, 792 compiled files, artifact
SHA-256 `3fdd305c62ba449bb526b792f0d052251c35fcfceb1dc256f5e0f95597347e75`,
and archive SHA-256
`c340087fe532a0df711a2fa344e9c13a080ae6b77f4cf5bc79c3f19deeb8aa5`.
Local and Mini runtime verification passed under Node 22.23.2. After a natural
Procurement run drained, a mode-0600 WAL-safe SQLite/plist backup passed
`quick_check`; dry-run showed exactly the three permitted plist paths and
activation retained rollback to `8344524c`. Healthy PID 73082 now reports the
exact commit/tree/artifact/code root, connected Gmail/Slack, one listener, and
empty queues. The additive source-message column/index exist exactly once and
protected SQLite/PostgreSQL aggregates are unchanged. The already-posted daily
brief deduplicated on startup, so no packet was manufactured; natural work
packet, Chief pickup, and exact email-source hydration remain outcome gates.
Exact backup, prompt-merge, rollback, and aggregate receipts are in
`docs/ENGINEERING-CHANGELOG.md`.

NC-20260820-004 deploys the next prompt-only host release under exact commit
`eb5fbaa171e66996dd1dda300dc4f11717e768af`, source tree
`15517a28157181b1b60bd556bec362a2cbef2ada`, 792 compiled files, artifact
SHA-256 `3fdd305c62ba449bb526b792f0d052251c35fcfceb1dc256f5e0f95597347e75`,
and archive SHA-256
`d7255a51b99726fa9f3ca085c7878aa8b221e948860b6f2282dabd033922a938`.
The unchanged compiled artifact is expected: this slice changes tracked group
instructions, packaged Sales knowledge, and separately installed webhook
definitions, not TypeScript runtime code. After one real Sales run naturally
drained, a WAL-safe backup passed `quick_check`; operational group files were
updated only from a verified prior-release match, and the machine-local webhook
merge retained its CNPC definition and secret. Activation changed only the
three release-pointer paths and retained rollback to `bab154cb`. Healthy PID
2211 reports the exact release on Node 22.23.2 with connected Gmail/Slack, one
listener, exact prompt/config hashes, and empty queues. The website and n8n
ingress are separately live-verified; one natural contact remains the outcome
gate. Exact receipts are in `docs/ENGINEERING-CHANGELOG.md`.

NC-017 crossed those boundaries under exact release `999f2a4`: fresh local and
production extraction verified the same archive, a narrow custom-format backup
preceded explicit migration 119 application, and recovery-safe activation
retained the prior `cf96258` plist. Exact digests and paths are recorded in
`docs/ENGINEERING-CHANGELOG.md`.

Beginning with NC-018, the archive also binds migration 120, its
history-preserving rollback, and
`scripts/set-company-work-exception-loop.mjs`. Bundling these bytes does not
apply or enable the operator loop. Backup, one-file migration, structural
verification, default-off service activation, redacted config dry-run/apply,
restart, and natural Chief-channel acknowledgment remain separate recorded
gates. The helper refuses a release mismatch, defaults to dry-run, requires the
exact hostname for mutation, creates an exclusive backup, and writes atomically
without printing UID values. Release `0d2c8ec` accepts only approved existing
named-operator sources. The next NC-018 activation candidate additionally
accepts one owner-readable, owner-only regular file containing exactly one
valid Slack UID; that path rejects symlinks, group/other permissions, multiple
or malformed IDs, ambiguous source selection, and wrong-owner files.

NC-018 crossed the archive, backup, one-file schema, and default-off service
gates under exact release `0d2c8ec`. After explicit owner confirmation of the
sole operator, clean activation release `a2e6d35` added the restrictive
owner-only-file bootstrap and independently passed local and production
extraction verification. A redacted dry-run/apply/verify transaction configured
one operator, retained an environment backup, and removed the one-use input.
One bounded restart converged to exact healthy release `a2e6d35`; its first
run posted and durably bound one natural Chief brief while source Company Work,
email, job, task, and channel-definition fingerprints remained unchanged. The
sole named operator's exact check reaction acknowledged all three current
occurrences, posted the threaded receipt, and again left every protected source
fingerprint unchanged. Later natural source resolution remains a separate gate.
Exact digests, paths, fingerprints, and rollback identities are recorded in
`docs/ENGINEERING-CHANGELOG.md`.

Beginning with NC-20260817-001, the archive also binds migration 121 and its
history-preserving rollback. NC-20260817-002 applied that migration and deployed
exact release `baed66d` after archive verification, drain, and backup. One
natural scheduled-time boundary inserted once, exact replay was duplicate-only,
and configuration was expired back to disabled. Bundling still does not apply
the schema, enable another adapter, create or resume a task, select a skill, or
grant action authority. Every later source/definition/promotion remains a
separately authorized gate.

The NC-20260817-002 release additionally bundles
`scripts/set-company-time-trigger.mjs`. Bundling does not enable the observer.
The helper verifies its immutable release, defaults to a value-redacted dry
run, selects exactly one task ID and one intended boundary, requires exact-host
confirmation for apply/restore, creates an exclusive environment backup, and
writes atomically. The daemon resolves those keys dynamically, but the observer
runs only after the scheduler's existing successful SQLite claim and is
fire-and-forget. NC-002's migration apply, dark deployment, one-boundary
configuration, natural occurrence, exact replay, and expiry are recorded in
the active-work/changelog evidence. Reusing the helper for another task or
boundary is a new production configuration operation, not implied authority.

Beginning with NC-20260817-003, clean archives also bind migration
122 and its history-preserving rollback. The files define the dark
trigger-source inventory and watermark/gap state only. Bundling does not apply
the schema, register or enable a source, reconcile a live gap, wire an adapter,
or grant task/action authority. Production backup, migration, source
registration, adapter deployment, bounded source proof, and any create/resume
promotion remain separate recorded gates. `NC-20260817-004` crossed only the
archive, narrow backup, one-file schema, and default-off service gates under
exact release `070cde38`. Structural/live proof kept all three tables empty and
admin-only with no runtime import. Source registration, cursor initialization,
adapter deployment, bounded source proof, and every create/resume promotion
remain separate gates.

Beginning with NC-20260817-006, clean archives also bind migration 123 and its
empty-only rollback. The release contains the exact read-only Gmail profile and
full-mailbox-list wrapper plus an unwired resumable shadow store, but bundling
those bytes does not apply the schema, register/bootstrap a source, call Gmail,
create shadow evidence, intercept history 404, or advance either Gmail cursor.
`NC-20260817-007` deploys that exact release with migration 123 deliberately
unapplied; durable real disposition receipts remain the next prerequisite
before database/source activation or any live shadow read.

Beginning with NC-20260818-002, clean archives additionally bind migration 124
and its empty-only rollback for the separate gap-independent Gmail mailbox
audit. This packaging rule grants no migration, Gmail-read, cursor, recovery,
or daemon-activation authority.
Exact NC-20260818-002 candidate `2328c7e1` independently verifies a 764-file
artifact and archive SHA-256
`99d465ecfb2119384d7ba6f4f32f4cb1ccae8feb9b20561e8a4059759bce2ecd`.
It is installed read-only beside the active daemon, not activated. Migration
124 and the separately invoked live audit were promoted only after the later
zero-work/backup gates; daemon release `dc3e5f0d` remained unchanged.

Exact release `de815e1d` crossed only the archive and recovery-safe service
activation gates. Local and production extraction verified the same 720-file
artifact and archive SHA-256. Production remained drained before activation;
the dry run named only the three release-pointer paths; the applied transaction
retained rollback plist
`com.nanoclaw.plist.rollback-070cde380242-2026-08-17T22-03-56-272Z`.
Independent readback proves one launchd listener, matching release/code root and
Node 22.23.2, connected Gmail/Slack, empty queues, unchanged email/cursor/source
aggregates, and absent migration-123 tables. No migration, Gmail call, source
row, shadow evidence, message, task, or action occurred.

NC-20260817-008 locally expands the email-critical release gate to include the
real Gmail channel, history pagination, and inbound disposition receipt tests.
The added SQLite table is created by normal host schema initialization, so a
future deployment is also a production schema operation and must not be called
successful from archive verification alone. It requires a WAL-safe SQLite
backup, drain, exact release activation, table/trigger readback, natural
receipt/cursor non-interference evidence, and rollback planning. No such
deployment or schema application occurs under NC-008.

NC-20260817-009 crosses that separate schema/service gate under exact release
`263ac7c4a25a6033adef13e4085c147d1237b559` and source tree
`bac62eea397f944033c79b74f79e29e2b6c13378`. Read-only production preflight
verified SQLite integrity, no active approved-email execution, an absent
receipt table, and 57 legacy direct-route staging rows. Twenty-one have their
exact routed marker; 36 remain unknown and must never be accepted by inference.
Cursorless recurring scans now hold only that candidate so a legacy row cannot
starve unrelated mail, while push retains its whole-batch cursor.

The clean archive contains 724 files with artifact SHA-256
`b12416a44839ddb08092566f81e9a4fd1568ddf597bf194b091fbf295f3bbef2`
and transport SHA-256
`74e282695eeff312e544e23f933c00a8a547f158747c74da49c04a09df21d622`;
fresh local and production extraction both verified. A drained, WAL-safe,
mode-0600 SQLite backup at
`~/.local/share/nanoclaw-backups/NC-20260817-009-2026-08-17T23-36-26Z/messages.db.sqlite3`
passed `quick_check` and hashes to
`6b23f4d9329865cae93bc86dbc98f87383079ba34441ed524bbf4c7b5eec8996`.
Recovery-safe activation retained rollback plist
`com.nanoclaw.plist.rollback-de815e1dfb1f-2026-08-17T23-37-22-828Z`.

Independent live readback proves the exact release, Node 22.23.2, one listener,
connected Gmail/Slack, empty execution/outgoing queues, SQLite `quick_check`
`ok`, the receipt table plus both append-only triggers, unchanged critical
pending state, and absent migration-123 tables. The first ten-minute safety
cycle completed without a Gmail error or cursor hold but returned zero message
candidates: Gmail row aggregates and receipt count remained unchanged, while
two ambient new rows and two allowed action-safety decisions were Slack-only.
The Gmail history/liveness cursor changes are therefore attributable to the
successful empty safety poll, and the watch expiry changed on normal restart
renewal. Structural and non-interference proof pass. Later natural traffic
creates 18 receipts with 18 distinct message IDs and fingerprints: three
ordinary inbound persists, ten completed rule auto-archives, and five
own-outbound rejections. All three persisted receipts have their matching
SQLite message row; auto-archive receipts correctly have none. The same process
completes 67 push/safety cycles with zero receipt, processing, safety-poll, or
cursor-hold failures. Two recent one-candidate scans each record one new message
and advance monotonically. NC-009's natural producer gate is therefore complete
without manufactured traffic.

NC-20260818-003 makes one later additive change to that SQLite schema after a
natural production poll proved Gmail history can name a message whose exact
full-message fetch then returns 404. The new
`rejected/message_unavailable` reason is content-free and is terminal only for
that exact method/status combination; every other fetch error remains
fail-closed. Existing hosts must transactionally rebuild only the receipt table
because SQLite cannot alter its closed reason `CHECK` in place. A release that
contains this change is also a production schema release: activation requires
a fresh WAL-safe backup, copied-live-database migration proof, preserved row and
fingerprint aggregates, both recreated append-only triggers, and
`quick_check`. Older rollback code does not understand the new reason and may
fail startup after such a receipt exists; that fail-closed behavior is not
permission to delete or rewrite receipt history.

Exact repair release `64f1421e4650c64b2f9a173cc4e8c51a2dc8c36b`
contains 780 compiled files with source tree
`f45c6c10fc653f3ece45778e705bc6100917d471`, artifact SHA-256
`27038b4919572d2cd3952df36d219d2d29495754a6ba65aedfbfcac1a34d5a1b`,
and archive SHA-256
`d346e49ef4c751df61e2a274d416cce83f07aa8777be057feef4da4b83d87136`;
fresh local and Mini extraction independently verified them. A copied-live
database retained all 133 rows and their aggregate hash through migration and
executably refused update/delete. After a zero-work drain, the fresh mode-0600
WAL-safe backup at
`~/.local/share/nanoclaw-backups/NC-20260818-003-20260818T204301Z/messages.db.sqlite3`
passed `quick_check` and hashes to
`33ca21cf8c20ef7ffbec967695d8907b0e7f0438cc84597a7cff10fa4b116774`.
The stopped live migration then retained all 136 current rows and their exact
aggregate hash, widened the constraint, and recreated both triggers. Activation
retained rollback plist
`com.nanoclaw.plist.rollback-b7aab9b7ef6b-2026-08-18T20-44-20-160Z` and
started fresh listener PID 10482. One natural push recorded exactly two new
`message_unavailable` receipts and three natural advances left both cursors
equal at version 5/current. Gmail/Slack health and protected work/email-action
fingerprints pass; the production error log remains unchanged since August 15.

NC-20260820-007 crosses a code-only, default-off host release boundary under
exact commit `265622bd7cc4632f517dd1e5beb0c22f6ba688e4`, source tree
`7981389ea49a06ba8c8a60e8db162871baa96bf6`, 808 compiled files, artifact
SHA-256 `ae858926595894ff062f68cdcd9d5aea3be2724e1c1ba4fedd26d6d70a4457e6`,
and archive SHA-256
`19612afd867013a9ad5fb8e05eb8700b4d7c8c321a406f57eb7162a0ded0aef4`.
Local and Mini verification pass under Node 22.23.2. A zero-work drain and
owner-only WAL-safe SQLite/plist backup preceded the exact three-pointer
activation, which retained rollback to `09bc2408` and converged health,
launchd, and the sole listener on PID 63259. The installed assessment command
is not imported by the daemon and refuses missing or incomplete apply gates.
Protected work/exception evidence is unchanged apart from the ordinary
exception projection's `last_seen_at` refresh; the quality-receipt table stays
empty. Deployment does not authorize or prove a real assessment.

NC-20260820-009's final interaction repair is live under exact release
`288105cb32fdacab3640326264499d9df15babb0`, source tree
`2447bd7e58c5f2464ce991b59edbe4cbb0714751`, 816 compiled files,
artifact SHA-256
`04fa483ef39176d89c1345cd2fc6643c29b9a074d0f170b81ce45c96223bfc8e`,
and archive SHA-256
`83228365a6f8a4269082bdf5ccb3a7eacfadcb5d26223795babe207321ca9c2b`.
After natural work drained, an owner-only WAL-safe SQLite plus affected-schema
backup passed `quick_check` and `pg_restore --list`; exact migration 128 widened
only the closed reaction constraint. Recovery-safe activation retained rollback
to `dbe5016c` and converged on healthy PID 78177 under Node 22.23.2. Startup
reconciled the sole configured operator's already-present exact-packet 👍 as
one explicit `clean` receipt, posted one bound thread acknowledgment, and did
not create packet two, call Gmail, send email, or mutate Company Work. Exact
backup, rollback, reaction, receipt, Slack, SQLite, and log evidence is recorded
in `docs/ENGINEERING-CHANGELOG.md`.

The builder refuses to run when:

- the current Node version differs from the exact `.nvmrc` value;
- the Git worktree contains any staged, unstaged, or untracked change.
- the serial email-critical suite fails. This gate covers approval parsing,
  exact-action identity and replay, SQLite receipt transitions, cross-group
  delivery, exact scheduled-task Gmail continuation and completion receipts,
  Gmail inbound terminal receipts and cursor holdback, bounded history
  pagination, Gmail authorization, recipient/content refusal, and the realistic
  PostgreSQL-bigint delivery path. It also runs the synthetic-only approved-email incident
  corpus in `evals/email-delivery/incidents.json`; that corpus executes the
  production approval parser and host rehydration path and asserts that its
  linked stateful regressions remain in this same gate.

The archive is a provenance-bearing transport artifact, not a cryptographic
signature. Its SHA-256 must be recorded out of band in the task/change record
and compared after transfer. Anyone who can replace both the archive and the
recorded checksum remains inside the deployment trust boundary.

## Production startup boundary

Before initialization opens a channel, database, scheduler, webhook, or
container runtime, `src/index.ts` calls `verifyRuntimeRelease()`. Production
startup refuses when:

- `dist/release-manifest.json` is absent or malformed;
- the current Node runtime differs from the exact release pin;
- the release was built under a different Node version;
- any compiled file was added, removed, or changed after the manifest was
  written;
- `NANOCLAW_EXPECTED_RELEASE_COMMIT` is set and differs from the manifest.

`/health` reports the non-secret release identity with channel and container
health. A healthy HTTP response without `release.mode=release`,
`release.verified=true`, and the intended full commit is not a successful
deployment.

Development runs may omit the manifest only when production enforcement is not
enabled. They still require the exact `.nvmrc` runtime.

## Exact runtime

The repository pins Node `22.23.2` in `.nvmrc`, both package engine contracts,
every GitHub `setup-node` step, and the agent image. Native dependencies must
be installed or rebuilt under that exact runtime. Both npm projects are
engine-strict.

The service must use the absolute executable returned by the pinned runtime,
not whichever `node` happens to appear first in an interactive shell. The
tracked macOS service definitions use the Homebrew `node@22` executable, and
the setup program records `process.execPath`. For local and automation work,
`scripts/with-pinned-node.sh` keeps an already-correct runtime or finds the
exact installed Node 22.23.2 binary and prepends its directory before executing
the command. It does not change the workstation's global Node. `npm run
runtime:doctor` reports the non-secret runtime, native ABI, package engine,
container tag, and workflow alignment.

Apple Container's persistent builder must itself have working DNS. On this
host, start or restart only an idle builder with `--dns 192.168.1.1` before an
image pull/build. Supplying `container build --dns 192.168.1.1` does not repair
an already-running builder whose own resolver is missing; the pull can still
fail at registry resolution. Do not restart a builder while containers are
active. Record the prior image under a rollback tag, the new OCI digest, and a
runtime `node --version` smoke before deleting that rollback tag.

## Build

From a clean reviewed commit:

```bash
./scripts/with-pinned-node.sh node --version
./scripts/with-pinned-node.sh npm ci
./scripts/with-pinned-node.sh npm ci --include=dev --prefix container/agent-runner
npm run runtime:doctor
npm run typecheck
npm run test:email-replay
npm run test:email-critical
npm test
npm run release:build
```

The runner is an independent package, not an npm workspace. Its locked
dependencies, including build/test dev dependencies, must therefore be
installed separately before
`test:email-critical` or `release:build`; the shared email gate deliberately
builds and tests the runner and fails closed when those dependencies are
missing.

The expected version is exactly `v22.23.2`. Record the builder's JSON output,
including archive path, archive SHA-256, full commit, source tree, compiled
artifact digest, file count, and Node pin.

Verify the archive in a fresh temporary directory before transfer:

```bash
mkdir <temporary-directory>
tar -xzf .release/nanoclaw-<commit>.tar.gz -C <temporary-directory>
node <temporary-directory>/scripts/verify-release.mjs <temporary-directory> --runtime
```

Never use `npm run build` on a dirty production checkout as a deployment
mechanism.

## Activation

For releases that change `container/agent-runner`, rebuild the container image
and refresh every `data/sessions/*/agent-runner-src` snapshot from the verified
release **before** activating the host. This ordering is a correctness gate: a
new host paired with an old runner omits runner-owned `source_container` and
falls back to unsafe shared-input delivery. Do not run these as parallel steps.

For releases that change tracked group instructions, compare and copy every
reviewed changed instruction from the verified release into the writable
operational `groups/` workspace and record both source and destination hashes
**before or atomically with host activation, never after it**. For
NC-20260803-001 this includes `groups/chief/CLAUDE.md`,
`groups/chief/SUPPORT-REPLY.md`, `groups/sales/CLAUDE.md`,
`groups/sales/WORKFLOWS.md`, and `groups/mailman/OUTBOUND-EMAIL.md`. This is a
correctness gate: the active host resolves `GROUPS_DIR` from the operational
working directory rather than `NANOCLAW_CODE_ROOT`.

1. Inspect the current service, health response, listener count, pending work,
   installed Node runtime, and production checkout without changing them.
   Before the first NC-009 activation, query only the aggregate count in the
   operational working directory's `store/messages.db` and require
   `pending_sends` to be empty; do not inspect customer rows. Existing rows use
   the pre-action schema and cannot be assumed safely migratable while work is
   in flight. On later releases, require no rows in `approved`,
   `handoff_routed`, `mailman_started`, `executing`, or `attention_required`;
   an `executing` row must be reconciled to `confirmed` or `uncertain`, never
   retried or deleted. Pause new approvals during this drain/check window.
2. Transfer the exact reviewed archive, compare its SHA-256 through an
   independent channel, and extract it to a new immutable directory such as
   `~/.local/share/nanoclaw-releases/<full-commit>`. Never extract over the
   active release.
3. Run the bundled verifier under the installed pinned Node.
4. Run the bundled activation command in its default dry-run mode:

   ```bash
   node <release>/scripts/activate-release.mjs \
     --release-dir <absolute-release-directory>
   ```

5. Review the reported current/target full commits, roots, and exactly three
   changed paths. Apply once only with an exact host confirmation:

   ```bash
   node <release>/scripts/activate-release.mjs \
     --release-dir <absolute-release-directory> \
     --apply --confirm-host <exact-hostname>
   ```

The activator parses the installed plist rather than rendering a tracked
template. It preserves machine-local Node, working directory, environment,
limits, logs, and launchd policy, changing only `ProgramArguments[1]`,
`NANOCLAW_CODE_ROOT`, and `NANOCLAW_EXPECTED_RELEASE_COMMIT`. Before mutation it
verifies the current rollback release and health, target manifest and bundle,
the actual interpreter version, and the candidate plist. It then captures an
exclusive rollback plist, atomically replaces the installed plist, performs one
bounded unload/load cycle, and requires `/health` to prove the target full
commit, resolved code root, and `codeRootMatchesRelease=true`. Failure after
replacement restores the rollback plist, performs one bounded rollback load,
and health-checks the restored release without masking the original activation
error. A fixed exclusive lock prevents overlapping activators. macOS `shlock`
records the activator PID and atomically claims the final path with `link(2)`;
it refuses every extant lock, including a stale one. The activator reports
whether a numeric holder PID is live or dead, and cleanup removes only a lock
that still names the current process. The dry run proves both `lsof` and
`shlock` are executable before any installed-service mutation; recovery never
treats a missing or denied prerequisite as an empty port. A target that is
already the installed release, including a symlink alias, and a missing/pruned
rollback directory both fail with direct diagnostics before mutation.

If the activator reports a stale lock, do not remove it merely because the PID
is dead: first prove no activation command is running and preserve the error
output. Only then remove the exact reported
`<installed-plist>.activation.lock` path and restart the full dry-run. This is a
deliberate operator recovery step; the activator never auto-reclaims a stale
lock because an unlink/reclaim sequence can delete a concurrent owner's claim.

If the installed service is already stopped or cannot answer health, the normal
path fails closed. After verifying that this is the intended incident recovery,
use the separately explicit mode:

```bash
node <release>/scripts/activate-release.mjs \
  --release-dir <absolute-release-directory> \
  --apply --recover-from-down --confirm-host <exact-hostname>
```

This skips only the current-health and current-PID requirements. It still
verifies both bundles, the actual interpreter, candidate plist, exact hostname,
listener release, target health identity, and rollback behavior. The target is
never rebuilt or retried.

`--apply` is an external state change and still requires explicit deployment
authorization. The command does not replace the channel, listener, prompt-hash,
or task-specific live checks after activation.

### Staged capability activation

Installing capability-manifest source and selecting an agent are separate
changes. Deploy the exact release with both manifest controls off first. After
release health and the drain check pass, use the release-bundled
`scripts/set-capability-groups.mjs` in dry-run mode and then with
`--apply --confirm-host <exact-hostname>` to change only
`CAPABILITY_MANIFEST_ENFORCED_GROUPS` in the operational `.env`. The helper
refuses global enforcement, duplicate keys, and invalid group names; it creates
an exclusive same-mode backup and atomically replaces the file without printing
other environment contents.

The host reads this configuration dynamically. Require the health aggregate to
show a valid config, global enforcement false, and only the intended group;
then prove the actual launch and allowed/denied tool surfaces. Roll back by
using the same helper with an empty group list or restoring its exact backup,
and verify compatibility health before continuing. A staged selector does not
authorize a job, message, email, or other business side effect.

Production startup refuses a `NANOCLAW_CODE_ROOT` outside the verified release.
`/health.release` reports the resolved `codeRoot` and
`codeRootMatchesRelease`. `NANOCLAW_CODE_ROOT` makes container skills and
agent-runner source come from the verified release. Group workspaces remain
under the operational checkout
because agents write conversation archives and task artifacts there. Therefore
group prompt files are included and transport-verified in the archive, but the
current host does not yet cryptographically bind the writable live group
workspace to that archived copy. Deployment must compare/copy the reviewed
prompt files explicitly and record their hashes. This is a declared residual,
not a reason to represent the whole behavioral configuration as immutable.

### Internal Gmail transport canary

After activation and health convergence, one explicitly authorized internal
transport canary may be run only after a non-sending preflight proves that the
working directory resolves both the activated `dist/release-manifest.json` and
the existing operational Gmail environment. Immutable releases omit `.env`,
and the current command reads the project-local `.env` overlay and manifest
relative to its working directory (in addition to the home-relative shared
environment base layer), so the production release root alone does not satisfy
that precondition.

Until the command gains an explicit, read-only environment-file input, create a
private temporary working directory, link its `.env` to the existing
operational `.env`, copy the activated manifest to its `dist/`, and execute the
absolute activated `dist/email-transport-canary.js` from there. Verify only
credential presence before the send, never print values, never copy secrets
into the release, and remove the exact temporary files after the attempt. Do
not retry if Gmail accepted the send but later receipt retrieval is uncertain.
The effective command inside that prepared working directory is:

```bash
NANOCLAW_EMAIL_CANARY_CONFIRM=NC-009-INTERNAL-TRANSPORT-CANARY \
  /absolute/pinned/node /absolute/activated/release/dist/email-transport-canary.js
```

The command has no recipient argument. It sends fixed host-authored text only
to `GMAIL_MONITORED_EMAIL`, omits BCC, does not use the global
`GMAIL_TEST_RECIPIENT` redirect, and writes no customer action, Slack message,
or business interaction. It succeeds only after Gmail returns a message/thread
receipt and that exact message is retrievable; output identifies the recipient
only by SHA-256. This proves the activated release's Gmail authentication and
transport receipt path. It does **not** validate Party guards, a real customer
action, business logging, inbox placement, or the Sales/Mailman outcome.

## Rollback

Rollback changes the service pointer; it does not rebuild:

1. restore the prior service definition or point it to the prior immutable
   release directory;
2. restore the prior reviewed group prompts if this release changed them;
3. reload/restart once;
4. verify the prior full commit in `/health`, required channels, listener
   count, and the relevant safe canary;
5. preserve the failed release, logs, and manifest for diagnosis.

Database migrations are a separate boundary. Additive migrations normally
remain in place while host code rolls back. A destructive schema rollback
requires its own review and data-retention decision.

## Deployment states

- `committed`: source exists in Git.
- `artifact_verified`: the clean-commit archive and checksum were produced and
  independently verified.
- `deployed`: the service points at that extracted release.
- `live_verified`: `/health` proves the intended release and required runtime
  systems are healthy.
- `outcome_validated`: the real workflow completes without manual repair.

Do not collapse these states into “done.”
