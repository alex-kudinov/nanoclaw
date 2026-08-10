# NC-20260809-003 — Deterministic CaleProcure collector implementation review, Codex R13

- Date: 2026-08-10
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base/live commit: `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Claude session: preserve exact session `58fde579-483e-42ca-a516-434971d3ad07`
- Response file: `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R13.md`

## Authorization and boundaries

The owner asked Codex and Claude to work together and authorized non-secret
NanoClaw source/documentation exchange. Read only repository source, tests, and
the R12 request/response chain. Do not read `.env*`, credentials, sessions,
browser profiles, logs, databases, task payloads, or production state. Do not
browse or use the network. Write only the named R13 response file. Do not edit
implementation files, commit, deploy, or perform external actions.

## Why this round exists

R12 returned `GO` on replacing the failed model-driven browser scan with a
deterministic host job. Codex implemented the first candidate slice. This is a
pre-commit adversarial review, not a request for affirmation.

## Candidate implementation

- `playwright-core@1.62.1` connects only to the dedicated Chrome loopback CDP.
- `src/procurement-browser-port.ts` owns portal interaction and visible-state
  extraction: unfiltered baseline, exact keyword searches, all visible result
  rows, the complete department directory, and detail-page identity checks.
- `src/procurement-identity.ts` permits trim/whitespace/case normalization only
  and requires one exact department match plus exact event/title/agency detail.
- `src/procurement-caleprocure-collector.ts` performs the nine release-owned
  queries, reconciles visible count to extracted rows, bounds the batch at 200,
  and preserves only earlier proven units on failure.
- `src/procurement-caleprocure-job.ts` supports shadow and live modes. Live
  writes require `PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED=1`; a collection
  failure writes one partial host receipt and exits nonzero.
- `src/job-runner.ts` executes tracked internal `dist/*.js` jobs with the pinned
  Node interpreter from the immutable `NANOCLAW_CODE_ROOT`, while retaining the
  operational checkout as cwd for runtime state.
- `scripts/register-caleprocure-collector.mjs` installs the job default-off at
  08:00 America/Chicago with a 900,000 ms absolute job timeout.
- `src/container-runner.ts` now honors configured timeout for single-turn
  scheduled tasks and logs when message-container timeout is raised for idle
  grace.
- `scripts/start-procurement-browser.sh` removes the unauthenticated container
  bridge and binds CDP explicitly to `127.0.0.1`.
- Procurement agent instructions retire model-owned CaleProcure browsing and
  ingest. The old IPC implementation remains in code only for rollback during
  the shadow/live cutover and will stay gate-off.

## Codex verification so far

- Pinned Node 22.23.2 typecheck passed before the latest path-hardening edit.
- Focused suite passed: 5 files / 41 tests before the latest path-hardening
  test; bash syntax and registration-script syntax passed.
- Public in-app browser evidence (not available to this review): current
  unfiltered page reports 320 rows; `facilitation` reports one row for event
  `0000039985`; the lookup directory maps exact agency to BU `3820`; the clean
  detail URL repeats the exact event, title, and department.
- No production mutation or database write has occurred for this candidate.

## Required review

Read the complete changed implementation, related intake/job/runtime source,
tests, package/release changes, group instructions, and R12 response. Inspect
the actual diff and report:

1. `GO`, `CHANGES REQUIRED`, or `NO-GO` for commit and a shadow deployment.
2. Any correctness flaw in Playwright locator/visibility/wait semantics,
   baseline and result-count reconciliation, directory completeness, detail
   identity, zero-result handling, duplicate rows, or the 200-row bound.
3. Whether a collection failure can create a misleading partial/complete
   source receipt or lose useful proven rows.
4. Process lifecycle risks: CDP connection shutdown, job timeout/process-group
   kill, PostgreSQL pool lifetime, browser pages left behind, concurrent jobs,
   or immutable-release dependency resolution.
5. Security risks in loopback enforcement, release-root path selection,
   environment gates, removal of `socat`, and the remaining disabled IPC.
6. Release/operational gaps: whether the new dependency and scripts are
   packaged, how the shared production `node_modules` must be refreshed, job
   registry activation, old task pause, environment changes, and rollback.
7. Missing or weak tests, ranked blocker/high/medium/non-blocking. Reproduce
   safe source-level issues where useful, but do not change implementation.
8. A minimal exact fix sequence if changes are required, plus the shadow/live
   acceptance gates you require before review can ever be enabled.

Record commands, files read, limitations, elapsed time, exact CLI cost if the
wrapper exposes it, and confirm that exactly one response file was created.
