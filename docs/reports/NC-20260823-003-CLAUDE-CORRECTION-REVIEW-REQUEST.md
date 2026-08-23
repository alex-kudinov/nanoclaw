# Claude correction review request: stale healer decision actor

## Objective

Verify the smallest correction for Finding 1 in
`NC-20260823-003-CLAUDE-BOUNDED-REVIEW-RESPONSE.md`. Report only whether the
finding is fully resolved without introducing a material regression.

## Finding being corrected

The catalog previously hashed any raw `decision_actor`, even when the current
classification was not `decided_no_action`. A stale rejection actor on a
re-entered monitoring incident therefore violated the downstream ledger
invariant and could wedge the sole configured source.

## Exact correction scope

Read only:

1. `src/healer/resolution-catalog.ts`, especially `itemFrom`.
2. `src/healer/resolution-catalog.test.ts`, especially the new stale-actor
   regression.
3. `src/healer/company-work-ledger.ts`, only to confirm the existing invariant.
4. The original response named above, if needed.

Do not read `.env`, credentials, session/auth directories, databases, logs, or
unrelated private files. Do not edit source.

## Verification already run

- focused catalog/adapter/ledger/projection: 31 passed;
- complete healer suite: 241 passed, 2 skipped;
- typecheck: passed;
- documentation continuity: passed;
- full suite: 3,020 passed, 12 skipped, with the single known unrelated CNPC
  wrapper-literal failure.

## Required response

Write only
`docs/reports/NC-20260823-003-CLAUDE-CORRECTION-REVIEW-RESPONSE.md`.

Use one verdict:

- `NO MATERIAL FINDINGS` if the original finding is fully resolved and the
  regression is adequate; or
- `MATERIAL FINDINGS` with exact file/line evidence, the remaining contract
  violation, and the smallest correction.

Do not propose unrelated cleanup or a broader redesign.
