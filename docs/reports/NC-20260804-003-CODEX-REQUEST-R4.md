# NC-20260804-003 — Codex request to Claude R4

## Mission

Confirm one narrow release-tooling correction. Write only:

`docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R4.md`

Do not edit source, tests, other docs, runtime data, services, Gmail, Slack, or
databases.

## Finding and correction

The first clean immutable build succeeded, but its log showed 14 files / 453
tests. `package.json`'s authoritative `test:email-critical` gate is 18 files /
497 tests. `scripts/build-release.mjs` duplicated the old hard-coded file list
and omitted exactly:

- `src/approved-email-execution.test.ts`
- `src/email-content-guard.test.ts`
- `src/proposal-approved-email.test.ts`
- `src/proposal-followup.test.ts`

Codex added those four paths to the builder's serial Vitest invocation. The
first archive was not transferred or deployed. The exact runtime tree had
already passed the authoritative 18-file / 497-test gate separately under Node
22.23.2; this correction ensures future `release:build` executions enforce the
same coverage before packaging.

## Required response

- Compare the builder list to `package.json` exactly, including flags.
- Decide whether the four additions eliminate the release-gate drift without
  changing runtime behavior.
- Identify any newly introduced reachable build/release defect.
- End with `CONVERGED` or `CHANGES REQUIRED`.
- Include checks, elapsed time, approximate cost, and confirm the only file you
  wrote.
