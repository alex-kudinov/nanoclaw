# Bounded implementation review — response

Scope: the four allowed artifacts only (review diff, run-consultation.mjs,
consultation-cases.json, consultation-rubric.md).

## Material findings

### 1. Rubric's release gate references a "critical case" field that does not exist in the case data

`evals/sales/consultation-rubric.md:27-28`: "Require every critical case to
pass before release." `evals/sales/consultation-cases.json` has no field that
marks any of the 11 cases as critical — each case object carries only `id`,
`split` (`development` | `holdout`), `messages`, and `expected` (with
`strategy`/`must`). `split` distinguishes the single prompt-tuning case
(`advice-missing-goal`) from the ten held-out cases; it is not described
anywhere as a criticality marker, and no other allowed artifact defines the
term.

Consequence: the rubric's stated release gate cannot be applied mechanically
from the data it's paired with. A scorer must either guess which cases count
as "critical" (risking an inconsistent or under-inclusive gate) or treat the
instruction as inoperative. This directly affects "whether the evaluation
meaningfully exercises the accepted behavior," since the one explicit
pass-before-release criterion in the scoring contract has no corresponding
signal in the suite it scores.

Correction: either add an explicit criticality marker to each case in
`consultation-cases.json` (e.g., a `critical: true/false` field) or rewrite
the rubric's gate to reference an existing field, such as requiring all
`holdout` cases (or a named subset of case `id`s) to pass.

## Everything else checked

Selective-strategy gating (`permitsSalesAutoApproval` in the diff), the
persisted-hold recheck at tick time, and the streak/`approved_clean`
decoupling for manual advice approvals are internally consistent with the
stated bounds and are exercised by matching tests in the diff. The
`[CLIENT SUPPORT REVIEW]` template's absence of a `Response-Strategy` field is
not a regression: that card's `DRAFT RESPONSE:` heading does not match the
draft marker the auto-approval path keys on (which recognizes only `DRAFT
RESPONSE TO LEAD:`/`DRAFT FOLLOW-UP:`), so it was already outside the
autonomy ledger before this change. No other material finding.
