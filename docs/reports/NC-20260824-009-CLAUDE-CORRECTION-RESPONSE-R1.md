# NC-20260824-009 lifecycle relay correction review R1 — response

## Scope reviewed

Read only the eight allowed artifacts: this review's request, the patch at
`/private/tmp/nc009-lifecycle-correction-review.patch`, and the five in-repo
files it touches (`setup/n8n/student-lifecycle-community-shadow-code.txt`,
`setup/n8n/student-lifecycle-community-shadow-workflow.json`,
`src/student-lifecycle.ts`, `src/student-lifecycle-shadow-n8n-contract.test.ts`,
`src/student-lifecycle.test.ts`, `scripts/build-release.mjs`). No `.env`,
credentials, databases, execution payloads, or unrelated files were read; no
Bash, web, MCP, or broad search was used; no implementation file was edited.

## Verification performed

- Confirmed the `jsCode` string embedded in
  `setup/n8n/student-lifecycle-community-shadow-workflow.json` is byte-identical
  to `setup/n8n/student-lifecycle-community-shadow-code.txt` (also enforced by
  `student-lifecycle-shadow-n8n-contract.test.ts:94`, satisfying the
  human-readable-source/embedded-bytes binding invariant).
- Traced the four inference predicates in the code node (`id`+`email` →
  `USER_JOIN`; `id` alone → `USER_UPDATE`; `userID`+`groupID` → `GROUP_JOIN`;
  `userID`+`courseID` → `COURSE_COMPLETED`) against every pairwise field
  overlap. The five relevant keys (`id`, `email`, `userID`, `groupID`,
  `courseID`) partition cleanly; any payload matching zero or more than one
  shape falls through to `unsupported_heartbeat_action`, and an explicit
  `action` that disagrees with the inferred single shape falls through to
  `heartbeat_action_payload_mismatch`. Both failure paths fail closed (no
  envelope emitted).
- Confirmed `data` forwarded to the host is still built strictly from
  `allowedFields[action]`, so fields outside the four minimal shapes (e.g. an
  incidental `event` or other passthrough key) are never forwarded regardless
  of inference path.
- Confirmed the two `requiredString` calls removed from
  `src/student-lifecycle.ts` (`data.name` under `USER_JOIN`, `data.courseName`
  under `COURSE_COMPLETED`) have no other reference in the file — `eventBase`,
  `sourceKey`, and the forbidden-content scan in
  `parsePreparedCommunityLifecycleEnvelope` do not depend on either field — and
  that `prepareCommunityLifecycleEnvelope` remains hard-gated to
  `workspace === 'community'`, so the relaxation cannot reach Circle or any
  other lifecycle consumer.
- Confirmed UUID/email format validation, identity fingerprinting,
  `source_event_key` idempotency, HMAC signing (timestamp + `.` + raw body),
  the 65536-byte size ceiling, `retryOnFail`/`maxTries: 5`/`waitBetweenTries:
  5000`, `active: false`, and `saveDataErrorExecution`/`saveDataSuccessExecution:
  'none'` are all unchanged by the diff.
- Confirmed `scripts/build-release.mjs` adds only
  `setup/n8n/student-lifecycle-community-shadow-code.txt` to the release
  bundle's tracked-file list, alongside the pre-existing workflow JSON entry;
  no other packaging, activation, or deployment behavior changed.
- Confirmed the new/changed tests exercise real minimal-shape payloads with no
  action marker for all four actions, an ambiguous-shape payload, and an
  explicit-action/shape-mismatch payload, plus two new host-level tests
  accepting the minimized `USER_JOIN`/`COURSE_COMPLETED` fields — matching the
  accepted incident facts and protected invariants.

## Findings

NO MATERIAL FINDINGS
