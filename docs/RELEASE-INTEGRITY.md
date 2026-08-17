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

The archive includes tracked `container/`, `groups/`, and `knowledge/` bytes.
When a release contains `knowledge/agents/<group>`, the host mounts that
manifest-covered directory read-only at `/workspace/extra/knowledge` and
suppresses any mutable configured mount targeting the same container path.
Older releases without packaged knowledge retain the configured operational
mount so rollback remains viable. `FILES.sha256` therefore attests the group
prompt and the procedures to which it delegates as one release identity.

Beginning with NC-017, the archive also binds migration 119 and its guarded
rollback as exact regular files. This makes the reviewed bytes transportable
and independently verifiable; it does not apply the migration. Database backup,
daemon drain, one-file application, structural validation, and rollback policy
remain separate recorded operations.

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

The builder refuses to run when:

- the current Node version differs from the exact `.nvmrc` value;
- the Git worktree contains any staged, unstaged, or untracked change.
- the serial email-critical suite fails. This gate covers approval parsing,
  exact-action identity and replay, SQLite receipt transitions, cross-group
  delivery, exact scheduled-task Gmail continuation and completion receipts,
  Gmail authorization, recipient/content refusal, and the realistic PostgreSQL-
  bigint delivery path. It also runs the synthetic-only approved-email incident
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

The repository pins Node `22.23.2` in `.nvmrc` and `package.json`. Native
dependencies must be installed or rebuilt under that exact runtime.

The service must use the absolute executable returned by the pinned runtime,
not whichever `node` happens to appear first in an interactive shell. The
tracked macOS service definitions use the Homebrew `node@22` executable, and
the setup program records `process.execPath`.

## Build

From a clean reviewed commit:

```bash
nvm use
node --version
npm ci
npm ci --include=dev --prefix container/agent-runner
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
