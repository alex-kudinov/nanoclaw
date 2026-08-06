# NC-20260806-001 — Claude review response R3

## Verdict

`CONVERGED`

R2's F3 objection is resolved at the root: the predicate itself is shared, not
just the constant, and the drift band I reproduced in R2 is gone at every
boundary I could construct. The two R2 residual improvements are in and behave
as intended, and the release gate now fails loudly on a runner regression
without depending on root Vitest discovery. No blocking defect remains.

One operational prerequisite is new and undocumented (D1 below): the gate now
requires `container/agent-runner/node_modules` to exist, and root `npm ci` does
not create it.

## Independent evidence reproduced

Pinned runtime `/opt/homebrew/opt/node@22/bin/node` `v22.23.2` (matches `.nvmrc`):

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `prettier --check "src/**/*.ts"` | pass |
| `node scripts/run-email-critical-tests.mjs` | 19 files / **513** host tests pass, then runner `tsc` build, then 4 files / **29** runner tests pass |
| complete host suite (`vitest run`) | 148 files / **1,943** tests pass |
| focused: `approval-recap`, `ipc-handoff-echo`, `channels/slack` | 3 files / 140 tests pass |
| `npm run docs:continuity-check` | pass (47 active/ready rows, 43 changelog entries) |

Every number in the R3 brief reconciles.

## Required checks

### 1. R2 leading-whitespace reproduction, against the real shared predicate

Ran the R2 probe again, importing `isSlackMessageOverLimit` /
`slackMessagePrefix` from `src/slack-limits.ts` and evaluating both call sites'
expressions (`src/ipc.ts:540`; `src/channels/slack.ts:1033-1035`):

```
starts with [    len=3990 prefix=0 parses=true IPC=false SLACK=false
starts with [    len=3993 prefix=0 parses=true IPC=false SLACK=false
starts with [    len=3995 prefix=0 parses=true IPC=false SLACK=false
starts with [    len=4001 prefix=0 parses=true IPC=true  SLACK=true
leading newline  len=3990 prefix=8 parses=true IPC=false SLACK=false
leading newline  len=3993 prefix=8 parses=true IPC=true  SLACK=true
leading newline  len=3995 prefix=8 parses=true IPC=true  SLACK=true   <-- was DRIFT in R2
preamble line    len=3993 prefix=8 parses=true IPC=true  SLACK=true
preamble line    len=3995 prefix=8 parses=true IPC=true  SLACK=true   <-- was DRIFT in R2
```

The 3,995-character leading-newline card — R2's exact counterexample — is now
rejected by the IPC preflight. `src/ipc-handoff-echo.test.ts:581-621` pins that
reproduction with an explicit `expect(prefixedOverlong).toHaveLength(3995)` and
asserts the full contract: the original card is never posted, the visible
rejection carries `threadKey: lead:prefixed@example.com`, the targeted
`[approval_card REJECTED]` goes to `nanoclaw-sales-prefixed-overlong` only, and
the file is quarantined as `approval-card-overlong-*`.

### 2. No remaining length/prefix drift

- Both sites call one function with the same inputs. IPC passes `sourceGroup`
  (`src/ipc.ts:540`); the transport receives `fromGroup: sourceGroup` from the
  same branch's `deps.sendMessage` call, so the preflight measures the exact
  bytes the transport will measure. Not "currently equal" — structurally the
  same expression.
- The boundary tracks the group name rather than being hardcoded. For a
  17-character prefix (`client-support`) both sides flip at 3,984 rather than
  3,993, verified by probe — which is the behaviour a shared predicate should
  have and the previous code did not.
- Swept every other length comparison in `src/`. The only remaining
  `MAX_MESSAGE_LENGTH` uses in `src/channels/slack.ts` are the message text at
  `1050`, the split decision at `1078`/`1103`, and the truncating
  `postTracked`/grader posts at `1251`/`1289`.
- **Accepted cards can still never be fragmented.** `!isSlackMessageOverLimit(text, fromGroup)`
  ⇒ `prefix.length + text.length ≤ 4000`, and `displayText = prefix + outboundText`
  with `outboundText === text` for an accepted card ⇒ `displayText.length ≤ 4000`
  ⇒ the single-post branch at `src/channels/slack.ts:1078`. The preflight and the
  split decision are now the same inequality.
- Boundary observation, out of scope: `postTracked` (`src/channels/slack.ts:1239-1251`)
  runs no approval-card guard and silently truncates at 4,000. Nothing carrying
  the four card markers routes through it today — the proposal follow-up drafts
  it posts start with `📋 *Proposal follow-up #N …*`
  (`src/proposal-followup.ts:110-119`), which `isApprovalCard` does not match —
  but it is the one remaining Slack post path with neither guard.

### 3. The release gate really fails on a runner regression

- Mechanism: `scripts/run-email-critical-tests.mjs:43-52` spawns
  `npm run build` and `npm test` with `cwd = container/agent-runner` via
  `execFileSync`, which throws on a non-zero exit. `runEmailCriticalTests` does
  not catch, and `scripts/build-release.mjs:43` calls it **before** `dist` is
  removed and rebuilt (`45-55`) and long before packaging — so a runner failure
  aborts the release with no artifact produced.
- Empirically verified rather than assumed: copied the runner to a temp dir,
  appended one failing test, ran the gate's exact command. Result
  `npm test exit=1`, `Tests 1 failed | 29 passed (30)`. `execFileSync` converts
  that to a throw.
- Independent of root Vitest discovery: `vitest.config.ts` still includes only
  `src/`, `setup/`, `skills-engine/`, `scripts/`. The runner is reached by
  explicit cwd and its own vitest binary, which is the right way to enforce a
  separate build unit.
