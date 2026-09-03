# NC-20260903-001 bounded implementation review R1

## Objective

Review the Gru Bookkeeper payment-to-student correction for material defects.
The implementation must ensure a transient Google Sheets/readback failure is
retried durably and can never be represented as an unmapped product or a
handled/completed business outcome.

Report only material findings: defects that can lose, duplicate, misroute, or
falsely close payment/student work; unsafe retry/cleanup behavior; broken
authority boundaries; or missing tests for those risks. Give exact file and
line evidence. Do not restate the task or produce a broad backlog.

## Authority and accepted facts

1. Current mechanics and tests outrank historical docs.
2. `groups/contador/CLAUDE.md` is the Contador behavior boundary.
3. `docs/CONTADOR-CLOSED-LOOPS.md` defines payment fulfillment versus Bizmgr
   accounting authority.
4. Exact live base at investigation was commit
   `658b473061a3a684e837c409fa3737812fe3a8e9`, Node 22.23.2.
5. The content-minimized production audit is accepted factual evidence in
   `docs/reports/NC-20260903-001-GRU-BOOKKEEPER-MONTH-AUDIT.md`.
6. Production repair already occurred under owner authority: two explicit
   Product Map aliases, ten exact host-owned replays, and eight stale catch-all
   clears after destination readback. Do not propose reversing or repeating it.
7. Refund/accounting/QuickBooks, customer communication, provider event
   manufacture, payer/student guessing, and historical work outside the audit
   window are non-objectives.

## Allowed read artifacts

- this request
- `tools/contador/process-payment.cjs`
- `src/stripe-payment-host.ts`
- `src/contador-payment-fulfillment-store.ts`
- `src/webhook-server.ts`
- `src/webhook-inbox-reaper.ts`
- `groups/contador/CLAUDE.md`
- `docs/reports/NC-20260903-001-GRU-BOOKKEEPER-MONTH-AUDIT.md`

The corresponding changed tests have already been executed; their results are
below. Do not read other repository paths unless one exact material claim
cannot be resolved from the allowed packet, and then name the needed path in
the response rather than opening it.

## Forbidden material and actions

Do not inspect `.env*`, credentials, auth/session stores, customer records,
runtime databases, Slack history, provider state, raw webhooks, logs, unrelated
dirty files, or Claude settings. Do not use Bash, web, MCP, or external APIs.
Do not edit implementation or documentation. Write only the response artifact
named below. Do not commit, push, deploy, send, publish, or perform a business
mutation.

## Implemented contract to challenge

- One transient Sheets GET retry for timeouts, 408, 429, 5xx, connection reset,
  broken pipe, DNS retry, or socket hangup. POST/PUT/clear calls are not retried
  at the HTTP-call layer.
- Processor-level Payment Log/Postgres/roster readback failures and process
  failures return `write_failed` with an explicit error code.
- Only retryable `write_failed` codes leave the original webhook `failed`; the
  existing five-attempt webhook reaper reruns the idempotent processor. Identity,
  product, review, completed, and terminalized-expiry states are not blindly
  retried.
- Reaper completion binds the exact case/version before posting a presentation
  notice. Notice-write failure is caught and cannot reopen the handled payment.
- A failed Product Map read renders `not classified`, never `unmapped`.
- A now-mapped replay clears an exact Sales catch-all row only after all roster
  targets read back. Cleanup failure makes the case retryable.
- The Product Map `(not a student)` sentinel completes with an exact
  `student_roster:not_applicable` receipt. Both processor validation and the
  durable store accept only that exact exception.
- Program-tab detection no longer depends on the removed `" Roster"` suffix;
  exam-routing reads fail closed into durable retry rather than silently routing
  to Prep Exam.
- Plutio invoice descriptions become `needs_student` and never enroll the
  payer/company automatically.
- Contador manual follow-ups cannot claim a raw direct-script rerun closed the
  host-owned case.

## Verification already run

- `node --check tools/contador/process-payment.cjs`: pass.
- Focused processor/host/webhook/reaper: 135/135 before the final store/notice
  corrections; rerun is required after review.
- Typecheck: pass before the final store/notice corrections.
- Root TypeScript format: pass before the final store/notice corrections.
- Full root: 3,412 pass / 32 skip / two failures. Both failures are exact live
  base failures: CNPC wrapper-literal expectation and date-stale Trafft fixture.
- Documentation continuity, capability check, build, and diff check: pass
  before the final store/notice corrections.

## Review questions

1. Can any transient failure still mark the webhook handled or leave no future
   retry?
2. Can retry race with the original run, duplicate Sheet rows, or overwrite a
   richer/confirmed outcome?
3. Can a false unmapped classification or a stale Sales row survive a verified
   replay?
4. Do non-student and Plutio-invoice paths remain truthful and compatible with
   both processor and durable-store validation?
5. Can a Slack/IPC presentation failure change business state after completion?
6. Did restoring the tab-rename/non-student controls create a regression at the
   exam or payer/student boundary?

## Response

Write only
`docs/reports/NC-20260903-001-CLAUDE-REVIEW-RESPONSE-R1.md`.

Use either:

- `NO MATERIAL FINDINGS`, followed by any non-blocking residual risk; or
- findings ordered by consequence, each with exact file/line evidence, impact,
  and the smallest safe correction.
