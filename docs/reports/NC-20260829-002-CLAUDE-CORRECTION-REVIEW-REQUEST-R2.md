# NC-20260829-002 — Correction review R2

## Objective

Verify that the single material R1 finding is resolved without weakening the
ordinary no-discovery-call boundary.

## R1 finding and correction

R1 found a conflict between the calibrated custom-engagement rule, which
requires one fit-conversation invitation for a supported custom-scoped
Executive/ADHD Executive Coaching `ORIENT` inquiry, and an older unqualified
General Principle banning consultation/discovery calls for "program inquiries."

The correction changes only that General Principle to:

- retain the ban for fixed-information training-program inquiries; and
- explicitly exempt the already-bounded custom-scoped Executive/ADHD Executive
  Coaching `ORIENT` fit conversation defined by `WORKFLOWS.md`.

The contract test now binds both halves of that distinction. Focused Sales
prompt tests pass 12/12 after the correction.

## Allowed artifacts

1. `docs/reports/NC-20260829-002-CLAUDE-REVIEW-RESPONSE-R1.md`
2. `groups/sales/EMAIL-RESPONSE-GUIDELINES.md`
3. `groups/sales/WORKFLOWS.md`
4. `src/sales-prompt-contract.test.ts`
5. This request

Do not inspect or edit any other path. Do not inspect runtime/private data or
perform any external action. Write only the response artifact below.

## Acceptance

Confirm whether:

1. the custom-engagement instruction is now unambiguous;
2. ordinary training-program inquiries still cannot acquire a discovery-call
   CTA through `ORIENT`; and
3. the structural test binds the distinction.

Write `docs/reports/NC-20260829-002-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`
with `Verdict: NO MATERIAL FINDINGS` or material findings with exact evidence.
