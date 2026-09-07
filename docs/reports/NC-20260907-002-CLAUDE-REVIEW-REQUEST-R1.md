# Bounded implementation review — selective Sales consultation

Use Sonnet/high. Review the prepared diff and listed artifacts only, then write
`docs/reports/NC-20260907-002-CLAUDE-REVIEW-RESPONSE-R1.md`. Read-only except that
response file. No Bash, web, MCP, credential/settings/session access, Git edits,
customer data, deployments, messages or further agents. Report only material
findings with exact evidence and necessary corrections; otherwise NO MATERIAL
FINDINGS. Do not restate the change or explore the repository.

## Accepted owner intent

Add selective intelligence: specific questions get specific answers; personal
advice inquiries engage in dialogue, ask several useful questions, understand
goals, recommend once enough is known, invite reactions and adjust. Mixed
questions get direct answers plus exploration. No blanket consultation format,
fixed question count, mandatory discovery call, invented goals or premature
product matching. The operator-corrected educator reply is the positive
reference; do not criticize the owner's preference for multiple questions.

## Implementation and bounds

- Base exact live aa73538c; isolated checkout, primary dirty source preserved.
- Diff includes the cohesive five-policy/three-host-boundary change plus one
  regression file. Although more than eight individual files change, the
  prepared diff is bounded (~37KB) and review requires no broad archaeology.
- Host gates declared strategy, not semantic correctness: one DIRECT and a
  supported non-ORIENT route permits existing L2 eligibility; advice/mixed and
  missing/conflicting metadata stay manual. Recheck persisted holds before
  firing. Human advice approval counts remain; it earns no direct-answer streak.
- No new schema/provider grant/customer send/cadence or recipient changes.
  Exact assigned Gmail reads already exist and reconstruct history; current
  Slack thread is authority for operator edits, not proof a draft was sent.
- 53 focused tests pass, email-critical 800 plus runner 45 pass; full root has
  3,635 passes / 32 skips and only two unchanged predecessor failures (CNPC
  wrapper-literal, date-sensitive Trafft). No new failure. Model evaluation is
  in progress and not claimed complete: simplified-output prototypes found
  early-advice and pricing issues. Final harness generates normal full review
  cards and preserves each earlier generated email across fresh processes.

## Allowed artifacts (absolute root is this checkout)

1. `docs/reports/NC-20260907-002-REVIEW.diff` — current implementation and tests.
2. `evals/sales/run-consultation.mjs` — tool-free generator; expectations withheld.
3. `evals/sales/consultation-cases.json` — synthetic cases and held-out expectations.
4. `evals/sales/consultation-rubric.md` — independent scoring contract.

Check especially selective behavior vs blanket discovery, contradictory prompt
instructions, recoverable conversation evidence, mixed-request commercial
bounds, direct-question regressions, persisted automatic-hold bypasses, and
whether the evaluation meaningfully exercises the accepted behavior. Findings
must distinguish a real defect from explicitly limited proof. Semantic quality
is not deterministically guaranteed; approval remains part of the pilot.

Write only the named response, with material findings ranked by consequence
and file references. No owner approval or additional scope is invented.
