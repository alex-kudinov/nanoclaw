# Claude bounded review request: healer resolution loop

## Objective

Review the exact deployed healer-resolution implementation for material defects
against the accepted safety and lifecycle contract. Report only findings that
could cause unbounded projection, duplicate/lost work, false closure, unsafe
activation/configuration, failure of the existing fast healer, or misleading
live verification.

## Authority and accepted facts

- `PROGRAM.md`, `docs/SELF-HEALING-COMPLETION-PLAN.md`, and migration 132 are
  authority. Do not redesign the program or expand the scope.
- The live catalog contained 146 incidents, so activation must remain limited
  to exactly one configured natural `healer:<fingerprint>` source and
  `MAX_ITEMS=1`.
- Slack presentation and Chief pickup are existing exception-loop behavior.
  No remediation, source correction, second source, customer action, schedule,
  or credential authority is granted.
- Production release is `d39bc0733e2d6840f69a43361c654b7734973170`.
  One natural item produced 1 work item / 1 observation / 2 events; replay was
  no-op. One Chief dispatch reached `attempted/1/posted` with events
  `posted,picked_up,attempt_succeeded`; work remains blocked.
- The first fast-healer activator attempt exposed a launchd run-counter reset,
  automatically rolled back, and was corrected before final deployment.

## Allowed read paths

1. `src/healer/company-work-adapter.ts`
2. `src/healer/company-work-ledger.ts`
3. `src/healer/company-work-projection.ts`
4. `src/healer/resolution-catalog.ts`
5. `src/healer/collector.ts`
6. `src/healer/company-work-config-file.ts`
7. `scripts/activate-healer-release.mjs`
8. `data/business/migrations/nanoclaw-v2/132_company_healer_resolution_work.sql`

You may also read this request and the focused tests adjacent to those files
only when needed to verify a concrete finding. Do not read `.env`, credentials,
session/auth directories, database contents, logs, or unrelated private files.

## Required response

Write only `docs/reports/NC-20260823-003-CLAUDE-BOUNDED-REVIEW-RESPONSE.md`.
Do not edit source or any other file. Use:

- verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`;
- findings ordered by severity with exact file/line evidence;
- why each finding violates the accepted contract;
- the smallest correction and focused regression test.

Do not restate the implementation, propose a backlog, or treat the known CNPC
wrapper-literal test failure as related.
