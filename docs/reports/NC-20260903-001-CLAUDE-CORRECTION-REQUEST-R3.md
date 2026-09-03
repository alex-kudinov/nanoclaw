# NC-20260903-001 — Final correction review R3

The owner approved this third bounded review and deployment. Review only the
two R2 findings and report material issues.

## R2 disposition

1. Packet incompleteness: the previously omitted load-bearing policy,
   run-context, reaper, and tests are now explicitly included below.
2. Fail-open binding: `src/ipc.ts` now runs the classification binding check
   for every `classify_label_write`, not only when `data.run_id` is truthy.
   Missing, expired, mismatched, or wrong-thread proof is quarantined. The
   static contract test rejects the former `&& data.run_id` form.
3. A later independent correction separated routing from `auto_archive`:
   every rule/LLM classification reaches the canonical disposition policy;
   archive metadata controls inbox cleanup only.

## Read boundary

Read only:

- `src/classification-policy.ts`
- `src/classification-policy.test.ts`
- `src/mailman-run-context.ts`
- `src/mailman-run-context.test.ts`
- `src/gmail-classification-reaper.ts`
- `src/gmail-classification-reaper.test.ts`
- `src/mailman-classification-contract.test.ts`
- `src/classify-ipc-handlers.ts` only to verify the
  `mailman-host-fallback-v1`, `routed_at IS NULL`, and enabled-taxonomy guards

Accepted evidence: affected post-correction suites pass 119/119; prior root
full suite passed 3,407 with only the two exact unchanged base failures;
email-critical passed 750/750; runner passed 45/45. No production mutation or
customer send has occurred.

Write only
`docs/reports/NC-20260903-001-CLAUDE-CORRECTION-RESPONSE-R3.md`.
No Bash, web, MCP, credentials, runtime data, edits, tests, or deployment.
End with `GO`, `GO WITH REQUIRED CHANGES`, or `STOP`.
