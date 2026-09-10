# NC-20260909-004 load-bearing correction review R2

Review only whether the two R1B findings are materially closed. Do not reopen
other scope or report style/future enhancements.

Read only:

- `docs/reports/NC-20260909-004-CLAUDE-REVIEW-RESPONSE-R1B.md`
- `src/student-enrollment-production.ts:690-745`
- `src/stripe-payment-host.ts:500-670`
- `src/student-enrollment-provider-drivers.ts:190-290`
- matching new tests in `src/stripe-payment-host.test.ts` and
  `src/student-enrollment-provider-drivers.test.ts` only if needed.

Correction 1: the facade now returns a distinct `writer:'uncertain'` result if
the exact replay after lost COMMIT acknowledgement fails or if committed
readback cannot construct its projection subject. The shared host additionally
catches any escaping route error. Both cases force `--accounting-only`, never
legacy registration, never provider delivery, and finalize the existing
Contador lease as durable `needs_review` / `enrollment_admission_uncertain`
after accounting. The new host test makes `route()` throw and proves accounting-
only plus terminal needs-review finalization.

Correction 2: after an accepted roster append returns its row, the driver
persists a second `prepared` checkpoint containing the row before marking the
effect applied. If the response itself was lost and the prepared checkpoint
still has no row, rollback re-resolves the unique email/projection-key row,
persists the recovered locator, verifies the exact postimage, and only then
clears A:M. The new test covers both crash windows.

Focused correction plus foundation coverage is 134/134 and typecheck passes.
No external effect ran.

Write only
`docs/reports/NC-20260909-004-CLAUDE-CORRECTION-RESPONSE-R2.md`.
Report a material remaining defect with exact evidence or write
`NO MATERIAL FINDINGS`. End with the same verdict line.
