# NC-20260809-003 Procurement recovery — Codex request R22

## Requested artifact

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R22.md`

Do not edit source, tests, task state, or any other file. Do not read `.env*`,
credentials, sessions, databases, customer content, or machine-local settings.

## Review target

Review the exact uncommitted R21 implementation diff in:

- `src/procurement-browser-port.ts`
- `src/procurement-browser-port.test.ts`
- `src/procurement-caleprocure-collector.ts`
- `src/procurement-caleprocure-collector.test.ts`

Use R21 request/response as the design authority. The production and human
boundaries are unchanged: all three Procurement gates are still `0`; no live
collection, review, decision, proposal advancement, or submission is allowed by
this review.

## Implemented mechanics

- Clear-state proof now requires summary and grid to disappear; the verified
  persistent message is ignored while exact empty-input verification remains.
- A visible no-results marker cannot terminate a query. Zero requires the
  existing exact query-bound response tuple.
- Visible positive termination remains summary-only; grid remains in the
  response-zero contradiction guard.
- `readVisibleResultTotal` no longer reads the unscoped marker, and the
  `noResultsVisible` parser parameter/branches are removed.
- Search observations and public unit diagnostics now include required boolean
  `visibleEmptyMarker`; receipt evidence remains unchanged.
- Regressions cover persistent marker through clear, response-only current
  zero, stale marker without response timeout, positive with stale marker,
  consecutive zeros, response-zero/visible-positive contradiction, and the
  removed live marker parsing branch.

## Independent verification so far

Exact Node 22.23.2:

- focused 3 files / 26 tests pass;
- typecheck passes;
- build passes;
- formatting passes;
- `git diff --check` passes.

Complete suite, continuity, immutable release, deployment, and restarted
three-shadow gate wait on this review.

## Required verdict

At blocker/high/medium severity, inspect the exact implementation and tests for:

1. stale-marker false acceptance or false contradiction;
2. response listener/order races;
3. missing validation or public diagnostic inconsistencies;
4. test fakes that do not exercise their stated production path;
5. any divergence from R21 H-1/M-1/M-2.

Return `GO FOR COMMIT AND SUPERSEDING IMMUTABLE SHADOW RELEASE` or `NO-GO`, with
exact file/line evidence and any required regression.