- New prerequisite (D1): with `container/agent-runner/node_modules` absent,
  `npm run build` exits **127** (`sh: tsc: command not found`). Root
  `package.json` declares no `workspaces`, so `npm ci` at the repo root does not
  install it. On a fresh release checkout, `npm run release:build` will now fail
  until someone runs an install inside `container/agent-runner`. The direction is
  safe — it fails loudly rather than silently skipping the runner tests — but
  nothing automates or documents it.

### 4. Recap additions do not unsuppress Marina

Probed against the real export (`src/approval-recap.ts:13-19` now vetoes on
`?`, `\bstill\b`, and the negation set):

| Text | expected | result |
| --- | --- | --- |
| `Draft posted for Marina Minina (Lead #1047) — ACTC matched, awaiting approval in thread.` | suppressed | **suppressed** |
| `Revised draft posted in-thread with the booking link — awaiting approval.` | suppressed | **suppressed** |
| `Updated draft posted in the thread — awaiting approval.` | suppressed | **suppressed** |
| `Review card ready and awaiting approval.` | suppressed | **suppressed** |
| `Updated draft posted, awaiting approval. Do you want the discovery-call link in there too?` (R2 residual) | visible | **visible** |
| `Review card ready, awaiting approval. Gmail thread lookup is still running.` (R2 residual) | visible | **visible** |

All six R1/R2 negative cases are literal tests at `src/approval-recap.test.ts:16-24`,
inside the release-blocking gate.

The cost of the two new veto tokens, stated plainly because I recommended them:
`Draft posted; still awaiting approval.` and any recap containing a `?`
(including a link with a query string) now escape suppression. That is a
redundant or false line posted *next to* the visible rejection, never a hidden
stall — and the targeted correction turn fires regardless of what the model
writes, so no correction depends on this predicate. Right side of the trade.

## Residual risks

1. **Rejection loop is still unbounded** (carried from R1/R2). A model that
   cannot self-correct can cycle card → reject → repost, posting a visible
   `[APPROVAL CARD REJECTED]` each time; the overlong branch adds a shape where
   trimming a few characters re-trips the same limit. No counter in `src/ipc.ts`.
   A per-container consecutive-rejection cap that escalates to chief remains the
   right shape, and is the one thing I would still add before this path sees
   heavy traffic.
2. **Runner deps prerequisite** — D1 above.
3. `src/slack-limits.ts` still has no dedicated test file, though it now holds
   logic rather than a constant. It is covered transitively and meaningfully
   (the IPC prefix regression at `src/ipc-handoff-echo.test.ts:581-621` and
   `src/channels/slack.test.ts`), so this is a convention gap, not a coverage
   gap.
4. **Host-side cross-group force-route is still assertion-free.** No test writes
   a card with `targetGroupFolder`; that `src/ipc.ts:499` ignores it is verified
   only by reading. The runner half is tested.
5. **Two round trips** for a card that is both overlong and content-invalid
   (length reported first, content only after the shortened repost). Matches the
   transport's precedence; consistent, not wrong.
6. **Forensics split**: if `deps.sendMessage` throws after the targeted
   rejection is delivered, the outer catch at `src/ipc.ts:1537-1547` files the
   card under `ipc/errors/` instead of `ipc/quarantine/<group>/`.

R2's symlink hygiene item is resolved — `container/agent-runner/node_modules` is
a real directory again and matches `.gitignore:2`, so
`scripts/build-release.mjs:19-28` will not trip on it.

## Documentation

`docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
`docs/ARCHITECTURE.md`, and `docs/ACTIVE-WORK.md` now describe what the code
does, and the R2 objection — a guarantee on record that the code did not make —
is resolved by the code rather than by softening the claim. Two nits:

- The changelog Verification bullet leads with the superseded "19 files / 510
  tests … 148 files / 1,940 tests" and corrects it to 513/1,943 four sentences
  later. Chronologically honest, but a reader skimming the first number gets a
  stale figure.
- The Implementation bullet still says "A shared 4,000-character limit prevents
  IPC/Slack drift". True now, but it is the *predicate*, not the limit, that
  prevents it — the Verification bullet says this correctly.

`docs/reports/NC-20260806-001-CONVERGENCE-STATE.md` records "Owner decisions:
none" while `docs/ACTIVE-WORK.md` has already committed to two of them (recycle
only idle Sales containers; non-customer exact-session rejection/repost canary).
Worth reconciling so the convergence record is not the weaker document.

## Owner decisions

- **D1 — before the next release build, not before commit.** Add an install step
  for the runner to the gate (e.g. `npm ci --prefix container/agent-runner`
  ahead of `npm run build`), or document the prerequisite in
  `docs/RELEASE-INTEGRITY.md`. Without it, `npm run release:build` on a clean
  checkout fails at exit 127 for a reason unrelated to the code under test.
- **D2 — accepted, no action needed unless you disagree.** `docs/ACTIVE-WORK.md`
  already sets the activation plan: force-recycle only idle Sales containers,
  then run a non-customer exact-session rejection/repost canary. That canary is
  still the only thing that exercises a real container round trip; nothing in
  1,943 tests does.
- **D3 — optional.** Cap consecutive rejections per container/lead (residual 1)
  now, or track it as a follow-up `NC-` task.

Nothing blocks commit.

## Cost

R3 review elapsed 2026-08-06T22:13:40Z → 2026-08-06T22:18:30Z (~5 minutes),
single Claude session, no subagents. Independent execution: 1 typecheck,
1 format check, 5 test invocations (513 gate + 29 runner + 1,943 full suite +
140 focused), 1 continuity check, 2 behavioural probes against the real exports
(shared limit predicate, recap predicate), and 2 sandboxed gate-failure
experiments (failing runner test → exit 1; missing runner deps → exit 127).
Cumulative across R1–R3: ~19 minutes.
