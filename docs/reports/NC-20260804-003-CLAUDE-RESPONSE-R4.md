# NC-20260804-003 — Claude response R4

## 1. Verdict

**Verdict: CONVERGED**

The four additions bring `scripts/build-release.mjs` into exact parity with the
authoritative `package.json` gate — same 18 files in the same order, same three
flags in the same order — and cannot change runtime behavior, because the test
invocation runs before `dist/` is rebuilt and feeds nothing into the artifact
digest or the manifest. I independently confirmed the arithmetic: the four added
files contribute exactly 44 tests, and 453 + 44 = 497.

No newly introduced build/release defect. Two operational notes and one
pre-existing structural gap are in §4; none is a blocker.

---

## 2. Exact list comparison

I extracted both argument vectors mechanically — the builder's from the
`vitest.mjs` argv block in `scripts/build-release.mjs:45-68`, the authoritative
one from `package.json`'s `test:email-critical` — and compared them
element-by-element rather than by eye.

| Property | Result |
| --- | --- |
| Test-file count | builder **18**, package **18** |
| Files identical **and in the same order** | **true** |
| Flags identical **and in the same order** | **true** — `["--pool=forks","--no-file-parallelism","--maxWorkers=1"]` |
| Only in `package.json` | none |
| Only in the builder | none |
| Duplicate paths in either list | none |
| Stray non-file, non-flag arguments | none in either |
| All 18 builder paths exist on disk | **true** |
| Builder list lexicographically sorted | **true** (matches the package list's ordering convention) |

The four paths named in the request are present at
`scripts/build-release.mjs:47, 52, 60, 61`, each inserted in sorted position
rather than appended, so the two lists stay diff-able going forward.

Serialization differs by necessity and is equivalent: `package.json` passes one
shell string through the `vitest` bin shim, while the builder invokes
`process.execPath` on `node_modules/vitest/vitest.mjs` with an argv array
(`scripts/build-release.mjs:42-70`). Same resolved Vitest entry point, same
`cwd: root`, same three flags. The array form is also immune to word-splitting,
so no quoting difference can reintroduce a discrepancy.

---

## 3. Drift eliminated without runtime change

**Drift eliminated.** The gate the builder enforces is now byte-equivalent to
the gate `npm run test:email-critical` enforces. The 453 → 497 shortfall is
fully accounted for: I ran the four added files in isolation and they contribute
**exactly 44 tests** (`proposal-followup` 21, `email-content-guard` 12,
`proposal-approved-email` 6, `approved-email-execution` 5). 453 + 44 = 497.
That arithmetic closes the question independently of the file list — nothing
else was missing, and nothing was double-counted.

**Runtime behavior unchanged.** The diff touches only the argv array of the
pre-packaging test call. Tracing the rest of the script:

- The Vitest call runs at `:42-70`, **before** `fs.rmSync(dist)` at `:73` and
  before `tsc -p tsconfig.build.json` at `:74-82`. It therefore exercises the
  source tree via Vitest's own transform and cannot influence `dist/`.
- `tsconfig.build.json` excludes `src/**/*.test.ts` and `scripts/` contains no
  `.ts`, so `build-release.mjs` cannot itself be compiled into `dist/`.
- `computeArtifactDigest(dist)` at `:87` hashes only `dist/`, and the manifest
  (`:88-97`) records `commit`, `sourceTree`, `builtAt`, `nodePin`,
  `nodeVersion`, `artifactHash`, `artifactFiles`. None derives from the test
  list.
- The archive payload (`:118-138`) is `dist/` plus tracked
  `.nvmrc`, `package.json`, `package-lock.json`, `container`, `groups`,
  `launchd`, `setup/launchd`, `verify-release.mjs`, `activate-release.mjs`.
  `build-release.mjs` is not shipped; it only gates.

Consequence worth stating for the rebuild: `commit` and `sourceTree` will
necessarily advance (the file is tracked), but with `src/` unchanged the
`artifactHash` should be identical to the stale archive's. `verify-release.mjs
--runtime` at `:103-110` will confirm that as part of the build — I could not run
`release:build` here to prove it (see §5).

**No new build-machine dependency.** None of the four added files imports from
`dist/`, and all four pass locally even under this worktree's broken
`better-sqlite3` ABI, which proves none of them loads the native SQLite binding.
They add no fixture, network, or database requirement the builder did not
already have.

**Failure propagation is correct and unchanged.** `execFileSync` throws on a
non-zero exit with `stdio: 'inherit'`, so a regression in any of the four now
aborts the build before `dist/` is touched. That is the intended strengthening.

---

## 4. Newly introduced defects, and residual notes

**Newly introduced reachable build/release defect: none.**

Three notes, none blocking:

1. **The drift mechanism is not removed, only the drift.** The 18-path list is
   still duplicated in `package.json` and `scripts/build-release.mjs` with no
   automated parity check. I grepped the whole repo: `test:email-critical` is
   referenced only by `package.json` itself and by documentation — no script and
   no CI workflow compares the two. CI runs the **full** suite
   (`npx vitest run`, `.github/workflows/ci.yml:28`), so a builder that silently
   omits files never fails CI, which is exactly why this went unnoticed. That
   full-suite coverage also bounds the original blast radius: the omission meant
   four files were not re-verified *on the build machine at package time*, not
   that they were unverified. Cheapest durable fix is to have the builder derive
   its list from `package.json`'s `test:email-critical` string (or assert parity
   and throw), so the two can never diverge again. **Recommended, optional.**

2. **A stale archive is still sitting in the output directory.**
   `.release/nanoclaw-5beb957567d6.tar.gz` (2.5 MB, 2026-08-05 20:09) is the
   build produced by the 14-file gate. The script never prunes `.release/`
   (`:112-115` only creates the directory), and `.release/` is gitignored
   (`.gitignore:6`), so it neither blocks the clean-worktree check nor gets
   cleaned up. The corrected build will land under a different commit-keyed
   filename, so the two are distinguishable — but this is the directory an
   operator reaches into to transfer. **Recommend deleting the stale archive**
   before the next transfer, since Codex has confirmed it was never deployed.

3. **This response file will block `release:build` until it is committed.** The
   builder refuses to package unless
   `git status --porcelain=v1 --untracked-files=all` is empty
   (`scripts/build-release.mjs:18-27`), and `docs/reports/` is tracked — the
   R1–R3 responses were committed in `5beb957`. So this file, the R4 request,
   and the three currently-modified files must all be committed before
   `release:build` can run. Mechanical, but it is a real precondition for the
   rerun.

---

## 5. Checks

Runtime: macOS, `/private/tmp/nanoclaw-sales-ack`. Local `node -v` = `v26.5.1`;
`.nvmrc` pins `22.23.2`. Nothing was sent, deployed, written to a database,
activated, or committed.

| Check | Result |
| --- | --- |
| Mechanical argv comparison, builder vs `package.json` (files, order, flags, duplicates, strays, on-disk existence) | **Exact match** — table in §2 |
| `npx vitest run` over the four added files, `--pool=forks --no-file-parallelism --maxWorkers=1` | **Pass** — 4 files, **44 tests** |
| Arithmetic reconciliation | 453 + 44 = **497** ✓, 14 + 4 = **18** ✓ |
| `git diff -- scripts/build-release.mjs` | 4 added lines, argv only; no other hunk |
| `dist`/manifest coupling trace (`scripts/build-release.mjs:42-101`, `tsconfig.build.json`) | Test list feeds nothing into `dist/`, `artifactHash`, or the manifest |
| `dist/` import scan of the four added files | None |
| Repo-wide grep for `test:email-critical` parity enforcement | None outside `package.json` and docs |

I did **not** run `npm run release:build`. It would have failed for two
independent environment reasons rather than any product reason: the script
requires Node `22.23.2` exactly (`:10-16`) and a clean worktree including
untracked files (`:18-27`), and this checkout has neither. That is an
environment limitation, not a finding. Codex's pinned-Node rerun remains the
authoritative evidence, and I expect it to log 18 files / 497 tests.

---

## 6. File written, elapsed time, cost

**File written**

```
docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R4.md
```

Exactly one file, and the only file I wrote this round. No source, test, other
documentation, runtime data, service, Gmail, Slack, or database was modified,
and no message or email was sent. The three pre-existing modified files
(`docs/ENGINEERING-CHANGELOG.md`,
`docs/reports/NC-20260804-003-CONVERGENCE-STATE.md`,
`scripts/build-release.mjs`) are Codex's, untouched by me.

**Elapsed:** ~4 minutes wall clock (2026-08-06T01:10:35Z → 2026-08-06T01:14Z),
single Claude session, no subagents and no parallel workflows.

**Cost:** not available — this session exposes no token or cost telemetry to me,
and I will not estimate one. Scope for reference: 1 test invocation, 2 scripted
list comparisons, and roughly 8 file reads/greps.
