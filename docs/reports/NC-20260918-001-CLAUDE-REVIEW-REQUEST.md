# NC-20260918-001 bounded trust-boundary review

## Decision requested

Review only whether adding Polish (`pl`) to the existing privileged, exact-root
`submission_language` allowlist preserves the established fail-closed security
and grading contract. Return `ACCEPT` or `CHANGES_REQUIRED`, followed by only
material findings with exact file/line references.

## Intended boundary

- Existing main/chief-only `slack_file_message` requests may attest `it`; this
  change allows `pl` through the same field and path.
- The attestation remains part of request identity and is bound in memory to the
  exact grader JID and Slack root before persistence.
- Course variant, `en-US` locale, and English feedback language remain
  registry-owned.
- Omission is unchanged; unsupported values such as `de` must fail before any
  staging or delivery.
- No automatic language detection, translation-primary grading, new route,
  durable state, worker, or certificate behavior is authorized.

## Files to inspect

- `src/grader-file-message.ts`
- `src/grader-file-message.test.ts`
- `src/grader-run-context.ts`
- `src/grader-run-context.test.ts`
- `src/ipc.ts` (only the existing exact-root registration call sites needed to
  verify the boundary)
- `docs/SECURITY.md` (only the Polish attestation section)
- `docs/reports/NC-20260918-001-POLISH-ATTESTATION-NECESSITY.md`

## Verification already completed

- Focused: 4 files / 51 tests passed.
- TypeScript typecheck passed.
- Documentation continuity and capability checks passed.
- Shared toolbox adapter tests prove `pl` accepted, omission unchanged, and
  `de` rejected before external action.
- Full suite: 4,433 passed, 32 skipped, 3 failures in unrelated pre-existing
  Academy Capacity, CNPC prompt, and relationship-context checks.

## Output contract

Write the review to
`docs/reports/NC-20260918-001-CLAUDE-REVIEW-RESPONSE.md`. Do not edit source or
any other file. Do not inspect secrets, credentials, auth stores, raw production
payloads, unrelated logs, or unrelated repository history.
