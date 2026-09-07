# Selective consultation evaluation — NC-20260907-002

Evaluator: Codex, independently reading generated responses against the owner
scope and consultation rubric. These are synthetic model responses, not
blinded human grading or natural customer outcomes. No customer tools or sends.
Full cards, input hashes, per-run policy/suite hashes and usage are in the
companion GENERATED-EVALUATION.json. Expectations were not supplied to the model.

## Results

All 11 cases / 15 final native-card turns pass the material behavioral criteria.
Every case is critical, including development and holdout. Full review cards
exercise the actual draft/audit process; only tool transport is substituted.
Each continuation starts a fresh process and receives the actual previously
generated customer email, never a prescribed ideal assistant response.

| Case / turn | Result | Observation |
| --- | --- | --- |
| direct-price / 1 | PASS | Gives $3,999 immediately; no discovery. Route label ANSWER instead of TRANSACT is a metadata deviation; pricing remains host-guarded/manual and no recommendation is added. |
| direct-long-background / 1 | PASS | Gives two-hour duration; biography does not trigger discovery. |
| direct-one-missing-detail / 1 | PASS | Asks which course without assuming a price or launching goal discovery. Longer than necessary, but no material friction. |
| direct-enroll / 1 | PASS | Supplies exact synthetic enrollment link immediately; no qualification or upsell. |
| direct-inclusion / 1 | PASS | Answers inclusion directly; no consultation. |
| mixed-career-price / 1 | PASS | Answers price before exploring intended career direction; no invented business goal. |
| mixed-timing-fit / 1 | PASS | Answers duration then explores intended direction without a confident personalized recommendation. |
| advice-missing-goal / 1 | PASS | Connected goal/outcome questions, no ACC/PCC forced choice or operator escalation. |
| advice-goal-already-clear / 1 | PASS | Uses supplied goal/constraints to recommend foundation and asks whether it fits; no repeated discovery or price. |
| dialogue-internal / 1 | PASS | Explores intended use and desired credential outcome. Opening contains unnecessary positive framing, retained as a nonmaterial tone limitation. |
| dialogue-internal / 2 | PASS | Uses the internal-work/foundation goal, explains appropriate scope, invites a reaction; no repeated business question. |
| dialogue-internal / 3 | PASS | Switches to a direct mentor-inclusion answer. |
| dialogue-reconsider / 1 | PASS | Compares scope against stated goals, recommends fuller path, asks how it fits. |
| dialogue-reconsider / 2 | PASS | Accepts the customer's explicit preference for foundation, adjusts advice and leaves further study optional; no longer-path pressure. |
| dialogue-reconsider / 3 | PASS | Respects pause/no-follow-up, no alternative pitch. Actual suppression writes are outside this tool-free harness and remain the existing host workflow. |

## Corrections and limits

- Simplified-output prototypes caught unrequested comparison pricing, generic
  reaction invitations and unsupported segmentation of deeper study as chiefly
  for independent practice. Policy now explicitly addresses these. Prototype
  responses are not counted as a successful production-format evaluation.
- Native-card first run caught a later response calling training a complete
  credential. Added explicit training/credential separation and regenerated
  that entire three-turn conversation; only corrected turns count above.
- One transport attempt emitted a native text card instead of JSON wrapping.
  The harness now accepts both without changing card content or expectations.
- R1 Claude review found undefined "critical cases" in the rubric. All cases
  are now explicitly critical; the case expectations were not relaxed.
- The baseline comparison (same synthetic inputs, prior aa73538c prompts,
  simplified-output transport) reproduced premature ACC/PCC selection for the
  educator scenario and unnecessary program/price expansion for the mixed ask.
  The long-biography factual question stayed direct in both versions. This is
  supporting before/after evidence, not a controlled statistical quality claim.
- No assertion of perfect tone, perfect route tagging, Cherie-equivalent
  judgment, conversion improvement, or independently understood host intent.
  Consultative/mixed drafts remain explicitly human approved.

## Mechanical evidence

- Focused initial prompt/autonomy: 53/53; added header-spoof test passes.
- Exact context/assigned Gmail/approval: 103/103; bounded Slack context retains
  own drafts/operator revisions and Gmail reads remain resource-scoped.
- Email-critical: 800/800 plus runner 45/45 before final header test.
- Full root: 3,635 passed / 32 skipped; two unchanged predecessor failures
  (CNPC source-wrapper assertion and time-sensitive Trafft freshness).
- Final-lineage verification and deployment are recorded separately in the
  changelog, not inferred from these results.
