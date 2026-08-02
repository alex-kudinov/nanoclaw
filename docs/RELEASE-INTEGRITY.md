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
2. Back up the installed service definition and record the currently active
   release identity.
3. Transfer the exact reviewed archive and compare its SHA-256 with the
   separately recorded value.
4. Extract it to a new immutable directory such as
   `~/.local/share/nanoclaw-releases/<full-commit>`. Never extract over the
   active release.
5. Run the bundled verifier under Node `22.23.2`.
6. Point the service at `<release>/dist/index.js` and set:
   - `NODE_ENV=production`
   - `NANOCLAW_REQUIRE_RELEASE_MANIFEST=1`
   - `NANOCLAW_EXPECTED_RELEASE_COMMIT=<full-commit>`
   - `NANOCLAW_CODE_ROOT=<release>`
7. Keep `WorkingDirectory` on the operational checkout so databases, sessions,
   logs, and other machine-local state retain their established paths.
8. Reload/restart the service once.
9. Verify one process, one listener, the intended full release commit in
   `/health`, connected required channels, no startup-integrity error, and the
   task-specific side effect.

`NANOCLAW_CODE_ROOT` makes container skills and agent-runner source come from
the verified release. Group workspaces remain under the operational checkout
because agents write conversation archives and task artifacts there. Therefore
group prompt files are included and transport-verified in the archive, but the
current host does not yet cryptographically bind the writable live group
workspace to that archived copy. Deployment must compare/copy the reviewed
prompt files explicitly and record their hashes. This is a declared residual,
not a reason to represent the whole behavioral configuration as immutable.

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
