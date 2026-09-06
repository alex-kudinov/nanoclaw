# NC-20260906-004 — correction review request R2

Review only the correction to R1's two material cross-program findings.

## Prior findings

`docs/reports/NC-20260906-004-CLAUDE-REVIEW-RESPONSE-R1.md` found that
`src/sales-fact-consistency.ts` flattened dates from multiple resolved programs,
causing both cross-program false acceptance and cross-program false rejection.

## Correction

- Published and future dates remain keyed by `ScheduleProgramId`.
- Each denial or explicit cohort/start-date sentence is attributed to the
  program names it contains. A sentence falls back to the resolved program only
  when the card resolves exactly one program.
- An unattributed schedule claim on a multi-program card fails closed with
  `schedule_claim_ambiguous`.
- Coaching Supervision pricing checks run only on sentences attributed to that
  program; another selected program's pricing cannot trigger the supervision
  catalog guard.
- `src/sales-fact-consistency.test.ts` now proves:
  1. an ACC-only date cannot validate a Supervision date claim;
  2. an ACC 2028 date cannot invalidate a truthful Supervision 2028 denial;
  3. an unattributed multi-program denial fails closed.

## Allowed paths

Read only:

1. this request;
2. `docs/reports/NC-20260906-004-CLAUDE-REVIEW-RESPONSE-R1.md`;
3. `src/sales-fact-consistency.ts`;
4. `src/sales-fact-consistency.test.ts`.

Write only
`docs/reports/NC-20260906-004-CLAUDE-CORRECTION-RESPONSE-R2.md`. Do not edit
implementation or inspect any other source, runtime data, credentials, or
worktree.

## Current verification

- Corrected focused fact/boundary suite: 218/218 passed.
- Pinned TypeScript typecheck and diff check passed.

## Required response

Return `NO MATERIAL FINDINGS` if both R1 findings are closed without a new
material false-positive/false-negative path. Otherwise return `MATERIAL
FINDINGS` with exact evidence and the smallest acceptance test. Do not restate
the design or propose unrelated expansion.
