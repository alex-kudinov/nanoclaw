# Claude correction response — NC-20260907-002 (R2)

Scope: the five corrections listed in CLAUDE-CORRECTION-REQUEST-R2.md only.
Files read: `src/autonomy-policy.ts`, `src/sales-consultation-approval.test.ts`,
`groups/sales/CONSULTATIVE-DIALOGUE.md`, `evals/sales/consultation-rubric.md`,
`docs/reports/NC-20260907-002-EVALUATION.md`. No Bash/MCP/web/other agents were
used; test-pass claims were not independently re-executed, only checked for
internal consistency with the code and stated evidence.

## Verification

1. **`src/autonomy-policy.ts`** — `permitsSalesAutoApproval` slices the text
   before the draft marker and takes only the first blank-line-delimited
   paragraph as the header before matching `Response-Strategy`/`Route`. A
   `THEIR ASK:` block separated by a blank line falls outside that paragraph,
   so quoted fields there cannot supply the required matches. Direct headers
   with no blank line before the marker are read in full, so existing direct
   cards still qualify. Matches the stated correction.

2. **`src/sales-consultation-approval.test.ts`** — contains in-memory
   `autonomyTick` cases for: new CONSULTATIVE/MIXED holds staying manual, a
   new DIRECT hold reaching hold-and-send, closed-fail cases including the
   blank-line-quoted `THEIR ASK:` body-only case, persisted-hold cancellation
   across legacy/consultative/missing/wrong-channel variants, and manual
   advice approval raising `approved_clean` without raising `streak`. Matches
   the stated correction. Pass/fail status itself was not re-run (no Bash in
   scope).

3. **`groups/sales/CONSULTATIVE-DIALOGUE.md`** — step 5 requires explicitly
   inviting a fit reaction after an advice recommendation or comparison; step
   4 prohibits inventing a practice/internal-work segmentation between
   programs and separately requires distinguishing training completion from
   credential issuance ("completing a training program is not itself an ICF
   credential"). All three corrections are present as described.

4. **`evals/sales/consultation-rubric.md`** — states plainly that "every
   generated turn of every development and holdout case" must pass before
   release. The all-case gate is explicit.

5. **`docs/reports/NC-20260907-002-EVALUATION.md`** — carries Codex's per-turn
   pass/observation table and a dedicated "Corrections and limits" section
   with explicit proof limits (synthetic evidence only, no tone/route/
   conversion/host-intent claims, consultative/mixed drafts remain human
   approved). `GENERATED-EVALUATION.json` was not opened, per instruction.

## Result

NO MATERIAL FINDINGS.
