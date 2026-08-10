# NC-20260809-003 — Deterministic CaleProcure collector repair review, Codex R14

- Date: 2026-08-10
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base/live commit: `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Claude session: preserve exact session `58fde579-483e-42ca-a516-434971d3ad07`
- Response file: `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R14.md`

## Authorization and boundaries

The owner asked Codex and Claude to work together and authorized non-secret
NanoClaw source/documentation exchange. Read only repository source, tests, and
the R12-R14 request/response chain. Do not read `.env*`, credentials, sessions,
browser profiles, logs, databases, task payloads, or production state. Do not
browse or use the network. Write only the named R14 response file. Do not edit
implementation files, commit, deploy, or perform external actions.

## R13 disposition

R13 returned `CHANGES REQUIRED`. Codex accepts and repaired B-1, B-2, B-3,
H-1, H-2, H-3, M-2, M-4, M-5, L-1, and L-3.

### B-1 stale state

`src/procurement-browser-port.ts` now requires two independent transitions for
each search:

1. Clear and Search must each visibly enter and leave the portal's
   `Loading...`/`Searching...` busy state. The visible wait is armed before the
   click.
2. Clear must remove every visible result summary, no-results marker, and grid
   before the keyword can be entered. Search then starts from no visible result
   state and must create a fresh visible summary/no-results marker.

The interaction was checked against the current public page in an in-app
browser. Clear emptied the Event Name field, hid the prior grid and result
marker, and produced a visible busy cycle. Search produced a visible busy cycle
and then a fresh one-row `facilitation` result containing event `0000039985`.
This also disproved R13's suggested post-Clear baseline-count assertion: Clear
hides the result panel rather than re-running the unfiltered baseline. The
permanent baseline remains checked once after initial open.

`src/procurement-browser-port.test.ts` includes a stale-state fixture: a prior
result state that never disappears must fail. Loopback is now exactly
`127.0.0.1`; `localhost` is rejected. Visible malformed result rows now fail
loudly. Row counts are captured once. Partial two-page creation is cleaned up.

### B-2 timeout evidence and H-3/M-5 process exit

- `src/job-runner.ts` passes the exact outer timeout as
  `NANOCLAW_JOB_TIMEOUT_MS`.
- `src/procurement-caleprocure-job.ts` arms an internal abort at 80% of that
  timeout and maps `SIGTERM` to the same abort controller.
- `collectCaleProcure` races every portal operation against the signal; abort
  becomes a `CaleProcureCollectionError` with the proven partial collection,
  and its `finally` closes both pages.
- Live mode writes one partial receipt before exiting nonzero. A unit test
  proves the abort path calls intake exactly once and closes the port.
- CLI output uses awaited stream callbacks, `process.exitCode`, and an awaited
  `resetBusinessPool()` rather than `process.exit()`.

### B-3 and H-1 bounded/useful progress

- The remaining 200-row budget is checked before any detail navigation. A test
  proves 201 rows cause zero `readDetail` calls.
- A unit whose agency/detail identity cannot be proven is omitted, diagnosed,
  and later planned units continue. A test proves the later unit is observed.
- Aborts still terminate the whole run and preserve only earlier observed
  units.

### H-2 / OD-5 disposition

Codex chose the security/reliability side of OD-5: retire agent-owned Bonfire
browsing with the bridge. `src/container-runner.ts` no longer reads/injects
Bonfire credentials, resolves a procurement CDP endpoint, writes
`AGENT_BROWSER_CONFIG`, or exposes `192.168.64.1:9250`. It deletes any stale
`groups/procurement/agent-browser.json`. Procurement instructions now say that
all portal acquisition is host-owned: CaleProcure uses this deterministic job;
Bonfire and missing attachment acquisition remain paused until deterministic
host adapters exist. Historical procedures remain labelled non-executable.

## Independent verification

- Pinned Node 22.23.2 typecheck: pass.
- Focused: 6 files / 47 tests pass.
- Canonical root suite outside the local-port sandbox: 157 files / 2,006 tests
  pass.
- Independent container runner: build pass; 4 files / 29 tests pass.
- `git diff --check`: pass.
- Local loopback port 9250 is not running, so the complete shadow job is
  intentionally deferred to the immutable host deployment. No database write
  or production mutation was performed for this candidate.

## Required review

Read the complete candidate diff and R13 response, then report:

1. `GO`, `CHANGES REQUIRED`, or `NO-GO` for commit plus shadow deployment.
2. Whether B-1/B-2/B-3 and H-1/H-2/H-3 are actually closed, including races in
   busy/result transitions, abort propagation, page cleanup, exact-once partial
   receipts, stdout flushing, and pool shutdown.
3. Whether continuing after a per-unit identity or row-budget failure can make
   the collection or receipt misleading.
4. Any new blocker/high issue in source authority, job path/timeout semantics,
   loopback-only CDP, release packaging/dependency resolution, or the explicit
   retirement of container browser access.
5. Whether the tests are sufficient for a shadow deployment and the exact
   shadow/live gates still required. Do not lower R13's empirical acceptance
   standard merely because unit tests pass.
6. The minimal exact fix sequence if changes remain.

Record commands, files read, limitations, elapsed time, exact CLI cost if the
wrapper exposes it, and confirm that exactly one response file was created.
