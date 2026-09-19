# NC-20260918-001 Claude review response

## Decision

ACCEPT

## Scope

Reviewed only the files listed in `NC-20260918-001-CLAUDE-REVIEW-REQUEST.md`:
`src/grader-file-message.ts`, `src/grader-file-message.test.ts`,
`src/grader-run-context.ts`, `src/grader-run-context.test.ts`, the
`grader-run-context.js` / grader-file import block in `src/ipc.ts`, the
Polish/Italian attestation clause in `docs/SECURITY.md`, and
`NC-20260918-001-POLISH-ATTESTATION-NECESSITY.md`. No other files, secrets, or
history were inspected.

## Material findings

1. **Closed allowlist, no generalization.**
   `GRADER_SUBMISSION_LANGUAGES = ['it', 'pl'] as const`
   (`src/grader-file-message.ts:8`) is the only surface widened. There is no
   new detection, translation, or free-form language path.

2. **Fail-closed ordering preserved.** `validatePayload` rejects any
   `submission_language` not in the allowlist
   (`src/grader-file-message.ts:104-109`) before the idempotency-key,
   filename, size, or file-integrity checks run, and before the pending
   receipt is written (`dispatchGraderFileMessage`,
   `src/grader-file-message.ts:240-256`). `de` is confirmed rejected with
   `postGraderFileMessage` never called
   (`src/grader-file-message.test.ts:84-99`).

3. **Attestation is bound into request identity, not just logged.**
   `submissionLanguage` participates in `requestHash`
   (`src/grader-file-message.ts:217`), so replaying an idempotency key with a
   different (or omitted) language attestation is rejected rather than
   silently accepted — confirmed by
   `src/grader-file-message.test.ts:124-143`.

4. **Locale/feedback-language/course-variant stay registry-owned.**
   `formatHostAssignmentContext` renders `submissionLanguage` as an
   independent, optional field (`src/grader-run-context.ts:277-285`) and
   never derives `locale`, `feedbackLanguage`, or `courseVariant` from it.
   The added Polish test asserts English feedback language and `en-US` locale
   are unchanged with `pl` attested
   (`src/grader-run-context.test.ts:266-280`), matching the existing Italian
   case immediately above it.

5. **Privileged-sender gate is untouched by this diff.** In `src/ipc.ts`, the
   grader-file branch still requires `isMain || sourceGroup === 'chief'`
   before any payload reaches `dispatchGraderFileMessage`
   (`src/ipc.ts:1122-1158`); everything else is quarantined
   (`src/ipc.ts:1127-1138`). Adding `pl` only widens the values a
   already-privileged sender may attest, not who may attest.

6. **Docs match code.** `docs/SECURITY.md`'s `submission_language=it|pl`
   clause (`docs/SECURITY.md:207-211`) and the "Italian or Polish
   attestation changes neither the course locale nor its feedback language"
   line (`docs/SECURITY.md:220-221`) accurately describe the reviewed
   behavior.

## Non-blocking scope-boundary observation

`grader-run-context.ts`'s own doc comment for
`setGraderSubmissionLanguageAttestation` states "The transport calls this
before persisting the root into NanoClaw" (`src/grader-run-context.ts:185-187`).
Within the files this review was bounded to, `src/ipc.ts` imports only
`getGraderRunBinding` and `getGraderRunContext` from `grader-run-context.js`
(`src/ipc.ts:91-94`) — neither `setGraderSubmissionLanguageAttestation` nor
`getGraderSubmissionLanguageAttestation` appears there. The reviewed packet
therefore does not itself show the call site that binds an attestation to a
Slack root "before persistence"; that wiring, if it exists, is outside the
files this review was scoped to. This predates and is unaffected by the `it`→
`it,pl` diff under review (the enum is the only code change), so it is not a
reason to reject this change, but it means the "bound in memory to the exact
grader JID and Slack root before persistence" property is not independently
verifiable from this packet alone and should be confirmed against the actual
call site before it is relied on as a proven invariant.

## Not evaluated

Per the request's output contract, the necessity checkpoint's `KEEP` /
`DEFER` / `REMOVE` / `OWNER` question is a separate decision from this
security-boundary review and is not answered here.
