# NC-20260903-001 narrow bounded review R1B

The prior R1 was interrupted after oversized full-file/test rereads and wrote
no verdict. This is a fresh, narrower review. Do not resume or reopen R1.

## Decision

Find only material defects in the retry/terminal-state correction: can a
transient Payment Log/Postgres/roster failure still be marked handled, fail to
retry, run concurrently, duplicate a business write, or falsely report an
unmapped/completed outcome?

## Read only these exact ranges

Use `Read` with the named offset/limit. Do not read whole files, tests, docs,
Git state, or any other path.

1. `tools/contador/process-payment.cjs`
   - offset 73, limit 225 (Sheets retry primitives)
   - offset 402, limit 90 (routing helpers and stale-catch-all cleanup)
   - offset 675, limit 85 (fulfillment result derivation)
   - offset 905, limit 210 (Product Map/roster branch)
   - offset 1190, limit 105 (summary/private result)
2. `src/stripe-payment-host.ts`
   - offset 89, limit 45 (result/retry contract)
   - offset 220, limit 105 (processor validation)
   - offset 360, limit 235 (admission/finalization/result)
3. `src/contador-payment-fulfillment-store.ts`
   - offset 280, limit 70 (receipt completeness)
   - offset 412, limit 120 (admission/retry lease)
4. `src/webhook-server.ts`
   - offset 1603, limit 100 (initial webhook handling)
5. `src/webhook-inbox-reaper.ts`
   - offset 83, limit 55 (notice isolation)
   - offset 215, limit 55 (Stripe replay/handled transition)
   - offset 325, limit 55 (five-attempt failure loop)

## Accepted facts and invariants

- Exact live base: `658b473061a3a684e837c409fa3737812fe3a8e9`.
- Existing webhook reaper claims `received`/`failed` rows under row locks,
  increments `attempts`, and dead-letters on attempt five.
- Fulfillment admission is serialized by account/payment-intent advisory lock
  and a five-minute lease. A complete replay is no-op; active lease is in-flight.
- Production data repair is complete and out of scope. No customer messaging,
  refund/accounting action, or new provider event is authorized.
- Low-level retry is GET-only. Whole-processor replay remains the idempotent
  recovery for ambiguous/non-GET failures.
- `needs_product`, `needs_student`, `needs_review`, complete, and the special
  expired-terminalized case are owned terminal outcomes, not automatic retries.
- Only these codes are automatically retried:
  `payment_log_readback_failed`, `postgres_payment_readback_failed`,
  `student_roster_readback_failed`, `processor_failed`.
- A non-student product may complete only with the exact roster receipt
  `not_applicable/student_roster_not_applicable`; both host and store validate it.
- A Plutio invoice description is held `needs_student`; payer is not participant.
- A retry-result IPC/Slack notice is presentation only and its failure must not
  reopen the already-handled business outcome.

## Forbidden

No Bash, Glob, Grep, web, MCP, tests, `.env`, credentials, runtime data,
customer material, Git, edits, commit, push, deploy, or external action. Write
only the response artifact below.

## Response

Write
`docs/reports/NC-20260903-001-CLAUDE-REVIEW-RESPONSE-R1B.md`.

Use either `NO MATERIAL FINDINGS` plus a short residual-risk note, or findings
ordered by consequence with exact file/line, failure mechanism, and smallest
safe correction. Do not restate the implementation.
