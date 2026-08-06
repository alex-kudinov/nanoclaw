# NC-20260804-003 — Claude response R5

## 1. Verdict

**Verdict: CHANGES REQUIRED**

The deduplication itself is correct: one vector, byte-identical to the one I
verified in R4, with both hard-coded copies removed, and the release path is
strictly stronger than before. **The release artifact gate is not affected** —
`build-release.mjs` imports and calls the exported function directly, bypassing
the new detection entirely.

But the direct-execution guard in `scripts/run-email-critical-tests.mjs:43-48`
is not symlink-safe, and I reproduced a **silent false green** on this machine:
invoked through a symlinked absolute path, the gate exits **0 having run zero
tests**. Same file, same repo, same Node:

```
node /tmp/nanoclaw-sales-ack/scripts/run-email-critical-tests.mjs   → exit 0, no output, 0 tests
node scripts/run-email-critical-tests.mjs                           → exit 1, 18 files / 497 tests
```

A gate that can report success without running is the precise failure class this
review chain exists to eliminate, and this whole task's evidence trail rests on
manually-run pinned-Node gate results. The repair is one line and touches no
runtime source, no compiled input, and no manifest field — §5.

Everything else in this change is confirmed correct and needs no rework.

---

## 2. Single-vector proof

`EMAIL_CRITICAL_TEST_ARGS` (`scripts/run-email-critical-tests.mjs:7-30`) is now
the only list. I extracted it mechanically and compared it to the vector I
verified element-by-element in R4:

| Property | Result |
| --- | --- |
| Test files | **18** |
| Identical **and same order** as the R4-verified vector | **true** |
| Flags identical and same order | **true** — `--pool=forks`, `--no-file-parallelism`, `--maxWorkers=1` |
| Leading arg | `run` only |
| Duplicates / strays | none |
| All 18 paths exist on disk | **true** |
| Lexicographically sorted | **true** |
| `scripts/build-release.mjs` still contains any `.test.ts` path | **false** |
| `package.json` still contains any `.test.ts` path | **false** |

Both duplicates are gone. A repo-wide grep finds exactly two references to the
runner — `package.json:22` and `scripts/build-release.mjs:8` — so there is no
third consumer to drift.

**Both entry points execute the same argv under the same Node — proven, not
inferred.** `execFileSync`'s failure message prints the resolved command line,
and the `npm run test:email-critical` invocation emitted:

```
/opt/homebrew/Cellar/node/26.5.1/bin/node
  /private/tmp/nanoclaw-sales-ack/node_modules/vitest/vitest.mjs run
  src/approved-email-execution.test.ts … src/slack-approval.test.ts
  --pool=forks --no-file-parallelism --maxWorkers=1
```

That is `process.execPath` — the same binary running the parent — plus all 18
files in order and the three flags. `build-release.mjs:43` calls
`runEmailCriticalTests({ root })` against the same module constant, so its argv
is the same by construction. The Node pin is enforced upstream at
`scripts/build-release.mjs:10-16` **before** the call, and `process.execPath`
propagates it into the child. Correct placement: the pin belongs to the release
path, not to a general-purpose test runner.

**Failure propagation is intact.** `execFileSync` with `stdio: 'inherit'` throws
on a non-zero child exit; the relative-path run exited **1**, and the thrown
error surfaced the full command. The runner does not swallow failures.

---

## 3. Direct-execution detection — the defect

```js
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runEmailCriticalTests();
}
```

`path.resolve` normalizes a relative path but **does not resolve symlinks**,
while Node resolves the ESM main entry to its realpath (absent
`--preserve-symlinks-main`). When the two differ, the comparison fails, the guard
does not fire, and the process exits 0 having done nothing.

**Reproduction, on this machine, against this exact file.** `/tmp` is a symlink
to `private/tmp` (`lrwxr-xr-x /tmp -> private/tmp`), so
`/tmp/nanoclaw-sales-ack` is a valid alias for this checkout:

| Invocation | Tests run | Exit |
| --- | --- | --- |
| `node scripts/run-email-critical-tests.mjs` | 18 files / 497 tests | **1** |
| `npm run test:email-critical` | 18 files / 497 tests | **1** (via thrown `execFileSync`) |
| `node /tmp/nanoclaw-sales-ack/scripts/run-email-critical-tests.mjs` | **none** | **0** |

The third row is a green gate that verified nothing.

**Reachability.** `npm run` sets cwd to the package root and `process.cwd()`
returns a realpath, so the documented invocation is safe — I verified it. The
exposure is an operator or wrapper script invoking the file by an absolute path
that traverses a symlink. That is not hypothetical here: this validation tree
lives under `/private/tmp` with a `/tmp` alias, the convergence record shows the
pinned-Node gate being run by hand on an isolated Mac Mini tree, and symlinked
checkout paths (`~/dev/current → ~/dev/nanoclaw-vN`) are a common operator
pattern.

**Blast radius, stated fairly.** `release:build` is immune — it imports the
function, so the guard is never consulted. CI is immune — it runs the full suite
(`.github/workflows/ci.yml:28`). What is exposed is the manual gate whose result
is the evidence this task keeps citing. Before this change the npm script invoked
Vitest directly and a silent no-op was impossible; this is therefore a newly
introduced failure mode, not a pre-existing one.

**Isolated to this file.** `scripts/verify-release.mjs` and
`scripts/activate-release.mjs` use no main-detection idiom — they execute
unconditionally at top level — so nothing shipped in the archive shares this
pattern.

---

## 4. Repository-root handling

`runEmailCriticalTests({ root = process.cwd() })` (`:32`):

