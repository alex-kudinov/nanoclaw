# Final bounded corrections — NC-20260907-002

Sonnet/high. Read only the files listed below. Write only
`docs/reports/NC-20260907-002-CLAUDE-CORRECTION-RESPONSE-R2.md`. No Bash, MCP,
web, other agents, credentials/settings, Git mutation or unrelated exploration.
Report material defects in these corrections only, otherwise NO MATERIAL FINDINGS.

R1 found only that the rubric did not define critical cases. The rubric now
explicitly makes all cases and turns critical. Codex independently verified R1;
no other material host/policy finding was reported. Do not reopen the accepted
selective design: direct questions get answers, advice gets dialogue, mixed
gets both, and recommendations adapt to reactions. The host checks declared
strategy, not semantic intent; advisory sends remain explicitly human approved.

Corrections needing final verification:
1. `src/autonomy-policy.ts`: permitsSalesAutoApproval now reads only the first
   metadata paragraph before the draft marker; quoted fields under THEIR ASK
   cannot grant automatic eligibility. Existing direct headers still work.
2. `src/sales-consultation-approval.test.ts`: actual in-memory tick tests for
   new/persisted holds, quoted-header rejection and manual-advice trust. Focused
   host/context suites pass; no new failure against known baseline.
3. `groups/sales/CONSULTATIVE-DIALOGUE.md`: evidence-led recommendations must
   invite a fit reaction, avoid unsupported program segmentation, and
   distinguish training completion from credential issuance. The latter was
   found in a generated continuation and corrected; affected three-turn
   conversation was regenerated and independently inspected.
4. `evals/sales/consultation-rubric.md`: all-case release gate is explicit.
5. `docs/reports/NC-20260907-002-EVALUATION.md`: Codex's per-turn observations
   and explicit proof limits. Full JSON generation is larger and is not needed
   for this correction review; do not load it or request broad fresh evaluation.

The evaluation is synthetic and not a claim of natural customer outcomes. The
current native-card harness changes only transport, preserves the complete
review/audit card, and reconstructs actual earlier generated email in a fresh
process each turn. One malformed JSON transport was repaired by accepting the
native card text unchanged; generation expectations were not weakened.

Another unrelated product-identity release landed at 138e43ab during this work.
No Sales/autonomy files overlap. Before deployment Codex will preserve it in
the final lineage and rerun checks. Do not review that other task.
