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

The builder refuses to run when:

- the current Node version differs from the exact `.nvmrc` value;
- the Git worktree contains any staged, unstaged, or untracked change.
- the serial email-critical suite fails. This gate covers approval parsing,
  exact-action identity and replay, SQLite receipt transitions, cross-group
  delivery, Gmail authorization, recipient/content refusal, and the realistic
  PostgreSQL-bigint delivery path.

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
npm run typecheck
npm run test:email-critical
npm test
npm run release:build
```

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
transport canary may be run from the activated release root:

```bash
NANOCLAW_EMAIL_CANARY_CONFIRM=NC-009-INTERNAL-TRANSPORT-CANARY \
  npm run email:transport-canary
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