- **npm path** — npm sets cwd to the package root, so `root` is the repo root. ✓
- **release path** — `build-release.mjs:9` already computes `root =
  process.cwd()` and passes it explicitly; redundant but harmless, and it keeps
  the runner's root and the manifest's root provably the same value. ✓
- **wrong cwd** — `path.join(root, 'node_modules', 'vitest', 'vitest.mjs')` will
  not exist and `execFileSync` throws `ENOENT`. Loud, not silent. ✓
- **symlinked `node_modules`** — this worktree's `node_modules` is a symlink to
  the primary checkout; `path.join` traverses it correctly, as the captured
  command line above shows. ✓

Deriving `root` from cwd rather than from `import.meta.url` is the right choice:
the file arguments are repo-relative and are handed to Vitest with `cwd: root`,
so cwd-derived root keeps the runner usable against any checkout, and every
failure mode is loud. No change needed here.

Worth noting the asymmetry that produces the §3 defect: `root` is derived from
`process.cwd()` (realpath-normalized by the OS) while the guard compares against
`process.argv[1]` (not normalized). Making the guard realpath-aware removes the
inconsistency.

---

## 5. Smallest repair

One line, in `scripts/run-email-critical-tests.mjs` only:

```js
import { realpathSync } from 'fs';
…
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  runEmailCriticalTests();
}
```

`realpathSync` matches what Node already did to `import.meta.url`, so both sides
are canonicalized and the three invocations in §3 all run the gate. `import.meta.main`
would be cleaner but landed after Node 22, and `.nvmrc` pins `22.23.2`.

An equally acceptable alternative that removes the guard entirely: keep
`run-email-critical-tests.mjs` as a pure module and point `package.json` at a
two-line `scripts/test-email-critical.mjs` that imports and calls it. Either way
the deduplication and the single vector are preserved.

No re-review of the email work is needed. This does not touch runtime source,
compiled artifact input, email behavior, or any release manifest field, and the
R1–R4 conclusions stand unchanged.

---

## 6. Other newly introduced defects

**None beyond §3.** Checked and cleared:

- Importing the module does **not** auto-run: an `await import(...)` returned
  `runEmailCriticalTests` as a function and the 22-element vector with no Vitest
  output.
- Call-site position in `build-release.mjs` is unchanged — after the Node-pin and
  clean-worktree checks (`:10-27`), before `fs.rmSync(dist)` — so the gate still
  runs against the exact committed tree and still cannot influence `dist/`.
- The archive payload is unaffected: `build-release.mjs` is not shipped, and the
  archive pushes only `scripts/verify-release.mjs` and
  `scripts/activate-release.mjs`, neither of which imports the runner. No shipped
  file has a new dependency.
- `path` and `execFileSync` remain used in `build-release.mjs` (git rev-parse,
  tsc, verify-release, packaging); the import removal left no dead reference.
- The runner's shebang is decorative — both entry points invoke it via `node` —
  so the missing execute bit is not a defect.
- `scripts/run-email-critical-tests.mjs` is currently untracked and must be
  committed; `build-release.mjs:18-27` refuses to package with any untracked
  file, so a partial commit would fail loudly rather than silently.

---

## 7. Checks

Runtime: macOS, `/private/tmp/nanoclaw-sales-ack`. Local `node -v` = `v26.5.1`;
`.nvmrc` pins `22.23.2`. Nothing was sent, deployed, written to a database,
activated, or committed.

| Check | Result |
| --- | --- |
| Mechanical extraction of `EMAIL_CRITICAL_TEST_ARGS` vs the R4-verified vector | **Exact match** — 18 files, order, flags, no dupes/strays, all on disk |
| Repo-wide grep for remaining hard-coded `.test.ts` lists | None in `package.json` or `scripts/build-release.mjs` |
| Repo-wide grep for runner consumers | Exactly two: `package.json:22`, `scripts/build-release.mjs:8` |
| `npm run test:email-critical` | Ran the gate — 18 files / 497 tests, exit **1**, resolved command line captured |
| `node scripts/run-email-critical-tests.mjs` (relative) | Ran the gate, exit **1** |
| `node /tmp/nanoclaw-sales-ack/…` (symlinked absolute) | **Silent no-op, exit 0** — §3 |
| `await import(runner)` | Exports present, **no** auto-run |
| Main-detection idiom in other release scripts | Not used; issue is isolated |

The 95 failures inside the 497 remain the same single `better-sqlite3`
`NODE_MODULE_VERSION 127 vs 147` ABI mismatch, because `node_modules` symlinks
to the primary checkout built for Node 22. That is an environment limitation and
is unrelated to this change; the 18-file / 497-test **totals** are what matter
here, and they match the authoritative gate exactly. I did not run
`release:build` — it requires Node 22.23.2 and a clean worktree, and this
checkout has neither.

---

## 8. File written, elapsed time, cost

**File written**

```
docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R5.md
```

Exactly one file, and the only file I wrote this round. No source, test, other
documentation, runtime data, service, Gmail, Slack, or database was modified, and
no message or email was sent. The four pre-existing modified files and the
untracked `scripts/run-email-critical-tests.mjs` are Codex's, untouched by me.

**Elapsed:** ~4 minutes wall clock (2026-08-06T01:16:01Z → 2026-08-06T01:19:44Z),
single Claude session, no subagents and no parallel workflows.

**Cost:** not available — this session exposes no token or cost telemetry to me,
and I will not estimate one. Scope for reference: 4 gate/probe executions, 2
scripted vector comparisons, and roughly 8 file reads/greps.
