# NC-20260806-001 — Claude documentation closeout R4

## Verdict

`CONVERGED`

The documentation option I accepted in R3 D1 is resolved accurately, the command
order is coherent, and no source change is required or implied. One caveat about
the documented command is worth knowing but does not affect this verdict.

Scope held to R3 D1 only; no converged implementation finding is reopened, and
nothing in this documentation change invalidates one.

## What I verified

### The documented command actually does the job

`npm ci --prefix container/agent-runner` is not just plausible — I ran it from a
repo root in a sandboxed copy (runner `package.json`, `package-lock.json`,
`tsconfig.json`, `src/` only, no `node_modules`):

```
npm ci --prefix container/agent-runner   exit=0
container/agent-runner/node_modules/.bin/  ->  tsc, vitest present
cd container/agent-runner && npm run build   exit=0
cd container/agent-runner && npm test        pass
```

So the single documented line takes a fresh checkout from the exact 127 failure
I reported in R3 (`sh: tsc: command not found`) to a gate that builds and passes.
`npm ci` is also the right verb rather than `npm install`: the runner ships
`container/agent-runner/package-lock.json`, so the release procedure installs a
locked tree.

### Command order is correct and non-contradictory

`docs/RELEASE-INTEGRITY.md:80-88` now reads:

```
nvm use / node --version / npm ci
npm ci --prefix container/agent-runner
npm run typecheck
npm run test:email-critical
npm test
npm run release:build
```

The runner install sits after the root install and before both consumers
(`test:email-critical` and `release:build`), which is the only ordering that
works — `scripts/run-email-critical-tests.mjs:43-52` spawns the runner build and
tests, and `scripts/build-release.mjs:43` calls that gate before touching `dist`.
`docs/RELEASE-INTEGRITY.md` contains exactly one command block, so there is no
second sequence to contradict it; the only other `npm run build` mention (line
108) is the standing prohibition against building on a dirty production
checkout, not an alternative path.

`docs/PROJECT-MAP.md:924-936` mirrors the same ordering and correctly *moves*
rather than duplicates the install: the old `npm install` inside the trailing
`cd container/agent-runner` block is gone, and that block now relies on the
`npm ci --prefix` line above it. Coherent either way — the trailing block is now
a redundant explicit re-run of what the gate already did, which is harmless as a
manual verification step.

### The stated rationale is factually true

- "independent package, not an npm workspace" — root `package.json` declares no
  `workspaces` key, so a root `npm ci` genuinely does not reach it. Confirmed.
- "the shared email gate deliberately builds and tests the runner and fails
  closed when those dependencies are missing" — confirmed empirically in R3 and
  unchanged here: a failing runner test exits 1 and a missing dependency tree
  exits 127; `execFileSync` turns both into a throw before any artifact is
  produced.

### No source change, no scope creep

`git diff --stat` for this round differs from R3 only in documentation:
`docs/RELEASE-INTEGRITY.md` +7, `docs/PROJECT-MAP.md` +22 (was +20),
`docs/ACTIVE-WORK.md` +37 (was +33), `docs/ENGINEERING-CHANGELOG.md` +54 (was
+51). Every source and test file carries byte-identical counts to what I
verified in R3 — `src/ipc.ts` +109, `src/ipc-handoff-echo.test.ts` +186,
`src/index.ts` +18, `src/channels/slack.ts` +13,
`scripts/run-email-critical-tests.mjs` +10,
`container/agent-runner/src/ipc-mcp-stdio.ts` +6. `npm run docs:continuity-check`
passes (47 active/ready rows, 43 changelog entries).

The R3 record added to `docs/ENGINEERING-CHANGELOG.md` describes the round
accurately, including that the prerequisite was non-blocking.

## One caveat, non-blocking

`npm ci` honours `NODE_ENV`. Verified in a sandboxed copy:

```
NODE_ENV=production npm ci --prefix container/agent-runner   exit=0
container/agent-runner/node_modules/.bin/  ->  tsc, vitest ABSENT
```

The command reports success while installing no devDependencies, so the gate
would then fail at exit 127 — still fail-closed, but with a failure that looks
like the documented step worked. `NODE_ENV=production` is set inside the
`npm run start` script rather than exported in an operator's shell, so this is
unlikely rather than routine. If you want it airtight, either write the step as
`npm ci --include=dev --prefix container/agent-runner` or add one clause noting
the release shell must not export `NODE_ENV=production`. Your call; the current
text is correct for a normal shell.

## Carried, unchanged by this round

R3's residuals stand as written and none are reopened here: the unbounded
rejection loop remains the one item I would still address before this path sees
heavy traffic; `src/slack-limits.ts` still has no dedicated test file; the
host-side cross-group force-route is still verified only by reading; the
overlong-plus-content-invalid card still costs two round trips; and a Slack post
failure after targeted delivery still files the card under `ipc/errors/` rather
than `ipc/quarantine/<group>/`.

The activation plan in `docs/ACTIVE-WORK.md` — commit, immutable release,
activate, force-recycle only idle Sales containers, then a non-customer
exact-session rejection/repost canary — remains the right sequence, and that
canary is still the only step that exercises a real container round trip.

## Owner decisions

None outstanding for this closeout. The optional `--include=dev` hardening above
is the only open choice, and it is not a blocker.

## Cost

R4 review elapsed 2026-08-06T22:20:39Z → 2026-08-06T22:21:47Z (~1 minute),
single Claude session, no subagents. Independent execution: 1 continuity check,
1 diff-scope comparison, and 2 sandboxed npm experiments (`npm ci --prefix`
install plus gate steps; the same command under `NODE_ENV=production`).
Cumulative across R1–R4: ~20 minutes.
